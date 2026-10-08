import { z } from 'zod';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === date;
}, 'Expected a real calendar date in YYYY-MM-DD format');
const tickerSchema = z.string().trim().min(1).max(40).transform((ticker) => ticker.toUpperCase());
const windowSchema = z.number().int().min(1).max(500);
const historySchema = z.object({
  ticker: tickerSchema,
  prices: z.array(z.object({
    date: dateSchema,
    price: z.number().finite().positive(),
  }).strict()).min(1).max(501),
}).strict().superRefine((history, context) => {
  if (new Set(history.prices.map((point) => point.date)).size !== history.prices.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['prices'], message: 'Dates must be unique within each history' });
  }
});

export const marketAnalysisInputSchema = z.object({
  histories: z.array(historySchema).min(2).max(12),
  marketTicker: tickerSchema,
  sectorTickers: z.array(tickerSchema).min(1).max(11),
  priceBasis: z.enum(['TOTAL_RETURN', 'ADJUSTED_PRICE']),
  asOf: dateSchema,
  horizons: z.array(windowSchema).min(1).max(12).default([20, 60, 200]),
  config: z.object({
    regimeWindow: windowSchema.default(200),
    volatilityWindow: z.number().int().min(2).max(500).default(20),
    trendThreshold: z.number().finite().min(0).max(1).default(0.02),
    annualizationFactor: z.number().finite().positive().max(366).default(252),
    volatileThreshold: z.number().finite().positive().default(0.25),
    crisisThreshold: z.number().finite().positive().default(0.6),
  }).strict().default({}),
}).strict().superRefine((input, context) => {
  const tickers = input.histories.map((history) => history.ticker);
  const selected = [input.marketTicker, ...input.sectorTickers];
  if (new Set(tickers).size !== tickers.length || new Set(selected).size !== selected.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'History and selected tickers must be unique; market cannot also be a sector' });
  }
  if (tickers.length !== selected.length || selected.some((ticker) => !tickers.includes(ticker))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['histories'], message: 'Supply exactly one history for each selected ticker, with no extra histories' });
  }
  if (new Set(input.horizons).size !== input.horizons.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['horizons'], message: 'Momentum horizons must be unique' });
  }
  if (input.config.crisisThreshold <= input.config.volatileThreshold) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['config', 'crisisThreshold'], message: 'Crisis threshold must exceed volatile threshold' });
  }
});

export type MarketAnalysisInput = z.input<typeof marketAnalysisInputSchema>;
export type MarketAnalysisConfig = z.output<typeof marketAnalysisInputSchema>['config'];
export type MarketRegime = 'BULL_TRENDING' | 'BULL_VOLATILE' | 'BEAR_TRENDING'
  | 'BEAR_VOLATILE' | 'SIDEWAYS' | 'CRISIS';

export interface MomentumIndicator {
  horizon: number;
  startDate: string;
  endDate: string;
  totalReturn: number;
}

export interface MarketAnalysis {
  requestedAsOf: string;
  asOf: string;
  priceBasis: 'TOTAL_RETURN' | 'ADJUSTED_PRICE';
  config: MarketAnalysisConfig;
  regime: MarketRegime;
  direction: 'bullish' | 'bearish' | 'sideways';
  indicators: {
    marketTicker: string;
    momentum: MomentumIndicator[];
    trend: MomentumIndicator;
    annualizedRealizedVolatility: number;
    volatility: { window: number; startDate: string; endDate: string; returnCount: number };
  };
  alignment: { dates: string[]; observationCount: number; discardedDates: { ticker: string; count: number }[] };
  sectorRankings: {
    horizon: number;
    startDate: string;
    endDate: string;
    entries: { ticker: string; rank: number; totalReturn: number; excessReturnVsMarket: number }[];
  }[];
  warnings: string[];
  limitations: string[];
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Arithmetic exceeded finite numeric range');
  return value;
}

function priceReturn(last: number, first: number): number {
  const ratio = finite(last / first);
  if (ratio === 0) throw new Error('Price ratio underflowed numeric range');
  return finite(ratio - 1);
}

function realizedVolatility(prices: number[], annualizationFactor: number): number {
  const returns = prices.slice(1).map((price, index) => priceReturn(price, prices[index]));
  const shifted = returns.map((value) => finite(value - returns[0]));
  const mean = shifted.reduce((total, value) => finite(total + value / returns.length), 0);
  const squaredDeviations = shifted.map((value) => finite(finite(value - mean) ** 2));
  const variance = squaredDeviations.reduce((total, value) => finite(total + value / (returns.length - 1)), 0);
  return finite(Math.sqrt(variance) * Math.sqrt(annualizationFactor));
}

export function analyzeMarket(input: unknown): MarketAnalysis {
  const parsed = marketAnalysisInputSchema.parse(input);
  const { marketTicker, sectorTickers, config } = parsed;
  const tickers = [marketTicker, ...[...sectorTickers].sort()];
  const histories = new Map(parsed.histories.map((history) => [history.ticker, history]));
  const maps = tickers.map((ticker) => new Map(histories.get(ticker)!.prices
    .filter((point) => point.date <= parsed.asOf).map((point) => [point.date, point.price])));
  const dates = [...maps[0].keys()].filter((date) => maps.every((prices) => prices.has(date))).sort();
  const horizons = [...parsed.horizons].sort((first, second) => first - second);
  const requiredWindow = Math.max(config.regimeWindow, config.volatilityWindow, ...horizons);
  if (dates.length < requiredWindow + 1) {
    throw new Error(`At least ${requiredWindow + 1} common price dates are required; received ${dates.length}`);
  }
  const asOf = dates[dates.length - 1];
  const prices = maps.map((priceMap) => dates.map((date) => priceMap.get(date)!));
  const momentum = (values: number[], horizon: number): MomentumIndicator => ({
    horizon,
    startDate: dates[dates.length - 1 - horizon],
    endDate: asOf,
    totalReturn: priceReturn(values[values.length - 1], values[values.length - 1 - horizon]),
  });
  const trend = momentum(prices[0], config.regimeWindow);
  const direction = trend.totalReturn > config.trendThreshold ? 'bullish'
    : trend.totalReturn < -config.trendThreshold ? 'bearish' : 'sideways';
  const annualizedRealizedVolatility = realizedVolatility(prices[0].slice(-config.volatilityWindow - 1), config.annualizationFactor);
  const volatile = annualizedRealizedVolatility >= config.volatileThreshold;
  const regime: MarketRegime = annualizedRealizedVolatility >= config.crisisThreshold ? 'CRISIS'
    : direction === 'sideways' ? 'SIDEWAYS'
      : direction === 'bullish' ? (volatile ? 'BULL_VOLATILE' : 'BULL_TRENDING')
        : volatile ? 'BEAR_VOLATILE' : 'BEAR_TRENDING';
  const discardedDates = tickers.map((ticker, index) => ({ ticker, count: maps[index].size - dates.length }));
  const warnings: string[] = [];
  if (discardedDates.some((entry) => entry.count > 0)) {
    warnings.push('Unmatched dates were discarded before all indicators and sector ranks; windows count common observations, not calendar days. Gaps can bias fixed-factor annualization.');
  }
  if (parsed.histories.some((history) => history.prices.some((point) => point.date > parsed.asOf))) {
    warnings.push('Observations after requested asOf were excluded.');
  }
  if (asOf !== parsed.asOf) warnings.push(`Latest common date is ${asOf}, earlier than requested asOf ${parsed.asOf}.`);
  if (parsed.priceBasis === 'ADJUSTED_PRICE') {
    warnings.push('Adjusted prices are treated as caller-certified consistent histories; dividend reinvestment is not inferred or verified.');
  }
  if (direction === 'sideways' && volatile && regime !== 'CRISIS') {
    warnings.push('Market momentum is sideways despite elevated realized volatility.');
  }
  return {
    requestedAsOf: parsed.asOf,
    asOf,
    priceBasis: parsed.priceBasis,
    config,
    regime,
    direction,
    indicators: {
      marketTicker,
      momentum: horizons.map((horizon) => momentum(prices[0], horizon)),
      trend,
      annualizedRealizedVolatility,
      volatility: {
        window: config.volatilityWindow,
        startDate: dates[dates.length - 1 - config.volatilityWindow],
        endDate: asOf,
        returnCount: config.volatilityWindow,
      },
    },
    alignment: { dates, observationCount: dates.length, discardedDates },
    sectorRankings: horizons.map((horizon) => {
      const market = momentum(prices[0], horizon);
      const entries = tickers.slice(1).map((ticker, index) => {
        const totalReturn = momentum(prices[index + 1], horizon).totalReturn;
        return { ticker, rank: 0, totalReturn, excessReturnVsMarket: finite(totalReturn - market.totalReturn) };
      }).sort((first, second) => {
        if (first.totalReturn !== second.totalReturn) return first.totalReturn > second.totalReturn ? -1 : 1;
        return first.ticker < second.ticker ? -1 : first.ticker > second.ticker ? 1 : 0;
      });
      for (let index = 0; index < entries.length; index += 1) {
        entries[index].rank = index > 0 && entries[index].totalReturn === entries[index - 1].totalReturn
          ? entries[index - 1].rank : index + 1;
      }
      return { horizon, startDate: market.startDate, endDate: asOf, entries };
    }),
    warnings,
    limitations: [
      'Historical descriptive indicators only: no forecasts, allocation recommendations, or optimization.',
      'Caller chooses market and sector ETFs or benchmarks; tickers do not establish sector membership or economic rotation.',
      'Caller must supply consistent total-return or adjusted-price histories on a comparable currency and adjustment basis; this cannot be verified from prices alone.',
      'Momentum is endpoint price return over common observations; it is total return only when the supplied basis captures distributions.',
      'Volatility is sample standard deviation of simple observation returns times the square root of the configured annualization factor; regular trading-session spacing is assumed, not verified.',
      'Regime labels are configurable historical momentum and volatility heuristics, not validated economic states or crisis predictions.',
      'Date intersection discards unmatched observations without filling; sector history availability can change market indicators and their effective asOf.',
    ],
  };
}