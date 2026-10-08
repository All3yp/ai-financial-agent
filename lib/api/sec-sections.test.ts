import assert from 'node:assert/strict';
import test from 'node:test';
import { extractSECSections, secSectionsInputSchema } from './sec-sections';

const mdTitle =
  "Management's Discussion and Analysis of Financial Condition and Results of Operations";

test('validates SEC identifiers, supported forms, and bounded integer limits', () => {
  const input = {
    ticker: ' AAPL ',
    accessionNumber: '0000320193-26-000001',
    formType: '10-K',
  };
  assert.deepEqual(secSectionsInputSchema.parse(input), {
    ...input,
    ticker: 'AAPL',
    maxCharacters: 20_000,
  });
  for (const change of [
    { ticker: '../AAPL' },
    { accessionNumber: '000032019326000001' },
    { formType: '8-K' },
    { maxCharacters: 0 },
    { maxCharacters: 50_001 },
    { maxCharacters: 1.5 },
  ])
    assert.equal(
      secSectionsInputSchema.safeParse({ ...input, ...change }).success,
      false,
    );
  assert.equal(
    secSectionsInputSchema.parse({ ...input, maxCharacters: 50_000 })
      .maxCharacters,
    50_000,
  );
  assert.throws(() => extractSECSections('', '10-K', Number.POSITIVE_INFINITY));
});

test('selects real 10-K spans over duplicate linked and unlinked TOC entries', () => {
  const html = `<nav><a href="#business">Item 1. Business</a></nav>
    <table><tr><td><a href="#business">Item 1. Business</a></td><td>3</td></tr>
    <tr><td><a href="#risk">Item 1A. Risk Factors</a></td><td>4</td></tr></table>
    <p>Table of Contents</p><p>Item 1. Business</p><p>3</p>
    <p>Item 1A. Risk Factors</p><p>4</p><p>Item 7. ${mdTitle}</p><p>27</p>
    <h2 id="business">Item 1. Business</h2><p>We manufacture medical devices for hospitals.</p>
    <p>Our customers include clinics &amp; research laboratories.</p>
    <h2>Item 1A. Risk Factors</h2><p>Supply interruptions may adversely affect our operations.</p>
    <h2>Item 1B. Unresolved Staff Comments</h2><p>None.</p>
    <h2>Item 7. ${mdTitle}</h2><p>Revenue increased due to higher unit sales.</p>
    <h2>Item 7A. Market Risk</h2><p>EXCLUDED MARKET RISK</p>`;
  const { sections } = extractSECSections(html, '10-K');
  assert.equal(
    sections.business.text,
    'We manufacture medical devices for hospitals.\n\nOur customers include clinics & research laboratories.',
  );
  assert.equal(
    sections.riskFactors.text,
    'Supply interruptions may adversely affect our operations.',
  );
  assert.equal(
    sections.mdAndA.text,
    'Revenue increased due to higher unit sales.',
  );
  assert.equal(sections.business.item, '1');
  assert.equal(sections.riskFactors.item, '1A');
  assert.equal(sections.mdAndA.item, '7');
});

test('recognizes nested inline headings, split item/title blocks, and wrapped MD&A', () => {
  const html = `<div><p><b><span>ITEM </span><span>1.</span></b></p><p><strong>BUSINESS</strong></p>
    <p>Visible business prose.</p></div>
    <h2><span>Item </span><b>1A.</b> <em>Risk Factors</em></h2><p>Visible risk prose.</p>
    <div><b>Item 7.</b></div><div>Management&#8217;s Discussion and</div><div>Analysis</div>
    <p>Visible financial discussion.</p><p>Item 8. Financial Statements</p><p>Not MD&amp;A.</p>`;
  const { sections } = extractSECSections(html, '10-K');
  assert.equal(sections.business.text, 'Visible business prose.');
  assert.equal(sections.riskFactors.text, 'Visible risk prose.');
  assert.equal(sections.mdAndA.text, 'Visible financial discussion.');
});

test('missing sections and TOC-only headings remain null without invented content', () => {
  for (const html of [
    '',
    '<p>No recognized sections.</p>',
    `<p>Item 1. Business</p><p>3</p><p>Item 1A. Risk Factors</p><p>7</p><p>Item 7. ${mdTitle}</p><p>12</p>`,
  ]) {
    const { sections } = extractSECSections(html, '10-K');
    for (const section of Object.values(sections)) {
      assert.equal(section.text, null);
      assert.equal(section.truncated, false);
      assert.deepEqual(section.warnings, []);
    }
  }
  const { sections } = extractSECSections(
    '<h2>Item 1A. Risk Factors</h2><p>No material changes.</p>',
    '10-K',
  );
  assert.equal(sections.business.text, null);
  assert.equal(sections.mdAndA.text, null);
  assert.equal(sections.riskFactors.text, 'No material changes.');
});

test('decodes entities, retains inline link text, and removes hidden and executable injection', () => {
  const html = `<div hidden><h2>Item 1. Business</h2><p>HIDDEN FALSE SECTION</p></div>
    <h2>Item 1. Business</h2><p>R&amp;D&nbsp;uses &lt;5% of <a href="https://example.test">revenue</a>.</p>
    <script>SECRET_SCRIPT</script><style>SECRET_STYLE</style><noscript>SECRET_NOSCRIPT</noscript>
    <template>SECRET_TEMPLATE</template><div aria-hidden="true">SECRET_ARIA</div>
    <div style="color:red; DISPLAY : none !important">SECRET_DISPLAY</div>
    <div style="visibility:hidden;">SECRET_VISIBILITY</div><div hidden="false">SECRET_HIDDEN</div>
    <ix:header><ix:hidden><ix:nonNumeric>SECRET_XBRL</ix:nonNumeric></ix:hidden></ix:header>
    <p><ix:nonNumeric>Visible inline XBRL.</ix:nonNumeric></p>
    <a href="#top">Table of Contents</a><h2>Item 1A. Risk Factors</h2><p>Visible risks.</p>`;
  const { sections } = extractSECSections(html, '10-K');
  assert.equal(
    sections.business.text,
    'R&D uses <5% of revenue.\n\nVisible inline XBRL.',
  );
  assert.equal(sections.riskFactors.text, 'Visible risks.');
  assert.doesNotMatch(JSON.stringify(sections), /SECRET|HIDDEN FALSE|https:/);
});

test('limits each section independently, reports truncation, and never exceeds the hard maximum', () => {
  const html = `<h2>Item 1. Business</h2><p>${'Business content '.repeat(4000)}</p>
    <h2>Item 1A. Risk Factors</h2><p>Short risk.</p><h2>Item 7. ${mdTitle}</h2><p>${'Financial content '.repeat(4000)}</p>`;
  const { sections } = extractSECSections(html, '10-K', 30);
  for (const key of ['business', 'mdAndA'] as const) {
    assert.equal(sections[key].text?.length, 30);
    assert.equal(sections[key].truncated, true);
    assert.match(sections[key].warnings.join(' '), /truncated.*30/);
  }
  assert.equal(sections.riskFactors.truncated, false);
  assert.deepEqual(sections.riskFactors.warnings, []);
  assert.equal(
    extractSECSections(html, '10-K').sections.business.text?.length,
    20_000,
  );
  assert.equal(
    extractSECSections(html, '10-K', 50_000).sections.business.text?.length,
    50_000,
  );
  assert.throws(() => extractSECSections(html, '10-K', 50_001));
});

test('10-Q selects Part I Item 2 MD&A and Part II Item 1A risks, never Business', () => {
  const html = `<h1>PART I - FINANCIAL INFORMATION</h1><h2>Item 1. Financial Statements</h2><p>Financial table.</p>
    <h2>Item 1A. Risk Factors</h2><p>WRONG PART RISKS ${'noise '.repeat(100)}</p>
    <h2>Item 2. ${mdTitle}</h2><p>Quarterly revenue grew.</p>
    <h2>Item 3. Market Risk</h2><p>Excluded market risks.</p>
    <h1>PART II - OTHER INFORMATION</h1><h2>Item 1. Legal Proceedings</h2><p>Legal case.</p>
    <h2>Item 1A. Risk Factors</h2><p>Quarterly supply risks.</p>
    <h2>Item 2. ${mdTitle}</h2><p>WRONG PART DISCUSSION ${'noise '.repeat(100)}</p>
    <h2>Item 6. Exhibits</h2><p>Excluded exhibits.</p>`;
  const { sections } = extractSECSections(html, '10-Q');
  assert.equal(sections.business.text, null);
  assert.equal(sections.mdAndA.item, '2');
  assert.equal(sections.mdAndA.text, 'Quarterly revenue grew.');
  assert.equal(sections.riskFactors.text, 'Quarterly supply risks.');
});

test('10-Q supports absent Part markers and stops at Part transitions', () => {
  const withoutParts = extractSECSections(
    `<h2>Item 2. MD&amp;A</h2><p>Quarterly results.</p>
    <h2>Item 1A. Risk Factors</h2><p>Quarterly risks.</p>`,
    '10-Q',
  );
  assert.equal(withoutParts.sections.mdAndA.text, 'Quarterly results.');
  assert.equal(withoutParts.sections.riskFactors.text, 'Quarterly risks.');
  const withParts = extractSECSections(
    `<h2>Part I</h2><h2>Item 2. ${mdTitle}</h2><p>Results.</p>
    <h2>Part II</h2><p>Not financial discussion.</p><h2>Item 1A. Risk Factors</h2><p>Risks.</p>`,
    '10-Q',
  );
  assert.equal(withParts.sections.mdAndA.text, 'Results.');
});

test('joins line-broken heading titles and keeps prose that is entirely linked', () => {
  const html = `<h2><a href="#business">Item 1. Business</a></h2>
    <p><a href="https://example.test">We develop diagnostic equipment.</a></p>
    <h2>Item 1A. Risk<br>Factors</h2><p>Customer concentration presents risks.</p>
    <h2>Item 7. Management's Discussion<br>and Analysis</h2><p>Operating income rose.</p>`;
  const { sections } = extractSECSections(html, '10-K');
  assert.equal(sections.business.text, 'We develop diagnostic equipment.');
  assert.equal(
    sections.riskFactors.text,
    'Customer concentration presents risks.',
  );
  assert.equal(sections.mdAndA.text, 'Operating income rose.');
});

test('repeated page headings do not discard earlier section content', () => {
  const html = `<h2>Item 1. Business</h2><p>Our first product serves hospitals.</p>
    <h2>Item 1. Business (continued)</h2><p>Our second product serves laboratories.</p>
    <h2>Item 1A. Risk Factors</h2><p>Supply risk.</p>`;
  const { sections } = extractSECSections(html, '10-K');
  assert.equal(
    sections.business.text,
    'Our first product serves hospitals.\n\nOur second product serves laboratories.',
  );
  assert.equal(sections.riskFactors.text, 'Supply risk.');
});

test('TOC containers are removed even when they contain misleading prose', () => {
  const html = `<div class="table-of-contents"><p>Item 1. Business</p><p>${'Misleading summary. '.repeat(100)}</p></div>
    <div id="toc"><p>Item 1A. Risk Factors</p><p>Not actual risk content.</p></div>
    <h2>Item 1. Business</h2><p>Real short content.</p>`;
  const { sections } = extractSECSections(html, '10-K');
  assert.equal(sections.business.text, 'Real short content.');
  assert.equal(sections.riskFactors.text, null);
});

test('hidden CSS variants and hidden parent trees cannot inject boundaries', () => {
  const html = `<h2>Item 1. Business</h2><p>Visible content.</p>
    <div style="display:/*comment*/none ! important;"><h2>Item 1A. Risk Factors</h2><p>SECRET</p></div>
    <div style="content-visibility:hidden"><p>SECRET</p></div>
    <div style="opacity:0"><p>SECRET</p></div>
    <div inert><p>SECRET</p></div>`;
  const { sections } = extractSECSections(html, '10-K');
  assert.equal(sections.business.text, 'Visible content.');
  assert.equal(sections.riskFactors.text, null);
});

test('truncation does not split surrogate pairs and exact limits do not warn', () => {
  const html = '<h2>Item 1. Business</h2><p>A&#128512;BC</p>';
  const truncated = extractSECSections(html, '10-K', 2).sections.business;
  assert.equal(truncated.text, 'A');
  assert.equal(truncated.truncated, true);
  const exact = extractSECSections(html, '10-K', 5).sections.business;
  assert.equal(exact.text?.length, 5);
  assert.equal(exact.truncated, false);
  assert.deepEqual(exact.warnings, []);
});

test('rejects oversized HTML before parsing and rejects unsupported runtime forms', () => {
  assert.throws(
    () => extractSECSections('x'.repeat(25_000_001), '10-K'),
    /parsing limit/,
  );
  assert.throws(() => extractSECSections('', '8-K' as '10-K'));
});

test('signature and exhibit-index boundaries cannot become missing section content', () => {
  const missing = extractSECSections(
    `<h2>Item 7. ${mdTitle}</h2><p>28</p>
    <h2>SIGNATURES</h2><p>Authorized officer.</p>`,
    '10-K',
  );
  assert.equal(missing.sections.mdAndA.text, null);
  const present = extractSECSections(
    `<h2>Item 7. ${mdTitle}</h2><p>Revenue grew.</p>
    <h2>EXHIBIT INDEX</h2><p>Exhibit list.</p>`,
    '10-K',
  );
  assert.equal(present.sections.mdAndA.text, 'Revenue grew.');
});

test('large groups of empty repeated headings remain missing', () => {
  const { sections } = extractSECSections(
    '<h2>Item 1. Business</h2>'.repeat(1000),
    '10-K',
  );
  assert.equal(sections.business.text, null);
});
