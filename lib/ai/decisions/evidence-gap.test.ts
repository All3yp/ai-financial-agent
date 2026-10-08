import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyEvidenceGap,
  decideEvidenceGap,
  fallbackEvidenceGapDecision,
  parseEvidenceGapDecisionMode,
  validateEvidenceGapDecision,
  validateProviderDecision,
} from './evidence-gap';

const categories = [
  'prices',
  'incomeStatements',
  'balanceSheets',
  'cashFlows',
  'metrics',
] as const;

function input(overrides: Record<string, unknown> = {}) {
  return {
    policyVersion: 'financial-evidence-gap-v1',
    objective: 'Assess the supplied financial evidence for synthesis.',
    requiredCategories: [...categories],
    evidence: categories.map((category) => ({
      category,
      reference: `research:${category}`,
      count: 1,
      state: 'available',
      coverage: { from: '2026-01-01', to: '2026-01-01' },
    })),
    missingInformation: [],
    conflicts: [],
    needsClarification: false,
    remainingBudget: { decisionAttempts: 1, collectionIterations: 0 },
    allowedActions: ['synthesize', 'stop_unresolved'],
    ...overrides,
  };
}

test('classifies sufficient financial coverage without claiming more than coverage', () => {
  const decision = classifyEvidenceGap(input());
  assert.equal(decision.status, 'resolved');
  assert.equal(decision.outcome, 'sufficient_for_summary');
  assert.equal(decision.nextAction, 'synthesize');
  assert.equal(decision.source, 'deterministic');
});

test('classifies each explicitly represented evidence gap', () => {
  const missingEvents = classifyEvidenceGap(
    input({ missingInformation: ['recentEvents'] }),
  );
  assert.equal(missingEvents.outcome, 'missing_recent_events');
  assert.equal(missingEvents.nextAction, 'stop_unresolved');

  const conflict = classifyEvidenceGap(input({ conflicts: ['source:filing:1'] }));
  assert.equal(conflict.outcome, 'conflicting_sources');
  assert.deepEqual(conflict.evidenceReferences, ['source:filing:1']);

  const clarification = classifyEvidenceGap(input({ needsClarification: true }));
  assert.equal(clarification.outcome, 'needs_user_clarification');
});

test('mandatory missing, failed, and unknown evidence cannot be sufficient', () => {
  for (const state of ['missing', 'retrieval_failed', 'unknown']) {
    const decision = classifyEvidenceGap(
      input({
        evidence: [
          {
            category: 'prices',
            reference: `research:${state}`,
            count: 0,
            state,
            coverage: { from: null, to: null },
          },
        ],
      }),
    );
    assert.equal(decision.outcome, 'missing_financial_data');
    assert.equal(decision.nextAction, 'stop_unresolved');
    assert.notEqual(decision.status, 'resolved');
    assert.equal(
      decision.reason,
      state === 'retrieval_failed'
        ? 'evidence_retrieval_failed'
        : state === 'unknown'
          ? 'evidence_unknown'
          : 'required_evidence_missing',
    );
  }
});

test('mandatory rules take precedence over conflict and clarification labels', () => {
  const decision = classifyEvidenceGap(
    input({
      evidence: [],
      conflicts: ['conflict:1'],
      needsClarification: true,
    }),
  );
  assert.equal(decision.outcome, 'missing_financial_data');
  assert.equal(decision.reason, 'evidence_unknown');
});

test('otherwise-present evidence without actual date coverage remains unknown', () => {
  const decision = classifyEvidenceGap(
    input({
      evidence: [
        {
          category: 'prices',
          reference: 'research:prices',
          count: 1,
          state: 'available',
          coverage: { from: null, to: null },
        },
      ],
    }),
  );
  assert.equal(decision.outcome, 'missing_financial_data');
  assert.equal(decision.reason, 'evidence_unknown');
});

test('exhausted decision budget and unsupported actions stop explicitly', () => {
  const exhausted = classifyEvidenceGap(
    input({ remainingBudget: { decisionAttempts: 0, collectionIterations: 0 } }),
  );
  assert.equal(exhausted.outcome, null);
  assert.equal(exhausted.reason, 'budget_exhausted');
  assert.equal(exhausted.status, 'unresolved');

  const unsupported = classifyEvidenceGap(input({ allowedActions: ['stop_unresolved'] }));
  assert.equal(unsupported.outcome, null);
  assert.equal(unsupported.reason, 'unsupported_action');
  assert.equal(unsupported.nextAction, 'stop_unresolved');
});

test('malformed or oversized inputs are invalid and cannot advance', () => {
  const malformed = classifyEvidenceGap(input({ objective: '' }));
  assert.equal(malformed.status, 'invalid');
  assert.equal(malformed.reason, 'invalid_input');
  assert.equal(malformed.nextAction, 'stop_unresolved');

  const oversized = classifyEvidenceGap(input({ objective: 'x'.repeat(16 * 1024) }));
  assert.equal(oversized.status, 'invalid');
  assert.equal(oversized.outcome, null);

  const missingStopAction = classifyEvidenceGap(
    input({ allowedActions: ['synthesize'] }),
  );
  assert.equal(missingStopAction.status, 'invalid');

  const invalidDate = classifyEvidenceGap(
    input({
      evidence: [
        {
          category: 'prices',
          reference: 'research:prices',
          count: 1,
          state: 'available',
          coverage: { from: '2026-02-30', to: '2026-03-01' },
        },
      ],
    }),
  );
  assert.equal(invalidDate.status, 'invalid');
});

test('provider decisions are strictly validated and cannot add outcomes', () => {
  const valid = validateProviderDecision({
    outcome: 'sufficient_for_summary',
    evidenceReferences: ['research:prices'],
    provider: 'fixture-provider',
    model: 'fixture-model',
    probability: 0.8,
  });
  assert.equal(valid.probability, 0.8);
  assert.throws(() =>
    validateProviderDecision({
      outcome: 'buy',
      evidenceReferences: [],
      provider: 'fixture-provider',
      model: 'fixture-model',
    }),
  );
  assert.throws(() =>
    validateProviderDecision({
      outcome: 'sufficient_for_summary',
      evidenceReferences: [],
      provider: 'fixture-provider',
      model: 'fixture-model',
      explanation: 'not part of the contract',
    }),
  );
});

test('fallback after provider failure does not invent confidence or accept unresolved evidence', () => {
  const fallback = fallbackEvidenceGapDecision(input());
  assert.equal(fallback.source, 'fallback');
  assert.equal(fallback.status, 'unresolved');
  assert.equal(fallback.outcome, null);
  assert.equal(fallback.reason, 'provider_failure');
  assert.equal('probability' in fallback, false);

  const mandatory = fallbackEvidenceGapDecision(
    input({ missingInformation: ['recentEvents'] }),
  );
  assert.equal(mandatory.outcome, 'missing_recent_events');
  assert.equal(mandatory.reason, 'recent_events_missing');
});

test('result validation rejects any attempt to synthesize from an unsupported outcome', () => {
  assert.throws(() =>
    validateEvidenceGapDecision({
      status: 'resolved',
      outcome: 'missing_financial_data',
      source: 'provider',
      policyVersion: 'financial-evidence-gap-v1',
      nextAction: 'synthesize',
      evidenceReferences: [],
    }),
  );
});

test('decision mode defaults off and rejects unsupported configuration', () => {
  assert.equal(parseEvidenceGapDecisionMode(undefined), 'off');
  assert.equal(parseEvidenceGapDecisionMode('off'), 'off');
  assert.equal(parseEvidenceGapDecisionMode('deterministic'), 'deterministic');
  assert.throws(() => parseEvidenceGapDecisionMode('external'));
});

test('injected provider is called only after deterministic rules and returns validated metadata', async () => {
  let calls = 0;
  const decision = await decideEvidenceGap(input(), {
    provider: 'test-provider',
    async decide(_evidence, allowedOutcomes) {
      calls += 1;
      assert.ok(allowedOutcomes.includes('sufficient_for_summary'));
      return {
        outcome: 'conflicting_sources',
        evidenceReferences: ['research:prices'],
        provider: 'test-provider',
        model: 'test-model',
        probability: 0.6,
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(decision.status, 'unresolved');
  assert.equal(decision.outcome, 'conflicting_sources');
  assert.equal(decision.source, 'provider');
  assert.equal(decision.provider, 'test-provider');
  assert.equal(decision.probability, 0.6);
});

test('deterministic blocker prevents an optional provider call', async () => {
  let calls = 0;
  const decision = await decideEvidenceGap(
    input({ missingInformation: ['recentEvents'] }),
    {
      provider: 'test-provider',
      async decide() {
        calls += 1;
        return {};
      },
    },
  );
  assert.equal(calls, 0);
  assert.equal(decision.outcome, 'missing_recent_events');
  assert.equal(decision.source, 'deterministic');
});

test('malformed provider outcomes and unknown evidence references fall back closed', async () => {
  const malformed = await decideEvidenceGap(input(), {
    provider: 'test-provider',
    async decide() {
      return { outcome: 'buy' };
    },
  });
  assert.equal(malformed.source, 'fallback');
  assert.equal(malformed.outcome, null);
  assert.equal(malformed.reason, 'provider_failure');

  const unknownReference = await decideEvidenceGap(input(), {
    provider: 'test-provider',
    async decide() {
      return {
        outcome: 'sufficient_for_summary',
        evidenceReferences: ['untrusted:invented'],
        provider: 'test-provider',
        model: 'test-model',
      };
    },
  });
  assert.equal(unknownReference.source, 'fallback');
  assert.equal(unknownReference.status, 'unresolved');
  assert.equal(unknownReference.reason, 'provider_invalid_response');
});

test('provider failures and pre-cancelled calls use unresolved fallback without error detail', async () => {
  const failed = await decideEvidenceGap(input(), {
    provider: 'test-provider',
    async decide() {
      throw new Error('sensitive provider response and input');
    },
  });
  assert.equal(failed.source, 'fallback');
  assert.equal(failed.reason, 'provider_failure');
  assert.equal('explanation' in failed, false);

  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const cancelled = await decideEvidenceGap(
    input(),
    {
      provider: 'test-provider',
      async decide() {
        calls += 1;
        return {};
      },
    },
    controller.signal,
  );
  assert.equal(calls, 0);
  assert.equal(cancelled.source, 'fallback');
  assert.equal(cancelled.reason, 'provider_failure');

  const duringCallController = new AbortController();
  const duringCall = decideEvidenceGap(
    input(),
    {
      provider: 'test-provider',
      async decide() {
        duringCallController.abort();
        return {
          outcome: 'sufficient_for_summary',
          evidenceReferences: ['research:prices'],
          provider: 'test-provider',
          model: 'test-model',
        };
      },
    },
    duringCallController.signal,
  );
  const afterCancellation = await duringCall;
  assert.equal(afterCancellation.source, 'fallback');
  assert.equal(afterCancellation.nextAction, 'stop_unresolved');
});