import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import test from 'node:test';
import { analyzeMarket, marketAnalysisInputSchema, type MarketAnalysisInput } from './analysis';

function date(index: number): string {
  return new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10);
}

function history(ticker: string, prices: number[]) {
  return { ticker, prices: prices.map((price, index) => ({ date: date(index), price })) };
}

function fixture(values = Array.from({ length: 201 }, (_, index) => 100 + index)): MarketAnalysisInput {
  return {
    histories: [history('MARKET', values), history('SECTOR', Array<number>(values.length).fill(100))],
    marketTicker: 'MARKET',
    sectorTickers: ['SECTOR'],
    priceBasis: 'TOTAL_RETURN',
    asOf: date(values.length - 1),
  };
}

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}

test('linear growth, falling and constant fixtures have known momentum and regimes', () => {
  const rising = analyzeMarket(fixture());
  assert.equal(rising.regime, 'BULL_TRENDING');
  assert.equal(rising.direction, 'bullish');
  near(rising.indicators.trend.totalReturn, 2);
  near(rising.indicators.momentum[0].totalReturn, 300 / 280 - 1);
  assert.equal(rising.indicators.trend.startDate, date(0));
  assert.equal(rising.asOf, date(200));
  const falling = analyzeMarket(fixture(Array.from({ length: 201 }, (_, index) => 300 - index)));
  assert.equal(falling.regime, 'BEAR_TRENDING');
  near(falling.indicators.trend.totalReturn, -2 / 3);
  const constant = analyzeMarket(fixture(Array<number>(201).fill(100)));
  assert.equal(constant.regime, 'SIDEWAYS');
  assert.equal(constant.indicators.annualizedRealizedVolatility, 0);
  assert.equal(constant.indicators.trend.totalReturn, 0);
});

test('sample realized volatility and threshold precedence are explicit and configurable', () => {
  const input = fixture([100, 110, 99]);
  input.horizons = [1, 2];
  input.config = { regimeWindow: 2, volatilityWindow: 2, trendThreshold: 0, annualizationFactor: 252, volatileThreshold: 1, crisisThreshold: 3 };
  const expected = Math.sqrt(0.02 * 252);
  const result = analyzeMarket(input);
  near(result.indicators.annualizedRealizedVolatility, expected);
  assert.equal(result.regime, 'BEAR_VOLATILE');
  input.config.crisisThreshold = expected;
  assert.equal(analyzeMarket(input).regime, 'CRISIS');
  input.config = { ...input.config, crisisThreshold: 3, volatileThreshold: expected };
  assert.equal(analyzeMarket(input).regime, 'BEAR_VOLATILE');
  input.histories[0] = history('MARKET', [100, 90, 108]);
  input.config.crisisThreshold = 5;
  assert.equal(analyzeMarket(input).regime, 'BULL_VOLATILE');
  input.config.trendThreshold = 0.1;
  const sideways = analyzeMarket(input);
  assert.equal(sideways.regime, 'SIDEWAYS');
  assert.match(sideways.warnings.join(' '), /sideways despite elevated/);
});

test('sector ranks compare the same dated horizons and preserve ties without invented classifications', () => {
  const input = fixture();
  input.sectorTickers = ['SLOW', 'FAST', 'TIE'];
  input.histories = [input.histories[0], history('SLOW', Array<number>(201).fill(100)),
    history('FAST', Array.from({ length: 201 }, (_, index) => 100 + index)),
    history('TIE', Array.from({ length: 201 }, (_, index) => 100 + index))];
  for (const ranking of analyzeMarket(input).sectorRankings) {
    assert.deepEqual(ranking.entries.map((entry) => [entry.ticker, entry.rank]), [['FAST', 1], ['TIE', 1], ['SLOW', 3]]);
    assert.equal(ranking.endDate, date(200));
    assert.equal(ranking.startDate, date(200 - ranking.horizon));
    assert.equal(ranking.entries[0].excessReturnVsMarket, 0);
  }
});

test('ranks each momentum horizon independently and treats trend threshold boundaries as sideways', () => {
  const input = fixture([100, 100, 100]);
  input.horizons = [1, 2];
  input.config = { regimeWindow: 2, volatilityWindow: 2 };
  input.sectorTickers = ['EARLY', 'LATE'];
  input.histories = [input.histories[0], history('EARLY', [100, 120, 110]), history('LATE', [100, 90, 110])];
  const rankings = analyzeMarket(input).sectorRankings;
  assert.deepEqual(rankings[0].entries.map((entry) => [entry.ticker, entry.rank]), [['LATE', 1], ['EARLY', 2]]);
  assert.deepEqual(rankings[1].entries.map((entry) => [entry.ticker, entry.rank]), [['EARLY', 1], ['LATE', 1]]);
  for (const endPrice of [102, 98]) {
    input.histories[0] = history('MARKET', [100, 100, endPrice]);
    input.config.trendThreshold = Math.abs(endPrice / 100 - 1);
    assert.equal(analyzeMarket(input).regime, 'SIDEWAYS');
  }
});

test('aligns dates before ranks and market indicators, excludes future data and reports effective asOf', () => {
  const input = fixture([100, 110, 120, 130, 140, 150]);
  input.asOf = date(4);
  input.horizons = [2];
  input.config = { regimeWindow: 2, volatilityWindow: 2 };
  input.histories[1].prices = [
    { date: date(3), price: 130 }, { date: date(0), price: 100 }, { date: date(2), price: 120 },
    { date: date(5), price: 999 },
  ];
  const result = analyzeMarket(input);
  assert.deepEqual(result.alignment.dates, [date(0), date(2), date(3)]);
  assert.equal(result.asOf, date(3));
  assert.equal(result.requestedAsOf, date(4));
  near(result.indicators.trend.totalReturn, 0.3);
  near(result.sectorRankings[0].entries[0].totalReturn, 0.3);
  assert.deepEqual(result.alignment.discardedDates, [{ ticker: 'MARKET', count: 2 }, { ticker: 'SECTOR', count: 0 }]);
  assert.match(result.warnings.join(' '), /Unmatched dates.*after requested asOf.*earlier than requested/);
});

test('rejects insufficient raw or common lookback rather than changing configured windows', () => {
  assert.throws(() => analyzeMarket(fixture(Array<number>(200).fill(100))), /201 common price dates/);
  const input = fixture();
  input.histories[1].prices.pop();
  assert.throws(() => analyzeMarket(input), /received 200/);
  input.histories[1].prices = input.histories[1].prices.map((point, index) => ({ ...point, date: date(300 + index) }));
  input.asOf = date(500);
  assert.throws(() => analyzeMarket(input), /received 0/);
});

test('deterministic and nonmutating even with unsorted histories and horizons', () => {
  const input = fixture();
  input.histories.reverse();
  for (const series of input.histories) series.prices.reverse();
  input.horizons = [200, 20, 60];
  const original = structuredClone(input);
  const first = analyzeMarket(input);
  assert.deepEqual(first, analyzeMarket(input));
  assert.deepEqual(input, original);
  const reordered = structuredClone(input);
  reordered.histories.reverse();
  assert.deepEqual(analyzeMarket(reordered), first);
  assert.deepEqual(first.indicators.momentum.map((entry) => entry.horizon), [20, 60, 200]);
});

test('schema rejects malformed payloads, duplicate canonical tickers, dates and invalid config', () => {
  const invalid: unknown[] = [null, {}, { ...fixture(), unexpected: true },
    { ...fixture(), asOf: '2025-02-30' }, { ...fixture(), priceBasis: 'RAW' },
    { ...fixture(), horizons: [20, 20] }, { ...fixture(), horizons: [0] },
    { ...fixture(), horizons: [501] }, { ...fixture(), config: { volatilityWindow: 1 } },
    { ...fixture(), config: { crisisThreshold: 0.2 } },
    { ...fixture(), config: { volatileThreshold: Number.POSITIVE_INFINITY } },
    { ...fixture(), config: { annualizationFactor: 0 } },
    { ...fixture(), config: { trendThreshold: -0.1 } },
    { ...fixture(), sectorTickers: ['market'] },
    { ...fixture(), marketTicker: 'MISSING' }, { ...fixture(), sectorTickers: [] }];
  for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const input = fixture();
    input.histories[0].prices[0].price = price;
    invalid.push(input);
  }
  for (const badDate of ['2025-02-29', '2025-13-01', '2025-1-01', 'not-a-date']) {
    const input = fixture();
    input.histories[0].prices[0].date = badDate;
    invalid.push(input);
  }
  const duplicateDate = fixture();
  duplicateDate.histories[0].prices[1].date = duplicateDate.histories[0].prices[0].date;
  invalid.push(duplicateDate);
  const duplicateTicker = fixture();
  duplicateTicker.histories[1].ticker = ' market ';
  invalid.push(duplicateTicker);
  for (const input of invalid) {
    assert.equal(marketAnalysisInputSchema.safeParse(input).success, false);
    assert.throws(() => analyzeMarket(input));
  }
  const leap = fixture();
  leap.histories[0].prices[0].date = '2024-02-29';
  assert.equal(marketAnalysisInputSchema.safeParse(leap).success, true);
});

test('bounds inputs at twelve series and 501 points, permitting maximum configured lookback', () => {
  const input = fixture(Array<number>(501).fill(100));
  input.horizons = [500];
  input.config = { regimeWindow: 500, volatilityWindow: 500 };
  input.sectorTickers = Array.from({ length: 11 }, (_, index) => `SECTOR${index}`);
  input.histories = [input.histories[0], ...input.sectorTickers.map((ticker) => history(ticker, Array<number>(501).fill(100)))];
  assert.equal(analyzeMarket(input).alignment.observationCount, 501);
  const tooManySeries = structuredClone(input);
  tooManySeries.histories.push(history('EXTRA', [100]));
  assert.equal(marketAnalysisInputSchema.safeParse(tooManySeries).success, false);
  input.histories[0].prices.push({ date: date(501), price: 100 });
  assert.equal(marketAnalysisInputSchema.safeParse(input).success, false);
});

test('rejects price-ratio overflow, underflow and variance overflow with finite input prices', () => {
  for (const values of [
    [Number.MIN_VALUE, 100, Number.MAX_VALUE],
    [Number.MAX_VALUE, 100, Number.MIN_VALUE],
    [1, 1e200, 1],
  ]) {
    const input = fixture(values);
    input.horizons = [2];
    input.config = { regimeWindow: 2, volatilityWindow: 2 };
    assert.throws(() => analyzeMarket(input), /numeric range/);
  }
});

test('runs without network access and reports caller-data and historical-only limitations', (context) => {
  const prohibitNetwork = () => { throw new Error('Network access prohibited'); };
  const spies = [
    context.mock.method(globalThis, 'fetch', prohibitNetwork),
    context.mock.method(http, 'request', prohibitNetwork),
    context.mock.method(http, 'get', prohibitNetwork),
    context.mock.method(https, 'request', prohibitNetwork),
    context.mock.method(https, 'get', prohibitNetwork),
    context.mock.method(net, 'connect', prohibitNetwork),
    context.mock.method(net, 'createConnection', prohibitNetwork),
    context.mock.method(net.Socket.prototype, 'connect', prohibitNetwork),
  ];
  const input = fixture();
  input.priceBasis = 'ADJUSTED_PRICE';
  const result = analyzeMarket(input);
  assert.match(result.warnings.join(' '), /dividend reinvestment is not inferred/);
  assert.match(result.limitations.join(' '), /no forecasts, allocation recommendations, or optimization/);
  assert.match(result.limitations.join(' '), /tickers do not establish sector membership/);
  for (const spy of spies) assert.equal(spy.mock.callCount(), 0);
});