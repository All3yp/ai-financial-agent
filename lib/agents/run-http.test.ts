import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agentRunItemResponse,
  agentRunListResponse,
  readAgentRunRequest,
  submitAgentRun,
} from './run-http';
import type {
  CreateAgentRunResult,
  AgentRunDetail,
  AgentRunRecord,
  AgentRunStore,
} from './run-store';

class MemoryRunStore implements AgentRunStore {
  readonly runs = new Map<string, { owner: string; record: AgentRunDetail }>();
  readonly deleted: string[] = [];
  private readonly keys = new Map<
    string,
    {
      workflowType: AgentRunRecord['workflowType'];
      input: Record<string, unknown>;
      runId: string;
    }
  >();

  async createRun(
    userId: string,
    workflowType: AgentRunRecord['workflowType'],
    input: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<CreateAgentRunResult> {
    const key = `${userId}:${idempotencyKey}`;
    const existing = this.keys.get(key);
    if (existing) {
      if (
        existing.workflowType !== workflowType ||
        JSON.stringify(existing.input) !== JSON.stringify(input)
      ) {
        return { kind: 'conflict' };
      }
      const stored = this.runs.get(existing.runId);
      return stored
        ? { kind: 'existing', run: stored.record }
        : { kind: 'conflict' };
    }
    const activeRuns = [...this.runs.values()].filter(
      ({ owner, record }) =>
        owner === userId && ['pending', 'running'].includes(record.status),
    );
    if (activeRuns.length >= 3) return { kind: 'limit' };

    const now = new Date().toISOString();
    const record: AgentRunDetail = {
      id: `00000000-0000-4000-8000-${String(this.runs.size + 1).padStart(12, '0')}`,
      workflowType,
      status: 'pending',
      input: structuredClone(input),
      result: null,
      error: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
      steps: [],
    };
    this.runs.set(record.id, { owner: userId, record });
    this.keys.set(key, {
      workflowType,
      input: structuredClone(input),
      runId: record.id,
    });
    return { kind: 'created', run: record };
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

function key(index: number) {
  return `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

test('trigger request parser enforces content type, JSON validity and byte bounds', async () => {
  const parsed = await readAgentRunRequest(
    new Request('http://localhost/api/agents/trigger', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"x":1}',
    }),
  );
  assert.deepEqual('value' in parsed ? parsed.value : null, { x: 1 });

  const wrongType = await readAgentRunRequest(
    new Request('http://localhost/api/agents/trigger', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    }),
  );
  assert.equal('response' in wrongType ? wrongType.response.status : 200, 400);

  const invalid = await readAgentRunRequest(
    new Request('http://localhost/api/agents/trigger', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    }),
  );
  assert.equal('response' in invalid ? invalid.response.status : 200, 400);

  const oversized = await readAgentRunRequest(
    new Request('http://localhost/api/agents/trigger', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: `{"data":"${'x'.repeat(64 * 1024)}"}`,
    }),
  );
  assert.equal('response' in oversized ? oversized.response.status : 200, 413);
});

test('screening submission creates durable pending run and only enqueues', async () => {
  const store = new MemoryRunStore();
  const queued: Array<{
    criteria: Record<string, unknown>;
    userId: string;
    runId: string;
  }> = [];
  const response = await submitAgentRun(
    'alice',
    'screening',
    { criteria: { roe: { min: 15 } } },
    key(1),
    store,
    async (_workflowType, input, userId, runId) => {
      queued.push({
        criteria: input.criteria as Record<string, unknown>,
        userId,
        runId,
      });
    },
  );
  const body = await response.json();
  assert.equal(response.status, 202);
  assert.equal(body.status, 'pending');
  assert.equal(queued.length, 1);
  assert.equal(queued[0].runId, body.runId);
  assert.equal((await store.getRun('alice', body.runId))?.status, 'pending');
});

test('analysis, debate, and monitoring also enqueue validated durable runs', async () => {
  const store = new MemoryRunStore();
  const submissions = [
    ['analysis', { ticker: 'aapl', peers: ['msft'] }],
    ['debate', { ticker: 'AAPL', question: 'Long-term investment?' }],
    [
      'monitoring',
      { positions: [{ ticker: 'AAPL', shares: 2, costBasis: 100 }] },
    ],
  ] as const;
  for (const [index, [workflowType, input]] of submissions.entries()) {
    const response = await submitAgentRun(
      'alice',
      workflowType,
      input,
      key(index + 2),
      store,
      async (type, eventInput, userId, runId) => {
        assert.equal(type, workflowType);
        assert.equal(userId, 'alice');
        assert.ok(runId);
        assert.deepEqual(
          eventInput,
          workflowType === 'analysis'
            ? { ticker: 'AAPL', peers: ['MSFT'] }
            : input,
        );
      },
    );
    assert.equal(response.status, 202);
  }
  assert.equal(store.runs.size, 3);
});

test('idempotency replays accepted runs without re-enqueueing and rejects changed payloads', async () => {
  const store = new MemoryRunStore();
  let enqueueCount = 0;
  const enqueue = async () => {
    enqueueCount += 1;
  };
  const input = { ticker: 'AAPL', peers: ['MSFT'] };
  const first = await submitAgentRun(
    'alice',
    'analysis',
    input,
    key(20),
    store,
    enqueue,
  );
  const firstBody = await first.json();
  const replay = await submitAgentRun(
    'alice',
    'analysis',
    input,
    key(20),
    store,
    enqueue,
  );
  const replayBody = await replay.json();
  assert.equal(first.status, 202);
  assert.equal(replay.status, 202);
  assert.equal(replayBody.replayed, true);
  assert.equal(replayBody.runId, firstBody.runId);
  assert.equal(enqueueCount, 1);

  const conflict = await submitAgentRun(
    'alice',
    'analysis',
    { ticker: 'GOOGL', peers: [] },
    key(20),
    store,
    enqueue,
  );
  assert.equal(conflict.status, 409);
  assert.equal(enqueueCount, 1);
});

test('run submissions require idempotency keys and cap active runs per owner', async () => {
  const store = new MemoryRunStore();
  const enqueue = async () => undefined;
  const missingKey = await submitAgentRun(
    'alice',
    'screening',
    { criteria: {} },
    '',
    store,
    enqueue,
  );
  assert.equal(missingKey.status, 400);

  for (let index = 0; index < 3; index += 1) {
    const response = await submitAgentRun(
      'alice',
      'screening',
      { criteria: { name: `screen-${index}` } },
      key(index + 30),
      store,
      enqueue,
    );
    assert.equal(response.status, 202);
  }
  const overLimit = await submitAgentRun(
    'alice',
    'screening',
    { criteria: { name: 'screen-over-limit' } },
    key(40),
    store,
    enqueue,
  );
  assert.equal(overLimit.status, 429);
  assert.equal(store.runs.size, 3);
});

test('screening submission rejects malformed or oversized criteria without enqueueing', async () => {
  const store = new MemoryRunStore();
  let enqueueCount = 0;
  const enqueue = async () => {
    enqueueCount += 1;
  };
  assert.equal(
    (await submitAgentRun('alice', 'screening', [], key(5), store, enqueue))
      .status,
    400,
  );
  assert.equal(
    (
      await submitAgentRun(
        'alice',
        'screening',
        { criteria: { raw: 'x'.repeat(33 * 1024) } },
        key(6),
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
  const response = await submitAgentRun(
    'alice',
    'screening',
    { criteria: { roe: { min: 15 } } },
    key(7),
    store,
    async () => {
      throw new Error('private\nprovider api_key=secret-value');
    },
  );
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, 'Unable to queue workflow run.');
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
  const creation = await store.createRun(
    'alice',
    'screening',
    { criteria: { peRatio: { max: 20 } } },
    key(8),
  );
  assert.equal(creation.kind, 'created');
  if (creation.kind !== 'created') throw new Error('Expected created run');
  const created = creation.run;
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
