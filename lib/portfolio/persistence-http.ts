import { z } from 'zod';
import {
  holdingSnapshotInputSchema,
  isFreshPriceCapture,
  priceHistoryInputSchema,
  portfolioBundleSchema,
  portfolioInputSchema,
  watchlistInputSchema,
  type PortfolioCaptureRepository,
  type PortfolioExport,
  type PortfolioRepository,
} from './persistence';

const MAX_BODY_BYTES = 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'no-store' };
const snapshotCursorSchema = z
  .object({
    createdAt: z.string().datetime(),
    id: z.string().regex(UUID_PATTERN),
  })
  .strict();

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

async function readJson(
  request: Request,
): Promise<{ value: unknown } | { response: Response }> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
    'application/json'
  ) {
    return { response: jsonError('Expected application/json.', 400) };
  }
  if (!request.body) return { response: jsonError('Invalid JSON.', 400) };

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunks: string[] = [];
  let size = 0;
  let text: string;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { response: jsonError('Request body exceeds 1 MiB.', 413) };
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    text = chunks.join('');
  } catch {
    await reader.cancel().catch(() => undefined);
    return { response: jsonError('Invalid request body.', 400) };
  } finally {
    reader.releaseLock();
  }

  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return { response: jsonError('Invalid JSON.', 400) };
  }
}

function exportInput<
  T extends { id: string; createdAt: string; updatedAt: string },
>(record: T) {
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...input
  } = record;
  return input;
}

async function exportBundle(
  userId: string,
  repository: PortfolioRepository,
): Promise<PortfolioExport> {
  const [portfolios, watchlists] = await Promise.all([
    repository.listPortfolios(userId),
    repository.listWatchlists(userId),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    portfolios: portfolios.map(exportInput),
    watchlists: watchlists.map(exportInput),
  };
}

async function safely<T>(operation: () => Promise<T>): Promise<T | Response> {
  try {
    return await operation();
  } catch (error) {
    if (isUniqueViolation(error))
      return jsonError('A collection with that name already exists.', 409);
    return jsonError('Portfolio storage is unavailable.', 503);
  }
}

export async function portfolioCollectionResponse(
  request: Request,
  userId: string,
  repository: PortfolioRepository,
): Promise<Response> {
  if (request.method === 'GET') {
    const result = await safely(() => exportBundle(userId, repository));
    return result instanceof Response
      ? result
      : Response.json(result, { headers });
  }

  const body = await readJson(request);
  if ('response' in body) return body.response;

  if (request.method === 'POST') {
    const parsed = portfolioInputSchema.safeParse(body.value);
    if (!parsed.success) return jsonError('Invalid portfolio input.', 400);
    const result = await safely(() =>
      repository.createPortfolio(userId, parsed.data),
    );
    return result instanceof Response
      ? result
      : Response.json(result, { status: 201, headers });
  }

  if (request.method === 'PUT') {
    const parsed = portfolioBundleSchema.safeParse(body.value);
    if (!parsed.success)
      return jsonError('Invalid portfolio export file.', 400);
    const result = await safely(async () => {
      await repository.importBundle(userId, parsed.data);
      return exportBundle(userId, repository);
    });
    return result instanceof Response
      ? result
      : Response.json(result, { headers });
  }

  return jsonError('Method not allowed.', 405);
}

export async function portfolioItemResponse(
  request: Request,
  userId: string,
  id: string,
  repository: PortfolioRepository,
): Promise<Response> {
  if (!UUID_PATTERN.test(id)) return jsonError('Portfolio not found.', 404);
  if (request.method === 'GET') {
    const result = await safely(() => repository.getPortfolio(userId, id));
    if (result instanceof Response) return result;
    return result
      ? Response.json(result, { headers })
      : jsonError('Portfolio not found.', 404);
  }
  if (request.method === 'DELETE') {
    const result = await safely(() => repository.deletePortfolio(userId, id));
    if (result instanceof Response) return result;
    return result
      ? new Response(null, { status: 204, headers })
      : jsonError('Portfolio not found.', 404);
  }
  if (request.method === 'PATCH') {
    const body = await readJson(request);
    if ('response' in body) return body.response;
    const parsed = portfolioInputSchema.safeParse(body.value);
    if (!parsed.success) return jsonError('Invalid portfolio input.', 400);
    const result = await safely(() =>
      repository.updatePortfolio(userId, id, parsed.data),
    );
    if (result instanceof Response) return result;
    return result
      ? Response.json(result, { headers })
      : jsonError('Portfolio not found.', 404);
  }
  return jsonError('Method not allowed.', 405);
}

export async function watchlistCollectionResponse(
  request: Request,
  userId: string,
  repository: PortfolioRepository,
): Promise<Response> {
  if (request.method === 'GET') {
    const result = await safely(() => repository.listWatchlists(userId));
    return result instanceof Response
      ? result
      : Response.json(result, { headers });
  }
  if (request.method !== 'POST') return jsonError('Method not allowed.', 405);

  const body = await readJson(request);
  if ('response' in body) return body.response;
  const parsed = watchlistInputSchema.safeParse(body.value);
  if (!parsed.success) return jsonError('Invalid watchlist input.', 400);
  const result = await safely(() =>
    repository.createWatchlist(userId, parsed.data),
  );
  return result instanceof Response
    ? result
    : Response.json(result, { status: 201, headers });
}

export async function watchlistItemResponse(
  request: Request,
  userId: string,
  id: string,
  repository: PortfolioRepository,
): Promise<Response> {
  if (!UUID_PATTERN.test(id)) return jsonError('Watchlist not found.', 404);
  if (request.method === 'GET') {
    const result = await safely(() => repository.getWatchlist(userId, id));
    if (result instanceof Response) return result;
    return result
      ? Response.json(result, { headers })
      : jsonError('Watchlist not found.', 404);
  }
  if (request.method === 'DELETE') {
    const result = await safely(() => repository.deleteWatchlist(userId, id));
    if (result instanceof Response) return result;
    return result
      ? new Response(null, { status: 204, headers })
      : jsonError('Watchlist not found.', 404);
  }
  if (request.method === 'PATCH') {
    const body = await readJson(request);
    if ('response' in body) return body.response;
    const parsed = watchlistInputSchema.safeParse(body.value);
    if (!parsed.success) return jsonError('Invalid watchlist input.', 400);
    const result = await safely(() =>
      repository.updateWatchlist(userId, id, parsed.data),
    );
    if (result instanceof Response) return result;
    return result
      ? Response.json(result, { headers })
      : jsonError('Watchlist not found.', 404);
  }
  return jsonError('Method not allowed.', 405);
}

export async function portfolioSnapshotResponse(
  request: Request,
  userId: string,
  portfolioId: string,
  repository: PortfolioCaptureRepository,
  now = new Date(),
): Promise<Response> {
  if (!UUID_PATTERN.test(portfolioId))
    return jsonError('Portfolio not found.', 404);
  if (request.method === 'GET') {
    const encodedCursor = new URL(request.url).searchParams.get('cursor');
    let cursor: { createdAt: string; id: string } | undefined;
    if (encodedCursor !== null) {
      try {
        const decoded = JSON.parse(
          Buffer.from(encodedCursor, 'base64url').toString('utf8'),
        ) as unknown;
        const parsed = snapshotCursorSchema.safeParse(decoded);
        if (!parsed.success) return jsonError('Invalid snapshot cursor.', 400);
        cursor = parsed.data;
      } catch {
        return jsonError('Invalid snapshot cursor.', 400);
      }
    }
    const result = await safely(() =>
      repository.listSnapshots(userId, portfolioId, cursor),
    );
    if (result instanceof Response) return result;
    return result
      ? Response.json(
          {
            snapshots: result.records,
            nextCursor: result.nextCursor
              ? Buffer.from(JSON.stringify(result.nextCursor)).toString(
                  'base64url',
                )
              : null,
          },
          { headers },
        )
      : jsonError('Portfolio not found.', 404);
  }
  if (request.method !== 'POST') return jsonError('Method not allowed.', 405);

  const body = await readJson(request);
  if ('response' in body) return body.response;
  const parsed = holdingSnapshotInputSchema.safeParse(body.value);
  if (!parsed.success) return jsonError('Invalid portfolio snapshot.', 400);
  if (!isFreshPriceCapture(parsed.data.observedAt, parsed.data.asOf, now)) {
    return jsonError('Portfolio snapshot is stale or future-dated.', 400);
  }

  const result = await safely(() =>
    repository.createSnapshot(userId, portfolioId, parsed.data),
  );
  if (result instanceof Response) return result;
  if (result.kind !== 'created') {
    if (result.kind === 'not-found')
      return jsonError('Portfolio not found.', 404);
    if (result.kind === 'currency-mismatch')
      return jsonError('Snapshot currency does not match the portfolio.', 409);
    return jsonError(
      'Snapshot tickers must exactly match current portfolio holdings.',
      409,
    );
  }
  return Response.json(result.record, { status: 201, headers });
}

export async function portfolioPriceHistoryResponse(
  request: Request,
  userId: string,
  portfolioId: string,
  repository: PortfolioCaptureRepository,
  now = new Date(),
): Promise<Response> {
  if (!UUID_PATTERN.test(portfolioId))
    return jsonError('Portfolio not found.', 404);
  if (request.method === 'GET') {
    const result = await safely(() =>
      repository.listPriceHistories(userId, portfolioId),
    );
    if (result instanceof Response) return result;
    return result
      ? Response.json(result, { headers })
      : jsonError('Portfolio not found.', 404);
  }
  if (request.method !== 'POST') return jsonError('Method not allowed.', 405);

  const body = await readJson(request);
  if ('response' in body) return body.response;
  const parsed = priceHistoryInputSchema.safeParse(body.value);
  if (!parsed.success) return jsonError('Invalid price history.', 400);
  if (
    parsed.data.histories.some(
      ({ prices }) =>
        !isFreshPriceCapture(
          parsed.data.observedAt,
          prices[prices.length - 1].date,
          now,
        ),
    )
  ) {
    return jsonError('Price history is stale or future-dated.', 400);
  }

  const result = await safely(() =>
    repository.savePriceHistories(userId, portfolioId, parsed.data),
  );
  if (result instanceof Response) return result;
  if (result.kind !== 'saved') {
    if (result.kind === 'not-found')
      return jsonError('Portfolio not found.', 404);
    if (result.kind === 'currency-mismatch')
      return jsonError('History currency does not match the portfolio.', 409);
    return jsonError('History tickers must belong to the portfolio.', 409);
  }
  return Response.json(result.records, { headers });
}
