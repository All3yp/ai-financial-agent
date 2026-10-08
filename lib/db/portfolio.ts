import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from './queries';
import {
  portfolio,
  portfolioHolding,
  watchlist,
  watchlistTicker,
} from './schema';
import type {
  PortfolioRecord,
  PortfolioRepository,
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

export const portfolioRepository: PortfolioRepository = {
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

  async importBundle(userId, bundle) {
    await db.transaction(async (tx) => {
      for (const input of bundle.portfolios) {
        const [row] = await tx
          .insert(portfolio)
          .values({
            userId,
            name: input.name,
            currency: input.currency,
          })
          .onConflictDoUpdate({
            target: [portfolio.userId, portfolio.name],
            set: { currency: input.currency, updatedAt: new Date() },
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
};
