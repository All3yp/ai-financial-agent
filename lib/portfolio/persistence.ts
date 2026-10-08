import { z } from 'zod';

const nameSchema = z.string().trim().min(1).max(100);
const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9.^=-]{1,20}$/);
const holdingSchema = z
  .object({
    ticker: tickerSchema,
    shares: z.number().finite().positive(),
    costBasis: z.number().finite().nonnegative().nullable().optional(),
  })
  .strict();

export const portfolioInputSchema = z
  .object({
    name: nameSchema,
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/),
    holdings: z.array(holdingSchema).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const tickers = value.holdings.map(({ ticker }) => ticker);
    if (new Set(tickers).size !== tickers.length) {
      context.addIssue({
        code: 'custom',
        message: 'Duplicate portfolio ticker.',
      });
    }
  });

export const watchlistInputSchema = z
  .object({
    name: nameSchema,
    tickers: z.array(tickerSchema).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.tickers).size !== value.tickers.length) {
      context.addIssue({
        code: 'custom',
        message: 'Duplicate watchlist ticker.',
      });
    }
  });

export const portfolioBundleSchema = z
  .object({
    version: z.literal(1),
    exportedAt: z.string().datetime().optional(),
    portfolios: z.array(portfolioInputSchema).max(50),
    watchlists: z.array(watchlistInputSchema).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    for (const collection of [value.portfolios, value.watchlists]) {
      const names = collection.map(({ name }) =>
        name.toLocaleLowerCase('en-US'),
      );
      if (new Set(names).size !== names.length) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate collection name.',
        });
        return;
      }
    }
  });

export type PortfolioInput = z.infer<typeof portfolioInputSchema>;
export type WatchlistInput = z.infer<typeof watchlistInputSchema>;
export type PortfolioBundle = z.infer<typeof portfolioBundleSchema>;

export type PortfolioRecord = PortfolioInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type WatchlistRecord = WatchlistInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type PortfolioExport = {
  version: 1;
  exportedAt: string;
  portfolios: PortfolioInput[];
  watchlists: WatchlistInput[];
};

export interface PortfolioRepository {
  listPortfolios(userId: string): Promise<PortfolioRecord[]>;
  getPortfolio(userId: string, id: string): Promise<PortfolioRecord | null>;
  createPortfolio(
    userId: string,
    input: PortfolioInput,
  ): Promise<PortfolioRecord>;
  updatePortfolio(
    userId: string,
    id: string,
    input: PortfolioInput,
  ): Promise<PortfolioRecord | null>;
  deletePortfolio(userId: string, id: string): Promise<boolean>;
  listWatchlists(userId: string): Promise<WatchlistRecord[]>;
  getWatchlist(userId: string, id: string): Promise<WatchlistRecord | null>;
  createWatchlist(
    userId: string,
    input: WatchlistInput,
  ): Promise<WatchlistRecord>;
  updateWatchlist(
    userId: string,
    id: string,
    input: WatchlistInput,
  ): Promise<WatchlistRecord | null>;
  deleteWatchlist(userId: string, id: string): Promise<boolean>;
  importBundle(userId: string, bundle: PortfolioBundle): Promise<void>;
}
