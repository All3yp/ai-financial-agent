import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSECCompanyFacts } from './sec-xbrl';
import { SECClient } from './sec-filings';

function fixture() {
  const observation = { start: '2026-01-01', end: '2026-06-30', val: 10, accn: '0000320193-26-000001', form: '10-Q', filed: '2026-07-30', fy: 2026, fp: 'Q2' };
  return { cik: 320193, entityName: 'Apple', facts: { 'us-gaap': { Revenues: {
    label: 'Revenue', description: 'Revenue facts', units: {
      USD: [observation, { ...observation, start: '2026-04-01', val: 6 }, { ...observation, val: 11, filed: '2026-08-30', form: '10-Q/A' }],
      EUR: [{ ...observation, val: 9 }],
    },
  } } } };
}

test('preserves units, YTD and quarterly durations and excludes future filings as of a date', () => {
  const result = parseSECCompanyFacts(fixture(), '0000320193', { ticker: 'AAPL', concepts: ['Revenues'], asOf: '2026-08-01' });
  const rows = result.facts[0].observations;
  assert.equal(rows.length, 3);
  assert.deepEqual(new Set(rows.map((row) => row.unit)), new Set(['USD', 'EUR']));
  assert.ok(rows.some((row) => row.start === '2026-04-01'));
  assert.ok(rows.some((row) => row.start === '2026-01-01'));
  assert.ok(rows.every((row) => row.filed === '2026-07-30'));
  assert.match(result.metadata.warnings.join(' '), /year-to-date/);
});

test('missing concepts are explicit and truncation is reported', () => {
  const result = parseSECCompanyFacts(fixture(), '0000320193', { ticker: 'AAPL', concepts: ['Revenues', 'Assets'], limitPerConcept: 1 });
  assert.equal(result.facts[0].truncated, true);
  assert.equal(result.facts[0].observations[0].value, 11);
  assert.deepEqual(result.facts[1].observations, []);
  assert.equal(result.facts[1].label, null);
  assert.match(result.metadata.warnings.join(' '), /unavailable/);
});

test('invalid company, values and dates are rejected without disclosing payloads', () => {
  assert.throws(() => parseSECCompanyFacts(fixture(), '0000000001', { ticker: 'AAPL', concepts: ['Revenues'] }), /mismatched/);
  const payload = fixture();
  payload.facts['us-gaap'].Revenues.units.USD[0].val = Infinity;
  assert.throws(() => parseSECCompanyFacts(payload, '0000320193', { ticker: 'AAPL', concepts: ['Revenues'] }), /invalid XBRL/);
  assert.throws(() => parseSECCompanyFacts(fixture(), '0000320193', { ticker: 'AAPL', concepts: ['Revenues'], asOf: '2026-02-30' }));
});

test('client fetches companyfacts through the shared SEC transport', async () => {
  const calls: string[] = [];
  const client = new SECClient('Tests contact@company.test', (async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify(String(url).includes('company_tickers')
      ? { '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple' } } : fixture()));
  }) as typeof fetch);
  const result = await client.getSECFinancialFacts({ ticker: 'AAPL', concepts: ['Revenues'] });
  assert.equal(result.facts[0].observations.length, 4);
  assert.equal(calls[1], 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json');
});

test('sections download only the official primary document of a discovered accession', async () => {
  const calls: string[] = [];
  const client = new SECClient('Tests contact@company.test', (async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('annual.htm')) return new Response('<h1>Item 1. Business</h1><p>Actual business operations.</p><h1>Item 1A. Risk Factors</h1><p>Competition and financing risks.</p><h1>Item 2. Properties</h1><p>Offices.</p>', { headers: { 'content-type': 'text/html' } });
    return new Response(JSON.stringify(String(url).includes('company_tickers')
      ? { '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple' } }
      : { cik: 320193, name: 'Apple', filings: { recent: {
        accessionNumber: ['0000320193-26-000001'], filingDate: ['2026-01-01'], reportDate: ['2025-12-31'], form: ['10-K'], primaryDocument: ['annual.htm'],
      } } }));
  }) as typeof fetch);
  const result = await client.getSECFilingSections({ ticker: 'AAPL', formType: '10-K', accessionNumber: '0000320193-26-000001' });
  assert.match(result.sections.business.text ?? '', /Actual business/);
  assert.equal(result.sections.mdAndA.text, null);
  assert.equal(calls[2], 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/annual.htm');
  await assert.rejects(client.getSECFilingSections({ ticker: 'AAPL', formType: '10-K', accessionNumber: '0000320193-26-999999' }), /not found/);
  assert.equal(calls.length, 3);
});