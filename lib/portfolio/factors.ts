import { EigenvalueDecomposition, Matrix, SingularValueDecomposition } from 'ml-matrix';
import { z } from 'zod';

const finiteNumber = z.number().finite();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}, 'Expected a real calendar date in YYYY-MM-DD format');
const historySchema = z.object({
  ticker: z.string().trim().min(1),
  prices: z.array(z.object({ date: dateSchema, price: finiteNumber.positive() }).strict()).min(21).max(501),
}).strict();

export const portfolioFactorsInputSchema = z.object({
  histories: z.array(historySchema).min(2).max(10),
  factorHistories: z.array(historySchema).min(1).max(5).optional(),
  portfolioWeights: z.record(z.string().min(1), finiteNumber.min(0).max(1)).optional(),
  periodsPerYear: finiteNumber.positive().max(366).default(252),
}).strict().superRefine((input, context) => {
  const fail = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  for (const histories of [input.histories, input.factorHistories ?? []]) {
    if (new Set(histories.map(({ ticker }) => ticker)).size !== histories.length) fail('Duplicate tickers');
  }
  const dates = new Set(input.histories[0].prices.map(({ date }) => date));
  for (const history of [...input.histories, ...(input.factorHistories ?? [])]) {
    const ownDates = new Set(history.prices.map(({ date }) => date));
    if (ownDates.size !== history.prices.length) fail(`Duplicate dates for ${history.ticker}`);
    if (ownDates.size !== dates.size || [...ownDates].some((date) => !dates.has(date))) {
      fail('All histories must have exactly aligned dates; no observations are discarded');
    }
  }
  const weights = input.portfolioWeights;
  if (input.factorHistories && !weights) fail('Explicit factor regression requires portfolioWeights');
  if (weights) {
    const keys = Object.keys(weights);
    if (keys.length !== input.histories.length || input.histories.some(({ ticker }) => !Object.hasOwn(weights, ticker))) {
      fail('portfolioWeights must contain exactly every portfolio ticker');
    }
    const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    if (!Number.isFinite(total) || Math.abs(total - 1) > 1e-12) fail('portfolioWeights must sum to 1');
  }
});

export type PortfolioFactorsInput = z.input<typeof portfolioFactorsInputSchema>;

export interface PortfolioFactorsResult {
  tickers: string[];
  dates: string[];
  returnDates: string[];
  returnCount: number;
  periodsPerYear: number;
  covariance: number[][];
  components: {
    eigenvalue: number;
    explainedVariance: number;
    loadings: Record<string, number>;
  }[];
  portfolio?: {
    model: 'static-weights-daily-rebalanced';
    weights: Record<string, number>;
    dailyReturns: number[];
  };
  regression?: {
    factorNames: string[];
    betas: Record<string, number>;
    interceptDaily: number;
    residualAnnualizedVolatility: number;
    residualDegreesOfFreedom: number;
    rSquared: number;
  };
  methodology: {
    pca: 'sample-covariance-symmetric-EVD';
    regression: 'intercept-OLS-SVD' | null;
    residualVariance: 'sum-squared-residuals / (returnCount - factorCount - 1)';
  };
  limitations: string[];
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Arithmetic exceeded finite numeric range');
  return value;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => finite(total + finite(value)), 0);
}

function mean(values: number[]): number {
  return sum(values.map((value) => finite(value / values.length)));
}

function centered(values: number[]): number[] {
  const shifted = values.map((value) => finite(value - values[0]));
  const average = mean(shifted);
  return shifted.map((value) => finite(value - average));
}

function series(histories: z.infer<typeof historySchema>[]) {
  return [...histories].sort((first, second) => first.ticker < second.ticker ? -1 : first.ticker > second.ticker ? 1 : 0)
    .map((history) => {
      const observations = [...history.prices].sort((first, second) => first.date < second.date ? -1 : first.date > second.date ? 1 : 0);
      return {
        ticker: history.ticker,
        dates: observations.map(({ date }) => date),
        returns: observations.slice(1).map(({ price }, index) => finite(price / observations[index].price - 1)),
      };
    });
}

export function analyzePortfolioFactors(input: PortfolioFactorsInput): PortfolioFactorsResult {
  const parsed = portfolioFactorsInputSchema.parse(input);
  const assets = series(parsed.histories);
  const tickers = assets.map(({ ticker }) => ticker);
  const returnCount = assets[0].returns.length;
  const deviations = assets.map(({ returns }) => centered(returns));
  const covariance = deviations.map(() => Array<number>(assets.length).fill(0));
  for (let row = 0; row < assets.length; row += 1) {
    for (let column = row; column < assets.length; column += 1) {
      const value = finite(sum(deviations[row].map((deviation, index) =>
        finite(deviation * deviations[column][index]))) / (returnCount - 1));
      covariance[row][column] = value;
      covariance[column][row] = value;
    }
  }
  const trace = sum(covariance.map((row, index) => row[index]));
  if (trace <= 0) throw new Error('All-zero covariance: PCA explained variance is undefined');
  const decomposition = new EigenvalueDecomposition(new Matrix(covariance), { assumeSymmetric: true });
  const eigenvectors = decomposition.eigenvectorMatrix;
  const tolerance = finite(trace * Number.EPSILON * assets.length * 100);
  const eigenpairs = decomposition.realEigenvalues.map((raw, index) => {
    finite(raw);
    if (raw < -tolerance) throw new Error('Substantive negative covariance eigenvalue');
    return { eigenvalue: Math.max(0, raw), index };
  }).sort((first, second) => second.eigenvalue - first.eigenvalue || first.index - second.index);
  const totalVariance = sum(eigenpairs.map(({ eigenvalue }) => eigenvalue));
  if (totalVariance <= 0) throw new Error('All-zero eigenvalues: PCA explained variance is undefined');
  const components = eigenpairs.map(({ eigenvalue, index }) => {
    const vector = tickers.map((_, row) => finite(eigenvectors.get(row, index)));
    let pivot = 0;
    for (let row = 1; row < vector.length; row += 1) {
      if (Math.abs(vector[row]) > Math.abs(vector[pivot]) + 1e-14) pivot = row;
    }
    const sign = vector[pivot] < 0 ? -1 : 1;
    return {
      eigenvalue,
      explainedVariance: finite(eigenvalue / totalVariance),
      loadings: Object.fromEntries(tickers.map((ticker, row) => [ticker, vector[row] * sign])),
    };
  });
  const result: PortfolioFactorsResult = {
    tickers,
    dates: assets[0].dates,
    returnDates: assets[0].dates.slice(1),
    returnCount,
    periodsPerYear: parsed.periodsPerYear,
    covariance,
    components,
    methodology: {
      pca: 'sample-covariance-symmetric-EVD',
      regression: parsed.factorHistories ? 'intercept-OLS-SVD' : null,
      residualVariance: 'sum-squared-residuals / (returnCount - factorCount - 1)',
    },
    limitations: [
      'Historical simple returns only; no external data or forecasts.',
      'Observations are assumed daily trading intervals; calendar gaps are not filled or rescaled.',
      'PCA loadings are covariance eigenvectors, not named economic factors; repeated eigenvalues do not identify unique axes.',
      'Static weights model daily rebalancing, not actual fixed-share holdings; these exposures must not be attached to a fixed-share risk report as the same model.',
      'Caller-named factor regressions describe associations, not causal attribution.',
    ],
  };
  if (parsed.portfolioWeights) {
    const weights = Object.fromEntries(tickers.map((ticker) => [ticker, parsed.portfolioWeights![ticker]]));
    const dailyReturns = assets[0].returns.map((_, index) =>
      sum(assets.map(({ ticker, returns }) => finite(weights[ticker] * returns[index]))));
    result.portfolio = { model: 'static-weights-daily-rebalanced', weights, dailyReturns };
  }
  if (parsed.factorHistories) {
    const factors = series(parsed.factorHistories);
    const factorDeviations = factors.map(({ returns }) => centered(returns));
    const scales = factorDeviations.map((values) => Math.sqrt(sum(values.map((value) => finite(value * value))) / returnCount));
    if (scales.some((scale) => scale === 0)) throw new Error('Rank deficient factors: constant return series');
    const design = new Matrix(assets[0].returns.map((_, index) =>
      [1, ...factorDeviations.map((values, column) => finite(values[index] / scales[column]))]));
    const svd = new SingularValueDecomposition(design);
    const singularValues = svd.diagonal.map(finite);
    const rankTolerance = finite(singularValues[0] * Math.max(design.rows, design.columns) * 1e-12);
    if (svd.rank !== design.columns || singularValues.some((value) => value <= rankTolerance)) {
      throw new Error('Rank deficient factors: intercept and factors must be linearly independent');
    }
    const response = result.portfolio!.dailyReturns;
    const coefficients = svd.solve(Matrix.columnVector(response)).to1DArray().map(finite);
    const slopes = factors.map((_, index) => finite(coefficients[index + 1] / scales[index]));
    const interceptDaily = finite(coefficients[0] - sum(factors.map(({ returns }, index) => finite(slopes[index] * mean(returns)))));
    const residuals = response.map((value, row) => finite(value - sum(coefficients.map((coefficient, column) =>
      finite(coefficient * design.get(row, column))))));
    const residualSquares = sum(residuals.map((value) => finite(value * value)));
    const totalSquares = sum(centered(response).map((value) => finite(value * value)));
    if (totalSquares <= 0) throw new Error('Zero-variance portfolio: regression R2 is undefined');
    const residualDegreesOfFreedom = returnCount - factors.length - 1;
    result.regression = {
      factorNames: factors.map(({ ticker }) => ticker),
      betas: Object.fromEntries(factors.map(({ ticker }, index) => [ticker, slopes[index]])),
      interceptDaily,
      residualAnnualizedVolatility: finite(Math.sqrt(finite(residualSquares / residualDegreesOfFreedom * parsed.periodsPerYear))),
      residualDegreesOfFreedom,
      rSquared: Math.max(0, Math.min(1, finite(1 - finite(residualSquares / totalSquares)))),
    };
  }
  return result;
}