import assert from 'node:assert/strict';
import test from 'node:test';
import { FinancialToolsManager } from './financial-tools';

test('market and portfolio calculations are registered and validate direct calls', async () => {
  const tools = new FinancialToolsManager({ financialData: { provider: 'auto', apiKeys: {} } }).getTools();
  assert.equal(typeof tools.generatePortfolioReport.execute, 'function');
  assert.equal(typeof tools.analyzeMarket.execute, 'function');
  await assert.rejects(tools.analyzeMarket.execute({} as never));
  await assert.rejects(tools.generatePortfolioReport.execute({} as never));
  assert.equal(typeof tools.getSECFinancialFacts.execute, 'function');
  assert.equal(typeof tools.getSECFilingSections.execute, 'function');
  assert.equal(typeof tools.getYieldCurve.execute, 'function');
  assert.equal(typeof tools.getInflationData.execute, 'function');
});

test('SEC discovery is available through the manager without financial provider keys', async () => {
  const manager = new FinancialToolsManager({
    financialData: { provider: 'auto', apiKeys: {} },
    secUserAgent: 'TestApp contact@example.org',
    fetcher: (async (input) => new Response(JSON.stringify(String(input).includes('company_tickers')
      ? { '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple' } }
      : { cik: '320193', name: 'Apple', filings: { recent: {
        accessionNumber: ['0000320193-26-000001'], filingDate: ['2026-10-01'],
        reportDate: [''], form: ['8-K'], primaryDocument: ['event.htm'],
      } } }))) as typeof fetch,
  });
  const result = await manager.getTools().getSECFilings.execute({ ticker: 'AAPL', formType: '8-K' });
  assert.equal(result.filings[0].form, '8-K');
  assert.equal(result.metadata.source, 'sec-edgar');
});

test('tools use an explicitly selected alternative without Financial Datasets credentials', async () => {
  const calls: URL[] = [];
  const manager = new FinancialToolsManager({
    financialData: { provider: 'fmp', apiKeys: { fmp: 'test' } },
    fetcher: (async (input) => {
      calls.push(new URL(String(input)));
      return new Response(JSON.stringify([{ title: 'News', url: 'https://example.org', publishedDate: '2026-10-01', publisher: 'Paper' }]));
    }) as typeof fetch,
  });
  const tools = manager.getTools();
  const first = await tools.getNews.execute({ ticker: 'AAPL', limit: 5 });
  const second = await tools.getNews.execute({ ticker: 'AAPL', limit: 5 });
  assert.equal(first.news[0].title, 'News');
  assert.deepEqual(first, second);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].hostname, 'financialmodelingprep.com');
});

test('legacy Financial Datasets prices retain the renderer envelope and duplicate results', async () => {
  const manager = new FinancialToolsManager({
    financialDatasetsApiKey: 'legacy',
    financialData: { provider: 'financial-datasets', apiKeys: {} },
    fetcher: (async (input, init) => {
      assert.equal((init?.headers as Record<string, string>)['X-API-Key'], 'legacy');
      return new Response(JSON.stringify(String(input).includes('/snapshot')
        ? { snapshot: { price: 10 } }
        : { prices: [{ time: '2026-10-01', open: 9, high: 11, low: 8, close: 10, volume: 100 }] }));
    }) as typeof fetch,
  });
  const tool = manager.getTools().getStockPrices;
  const result = await tool.execute({ ticker: 'AAPL' });
  assert.equal(result.snapshot.snapshot.price, 10);
  assert.equal(result.historical.prices[0].close, 10);
  assert.deepEqual(await tool.execute({ ticker: 'AAPL' }), result);
});

test('screen loading is cleared on failure and a failed request can be retried', async () => {
  const events: Array<{ content: { isLoading: boolean } }> = [];
  let calls = 0;
  const manager = new FinancialToolsManager({
    financialData: { provider: 'financial-datasets', apiKeys: { 'financial-datasets': 'test' } },
    dataStream: { writeData: (data) => events.push(data as { content: { isLoading: boolean } }) },
    fetcher: (async () => {
      calls += 1;
      return calls === 1 ? new Response('', { status: 429 }) : new Response(JSON.stringify({ search_results: [] }));
    }) as typeof fetch,
  });
  const tool = manager.getTools().searchStocksByFilters;
  await assert.rejects(tool.execute({ filters: [] }));
  assert.deepEqual(events.map((event) => event.content.isLoading), [true, false]);
  assert.deepEqual((await tool.execute({ filters: [] })).search_results, []);
  assert.equal(calls, 2);
});