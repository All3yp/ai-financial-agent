import { auth } from '@/app/(auth)/auth';
import { portfolioRepository } from '@/lib/db/portfolio';
import { portfolioSnapshotResponse } from '@/lib/portfolio/persistence-http';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return handle(request, context);
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return handle(request, context);
}

async function handle(
  request: Request,
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
    return await portfolioSnapshotResponse(
      request,
      userId,
      id,
      portfolioRepository,
    );
  } catch {
    return Response.json(
      { error: 'Portfolio snapshot service unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
