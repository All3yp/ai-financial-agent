import { z } from 'zod';

export const MINIMUM_RETURNS = 20;
export const RECOMMENDED_RETURNS = 250;
export const TRADING_DAYS_PER_YEAR = 252;

const tickerSchema = z.string().trim().min(1);
const positiveSchema = z.number().finite().positive();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === date;
}, 'Expected a real calendar date in YYYY-MM-DD format');

const positionSchema = z.object({
  ticker: tickerSchema,
  shares: positiveSchema,
  currentPrice: positiveSchema,
}).strict();

const historySchema = z.object({
  ticker: tickerSchema,
  prices: z.array(z.object({ date: dateSchema, price: positiveSchema }).strict()).min(1),
}).strict();

const inputSchema = z.object({
  positions: z.array(positionSchema).min(1),
  histories: z.array(historySchema).min(1),
  currency: z.string().trim().min(1),
  confidence: z.number().finite().gt(0).lt(1).default(0.95),
}).strict();

const scenarioSchema = z.object({
  name: z.string().trim().min(1),
  returns: z.record(z.string().min(1), z.number().finite().min(-1)),
}).strict();

export type Position = z.infer<typeof positionSchema>;
export type PriceHistory = z.infer<typeof historySchema>;
export type PortfolioRiskInput = z.input<typeof inputSchema>;
export type StressScenario = z.infer<typeof scenarioSchema>;

export interface CorrelationMatrix {
  tickers: string[];
  dates: string[];
  returnCount: number;
  matrix: (number | null)[][];
  warnings: string[];
}

export interface PortfolioRisk {
  currency: string;
  confidence: number;
  currentValue: number;
  dates: string[];
  historicalValues: number[];
  dailyReturns: number[];
  returnCount: number;
  valueAtRisk: { returnLoss: number; amount: number };
  conditionalValueAtRisk: { returnLoss: number; amount: number };
  annualizedVolatility: number;
  maxDrawdown: number;
  concentration: {
    weights: { ticker: string; value: number; weight: number }[];
    largestWeight: number;
    herfindahlIndex: number;
    effectiveHoldings: number;
  };
  warnings: string[];
}

export interface StressResult {
  name: string;
  currency: string;
  currentValue: number;
  stressedValue: number;
  profitLoss: number;
  portfolioReturn: number;
}

export interface PortfolioReport {
  phase: 'phase6-deterministic-risk-slice';
  risk: PortfolioRisk;
  correlations: CorrelationMatrix;
  stressTests: StressResult[];
  limitations: string[];
}

function finite(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Arithmetic exceeded finite numeric range');
  }
  return value;
}

function sum(values: number[]): number {
  return finite(values.reduce((total, value) => finite(total + value), 0));
}

function requireUnique(tickers: string[]): void {
  if (new Set(tickers).size !== tickers.length) {
    throw new Error('Duplicate tickers are not supported; aggregate positions first');
  }
}

function requireSameTickers(expected: string[], actual: string[]): void {
  if (expected.length !== actual.length || expected.some((ticker) => !actual.includes(ticker))) {
    throw new Error('Expected exactly one entry for every portfolio ticker and no extra tickers');
  }
}

function returnsFrom(values: number[]): number[] {
  return values.slice(1).map((value, index) => finite(value / values[index] - 1));
}

function alignHistories(histories: PriceHistory[]) {
  const parsed = z.array(historySchema).min(1).parse(histories);
  const tickers = parsed.map((history) => history.ticker);
  requireUnique(tickers);
  const priceMaps = parsed.map((history) => {
    const prices = new Map<string, number>();
    for (const observation of history.prices) {
      if (prices.has(observation.date)) {
        throw new Error(`Duplicate date ${observation.date} for ${history.ticker}`);
      }
      prices.set(observation.date, observation.price);
    }
    return prices;
  });
  const dates = [...priceMaps[0].keys()]
    .filter((date) => priceMaps.every((prices) => prices.has(date)))
    .sort();
  const returnCount = dates.length - 1;
  if (returnCount < MINIMUM_RETURNS) {
    throw new Error(`At least ${MINIMUM_RETURNS} aligned returns (${MINIMUM_RETURNS + 1} common price dates) are required`);
  }
  const warnings: string[] = [];
  if (returnCount < RECOMMENDED_RETURNS) {
    warnings.push(`Only ${returnCount} aligned returns; fewer than ${RECOMMENDED_RETURNS} observations makes tail estimates fragile.`);
  }
  if (parsed.some((history) => history.prices.length !== dates.length)) {
    warnings.push('Unmatched dates were discarded before computing returns; gaps may make some intervals longer than one trading day.');
  }
  const prices = priceMaps.map((priceMap) => dates.map((date) => priceMap.get(date)!));
  return { tickers, dates, prices, returnCount, warnings };
}

function currentPortfolio(positions: Position[]) {
  requireUnique(positions.map((position) => position.ticker));
  const values = positions.map((position) => finite(position.shares * position.currentPrice));
  const currentValue = sum(values);
  if (values.some((value) => value <= 0) || currentValue <= 0) {
    throw new Error('Position values must remain positive in numeric range');
  }
  return { values, currentValue };
}

function centeredValues(values: number[]): number[] {
  const shifted = values.map((value) => finite(value - values[0]));
  const shiftedMean = sum(shifted.map((value) => value / values.length));
  return shifted.map((value) => finite(value - shiftedMean));
}

function sampleVariance(values: number[]): number {
  return finite(sum(centeredValues(values).map((value) => finite(value ** 2))) / (values.length - 1));
}

function pearson(first: number[], second: number[]): number | null {
  const firstCentered = centeredValues(first);
  const secondCentered = centeredValues(second);
  const firstNorm = Math.sqrt(sum(firstCentered.map((value) => finite(value ** 2))));
  const secondNorm = Math.sqrt(sum(secondCentered.map((value) => finite(value ** 2))));
  if (firstNorm === 0 || secondNorm === 0) return null;
  const correlation = sum(firstCentered.map((value, index) =>
    finite((value / firstNorm) * (secondCentered[index] / secondNorm))));
  return Math.max(-1, Math.min(1, correlation));
}

export function calculateCorrelationMatrix(histories: PriceHistory[]): CorrelationMatrix {
  const aligned = alignHistories(histories);
  const returns = aligned.prices.map(returnsFrom);
  const matrix = returns.map((first) => returns.map((second) => pearson(first, second)));
  const warnings = [...aligned.warnings];
  if (matrix.some((row, index) => row[index] === null)) {
    warnings.push('Correlations involving a zero-variance return series are undefined and reported as null.');
  }
  return {
    tickers: aligned.tickers,
    dates: aligned.dates,
    returnCount: aligned.returnCount,
    matrix,
    warnings,
  };
}

export function calculatePortfolioRisk(input: PortfolioRiskInput): PortfolioRisk {
  const parsed = inputSchema.parse(input);
  const { positions, confidence, currency } = parsed;
  const { values, currentValue } = currentPortfolio(positions);
  requireSameTickers(positions.map((position) => position.ticker), parsed.histories.map((history) => history.ticker));
  const aligned = alignHistories(parsed.histories);
  const priceByTicker = new Map(aligned.tickers.map((ticker, index) => [ticker, aligned.prices[index]]));
  const historicalValues = aligned.dates.map((_, dateIndex) => {
    const value = sum(positions.map((position) => finite(position.shares * priceByTicker.get(position.ticker)![dateIndex])));
    if (value <= 0) throw new Error('Historical portfolio value must remain positive in numeric range');
    return value;
  });
  const dailyReturns = returnsFrom(historicalValues);
  const losses = dailyReturns.map((value) => -value).sort((first, second) => first - second);
  const varLoss = losses[Math.ceil(confidence * losses.length) - 1];
  const tailMass = finite((1 - confidence) * losses.length);
  let remaining = tailMass;
  let cvarLoss = 0;
  for (let index = losses.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const mass = Math.min(1, remaining);
    cvarLoss = finite(cvarLoss + finite(losses[index] * (mass / tailMass)));
    remaining -= mass;
  }
  let peak = historicalValues[0];
  let maxDrawdown = 0;
  for (const value of historicalValues) {
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, 1 - value / peak);
  }
  const weights = positions.map((position, index) => ({
    ticker: position.ticker,
    value: values[index],
    weight: finite(values[index] / currentValue),
  }));
  const herfindahlIndex = sum(weights.map((entry) => entry.weight ** 2));
  return {
    currency,
    confidence,
    currentValue,
    dates: aligned.dates,
    historicalValues,
    dailyReturns,
    returnCount: aligned.returnCount,
    valueAtRisk: { returnLoss: varLoss, amount: finite(varLoss * currentValue) },
    conditionalValueAtRisk: { returnLoss: cvarLoss, amount: finite(cvarLoss * currentValue) },
    annualizedVolatility: finite(Math.sqrt(sampleVariance(dailyReturns)) * Math.sqrt(TRADING_DAYS_PER_YEAR)),
    maxDrawdown,
    concentration: {
      weights,
      largestWeight: Math.max(...weights.map((entry) => entry.weight)),
      herfindahlIndex,
      effectiveHoldings: finite(1 / herfindahlIndex),
    },
    warnings: aligned.warnings,
  };
}

export function stressTestPortfolio(
  positions: Position[],
  scenarios: StressScenario[],
  currency: string,
): StressResult[] {
  const parsedPositions = z.array(positionSchema).min(1).parse(positions);
  const parsedScenarios = z.array(scenarioSchema).parse(scenarios);
  const parsedCurrency = z.string().trim().min(1).parse(currency);
  const { values, currentValue } = currentPortfolio(parsedPositions);
  const tickers = parsedPositions.map((position) => position.ticker);
  return parsedScenarios.map((scenario) => {
    requireSameTickers(tickers, Object.keys(scenario.returns));
    const stressedValue = sum(values.map((value, index) => finite(value * (1 + scenario.returns[tickers[index]]))));
    const profitLoss = finite(stressedValue - currentValue);
    return {
      name: scenario.name,
      currency: parsedCurrency,
      currentValue,
      stressedValue,
      profitLoss,
      portfolioReturn: finite(profitLoss / currentValue),
    };
  });
}

export function generatePortfolioReport(
  input: PortfolioRiskInput,
  scenarios: StressScenario[] = [],
): PortfolioReport {
  const parsed = inputSchema.parse(input);
  return {
    phase: 'phase6-deterministic-risk-slice',
    risk: calculatePortfolioRisk(parsed),
    correlations: calculateCorrelationMatrix(parsed.histories),
    stressTests: stressTestPortfolio(parsed.positions, scenarios, parsed.currency),
    limitations: [
      'Historical descriptive estimates, not forecasts or guarantees; one-day interpretation assumes consecutive aligned trading sessions.',
      'Fixed shares, no rebalancing, cash flows, fees, taxes, dividends, or FX conversion; all prices must use the caller-specified currency and consistent adjustment basis.',
      'Current holdings are valued across supplied history; this is not the realized performance of past holdings.',
      'Caller-supplied stress shocks only; no built-in historical crisis reconstruction.',
      'No optimization, PCA, factor or causal attribution, recommendations, or LLM-generated calculations.',
    ],
  };
}