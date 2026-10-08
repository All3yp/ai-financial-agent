import 'server-only';

import { and, asc, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { db } from './queries';
import { agentRun, agentRunStep } from './schema';
import type {
  AgentWorkflowType,
  AgentRunRecord,
  AgentRunStepRecord,
  AgentRunStore,
  CreateAgentRunResult,
} from '@/lib/agents/run-store';

const RUN_RETENTION_DAYS = 90;
const MAX_ACTIVE_RUNS_PER_USER = 3;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function toRunRecord(row: typeof agentRun.$inferSelect): AgentRunRecord {
  return {
    id: row.id,
    workflowType: row.workflowType as AgentWorkflowType,
    status: row.status as AgentRunRecord['status'],
    input: row.input as AgentRunRecord['input'],
    result: row.result,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

function toStepRecord(
  row: typeof agentRunStep.$inferSelect,
): AgentRunStepRecord {
  return {
    name: row.name,
    status: row.status as AgentRunStepRecord['status'],
    result: row.result,
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export const agentRunStore: AgentRunStore = {
  async createRun(
    userId,
    workflowType,
    input,
    idempotencyKey,
  ): Promise<CreateAgentRunResult> {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      await tx
        .delete(agentRun)
        .where(and(eq(agentRun.userId, userId), lte(agentRun.expiresAt, now)));
      const [existing] = await tx
        .select()
        .from(agentRun)
        .where(
          and(
            eq(agentRun.userId, userId),
            eq(agentRun.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) {
        if (
          existing.workflowType !== workflowType ||
          stableJson(existing.input) !== stableJson(input)
        ) {
          return { kind: 'conflict' as const };
        }
        return { kind: 'existing' as const, run: toRunRecord(existing) };
      }

      const activeRuns = await tx
        .select({ id: agentRun.id })
        .from(agentRun)
        .where(
          and(
            eq(agentRun.userId, userId),
            inArray(agentRun.status, ['pending', 'running']),
            gt(agentRun.expiresAt, now),
          ),
        )
        .limit(MAX_ACTIVE_RUNS_PER_USER);
      if (activeRuns.length >= MAX_ACTIVE_RUNS_PER_USER) {
        return { kind: 'limit' as const };
      }

      const [row] = await tx
        .insert(agentRun)
        .values({ userId, workflowType, idempotencyKey, input, expiresAt })
        .returning();
      return { kind: 'created' as const, run: toRunRecord(row) };
    });
  },

  async markRunRunning(runId) {
    const now = new Date();
    await db
      .update(agentRun)
      .set({ status: 'running', startedAt: now, error: null })
      .where(eq(agentRun.id, runId));
  },

  async markStepRunning(runId, name) {
    const now = new Date();
    await db
      .insert(agentRunStep)
      .values({ runId, name, status: 'running', startedAt: now })
      .onConflictDoUpdate({
        target: [agentRunStep.runId, agentRunStep.name],
        set: {
          status: 'running',
          result: null,
          error: null,
          startedAt: now,
          completedAt: null,
        },
      });
  },

  async completeStep(runId, name, result) {
    const now = new Date();
    await db
      .update(agentRunStep)
      .set({ status: 'completed', result, error: null, completedAt: now })
      .where(and(eq(agentRunStep.runId, runId), eq(agentRunStep.name, name)));
  },

  async completeRun(runId, result) {
    await db
      .update(agentRun)
      .set({
        status: 'completed',
        result,
        error: null,
        completedAt: new Date(),
      })
      .where(eq(agentRun.id, runId));
  },

  async failRun(runId, error) {
    const now = new Date();
    await db
      .update(agentRun)
      .set({ status: 'failed', error, completedAt: now })
      .where(eq(agentRun.id, runId));
    await db
      .update(agentRunStep)
      .set({ status: 'failed', error, completedAt: now })
      .where(
        and(eq(agentRunStep.runId, runId), eq(agentRunStep.status, 'running')),
      );
  },

  async listRuns(userId, limit) {
    const rows = await db
      .select()
      .from(agentRun)
      .where(
        and(eq(agentRun.userId, userId), gt(agentRun.expiresAt, new Date())),
      )
      .orderBy(desc(agentRun.createdAt), desc(agentRun.id))
      .limit(limit);
    const stepRows = rows.length
      ? await db
          .select()
          .from(agentRunStep)
          .where(
            inArray(
              agentRunStep.runId,
              rows.map(({ id }) => id),
            ),
          )
          .orderBy(asc(agentRunStep.name))
      : [];
    const grouped = new Map<string, typeof stepRows>();
    for (const step of stepRows) {
      const group = grouped.get(step.runId) ?? [];
      group.push(step);
      grouped.set(step.runId, group);
    }
    return rows.map((row) => ({
      ...toRunRecord(row),
      steps: (grouped.get(row.id) ?? []).map(toStepRecord),
    }));
  },

  async getRun(userId, runId) {
    const [row] = await db
      .select()
      .from(agentRun)
      .where(
        and(
          eq(agentRun.id, runId),
          eq(agentRun.userId, userId),
          gt(agentRun.expiresAt, new Date()),
        ),
      );
    if (!row) return null;
    const steps = await db
      .select()
      .from(agentRunStep)
      .where(eq(agentRunStep.runId, runId))
      .orderBy(asc(agentRunStep.name));
    return { ...toRunRecord(row), steps: steps.map(toStepRecord) };
  },

  async deleteExpiredRuns() {
    const deleted = await db
      .delete(agentRun)
      .where(lte(agentRun.expiresAt, new Date()))
      .returning({ id: agentRun.id });
    return deleted.length;
  },
};
