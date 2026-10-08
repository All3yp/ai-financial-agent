import { z } from 'zod';

const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9.^=-]{1,20}$/);

export const workflowRunSchemas = {
  analysis: z
    .object({
      ticker: tickerSchema,
      peers: z.array(tickerSchema).max(20).default([]),
    })
    .strict(),
  debate: z
    .object({
      ticker: tickerSchema,
      question: z.string().trim().min(1).max(2000),
    })
    .strict(),
  screening: z.object({ criteria: z.record(z.unknown()) }).strict(),
  monitoring: z
    .object({
      positions: z
        .array(
          z
            .object({
              ticker: tickerSchema,
              shares: z.number().finite().positive().optional(),
              costBasis: z.number().finite().nonnegative().optional(),
            })
            .passthrough(),
        )
        .max(100),
    })
    .strict(),
};

export const agentWorkflowTypes = [
  'analysis',
  'debate',
  'screening',
  'monitoring',
] as const;
export type AgentWorkflowType = (typeof agentWorkflowTypes)[number];

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export type AgentRunRecord = {
  id: string;
  workflowType: AgentWorkflowType;
  status: AgentRunStatus;
  input: Record<string, unknown>;
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

export type CreateAgentRunResult =
  | { kind: 'created'; run: AgentRunRecord }
  | { kind: 'existing'; run: AgentRunRecord }
  | { kind: 'conflict' }
  | { kind: 'limit' };

export interface AgentRunStore {
  createRun(
    userId: string,
    workflowType: AgentWorkflowType,
    input: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<CreateAgentRunResult>;
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
