import assert from 'node:assert/strict';
import test from 'node:test';
import { portfolioTools } from '../ai/tools/portfolio-tools';
import {
  createPortfolioRiskResponse,
  MAX_PORTFOLIO_INPUT_BYTES,
  parsePortfolioReportJson,
} from './risk-http';

function fixture() {
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
    scenarios: [{ name: 'Caller loss', returns: { AAA: -0.25 } }],
  };
}

function request(body: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/portfolio/risk', {
    method: 'POST', body, headers: { 'content-type': 'application/json', ...headers },
  });
}

test('authenticated JSON returns the existing tool report and known results', async () => {
  const input = fixture();
  const response = await createPortfolioRiskResponse(request(JSON.stringify(input)), true);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const report = await response.json();
  assert.deepEqual(report, portfolioTools.generatePortfolioReport.execute(input));
  assert.equal(report.risk.currentValue, 100);
  assert.equal(report.risk.returnCount, 20);
  assert.ok(Math.abs(report.risk.valueAtRisk.amount - 10) < 1e-10);
  assert.equal(report.stressTests[0].profitLoss, -25);
  assert.ok(report.limitations.length > 0);
});

test('unauthenticated requests are rejected without reading their body', async () => {
  const input = request('secret invalid JSON');
  const response = await createPortfolioRiskResponse(input, false);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Unauthorized.' });
  assert.equal(input.bodyUsed, false);
});

test('JSON, strict schema, and calculation errors are sanitized 400 responses', async () => {
  const short = fixture();
  short.histories[0].prices.pop();
  const overflow = fixture();
  overflow.positions[0].shares = 1e308;
  const bodies = [
    'secret invalid JSON', '', 'null', '{}',
    JSON.stringify({ ...fixture(), secret: 'do-not-echo' }),
    JSON.stringify({ ...fixture(), positions: [{ ...fixture().positions[0], secret: 'do-not-echo' }] }),
    JSON.stringify(short), JSON.stringify(overflow),
  ];
  for (const body of bodies) {
    const response = await createPortfolioRiskResponse(request(body), true);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /^(Invalid JSON\.|Invalid portfolio input\.|Unable to calculate portfolio report\.)$/);
  }
  const response = await createPortfolioRiskResponse(request('{}', { 'content-type': 'text/plain' }), true);
  assert.equal(response.status, 400);
});

test('direct parser reuses strict schema and measures UTF-8 bytes', () => {
  assert.throws(() => parsePortfolioReportJson(JSON.stringify({ ...fixture(), unknown: true })), /Invalid portfolio input/);
  assert.throws(() => parsePortfolioReportJson('é'.repeat(MAX_PORTFOLIO_INPUT_BYTES / 2 + 1)), /exceeds 1 MiB/);
});

test('exactly 1 MiB is accepted and one extra byte is rejected', async () => {
  const json = JSON.stringify(fixture());
  const exact = json.padEnd(MAX_PORTFOLIO_INPUT_BYTES, ' ');
  assert.equal((await createPortfolioRiskResponse(request(exact), true)).status, 200);
  assert.equal((await createPortfolioRiskResponse(request(`${exact} `), true)).status, 413);
});

test('streamed size limit ignores missing or dishonest content-length and cancels', async () => {
  for (const contentLength of [undefined, '1']) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(64 * 1024).fill(32));
      },
      cancel() { cancelled = true; },
    });
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (contentLength) headers['content-length'] = contentLength;
    const input = new Request('http://localhost/api/portfolio/risk', {
      method: 'POST', body: stream, headers, duplex: 'half',
    } as RequestInit);
    const response = await createPortfolioRiskResponse(input, true);
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'Portfolio input exceeds 1 MiB.' });
    assert.equal(cancelled, true);
  }
});

test('invalid UTF-8 and failing streams return sanitized errors', async () => {
  for (const body of [
    new Uint8Array([0xff]),
    new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('secret-stream-error')); } }),
  ]) {
    const input = new Request('http://localhost/api/portfolio/risk', {
      method: 'POST', body, headers: { 'content-type': 'application/json' }, duplex: 'half',
    } as RequestInit);
    const response = await createPortfolioRiskResponse(input, true);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Invalid portfolio request.' });
  }
});