import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuantitativeTeamResponse } from './quantitative-http';

function request(body: string) {
  return new Request('https://local.test/api/agents/quantitative', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
}

test('requires authentication and rejects invalid or oversized input without echoing data', async () => {
  assert.equal((await createQuantitativeTeamResponse(request('private'), false)).status, 401);
  const bad = await createQuantitativeTeamResponse(request('private'), true);
  assert.equal(bad.status, 400);
  assert.ok(!(await bad.text()).includes('private'));
  assert.equal((await createQuantitativeTeamResponse(request('{}'), true)).status, 400);
  assert.equal((await createQuantitativeTeamResponse(request(' '.repeat(1024 * 1024 + 1)), true)).status, 413);
});

test('authenticated route produces deterministic specialist results with bounded histories', async () => {
  const prices = Array.from({ length: 201 }, (_, index) => ({ date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10), price: 100 + index }));
  const response = await createQuantitativeTeamResponse(request(JSON.stringify({ market: {
    histories: [{ ticker: 'SPY', prices }, { ticker: 'XLK', prices }],
    marketTicker: 'SPY', sectorTickers: ['XLK'], priceBasis: 'ADJUSTED_PRICE', asOf: prices.at(-1)!.date,
  } })), true);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.ok(JSON.stringify(data).includes('BULL_TRENDING'));
  assert.ok(JSON.stringify(data).includes('unsupported'));
});