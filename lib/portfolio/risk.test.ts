import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateCorrelationMatrix,
  calculatePortfolioRisk,
  generatePortfolioReport,
  stressTestPortfolio,
  type PortfolioRiskInput,
  type PriceHistory,
} from './risk';

function near(actual: number, expected: number, tolerance = 1e-10): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function date(index: number): string {
  return new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10);
}

function history(ticker: string, prices: number[]): PriceHistory {
  return { ticker, prices: prices.map((price, index) => ({ date: date(index), price })) };
}

function pricesFromReturns(returns: number[], initial = 100): number[] {
  const prices = [initial];
  for (const value of returns) prices.push(prices[prices.length - 1] * (1 + value));
  return prices;
}

function fixture(): PortfolioRiskInput {
  return {
    positions: [{ ticker: 'AAA', shares: 2, currentPrice: 50 }],
    histories: [history('AAA', [100, 80, ...Array<number>(19).fill(72)])],
    currency: 'USD',
  };
}

test('known historical VaR, CVaR, sample volatility, drawdown and current currency amounts', () => {
  const risk = calculatePortfolioRisk(fixture());
  assert.equal(risk.returnCount, 20);
  assert.equal(risk.confidence, 0.95);
  assert.equal(risk.currentValue, 100);
  assert.equal(risk.currency, 'USD');
  near(risk.valueAtRisk.returnLoss, 0.1);
  near(risk.valueAtRisk.amount, 10);
  near(risk.conditionalValueAtRisk.returnLoss, 0.2);
  near(risk.conditionalValueAtRisk.amount, 20);
  near(risk.annualizedVolatility, Math.sqrt((0.05 - 20 * 0.015 ** 2) / 19 * 252));
  near(risk.maxDrawdown, 0.28);
  assert.equal(risk.concentration.herfindahlIndex, 1);
  assert.equal(risk.concentration.effectiveHoldings, 1);
  assert.match(risk.warnings.join(' '), /fewer than 250/);
});

test('aligns dates before returns, sorts history, and uses fixed shares rather than rebalanced weights', () => {
  const first = history('AAA', [100, 200, ...Array<number>(19).fill(100)]);
  first.prices.push({ date: date(30), price: 900 });
  first.prices.reverse();
  const second = history('BBB', Array<number>(21).fill(100));
  second.prices.push({ date: date(31), price: 1 });
  const input: PortfolioRiskInput = {
    positions: [
      { ticker: 'BBB', shares: 3, currentPrice: 100 },
      { ticker: 'AAA', shares: 1, currentPrice: 100 },
    ],
    histories: [first, second],
    currency: 'EUR',
  };
  const risk = calculatePortfolioRisk(input);
  assert.deepEqual(risk.dates, Array.from({ length: 21 }, (_, index) => date(index)));
  assert.deepEqual(risk.historicalValues.slice(0, 3), [400, 500, 400]);
  near(risk.dailyReturns[0], 0.25);
  near(risk.dailyReturns[1], -0.2);
  assert.notEqual(risk.dailyReturns[1], -0.125);
  near(risk.maxDrawdown, 0.2);
  near(risk.concentration.weights[0].weight, 0.75);
  near(risk.concentration.herfindahlIndex, 0.625);
  near(risk.concentration.effectiveHoldings, 1.6);
  assert.match(risk.warnings.join(' '), /discarded before/);
  assert.equal(calculateCorrelationMatrix(input.histories).returnCount, 20);
});

test('CVaR weights fractional empirical tail mass and includes tied losses', () => {
  const input = fixture();
  input.confidence = 0.925;
  const risk = calculatePortfolioRisk(input);
  near(risk.valueAtRisk.returnLoss, 0.1);
  near(risk.conditionalValueAtRisk.returnLoss, (0.2 + 0.5 * 0.1) / 1.5);
  input.histories = [history('AAA', pricesFromReturns([-0.2, -0.2, ...Array<number>(18).fill(0)]))];
  near(calculatePortfolioRisk(input).conditionalValueAtRisk.returnLoss, 0.2);
});

test('all-gain samples preserve signed tail losses instead of silently clipping to zero', () => {
  const input = fixture();
  input.histories = [history('AAA', pricesFromReturns(Array<number>(20).fill(0.01)))];
  const risk = calculatePortfolioRisk(input);
  near(risk.valueAtRisk.returnLoss, -0.01);
  near(risk.conditionalValueAtRisk.returnLoss, -0.01);
  assert.equal(risk.maxDrawdown, 0);
});

test('Pearson uses aligned returns rather than price levels and reports undefined variance as null', () => {
  const returns = Array.from({ length: 20 }, (_, index) => index % 2 === 0 ? 0.1 : -0.1);
  const result = calculateCorrelationMatrix([
    history('AAA', pricesFromReturns(returns)),
    history('BBB', pricesFromReturns(returns.map((value) => -value))),
    history('CASH', Array<number>(21).fill(100)),
  ]);
  assert.deepEqual(result.tickers, ['AAA', 'BBB', 'CASH']);
  near(result.matrix[0][0]!, 1);
  near(result.matrix[0][1]!, -1);
  near(result.matrix[1][0]!, -1);
  assert.deepEqual(result.matrix[2], [null, null, null]);
  assert.equal(result.matrix[0][2], null);
  assert.match(result.warnings.join(' '), /zero-variance/);
});

test('constant nonzero returns have exactly zero volatility and undefined correlation', () => {
  const input = fixture();
  input.histories = [history('AAA', Array.from({ length: 21 }, (_, index) => 2 ** index))];
  assert.equal(calculatePortfolioRisk(input).annualizedVolatility, 0);
  assert.deepEqual(calculateCorrelationMatrix(input.histories).matrix, [[null]]);
});

test('Pearson agrees with a nontrivial independently computed correlation', () => {
  const first = Array.from({ length: 20 }, (_, index) => index % 4 === 0 ? 0.2 : 0);
  const second = Array.from({ length: 20 }, (_, index) => index % 4 < 2 ? 0.1 : 0);
  const result = calculateCorrelationMatrix([
    history('AAA', pricesFromReturns(first)), history('BBB', pricesFromReturns(second)),
  ]);
  near(result.matrix[0][1]!, 1 / Math.sqrt(3));
});

test('20 returns required after alignment, and warnings stop at 250 returns', () => {
  assert.throws(() => calculateCorrelationMatrix([history('AAA', Array<number>(20).fill(100))]), /At least 20/);
  const first = history('AAA', Array<number>(21).fill(100));
  const second = history('BBB', Array<number>(21).fill(100));
  second.prices[0].date = date(30);
  assert.throws(() => calculateCorrelationMatrix([first, second]), /At least 20/);
  const input = fixture();
  input.histories = [history('AAA', Array<number>(251).fill(100))];
  const risk = calculatePortfolioRisk(input);
  assert.equal(risk.returnCount, 250);
  assert.deepEqual(risk.warnings, []);
  assert.equal(risk.annualizedVolatility, 0);
});

test('invalid positions, currency and confidence are rejected', () => {
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    for (const field of ['shares', 'currentPrice'] as const) {
      const input = fixture();
      input.positions[0][field] = invalid;
      assert.throws(() => calculatePortfolioRisk(input));
    }
  }
  for (const confidence of [0, 1, -0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => calculatePortfolioRisk({ ...fixture(), confidence }));
  }
  assert.throws(() => calculatePortfolioRisk({ ...fixture(), currency: ' ' }));
  const input = fixture();
  input.positions[0].ticker = ' ';
  assert.throws(() => calculatePortfolioRisk(input));
  assert.throws(() => calculatePortfolioRisk({ ...fixture(), positions: [] }));
});

test('bad prices, dates, duplicate dates and history tickers are rejected even on unmatched dates', () => {
  for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const input = fixture();
    input.histories[0].prices.push({ date: date(30), price });
    assert.throws(() => calculatePortfolioRisk(input));
  }
  for (const invalidDate of ['2025-02-30', '2025-13-01', '2025-1-01', 'invalid', '2025-01-01T00:00:00Z']) {
    const input = fixture();
    input.histories[0].prices[0].date = invalidDate;
    assert.throws(() => calculatePortfolioRisk(input));
  }
  const input = fixture();
  input.histories[0].prices.push({ ...input.histories[0].prices[0] });
  assert.throws(() => calculatePortfolioRisk(input), /Duplicate date/);
  assert.throws(() => calculateCorrelationMatrix([{ ticker: ' ', prices: history('AAA', Array<number>(21).fill(1)).prices }]));
  assert.throws(() => calculateCorrelationMatrix([]));
  assert.throws(() => calculateCorrelationMatrix([{ ticker: 'AAA', prices: [] }]));
});

test('duplicate, missing and extra tickers are rejected', () => {
  const input = fixture();
  assert.throws(() => calculatePortfolioRisk({ ...input, positions: [...input.positions, ...input.positions] }), /Duplicate tickers/);
  assert.throws(() => calculateCorrelationMatrix([...input.histories, ...input.histories]), /Duplicate tickers/);
  assert.throws(() => calculatePortfolioRisk({ ...input, histories: [history('BBB', Array<number>(21).fill(100))] }), /every portfolio ticker/);
  assert.throws(() => calculatePortfolioRisk({ ...input, histories: [...input.histories, history('BBB', Array<number>(21).fill(100))] }));
});

test('stress tests use only explicit ticker shocks and current holdings', () => {
  const positions = [
    { ticker: 'AAA', shares: 2, currentPrice: 50 },
    { ticker: 'BBB', shares: 1, currentPrice: 300 },
  ];
  const [result, wipeout] = stressTestPortfolio(positions, [
    { name: 'User shock', returns: { AAA: -0.5, BBB: 0.1 } },
    { name: 'Total loss', returns: { AAA: -1, BBB: -1 } },
  ], 'EUR');
  assert.deepEqual(result, {
    name: 'User shock', currency: 'EUR', currentValue: 400,
    stressedValue: 380, profitLoss: -20, portfolioReturn: -0.05,
  });
  assert.equal(wipeout.stressedValue, 0);
  assert.equal(wipeout.portfolioReturn, -1);
  assert.deepEqual(stressTestPortfolio(positions, [], 'EUR'), []);
});

test('invalid stress inputs, missing shocks, extra shocks and nonfinite arithmetic are rejected', () => {
  for (const shock of [-1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => stressTestPortfolio(fixture().positions, [{ name: 'Shock', returns: { AAA: shock } }], 'USD'));
  }
  const invalidShocks: Record<string, number>[] = [{}, { BBB: 0 }, { AAA: 0, BBB: 0 }];
  for (const returns of invalidShocks) {
    assert.throws(() => stressTestPortfolio(fixture().positions, [{ name: 'Shock', returns }], 'USD'));
  }
  assert.throws(() => stressTestPortfolio(fixture().positions, [{ name: ' ', returns: { AAA: 0 } }], 'USD'));
  assert.throws(() => stressTestPortfolio([], [], 'USD'));
  assert.throws(() => stressTestPortfolio(fixture().positions, [], ' '));
  const input = fixture();
  input.positions[0].shares = Number.MAX_VALUE;
  assert.throws(() => calculatePortfolioRisk(input), /numeric range/);
  assert.throws(() => stressTestPortfolio(fixture().positions, [{ name: 'Overflow', returns: { AAA: Number.MAX_VALUE } }], 'USD'), /numeric range/);
});

test('report is deterministic, structured, nonmutating and has no invented stress tests', () => {
  const input = fixture();
  const snapshot = structuredClone(input);
  const report = generatePortfolioReport(input);
  assert.deepEqual(report, generatePortfolioReport(input));
  assert.deepEqual(input, snapshot);
  assert.equal(report.phase, 'phase6-deterministic-risk-slice');
  assert.deepEqual(report.stressTests, []);
  assert.equal(report.risk.returnCount, report.correlations.returnCount);
  assert.match(report.limitations.join(' '), /No optimization, PCA/);
  assert.equal(generatePortfolioReport(input, [{ name: 'Explicit', returns: { AAA: -0.25 } }]).stressTests[0].profitLoss, -25);
});