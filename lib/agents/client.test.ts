import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDebateEventData } from './client';

test('debate event snapshots server decision mode and defaults to off', () => {
  assert.deepEqual(
    buildDebateEventData(
      'AAPL',
      'Assess the supplied evidence',
      'user-1',
      'run-1',
      'deterministic',
    ),
    {
      ticker: 'AAPL',
      question: 'Assess the supplied evidence',
      userId: 'user-1',
      runId: 'run-1',
      decisionMode: 'deterministic',
    },
  );
  assert.equal(buildDebateEventData('AAPL', 'Question').decisionMode, 'off');
});