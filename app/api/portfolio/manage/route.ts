import { auth } from '@/app/(auth)/auth';
import { portfolioRepository } from '@/lib/db/portfolio';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return Response.json(
        { error: 'Unauthorized.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const portfolios = await portfolioRepository.listPortfolios(userId);
    return Response.json(
      {
        portfolios: portfolios.map(
          ({ id, name, currency, monitoringEnabled, holdings }) => ({
            id,
            name,
            currency,
            monitoringEnabled,
            holdings,
          }),
        ),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'Portfolio service unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
