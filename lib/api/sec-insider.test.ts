import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSECInsiderFiling } from './sec-insider';
import { SECClient } from './sec-filings';

const form4 = `<?xml version="1.0"?>
<ownershipDocument>
  <documentType>4</documentType>
  <issuer><issuerCik>320193</issuerCik><issuerName>Apple Inc.</issuerName></issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerCik>1234567890</rptOwnerCik><rptOwnerName>Example Insider</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship><isDirector>1</isDirector><isOfficer>1</isOfficer><officerTitle>Chief Officer</officerTitle><isTenPercentOwner>0</isTenPercentOwner></reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-10-01</value></transactionDate>
      <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
      <transactionAmounts><transactionShares><value>10</value></transactionShares><transactionPricePerShare><value>250.50</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>1010</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
      <ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-10-02</value></transactionDate>
      <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
      <transactionAmounts><transactionShares><value>2</value></transactionShares><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
  <derivativeTable>
    <derivativeTransaction>
      <securityTitle><value>Stock Option</value></securityTitle>
      <transactionDate><value>2026-10-03</value></transactionDate>
      <transactionCoding><transactionCode>M</transactionCode></transactionCoding>
      <transactionAmounts><transactionShares><value>5</value></transactionShares><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts>
    </derivativeTransaction>
  </derivativeTable>
</ownershipDocument>`;

const directory = {
  '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
};
const submissions = {
  cik: '320193',
  name: 'Apple Inc.',
  filings: {
    recent: {
      accessionNumber: ['0000320193-26-000004'],
      filingDate: ['2026-10-04'],
      reportDate: ['2026-10-03'],
      form: ['4'],
      primaryDocument: ['ownership.xml'],
    },
    files: [],
  },
};

test('Form 4 XML preserves transaction codes, ownership flags, derivative status and missing values', () => {
  const parsed = parseSECInsiderFiling(form4, '0000320193', '4');
  assert.equal(parsed.owners.length, 1);
  assert.deepEqual(parsed.owners[0], {
    cik: '1234567890',
    name: 'Example Insider',
    isDirector: true,
    isOfficer: true,
    officerTitle: 'Chief Officer',
    isTenPercentOwner: false,
  });
  assert.equal(parsed.transactions.length, 3);
  assert.equal(parsed.transactions[0].transactionCode, 'P');
  assert.equal(parsed.transactions[0].shares, 10);
  assert.equal(parsed.transactions[0].pricePerShare, 250.5);
  assert.equal(parsed.transactions[0].directOrIndirect, 'D');
  assert.equal(parsed.transactions[1].pricePerShare, null);
  assert.equal(parsed.transactions[2].derivative, true);
  assert.match(parsed.warnings.join(' '), /prices were not reported/);
});

test('Form 4 parser rejects issuer, form, size and malformed transaction mismatches', () => {
  assert.throws(
    () => parseSECInsiderFiling(form4, '0000000001', '4'),
    /issuer does not match/,
  );
  assert.throws(
    () => parseSECInsiderFiling(form4, '0000320193', '4/A'),
    /document type/,
  );
  assert.throws(
    () => parseSECInsiderFiling('x'.repeat(5_000_001), '0000320193', '4'),
    /size limit/,
  );
  assert.throws(() =>
    parseSECInsiderFiling(
      form4.replace('2026-10-01', '2026-02-30'),
      '0000320193',
      '4',
    ),
  );
});

test('SEC client discovers and downloads only safe Form 4 primary XML documents', async () => {
  const calls: string[] = [];
  const sec = new SECClient('TestApp contact@example.org', (async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('company_tickers'))
      return new Response(JSON.stringify(directory));
    if (url.endsWith('CIK0000320193.json'))
      return new Response(JSON.stringify(submissions));
    if (url.endsWith('/ownership.xml'))
      return new Response(form4, {
        headers: { 'content-type': 'application/xml' },
      });
    throw new Error('Unexpected URL');
  }) as typeof fetch);

  const result = await sec.getSECInsiderTransactions({
    ticker: 'AAPL',
    limit: 5,
  });
  assert.equal(result.filings.length, 1);
  assert.equal(result.filings[0].accessionNumber, '0000320193-26-000004');
  assert.equal(result.filings[0].transactions.length, 3);
  assert.ok(
    !result.metadata.warnings.includes(
      'This is discovery metadata, not parsed filing content.',
    ),
  );
  assert.equal(calls.length, 3);
  assert.ok(calls[2].startsWith('https://www.sec.gov/Archives/edgar/data/'));
  assert.ok(calls[2].endsWith('/ownership.xml'));
});
