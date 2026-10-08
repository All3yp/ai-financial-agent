import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import test from 'node:test';
import {
  FREDClient, MACRO_DATA_LIMITS, inflationInputSchema, yieldCurveInputSchema,
} from './macro-data';

const apiKey = '0123456789abcdef0123456789abcdef';
const range = { startDate: '2024-01-01', endDate: '2024-01-05', asOf: '2024-02-01' };
type Row = { date: string; value: string; realtime_start: string; realtime_end: string };

function row(date: string, value: string): Row {
  return { date, value, realtime_start: range.asOf, realtime_end: range.asOf };
}

function fixture(url: URL, observations: Row[] = [row('2024-01-01', '3')]) {
  return {
    realtime_start: url.searchParams.get('realtime_start'),
    realtime_end: url.searchParams.get('realtime_end'),
    observation_start: url.searchParams.get('observation_start'),
    observation_end: url.searchParams.get('observation_end'),
    units: url.searchParams.get('units'), output_type: 1, file_type: 'json',
    order_by: 'observation_date', sort_order: 'asc',
    count: observations.length, offset: 0, limit: Number(url.searchParams.get('limit')), observations,
  };
}

function json(payload: unknown) {
  return new Response(JSON.stringify(payload));
}

function harness(build: (url: URL) => unknown = (url) => fixture(url)) {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return json(build(url));
  };
  return { calls, client: new FREDClient(` ${apiKey} `, fetcher) };
}

test('official yield URLs, vintage, bounds, timeout signal and redirect policy are exact', async (context) => {
  const timeouts: number[] = [];
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  context.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    timeouts.push(milliseconds);
    return timeout(milliseconds);
  });
  const { client, calls } = harness();
  const result = await client.getYieldCurve(range);
  assert.equal(calls.length, 3);
  assert.deepEqual(timeouts, [15_000, 15_000, 15_000]);
  for (const [index, seriesId] of ['DGS2', 'DGS10', 'DGS3MO'].entries()) {
    assert.equal(calls[index].url.toString(),
      `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&realtime_start=2024-02-01&realtime_end=2024-02-01&observation_start=2024-01-01&observation_end=2024-01-05&units=lin&output_type=1&order_by=observation_date&sort_order=asc&limit=366&offset=0`);
    assert.equal(calls[index].init?.redirect, 'error');
    assert.ok(calls[index].init?.signal instanceof AbortSignal);
  }
  assert.equal(result.asOf, range.asOf);
  assert.equal(result.yields[0].units, 'percent');
  assert.deepEqual(result.yields[0].metadata, {
    realtimeStart: range.asOf, realtimeEnd: range.asOf, fetchedAt: result.yields[0].metadata.fetchedAt,
    count: 1, offset: 0, limit: 366, complete: true,
  });
  assert.ok(Number.isFinite(Date.parse(result.yields[0].metadata.fetchedAt)));
  assert.deepEqual(result.metadata.limits, MACRO_DATA_LIMITS);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(apiKey));
  assert.doesNotMatch(inspect(client, { showHidden: true }), new RegExp(apiKey));
});

test('yields preserve nulls and sort; spreads use only pairwise common non-null dates', async () => {
  const { client } = harness((url) => fixture(url, {
    DGS2: [row('2024-01-04', '0'), row('2024-01-02', '.'), row('2024-01-01', '4'), row('2024-01-03', '4.5')],
    DGS10: [row('2024-01-05', '5'), row('2024-01-03', '.'), row('2024-01-02', '3'), row('2024-01-01', '3.5')],
    DGS3MO: [row('2024-01-05', '4'), row('2024-01-02', '3.25')],
  }[url.searchParams.get('series_id') as 'DGS2' | 'DGS10' | 'DGS3MO']));
  const result = await client.getYieldCurve(range);
  assert.deepEqual(result.yields[0].observations.map(({ date, value }) => ({ date, value })), [
    { date: '2024-01-01', value: 4 }, { date: '2024-01-02', value: null },
    { date: '2024-01-03', value: 4.5 }, { date: '2024-01-04', value: 0 },
  ]);
  assert.deepEqual(result.spreads, [
    { name: '2s10s', longSeries: 'DGS10', shortSeries: 'DGS2', units: 'percentage points',
      observations: [{ date: '2024-01-01', value: -0.5 }] },
    { name: '3m10y', longSeries: 'DGS10', shortSeries: 'DGS3MO', units: 'percentage points',
      observations: [{ date: '2024-01-02', value: -0.25 }, { date: '2024-01-05', value: 1 }] },
  ]);
  assert.match(result.metadata.warnings.join(' '), /null/);
});

test('inflation selects all supported series using FRED pc1 with realtime metadata, no local arithmetic', async () => {
  const { client, calls } = harness((url) => fixture(url, [row('2024-01-01', '2.75'), row('2024-01-02', '.')]));
  const series = ['CPIAUCSL', 'CPILFESL', 'PCEPI', 'PCEPILFE', 'PPIACO'] as const;
  const result = await client.getInflationData({ ...range, series: [...series] });
  assert.deepEqual(result.series.map((item) => item.seriesId), series);
  for (const [index, seriesId] of series.entries()) {
    assert.equal(calls[index].url.toString(),
      `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&realtime_start=2024-02-01&realtime_end=2024-02-01&observation_start=2024-01-01&observation_end=2024-01-05&units=pc1&output_type=1&order_by=observation_date&sort_order=asc&limit=3660&offset=0`);
    assert.equal(result.series[index].units, 'year-over-year percent');
    assert.equal(result.series[index].asOf, range.asOf);
    assert.deepEqual(result.series[index].observations.map((item) => item.value), [2.75, null]);
  }
  assert.match(result.metadata.warnings.join(' '), /not forecasts/);
  assert.match(result.metadata.warnings.join(' '), /units=pc1/);
});

test('truncated, inconsistent and missing coverage fields fail instead of claiming completeness', async () => {
  for (const changes of [
    { count: 367 }, { count: 2 }, { count: 0 }, { offset: 1 }, { limit: 1 },
    { count: undefined }, { offset: undefined }, { limit: undefined },
    { count: -1 }, { count: 1.5 }, { count: '1' },
  ]) {
    const { client } = harness((url) => ({ ...fixture(url), ...changes }));
    await assert.rejects(client.getYieldCurve(range), /FRED (observation coverage|returned invalid)/);
  }
  const { client } = harness((url) => ({ ...fixture(url), count: 3661 }));
  await assert.rejects(client.getInflationData({ ...range, series: ['CPIAUCSL'] }), /coverage/);
});

test('200 error envelopes, HTTP, transport and JSON failures never disclose upstream secrets', async () => {
  const secret = `https://api.stlouisfed.org/fred/series/observations?api_key=${apiKey}&private=payload`;
  const fetchers: (typeof fetch)[] = [
    async () => json({ error_code: 400, error_message: secret }),
    async () => json({ error_message: secret }),
    async () => new Response(secret, { status: 403, statusText: apiKey }),
    async () => new Response(secret, { status: 429 }),
    async () => new Response(secret, { status: 500 }),
    async () => { throw new Error(secret); },
    async () => { throw new DOMException(secret, 'TimeoutError'); },
    async () => new Response(secret),
    async () => json({ observations: secret }),
  ];
  for (const fetcher of fetchers) {
    const client = new FREDClient(apiKey, fetcher);
    await assert.rejects(client.getInflationData({ ...range, series: ['PPIACO'] }), (error: Error) => {
      assert.match(error.message, /^FRED (request failed|returned an API error|returned invalid observations)$/);
      assert.doesNotMatch(inspect(error), /api_key|private=|payload|https:|0123456789abcdef/);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('malformed values, duplicate or impossible dates, bounds and vintage mismatches are sanitized', async () => {
  const invalidRows = [
    ...['', ' ', 'NaN', 'Infinity', '-Infinity', '1e999', '0x10', '1,000', apiKey].map((value) => [row('2024-01-01', value)]),
    [{ ...row('2024-01-01', '1'), value: 1 }],
    [{ ...row('2024-01-01', '1'), value: null }],
    [row('2024-02-30', '1')], [row('2023-12-31', '1')], [row('2024-01-06', '1')],
    [row('2024-01-01', '1'), row('2024-01-01', '2')],
    [{ ...row('2024-01-01', '1'), realtime_start: '2024-02-02' }],
    [{ ...row('2024-01-01', '1'), realtime_end: '2024-01-31' }],
    [{ ...row('2024-01-01', '1'), realtime_end: '2024-02-30' }],
  ];
  for (const observations of invalidRows) {
    const { client } = harness((url) => ({ ...fixture(url, []), count: observations.length, observations }));
    await assert.rejects(client.getYieldCurve(range), (error: Error) => {
      assert.match(error.message, /^FRED returned invalid/);
      assert.doesNotMatch(inspect(error), new RegExp(apiKey));
      return true;
    });
  }
  for (const changes of [
    { realtime_start: '2024-02-02' }, { realtime_end: '2024-02-02' },
    { observation_start: '2023-01-01' }, { observation_end: '2024-01-04' }, { units: 'pc1' },
    { output_type: 2 }, { file_type: 'xml' }, { sort_order: 'desc' }, { order_by: 'series_id' },
  ]) {
    const { client } = harness((url) => ({ ...fixture(url), ...changes }));
    await assert.rejects(client.getYieldCurve(range), /FRED returned (invalid|mismatched)/);
  }
});

test('strict real-date input schemas validate inclusive 366-day and calendar ten-year bounds before fetch', async () => {
  const { client, calls } = harness();
  const invalidRanges = [
    { ...range, startDate: '2024-02-30' }, { ...range, endDate: '2024-01-32' },
    { ...range, asOf: '2023-02-29' }, { ...range, asOf: undefined },
    { ...range, startDate: '2024-1-01' }, { ...range, startDate: '0000-01-01' },
    { ...range, startDate: '2024-01-06' }, { ...range, endDate: '2024-02-02' },
    { ...range, private: apiKey },
    { startDate: '2024-01-01', endDate: '2025-01-01', asOf: '2025-01-01' },
  ];
  for (const input of invalidRanges) {
    assert.equal(yieldCurveInputSchema.safeParse(input).success, false);
    await assert.rejects(client.getYieldCurve(input as typeof range), /^Error: Invalid yield curve input$/);
  }
  const invalidInflation: unknown[] = [
    { ...range, series: [] }, { ...range, series: ['UNKNOWN'] },
    { ...range, series: ['PCEPI', 'PCEPI'] }, { ...range, series: 'PCEPI' },
    { ...range }, { ...range, series: ['PPIACO'], asOf: undefined },
    { ...range, series: ['PPIACO'], endDate: '2024-02-02' },
    { startDate: '2014-01-01', endDate: '2024-01-02', asOf: range.asOf, series: ['PPIACO'] },
    { ...range, series: ['PPIACO'], secret: apiKey },
  ];
  for (const input of invalidInflation) {
    assert.equal(inflationInputSchema.safeParse(input).success, false);
    await assert.rejects(client.getInflationData(input as Parameters<FREDClient['getInflationData']>[0]), /Invalid inflation input/);
  }
  assert.equal(calls.length, 0);
  assert.equal(yieldCurveInputSchema.safeParse({ startDate: '2024-01-01', endDate: '2024-12-31', asOf: '2024-12-31' }).success, true);
  assert.equal(yieldCurveInputSchema.safeParse({ startDate: '2023-01-01', endDate: '2024-01-01', asOf: '2024-01-01' }).success, true);
  assert.equal(inflationInputSchema.safeParse({ startDate: '2014-01-01', endDate: '2024-01-01', asOf: range.asOf, series: ['PPIACO'] }).success, true);
  assert.equal(inflationInputSchema.safeParse({ startDate: '2012-02-29', endDate: '2022-02-28', asOf: range.asOf, series: ['PPIACO'] }).success, true);
  assert.equal(inflationInputSchema.safeParse({ startDate: '2012-02-29', endDate: '2022-03-01', asOf: range.asOf, series: ['PPIACO'] }).success, false);
});

test('constructor trims and validates lowercase 32-character alphanumeric keys without exposing them', () => {
  for (const key of ['', apiKey.toUpperCase(), `${apiKey}x`, apiKey.slice(1), 'x'.repeat(31) + '-', null]) {
    assert.throws(() => new FREDClient(key as string), /^Error: Invalid FRED API key configuration$/);
  }
  assert.doesNotThrow(() => new FREDClient('z'.repeat(32)));
});

test('empty and all-missing series return no fabricated spreads and explicit warnings', async () => {
  for (const observations of [[], [row('2024-01-01', '.')]]) {
    const { client } = harness((url) => fixture(url, observations));
    const result = await client.getYieldCurve(range);
    assert.ok(result.spreads.every((spread) => spread.observations.length === 0));
    assert.match(result.metadata.warnings.join(' '), /Missing observations/);
    assert.ok(result.yields.every((series) => series.metadata.complete));
  }
});

test('finite source values cannot produce an infinite spread', async () => {
  const { client } = harness((url) => fixture(url, [row('2024-01-01',
    url.searchParams.get('series_id') === 'DGS10' ? '1e308' : '-1e308')]));
  await assert.rejects(client.getYieldCurve(range), /^Error: FRED returned invalid spread values$/);
});

test('row realtime intervals can enclose the vintage and remain explicit in the result', async () => {
  const { client } = harness((url) => fixture(url, [{
    ...row('2024-01-01', '1.25e+0'), realtime_start: '2024-01-15', realtime_end: '9999-12-31',
  }]));
  const result = await client.getInflationData({ ...range, series: ['PCEPI'] });
  assert.deepEqual(result.series[0].observations, [{
    date: '2024-01-01', value: 1.25, realtimeStart: '2024-01-15', realtimeEnd: '9999-12-31',
  }]);
  assert.equal(result.series[0].metadata.realtimeStart, range.asOf);
});

test('client-local cache deduplicates in-flight requests and protects cached rows against caller mutation', async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const fetcher: typeof fetch = async (input) => {
    calls++;
    await gate;
    return json(fixture(new URL(String(input))));
  };
  const client = new FREDClient(apiKey, fetcher);
  const first = client.getYieldCurve(range);
  const second = client.getYieldCurve(range);
  assert.equal(calls, 3);
  release?.();
  const [result, duplicate] = await Promise.all([first, second]);
  assert.deepEqual(result, duplicate);
  result.yields[0].observations[0].value = 999;
  result.yields[0].metadata.count = 999;
  assert.equal((await client.getYieldCurve(range)).yields[0].observations[0].value, 3);
  assert.equal(calls, 3);
  await new FREDClient(apiKey, fetcher).getYieldCurve(range);
  assert.equal(calls, 6);
});

test('cache expires exactly five minutes after success and separates ranges, vintages and series', async (context) => {
  let now = Date.parse('2024-02-01');
  context.mock.method(Date, 'now', () => now);
  const { client, calls } = harness((url) => fixture(url, []));
  const input = { ...range, series: ['CPIAUCSL'] as const };
  const request = { ...input, series: [...input.series] };
  await client.getInflationData(request);
  now += MACRO_DATA_LIMITS.cacheMilliseconds - 1;
  await client.getInflationData(request);
  assert.equal(calls.length, 1);
  now++;
  await client.getInflationData(request);
  assert.equal(calls.length, 2);
  await client.getInflationData({ ...request, asOf: '2024-02-02' });
  await client.getInflationData({ ...request, startDate: '2024-01-02' });
  await client.getInflationData({ ...request, endDate: '2024-01-04' });
  await client.getInflationData({ ...request, series: ['PCEPI'] });
  assert.equal(calls.length, 6);
});

test('failed requests are evicted and a retry can succeed', async () => {
  const failures: ((url: URL) => Response)[] = [
    () => { throw new Error(apiKey); },
    () => new Response(apiKey, { status: 503 }),
    () => new Response(apiKey),
    () => json({ error_code: 400, error_message: apiKey }),
    (url) => json({ ...fixture(url), count: 2 }),
    (url) => json(fixture(url, [row('2024-01-01', apiKey)])),
  ];
  for (const failure of failures) {
    let calls = 0;
    const client = new FREDClient(apiKey, async (input) => {
      calls++;
      const url = new URL(String(input));
      return calls === 1 ? failure(url) : json(fixture(url));
    });
    const input = { ...range, series: ['PPIACO'] as ['PPIACO'] };
    await assert.rejects(client.getInflationData(input), /FRED/);
    assert.equal((await client.getInflationData(input)).series[0].observations[0].value, 3);
    await client.getInflationData(input);
    assert.equal(calls, 2);
  }
});

test('cache is bounded and evicts oldest entries rather than retaining every request', async () => {
  const { client, calls } = harness((url) => fixture(url, []));
  const input = { ...range, series: ['PPIACO'] as ['PPIACO'] };
  await client.getInflationData(input);
  for (let index = 1; index <= MACRO_DATA_LIMITS.cacheEntries; index++) {
    const asOf = new Date(Date.UTC(2024, 1, index + 1)).toISOString().slice(0, 10);
    await client.getInflationData({ ...input, asOf });
  }
  assert.equal(calls.length, MACRO_DATA_LIMITS.cacheEntries + 1);
  await client.getInflationData(input);
  assert.equal(calls.length, MACRO_DATA_LIMITS.cacheEntries + 2);
});