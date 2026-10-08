import { z } from 'zod';

export const evidenceGapOutcomes = [
  'sufficient_for_summary',
  'missing_financial_data',
  'missing_recent_events',
  'conflicting_sources',
  'needs_user_clarification',
] as const;

const categorySchema = z.enum([
  'prices',
  'incomeStatements',
  'balanceSheets',
  'cashFlows',
  'metrics',
  'recentEvents',
]);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((date) => {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
  });

const evidenceGapInputSchema = z
  .object({
    policyVersion: z.literal('financial-evidence-gap-v1'),
    objective: z.string().trim().min(1).max(2000),
    requiredCategories: z.array(categorySchema).min(1).max(6),
    evidence: z
      .array(
        z
          .object({
            category: categorySchema,
            reference: z.string().trim().min(1).max(80),
            count: z.number().int().min(0).max(10000),
            state: z.enum(['available', 'missing', 'retrieval_failed', 'unknown']),
            coverage: z
              .object({ from: dateSchema.nullable(), to: dateSchema.nullable() })
              .strict(),
          })
          .strict(),
      )
      .max(6),
    missingInformation: z.array(categorySchema).max(6),
    conflicts: z.array(z.string().trim().min(1).max(80)).max(5),
    needsClarification: z.boolean(),
    remainingBudget: z
      .object({
        decisionAttempts: z.number().int().min(0).max(1),
        collectionIterations: z.literal(0),
      })
      .strict(),
    allowedActions: z.array(z.enum(['synthesize', 'stop_unresolved'])).min(1).max(2),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.allowedActions.includes('stop_unresolved')) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'stop_unresolved must remain available.' });
    }
    if (new Set(value.requiredCategories).size !== value.requiredCategories.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Required evidence categories must be unique.' });
    }
    if (new Set(value.evidence.map((item) => item.category)).size !== value.evidence.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence categories must be unique.' });
    }
    for (const item of value.evidence) {
      if (
        item.coverage.from !== null &&
        item.coverage.to !== null &&
        item.coverage.from > item.coverage.to
      ) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence coverage dates are reversed.' });
      }
    }
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 16 * 1024) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence-gap input exceeds 16 KiB.' });
    }
  });

const providerDecisionSchema = z
  .object({
    outcome: z.enum(evidenceGapOutcomes),
    evidenceReferences: z.array(z.string().trim().min(1).max(80)).max(5),
    provider: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(120),
    probability: z.number().min(0).max(1).optional(),
  })
  .strict();

const decisionResultSchema = z
  .object({
    status: z.enum(['resolved', 'unresolved', 'invalid']),
    outcome: z.enum(evidenceGapOutcomes).nullable(),
    source: z.enum(['deterministic', 'provider', 'fallback']),
    policyVersion: z.literal('financial-evidence-gap-v1'),
    nextAction: z.enum(['synthesize', 'stop_unresolved']),
    evidenceReferences: z.array(z.string().max(80)).max(5),
    reason: z.enum([
      'required_evidence_missing',
      'evidence_retrieval_failed',
      'evidence_unknown',
      'recent_events_missing',
      'sources_conflict',
      'clarification_required',
      'budget_exhausted',
      'unsupported_action',
      'invalid_input',
      'provider_failure',
      'provider_invalid_response',
    ]).optional(),
    provider: z.string().max(80).optional(),
    model: z.string().max(120).optional(),
    probability: z.number().min(0).max(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 4 * 1024) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence-gap result exceeds 4 KiB.' });
    }
    if (value.status === 'resolved' && value.outcome !== 'sufficient_for_summary') {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Only sufficient evidence may resolve.' });
    }
    if (value.nextAction === 'synthesize' && value.outcome !== 'sufficient_for_summary') {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Unsupported outcome cannot synthesize.' });
    }
    if (value.status === 'invalid' && value.nextAction !== 'stop_unresolved') {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid input cannot advance.' });
    }
  });

export type EvidenceGapInput = z.infer<typeof evidenceGapInputSchema>;
export type EvidenceGapDecision = z.infer<typeof decisionResultSchema>;
export type EvidenceGapProviderDecision = z.infer<typeof providerDecisionSchema>;

export interface EvidenceGapDecisionProvider {
  readonly provider: string;
  decide(
    input: EvidenceGapInput,
    allowedOutcomes: readonly (typeof evidenceGapOutcomes)[number][],
    signal?: AbortSignal,
  ): Promise<unknown>;
}

export type EvidenceGapDecisionMode = 'off' | 'deterministic';

export function parseEvidenceGapDecisionMode(
  value: unknown = process.env.EVIDENCE_GAP_DECISION_MODE,
): EvidenceGapDecisionMode {
  if (value === undefined || value === '') return 'off';
  if (value === 'off' || value === 'deterministic') return value;
  throw new Error('Invalid EVIDENCE_GAP_DECISION_MODE configuration.');
}

function makeDecision(
  outcome: EvidenceGapDecision['outcome'],
  reason?: EvidenceGapDecision['reason'],
  evidenceReferences: string[] = [],
  status?: EvidenceGapDecision['status'],
): EvidenceGapDecision {
  const sufficient = outcome === 'sufficient_for_summary';
  return decisionResultSchema.parse({
    status: status ?? (sufficient ? 'resolved' : 'unresolved'),
    outcome,
    source: 'deterministic',
    policyVersion: 'financial-evidence-gap-v1',
    nextAction: sufficient ? 'synthesize' : 'stop_unresolved',
    evidenceReferences: evidenceReferences.slice(0, 5),
    ...(reason ? { reason } : {}),
  });
}

export function validateEvidenceGapInput(value: unknown): EvidenceGapInput {
  return evidenceGapInputSchema.parse(value);
}

export function validateProviderDecision(value: unknown): EvidenceGapProviderDecision {
  return providerDecisionSchema.parse(value);
}

export function validateEvidenceGapDecision(value: unknown): EvidenceGapDecision {
  return decisionResultSchema.parse(value);
}

export function classifyEvidenceGap(value: unknown): EvidenceGapDecision {
  const parsed = evidenceGapInputSchema.safeParse(value);
  if (!parsed.success) {
    return makeDecision(null, 'invalid_input', [], 'invalid');
  }

  const input = parsed.data;
  const stopReference = input.evidence.map((item) => item.reference);
  if (input.remainingBudget.decisionAttempts < 1) {
    return makeDecision(null, 'budget_exhausted', stopReference);
  }
  if (!input.allowedActions.includes('stop_unresolved')) {
    return makeDecision(null, 'unsupported_action', stopReference);
  }

  const evidenceByCategory = new Map(input.evidence.map((item) => [item.category, item]));
  for (const category of input.requiredCategories) {
    const evidence = evidenceByCategory.get(category);
    if (input.missingInformation.includes(category)) {
      return makeDecision(
        category === 'recentEvents'
          ? 'missing_recent_events'
          : 'missing_financial_data',
        category === 'recentEvents'
          ? 'recent_events_missing'
          : 'required_evidence_missing',
        evidence ? [evidence.reference] : stopReference,
      );
    }
    if (!evidence || evidence.state === 'unknown') {
      return makeDecision('missing_financial_data', 'evidence_unknown', stopReference);
    }
    if (evidence.state === 'retrieval_failed') {
      return makeDecision(
        category === 'recentEvents' ? 'missing_recent_events' : 'missing_financial_data',
        'evidence_retrieval_failed',
        [evidence.reference],
      );
    }
    if (evidence.state === 'missing' || evidence.count === 0) {
      return makeDecision(
        category === 'recentEvents' ? 'missing_recent_events' : 'missing_financial_data',
        category === 'recentEvents' ? 'recent_events_missing' : 'required_evidence_missing',
        [evidence.reference],
      );
    }
    if (evidence.coverage.from === null || evidence.coverage.to === null) {
      return makeDecision('missing_financial_data', 'evidence_unknown', [evidence.reference]);
    }
  }

  if (input.missingInformation.includes('recentEvents')) {
    return makeDecision('missing_recent_events', 'recent_events_missing', stopReference);
  }
  if (input.conflicts.length > 0) {
    return makeDecision('conflicting_sources', 'sources_conflict', input.conflicts);
  }
  if (input.needsClarification) {
    return makeDecision('needs_user_clarification', 'clarification_required', stopReference);
  }
  if (!input.allowedActions.includes('synthesize')) {
    return makeDecision(null, 'unsupported_action', stopReference);
  }

  return makeDecision('sufficient_for_summary', undefined, stopReference);
}

export function fallbackEvidenceGapDecision(
  value: unknown,
  failureReason: EvidenceGapDecision['reason'] = 'provider_failure',
): EvidenceGapDecision {
  const baseline = classifyEvidenceGap(value);
  if (baseline.status === 'invalid' || baseline.outcome !== 'sufficient_for_summary') {
    return { ...baseline, source: 'fallback' };
  }
  return {
    ...makeDecision(null, failureReason, baseline.evidenceReferences),
    source: 'fallback',
  };
}

export async function decideEvidenceGap(
  value: unknown,
  provider?: EvidenceGapDecisionProvider,
  signal?: AbortSignal,
): Promise<EvidenceGapDecision> {
  const baseline = classifyEvidenceGap(value);
  if (
    baseline.status === 'invalid' ||
    baseline.outcome !== 'sufficient_for_summary' ||
    !provider
  ) {
    return baseline;
  }

  const input = validateEvidenceGapInput(value);
  if (signal?.aborted) {
    return fallbackEvidenceGapDecision(value, 'provider_failure');
  }

  try {
    const rawResponse = await provider.decide(input, evidenceGapOutcomes, signal);
    if (signal?.aborted) {
      return fallbackEvidenceGapDecision(value, 'provider_failure');
    }
    const response = validateProviderDecision(rawResponse);
    const knownReferences = new Set(input.evidence.map((item) => item.reference));
    if (response.evidenceReferences.some((reference) => !knownReferences.has(reference))) {
      return fallbackEvidenceGapDecision(value, 'provider_invalid_response');
    }
    const sufficient = response.outcome === 'sufficient_for_summary';
    return validateEvidenceGapDecision({
      status: sufficient ? 'resolved' : 'unresolved',
      outcome: response.outcome,
      source: 'provider',
      policyVersion: 'financial-evidence-gap-v1',
      nextAction: sufficient ? 'synthesize' : 'stop_unresolved',
      evidenceReferences: response.evidenceReferences,
      provider: response.provider,
      model: response.model,
      ...(response.probability === undefined ? {} : { probability: response.probability }),
    });
  } catch {
    return fallbackEvidenceGapDecision(value, 'provider_failure');
  }
}