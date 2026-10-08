import 'server-only';

import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { db } from './queries';
import {
  portfolio,
  portfolioHolding,
  portfolioPriceHistory,
  portfolioPricePoint,
  portfolioSnapshot,
  portfolioSnapshotHolding,
  watchlist,
  watchlistTicker,
} from './schema';
import type {
  HoldingSnapshotInput,
  PortfolioCaptureRepository,
  PortfolioPriceHistoryRecord,
  PortfolioRecord,
  PortfolioRepository,
  PortfolioSnapshotRecord,
  PriceHistoryInput,
  WatchlistRecord,
} from '@/lib/portfolio/persistence';

function toPortfolioRecord(
  row: typeof portfolio.$inferSelect,
  holdings: (typeof portfolioHolding.$inferSelect)[],
): PortfolioRecord {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    monitoringEnabled: row.monitoringEnabled,
    monitoringFrequency: row.monitoringFrequency,
    monitoringTime: row.monitoringTime,
    monitoringTimezone: row.monitoringTimezone,
    monitoringDayOfWeek: row.monitoringDayOfWeek,
    monitoringDayOfMonth: row.monitoringDayOfMonth,
    holdings: holdings.map(({ ticker, shares, costBasis }) => ({
      ticker,
      shares,
      costBasis,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toWatchlistRecord(
  row: typeof watchlist.$inferSelect,
  tickers: (typeof watchlistTicker.$inferSelect)[],
): WatchlistRecord {
  return {
    id: row.id,
    name: row.name,
    tickers: tickers.map(({ ticker }) => ticker),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getPortfolioRecord(
  executor: typeof db,
  row: typeof portfolio.$inferSelect,
): Promise<PortfolioRecord> {
  const holdings = await executor
    .select()
    .from(portfolioHolding)
    .where(eq(portfolioHolding.portfolioId, row.id))
    .orderBy(asc(portfolioHolding.ticker));
  return toPortfolioRecord(row, holdings);
}

async function getWatchlistRecord(
  executor: typeof db,
  row: typeof watchlist.$inferSelect,
): Promise<WatchlistRecord> {
  const tickers = await executor
    .select()
    .from(watchlistTicker)
    .where(eq(watchlistTicker.watchlistId, row.id))
    .orderBy(asc(watchlistTicker.ticker));
  return toWatchlistRecord(row, tickers);
}

function toSnapshotRecord(
  row: typeof portfolioSnapshot.$inferSelect,
  holdings: (typeof portfolioSnapshotHolding.$inferSelect)[],
): PortfolioSnapshotRecord {
  return {
    id: row.id,
    source: row.source as HoldingSnapshotInput['source'],
    currency: row.currency,
    adjustmentBasis:
      row.adjustmentBasis as HoldingSnapshotInput['adjustmentBasis'],
    observedAt: row.observedAt.toISOString(),
    asOf: row.asOf,
    capturedAt: row.createdAt.toISOString(),
    holdings: holdings.map(({ ticker, shares, costBasis, price }) => ({
      ticker,
      shares,
      costBasis,
      price,
    })),
  };
}

function toPriceHistoryRecord(
  row: typeof portfolioPriceHistory.$inferSelect,
  prices: (typeof portfolioPricePoint.$inferSelect)[],
): PortfolioPriceHistoryRecord {
  return {
    ticker: row.ticker,
    currency: row.currency,
    source: row.source as PriceHistoryInput['source'],
    adjustmentBasis:
      row.adjustmentBasis as PriceHistoryInput['adjustmentBasis'],
    observedAt: row.observedAt.toISOString(),
    asOf: row.asOf,
    prices: prices.map(({ date, price }) => ({ date, price })),
  };
}

export const portfolioRepository: PortfolioRepository &
  PortfolioCaptureRepository = {
  async listPortfolios(userId) {
    const rows = await db
      .select()
      .from(portfolio)
      .where(eq(portfolio.userId, userId))
      .orderBy(asc(portfolio.name));
    const holdingRows = rows.length
      ? await db
          .select()
          .from(portfolioHolding)
          .where(
            inArray(
              portfolioHolding.portfolioId,
              rows.map(({ id }) => id),
            ),
          )
          .orderBy(asc(portfolioHolding.ticker))
      : [];
    const grouped = new Map<string, typeof holdingRows>();
    for (const holding of holdingRows) {
      const group = grouped.get(holding.portfolioId) ?? [];
      group.push(holding);
      grouped.set(holding.portfolioId, group);
    }
    return rows.map((row) => toPortfolioRecord(row, grouped.get(row.id) ?? []));
  },

  async getPortfolio(userId, id) {
    const [row] = await db
      .select()
      .from(portfolio)
      .where(and(eq(portfolio.id, id), eq(portfolio.userId, userId)));
    return row ? getPortfolioRecord(db, row) : null;
  },

  async createPortfolio(userId, input) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(portfolio)
        .values({
          userId,
          name: input.name,
          currency: input.currency,
          monitoringEnabled: input.monitoringEnabled,
          monitoringFrequency: input.monitoringFrequency,
          monitoringTime: input.monitoringTime,
          monitoringTimezone: input.monitoringTimezone,
          monitoringDayOfWeek: input.monitoringDayOfWeek,
          monitoringDayOfMonth: input.monitoringDayOfMonth,
        })
        .returning();
      if (input.holdings.length) {
        await tx.insert(portfolioHolding).values(
          input.holdings.map((holding) => ({
            portfolioId: row.id,
            ticker: holding.ticker,
            shares: holding.shares,
            costBasis: holding.costBasis ?? null,
          })),
        );
      }
      return toPortfolioRecord(
        row,
        input.holdings.map((holding) => ({
          id: '',
          portfolioId: row.id,
          ticker: holding.ticker,
          shares: holding.shares,
          costBasis: holding.costBasis ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
      );
    });
  },

  async updatePortfolio(userId, id, input) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(portfolio)
        .set({
          name: input.name,
          currency: input.currency,
          monitoringEnabled: input.monitoringEnabled,
          monitoringFrequency: input.monitoringFrequency,
          monitoringTime: input.monitoringTime,
          monitoringTimezone: input.monitoringTimezone,
          monitoringDayOfWeek: input.monitoringDayOfWeek,
          monitoringDayOfMonth: input.monitoringDayOfMonth,
          updatedAt: new Date(),
        })
        .where(and(eq(portfolio.id, id), eq(portfolio.userId, userId)))
        .returning();
      if (!row) return null;
      await tx
        .delete(portfolioHolding)
        .where(eq(portfolioHolding.portfolioId, id));
      if (input.holdings.length) {
        await tx.insert(portfolioHolding).values(
          input.holdings.map((holding) => ({
            portfolioId: id,
            ticker: holding.ticker,
            shares: holding.shares,
            costBasis: holding.costBasis ?? null,
          })),
        );
      }
      return toPortfolioRecord(
        row,
        input.holdings.map((holding) => ({
          id: '',
          portfolioId: id,
          ticker: holding.ticker,
          shares: holding.shares,
          costBasis: holding.costBasis ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
      );
    });
  },

  async deletePortfolio(userId, id) {
    const [deleted] = await db
      .delete(portfolio)
      .where(and(eq(portfolio.id, id), eq(portfolio.userId, userId)))
      .returning({ id: portfolio.id });
    return Boolean(deleted);
  },

  async listWatchlists(userId) {
    const rows = await db
      .select()
      .from(watchlist)
      .where(eq(watchlist.userId, userId))
      .orderBy(asc(watchlist.name));
    const tickerRows = rows.length
      ? await db
          .select()
          .from(watchlistTicker)
          .where(
            inArray(
              watchlistTicker.watchlistId,
              rows.map(({ id }) => id),
            ),
          )
          .orderBy(asc(watchlistTicker.ticker))
      : [];
    const grouped = new Map<string, typeof tickerRows>();
    for (const ticker of tickerRows) {
      const group = grouped.get(ticker.watchlistId) ?? [];
      group.push(ticker);
      grouped.set(ticker.watchlistId, group);
    }
    return rows.map((row) => toWatchlistRecord(row, grouped.get(row.id) ?? []));
  },

  async getWatchlist(userId, id) {
    const [row] = await db
      .select()
      .from(watchlist)
      .where(and(eq(watchlist.id, id), eq(watchlist.userId, userId)));
    return row ? getWatchlistRecord(db, row) : null;
  },

  async createWatchlist(userId, input) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(watchlist)
        .values({ userId, name: input.name })
        .returning();
      if (input.tickers.length) {
        await tx
          .insert(watchlistTicker)
          .values(
            input.tickers.map((ticker) => ({ watchlistId: row.id, ticker })),
          );
      }
      return toWatchlistRecord(
        row,
        input.tickers.map((ticker) => ({
          id: '',
          watchlistId: row.id,
          ticker,
          createdAt: row.createdAt,
        })),
      );
    });
  },

  async updateWatchlist(userId, id, input) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(watchlist)
        .set({ name: input.name, updatedAt: new Date() })
        .where(and(eq(watchlist.id, id), eq(watchlist.userId, userId)))
        .returning();
      if (!row) return null;
      await tx
        .delete(watchlistTicker)
        .where(eq(watchlistTicker.watchlistId, id));
      if (input.tickers.length) {
        await tx
          .insert(watchlistTicker)
          .values(input.tickers.map((ticker) => ({ watchlistId: id, ticker })));
      }
      return toWatchlistRecord(
        row,
        input.tickers.map((ticker) => ({
          id: '',
          watchlistId: id,
          ticker,
          createdAt: row.createdAt,
        })),
      );
    });
  },

  async deleteWatchlist(userId, id) {
    const [deleted] = await db
      .delete(watchlist)
      .where(and(eq(watchlist.id, id), eq(watchlist.userId, userId)))
      .returning({ id: watchlist.id });
    return Boolean(deleted);
  },

  async listEnabledPortfoliosForMonitoring() {
    const rows = await db
      .select({
        id: portfolio.id,
        userId: portfolio.userId,
        currency: portfolio.currency,
        monitoringFrequency: portfolio.monitoringFrequency,
        monitoringTime: portfolio.monitoringTime,
        monitoringTimezone: portfolio.monitoringTimezone,
        monitoringDayOfWeek: portfolio.monitoringDayOfWeek,
        monitoringDayOfMonth: portfolio.monitoringDayOfMonth,
      })
      .from(portfolio)
      .where(eq(portfolio.monitoringEnabled, true));
    if (rows.length === 0) return [];

    const holdings = await db
      .select()
      .from(portfolioHolding)
      .where(
        inArray(
          portfolioHolding.portfolioId,
          rows.map(({ id }) => id),
        ),
      )
      .orderBy(asc(portfolioHolding.ticker));
    const grouped = new Map<string, typeof holdings>();
    for (const holding of holdings) {
      const group = grouped.get(holding.portfolioId) ?? [];
      group.push(holding);
      grouped.set(holding.portfolioId, group);
    }
    return rows
      .map((row) => ({
        portfolioId: row.id,
        userId: row.userId,
        currency: row.currency,
        frequency: row.monitoringFrequency,
        time: row.monitoringTime,
        timezone: row.monitoringTimezone,
        dayOfWeek: row.monitoringDayOfWeek,
        dayOfMonth: row.monitoringDayOfMonth,
        positions: (grouped.get(row.id) ?? []).map(
          ({ ticker, shares, costBasis }) => ({
            ticker,
            shares,
            costBasis: costBasis ?? undefined,
          }),
        ),
      }))
      .filter(({ positions }) => positions.length > 0);
  },

  async importBundle(userId, bundle) {
    await db.transaction(async (tx) => {
      for (const input of bundle.portfolios) {
        const [row] = await tx
          .insert(portfolio)
          .values({
            userId,
            name: input.name,
            currency: input.currency,
            monitoringEnabled: input.monitoringEnabled,
          })
          .onConflictDoUpdate({
            target: [portfolio.userId, portfolio.name],
            set: {
              currency: input.currency,
              monitoringEnabled: input.monitoringEnabled,
              monitoringFrequency: input.monitoringFrequency,
              monitoringTime: input.monitoringTime,
              monitoringTimezone: input.monitoringTimezone,
              monitoringDayOfWeek: input.monitoringDayOfWeek,
              monitoringDayOfMonth: input.monitoringDayOfMonth,
              updatedAt: new Date(),
            },
          })
          .returning();
        await tx
          .delete(portfolioHolding)
          .where(eq(portfolioHolding.portfolioId, row.id));
        if (input.holdings.length) {
          await tx.insert(portfolioHolding).values(
            input.holdings.map((holding) => ({
              portfolioId: row.id,
              ticker: holding.ticker,
              shares: holding.shares,
              costBasis: holding.costBasis ?? null,
            })),
          );
        }
      }
      for (const input of bundle.watchlists) {
        const [row] = await tx
          .insert(watchlist)
          .values({ userId, name: input.name })
          .onConflictDoUpdate({
            target: [watchlist.userId, watchlist.name],
            set: { updatedAt: new Date() },
          })
          .returning();
        await tx
          .delete(watchlistTicker)
          .where(eq(watchlistTicker.watchlistId, row.id));
        if (input.tickers.length) {
          await tx
            .insert(watchlistTicker)
            .values(
              input.tickers.map((ticker) => ({ watchlistId: row.id, ticker })),
            );
        }
      }
    });
  },

  async listSnapshots(userId, portfolioId, cursor) {
    const [ownedPortfolio] = await db
      .select({ id: portfolio.id })
      .from(portfolio)
      .where(and(eq(portfolio.id, portfolioId), eq(portfolio.userId, userId)));
    if (!ownedPortfolio) return null;

    const rows = await db
      .select()
      .from(portfolioSnapshot)
      .where(
        and(
          eq(portfolioSnapshot.portfolioId, portfolioId),
          cursor
            ? or(
                lt(portfolioSnapshot.createdAt, new Date(cursor.createdAt)),
                and(
                  eq(portfolioSnapshot.createdAt, new Date(cursor.createdAt)),
                  lt(portfolioSnapshot.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(portfolioSnapshot.createdAt), desc(portfolioSnapshot.id))
      .limit(101);
    const hasMore = rows.length > 100;
    const pageRows = rows.slice(0, 100);
    const holdingRows = pageRows.length
      ? await db
          .select()
          .from(portfolioSnapshotHolding)
          .where(
            inArray(
              portfolioSnapshotHolding.snapshotId,
              pageRows.map(({ id }) => id),
            ),
          )
          .orderBy(asc(portfolioSnapshotHolding.ticker))
      : [];
    const grouped = new Map<string, typeof holdingRows>();
    for (const holding of holdingRows) {
      const group = grouped.get(holding.snapshotId) ?? [];
      group.push(holding);
      grouped.set(holding.snapshotId, group);
    }
    const last = pageRows[pageRows.length - 1];
    return {
      records: pageRows.map((row) =>
        toSnapshotRecord(row, grouped.get(row.id) ?? []),
      ),
      nextCursor:
        hasMore && last
          ? { createdAt: last.createdAt.toISOString(), id: last.id }
          : null,
    };
  },

  async createSnapshot(userId, portfolioId, input) {
    return db.transaction(async (tx) => {
      const [ownedPortfolio] = await tx
        .select()
        .from(portfolio)
        .where(
          and(eq(portfolio.id, portfolioId), eq(portfolio.userId, userId)),
        );
      if (!ownedPortfolio) return { kind: 'not-found' as const };
      if (input.currency !== ownedPortfolio.currency)
        return { kind: 'currency-mismatch' as const };

      const currentHoldings = await tx
        .select()
        .from(portfolioHolding)
        .where(eq(portfolioHolding.portfolioId, portfolioId));
      const expectedTickers = currentHoldings
        .map(({ ticker }) => ticker)
        .sort();
      const suppliedTickers = input.prices.map(({ ticker }) => ticker).sort();
      if (
        expectedTickers.length !== suppliedTickers.length ||
        expectedTickers.some(
          (ticker, index) => ticker !== suppliedTickers[index],
        )
      ) {
        return { kind: 'holdings-mismatch' as const };
      }

      const [row] = await tx
        .insert(portfolioSnapshot)
        .values({
          portfolioId,
          source: input.source,
          currency: input.currency,
          adjustmentBasis: input.adjustmentBasis,
          observedAt: new Date(input.observedAt),
          asOf: input.asOf,
        })
        .returning();
      const prices = new Map(
        input.prices.map(({ ticker, price }) => [ticker, price]),
      );
      const capturedHoldings = currentHoldings.map((holding) => {
        const price = prices.get(holding.ticker);
        if (price === undefined) {
          throw new Error('Snapshot price missing for portfolio holding');
        }
        return {
          snapshotId: row.id,
          ticker: holding.ticker,
          shares: holding.shares,
          costBasis: holding.costBasis,
          price,
        };
      });
      await tx.insert(portfolioSnapshotHolding).values(capturedHoldings);
      return {
        kind: 'created' as const,
        record: toSnapshotRecord(row, capturedHoldings),
      };
    });
  },

  async listPriceHistories(userId, portfolioId) {
    const [ownedPortfolio] = await db
      .select({ id: portfolio.id })
      .from(portfolio)
      .where(and(eq(portfolio.id, portfolioId), eq(portfolio.userId, userId)));
    if (!ownedPortfolio) return null;

    const rows = await db
      .select()
      .from(portfolioPriceHistory)
      .where(eq(portfolioPriceHistory.portfolioId, portfolioId))
      .orderBy(
        asc(portfolioPriceHistory.ticker),
        desc(portfolioPriceHistory.asOf),
      )
      .limit(500);
    const pointRows = rows.length
      ? await db
          .select()
          .from(portfolioPricePoint)
          .where(
            inArray(
              portfolioPricePoint.historyId,
              rows.map(({ id }) => id),
            ),
          )
          .orderBy(asc(portfolioPricePoint.date))
      : [];
    const grouped = new Map<string, typeof pointRows>();
    for (const point of pointRows) {
      const group = grouped.get(point.historyId) ?? [];
      group.push(point);
      grouped.set(point.historyId, group);
    }
    return rows.map((row) =>
      toPriceHistoryRecord(row, grouped.get(row.id) ?? []),
    );
  },

  async savePriceHistories(userId, portfolioId, input) {
    return db.transaction(async (tx) => {
      const [ownedPortfolio] = await tx
        .select()
        .from(portfolio)
        .where(
          and(eq(portfolio.id, portfolioId), eq(portfolio.userId, userId)),
        );
      if (!ownedPortfolio) return { kind: 'not-found' as const };
      if (input.currency !== ownedPortfolio.currency)
        return { kind: 'currency-mismatch' as const };

      const currentHoldings = await tx
        .select({ ticker: portfolioHolding.ticker })
        .from(portfolioHolding)
        .where(eq(portfolioHolding.portfolioId, portfolioId));
      const heldTickers = new Set(currentHoldings.map(({ ticker }) => ticker));
      if (input.histories.some(({ ticker }) => !heldTickers.has(ticker))) {
        return { kind: 'unknown-ticker' as const };
      }

      const records: PortfolioPriceHistoryRecord[] = [];
      for (const history of input.histories) {
        const asOf = history.prices[history.prices.length - 1].date;
        const [row] = await tx
          .insert(portfolioPriceHistory)
          .values({
            portfolioId,
            ticker: history.ticker,
            currency: input.currency,
            source: input.source,
            adjustmentBasis: input.adjustmentBasis,
            observedAt: new Date(input.observedAt),
            asOf,
          })
          .onConflictDoUpdate({
            target: [
              portfolioPriceHistory.portfolioId,
              portfolioPriceHistory.ticker,
              portfolioPriceHistory.source,
            ],
            set: {
              currency: input.currency,
              adjustmentBasis: input.adjustmentBasis,
              observedAt: new Date(input.observedAt),
              asOf,
            },
          })
          .returning();
        await tx
          .delete(portfolioPricePoint)
          .where(eq(portfolioPricePoint.historyId, row.id));
        await tx.insert(portfolioPricePoint).values(
          history.prices.map(({ date, price }) => ({
            historyId: row.id,
            date,
            price,
          })),
        );
        records.push({
          ticker: history.ticker,
          currency: input.currency,
          source: input.source,
          adjustmentBasis: input.adjustmentBasis,
          observedAt: new Date(input.observedAt).toISOString(),
          asOf,
          prices: history.prices,
        });
      }
      return { kind: 'saved' as const, records };
    });
  },
};
