import { portfolioReportInputSchema, portfolioTools } from '../ai/tools/portfolio-tools';

export const MAX_PORTFOLIO_INPUT_BYTES = 1024 * 1024;

export class PortfolioReportInputError extends Error {
  constructor(message: string, readonly status: 400 | 413 = 400) {
    super(message);
    this.name = 'PortfolioReportInputError';
  }
}

export function parsePortfolioReportJson(text: string) {
  if (new TextEncoder().encode(text).byteLength > MAX_PORTFOLIO_INPUT_BYTES) {
    throw new PortfolioReportInputError('Portfolio input exceeds 1 MiB.', 413);
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new PortfolioReportInputError('Invalid JSON.');
  }
  const parsed = portfolioReportInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PortfolioReportInputError('Invalid portfolio input.');
  }
  try {
    return portfolioTools.generatePortfolioReport.execute(parsed.data);
  } catch {
    throw new PortfolioReportInputError('Unable to calculate portfolio report.');
  }
}

export async function readBoundedBody(request: Request): Promise<string> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const parts: string[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_PORTFOLIO_INPUT_BYTES) {
        throw new PortfolioReportInputError('Portfolio input exceeds 1 MiB.', 413);
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function createPortfolioRiskResponse(
  request: Request,
  authenticated: boolean,
): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!authenticated) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401, headers });
  }
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    return Response.json({ error: 'Expected application/json.' }, { status: 400, headers });
  }
  try {
    const report = parsePortfolioReportJson(await readBoundedBody(request));
    return Response.json(report, { headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof PortfolioReportInputError ? error.message : 'Invalid portfolio request.' },
      { status: error instanceof PortfolioReportInputError ? error.status : 400, headers },
    );
  }
}