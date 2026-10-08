import { auth } from '@/app/(auth)/auth';
import { createQuantitativeTeamResponse } from '@/lib/agents/quantitative-http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const session = await auth();
    return await createQuantitativeTeamResponse(request, Boolean(session?.user?.id));
  } catch {
    return Response.json({ error: 'Quantitative service unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}