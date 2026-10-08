import { auth } from '@/app/(auth)/auth';
import { agentRunStore } from '@/lib/db/agent-runs';
import { agentRunItemResponse } from '@/lib/agents/run-http';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId)
      return Response.json(
        { error: 'Unauthorized.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    const { id } = await context.params;
    return await agentRunItemResponse(userId, id, agentRunStore);
  } catch {
    return Response.json(
      { error: 'Agent run history is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
