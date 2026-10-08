import assert from 'node:assert/strict';
import test from 'node:test';
import { ResearchAgent } from './specialized';
import { FinancialToolsManager } from '../ai/tools/financial-tools';

class TestResearchAgent extends ResearchAgent {
  constructor(fetcher: typeof fetch) {
    super('test');
    this.toolsManager = new FinancialToolsManager({
      financialData: { provider: 'financial-datasets', apiKeys: { 'financial-datasets': 'test' } },
      fetcher,
    });
  }
}

test('ResearchAgent unwraps normalized price history before measuring data quality', async () => {
  const prices = Array.from({ length: 25 }, (_, index) => ({
    time: new Date(Date.UTC(2026, 8, index + 1)).toISOString().slice(0, 10),
    open: 10, high: 11, low: 9, close: 10, volume: 100,
  }));
  const fetcher = (async (input) => {
    const path = new URL(String(input)).pathname;
    const payload = path === '/prices/snapshot' ? { snapshot: { price: 10 } }
      : path === '/prices/' ? { prices }
      : path.includes('income-statements') ? { income_statements: [] }
      : path.includes('balance-sheets') ? { balance_sheets: [] }
      : path.includes('cash-flow-statements') ? { cash_flow_statements: [] }
      : { financial_metrics: [] };
    return new Response(JSON.stringify(payload));
  }) as typeof fetch;
  const result = await new TestResearchAgent(fetcher).execute({
    id: 'research-envelope-test', agentId: 'research-agent', type: 'research',
    input: { ticker: 'AAPL', period: 'quarterly', limit: 20 },
    status: 'pending', createdAt: new Date(),
  });
  assert.deepEqual(result.prices, prices);
  assert.equal(result.dataQuality, 'partial');
});