import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzePortfolioFactors, portfolioFactorsInputSchema, type PortfolioFactorsInput } from './factors';

function near(actual: number, expected: number, tolerance = 1e-10) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
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

function fixture(): PortfolioFactorsInput {
  return { histories: [history('AAA', first), history('BBB', second)] };
}

test('perfect positive and negative correlation have one principal component with analytic variance', () => {
  for (const sign of [1, -1]) {
    const result = analyzePortfolioFactors({ histories: [history('AAA', first), history('BBB', first.map((value) => value * sign))] });
    near(result.components[0].eigenvalue, 2 * 20 / 19 * 0.01 ** 2);
    near(result.components[0].explainedVariance, 1);
    near(result.components[1].eigenvalue, 0);
    near(result.components[0].loadings.AAA, Math.SQRT1_2);
    near(result.components[0].loadings.BBB, sign * Math.SQRT1_2);
  }
});

test('nontrivial eigenvalues, eigenvectors and covariance reconstruct the analytic matrix', () => {
  const result = analyzePortfolioFactors({ histories: [history('AAA', first), history('BBB', second.map((value, index) => value + first[index] * 0.5))] });
  const variance = 20 / 19 * 0.01 ** 2;
  const expected = [[variance, 0.5 * variance], [0.5 * variance, 4.25 * variance]];
  const root = Math.sqrt(3.25 ** 2 + 1);
  near(result.components[0].eigenvalue, variance * (5.25 + root) / 2);
  near(result.components[1].eigenvalue, variance * (5.25 - root) / 2);
  near(result.components.reduce((sum, component) => sum + component.explainedVariance, 0), 1);
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      near(result.covariance[row][column], expected[row][column]);
      near(result.components.reduce((sum, component) => sum + component.eigenvalue * component.loadings[result.tickers[row]] * component.loadings[result.tickers[column]], 0), expected[row][column]);
    }
  }
});

test('ticker, factor and observation permutations preserve exact outputs and canonical signs', () => {
  const input = { ...fixture(), portfolioWeights: { BBB: 0.6, AAA: 0.4 }, factorHistories: [history('Y', second), history('X', first)] };
  const reverse = (histories: typeof input.histories) => [...histories].reverse().map((item) => ({ ...item, prices: [...item.prices].reverse() }));
  const expected = analyzePortfolioFactors(input);
  assert.deepEqual(analyzePortfolioFactors({ ...input, histories: reverse(input.histories), factorHistories: reverse(input.factorHistories) }), expected);
  assert.deepEqual(expected.tickers, ['AAA', 'BBB']);
  assert.deepEqual(expected.regression?.factorNames, ['X', 'Y']);
  for (const component of expected.components) {
    const values = Object.values(component.loadings);
    const largest = Math.max(...values.map(Math.abs));
    assert.ok(values.find((value) => Math.abs(value) >= largest - 1e-14)! >= 0);
  }
});

test('exact portfolio factor replication gives beta one, zero intercept and R2 one', () => {
  const replicated = first.map((value, index) => 0.25 * value + 0.75 * second[index]);
  const result = analyzePortfolioFactors({ ...fixture(), portfolioWeights: { AAA: 0.25, BBB: 0.75 }, factorHistories: [history('Replication', replicated)], periodsPerYear: 365 });
  const regression = result.regression!;
  const portfolio = result.portfolio!;
  near(regression.betas.Replication, 1);
  near(regression.interceptDaily, 0);
  near(regression.rSquared, 1);
  near(regression.residualAnnualizedVolatility, 0);
  assert.equal(portfolio.model, 'static-weights-daily-rebalanced');
  portfolio.dailyReturns.forEach((value, index) => near(value, replicated[index]));
  const prices = fixture().histories.map(({ prices }) => prices);
  const fixedShareReturn = (0.25 * prices[0][2].price + 0.75 * prices[1][2].price) / (0.25 * prices[0][1].price + 0.75 * prices[1][1].price) - 1;
  assert.ok(Math.abs(fixedShareReturn - portfolio.dailyReturns[1]) > 1e-6);
  assert.equal(result.periodsPerYear, 365);
});

test('multiple factors recover slopes and a daily intercept', () => {
  const response = first.map((value, index) => 0.003 + 0.5 * value - 0.25 * second[index]);
  const result = analyzePortfolioFactors({ histories: [history('A', response), history('B', second)], portfolioWeights: { A: 1, B: 0 }, factorHistories: [history('F1', first), history('F2', second)] });
  const regression = result.regression!;
  near(regression.betas.F1, 0.5);
  near(regression.betas.F2, -0.25);
  near(regression.interceptDaily, 0.003);
  near(regression.rSquared, 1);
});

test('nonzero residual volatility and R2 match an independent analytic regression', () => {
  const factor = Array.from({ length: 24 }, (_, index) => index % 2 ? 0.01 : -0.01);
  const noise = Array.from({ length: 24 }, (_, index) => index % 4 < 2 ? -0.004 : 0.004);
  const response = factor.map((value, index) => 0.003 + 0.5 * value + noise[index]);
  for (const periodsPerYear of [12, 252]) {
    const result = analyzePortfolioFactors({
      histories: [history('A', response), history('B', factor)],
      portfolioWeights: { A: 1, B: 0 }, factorHistories: [history('F', factor)], periodsPerYear,
    });
    const regression = result.regression!;
    near(regression.betas.F, 0.5);
    near(regression.interceptDaily, 0.003);
    near(regression.rSquared, 0.005 ** 2 / (0.005 ** 2 + 0.004 ** 2));
    near(regression.residualAnnualizedVolatility, Math.sqrt(24 * 0.004 ** 2 / 22 * periodsPerYear));
    assert.equal(regression.residualDegreesOfFreedom, 22);
  }
});

test('all five independent factors are regressed without truncation', () => {
  const patterns = Array.from({ length: 5 }, (_, factor) =>
    Array.from({ length: 32 }, (_, index) => (index & (1 << factor)) ? 0.01 : -0.01));
  const response = patterns[0].map((_, index) =>
    0.002 + patterns.reduce((sum, pattern, factor) => sum + pattern[index] * (factor + 1) / 10, 0));
  const result = analyzePortfolioFactors({
    histories: [history('A', response), history('B', patterns[0])], portfolioWeights: { A: 1, B: 0 },
    factorHistories: patterns.map((pattern, index) => history(`F${index}`, pattern)),
  });
  const regression = result.regression!;
  for (let index = 0; index < 5; index += 1) near(regression.betas[`F${index}`], (index + 1) / 10);
  near(regression.interceptDaily, 0.002);
  near(regression.rSquared, 1);
  assert.equal(regression.residualDegreesOfFreedom, 26);
});

test('zero-variance portfolio regression rejects undefined R2', () => {
  assert.throws(() => analyzePortfolioFactors({
    histories: [history('A', Array<number>(20).fill(0)), history('B', first)],
    portfolioWeights: { A: 1, B: 0 }, factorHistories: [history('F', first)],
  }), /Zero-variance portfolio/);
});

test('rank deficient, constant and affine-dependent factor designs are rejected', () => {
  for (const factors of [
    [history('F1', first), history('F2', first.map((value) => value * 2))],
    [history('F1', Array<number>(20).fill(0))],
    [history('F1', first), history('F2', first.map((value) => value + 0.005))],
  ]) {
    assert.throws(() => analyzePortfolioFactors({ ...fixture(), portfolioWeights: { AAA: 0.5, BBB: 0.5 }, factorHistories: factors }), /Rank deficient/);
  }
});

test('rejects mismatched or duplicate dates and tickers instead of intersecting observations', () => {
  const mismatch = fixture();
  mismatch.histories[1].prices[0].date = '2024-12-31';
  assert.throws(() => analyzePortfolioFactors(mismatch), /aligned dates/);
  const duplicate = fixture();
  duplicate.histories[0].prices[1].date = duplicate.histories[0].prices[0].date;
  assert.throws(() => analyzePortfolioFactors(duplicate), /Duplicate dates/);
  assert.throws(() => analyzePortfolioFactors({ histories: [history('A', first), history('A', second)] }), /Duplicate tickers/);
  const factor = history('F', first);
  factor.prices[0].date = '2024-12-31';
  assert.throws(() => analyzePortfolioFactors({ ...fixture(), portfolioWeights: { AAA: 1, BBB: 0 }, factorHistories: [factor] }), /aligned dates/);
});

test('exported strict schema rejects invalid prices, real dates, weights and extra fields', () => {
  for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const input = fixture();
    input.histories[0].prices[0].price = price;
    assert.equal(portfolioFactorsInputSchema.safeParse(input).success, false);
  }
  for (const date of ['2025-02-29', '2025-02-30', '2025-13-01', '2025-1-01', 'not-a-date']) {
    const input = fixture();
    input.histories[0].prices[0].date = date;
    assert.throws(() => analyzePortfolioFactors(input));
  }
  const invalidWeights: Record<string, number>[] = [{ AAA: 1 }, { AAA: 0.5, BBB: 0.5, C: 0 }, { AAA: 0.4, BBB: 0.4 }, { AAA: -0.1, BBB: 1.1 }, { AAA: Number.NaN, BBB: 1 }, { AAA: 0, BBB: 0 }];
  for (const portfolioWeights of invalidWeights) {
    assert.throws(() => analyzePortfolioFactors({ ...fixture(), portfolioWeights }));
  }
  assert.throws(() => analyzePortfolioFactors({ ...fixture(), factorHistories: [history('F', first)] }), /requires portfolioWeights/);
  assert.equal(portfolioFactorsInputSchema.safeParse({ ...fixture(), extra: true }).success, false);
  const extra = fixture();
  Object.assign(extra.histories[0].prices[0], { extra: true });
  assert.equal(portfolioFactorsInputSchema.safeParse(extra).success, false);
  assert.equal(analyzePortfolioFactors({ ...fixture(), portfolioWeights: { AAA: 1, BBB: 0 } }).portfolio!.weights.BBB, 0);
});

test('strict history, factor, observation and annualization caps are enforced', () => {
  assert.throws(() => analyzePortfolioFactors({ histories: [history('A', first)] }));
  assert.throws(() => analyzePortfolioFactors({ histories: Array.from({ length: 11 }, (_, index) => history(`T${index}`, first)) }));
  for (const count of [19, 501]) {
    assert.throws(() => analyzePortfolioFactors({ histories: [history('A', Array<number>(count).fill(0.01)), history('B', Array<number>(count).fill(0.02))] }));
  }
  for (const count of [0, 6]) {
    assert.throws(() => analyzePortfolioFactors({ ...fixture(), portfolioWeights: { AAA: 1, BBB: 0 }, factorHistories: Array.from({ length: count }, (_, index) => history(`F${index}`, first)) }));
  }
  for (const periodsPerYear of [0, -1, 367, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => analyzePortfolioFactors({ ...fixture(), periodsPerYear }));
  }
  assert.equal(analyzePortfolioFactors({ ...fixture(), periodsPerYear: 366 }).periodsPerYear, 366);
  const boundary = analyzePortfolioFactors({ histories: Array.from({ length: 10 }, (_, index) => history(`T${index}`, Array.from({ length: 500 }, (_, observation) => observation % 2 ? 0.01 : -0.01))) });
  assert.equal(boundary.returnCount, 500);
});

test('all-zero covariance and arithmetic overflow are rejected', () => {
  assert.throws(() => analyzePortfolioFactors({ histories: [history('A', Array<number>(20).fill(0)), history('B', Array<number>(20).fill(0))] }), /All-zero/);
  for (const tiny of [Number.MIN_VALUE, 1e-200]) {
    const input = fixture();
    input.histories[0].prices[0].price = tiny;
    input.histories[0].prices[1].price = 1e200;
    assert.throws(() => analyzePortfolioFactors(input), /finite numeric range/);
  }
});

test('inputs are not mutated, outputs are finite, and no network is used', () => {
  const input = { ...fixture(), portfolioWeights: { AAA: 0.5, BBB: 0.5 }, factorHistories: [history('F', first)] };
  const original = structuredClone(input);
  const freeze = (value: unknown): void => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  };
  freeze(input);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network forbidden'); };
  try {
    const result = analyzePortfolioFactors(input);
    const check = (value: unknown): void => {
      if (typeof value === 'number') assert.ok(Number.isFinite(value));
      else if (value && typeof value === 'object') Object.values(value).forEach(check);
    };
    check(result);
    assert.deepEqual(input, original);
    assert.equal(result.periodsPerYear, 252);
  } finally {
    globalThis.fetch = previousFetch;
  }
});