import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FinancialDataClient } from './financial-data';
import type { FinancialDataConfig, FinancialDataProvider } from './financial-data-config';

function config(provider: FinancialDataConfig['provider'], apiKeys?: FinancialDataConfig['apiKeys']): FinancialDataConfig {
  return { provider, apiKeys: apiKeys ?? { [provider]: 'secret-key' } };
}

function mock(handler: (url: URL, init?: RequestInit) => unknown | Promise<unknown>) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const data = await handler(url, init);
    return data instanceof Response ? data : new Response(JSON.stringify(data), { status: 200 });
  }) as typeof fetch;
  return { fetcher, calls };
}

const daily = { date: '2026-10-01', open: 10, high: 12, low: 9, close: 11, volume: 100 };
const fmpQuote = [{ price: 11, change: 1, changePercentage: 10, marketCap: 1000, volume: 100, timestamp: 1790812800 }];

test('FMP stable prices have nested snapshot and bounded ascending history', async () => {
  const { fetcher, calls } = mock((url) => url.pathname.endsWith('/quote') ? fmpQuote : [daily, { ...daily, date: '2026-09-30' }]);
  const data = await new FinancialDataClient(config('fmp'), fetcher).request('prices', { ticker: 'AAPL', start_date: '2026-10-01', end_date: '2026-10-02' });
  assert.equal(data.snapshot.snapshot.market_cap, 1000);
  assert.equal(data.snapshot.snapshot.price, 11);
  assert.equal(data.historical.ticker, 'AAPL');
  assert.deepEqual(data.historical.prices, [{ ...daily, date: undefined, time: daily.date }].map(({ date, ...row }) => row));
  assert.equal(data.metadata.provider, 'fmp');
  assert.ok(!Number.isNaN(Date.parse(data.metadata.fetched_at)));
  const history = calls.find(({ url }) => url.pathname.endsWith('/historical-price-eod/full'))!.url;
  assert.equal(history.searchParams.get('from'), '2026-10-01');
  assert.equal(history.searchParams.get('to'), '2026-10-02');
  assert.ok(calls.every(({ url }) => url.pathname.startsWith('/stable/')));
});

test('auto prices prefer Twelve Data and preserve forex symbols with numeric conversion', async () => {
  const { fetcher, calls } = mock((url) => url.pathname === '/quote'
    ? { close: '1.2', change: '0.1', percent_change: '9', datetime: '2026-10-01' }
    : { values: [{ datetime: '2026-10-01', open: '1', high: '1.3', low: '0.9', close: '1.2' }] });
  const data = await new FinancialDataClient(config('auto', { 'twelve-data': 'twelve', fmp: 'fmp', 'alpha-vantage': 'alpha', 'financial-datasets': 'fd' }), fetcher).request('prices', { ticker: 'EUR/USD' });
  assert.equal(data.metadata.source, 'twelve-data');
  assert.equal(data.snapshot.snapshot.market_cap, null);
  assert.equal(data.historical.prices[0].close, 1.2);
  assert.equal(data.historical.prices[0].volume, null);
  assert.ok(calls.every(({ url }) => url.hostname === 'api.twelvedata.com' && url.searchParams.get('symbol') === 'EUR/USD'));
  const series = calls.find(({ url }) => url.pathname === '/time_series')!.url;
  assert.equal(series.searchParams.get('interval'), '1day');
  assert.equal(series.searchParams.get('order'), 'asc');
  assert.equal(series.searchParams.get('outputsize'), '5000');
});

test('Alpha compact daily history warns about coverage and has null market cap', async () => {
  const { fetcher, calls } = mock((url) => url.searchParams.get('function') === 'GLOBAL_QUOTE'
    ? { 'Global Quote': { '05. price': '11', '06. volume': '100', '07. latest trading day': '2026-10-01', '09. change': '1', '10. change percent': '10%' } }
    : { 'Time Series (Daily)': { '2026-10-01': { '1. open': '10', '2. high': '12', '3. low': '9', '4. close': '11', '5. volume': '100' } } });
  const data = await new FinancialDataClient(config('alpha-vantage'), fetcher).request('prices', { ticker: 'IBM' });
  assert.equal(data.snapshot.snapshot.day_change_percent, 10);
  assert.equal(data.snapshot.snapshot.market_cap, null);
  assert.equal(data.historical.prices[0].open, 10);
  assert.match(data.metadata.warnings.join(' '), /100 trading days/);
  assert.equal(calls.find(({ url }) => url.searchParams.get('function') === 'TIME_SERIES_DAILY')!.url.searchParams.get('outputsize'), 'compact');
});

test('FMP statements use annual/quarter and TTM stable endpoints without fabricating values', async () => {
  for (const [operation, endpoint, field, source] of [
    ['income-statements', 'income-statement', 'revenue', 'revenue'],
    ['balance-sheets', 'balance-sheet-statement', 'total_assets', 'totalAssets'],
    ['cash-flow-statements', 'cash-flow-statement', 'net_cash_flow_from_operations', 'operatingCashFlow'],
  ]) {
    for (const period of ['annual', 'quarterly', 'ttm']) {
      const { fetcher, calls } = mock(() => [{ date: '2026-06-30', reportedCurrency: 'USD', [source]: '123', netIncome: 0 }]);
      const data = await new FinancialDataClient(config('fmp'), fetcher).request(operation, { ticker: 'AAPL', period });
      const row = data[operation.replaceAll('-', '_')][0];
      assert.equal(row[field], 123);
      assert.equal(row.period, period);
      assert.equal(row.currency, 'USD');
      assert.equal(calls[0].url.pathname, `/stable/${endpoint}${period === 'ttm' ? '-ttm' : ''}`);
      assert.equal(calls[0].url.searchParams.get('period'), period === 'ttm' ? null : period === 'annual' ? 'annual' : 'quarter');
      if (operation === 'income-statements') {
        assert.equal(row.net_income, 0);
        assert.equal(row.gross_profit, null);
        assert.equal(row.earnings_per_share, null);
      }
    }
  }
});

test('Alpha statements select actual annual and quarterly reports and reject TTM before fetch', async () => {
  for (const [operation, fn, field, source] of [
    ['income-statements', 'INCOME_STATEMENT', 'revenue', 'totalRevenue'],
    ['balance-sheets', 'BALANCE_SHEET', 'total_assets', 'totalAssets'],
    ['cash-flow-statements', 'CASH_FLOW', 'net_cash_flow_from_operations', 'operatingCashflow'],
  ]) {
    const { fetcher, calls } = mock(() => ({ annualReports: [{ fiscalDateEnding: '2025-12-31', [source]: '50' }], quarterlyReports: [{ fiscalDateEnding: '2026-06-30', [source]: 'None' }] }));
    const client = new FinancialDataClient(config('alpha-vantage'), fetcher);
    const annual = await client.request(operation, { ticker: 'IBM', period: 'annual' });
    assert.equal(annual[operation.replaceAll('-', '_')][0][field], 50);
    const quarterly = await client.request(operation, { ticker: 'IBM', period: 'quarterly' });
    assert.equal(quarterly[operation.replaceAll('-', '_')][0][field], null);
    assert.equal(calls[0].url.searchParams.get('function'), fn);
    await assert.rejects(client.request(operation, { ticker: 'IBM', period: 'ttm' }), /TTM statements are unavailable/);
    assert.equal(calls.length, 2);
  }
});

test('FMP metrics merge ratios by date rather than position, then apply report bounds', async () => {
  const { fetcher } = mock((url) => url.pathname.endsWith('/key-metrics')
    ? [{ date: '2026-06-30', marketCap: '100' }, { date: '2026-03-31', marketCap: 80 }]
    : [{ date: '2026-03-31', priceToEarningsRatio: 8 }, { date: '2026-06-30', priceToEarningsRatio: 10 }]);
  const data = await new FinancialDataClient(config('fmp'), fetcher).request('financial-metrics', { ticker: 'AAPL', period: 'quarterly', report_period_gte: '2026-04-01', report_period_lte: '2026-07-01' });
  assert.equal(data.financial_metrics.length, 1);
  assert.equal(data.financial_metrics[0].market_cap, 100);
  assert.equal(data.financial_metrics[0].price_to_earnings_ratio, 10);
  assert.equal(data.financial_metrics[0].peg_ratio, null);
});

test('FMP TTM metrics use TTM endpoints and never invent a report date', async () => {
  const { fetcher, calls } = mock((url) => url.pathname.endsWith('/key-metrics-ttm') ? [{ marketCap: 100 }] : [{ priceToEarningsRatioTTM: 10, grossProfitMarginTTM: 0.5 }]);
  const data = await new FinancialDataClient(config('fmp'), fetcher).request('financial-metrics', { ticker: 'AAPL' });
  assert.equal(data.financial_metrics[0].price_to_earnings_ratio, 10);
  assert.equal(data.financial_metrics[0].gross_margin, 0.5);
  assert.equal(data.financial_metrics[0].report_period, null);
  assert.equal(calls[1].url.pathname, '/stable/ratios-ttm');
});

test('Alpha OVERVIEW only supports a latest TTM snapshot with real LatestQuarter', async () => {
  const { fetcher, calls } = mock(() => ({ Symbol: 'IBM', LatestQuarter: '2026-06-30', PERatio: '12', MarketCapitalization: '100', EPS: 'None' }));
  const client = new FinancialDataClient(config('alpha-vantage'), fetcher);
  const data = await client.request('financial-metrics', { ticker: 'IBM' });
  assert.equal(data.financial_metrics[0].report_period, '2026-06-30');
  assert.equal(data.financial_metrics[0].price_to_earnings_ratio, 12);
  assert.equal(data.financial_metrics[0].earnings_per_share, null);
  await assert.rejects(client.request('financial-metrics', { ticker: 'IBM', period: 'annual' }), /historical financial metrics are unavailable/);
  assert.equal(calls.length, 1);
  const undated = await new FinancialDataClient(config('alpha-vantage'), mock(() => ({ Symbol: 'IBM' })).fetcher).request('financial-metrics', { ticker: 'IBM' });
  assert.equal(undated.financial_metrics[0].report_period, null);
});

test('news uses FMP symbols and Alpha timestamp normalization', async () => {
  for (const provider of ['fmp', 'alpha-vantage'] as const) {
    const { fetcher, calls } = mock(() => provider === 'fmp' ? [{ title: 'News', url: 'https://example.org/article', publishedDate: '2026-10-01 10:00:00', publisher: 'Paper', text: 'Summary' }] : { feed: [{ title: 'News', url: 'https://example.org/article', time_published: '20261001T100000', source: 'Paper', summary: 'Summary' }] });
    const data = await new FinancialDataClient(config(provider), fetcher).request('news', { ticker: 'AAPL', limit: 2 });
    assert.equal(data.news[0].title, 'News');
    assert.equal(data.news[0].summary, 'Summary');
    assert.match(data.news[0].date, /^2026-10-01/);
    assert.equal(calls[0].url.searchParams.get(provider === 'fmp' ? 'symbols' : 'tickers'), 'AAPL');
  }
});

test('search only uses configured Financial Datasets with POST filters', async () => {
  const filters = [{ field: 'revenue', operator: 'gt', value: 100 }];
  const { fetcher, calls } = mock(() => ({ search_results: [{ ticker: 'AAPL', revenue: 200 }] }));
  const data = await new FinancialDataClient(config('auto', { fmp: 'fmp', 'financial-datasets': 'fd' }), fetcher).request('search', { filters, limit: 3, period: 'annual' });
  assert.equal(data.search_results[0].ticker, 'AAPL');
  assert.equal(calls[0].url.pathname, '/financials/search/');
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal((calls[0].init?.headers as Record<string, string>)['X-API-Key'], 'fd');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { filters, limit: 3, period: 'annual' });
  await assert.rejects(new FinancialDataClient(config('fmp'), fetcher).request('search', { filters }), /does not support/);
  await assert.rejects(new FinancialDataClient(config('auto', { fmp: 'fmp' }), fetcher).request('search', { filters }), /No configured/);
  assert.equal(calls.length, 1);
});

test('FD price envelope and named fundamental arrays are retained', async () => {
  const { fetcher } = mock((url) => url.pathname === '/prices/snapshot' ? { snapshot: { price: 11, market_cap: null } } : url.pathname === '/prices/' ? { prices: [{ ...daily, time: daily.date }] } : { income_statements: [{ ticker: 'AAPL', report_period: '2026-06-30', revenue: null }] });
  const client = new FinancialDataClient(config('financial-datasets'), fetcher);
  const prices = await client.request('prices', { ticker: 'AAPL' });
  assert.equal(prices.historical.prices[0].close, 11);
  assert.equal(prices.snapshot.snapshot.market_cap, null);
  const statements = await client.request('income-statements', { ticker: 'AAPL' });
  assert.equal(statements.income_statements[0].revenue, null);
});

test('unsupported operations, periods, intervals and multipliers fail without fetching', async () => {
  const { fetcher, calls } = mock(() => []);
  const client = new FinancialDataClient(config('fmp'), fetcher);
  await assert.rejects(client.request('bad-secret', { ticker: 'AAPL' }), /Unsupported financial data operation/);
  await assert.rejects(client.request('income-statements', { ticker: 'AAPL', period: 'monthly' }), /unsupported period/);
  await assert.rejects(client.request('prices', { ticker: 'AAPL', interval: 'week' }), /only daily/);
  await assert.rejects(client.request('prices', { ticker: 'AAPL', multiplier: 2 }), /multiplier 1/);
  await assert.rejects(client.request('prices', { ticker: 'AAPL', interval: 'nonsense' }), /unsupported period, interval/);
  await assert.rejects(client.request('prices', { ticker: 'AAPL', start_date: '2026-02-30' }), /Invalid/);
  await assert.rejects(new FinancialDataClient(config('twelve-data'), fetcher).request('news', { ticker: 'AAPL' }), /does not support/);
  assert.equal(calls.length, 0);
});

test('HTTP200 error envelopes and transport failures are sanitized, with no explicit fallback', async () => {
  for (const [provider, payload] of [
    ['alpha-vantage', { Note: 'secret-key https://private.example' }],
    ['alpha-vantage', { Information: 'secret-key' }],
    ['alpha-vantage', { 'Error Message': 'secret-key' }],
    ['fmp', { 'Error Message': 'secret-key' }],
    ['twelve-data', { status: 'error', message: 'secret-key' }],
  ] as [FinancialDataProvider, unknown][]) {
    const { fetcher, calls } = mock(() => payload);
    await assert.rejects(new FinancialDataClient(config(provider, { [provider]: 'secret-key', 'financial-datasets': 'fd' }), fetcher).request(provider === 'twelve-data' ? 'prices' : 'news', { ticker: 'AAPL' }), (error: Error) => {
      assert.ok(!/secret-key|https:/.test(error.message));
      assert.match(error.message, /redacted/);
      return true;
    });
    assert.ok(calls.every(({ url }) => url.hostname !== 'api.financialdatasets.ai'));
  }
  for (const handler of [() => { throw new Error('https://host?apikey=secret-key'); }, () => new Response('secret-key', { status: 403 }), () => new Response('not-json secret-key')]) {
    await assert.rejects(new FinancialDataClient(config('fmp'), mock(handler).fetcher).request('news', { ticker: 'AAPL' }), (error: Error) => !/secret-key|https:/.test(error.message));
  }
});

test('auto fallback prefers FMP fundamentals, skips unavailable Alpha TTM, then uses configured FD', async () => {
  const { fetcher, calls } = mock((url) => url.hostname === 'financialmodelingprep.com' ? { 'Error Message': 'quota' } : { income_statements: [{ revenue: null }] });
  const data = await new FinancialDataClient(config('auto', { fmp: 'fmp', 'alpha-vantage': 'alpha', 'financial-datasets': 'fd' }), fetcher).request('income-statements', { ticker: 'AAPL' });
  assert.equal(data.metadata.source, 'financial-datasets');
  assert.equal(calls.length, 2);
  assert.match(data.metadata.warnings.join(' '), /fmp unavailable/);
  assert.match(data.metadata.warnings.join(' '), /alpha-vantage unavailable/);
});

test('promise cache deduplicates concurrently, retries rejection and stays client-local', async () => {
  let fail = true;
  const { fetcher, calls } = mock(() => fail ? { 'Error Message': 'quota' } : []);
  const client = new FinancialDataClient(config('fmp'), fetcher);
  const first = client.request('news', { ticker: 'AAPL', limit: 2 });
  const second = client.request('news', { limit: 2, ticker: 'AAPL' });
  assert.equal(first, second);
  await assert.rejects(first);
  assert.equal(calls.length, 1);
  fail = false;
  const retry = await client.request('news', { ticker: 'AAPL', limit: 2 });
  assert.deepEqual(retry.news, []);
  await client.request('news', { ticker: 'AAPL', limit: 2 });
  assert.equal(calls.length, 2);
  await new FinancialDataClient(config('fmp', { fmp: 'other-key' }), fetcher).request('news', { ticker: 'AAPL', limit: 2 });
  assert.equal(calls.length, 3);
  assert.equal(calls[2].url.searchParams.get('apikey'), 'other-key');
});

test('cache TTL is 60s for prices/news and 300s for fundamentals and cache is bounded', async () => {
  const original = Date.now;
  let now = original();
  Date.now = () => now;
  try {
    const { fetcher, calls } = mock((url) => url.pathname === '/stable/news/stock' ? [] : [{ date: '2026-06-30', revenue: 1 }]);
    const client = new FinancialDataClient(config('fmp'), fetcher);
    await client.request('news', { ticker: 'AAPL' });
    await client.request('income-statements', { ticker: 'AAPL', period: 'annual' });
    now += 60_001;
    await client.request('news', { ticker: 'AAPL' });
    await client.request('income-statements', { ticker: 'AAPL', period: 'annual' });
    assert.equal(calls.length, 3);
    now += 240_000;
    await client.request('income-statements', { ticker: 'AAPL', period: 'annual' });
    assert.equal(calls.length, 4);
    for (let index = 0; index < 130; index++) await client.request('news', { ticker: `T${index}` });
    const before = calls.length;
    await client.request('news', { ticker: 'T0' });
    assert.equal(calls.length, before + 1);
  } finally {
    Date.now = original;
  }
});

test('timeout aborts at 15 seconds even if a fetcher ignores abort', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | undefined;
  const fetcher = ((_input: unknown, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    return new Promise<Response>(() => {});
  }) as typeof fetch;
  const promise = new FinancialDataClient(config('fmp'), fetcher).request('news', { ticker: 'AAPL' });
  const rejected = assert.rejects(promise, /timed out/);
  context.mock.timers.tick(14_999);
  assert.equal(signal?.aborted, false);
  context.mock.timers.tick(1);
  await rejected;
  assert.equal(signal?.aborted, true);
});

test('malformed response schemas fail without exposing payload', async () => {
  for (const payload of [null, 'secret-key', { feed: 'secret-key' }]) {
    await assert.rejects(new FinancialDataClient(config('alpha-vantage'), mock(() => payload).fetcher).request('news', { ticker: 'AAPL' }), (error: Error) => !error.message.includes('secret-key'));
  }
  await assert.rejects(new FinancialDataClient(config('fmp'), mock(() => [{ date: 'invalid', revenue: 100 }]).fetcher).request('income-statements', { ticker: 'AAPL', period: 'annual' }), /Invalid financial report date/);
});