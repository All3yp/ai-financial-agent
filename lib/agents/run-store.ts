import { z } from 'zod';

export const screeningRunInputSchema = z
  .object({
    criteria: z.record(z.unknown()),
  })
  .strict();

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AgentRunRecord = {
  id: string;
  workflowType: 'screening';
  status: AgentRunStatus;
  input: { criteria: Record<string, unknown> };
  result: unknown | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  steps?: AgentRunStepRecord[];
};

export type AgentRunStepRecord = {
  name: string;
  status: AgentRunStatus;
  result: unknown | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type AgentRunDetail = AgentRunRecord & { steps: AgentRunStepRecord[] };

export interface AgentRunStore {
  createScreeningRun(
    userId: string,
    criteria: Record<string, unknown>,
  ): Promise<AgentRunRecord>;
  markRunRunning(runId: string): Promise<void>;
  markStepRunning(runId: string, name: string): Promise<void>;
  completeStep(runId: string, name: string, result: unknown): Promise<void>;
  completeRun(runId: string, result: unknown): Promise<void>;
  failRun(runId: string, error: string): Promise<void>;
  listRuns(userId: string, limit: number): Promise<AgentRunRecord[]>;
  getRun(userId: string, runId: string): Promise<AgentRunDetail | null>;
  deleteExpiredRuns(): Promise<number>;
}

export function sanitizeRunError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Workflow failed.';
  const sanitized = message
    .replace(
      /\bauthorization\s*[:=]\s*Bearer\s+[^\s,;]+/gi,
      'Authorization=[redacted]',
    )
    .replace(/\bauthorization\s*[:=]\s*[^\s,;]+/gi, 'Authorization=[redacted]')
    .replace(
      /\b(api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[redacted]',
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
  return sanitized || 'Workflow failed.';
}
