import assert from 'node:assert/strict';
import test from 'node:test';
import {
  portfolioCollectionResponse,
  portfolioItemResponse,
  watchlistCollectionResponse,
  watchlistItemResponse,
} from './persistence-http';
import type {
  PortfolioInput,
  PortfolioRecord,
  PortfolioRepository,
  WatchlistInput,
  WatchlistRecord,
} from './persistence';

class MemoryRepository implements PortfolioRepository {
  private readonly portfolios = new Map<
    string,
    { owner: string; record: PortfolioRecord }
  >();
  private readonly watchlists = new Map<
    string,
    { owner: string; record: WatchlistRecord }
  >();
  private nextId = 1;

  private id() {
    return `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`;
  }

  async listPortfolios(userId: string) {
    return [...this.portfolios.values()]
      .filter(({ owner }) => owner === userId)
      .map(({ record }) => record);
  }

  async listEnabledPortfoliosForMonitoring() {
    return [...this.portfolios.values()]
      .filter(
        ({ record }) => record.monitoringEnabled && record.holdings.length > 0,
      )
      .map(({ owner, record }) => ({
        portfolioId: record.id,
        userId: owner,
        currency: record.currency,
        positions: record.holdings.map(({ ticker, shares, costBasis }) => ({
          ticker,
          shares,
          costBasis: costBasis ?? undefined,
        })),
      }));
  }

  async getPortfolio(userId: string, id: string) {
    const entry = this.portfolios.get(id);
    return entry?.owner === userId ? entry.record : null;
  }

  async createPortfolio(userId: string, input: PortfolioInput) {
    const timestamp = new Date().toISOString();
    const record = {
      ...structuredClone(input),
      id: this.id(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.portfolios.set(record.id, { owner: userId, record });
    return record;
  }

  async updatePortfolio(userId: string, id: string, input: PortfolioInput) {
    const entry = this.portfolios.get(id);
    if (entry?.owner !== userId) return null;
    const record = {
      ...structuredClone(input),
      id,
      createdAt: entry.record.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.portfolios.set(id, { owner: userId, record });
    return record;
  }

  async deletePortfolio(userId: string, id: string) {
    if (this.portfolios.get(id)?.owner !== userId) return false;
    return this.portfolios.delete(id);
  }

  async listWatchlists(userId: string) {
    return [...this.watchlists.values()]
      .filter(({ owner }) => owner === userId)
      .map(({ record }) => record);
  }

  async getWatchlist(userId: string, id: string) {
    const entry = this.watchlists.get(id);
    return entry?.owner === userId ? entry.record : null;
  }

  async createWatchlist(userId: string, input: WatchlistInput) {
    const timestamp = new Date().toISOString();
    const record = {
      ...structuredClone(input),
      id: this.id(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.watchlists.set(record.id, { owner: userId, record });
    return record;
  }

  async updateWatchlist(userId: string, id: string, input: WatchlistInput) {
    const entry = this.watchlists.get(id);
    if (entry?.owner !== userId) return null;
    const record = {
      ...structuredClone(input),
      id,
      createdAt: entry.record.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.watchlists.set(id, { owner: userId, record });
    return record;
  }

  async deleteWatchlist(userId: string, id: string) {
    if (this.watchlists.get(id)?.owner !== userId) return false;
    return this.watchlists.delete(id);
  }

  async importBundle(
    userId: string,
    bundle: { portfolios: PortfolioInput[]; watchlists: WatchlistInput[] },
  ) {
    for (const input of bundle.portfolios) {
      const existing = [...this.portfolios.entries()].find(
        ([, value]) =>
          value.owner === userId && value.record.name === input.name,
      );
      if (existing) {
        await this.updatePortfolio(userId, existing[0], input);
      } else {
        await this.createPortfolio(userId, input);
      }
    }
    for (const input of bundle.watchlists) {
      const existing = [...this.watchlists.entries()].find(
        ([, value]) =>
          value.owner === userId && value.record.name === input.name,
      );
      if (existing) {
        await this.updateWatchlist(userId, existing[0], input);
      } else {
        await this.createWatchlist(userId, input);
      }
    }
  }
}

function request(method: string, body?: unknown) {
  return new Request('http://localhost/api/portfolio', {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const portfolioInput: PortfolioInput = {
  name: 'Long term',
  currency: 'USD',
  monitoringEnabled: false,
  holdings: [{ ticker: 'AAPL', shares: 3, costBasis: 180 }],
};

test('portfolio CRUD is isolated by owner and foreign IDs are indistinguishable from missing IDs', async () => {
  const repository = new MemoryRepository();
  const created = await portfolioCollectionResponse(
    request('POST', portfolioInput),
    'alice',
    repository,
  );
  assert.equal(created.status, 201);
  const record = await created.json();

  assert.equal(
    (await portfolioItemResponse(request('GET'), 'bob', record.id, repository))
      .status,
    404,
  );
  assert.equal(
    (
      await portfolioItemResponse(
        request('PATCH', portfolioInput),
        'bob',
        record.id,
        repository,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await portfolioItemResponse(
        request('DELETE'),
        'bob',
        record.id,
        repository,
      )
    ).status,
    404,
  );
  assert.deepEqual(
    (
      await (
        await portfolioCollectionResponse(request('GET'), 'bob', repository)
      ).json()
    ).portfolios,
    [],
  );

  assert.equal(
    (
      await portfolioItemResponse(
        request('GET'),
        'alice',
        record.id,
        repository,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await portfolioItemResponse(
        request('DELETE'),
        'alice',
        record.id,
        repository,
      )
    ).status,
    204,
  );
});

test('watchlist CRUD is owner-scoped', async () => {
  const repository = new MemoryRepository();
  const created = await watchlistCollectionResponse(
    request('POST', { name: 'Tech', tickers: ['aapl', 'MSFT'] }),
    'alice',
    repository,
  );
  assert.equal(created.status, 201);
  const record = await created.json();
  assert.deepEqual(record.tickers, ['AAPL', 'MSFT']);

  assert.equal(
    (await watchlistItemResponse(request('GET'), 'bob', record.id, repository))
      .status,
    404,
  );
  assert.equal(
    (
      await watchlistItemResponse(
        request('PATCH', { name: 'Changed', tickers: [] }),
        'bob',
        record.id,
        repository,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await watchlistItemResponse(
        request('DELETE'),
        'bob',
        record.id,
        repository,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await watchlistItemResponse(
        request('DELETE'),
        'alice',
        record.id,
        repository,
      )
    ).status,
    204,
  );
});

test('scheduled monitoring candidates require explicit opt-in and nonempty holdings', async () => {
  const repository = new MemoryRepository();
  const disabled = await repository.createPortfolio('alice', portfolioInput);
  assert.equal(disabled.monitoringEnabled, false);
  await repository.createPortfolio('bob', {
    ...portfolioInput,
    name: 'Enabled',
    monitoringEnabled: true,
  });
  await repository.createPortfolio('bob', {
    ...portfolioInput,
    name: 'Empty',
    monitoringEnabled: true,
    holdings: [],
  });

  const candidates = await repository.listEnabledPortfoliosForMonitoring();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].userId, 'bob');
  assert.notEqual(candidates[0].portfolioId, disabled.id);
  assert.deepEqual(
    candidates[0].positions.map(({ ticker }) => ticker),
    ['AAPL'],
  );
});

test('exported bundles import idempotently and round-trip through strict validation', async () => {
  const repository = new MemoryRepository();
  await repository.createPortfolio('alice', portfolioInput);
  await repository.createWatchlist('alice', {
    name: 'Focus',
    tickers: ['MSFT'],
  });

  const exported = await portfolioCollectionResponse(
    request('GET'),
    'alice',
    repository,
  );
  const bundle = await exported.json();
  assert.equal(bundle.version, 1);
  assert.equal(typeof bundle.exportedAt, 'string');
  assert.equal(
    (
      await portfolioCollectionResponse(
        request('PUT', bundle),
        'alice',
        repository,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await portfolioCollectionResponse(
        request('PUT', bundle),
        'alice',
        repository,
      )
    ).status,
    200,
  );

  const after = await (
    await portfolioCollectionResponse(request('GET'), 'alice', repository)
  ).json();
  assert.equal(after.portfolios.length, 1);
  assert.equal(after.watchlists.length, 1);
  assert.deepEqual(after.portfolios[0].holdings, portfolioInput.holdings);
});

test('strict validation, malformed JSON, and bounded imports return safe client errors', async () => {
  const repository = new MemoryRepository();
  assert.equal(
    (
      await portfolioCollectionResponse(
        request('POST', {
          ...portfolioInput,
          holdings: [{ ticker: 'AAPL', shares: 1, costBasis: 0 }],
        }),
        'alice',
        repository,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await portfolioCollectionResponse(
        request('POST', { ...portfolioInput, ownerId: 'bob' }),
        'alice',
        repository,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await watchlistCollectionResponse(
        request('POST', { name: 'Dupes', tickers: ['AAPL', 'aapl'] }),
        'alice',
        repository,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await portfolioCollectionResponse(
        new Request('http://localhost/api/portfolio', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{',
        }),
        'alice',
        repository,
      )
    ).status,
    400,
  );

  const oversized = new Request('http://localhost/api/portfolio', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: `{"version":1,"portfolios":[],"watchlists":[]} ${' '.repeat(1024 * 1024)}`,
  });
  assert.equal(
    (await portfolioCollectionResponse(oversized, 'alice', repository)).status,
    413,
  );
  assert.equal(
    (await portfolioCollectionResponse(request('GET'), 'alice', repository))
      .status,
    200,
  );
});
