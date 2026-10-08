import { auth } from '@/app/(auth)/auth';
import { agentRunStore } from '@/lib/db/agent-runs';
import { agentRunListResponse } from '@/lib/agents/run-http';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId)
      return Response.json(
        { error: 'Unauthorized.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    const rawLimit = new URL(request.url).searchParams.get('limit');
    const limit = rawLimit === null ? 50 : Number(rawLimit);
    return await agentRunListResponse(userId, agentRunStore, limit);
  } catch {
    return Response.json(
      { error: 'Agent run history is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
