import { covariance, Matrix } from 'ml-matrix';
import { z } from 'zod';

const finiteNumber = z.number().finite();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === date;
}, 'Expected a real calendar date in YYYY-MM-DD format');

export const portfolioOptimizationInputSchema = z.object({
  histories: z.array(z.object({
    ticker: z.string().trim().min(1).max(64),
    prices: z.array(z.object({
      date: dateSchema,
      price: finiteNumber.positive(),
    }).strict()).min(21).max(501),
  }).strict()).min(1).max(10),
  method: z.enum(['minimum-variance', 'risk-parity', 'hrp']),
  maxWeight: finiteNumber.positive().max(1).optional(),
  shrinkage: finiteNumber.min(0).max(1).default(0.1),
  ridge: finiteNumber.min(0).default(1e-10),
  periodsPerYear: finiteNumber.positive().max(366).default(252),
  tolerance: finiteNumber.min(1e-12).max(1e-4).default(1e-8),
  maxIterations: finiteNumber.int().min(1).max(100_000).default(10_000),
}).strict();

export type PortfolioOptimizationInput = z.input<typeof portfolioOptimizationInputSchema>;
export type OptimizationMethod = PortfolioOptimizationInput['method'];

export interface PortfolioOptimizationResult {
  method: OptimizationMethod;
  weights: Record<string, number>;
  dates: string[];
  returnCount: number;
  estimatedAnnualizedVolatility: number;
  covariance: {
    tickers: string[];
    sample: number[][];
    adjusted: number[][];
    shrinkage: number;
    ridge: number;
  };
  constraints: { longOnly: true; fullyInvested: true; maxWeight: number };
  convergence: {
    converged: true;
    iterations: number;
    residual: number;
    tolerance: number;
    criterion: string;
  };
  provenance: {
    scope: 'local-historical-optimization-subset';
    algorithm: string;
    covarianceEstimator: string;
    library: 'ml-matrix';
    periodsPerYear: number;
  };
  hrp?: {
    leafOrder: string[];
    merges: { left: string[]; right: string[]; distance: number }[];
    correlation: number[][];
    distance: number[][];
  };
  warnings: string[];
  limitations: string[];
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Arithmetic exceeded finite numeric range');
  return value;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => finite(total + value), 0);
}

function multiply(matrix: Matrix, weights: number[]): number[] {
  return matrix.mmul(Matrix.columnVector(weights)).to1DArray().map(finite);
}

function variance(matrix: Matrix, weights: number[]): number {
  const marginal = multiply(matrix, weights);
  return finite(sum(weights.map((weight, index) => finite(weight * marginal[index]))));
}

function project(values: number[], cap: number): number[] {
  if (cap === 1 / values.length) return values.map(() => cap);
  let lower = Math.min(...values.map((value) => value - cap));
  let upper = Math.max(...values);
  for (let iteration = 0; iteration < 100; iteration++) {
    const threshold = lower + (upper - lower) / 2;
    const total = sum(values.map((value) => Math.min(cap, Math.max(0, value - threshold))));
    if (total > 1) lower = threshold;
    else upper = threshold;
  }
  const threshold = lower + (upper - lower) / 2;
  const projected = values.map((value) => Math.min(cap, Math.max(0, value - threshold)));
  let remainder = 1 - sum(projected);
  for (let index = 0; index < projected.length; index++) {
    const correction = Math.max(-projected[index], Math.min(cap - projected[index], remainder));
    projected[index] += correction;
    remainder -= correction;
  }
  return projected;
}

function minimumVariance(matrix: Matrix, cap: number, tolerance: number, maxIterations: number) {
  const size = matrix.rows;
  const lipschitz = Math.max(...matrix.to2DArray().map((row) => sum(row.map(Math.abs))));
  const step = 1 / lipschitz;
  let weights = Array<number>(size).fill(1 / size);
  for (let iterations = 1; iterations <= maxIterations; iterations++) {
    const gradient = multiply(matrix, weights);
    const next = project(weights.map((weight, index) => finite(weight - step * gradient[index])), cap);
    const residual = Math.max(...next.map((weight, index) => Math.abs(weight - weights[index]))) / step;
    if (residual <= tolerance) {
      return { weights: next, iterations, residual, criterion: 'scaled projected-gradient infinity norm' };
    }
    weights = next;
  }
  throw new Error('Minimum-variance optimization did not converge within maxIterations');
}

function riskParity(matrix: Matrix, tolerance: number, maxIterations: number) {
  const size = matrix.rows;
  const budget = 1 / size;
  const allocation = Array<number>(size).fill(1 / Math.sqrt(size));
  for (let iterations = 1; iterations <= maxIterations; iterations++) {
    for (let index = 0; index < size; index++) {
      const diagonal = matrix.get(index, index);
      const cross = sum(allocation.map((weight, other) => other === index
        ? 0 : finite(matrix.get(index, other) * weight)));
      const root = finite(Math.hypot(cross, 2 * Math.sqrt(diagonal * budget)));
      allocation[index] = finite(cross >= 0
        ? (2 * budget) / (cross + root)
        : (root - cross) / (2 * diagonal));
      if (allocation[index] <= 0) throw new Error('Risk-parity allocation lost numeric positivity');
    }
    const total = sum(allocation);
    const weights = allocation.map((weight) => finite(weight / total));
    const marginal = multiply(matrix, weights);
    const totalVariance = variance(matrix, weights);
    if (totalVariance <= 0) throw new Error('Risk parity requires positive portfolio variance');
    const residual = Math.max(...weights.map((weight, index) =>
      Math.abs(finite(weight * marginal[index] / totalVariance) - budget)));
    if (residual <= tolerance) {
      return { weights, iterations, residual, criterion: 'maximum absolute equal-risk contribution share error' };
    }
  }
  throw new Error('Risk-parity optimization did not converge within maxIterations');
}

function hierarchicalRiskParity(matrix: Matrix, tickers: string[]) {
  const size = matrix.rows;
  const correlation = matrix.to2DArray().map((row, index) => row.map((value, other) =>
    index === other ? 1 : Math.max(-1, Math.min(1,
      finite(value / Math.sqrt(matrix.get(index, index)) / Math.sqrt(matrix.get(other, other)))))));
  const distance = correlation.map((row) => row.map((value) => Math.sqrt((1 - value) / 2)));
  let clusters = tickers.map((_, index) => ({ leaves: [index], members: [index] }));
  const merges: NonNullable<PortfolioOptimizationResult['hrp']>['merges'] = [];
  while (clusters.length > 1) {
    let bestDistance = Infinity;
    let first = 0;
    let second = 1;
    for (let left = 0; left < clusters.length; left++) {
      for (let right = left + 1; right < clusters.length; right++) {
        const candidate = Math.min(...clusters[left].members.flatMap((member) =>
          clusters[right].members.map((other) => distance[member][other])));
        if (candidate < bestDistance) {
          bestDistance = candidate;
          first = left;
          second = right;
        }
      }
    }
    const left = clusters[first];
    const right = clusters[second];
    merges.push({
      left: left.leaves.map((index) => tickers[index]),
      right: right.leaves.map((index) => tickers[index]),
      distance: bestDistance,
    });
    const combined = {
      leaves: [...left.leaves, ...right.leaves],
      members: [...left.members, ...right.members].sort((firstIndex, secondIndex) => firstIndex - secondIndex),
    };
    clusters = clusters.filter((_, index) => index !== first && index !== second);
    clusters.push(combined);
    clusters.sort((leftCluster, rightCluster) => leftCluster.members[0] - rightCluster.members[0]);
  }
  const order = clusters[0].leaves;
  const weights = Array<number>(size).fill(1);
  const clusterVariance = (members: number[]) => {
    const inverse = members.map((index) => finite(1 / matrix.get(index, index)));
    const total = sum(inverse);
    const clusterWeights = Array<number>(size).fill(0);
    members.forEach((index, position) => { clusterWeights[index] = inverse[position] / total; });
    const result = variance(matrix, clusterWeights);
    if (result <= 0) throw new Error('HRP requires positive cluster variance; use a positive ridge');
    return result;
  };
  let splits = 0;
  const bisect = (members: number[]) => {
    if (members.length <= 1) return;
    const middle = Math.floor(members.length / 2);
    const left = members.slice(0, middle);
    const right = members.slice(middle);
    const leftVariance = clusterVariance(left);
    const rightVariance = clusterVariance(right);
    const leftShare = rightVariance / finite(leftVariance + rightVariance);
    left.forEach((index) => { weights[index] *= leftShare; });
    right.forEach((index) => { weights[index] *= 1 - leftShare; });
    splits++;
    bisect(left);
    bisect(right);
  };
  bisect(order);
  return {
    weights,
    iterations: splits,
    residual: Math.abs(sum(weights) - 1),
    criterion: 'recursive allocation fully-invested residual (not an optimality certificate)',
    hrp: { leafOrder: order.map((index) => tickers[index]), merges, correlation, distance },
  };
}

export function optimizePortfolio(input: PortfolioOptimizationInput): PortfolioOptimizationResult {
  const parsed = portfolioOptimizationInputSchema.parse(input);
  const histories = [...parsed.histories].sort((left, right) =>
    left.ticker < right.ticker ? -1 : left.ticker > right.ticker ? 1 : 0);
  const tickers = histories.map((history) => history.ticker);
  const size = tickers.length;
  if (new Set(tickers).size !== size) throw new Error('Duplicate tickers are not supported');
  const cap = parsed.maxWeight ?? 1;
  if (cap < 1 / size) throw new Error('maxWeight is infeasible: it must be at least 1 / ticker count');
  if (parsed.method !== 'minimum-variance' && cap < 1) {
    throw new Error(`maxWeight caps are unsupported for ${parsed.method}; weights are not clamped`);
  }
  const priceMaps = histories.map((history) => {
    const prices = new Map<string, number>();
    for (const observation of history.prices) {
      if (prices.has(observation.date)) throw new Error('Duplicate price dates are not supported');
      prices.set(observation.date, observation.price);
    }
    return prices;
  });
  const dates = [...priceMaps[0].keys()].sort();
  if (priceMaps.some((prices) => prices.size !== dates.length || dates.some((date) => !prices.has(date)))) {
    throw new Error('Histories must have identical aligned dates; unmatched dates are not discarded');
  }
  const returns = dates.slice(1).map((date, index) => priceMaps.map((prices) =>
    finite(prices.get(date)! / prices.get(dates[index])! - 1)));
  const sample = covariance(new Matrix(returns), { center: true });
  sample.to1DArray().forEach(finite);
  const diagonal = tickers.map((_, index) => sample.get(index, index));
  if (diagonal.every((value) => value === 0)) {
    throw new Error('All histories have zero return variance; risk cannot be modeled from these observations');
  }
  const adjusted = sample.clone();
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      adjusted.set(row, column, finite(row === column
        ? sample.get(row, column) + parsed.ridge
        : sample.get(row, column) * (1 - parsed.shrinkage)));
    }
    if (adjusted.get(row, row) <= 0) throw new Error('Zero variance requires a positive ridge');
  }
  const scale = Math.max(...tickers.map((_, index) => adjusted.get(index, index)));
  const scaled = adjusted.clone().div(scale);
  scaled.to1DArray().forEach(finite);
  if (tickers.some((_, index) => scaled.get(index, index) <= 0)) {
    throw new Error('Covariance scaling lost numeric positivity');
  }
  const solution: {
    weights: number[];
    iterations: number;
    residual: number;
    criterion: string;
    hrp?: PortfolioOptimizationResult['hrp'];
  } = parsed.method === 'minimum-variance'
    ? minimumVariance(scaled, cap, parsed.tolerance, parsed.maxIterations)
    : parsed.method === 'risk-parity'
      ? riskParity(scaled, parsed.tolerance, parsed.maxIterations)
      : hierarchicalRiskParity(scaled, tickers);
  const total = sum(solution.weights);
  if (Math.abs(total - 1) > 1e-12 || solution.weights.some((weight) =>
    !Number.isFinite(weight) || weight < 0 || weight > cap)) {
    throw new Error('Optimizer failed long-only fully-invested constraints');
  }
  const estimatedVariance = variance(adjusted, solution.weights);
  if (estimatedVariance < 0) throw new Error('Estimated portfolio variance is negative');
  const estimatedAnnualizedVolatility = finite(Math.sqrt(finite(estimatedVariance * parsed.periodsPerYear)));
  const warnings: string[] = [];
  if (returns.length < 250) warnings.push('Fewer than 250 return observations; allocations may be unstable.');
  if (parsed.shrinkage > 0) warnings.push('Sample covariance was shrunk toward its diagonal.');
  if (parsed.ridge > 0) warnings.push('An absolute ridge was added to daily covariance diagonals; volatility uses adjusted covariance.');
  if (diagonal.some((value) => value === 0)) warnings.push('Zero-variance histories were modeled using the ridge, not observed risk.');
  return {
    method: parsed.method,
    weights: Object.fromEntries(tickers.map((ticker, index) => [ticker, solution.weights[index]])),
    dates,
    returnCount: returns.length,
    estimatedAnnualizedVolatility,
    covariance: {
      tickers, sample: sample.to2DArray(), adjusted: adjusted.to2DArray(),
      shrinkage: parsed.shrinkage, ridge: parsed.ridge,
    },
    constraints: { longOnly: true, fullyInvested: true, maxWeight: cap },
    convergence: {
      converged: true, iterations: solution.iterations, residual: solution.residual,
      tolerance: parsed.tolerance, criterion: solution.criterion,
    },
    provenance: {
      scope: 'local-historical-optimization-subset',
      algorithm: parsed.method === 'minimum-variance'
        ? 'projected gradient with bounded-simplex threshold bisection'
        : parsed.method === 'risk-parity'
          ? 'positive coordinate descent on equal-budget quadratic-minus-log objective'
          : 'single-linkage correlation distance, quasi-diagonalization, recursive inverse-variance cluster bisection',
      covarianceEstimator: 'sample simple-return covariance (n-1); off-diagonal shrinkage; absolute diagonal ridge',
      library: 'ml-matrix',
      periodsPerYear: parsed.periodsPerYear,
    },
    ...(solution.hrp ? { hrp: solution.hrp } : {}),
    warnings,
    limitations: [
      'Historical estimates only, not forecasts, investment advice, or guaranteed future risk or returns.',
      'Minimum variance is a subset, not full mean-variance optimization; expected returns and risk aversion are unsupported.',
      'Risk parity and HRP do not support nontrivial maxWeight caps; HRP is a heuristic, not a global variance optimum.',
      'Each aligned price interval is treated as one daily period; gaps, irregular sampling, and market calendars are not inferred.',
      'Annualization assumes the supplied periodsPerYear and stable covariance; no transaction costs, taxes, liquidity, or turnover model.',
      'Local long-only fully-invested optimization only; no shorting, leverage, external data, or broader optimization roadmap claims.',
    ],
  };
}