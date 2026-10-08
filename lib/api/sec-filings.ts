import { z } from 'zod';

export const secFormSchema = z.enum(['10-K', '10-Q', '8-K']);
const filingFormSchema = z.enum(['10-K', '10-Q', '8-K', '10-K/A', '10-Q/A', '8-K/A']);
export const secFilingsInputSchema = z.object({
  ticker: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9.-]+$/),
  formType: secFormSchema,
  limit: z.number().int().min(1).max(100).default(10),
  includeHistorical: z.boolean().default(true),
  includeAmendments: z.boolean().default(false),
  maxArchivePages: z.number().int().min(1).max(20).default(5),
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
});
const tickerEntrySchema = z.object({
  cik_str: z.number().int().positive().max(9999999999),
  ticker: z.string(),
  title: z.string(),
});
const recentSchema = z.object({
  accessionNumber: z.array(z.string().regex(/^\d{10}-\d{2}-\d{6}$/)),
  filingDate: z.array(dateSchema),
  reportDate: z.array(z.union([dateSchema, z.literal('')])),
  form: z.array(z.string()),
  primaryDocument: z.array(z.string()),
}).refine((columns) => Object.values(columns).every((column) => column.length === columns.form.length),
  'SEC submission columns must have the same length');
const submissionsSchema = z.object({
  cik: z.union([z.string().regex(/^\d{1,10}$/), z.number().int().positive().max(9999999999)]),
  name: z.string(),
  filings: z.object({
    recent: recentSchema,
    files: z.array(z.object({ name: z.string() })).optional().default([]),
  }),
});

export interface SECFiling {
  accessionNumber: string;
  form: z.infer<typeof filingFormSchema>;
  filingDate: string;
  reportDate: string | null;
  primaryDocument: string | null;
  documentUrl: string | null;
  indexUrl: string;
}

export interface SECFilingsResult {
  ticker: string;
  cik: string;
  companyName: string;
  filings: SECFiling[];
  metadata: {
    source: 'sec-edgar';
    fetched_at: string;
    coverage: 'recent-submissions' | 'historical-submissions';
    archivePagesRead: number;
    archivePagesAvailable: number;
    historyComplete: boolean;
    warnings: string[];
  };
}

let requestQueue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;

function scheduleRequest(): Promise<void> {
  const scheduled = requestQueue.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + 200;
  });
  requestQueue = scheduled.catch(() => {});
  return scheduled;
}

export class SECClient {
  private cache = new Map<string, { expiresAt: number; result: Promise<unknown> }>();

  constructor(private userAgent: string, private fetcher: typeof fetch = fetch) {
    if (!userAgent || userAgent.length > 256 || /[\r\n]/.test(userAgent)
      || !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(userAgent)) {
      throw new Error('Configure SEC_USER_AGENT with an application name and a real contact email');
    }
  }

  private json(url: string): Promise<unknown> {
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
    const result = (async () => {
      await scheduleRequest();
      let response: Response;
      try {
        response = await this.fetcher(url, {
          headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
          signal: AbortSignal.timeout(15_000),
          redirect: 'error',
        });
      } catch {
        throw new Error('SEC request failed or timed out');
      }
      if (!response.ok) throw new Error(`SEC request failed (HTTP ${response.status}); check fair-access policy and retry later`);
      try {
        return await response.json();
      } catch {
        throw new Error('SEC returned invalid JSON');
      }
    })();
    const entry = { expiresAt: Date.now() + 300_000, result };
    this.cache.delete(url);
    if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(url, entry);
    void result.catch(() => {
      if (this.cache.get(url) === entry) this.cache.delete(url);
    });
    return result;
  }

  async getSECFilings(input: z.input<typeof secFilingsInputSchema>): Promise<SECFilingsResult> {
    const parsed = secFilingsInputSchema.parse(input);
    const ticker = parsed.ticker.toUpperCase().replaceAll('.', '-');
    const directory = z.record(tickerEntrySchema).safeParse(
      await this.json('https://www.sec.gov/files/company_tickers.json'),
    );
    if (!directory.success) throw new Error('SEC returned an invalid company directory');
    const company = Object.values(directory.data).find((entry) => entry.ticker.toUpperCase() === ticker);
    if (!company) throw new Error('Ticker was not found in the SEC company directory');
    const cik = String(company.cik_str).padStart(10, '0');
    const submissions = submissionsSchema.safeParse(
      await this.json(`https://data.sec.gov/submissions/CIK${cik}.json`),
    );
    if (!submissions.success || Number(submissions.data.cik) !== company.cik_str) {
      throw new Error('SEC returned invalid or mismatched submissions');
    }
    const archiveFiles = submissions.data.filings.files;
    if (archiveFiles.some((file) => !new RegExp(`^CIK${cik}-submissions-\\d+\\.json$`).test(file.name))
      || new Set(archiveFiles.map((file) => file.name)).size !== archiveFiles.length) {
      throw new Error('SEC returned invalid historical submission filenames');
    }
    const histories = [submissions.data.filings.recent];
    const pagesToRead = parsed.includeHistorical ? archiveFiles.slice(0, parsed.maxArchivePages) : [];
    for (const file of pagesToRead) {
      const archive = recentSchema.safeParse(await this.json(`https://data.sec.gov/submissions/${file.name}`));
      if (!archive.success) throw new Error('SEC returned invalid historical submissions');
      histories.push(archive.data);
    }
    const historyComplete = parsed.includeHistorical && pagesToRead.length === archiveFiles.length;
    const warnings = ['This is discovery metadata, not parsed filing content.'];
    if (!parsed.includeAmendments) warnings.push('Amended forms are excluded unless includeAmendments is enabled.');
    if (!parsed.includeHistorical) warnings.push('Recent submissions only; older archive pages were not requested.');
    else if (!historyComplete) warnings.push('Historical coverage is incomplete: maxArchivePages limited the archive pages fetched. Increase the bound for additional history.');
    const allFilings = histories.flatMap((recent) => recent.form.flatMap((form, index): SECFiling[] => {
      if (form !== parsed.formType && !(parsed.includeAmendments && form === `${parsed.formType}/A`)) return [];
      const accessionNumber = recent.accessionNumber[index];
      const base = `https://www.sec.gov/Archives/edgar/data/${company.cik_str}/${accessionNumber.replaceAll('-', '')}`;
      const primaryDocument = recent.primaryDocument[index];
      if (primaryDocument && !/^[A-Za-z0-9_.-]+$/.test(primaryDocument)) {
        throw new Error('SEC returned an unsafe primary document filename');
      }
      return [{
        accessionNumber,
        form: filingFormSchema.parse(form),
        filingDate: recent.filingDate[index],
        reportDate: recent.reportDate[index] || null,
        primaryDocument: primaryDocument || null,
        documentUrl: primaryDocument ? `${base}/${primaryDocument}` : null,
        indexUrl: `${base}/${accessionNumber}-index.html`,
      }];
    }));
    const uniqueFilings = new Map<string, SECFiling>();
    for (const filing of allFilings) {
      if (!uniqueFilings.has(filing.accessionNumber)) uniqueFilings.set(filing.accessionNumber, filing);
    }
    if (uniqueFilings.size !== allFilings.length) warnings.push('Duplicate accession numbers across submission pages were removed; recent metadata takes precedence.');
    const filings = [...uniqueFilings.values()].sort((first, second) => second.filingDate.localeCompare(first.filingDate)
      || second.accessionNumber.localeCompare(first.accessionNumber)).slice(0, parsed.limit);
    if (filings.length < parsed.limit) warnings.push('Fewer matching forms were available in the fetched submission pages than requested.');
    if (filings.some((filing) => !filing.documentUrl)) warnings.push('Some filings have no primary document; use the official filing index.');
    return {
      ticker,
      cik,
      companyName: submissions.data.name,
      filings,
      metadata: {
        source: 'sec-edgar', fetched_at: new Date().toISOString(),
        coverage: pagesToRead.length ? 'historical-submissions' : 'recent-submissions',
        archivePagesRead: pagesToRead.length, archivePagesAvailable: archiveFiles.length,
        historyComplete, warnings,
      },
    };
  }
}