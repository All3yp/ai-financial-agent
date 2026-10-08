import { z } from 'zod';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const secFactsInputSchema = z.object({
  ticker: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9.-]+$/),
  taxonomy: z.enum(['us-gaap', 'ifrs-full', 'dei']).default('us-gaap'),
  concepts: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/)).min(1).max(20),
  asOf: dateSchema.optional(),
  limitPerConcept: z.number().int().min(1).max(100).default(20),
});
const observationSchema = z.object({
  start: dateSchema.optional(), end: dateSchema, val: z.number().finite(),
  accn: z.string().regex(/^\d{10}-\d{2}-\d{6}$/),
  fy: z.number().int().optional(), fp: z.string().optional(),
  form: z.string(), filed: dateSchema, frame: z.string().optional(),
}).refine((row) => !row.start || row.start <= row.end, 'Invalid XBRL duration');
const conceptSchema = z.object({
  label: z.string(), description: z.string(),
  units: z.record(z.array(observationSchema)),
});
const companySchema = z.object({
  cik: z.number().int().positive(), entityName: z.string(),
  facts: z.record(z.record(z.unknown())),
});

export function parseSECCompanyFacts(payload: unknown, expectedCIK: string, input: z.input<typeof secFactsInputSchema>) {
  const parsed = secFactsInputSchema.parse(input);
  const company = companySchema.safeParse(payload);
  if (!company.success || String(company.data.cik).padStart(10, '0') !== expectedCIK) {
    throw new Error('SEC returned invalid or mismatched company facts');
  }
  const warnings = [
    'Standard company-wide XBRL facts only, not reconstructed financial statements or custom dimensional disclosures.',
    'Keep units, duration starts, report ends and accession contexts separate; quarterly filings may contain year-to-date values.',
  ];
  const facts = [...new Set(parsed.concepts)].map((concept) => {
    const raw = company.data.facts[parsed.taxonomy]?.[concept];
    if (raw === undefined) {
      warnings.push(`Concept ${parsed.taxonomy}:${concept} is unavailable.`);
      return { concept, label: null, description: null, observations: [], truncated: false };
    }
    const result = conceptSchema.safeParse(raw);
    if (!result.success) throw new Error('SEC returned invalid XBRL observations');
    const observations = Object.entries(result.data.units).flatMap(([unit, rows]) => rows
      .filter((row) => !parsed.asOf || row.filed <= parsed.asOf)
      .map((row) => ({
        unit, value: row.val, start: row.start ?? null, end: row.end,
        accessionNumber: row.accn, fiscalYear: row.fy ?? null, fiscalPeriod: row.fp ?? null,
        form: row.form, filed: row.filed, frame: row.frame ?? null,
      }))).sort((first, second) => second.filed.localeCompare(first.filed)
        || second.end.localeCompare(first.end) || first.unit.localeCompare(second.unit));
    const truncated = observations.length > parsed.limitPerConcept;
    if (truncated) warnings.push(`Concept ${concept} was limited to ${parsed.limitPerConcept} observations.`);
    return {
      concept, label: result.data.label, description: result.data.description,
      observations: observations.slice(0, parsed.limitPerConcept), truncated,
    };
  });
  return {
    ticker: parsed.ticker.toUpperCase().replaceAll('.', '-'), cik: expectedCIK,
    companyName: company.data.entityName, taxonomy: parsed.taxonomy, facts,
    metadata: { source: 'sec-edgar' as const, fetched_at: new Date().toISOString(), asOf: parsed.asOf ?? null, warnings },
  };
}