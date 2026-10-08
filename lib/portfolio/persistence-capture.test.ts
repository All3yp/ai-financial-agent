import assert from 'node:assert/strict';
import test from 'node:test';
import {
  portfolioPriceHistoryResponse,
  portfolioSnapshotResponse,
} from './persistence-http';
import type {
  HoldingSnapshotInput,
  PortfolioCaptureRepository,
  PortfolioPriceHistoryRecord,
  PortfolioSnapshotRecord,
  PriceHistoryInput,
} from './persistence';

const now = new Date('2026-10-08T12:00:00.000Z');
const portfolioId = '00000000-0000-4000-8000-000000000001';

class MemoryCaptureRepository implements PortfolioCaptureRepository {
  private readonly portfolios = new Map<
    string,
    {
      owner: string;
      currency: string;
      holdings: Array<{
        ticker: string;
        shares: number;
        costBasis: number | null;
      }>;
    }
  >();
  private readonly snapshots = new Map<string, PortfolioSnapshotRecord[]>();
  private readonly histories = new Map<string, PortfolioPriceHistoryRecord[]>();
  private nextId = 2;

  addPortfolio(owner: string, currency = 'USD') {
    this.portfolios.set(portfolioId, {
      owner,
      currency,
      holdings: [
        { ticker: 'AAPL', shares: 3, costBasis: 180 },
        { ticker: 'MSFT', shares: 2, costBasis: null },
      ],
    });
  }

  private key(owner: string, id: string) {
    return `${owner}:${id}`;
  }

  private nextUuid() {
    return `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`;
  }

  async listSnapshots(
    userId: string,
    id: string,
    cursor?: { createdAt: string; id: string },
  ) {
    if (this.portfolios.get(id)?.owner !== userId) return null;
    const records = structuredClone(
      this.snapshots.get(this.key(userId, id)) ?? [],
    ).filter(
      (record) =>
        !cursor ||
        record.capturedAt < cursor.createdAt ||
        (record.capturedAt === cursor.createdAt && record.id < cursor.id),
    );
    return { records: records.slice(0, 100), nextCursor: null };
  }

  async createSnapshot(
    userId: string,
    id: string,
    input: HoldingSnapshotInput,
  ) {
    const portfolio = this.portfolios.get(id);
    if (portfolio?.owner !== userId) return { kind: 'not-found' as const };
    if (input.currency !== portfolio.currency)
      return { kind: 'currency-mismatch' as const };
    const expected = portfolio.holdings.map(({ ticker }) => ticker).sort();
    const received = input.prices.map(({ ticker }) => ticker).sort();
    if (expected.join(',') !== received.join(','))
      return { kind: 'holdings-mismatch' as const };
    const prices = new Map(
      input.prices.map(({ ticker, price }) => [ticker, price]),
    );
    const record: PortfolioSnapshotRecord = {
      id: this.nextUuid(),
      source: input.source,
      currency: input.currency,
      adjustmentBasis: input.adjustmentBasis,
      observedAt: input.observedAt,
      asOf: input.asOf,
      capturedAt: now.toISOString(),
      holdings: portfolio.holdings.map((holding) => {
        const price = prices.get(holding.ticker);
        if (price === undefined)
          throw new Error('Fixture snapshot price missing');
        return { ...holding, price };
      }),
    };
    const key = this.key(userId, id);
    this.snapshots.set(key, [...(this.snapshots.get(key) ?? []), record]);
    return { kind: 'created' as const, record };
  }

  async listPriceHistories(userId: string, id: string) {
    if (this.portfolios.get(id)?.owner !== userId) return null;
    return structuredClone(this.histories.get(this.key(userId, id)) ?? []);
  }

  async savePriceHistories(
    userId: string,
    id: string,
    input: PriceHistoryInput,
  ) {
    const portfolio = this.portfolios.get(id);
    if (portfolio?.owner !== userId) return { kind: 'not-found' as const };
    if (input.currency !== portfolio.currency)
      return { kind: 'currency-mismatch' as const };
    const heldTickers = new Set(portfolio.holdings.map(({ ticker }) => ticker));
    if (input.histories.some(({ ticker }) => !heldTickers.has(ticker))) {
      return { kind: 'unknown-ticker' as const };
    }

    const key = this.key(userId, id);
    const records = this.histories.get(key) ?? [];
    const saved = input.histories.map(
      (history): PortfolioPriceHistoryRecord => ({
        ticker: history.ticker,
        currency: input.currency,
        source: input.source,
        adjustmentBasis: input.adjustmentBasis,
        observedAt: input.observedAt,
        asOf: history.prices[history.prices.length - 1].date,
        prices: structuredClone(history.prices),
      }),
    );
    for (const record of saved) {
      const index = records.findIndex(
        (existing) =>
          existing.ticker === record.ticker &&
          existing.source === record.source,
      );
      if (index < 0) records.push(record);
      else records[index] = record;
    }
    this.histories.set(key, records);
    return { kind: 'saved' as const, records: saved };
  }
}

function request(method: string, body?: unknown) {
  return new Request('http://localhost/api/portfolio', {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function snapshotInput(overrides: Record<string, unknown> = {}) {
  return {
    source: 'fmp',
    currency: 'USD',
    adjustmentBasis: 'split-adjusted',
    observedAt: now.toISOString(),
    asOf: '2026-10-08',
    prices: [
      { ticker: 'AAPL', price: 230 },
      { ticker: 'MSFT', price: 510 },
    ],
    ...overrides,
  };
}

function historyInput(overrides: Record<string, unknown> = {}) {
  return {
    source: 'financial-datasets',
    currency: 'USD',
    adjustmentBasis: 'unadjusted',
    observedAt: now.toISOString(),
    histories: [
      {
        ticker: 'AAPL',
        prices: [
          { date: '2026-10-07', price: 228 },
          { date: '2026-10-08', price: 230 },
        ],
      },
    ],
    ...overrides,
  };
}

test('holding snapshot requires fresh metadata, exact positions and portfolio currency', async () => {
  const repository = new MemoryCaptureRepository();
  repository.addPortfolio('alice');

  const created = await portfolioSnapshotResponse(
    request('POST', snapshotInput()),
    'alice',
    portfolioId,
    repository,
    now,
  );
  assert.equal(created.status, 201);
  const record = await created.json();
  assert.equal(record.adjustmentBasis, 'split-adjusted');
  assert.equal(record.holdings.length, 2);
  assert.equal(record.holdings[0].shares, 3);
  assert.equal(record.holdings[0].price, 230);
  const page = await portfolioSnapshotResponse(
    request('GET'),
    'alice',
    portfolioId,
    repository,
    now,
  );
  assert.equal((await page.json()).snapshots.length, 1);
  assert.equal(
    (
      await portfolioSnapshotResponse(
        new Request('http://localhost/api/portfolio?cursor=bad'),
        'alice',
        portfolioId,
        repository,
        now,
      )
    ).status,
    400,
  );

  assert.equal(
    (
      await portfolioSnapshotResponse(
        request(
          'POST',
          snapshotInput({ prices: [{ ticker: 'AAPL', price: 230 }] }),
        ),
        'alice',
        portfolioId,
        repository,
        now,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await portfolioSnapshotResponse(
        request('POST', snapshotInput({ currency: 'EUR' })),
        'alice',
        portfolioId,
        repository,
        now,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await portfolioSnapshotResponse(
        request(
          'POST',
          snapshotInput({
            observedAt: '2026-09-29T12:00:00.000Z',
            asOf: '2026-09-29',
          }),
        ),
        'alice',
        portfolioId,
        repository,
        now,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await portfolioSnapshotResponse(
        request('POST', snapshotInput({ asOf: '2026-10-09' })),
        'alice',
        portfolioId,
        repository,
        now,
      )
    ).status,
    400,
  );
});

test('price histories are validated, bounded, fresh and owner-scoped', async () => {
  const repository = new MemoryCaptureRepository();
  repository.addPortfolio('alice');

  const saved = await portfolioPriceHistoryResponse(
    request('POST', historyInput()),
    'alice',
    portfolioId,
    repository,
    now,
  );
  assert.equal(saved.status, 200);
  const records = await saved.json();
  assert.equal(records[0].source, 'financial-datasets');
  assert.equal(records[0].currency, 'USD');
  assert.equal(records[0].adjustmentBasis, 'unadjusted');
  assert.equal(records[0].asOf, '2026-10-08');

  const refreshed = await portfolioPriceHistoryResponse(
    request(
      'POST',
      historyInput({
        histories: [
          {
            ticker: 'AAPL',
            prices: [
              { date: '2026-10-07', price: 229 },
              { date: '2026-10-08', price: 231 },
            ],
          },
        ],
      }),
    ),
    'alice',
    portfolioId,
    repository,
    now,
  );
  assert.equal(refreshed.status, 200);
  const refreshedRecords = await (
    await portfolioPriceHistoryResponse(
      request('GET'),
      'alice',
      portfolioId,
      repository,
      now,
    )
  ).json();
  assert.equal(refreshedRecords.length, 1);
  assert.equal(refreshedRecords[0].prices[1].price, 231);

  assert.equal(
    (
      await portfolioPriceHistoryResponse(
        request('GET'),
        'bob',
        portfolioId,
        repository,
        now,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await portfolioPriceHistoryResponse(
        request('POST', historyInput()),
        'bob',
        portfolioId,
        repository,
        now,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await portfolioSnapshotResponse(
        request('GET'),
        'bob',
        portfolioId,
        repository,
        now,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await portfolioPriceHistoryResponse(
        request('POST', historyInput({ currency: 'EUR' })),
        'alice',
        portfolioId,
        repository,
        now,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await portfolioPriceHistoryResponse(
        request(
          'POST',
          historyInput({
            histories: [
              { ticker: 'NVDA', prices: [{ date: '2026-10-08', price: 100 }] },
            ],
          }),
        ),
        'alice',
        portfolioId,
        repository,
        now,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await portfolioPriceHistoryResponse(
        request(
          'POST',
          historyInput({ observedAt: '2026-09-29T12:00:00.000Z' }),
        ),
        'alice',
        portfolioId,
        repository,
        now,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await portfolioPriceHistoryResponse(
        request(
          'POST',
          historyInput({
            histories: [
              {
                ticker: 'AAPL',
                prices: [
                  { date: '2026-10-08', price: 230 },
                  { date: '2026-10-07', price: 228 },
                ],
              },
            ],
          }),
        ),
        'alice',
        portfolioId,
        repository,
        now,
      )
    ).status,
    400,
  );
});
