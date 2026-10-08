import assert from 'node:assert/strict';
import test from 'node:test';
import { requestQuantitativeAnalysis } from './quantitative-client';

test('client sends JSON only to the authenticated endpoint', async () => {
  const result = { specialists: { marketRegime: {}, sectorRotation: {} }, warnings: [], limitations: [] };
  const fetcher = (async (url, init) => {
    assert.equal(url, '/api/agents/quantitative');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.body, '{"market":{}}');
    return Response.json(result);
  }) as typeof fetch;
  assert.deepEqual(await requestQuantitativeAnalysis('{"market":{}}', fetcher), result);
});

test('invalid JSON and byte limit reject before fetch', async () => {
  const fetcher = (async () => { assert.fail('Must not fetch'); }) as typeof fetch;
  await assert.rejects(requestQuantitativeAnalysis('private invalid', fetcher), /Invalid JSON/);
  await assert.rejects(requestQuantitativeAnalysis(' '.repeat(1024 * 1024 + 1), fetcher), /1 MiB/);
});

test('HTTP, network and malformed response errors do not echo bodies', async () => {
  for (const status of [400, 401, 413, 503]) {
    await assert.rejects(requestQuantitativeAnalysis('{}', (async () => new Response('private-secret', { status })) as typeof fetch),
      (error: Error) => !error.message.includes('private-secret'));
  }
  await assert.rejects(requestQuantitativeAnalysis('{}', (async () => { throw new Error('private'); }) as typeof fetch), /Unable to connect/);
  await assert.rejects(requestQuantitativeAnalysis('{}', (async () => Response.json({})) as typeof fetch), /Invalid quantitative service response/);
});