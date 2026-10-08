import { z } from 'zod';

export const MACRO_DATA_LIMITS = Object.freeze({
  yieldDays: 366,
  inflationYears: 10,
  yieldObservations: 366,
  inflationObservations: 3660,
  cacheEntries: 64,
  cacheMilliseconds: 5 * 60 * 1000,
  timeoutMilliseconds: 15_000,
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value);
  return value.slice(0, 4) !== '0000' && Number.isFinite(date.getTime())
    && date.toISOString().slice(0, 10) === value;
});
const rangeFields = { startDate: dateSchema, endDate: dateSchema, asOf: dateSchema };

function validRange(input: { startDate: string; endDate: string; asOf: string }) {
  return input.startDate <= input.endDate && input.endDate <= input.asOf;
}

function withinTenYears(startDate: string, endDate: string) {
  const anniversary = new Date(startDate);
  const month = anniversary.getUTCMonth();
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + MACRO_DATA_LIMITS.inflationYears);
  if (anniversary.getUTCMonth() !== month) anniversary.setUTCDate(0);
  return new Date(endDate).getTime() <= anniversary.getTime();
}

export const yieldCurveInputSchema = z.object(rangeFields).strict()
  .refine(validRange, 'Invalid observation range or vintage')
  .refine((input) => (new Date(input.endDate).getTime() - new Date(input.startDate).getTime())
    / 86_400_000 + 1 <= MACRO_DATA_LIMITS.yieldDays, 'Yield range exceeds 366 days');

export const inflationSeriesSchema = z.enum(['CPIAUCSL', 'CPILFESL', 'PCEPI', 'PCEPILFE', 'PPIACO']);
export const inflationInputSchema = z.object({
  ...rangeFields,
  series: z.array(inflationSeriesSchema).min(1).max(5)
    .refine((series) => new Set(series).size === series.length, 'Duplicate series'),
}).strict().refine(validRange, 'Invalid observation range or vintage')
  .refine((input) => withinTenYears(input.startDate, input.endDate), 'Inflation range exceeds ten years');

export type YieldCurveInput = z.input<typeof yieldCurveInputSchema>;
export type InflationInput = z.input<typeof inflationInputSchema>;
export type InflationSeries = z.infer<typeof inflationSeriesSchema>;
export type YieldSeries = 'DGS2' | 'DGS10' | 'DGS3MO';

const numericValueSchema = z.string().refine((value) => value === '.'
  || (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)
    && Number.isFinite(Number(value)))).transform((value) => value === '.' ? null : Number(value));
const observationSchema = z.object({
  date: dateSchema,
  value: numericValueSchema,
  realtime_start: dateSchema,
  realtime_end: dateSchema,
});
const envelopeSchema = z.object({
  realtime_start: dateSchema,
  realtime_end: dateSchema,
  observation_start: dateSchema,
  observation_end: dateSchema,
  units: z.enum(['lin', 'pc1']),
  output_type: z.literal(1),
  file_type: z.literal('json'),
  order_by: z.literal('observation_date'),
  sort_order: z.literal('asc'),
  count: z.number().int().nonnegative().safe(),
  offset: z.number().int().nonnegative().safe(),
  limit: z.number().int().positive().safe(),
  observations: z.array(observationSchema).max(MACRO_DATA_LIMITS.inflationObservations),
});

export interface MacroObservation {
  date: string;
  value: number | null;
  realtimeStart: string;
  realtimeEnd: string;
}

export interface MacroSeries<Series extends string> {
  seriesId: Series;
  asOf: string;
  units: 'percent' | 'year-over-year percent';
  observations: MacroObservation[];
  metadata: {
    realtimeStart: string;
    realtimeEnd: string;
    fetchedAt: string;
    count: number;
    offset: number;
    limit: number;
    complete: true;
  };
}

export interface MacroMetadata {
  source: 'FRED';
  asOf: string;
  observationStart: string;
  observationEnd: string;
  warnings: string[];
  limits: typeof MACRO_DATA_LIMITS;
}

export interface YieldCurveResult {
  asOf: string;
  yields: MacroSeries<YieldSeries>[];
  spreads: {
    name: '2s10s' | '3m10y';
    longSeries: 'DGS10';
    shortSeries: 'DGS2' | 'DGS3MO';
    units: 'percentage points';
    observations: { date: string; value: number }[];
  }[];
  metadata: MacroMetadata;
}

export interface InflationResult {
  asOf: string;
  series: MacroSeries<InflationSeries>[];
  metadata: MacroMetadata;
}

type RequestRange = z.infer<typeof yieldCurveInputSchema>;
type CachedSeries = MacroSeries<YieldSeries | InflationSeries>;
type CacheEntry = { promise: Promise<CachedSeries>; expiresAt: number | null };

function metadata(input: RequestRange, missing: boolean): MacroMetadata {
  return {
    source: 'FRED', asOf: input.asOf,
    observationStart: input.startDate, observationEnd: input.endDate,
    limits: MACRO_DATA_LIMITS,
    warnings: [
      'Historical observations at the requested FRED vintage; not forecasts or market expectations.',
      'Series may have different release schedules and observation frequencies; no forward-fill is applied.',
      ...(missing ? ['Missing observations are null; absent dates are not fabricated.'] : []),
    ],
  };
}

export class FREDClient {
  #apiKey: string;
  #fetcher: typeof fetch;
  #cache = new Map<string, CacheEntry>();

  constructor(apiKey: string, fetcher: typeof fetch = fetch) {
    if (typeof apiKey !== 'string' || !/^[a-z0-9]{32}$/.test(apiKey.trim())) {
      throw new Error('Invalid FRED API key configuration');
    }
    this.#apiKey = apiKey.trim();
    this.#fetcher = fetcher;
  }

  async getYieldCurve(input: YieldCurveInput): Promise<YieldCurveResult> {
    const parsed = yieldCurveInputSchema.safeParse(input);
    if (!parsed.success) throw new Error('Invalid yield curve input');
    const range = parsed.data;
    const seriesIds = ['DGS2', 'DGS10', 'DGS3MO'] as const;
    const yields = await Promise.all(seriesIds.map((seriesId) =>
      this.#series(seriesId, range, 'lin', MACRO_DATA_LIMITS.yieldObservations)));
    const longValues = new Map(yields[1].observations.map((row) => [row.date, row.value]));
    const spreads: YieldCurveResult['spreads'] = ([
      { name: '2s10s', shortSeries: 'DGS2', rows: yields[0].observations },
      { name: '3m10y', shortSeries: 'DGS3MO', rows: yields[2].observations },
    ] as const).map(({ name, shortSeries, rows }) => ({
      name, shortSeries, longSeries: 'DGS10', units: 'percentage points',
      observations: rows.flatMap((row) => {
        const longValue = longValues.get(row.date);
        if (row.value === null || longValue === null || longValue === undefined) return [];
        const value = longValue - row.value;
        if (!Number.isFinite(value)) throw new Error('FRED returned invalid spread values');
        return [{ date: row.date, value }];
      }),
    }));
    const resultMetadata = metadata(range, yields.some((series) =>
      series.observations.length === 0 || series.observations.some((row) => row.value === null)));
    resultMetadata.warnings.push('Spreads are 10-year minus short-term yield on common non-null dates only.');
    return { asOf: range.asOf, yields, spreads, metadata: resultMetadata };
  }

  async getInflationData(input: InflationInput): Promise<InflationResult> {
    const parsed = inflationInputSchema.safeParse(input);
    if (!parsed.success) throw new Error('Invalid inflation input');
    const range = parsed.data;
    const series = await Promise.all(range.series.map((seriesId) =>
      this.#series(seriesId, range, 'pc1', MACRO_DATA_LIMITS.inflationObservations)));
    const resultMetadata = metadata(range, series.some((item) =>
      item.observations.length === 0 || item.observations.some((row) => row.value === null)));
    resultMetadata.warnings.push('Year-over-year percent changes are supplied by FRED units=pc1, not month-over-month calculations.');
    return { asOf: range.asOf, series, metadata: resultMetadata };
  }

  async #series<Series extends YieldSeries | InflationSeries>(
    seriesId: Series, range: RequestRange, units: 'lin' | 'pc1', limit: number,
  ): Promise<MacroSeries<Series>> {
    const now = Date.now();
    for (const [key, entry] of this.#cache) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) this.#cache.delete(key);
    }
    const key = JSON.stringify([seriesId, range.startDate, range.endDate, range.asOf, units, limit]);
    let entry = this.#cache.get(key);
    if (!entry) {
      while (this.#cache.size >= MACRO_DATA_LIMITS.cacheEntries) {
        const oldest = this.#cache.keys().next().value;
        if (oldest !== undefined) this.#cache.delete(oldest);
      }
      entry = { promise: this.#request(seriesId, range, units, limit), expiresAt: null };
      this.#cache.set(key, entry);
      const current = entry;
      void current.promise.then(() => {
        if (this.#cache.get(key) === current) {
          current.expiresAt = Date.now() + MACRO_DATA_LIMITS.cacheMilliseconds;
        }
      }, () => {
        if (this.#cache.get(key) === current) this.#cache.delete(key);
      });
    }
    return structuredClone(await entry.promise) as MacroSeries<Series>;
  }

  async #request(
    seriesId: YieldSeries | InflationSeries, range: RequestRange, units: 'lin' | 'pc1', limit: number,
  ): Promise<CachedSeries> {
    const url = new URL('https://api.stlouisfed.org/fred/series/observations');
    url.search = new URLSearchParams({
      series_id: seriesId, api_key: this.#apiKey, file_type: 'json',
      realtime_start: range.asOf, realtime_end: range.asOf,
      observation_start: range.startDate, observation_end: range.endDate,
      units, output_type: '1', order_by: 'observation_date', sort_order: 'asc',
      limit: String(limit), offset: '0',
    }).toString();
    let payload: unknown;
    try {
      const response = await this.#fetcher(url.toString(), {
        signal: AbortSignal.timeout(MACRO_DATA_LIMITS.timeoutMilliseconds), redirect: 'error',
      });
      if (!response.ok) throw new Error('HTTP failure');
      payload = await response.json();
    } catch {
      throw new Error('FRED request failed');
    }
    if (payload !== null && typeof payload === 'object'
      && ('error_code' in payload || 'error_message' in payload)) {
      throw new Error('FRED returned an API error');
    }
    const parsed = envelopeSchema.safeParse(payload);
    if (!parsed.success) throw new Error('FRED returned invalid observations');
    const envelope = parsed.data;
    if (envelope.offset !== 0 || envelope.limit !== limit || envelope.count > limit
      || envelope.count !== envelope.observations.length) {
      throw new Error('FRED observation coverage is incomplete or exceeds limits');
    }
    if (envelope.realtime_start !== range.asOf || envelope.realtime_end !== range.asOf
      || envelope.observation_start !== range.startDate || envelope.observation_end !== range.endDate
      || envelope.units !== units) {
      throw new Error('FRED returned mismatched observation metadata');
    }
    const dates = new Set<string>();
    for (const row of envelope.observations) {
      if (dates.has(row.date) || row.date < range.startDate || row.date > range.endDate
        || row.realtime_start > row.realtime_end
        || row.realtime_start > range.asOf || row.realtime_end < range.asOf) {
        throw new Error('FRED returned invalid observation dates or vintage');
      }
      dates.add(row.date);
    }
    return {
      seriesId, asOf: range.asOf, units: units === 'lin' ? 'percent' : 'year-over-year percent',
      observations: envelope.observations.sort((first, second) => first.date.localeCompare(second.date))
        .map((row) => ({
          date: row.date, value: row.value, realtimeStart: row.realtime_start, realtimeEnd: row.realtime_end,
        })),
      metadata: {
        realtimeStart: envelope.realtime_start, realtimeEnd: envelope.realtime_end,
        fetchedAt: new Date().toISOString(), count: envelope.count,
        offset: envelope.offset, limit: envelope.limit, complete: true,
      },
    };
  }
}