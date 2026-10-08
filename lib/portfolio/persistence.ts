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
const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((timezone) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  });

export const portfolioInputSchema = z
  .object({
    name: nameSchema,
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/),
    monitoringEnabled: z.boolean().default(false),
    monitoringFrequency: z
      .enum(['daily', 'weekly', 'monthly'])
      .default('daily'),
    monitoringTime: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/)
      .default('09:00'),
    monitoringTimezone: timezoneSchema.default('UTC'),
    monitoringDayOfWeek: z.number().int().min(0).max(6).default(1),
    monitoringDayOfMonth: z.number().int().min(1).max(28).default(1),
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

export const priceProvenanceSchema = z
  .object({
    source: z.enum([
      'financial-datasets',
      'fmp',
      'alpha-vantage',
      'twelve-data',
      'user-provided',
    ]),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/),
    adjustmentBasis: z.enum([
      'unadjusted',
      'split-adjusted',
      'total-return',
      'unknown',
    ]),
    observedAt: z.string().datetime(),
  })
  .strict();

const priceSchema = z.number().finite().positive();
const realDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

export const holdingSnapshotInputSchema = priceProvenanceSchema
  .extend({
    asOf: realDateSchema,
    prices: z
      .array(z.object({ ticker: tickerSchema, price: priceSchema }).strict())
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const tickers = value.prices.map(({ ticker }) => ticker);
    if (new Set(tickers).size !== tickers.length) {
      context.addIssue({
        code: 'custom',
        message: 'Duplicate snapshot ticker.',
      });
    }
  });

export const priceHistoryInputSchema = priceProvenanceSchema
  .extend({
    histories: z
      .array(
        z
          .object({
            ticker: tickerSchema,
            prices: z
              .array(
                z.object({ date: realDateSchema, price: priceSchema }).strict(),
              )
              .min(1)
              .max(251),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .superRefine((value, context) => {
    const tickers = value.histories.map(({ ticker }) => ticker);
    if (new Set(tickers).size !== tickers.length) {
      context.addIssue({
        code: 'custom',
        message: 'Duplicate history ticker.',
      });
    }
    for (const history of value.histories) {
      const dates = history.prices.map(({ date }) => date);
      if (
        new Set(dates).size !== dates.length ||
        dates.some((date, index) => index > 0 && date <= dates[index - 1])
      ) {
        context.addIssue({
          code: 'custom',
          message: 'History dates must be unique and ascending.',
        });
      }
    }
  });

export const MAX_CAPTURE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_CAPTURE_FUTURE_SKEW_MS = 5 * 60 * 1000;

export function isFreshPriceCapture(
  observedAt: string,
  asOf: string,
  now = new Date(),
): boolean {
  const observedTime = Date.parse(observedAt);
  const asOfTime = Date.parse(`${asOf}T00:00:00.000Z`);
  const nowTime = now.getTime();
  return (
    Number.isFinite(observedTime) &&
    Number.isFinite(asOfTime) &&
    observedTime <= nowTime + MAX_CAPTURE_FUTURE_SKEW_MS &&
    observedTime >= nowTime - MAX_CAPTURE_AGE_MS &&
    asOfTime <= nowTime &&
    nowTime - asOfTime <= MAX_CAPTURE_AGE_MS &&
    asOf <= new Date(Math.min(observedTime, nowTime)).toISOString().slice(0, 10)
  );
}

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

export type ScheduledMonitoringPortfolio = {
  portfolioId: string;
  userId: string;
  currency: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  timezone: string;
  dayOfWeek: number;
  dayOfMonth: number;
  positions: Array<{
    ticker: string;
    shares: number;
    costBasis?: number;
  }>;
};

export type HoldingSnapshotInput = z.infer<typeof holdingSnapshotInputSchema>;
export type PriceHistoryInput = z.infer<typeof priceHistoryInputSchema>;

export type PortfolioSnapshotRecord = {
  id: string;
  capturedAt: string;
  source: HoldingSnapshotInput['source'];
  currency: string;
  adjustmentBasis: HoldingSnapshotInput['adjustmentBasis'];
  observedAt: string;
  asOf: string;
  holdings: Array<{
    ticker: string;
    shares: number;
    costBasis: number | null;
    price: number;
  }>;
};

export type PortfolioPriceHistoryRecord = {
  ticker: string;
  currency: string;
  source: PriceHistoryInput['source'];
  adjustmentBasis: PriceHistoryInput['adjustmentBasis'];
  observedAt: string;
  asOf: string;
  prices: Array<{ date: string; price: number }>;
};

export interface PortfolioCaptureRepository {
  listSnapshots(
    userId: string,
    portfolioId: string,
    cursor?: { createdAt: string; id: string },
  ): Promise<{
    records: PortfolioSnapshotRecord[];
    nextCursor: { createdAt: string; id: string } | null;
  } | null>;
  createSnapshot(
    userId: string,
    portfolioId: string,
    input: HoldingSnapshotInput,
  ): Promise<
    | { kind: 'not-found' | 'holdings-mismatch' | 'currency-mismatch' }
    | { kind: 'created'; record: PortfolioSnapshotRecord }
  >;
  listPriceHistories(
    userId: string,
    portfolioId: string,
  ): Promise<PortfolioPriceHistoryRecord[] | null>;
  savePriceHistories(
    userId: string,
    portfolioId: string,
    input: PriceHistoryInput,
  ): Promise<
    | { kind: 'not-found' | 'currency-mismatch' | 'unknown-ticker' }
    | { kind: 'saved'; records: PortfolioPriceHistoryRecord[] }
  >;
}

export interface PortfolioRepository {
  listPortfolios(userId: string): Promise<PortfolioRecord[]>;
  listEnabledPortfoliosForMonitoring(): Promise<ScheduledMonitoringPortfolio[]>;
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
