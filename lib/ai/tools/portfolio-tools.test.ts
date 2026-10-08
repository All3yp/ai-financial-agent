import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import test from 'node:test';
import { z } from 'zod';
import { generatePortfolioReport } from '../../portfolio/risk';
import { portfolioReportInputSchema, portfolioTools } from './portfolio-tools';

type Input = z.input<typeof portfolioReportInputSchema>;
const tool = portfolioTools.generatePortfolioReport;

function fixture(): Input {
  return {
    positions: [{ ticker: 'AAA', shares: 2, currentPrice: 50 }],
    histories: [{
      ticker: 'AAA',
      prices: [100, 80, ...Array<number>(19).fill(72)].map((price, index) => ({
        date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
        price,
      })),
    }],
    currency: 'USD',
  };
}

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}

function executeUnknown(input: unknown) {
  return tool.execute(input as Input);
}

test('known risk results and full report agree with the deterministic engine', () => {
  const input = fixture();
  const report = tool.execute(input);
  assert.deepEqual(report, generatePortfolioReport(input));
  assert.equal(report.risk.currentValue, 100);
  assert.equal(report.risk.confidence, 0.95);
  assert.equal(report.risk.returnCount, 20);
  near(report.risk.valueAtRisk.amount, 10);
  near(report.risk.conditionalValueAtRisk.amount, 20);
  near(report.risk.maxDrawdown, 0.28);
  near(report.risk.annualizedVolatility, Math.sqrt((0.05 - 20 * 0.015 ** 2) / 19 * 252));
  near(report.correlations.matrix[0][0]!, 1);
  assert.equal(report.risk.concentration.effectiveHoldings, 1);
  assert.match(report.risk.warnings.join(' '), /fewer than 250/);
  assert.match(report.limitations.join(' '), /not forecasts/);
  assert.deepEqual(report.stressTests, []);
});

test('optional confidence and explicit scenarios preserve the engine contract', () => {
  const { scenarios, ...input } = {
    ...fixture(), confidence: 0.925,
    scenarios: [
      { name: 'Caller loss', returns: { AAA: -0.25 } },
      { name: 'Caller wipeout', returns: { AAA: -1 } },
      { name: 'Caller gain', returns: { AAA: 0.5 } },
    ],
  };
  const report = tool.execute({ ...input, scenarios });
  assert.deepEqual(report, generatePortfolioReport(input, scenarios));
  near(report.risk.conditionalValueAtRisk.returnLoss, (0.2 + 0.5 * 0.1) / 1.5);
  assert.deepEqual(report.stressTests[0], {
    name: 'Caller loss', currency: 'USD', currentValue: 100,
    stressedValue: 75, profitLoss: -25, portfolioReturn: -0.25,
  });
  assert.equal(report.stressTests[1].stressedValue, 0);
  assert.equal(report.stressTests[2].profitLoss, 50);
  assert.deepEqual(tool.execute({ ...input, scenarios: [] }).stressTests, []);
});

test('execute parses direct calls, rejecting malformed and unknown fields', () => {
  const invalid: unknown[] = [
    null, undefined, {}, { ...fixture(), extra: true },
    { ...fixture(), scenarios: null }, { ...fixture(), currency: ' ' },
    { ...fixture(), positions: [] }, { ...fixture(), histories: [] },
  ];
  for (const confidence of [0, 1, -0.1, 1.1, NaN, Infinity]) {
    invalid.push({ ...fixture(), confidence });
  }
  for (const value of [0, -1, NaN, Infinity]) {
    for (const field of ['shares', 'currentPrice'] as const) {
      const input = fixture();
      input.positions[0][field] = value;
      invalid.push(input);
    }
    const input = fixture();
    input.histories[0].prices[0].price = value;
    invalid.push(input);
  }
  for (const input of invalid) assert.throws(() => executeUnknown(input), z.ZodError);
  const nested = fixture();
  assert.throws(() => executeUnknown({
    ...nested, positions: [{ ...nested.positions[0], leverage: 2 }],
  }), z.ZodError);
  assert.throws(() => executeUnknown({
    ...nested, histories: [{ ...nested.histories[0], currency: 'EUR' }],
  }), z.ZodError);
});

test('direct calls preserve calendar, alignment and ticker validation', () => {
  for (const date of ['2025-02-30', '2025-13-01', 'invalid']) {
    const input = fixture();
    input.histories[0].prices[0].date = date;
    assert.throws(() => tool.execute(input), z.ZodError);
  }
  const duplicate = fixture();
  duplicate.histories[0].prices.push({ ...duplicate.histories[0].prices[0] });
  assert.throws(() => tool.execute(duplicate), /Duplicate date/);
  const short = fixture();
  short.histories[0].prices.pop();
  assert.throws(() => tool.execute(short), /At least 20 aligned returns/);
  const input = fixture();
  assert.throws(() => tool.execute({ ...input, positions: [...input.positions, ...input.positions] }), /Duplicate tickers/);
  assert.throws(() => tool.execute({ ...input, histories: [{ ...input.histories[0], ticker: 'BBB' }] }), /every portfolio ticker/);
});

test('direct calls reject incomplete, extra and invalid explicit shocks', () => {
  for (const returns of [{}, { BBB: 0 }, { AAA: 0, BBB: 0 }, { AAA: -1.01 }, { AAA: NaN }, { AAA: Infinity }]) {
    assert.throws(() => executeUnknown({ ...fixture(), scenarios: [{ name: 'Caller', returns }] }));
  }
  assert.throws(() => tool.execute({ ...fixture(), scenarios: [{ name: ' ', returns: { AAA: 0 } }] }), z.ZodError);
  assert.throws(() => executeUnknown({
    ...fixture(), scenarios: [{ name: 'Caller', returns: { AAA: 0 }, inferred: true }],
  }), z.ZodError);
});

test('SDK parameters and direct execution enforce the same payload limits', () => {
  const input = fixture();
  const invalid: unknown[] = [
    { ...input, positions: Array(11).fill(input.positions[0]) },
    { ...input, histories: Array(11).fill(input.histories[0]) },
    { ...input, histories: [{ ...input.histories[0], prices: Array(252).fill(input.histories[0].prices[0]) }] },
    { ...input, scenarios: Array(11).fill({ name: 'Caller', returns: { AAA: 0 } }) },
    { ...input, positions: [{ ...input.positions[0], ticker: 'A'.repeat(33) }] },
    { ...input, histories: [{ ...input.histories[0], ticker: 'A'.repeat(33) }] },
    { ...input, currency: 'A'.repeat(17) },
    { ...input, scenarios: [{ name: 'A'.repeat(129), returns: { AAA: 0 } }] },
    { ...input, scenarios: [{ name: 'Caller', returns: { ['A'.repeat(33)]: 0 } }] },
    { ...input, scenarios: [{ name: 'Caller', returns: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`T${index}`, 0])) }] },
  ];
  for (const value of invalid) {
    assert.equal(tool.parameters.safeParse(value).success, false);
    assert.throws(() => executeUnknown(value), z.ZodError);
  }
});

test('limits permit 10 holdings, 250 returns and 10 scenarios', () => {
  const tickers = Array.from({ length: 10 }, (_, index) => `T${index}`);
  const input: Input = {
    positions: tickers.map((ticker) => ({ ticker, shares: 1, currentPrice: 100 })),
    histories: tickers.map((ticker) => ({
      ticker,
      prices: Array.from({ length: 251 }, (_, index) => ({
        date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10), price: 100,
      })),
    })),
    currency: 'USD',
    scenarios: Array.from({ length: 10 }, (_, index) => ({
      name: `Caller ${index}`, returns: Object.fromEntries(tickers.map((ticker) => [ticker, -0.1])),
    })),
  };
  const report = tool.execute(input);
  assert.equal(report.risk.returnCount, 250);
  assert.deepEqual(report.risk.warnings, []);
  assert.equal(report.correlations.matrix.length, 10);
  assert.deepEqual(report.correlations.matrix[0], Array(10).fill(null));
  assert.equal(report.stressTests.length, 10);
  near(report.stressTests[0].profitLoss, -100);
});

test('input and scenarios are unmodified and output mutations cannot affect subsequent reports', () => {
  const input = fixture();
  input.positions[0].ticker = ' AAA ';
  input.currency = ' USD ';
  input.scenarios = [{ name: ' Caller ', returns: { AAA: -0.25 } }];
  input.histories[0].prices.reverse();
  const snapshot = structuredClone(input);
  const report = tool.execute(input);
  const expected = structuredClone(report);
  assert.deepEqual(input, snapshot);
  assert.equal(report.risk.currency, 'USD');
  assert.equal(report.stressTests[0].name, 'Caller');
  report.risk.dates[0] = 'changed';
  report.risk.historicalValues[0] = 0;
  report.risk.concentration.weights[0].ticker = 'changed';
  report.correlations.tickers[0] = 'changed';
  report.correlations.matrix[0][0] = null;
  report.stressTests[0].profitLoss = 0;
  report.limitations.length = 0;
  assert.deepEqual(input, snapshot);
  assert.deepEqual(tool.execute(input), expected);
});

test('tool needs no API configuration and performs no fetch, HTTP or socket calls', async (context) => {
  const forbidden = () => { throw new Error('Network access is forbidden'); };
  context.mock.method(globalThis, 'fetch', forbidden);
  context.mock.method(http, 'request', forbidden);
  context.mock.method(http, 'get', forbidden);
  context.mock.method(https, 'request', forbidden);
  context.mock.method(https, 'get', forbidden);
  context.mock.method(net.Socket.prototype, 'connect', forbidden);
  const { portfolioTools: standalone } = await import('./portfolio-tools');
  assert.deepEqual(standalone.generatePortfolioReport.execute(fixture()), generatePortfolioReport(fixture()));
});

test('description requires sourced observations and disallows invented data, leverage and mixed FX', () => {
  assert.match(tool.description, /real sourced same-currency adjusted price history/);
  assert.match(tool.description, /not invented model values/);
  assert.match(tool.description, /Short\/leveraged positions and mixed FX are unsupported/);
  assert.match(tool.description, /must not be fabricated or inferred/);
});