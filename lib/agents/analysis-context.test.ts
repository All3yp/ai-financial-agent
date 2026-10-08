import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAnalysisPrompt, latestHistoricalPricePair } from './analysis-context';

test('debate perspectives are distinct and peer metrics remain visible', () => {
  const input = { researchData: { ticker: 'AAPL' }, peerData: { MSFT: [{ price_to_earnings_ratio: 25 }] } };
  const bull = buildAnalysisPrompt({ ...input, perspective: 'bull', instruction: 'Compare growth catalysts' });
  const bear = buildAnalysisPrompt({ ...input, perspective: 'bear' });
  assert.match(bull, /Bull case/);
  assert.match(bear, /Bear case/);
  assert.match(bull, /Compare growth catalysts/);
  assert.match(bull, /price_to_earnings_ratio/);
  assert.match(bull, /Do not invent/);
  assert.notEqual(bull, bear);
});

test('monitor prices select the latest chronological observations without mutating rows', () => {
  const rows = [{ time: '2026-10-02', close: 80 }, { time: '2026-10-01', close: 100 }, { time: '2026-10-03', close: null }];
  const original = structuredClone(rows);
  const pair = latestHistoricalPricePair(rows);
  assert.equal(pair.latest?.close, 80);
  assert.equal(pair.previous?.close, 100);
  assert.deepEqual(rows, original);
  assert.deepEqual(latestHistoricalPricePair([]), { latest: undefined, previous: undefined });
});