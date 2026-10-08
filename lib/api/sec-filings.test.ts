import assert from 'node:assert/strict';
import test from 'node:test';
import { SECClient } from './sec-filings';

const directory = { '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple' } };
function submissions() {
  return {
    cik: '320193', name: 'Apple Inc.',
    filings: {
      recent: {
        accessionNumber: ['0000320193-26-000001', '0000320193-26-000003', '0000320193-26-000002'],
        filingDate: ['2026-01-01', '2026-10-01', '2026-09-01'],
        reportDate: ['2025-12-31', '', '2026-06-30'],
        form: ['10-K', '8-K', '10-K'],
        primaryDocument: ['annual.htm', 'event.htm', 'new-annual.htm'],
      },
      files: [] as Array<{ name: string }>,
    },
  };
}

function client(handler: (url: string) => unknown = (url) => url.includes('company_tickers') ? directory : submissions()) {
  const calls: string[] = [];
  return {
    calls,
    sec: new SECClient('TestApp real-contact@example.org', (async (input, init) => {
      assert.equal((init?.headers as Record<string, string>)['User-Agent'], 'TestApp real-contact@example.org');
      assert.equal(init?.redirect, 'error');
      calls.push(String(input));
      const data = handler(String(input));
      return data instanceof Response ? data : new Response(JSON.stringify(data));
    }) as typeof fetch),
  };
}

test('filters forms, sorts by date, limits rows and builds official safe archive links', async () => {
  const { sec, calls } = client();
  const result = await sec.getSECFilings({ ticker: ' aapl ', formType: '10-K', limit: 1, includeHistorical: false });
  assert.equal(result.cik, '0000320193');
  assert.equal(result.companyName, 'Apple Inc.');
  assert.equal(result.filings.length, 1);
  assert.equal(result.filings[0].filingDate, '2026-09-01');
  assert.equal(result.filings[0].documentUrl, 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000002/new-annual.htm');
  assert.match(result.filings[0].indexUrl, /0000320193-26-000002-index.html$/);
  assert.equal(result.metadata.coverage, 'recent-submissions');
  assert.match(result.metadata.warnings.join(' '), /older archive pages/);
  assert.equal(calls[1], 'https://data.sec.gov/submissions/CIK0000320193.json');
});

test('concurrent queries reuse directory and submissions and preserve missing report dates', async () => {
  const { sec, calls } = client();
  const [first, second] = await Promise.all([
    sec.getSECFilings({ ticker: 'AAPL', formType: '8-K' }),
    sec.getSECFilings({ ticker: 'AAPL', formType: '10-K' }),
  ]);
  assert.equal(first.filings[0].reportDate, null);
  assert.equal(second.filings.length, 2);
  assert.equal(calls.length, 2);
});

test('invalid inputs and missing contact fail before fetching', async () => {
  assert.throws(() => new SECClient(''), /SEC_USER_AGENT/);
  assert.throws(() => new SECClient('App contact@example.org\r\nHeader: bad'), /SEC_USER_AGENT/);
  const { sec, calls } = client();
  await assert.rejects(sec.getSECFilings({ ticker: '../AAPL', formType: '10-K' }));
  await assert.rejects(sec.getSECFilings({ ticker: 'AAPL', formType: '10-K', limit: 0 }));
  assert.equal(calls.length, 0);
});

test('unknown tickers and empty form results are explicit', async () => {
  const { sec, calls } = client();
  await assert.rejects(sec.getSECFilings({ ticker: 'UNKNOWN', formType: '10-K' }), /not found/);
  assert.equal(calls.length, 1);
  const result = await sec.getSECFilings({ ticker: 'AAPL', formType: '10-Q' });
  assert.deepEqual(result.filings, []);
  assert.match(result.metadata.warnings.join(' '), /Fewer matching/);
});

test('malformed columns, wrong CIK and unsafe document paths are rejected', async () => {
  for (const mutate of [
    (data: ReturnType<typeof submissions>) => { data.filings.recent.filingDate.pop(); },
    (data: ReturnType<typeof submissions>) => { data.cik = '123'; },
    (data: ReturnType<typeof submissions>) => { data.filings.recent.primaryDocument[0] = '../../evil.htm'; },
  ]) {
    const data = submissions();
    mutate(data);
    const { sec } = client((url) => url.includes('company_tickers') ? directory : data);
    await assert.rejects(sec.getSECFilings({ ticker: 'AAPL', formType: '10-K' }), /invalid|unsafe/);
  }
});

test('missing document and excluded amendments are not fabricated', async () => {
  const data = submissions();
  data.filings.recent.primaryDocument[0] = '';
  data.filings.recent.form[2] = '10-K/A';
  const { sec } = client((url) => url.includes('company_tickers') ? directory : data);
  const result = await sec.getSECFilings({ ticker: 'AAPL', formType: '10-K' });
  assert.equal(result.filings.length, 1);
  assert.equal(result.filings[0].documentUrl, null);
  assert.match(result.metadata.warnings.join(' '), /no primary document/);
});

test('HTTP errors redact response body and rejected cached requests can be retried', async () => {
  let fail = true;
  const { sec, calls } = client((url) => {
    if (url.includes('company_tickers')) return directory;
    return fail ? new Response('private details', { status: 429 }) : submissions();
  });
  await assert.rejects(sec.getSECFilings({ ticker: 'AAPL', formType: '10-K' }), (error: Error) => {
    assert.match(error.message, /HTTP 429/);
    assert.ok(!error.message.includes('private details'));
    return true;
  });
  fail = false;
  assert.equal((await sec.getSECFilings({ ticker: 'AAPL', formType: '10-K' })).filings.length, 2);
  assert.equal(calls.length, 3);
});

test('historical pages and amendments are merged, sorted and deduplicated before limit', async () => {
  const data = submissions();
  data.filings.files = [{ name: 'CIK0000320193-submissions-001.json' }];
  const archive = {
    accessionNumber: ['0000320193-26-000002', '0000320193-25-000001', '0000320193-26-000004'],
    filingDate: ['2026-09-01', '2025-09-01', '2026-09-02'],
    reportDate: ['2026-06-30', '2025-06-30', '2026-06-30'],
    form: ['10-K', '10-K', '10-K/A'],
    primaryDocument: ['new-annual.htm', 'old-annual.htm', 'amendment.htm'],
  };
  const { sec, calls } = client((url) => url.includes('company_tickers') ? directory
    : url.includes('-submissions-') ? archive : data);
  const result = await sec.getSECFilings({ ticker: 'AAPL', formType: '10-K', includeAmendments: true });
  assert.deepEqual(result.filings.map((filing) => filing.form), ['10-K/A', '10-K', '10-K', '10-K']);
  assert.equal(result.filings.at(-1)?.filingDate, '2025-09-01');
  assert.equal(result.metadata.historyComplete, true);
  assert.equal(result.metadata.coverage, 'historical-submissions');
  assert.equal(result.metadata.archivePagesRead, 1);
  assert.match(result.metadata.warnings.join(' '), /Duplicate accession/);
  assert.equal(calls[2], 'https://data.sec.gov/submissions/CIK0000320193-submissions-001.json');
});

test('bounded historical requests report partial coverage and respect recent-only mode', async () => {
  const data = submissions();
  data.filings.files = [
    { name: 'CIK0000320193-submissions-001.json' },
    { name: 'CIK0000320193-submissions-002.json' },
  ];
  const { sec, calls } = client((url) => url.includes('company_tickers') ? directory
    : url.includes('-submissions-') ? { accessionNumber: [], filingDate: [], reportDate: [], form: [], primaryDocument: [] } : data);
  const result = await sec.getSECFilings({ ticker: 'AAPL', formType: '10-K', maxArchivePages: 1 });
  assert.equal(result.metadata.archivePagesRead, 1);
  assert.equal(result.metadata.archivePagesAvailable, 2);
  assert.equal(result.metadata.historyComplete, false);
  assert.match(result.metadata.warnings.join(' '), /maxArchivePages/);
  assert.equal(calls.length, 3);
  const recent = await sec.getSECFilings({ ticker: 'AAPL', formType: '10-K', includeHistorical: false });
  assert.equal(recent.metadata.archivePagesRead, 0);
  assert.equal(recent.metadata.historyComplete, false);
  assert.equal(calls.length, 3);
});

test('unsafe archive names and malformed or failed historical responses never return false completeness', async () => {
  const data = submissions();
  data.filings.files = [{ name: '../secret.json' }];
  const unsafe = client((url) => url.includes('company_tickers') ? directory : data);
  await assert.rejects(unsafe.sec.getSECFilings({ ticker: 'AAPL', formType: '10-K' }), /filenames/);
  assert.equal(unsafe.calls.length, 2);
  data.filings.files = [{ name: 'CIK0000320193-submissions-001.json' }];
  for (const response of [{ form: [] }, new Response('private details', { status: 403 })]) {
    const { sec } = client((url) => url.includes('company_tickers') ? directory
      : url.includes('-submissions-') ? response : data);
    await assert.rejects(sec.getSECFilings({ ticker: 'AAPL', formType: '10-K' }), /invalid historical|HTTP 403/);
  }
});