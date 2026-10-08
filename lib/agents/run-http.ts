import {
  workflowRunSchemas,
  type AgentWorkflowType,
  type CreateAgentRunResult,
  sanitizeRunError,
  type AgentRunStore,
} from './run-store';

const MAX_RUN_INPUT_BYTES = 32 * 1024;
const MAX_RUN_REQUEST_BYTES = 64 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'no-store' };

export async function readAgentRunRequest(
  request: Request,
): Promise<{ value: unknown } | { response: Response }> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
    'application/json'
  ) {
    return {
      response: Response.json(
        { error: 'Expected application/json.' },
        { status: 400, headers },
      ),
    };
  }
  if (!request.body) {
    return {
      response: Response.json(
        { error: 'Invalid JSON.' },
        { status: 400, headers },
      ),
    };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunks: string[] = [];
  let size = 0;
  let text: string;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RUN_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return {
          response: Response.json(
            { error: 'Workflow request exceeds 64 KiB.' },
            { status: 413, headers },
          ),
        };
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    text = chunks.join('');
  } catch {
    await reader.cancel().catch(() => undefined);
    return {
      response: Response.json(
        { error: 'Invalid workflow request body.' },
        { status: 400, headers },
      ),
    };
  } finally {
    reader.releaseLock();
  }

  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return {
      response: Response.json(
        { error: 'Invalid JSON.' },
        { status: 400, headers },
      ),
    };
  }
}

export async function submitAgentRun(
  userId: string,
  workflowType: AgentWorkflowType,
  input: unknown,
  idempotencyKey: string,
  store: AgentRunStore,
  enqueue: (
    workflowType: AgentWorkflowType,
    input: Record<string, unknown>,
    userId: string,
    runId: string,
  ) => Promise<void>,
): Promise<Response> {
  if (!UUID_PATTERN.test(idempotencyKey)) {
    return Response.json(
      { error: 'A valid Idempotency-Key UUID is required.' },
      { status: 400, headers },
    );
  }
  const parsed = workflowRunSchemas[workflowType].safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: `Invalid ${workflowType} input.` },
      { status: 400, headers },
    );
  }
  const normalizedInput = parsed.data as Record<string, unknown>;
  if (
    new TextEncoder().encode(JSON.stringify(normalizedInput)).byteLength >
    MAX_RUN_INPUT_BYTES
  ) {
    return Response.json(
      { error: 'Workflow input exceeds 32 KiB.' },
      { status: 413, headers },
    );
  }

  let creation: CreateAgentRunResult;
  try {
    creation = await store.createRun(
      userId,
      workflowType,
      normalizedInput,
      idempotencyKey,
    );
  } catch {
    return Response.json(
      { error: 'Unable to create workflow run.' },
      { status: 503, headers },
    );
  }
  if (creation.kind === 'limit') {
    return Response.json(
      { error: 'Too many active workflow runs.' },
      { status: 429, headers: { ...headers, 'Retry-After': '60' } },
    );
  }
  if (creation.kind === 'conflict') {
    return Response.json(
      { error: 'Idempotency-Key was already used for a different request.' },
      { status: 409, headers },
    );
  }
  const run = creation.run;
  if (creation.kind === 'existing') {
    return Response.json(
      { success: true, runId: run.id, status: run.status, replayed: true },
      { status: 202, headers },
    );
  }

  try {
    await enqueue(workflowType, normalizedInput, userId, run.id);
  } catch (error) {
    try {
      await store.failRun(run.id, sanitizeRunError(error));
    } catch {
      return Response.json(
        { error: 'Unable to queue workflow run.', runId: run.id },
        { status: 503, headers },
      );
    }
    return Response.json(
      { error: 'Unable to queue workflow run.', runId: run.id },
      { status: 503, headers },
    );
  }

  return Response.json(
    { success: true, runId: run.id, status: run.status },
    { status: 202, headers },
  );
}

export async function agentRunListResponse(
  userId: string,
  store: AgentRunStore,
  limit = 50,
): Promise<Response> {
  const safeLimit =
    Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : null;
  if (safeLimit === null)
    return Response.json(
      { error: 'Invalid run limit.' },
      { status: 400, headers },
    );
  try {
    return Response.json(
      { runs: await store.listRuns(userId, safeLimit) },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'Agent run history is unavailable.' },
      { status: 503, headers },
    );
  }
}

export async function agentRunItemResponse(
  userId: string,
  runId: string,
  store: AgentRunStore,
): Promise<Response> {
  if (!UUID_PATTERN.test(runId))
    return Response.json({ error: 'Run not found.' }, { status: 404, headers });
  try {
    const run = await store.getRun(userId, runId);
    return run
      ? Response.json(run, { headers })
      : Response.json({ error: 'Run not found.' }, { status: 404, headers });
  } catch {
    return Response.json(
      { error: 'Agent run history is unavailable.' },
      { status: 503, headers },
    );
  }
}
