import { auth } from '@/app/(auth)/auth';
import { portfolioRepository } from '@/lib/db/portfolio';
import { portfolioCollectionResponse } from '@/lib/portfolio/persistence-http';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

export async function PUT(request: Request): Promise<Response> {
  return handle(request);
}

async function handle(request: Request): Promise<Response> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId)
      return Response.json(
        { error: 'Unauthorized.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    return await portfolioCollectionResponse(
      request,
      userId,
      portfolioRepository,
    );
  } catch {
    return Response.json(
      { error: 'Portfolio service unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
