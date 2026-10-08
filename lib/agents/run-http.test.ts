import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agentRunItemResponse,
  agentRunListResponse,
  submitScreeningRun,
} from './run-http';
import type {
  AgentRunDetail,
  AgentRunRecord,
  AgentRunStore,
} from './run-store';

class MemoryRunStore implements AgentRunStore {
  readonly runs = new Map<string, { owner: string; record: AgentRunDetail }>();
  readonly deleted: string[] = [];

  async createScreeningRun(userId: string, criteria: Record<string, unknown>) {
    const now = new Date().toISOString();
    const record: AgentRunDetail = {
      id: `00000000-0000-4000-8000-${String(this.runs.size + 1).padStart(12, '0')}`,
      workflowType: 'screening',
      status: 'pending',
      input: { criteria: structuredClone(criteria) },
      result: null,
      error: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
      steps: [],
    };
    this.runs.set(record.id, { owner: userId, record });
    return record;
  }

  async markRunRunning(runId: string) {
    const entry = this.runs.get(runId);
    if (entry) entry.record.status = 'running';
  }

  async markStepRunning(runId: string, name: string) {
    const entry = this.runs.get(runId);
    if (entry)
      entry.record.steps.push({
        name,
        status: 'running',
        result: null,
        error: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
      });
  }

  async completeStep(runId: string, name: string, result: unknown) {
    const entry = this.runs.get(runId);
    const step = entry?.record.steps.find((item) => item.name === name);
    if (step)
      Object.assign(step, {
        status: 'completed',
        result,
        completedAt: new Date().toISOString(),
      });
  }

  async completeRun(runId: string, result: unknown) {
    const entry = this.runs.get(runId);
    if (entry)
      Object.assign(entry.record, {
        status: 'completed',
        result,
        completedAt: new Date().toISOString(),
      });
  }

  async failRun(runId: string, error: string) {
    const entry = this.runs.get(runId);
    if (entry)
      Object.assign(entry.record, {
        status: 'failed',
        error,
        completedAt: new Date().toISOString(),
      });
  }

  async listRuns(userId: string, limit: number): Promise<AgentRunRecord[]> {
    return [...this.runs.values()]
      .filter(({ owner }) => owner === userId)
      .slice(0, limit)
      .map(({ record }) => record);
  }

  async getRun(userId: string, runId: string) {
    const entry = this.runs.get(runId);
    return entry?.owner === userId ? structuredClone(entry.record) : null;
  }

  async deleteExpiredRuns() {
    return this.deleted.length;
  }
}

test('screening submission creates durable pending run and only enqueues', async () => {
  const store = new MemoryRunStore();
  const queued: Array<{
    criteria: Record<string, unknown>;
    userId: string;
    runId: string;
  }> = [];
  const response = await submitScreeningRun(
    'alice',
    { criteria: { roe: { min: 15 } } },
    store,
    async (criteria, userId, runId) => {
      queued.push({ criteria, userId, runId });
    },
  );
  const body = await response.json();
  assert.equal(response.status, 202);
  assert.equal(body.status, 'pending');
  assert.equal(queued.length, 1);
  assert.equal(queued[0].runId, body.runId);
  assert.equal((await store.getRun('alice', body.runId))?.status, 'pending');
});

test('screening submission rejects malformed or oversized criteria without enqueueing', async () => {
  const store = new MemoryRunStore();
  let enqueueCount = 0;
  const enqueue = async () => {
    enqueueCount += 1;
  };
  assert.equal(
    (await submitScreeningRun('alice', [], store, enqueue)).status,
    400,
  );
  assert.equal(
    (
      await submitScreeningRun(
        'alice',
        { criteria: { raw: 'x'.repeat(33 * 1024) } },
        store,
        enqueue,
      )
    ).status,
    413,
  );
  assert.equal(enqueueCount, 0);
  assert.equal(store.runs.size, 0);
});

test('queue errors are sanitized and durable run is marked failed', async () => {
  const store = new MemoryRunStore();
  const response = await submitScreeningRun(
    'alice',
    { criteria: { roe: { min: 15 } } },
    store,
    async () => {
      throw new Error('private\nprovider api_key=secret-value');
    },
  );
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, 'Unable to queue screening run.');
  assert.ok(body.runId);
  const persisted = await store.getRun('alice', body.runId);
  assert.equal(persisted?.status, 'failed');
  assert.equal(persisted?.error, 'private provider api_key=[redacted]');
});

test('persisted errors redact credential-shaped values and are bounded', async () => {
  const { sanitizeRunError } = await import('./run-store');
  assert.equal(
    sanitizeRunError(
      new Error('Authorization=Bearer secret-value api_key=abc123'),
    ),
    'Authorization=[redacted] api_key=[redacted]',
  );
  assert.equal(sanitizeRunError(new Error('x'.repeat(600))).length, 500);
});

test('run history and detail are owner-filtered and expose lifecycle step data', async () => {
  const store = new MemoryRunStore();
  const created = await store.createScreeningRun('alice', {
    peRatio: { max: 20 },
  });
  await store.markRunRunning(created.id);
  await store.markStepRunning(created.id, 'screen');
  await store.completeStep(created.id, 'screen', { passed: 2 });
  await store.completeRun(created.id, { passed: 2 });

  const ownList = await agentRunListResponse('alice', store);
  assert.equal(ownList.status, 200);
  const ownRuns = await ownList.json();
  assert.equal(ownRuns.runs[0].steps[0].status, 'completed');
  const foreignList = await agentRunListResponse('bob', store);
  assert.equal((await foreignList.json()).runs.length, 0);
  assert.equal(
    (await agentRunItemResponse('bob', created.id, store)).status,
    404,
  );
  const owned = await agentRunItemResponse('alice', created.id, store);
  assert.equal(owned.status, 200);
  const detail = await owned.json();
  assert.equal(detail.status, 'completed');
  assert.equal(detail.steps[0].result.passed, 2);
  assert.equal(
    (await agentRunItemResponse('alice', 'bad-id', store)).status,
    404,
  );
});
