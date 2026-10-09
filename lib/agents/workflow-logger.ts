// Workflow Progress Logger - Provides detailed observability into workflow execution
// Logs step-by-step progress, timing, and results for debugging and monitoring

// Simple console logger with structured output
// In production, this could be replaced with a proper logging service

export interface WorkflowLogEntry {
  runId: string;
  stepName: string;
  phase: 'start' | 'progress' | 'complete' | 'error';
  timestamp: string;
  durationMs?: number;
  message: string;
  details?: Record<string, unknown>;
}

const logBuffer: WorkflowLogEntry[] = [];
const MAX_BUFFER_SIZE = 1000;

export function logWorkflowStep(
  runId: string,
  stepName: string,
  phase: WorkflowLogEntry['phase'],
  message: string,
  details?: Record<string, unknown>,
  durationMs?: number
) {
  const entry: WorkflowLogEntry = {
    runId,
    stepName,
    phase,
    timestamp: new Date().toISOString(),
    message,
    details,
    durationMs,
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }

  // Structured console output for observability
  const prefix = `[WF:${runId.slice(0, 8)}] [${stepName}]`;
  const phaseIcon = phase === 'start' ? '▶' : phase === 'progress' ? '⟳' : phase === 'complete' ? '✓' : '✗';
  const duration = durationMs ? ` (${durationMs}ms)` : '';

  console.log(`${prefix} ${phaseIcon} ${message}${duration}`, details ? JSON.stringify(details) : '');

  return entry;
}

export function createWorkflowLogger(runId: string) {
  return {
    start: (stepName: string, message: string, details?: Record<string, unknown>) =>
      logWorkflowStep(runId, stepName, 'start', message, details),

    progress: (stepName: string, message: string, details?: Record<string, unknown>) =>
      logWorkflowStep(runId, stepName, 'progress', message, details),

    complete: (stepName: string, message: string, details?: Record<string, unknown>, durationMs?: number) =>
      logWorkflowStep(runId, stepName, 'complete', message, details, durationMs),

    error: (stepName: string, message: string, details?: Record<string, unknown>, durationMs?: number) =>
      logWorkflowStep(runId, stepName, 'error', message, details, durationMs),

    getLogs: (filterRunId?: string) =>
      filterRunId ? logBuffer.filter(l => l.runId === filterRunId) : [...logBuffer],

    clear: () => { logBuffer.length = 0; },
  };
}

// Helper to wrap step execution with automatic logging
// Note: We don't use this in workflows.ts directly; we use the inline loggedStep there
// This is kept for potential reuse elsewhere
export async function loggedStep<T>(
  runId: string,
  stepName: string,
  operation: () => Promise<T>,
  stepRunner: (name: string, operation: () => Promise<any>) => Promise<any>
): Promise<T> {
  const logger = createWorkflowLogger(runId);
  const startTime = Date.now();

  logger.start(stepName, `Starting ${stepName}`);

  // Mark step as running in DB
  await stepRunner(`persist-${stepName}-start`, async () => {
    const { agentRunStore } = await import('@/lib/db/agent-runs');
    return agentRunStore.markStepRunning(runId, stepName);
  });

  try {
    // Execute the actual operation with Inngest step
    const result = await stepRunner(stepName, async () => {
      logger.progress(stepName, `Executing ${stepName}...`);
      return await operation();
    });

    const durationMs = Date.now() - startTime;
    logger.complete(stepName, `Completed ${stepName}`, { resultPreview: previewResult(result) }, durationMs);

    // Persist result
    await stepRunner(`persist-${stepName}-result`, async () => {
      const { agentRunStore } = await import('@/lib/db/agent-runs');
      return agentRunStore.completeStep(runId, stepName, result);
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(stepName, `Failed ${stepName}: ${errorMsg}`, { error: errorMsg }, durationMs);

    // Persist failure
    await stepRunner(`persist-${stepName}-failure`, async () => {
      const { agentRunStore } = await import('@/lib/db/agent-runs');
      const { sanitizeRunError } = await import('./run-store');
      return agentRunStore.failRun(runId, sanitizeRunError(error));
    });

    throw error;
  }
}

function previewResult(result: unknown): string {
  if (!result) return 'null';
  if (typeof result === 'string') return result.slice(0, 100);
  if (Array.isArray(result)) return `Array[${result.length}]`;
  if (typeof result === 'object') {
    const keys = Object.keys(result);
    return `Object{${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}}`;
  }
  return String(result).slice(0, 100);
}

// Export buffer for debugging (e.g., via admin API)
export function getWorkflowLogs(runId?: string): WorkflowLogEntry[] {
  return runId ? logBuffer.filter(l => l.runId === runId) : [...logBuffer];
}