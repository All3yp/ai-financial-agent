import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDebateEvidenceGapInput,
  runDebateEvidenceGapGate,
} from './debate-evidence-gap';

const completeResearch = {
  prices: [
    { time: '2026-01-01', close: 10 },
    { time: '2026-06-01', close: 11 },
  ],
  incomeStatements: [{ report_period: '2025-12-31', revenue: 10 }],
  balanceSheets: [{ report_period: '2025-12-31', total_assets: 10 }],
  cashFlows: [{ report_period: '2025-12-31', net_cash_flow_from_operations: 10 }],
  metrics: [{ report_period: '2025-12-31', price_to_earnings_ratio: 10 }],
};

test('research adapter preserves only bounded category coverage and marks absent fields unknown', () => {
  const input = buildDebateEvidenceGapInput('Assess ticker data', {
    prices: completeResearch.prices,
    incomeStatements: completeResearch.incomeStatements,
  });
  assert.equal(input.evidence[0].state, 'available');
  assert.equal(input.evidence[0].count, 2);
  assert.deepEqual(input.evidence[0].coverage, {
    from: '2026-01-01',
    to: '2026-06-01',
  });
  assert.equal(input.evidence[2].state, 'unknown');
  assert.equal(input.evidence[2].reference, 'research:balanceSheets');
  assert.deepEqual(input.evidence[2].coverage, { from: null, to: null });
  assert.deepEqual(input.conflicts, []);
  assert.equal(input.remainingBudget.collectionIterations, 0);
});

test('non-empty malformed or undated category rows remain unknown', () => {
  const input = buildDebateEvidenceGapInput('Assess ticker data', {
    ...completeResearch,
    balanceSheets: [{ assets: 10 }],
    cashFlows: [null],
  });
  assert.equal(input.evidence[2].count, 1);
  assert.equal(input.evidence[2].state, 'unknown');
  assert.deepEqual(input.evidence[2].coverage, { from: null, to: null });
  assert.equal(input.evidence[3].state, 'unknown');
});

test('date prefixes with malformed suffixes and date-only observations remain unknown', () => {
  const input = buildDebateEvidenceGapInput('Assess ticker data', {
    prices: [{ time: '2026-01-01not-a-date', close: 10 }],
    incomeStatements: [{ report_period: '2026-01-01', revenue: 10 }],
    balanceSheets: [{ report_period: '2026-01-01', assets: 10 }],
    cashFlows: [{ report_period: '2026-01-01', operating: 10 }],
    metrics: [{ report_period: '2026-01-01', pe: 10 }],
  });
  assert.equal(input.evidence[0].state, 'unknown');

  const dateOnlyRows = Object.fromEntries(
    ['prices', 'incomeStatements', 'balanceSheets', 'cashFlows', 'metrics'].map(
      (category) => [category, [{ report_period: '2026-01-01' }]],
    ),
  );
  const dateOnly = buildDebateEvidenceGapInput('Assess ticker data', dateOnlyRows);
  assert.ok(dateOnly.evidence.every((item) => item.state === 'unknown'));
});

test('metadata-only rows cannot satisfy any required financial category', async () => {
  const metadataOnly = Object.fromEntries(
    ['incomeStatements', 'balanceSheets', 'cashFlows', 'metrics'].map(
      (category) => [category, [{ report_period: '2026-01-01', row_number: 1 }]],
    ),
  );
  const result = await runDebateEvidenceGapGate({
    mode: 'deterministic',
    objective: 'Assess ticker data',
    research: {
      prices: [{ time: '2026-01-01', close: 10 }],
      ...metadataOnly,
    },
    persistStep: async (_name, operation) => operation(),
  });
  assert.equal(result.kind, 'stop');
  if (result.kind === 'stop') {
    assert.equal(result.decision.outcome, 'missing_financial_data');
    assert.equal(result.decision.reason, 'evidence_unknown');
  }
});

test('disabled decision mode leaves the debate workflow unchanged', async () => {
  let persistenceCalls = 0;
  const result = await runDebateEvidenceGapGate({
    mode: 'off',
    objective: 'Assess ticker data',
    research: completeResearch,
    persistStep: async (_name, operation) => {
      persistenceCalls += 1;
      return operation();
    },
  });
  assert.deepEqual(result, { kind: 'disabled' });
  assert.equal(persistenceCalls, 0);
});

test('deterministic sufficient evidence uses one stable persisted step and continues', async () => {
  const stepNames: string[] = [];
  let persistedDecision: unknown;
  const result = await runDebateEvidenceGapGate({
    mode: 'deterministic',
    objective: 'Assess ticker data',
    research: completeResearch,
    persistStep: async (name, operation) => {
      stepNames.push(name);
      const persisted = await operation();
      persistedDecision = persisted;
      return persisted;
    },
  });
  assert.deepEqual(stepNames, ['evidence-gap-decision']);
  assert.equal(result.kind, 'continue');
  if (result.kind === 'continue') {
    assert.equal(result.decision.outcome, 'sufficient_for_summary');
    assert.equal(result.decision.nextAction, 'synthesize');
  }
  assert.equal(
    new TextEncoder().encode(JSON.stringify(persistedDecision)).byteLength <= 4096,
    true,
  );
  assert.equal('research' in (persistedDecision as Record<string, unknown>), false);
});

test('incomplete evidence stops before synthesis with a persisted unresolved result', async () => {
  const stepNames: string[] = [];
  const result = await runDebateEvidenceGapGate({
    mode: 'deterministic',
    objective: 'Assess ticker data',
    research: { ...completeResearch, metrics: [] },
    persistStep: async (name, operation) => {
      stepNames.push(name);
      return operation();
    },
  });
  assert.deepEqual(stepNames, ['evidence-gap-decision']);
  assert.equal(result.kind, 'stop');
  if (result.kind === 'stop') {
    assert.equal(result.decision.status, 'unresolved');
    assert.equal(result.decision.outcome, 'missing_financial_data');
    assert.equal(result.decision.nextAction, 'stop_unresolved');
  }
});

test('invalid evidence input fails instead of advancing', async () => {
  await assert.rejects(
    runDebateEvidenceGapGate({
      mode: 'deterministic',
      objective: '',
      research: completeResearch,
      persistStep: async (_name, operation) => operation(),
    }),
    /Invalid evidence-gap decision input/,
  );
});