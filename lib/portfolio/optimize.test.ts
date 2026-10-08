import assert from 'node:assert/strict';
import test from 'node:test';
import { optimizePortfolio, type PortfolioOptimizationInput } from './optimize';

const methods = ['minimum-variance', 'risk-parity', 'hrp'] as const;

function near(actual: number, expected: number, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function history(ticker: string, returns: number[]) {
  let price = 100;
  return {
    ticker,
    prices: [0, ...returns].map((value, index) => {
      if (index > 0) price *= 1 + value;
      return { date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10), price };
    }),
  };
}

const first = Array.from({ length: 20 }, (_, index) => index % 2 ? 0.01 : -0.01);
const second = Array.from({ length: 20 }, (_, index) => index % 4 < 2 ? -0.02 : 0.02);

function fixture(method: PortfolioOptimizationInput['method'] = 'minimum-variance'): PortfolioOptimizationInput {
  return { method, histories: [history('AAA', first), history('BBB', second)], shrinkage: 0, ridge: 0 };
}

function constraints(result: ReturnType<typeof optimizePortfolio>, cap = 1) {
  const weights = Object.values(result.weights);
  near(weights.reduce((total, weight) => total + weight, 0), 1, 1e-12);
  assert.ok(weights.every((weight) => Number.isFinite(weight) && weight >= 0 && weight <= cap));
  assert.ok(Number.isFinite(result.estimatedAnnualizedVolatility));
  assert.equal(result.convergence.converged, true);
  assert.ok(result.convergence.residual <= result.convergence.tolerance);
}

test('minimum variance matches the independent two-asset covariance solution and volatility', () => {
  const correlated = second.map((value, index) => value + first[index] * 0.5);
  const result = optimizePortfolio({ ...fixture(), histories: [history('AAA', first), history('BBB', correlated)] });
  const varianceFirst = 20 / 19 * 0.01 ** 2;
  const covariance = varianceFirst * 0.5;
  const varianceSecond = 20 / 19 * (0.02 ** 2 + 0.005 ** 2);
  const expected = (varianceSecond - covariance) / (varianceFirst + varianceSecond - 2 * covariance);
  near(result.weights.AAA, expected);
  near(result.weights.BBB, 1 - expected);
  near(result.covariance.sample[0][0], varianceFirst, 1e-16);
  near(result.covariance.sample[0][1], covariance, 1e-16);
  const portfolioVariance = expected ** 2 * varianceFirst + (1 - expected) ** 2 * varianceSecond
    + 2 * expected * (1 - expected) * covariance;
  near(result.estimatedAnnualizedVolatility, Math.sqrt(252 * portfolioVariance));
  constraints(result);
});

test('equal risk contributions match the two-asset inverse standard deviation ratio', () => {
  const result = optimizePortfolio(fixture('risk-parity'));
  near(result.weights.AAA, 2 / 3);
  near(result.weights.BBB, 1 / 3);
  const contribution = result.covariance.adjusted.map((row, index) => {
    const weights = Object.values(result.weights);
    return weights[index] * row.reduce((total, value, other) => total + value * weights[other], 0);
  });
  near(contribution[0], contribution[1], 1e-10);
  assert.match(result.provenance.algorithm, /coordinate descent/);
  constraints(result);
});

test('HRP uses actual single-linkage distances, quasi-diagonal leaves, and cluster variance', () => {
  const orthogonal = Array.from({ length: 24 }, (_, index) => index % 4 < 2 ? -0.01 : 0.01);
  const alternating = Array.from({ length: 24 }, (_, index) => index % 2 ? 0.01 : -0.01);
  const result = optimizePortfolio({
    method: 'hrp', shrinkage: 0, ridge: 0,
    histories: [history('A', alternating), history('B', alternating), history('C', orthogonal), history('D', orthogonal)],
  });
  assert.deepEqual(result.hrp?.leafOrder, ['A', 'B', 'C', 'D']);
  assert.deepEqual(result.hrp?.merges.map(({ left, right }) => [left, right]), [
    [['A'], ['B']], [['C'], ['D']], [['A', 'B'], ['C', 'D']],
  ]);
  near(result.hrp!.merges[0].distance, 0, 1e-7);
  near(result.hrp!.merges[2].distance, Math.SQRT1_2, 1e-12);
  Object.values(result.weights).forEach((weight) => near(weight, 0.25));
  const asymmetric = optimizePortfolio({
    method: 'hrp', shrinkage: 0, ridge: 0,
    histories: [history('A', alternating), history('B', alternating), history('C', alternating), history('D', orthogonal)],
  });
  near(asymmetric.weights.A, 1 / 6);
  near(asymmetric.weights.B, 1 / 6);
  near(asymmetric.weights.C, 1 / 3);
  near(asymmetric.weights.D, 1 / 3);
  assert.ok(Math.abs(asymmetric.weights.A - 0.25) > 0.05);
  constraints(result);
  constraints(asymmetric);
});

test('all methods have deterministic ticker mapping under ticker and observation permutations', () => {
  for (const method of methods) {
    const input = { ...fixture(method), ridge: 1e-10, shrinkage: 0.1 };
    const expected = optimizePortfolio(input);
    const permuted = { ...input, histories: [...input.histories].reverse().map((item) => ({
      ...item, prices: [...item.prices].reverse(),
    })) };
    assert.deepEqual(optimizePortfolio(permuted), expected);
    assert.deepEqual(optimizePortfolio(input), expected);
  }
});

test('minimum variance honors active caps and the exact equal-weight feasibility boundary', () => {
  for (const maxWeight of [0.5, 0.6, 1]) {
    const result = optimizePortfolio({ ...fixture(), maxWeight });
    near(result.weights.AAA, Math.min(0.8, maxWeight));
    constraints(result, maxWeight);
  }
  assert.throws(() => optimizePortfolio({ ...fixture(), maxWeight: 0.499999 }), /infeasible/);
  for (const method of ['risk-parity', 'hrp'] as const) {
    assert.throws(() => optimizePortfolio({ ...fixture(method), maxWeight: 0.6 }), /caps are unsupported/);
    constraints(optimizePortfolio({ ...fixture(method), maxWeight: 1 }));
  }
});

test('bounded-simplex projection satisfies independent three-asset solutions and KKT conditions', () => {
  const patterns = [
    Array.from({ length: 24 }, (_, index) => index % 2 ? 0.005 : -0.005),
    Array.from({ length: 24 }, (_, index) => index % 4 < 2 ? -0.01 : 0.01),
    Array.from({ length: 24 }, (_, index) => index % 8 < 4 ? -0.02 : 0.02),
  ];
  for (const [cap, expected] of [
    [1, [16 / 21, 4 / 21, 1 / 21]],
    [0.45, [0.45, 0.44, 0.11]],
    [0.4, [0.4, 0.4, 0.2]],
    [1 / 3, [1 / 3, 1 / 3, 1 / 3]],
  ] as const) {
    const result = optimizePortfolio({
      method: 'minimum-variance', shrinkage: 0, ridge: 0, maxWeight: cap, tolerance: 1e-10,
      histories: patterns.map((returns, index) => history(`T${index}`, returns)),
    });
    const weights = Object.values(result.weights);
    weights.forEach((weight, index) => near(weight, expected[index], 1e-8));
    const marginal = result.covariance.sample.map((row) => row.reduce((total, value, index) => total + value * weights[index], 0));
    const free = weights.map((weight, index) => ({ weight, index })).filter(({ weight }) => weight > 1e-8 && weight < cap - 1e-8);
    if (free.length > 0) {
      const multiplier = marginal[free[0].index];
      weights.forEach((weight, index) => {
        if (weight >= cap - 1e-8) assert.ok(marginal[index] <= multiplier + 1e-12);
        else near(marginal[index], multiplier, 1e-12);
      });
    }
    constraints(result, cap);
  }
  const boundary = optimizePortfolio({
    ...fixture(), histories: [history('AAA', first), history('BBB', first.map((value) => value * 2))],
  });
  near(boundary.weights.AAA, 1, 1e-12);
  near(boundary.weights.BBB, 0, 1e-12);
  constraints(boundary);
});

test('risk budgeting converges for correlated and negatively correlated positive-definite covariance', () => {
  for (const coefficient of [-0.5, 0.5]) {
    const result = optimizePortfolio({
      ...fixture('risk-parity'),
      histories: [history('AAA', first), history('BBB', second.map((value, index) => value + coefficient * first[index]))],
      tolerance: 1e-10,
    });
    const secondDeviation = Math.sqrt(0.02 ** 2 + (coefficient * 0.01) ** 2);
    near(result.weights.AAA, secondDeviation / (0.01 + secondDeviation));
    assert.ok(result.convergence.iterations > 1);
    constraints(result);
  }
});

test('sample covariance, adjustable diagonal shrinkage, absolute ridge and annualization are explicit', () => {
  const input = fixture();
  input.histories[1] = history('BBB', second.map((value, index) => value + 0.5 * first[index]));
  const defaultResult = optimizePortfolio({ method: input.method, histories: input.histories });
  assert.equal(defaultResult.covariance.shrinkage, 0.1);
  assert.equal(defaultResult.covariance.ridge, 1e-10);
  near(defaultResult.covariance.adjusted[0][1], defaultResult.covariance.sample[0][1] * 0.9, 1e-18);
  near(defaultResult.covariance.adjusted[0][0], defaultResult.covariance.sample[0][0] + 1e-10, 1e-18);
  const ridge = 0.001;
  const result = optimizePortfolio({ ...input, shrinkage: 1, ridge, periodsPerYear: 12 });
  assert.equal(result.covariance.adjusted[0][1], 0);
  const firstVariance = 20 / 19 * 0.01 ** 2 + ridge;
  const secondVariance = 20 / 19 * (0.02 ** 2 + 0.005 ** 2) + ridge;
  const weight = secondVariance / (firstVariance + secondVariance);
  near(result.weights.AAA, weight);
  near(result.estimatedAnnualizedVolatility, Math.sqrt(12 * (weight ** 2 * firstVariance + (1 - weight) ** 2 * secondVariance)));
  assert.equal(result.provenance.periodsPerYear, 12);
  constraints(result);
});

test('one nonconstant asset is fully invested for every method and caps remain feasible', () => {
  for (const method of methods) {
    const input = { method, histories: [history('AAA', first)] };
    const result = optimizePortfolio(input);
    assert.deepEqual(result.weights, { AAA: 1 });
    constraints(result);
    assert.throws(() => optimizePortfolio({ ...input, maxWeight: 0.9 }), /infeasible/);
  }
});

test('identical singular histories are supported with ridge and zero variance warns or rejects', () => {
  for (const method of methods) {
    const identical = optimizePortfolio({ method, histories: [history('AAA', first), history('BBB', first)] });
    near(identical.weights.AAA, 0.5);
    near(identical.weights.BBB, 0.5);
    assert.ok(identical.covariance.adjusted[0][0] > identical.covariance.sample[0][0]);
    assert.ok(identical.warnings.some((warning) => /ridge/.test(warning)));
    constraints(identical);
    const mixed = { method, histories: [history('AAA', first), history('BBB', Array<number>(20).fill(0))] };
    const result = optimizePortfolio(mixed);
    assert.ok(result.warnings.some((warning) => /Zero-variance/.test(warning)));
    constraints(result);
    assert.throws(() => optimizePortfolio({ ...mixed, ridge: 0 }), /positive ridge/);
    assert.throws(() => optimizePortfolio({ method, histories: [history('AAA', Array<number>(20).fill(0))] }), /zero return variance/);
  }
});

test('strict validation rejects unknown fields, unsupported returns, invalid numbers and solver options', () => {
  for (const extra of [
    { expectedReturn: { AAA: 0.1, BBB: 0.2 } }, { riskAversion: 1 }, { unexpected: true },
    { method: 'mean-variance' }, { shrinkage: -0.1 }, { shrinkage: 1.1 }, { ridge: -1 },
    { ridge: Infinity }, { ridge: NaN }, { maxWeight: 0 }, { maxWeight: 1.1 },
    { maxIterations: 0 }, { maxIterations: 1.5 }, { maxIterations: 100_001 },
    { tolerance: 0 }, { tolerance: 1e-13 }, { tolerance: Infinity },
    { periodsPerYear: 0 }, { periodsPerYear: Infinity },
  ]) {
    assert.throws(() => optimizePortfolio({ ...fixture(), ...extra } as PortfolioOptimizationInput));
  }
  for (const price of [0, -1, NaN, Infinity]) {
    const input = fixture();
    input.histories[0].prices[0].price = price;
    assert.throws(() => optimizePortfolio(input));
  }
  const unknown = fixture();
  Object.assign(unknown.histories[0].prices[0], { secret: true });
  assert.throws(() => optimizePortfolio(unknown));
});

test('real dates, unique dates, unique tickers and identical alignment are mandatory', () => {
  for (const date of ['2025-02-30', '2025-02-29', '2025-13-01', '2025-1-01', 'not-a-date', '2025-01-01T00:00:00Z']) {
    const input = fixture();
    input.histories[0].prices[0].date = date;
    assert.throws(() => optimizePortfolio(input));
  }
  const duplicate = fixture();
  duplicate.histories[0].prices[1].date = duplicate.histories[0].prices[0].date;
  assert.throws(() => optimizePortfolio(duplicate), /Duplicate price dates/);
  const unmatched = fixture();
  unmatched.histories[1].prices[0].date = '2024-12-31';
  assert.throws(() => optimizePortfolio(unmatched), /identical aligned dates/);
  const tickers = fixture();
  tickers.histories[1].ticker = ' AAA ';
  assert.throws(() => optimizePortfolio(tickers), /Duplicate tickers/);
  const leap = fixture();
  leap.histories.forEach((item) => { item.prices[0].date = '2024-02-29'; });
  constraints(optimizePortfolio(leap));
});

test('bounds accept 10 tickers and 501 prices but reject empty, short and larger histories', () => {
  const full = Array.from({ length: 10 }, (_, index) => history(`T${index}`, Array.from({ length: 500 }, (_, period) => period % 2 ? 0.001 : -0.001)));
  const result = optimizePortfolio({ method: 'minimum-variance', histories: full });
  assert.equal(result.returnCount, 500);
  assert.equal(Object.keys(result.weights).length, 10);
  constraints(result);
  for (const histories of [[], full.slice(0, 1).map((item) => ({ ...item, prices: item.prices.slice(0, 20) })),
    [...full, history('EXTRA', first)], [history('AAA', Array<number>(501).fill(0.001))]]) {
    assert.throws(() => optimizePortfolio({ method: 'minimum-variance', histories }));
  }
});

test('nonfinite intermediate returns, covariance and annualization reject instead of succeeding', () => {
  const ratioOverflow = fixture();
  ratioOverflow.histories[0].prices[0].price = Number.MIN_VALUE;
  assert.throws(() => optimizePortfolio(ratioOverflow), /finite numeric range/);
  const covarianceOverflow = fixture();
  covarianceOverflow.histories[0].prices[0].price = 1e-200;
  assert.throws(() => optimizePortfolio(covarianceOverflow), /finite numeric range/);
  assert.throws(() => optimizePortfolio({ ...fixture(), ridge: Number.MAX_VALUE, periodsPerYear: 252 }), /finite numeric range/);
});

test('iterative algorithms reject bounded iteration exhaustion instead of claiming convergence', () => {
  for (const method of ['minimum-variance', 'risk-parity'] as const) {
    const input = fixture(method);
    input.histories[1] = history('BBB', second.map((value, index) => value + 0.5 * first[index]));
    assert.throws(() => optimizePortfolio({ ...input, maxIterations: 1, tolerance: 1e-12 }), /did not converge/);
  }
});

test('pure local optimization does not mutate deeply frozen inputs or use network access', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('Network forbidden'); }) as typeof fetch;
  try {
    for (const method of methods) {
      const input = fixture(method);
      const before = structuredClone(input);
      input.histories.forEach((item) => {
        item.prices.forEach(Object.freeze);
        Object.freeze(item.prices);
        Object.freeze(item);
      });
      Object.freeze(input.histories);
      Object.freeze(input);
      const result = optimizePortfolio(input);
      assert.deepEqual(input, before);
      assert.equal(result.provenance.scope, 'local-historical-optimization-subset');
      assert.equal(result.provenance.library, 'ml-matrix');
      assert.ok(result.limitations.some((text) => /not forecasts/.test(text)));
      assert.ok(result.limitations.some((text) => /not full mean-variance/.test(text)));
      constraints(result);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});