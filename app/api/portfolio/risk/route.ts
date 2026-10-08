import { auth } from '@/app/(auth)/auth';
import { createPortfolioRiskResponse } from '@/lib/portfolio/risk-http';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await auth();
    return await createPortfolioRiskResponse(request, Boolean(session?.user?.id));
  } catch {
    return Response.json(
      { error: 'Portfolio service unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}