import {
  classifyEvidenceGap,
  validateEvidenceGapDecision,
  type EvidenceGapDecision,
  type EvidenceGapDecisionMode,
  type EvidenceGapInput,
} from '@/lib/ai/decisions/evidence-gap';

const requiredCategories = [
  'prices',
  'incomeStatements',
  'balanceSheets',
  'cashFlows',
  'metrics',
] as const;

const usableNumericFields: Record<
  Exclude<(typeof requiredCategories)[number], 'prices'>,
  readonly string[]
> = {
  incomeStatements: [
    'revenue',
    'gross_profit',
    'operating_income',
    'net_income',
    'earnings_per_share',
  ],
  balanceSheets: [
    'total_assets',
    'total_liabilities',
    'shareholders_equity',
    'current_assets',
    'cash_and_equivalents',
  ],
  cashFlows: [
    'net_cash_flow_from_operations',
    'net_cash_flow_from_investing',
    'net_cash_flow_from_financing',
    'free_cash_flow',
    'ending_cash_balance',
  ],
  metrics: [
    'market_cap',
    'price_to_earnings_ratio',
    'return_on_equity',
    'current_ratio',
    'free_cash_flow_yield',
  ],
};

function isFiniteFinancialValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || value.trim() === '') return false;
  return Number.isFinite(Number(value));
}

function dateCoverage(
  category: (typeof requiredCategories)[number],
  rows: unknown,
): {
  from: string | null;
  to: string | null;
  complete: boolean;
} {
  if (!Array.isArray(rows)) return { from: null, to: null, complete: false };
  const dates = rows.map((row) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
    const record = row as Record<string, unknown>;
    const candidate = record.time ?? record.report_period;
    if (typeof candidate !== 'string') return null;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(candidate);
    const timestamp =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(candidate);
    if (!dateOnly && !timestamp) return null;
    const date = candidate.slice(0, 10);
    const parsed = new Date(`${date}T00:00:00.000Z`);
    const observed =
      category === 'prices'
        ? typeof record.close === 'number' &&
          Number.isFinite(record.close) &&
          record.close > 0
        : usableNumericFields[category].some((key) =>
            isFiniteFinancialValue(record[key]),
          );
    if (
      Number.isNaN(parsed.valueOf()) ||
      parsed.toISOString().slice(0, 10) !== date ||
      (timestamp && Number.isNaN(Date.parse(candidate))) ||
      !observed
    ) {
      return null;
    }
    return date;
  });
  const validDates = dates.filter((date): date is string => date !== null).sort();
  return {
    from: validDates[0] ?? null,
    to: validDates.at(-1) ?? null,
    complete: rows.length > 0 && validDates.length === rows.length,
  };
}

export function buildDebateEvidenceGapInput(
  objective: string,
  research: unknown,
): EvidenceGapInput {
  const data =
    research !== null && typeof research === 'object'
      ? (research as Record<string, unknown>)
      : {};

  return {
    policyVersion: 'financial-evidence-gap-v1',
    objective,
    requiredCategories: [...requiredCategories],
    evidence: requiredCategories.map((category) => {
      const value = data[category];
      const count = Array.isArray(value) ? value.length : 0;
      const coverage = dateCoverage(category, value);
      return {
        category,
        reference: `research:${category}`,
        count,
        coverage: { from: coverage.from, to: coverage.to },
        state: Array.isArray(value)
          ? count === 0
            ? 'missing'
            : coverage.complete
            ? 'available'
            : 'unknown'
          : 'unknown',
      };
    }),
    missingInformation: [],
    conflicts: [],
    needsClarification: false,
    remainingBudget: { decisionAttempts: 1, collectionIterations: 0 },
    allowedActions: ['synthesize', 'stop_unresolved'],
  };
}

export async function runDebateEvidenceGapGate(input: {
  mode: EvidenceGapDecisionMode;
  objective: string;
  research: unknown;
  persistStep: <T>(name: string, operation: () => Promise<T>) => Promise<T>;
}): Promise<
  | { kind: 'disabled' }
  | { kind: 'continue'; decision: EvidenceGapDecision }
  | { kind: 'stop'; decision: EvidenceGapDecision }
> {
  if (input.mode === 'off') return { kind: 'disabled' };

  const decision = await input.persistStep('evidence-gap-decision', async () =>
    validateEvidenceGapDecision(
      classifyEvidenceGap(
        buildDebateEvidenceGapInput(input.objective, input.research),
      ),
    ),
  );
  if (decision.status === 'invalid') {
    throw new Error('Invalid evidence-gap decision input.');
  }
  return decision.nextAction === 'synthesize'
    ? { kind: 'continue', decision }
    : { kind: 'stop', decision };
}