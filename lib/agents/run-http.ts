import {
  screeningRunInputSchema,
  sanitizeRunError,
  type AgentRunRecord,
  type AgentRunStore,
} from './run-store';

const MAX_CRITERIA_BYTES = 32 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'no-store' };

export async function submitScreeningRun(
  userId: string,
  input: unknown,
  store: AgentRunStore,
  enqueue: (
    criteria: Record<string, unknown>,
    userId: string,
    runId: string,
  ) => Promise<void>,
): Promise<Response> {
  const parsed = screeningRunInputSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid screening criteria.' },
      { status: 400, headers },
    );
  }
  if (
    new TextEncoder().encode(JSON.stringify(parsed.data.criteria)).byteLength >
    MAX_CRITERIA_BYTES
  ) {
    return Response.json(
      { error: 'Screening criteria exceed 32 KiB.' },
      { status: 413, headers },
    );
  }

  let run: AgentRunRecord;
  try {
    run = await store.createScreeningRun(userId, parsed.data.criteria);
  } catch {
    return Response.json(
      { error: 'Unable to create screening run.' },
      { status: 503, headers },
    );
  }

  try {
    await enqueue(parsed.data.criteria, userId, run.id);
  } catch (error) {
    try {
      await store.failRun(run.id, sanitizeRunError(error));
    } catch {
      return Response.json(
        { error: 'Unable to queue screening run.', runId: run.id },
        { status: 503, headers },
      );
    }
    return Response.json(
      { error: 'Unable to queue screening run.', runId: run.id },
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
