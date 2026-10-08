import assert from 'node:assert/strict';
import test from 'node:test';
import { ResearchAgent, MonitorAgent } from './specialized';
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

class TestMonitorAgent extends MonitorAgent {
  constructor(fetcher: typeof fetch) {
    super('test');
    this.toolsManager = new FinancialToolsManager({
      financialData: { provider: 'financial-datasets', apiKeys: { 'financial-datasets': 'test' } },
      fetcher,
    });
  }
}

test('MonitorAgent uses latest normalized prices and recognizes a zero current ratio', async () => {
  const latestDate = new Date().toISOString().slice(0, 10);
  const previous = new Date();
  previous.setDate(previous.getDate() - 1);
  const previousDate = previous.toISOString().slice(0, 10);
  const fetcher = (async (input) => {
    const path = new URL(String(input)).pathname;
    const payload = path === '/prices/snapshot' ? { snapshot: { price: 70 } }
      : path === '/prices/' ? { prices: [
        { time: previousDate, open: 100, high: 101, low: 99, close: 100, volume: 100 },
        { time: latestDate, open: 100, high: 100, low: 69, close: 70, volume: 100 },
      ] }
      : { financial_metrics: [{ current_ratio: 0, debt_to_equity: null }] };
    return Response.json(payload);
  }) as typeof fetch;
  const result = await new TestMonitorAgent(fetcher).execute({
    id: 'monitor-envelope-test', agentId: 'monitor-agent', type: 'monitor',
    input: { positions: [{ ticker: 'AAPL', costBasis: 100, shares: 1 }] },
    status: 'pending', createdAt: new Date(),
  });
  const movement = result.alerts.find((alert: { type: string }) => alert.type === 'price_movement');
  assert.equal(movement.details.latestPrice, 70);
  assert.equal(movement.details.dailyChange, -30);
  assert.equal(movement.details.latestDate, latestDate);
  assert.ok(!movement.message.includes('today'));
  assert.ok(result.alerts.some((alert: { type: string }) => alert.type === 'drawdown'));
  assert.ok(result.alerts.some((alert: { type: string }) => alert.type === 'metric_deterioration'));
});