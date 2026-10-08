import { classifyEvidenceGap } from '../lib/ai/decisions/evidence-gap';

const categories = ['prices', 'incomeStatements', 'balanceSheets', 'cashFlows', 'metrics'] as const;

const cases = [
  { name: 'complete-financial-coverage', expected: 'sufficient_for_summary', overrides: {} },
  {
    name: 'missing-income-statements',
    expected: 'missing_financial_data',
    overrides: { missingInformation: ['incomeStatements'] },
  },
  {
    name: 'recent-events-required-but-absent',
    expected: 'missing_recent_events',
    overrides: { requiredCategories: [...categories, 'recentEvents'], missingInformation: ['recentEvents'] },
  },
  {
    name: 'explicit-source-conflict',
    expected: 'conflicting_sources',
    overrides: { conflicts: ['source:filing:1'] },
  },
  {
    name: 'clarification-required',
    expected: 'needs_user_clarification',
    overrides: { needsClarification: true },
  },
] as const;

const startedAt = performance.now();
const results = cases.map((entry) => {
  const input = {
    policyVersion: 'financial-evidence-gap-v1',
    objective: `Synthetic evaluation: ${entry.name}`,
    requiredCategories: [...categories],
    evidence: categories.map((category) => ({
      category,
      reference: `fixture:${category}`,
      count: 1,
      state: 'available',
      coverage: { from: '2026-01-01', to: '2026-01-01' },
    })),
    missingInformation: [],
    conflicts: [],
    needsClarification: false,
    remainingBudget: { decisionAttempts: 1, collectionIterations: 0 },
    allowedActions: ['synthesize', 'stop_unresolved'],
    ...entry.overrides,
  };
  const decision = classifyEvidenceGap(input);
  return {
    name: entry.name,
    expected: entry.expected,
    actual: decision.outcome,
    passed: decision.outcome === entry.expected,
    unresolved: decision.status !== 'resolved',
    fallback: decision.source === 'fallback',
  };
});
const latencyMs = performance.now() - startedAt;
const unresolved = results.filter((result) => result.unresolved).length;
const fallbacks = results.filter((result) => result.fallback).length;
const passed = results.filter((result) => result.passed).length;

console.log(
  JSON.stringify(
    {
      label: 'SYNTHETIC SOFTWARE-BEHAVIOR EVALUATION; NOT FINANCIAL VALIDATION OR CALIBRATION',
      cases: results.length,
      routingAccuracy: passed / results.length,
      unresolvedCount: unresolved,
      unresolvedRate: unresolved / results.length,
      fallbackRate: fallbacks / results.length,
      latencyMs: Number(latencyMs.toFixed(3)),
      results,
    },
    null,
    2,
  ),
);

if (passed !== results.length) process.exitCode = 1;