import { randomUUID } from 'node:crypto';
import { QuantitativeTeamOrchestrator, quantitativeTeamInputSchema } from './quantitative';
import { readBoundedBody, PortfolioReportInputError } from '../portfolio/risk-http';

export async function createQuantitativeTeamResponse(request: Request, authenticated: boolean) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!authenticated) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return Response.json({ error: 'Expected application/json' }, { status: 400, headers });
  }
  try {
    const parsed = quantitativeTeamInputSchema.safeParse(JSON.parse(await readBoundedBody(request)));
    if (!parsed.success) return Response.json({ error: 'Invalid quantitative team input' }, { status: 400, headers });
    const team = new QuantitativeTeamOrchestrator();
    const result = await team.execute({
      id: randomUUID(), agentId: team.config.id, type: 'quantitative-analysis',
      input: parsed.data, status: 'pending', createdAt: new Date(),
    });
    return Response.json(result, { headers });
  } catch (error) {
    const status = error instanceof PortfolioReportInputError ? error.status : 400;
    return Response.json({ error: status === 413 ? 'Input exceeds 1 MiB' : 'Unable to analyze quantitative input' }, { status, headers });
  }
}