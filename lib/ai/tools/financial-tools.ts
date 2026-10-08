import { z } from 'zod';
import type { JSONValue } from 'ai';
import { validStockSearchFilters } from '@/lib/api/stock-filters';
import { FinancialDataClient, type FinancialDataOperation, type FinancialDataParams } from '@/lib/api/financial-data';
import { resolveFinancialDataConfig, type FinancialDataConfig } from '@/lib/api/financial-data-config';
import { SECClient, secFilingsInputSchema } from '@/lib/api/sec-filings';

export const financialTools = [
  'getStockPrices', 'getIncomeStatements', 'getBalanceSheets',
  'getCashFlowStatements', 'getFinancialMetrics', 'searchStocksByFilters', 'getNews', 'getSECFilings',
] as const;

export type AllowedTools = (typeof financialTools)[number];

export interface FinancialToolsConfig {
  financialDatasetsApiKey?: string;
  financialData?: FinancialDataConfig;
  secUserAgent?: string;
  dataStream?: { writeData: (data: JSONValue) => void } | null;
  fetcher?: typeof fetch;
}

const ticker = z.string().trim().min(1).describe('Company ticker');
const period = z.enum(['quarterly', 'annual', 'ttm']);
const statements = z.object({
  ticker,
  period: period.default('ttm'),
  limit: z.number().int().min(4).max(5000).optional().default(5),
  report_period_lte: z.string().optional().describe('Latest report date, YYYY-MM-DD'),
  report_period_gte: z.string().optional().describe('Earliest report date, YYYY-MM-DD'),
});

export class FinancialToolsManager {
  private client: FinancialDataClient;
  private secClient?: SECClient;

  constructor(private config: FinancialToolsConfig) {
    this.client = new FinancialDataClient(
      resolveFinancialDataConfig(config.financialData, config.financialDatasetsApiKey),
      config.fetcher,
    );
  }

  private async request(operation: FinancialDataOperation, params: FinancialDataParams) {
    if (operation !== 'search') return this.client.request(operation, params);
    this.config.dataStream?.writeData({
      type: 'tool-loading',
      content: { tool: 'searchStocksByFilters', isLoading: true, message: 'Searching for stocks matching your criteria...' },
    });
    try {
      return await this.client.request(operation, params);
    } finally {
      this.config.dataStream?.writeData({
        type: 'tool-loading',
        content: { tool: 'searchStocksByFilters', isLoading: false, message: null },
      });
    }
  }

  public getTools() {
    return {
      getSECFilings: {
        description: 'Discover official SEC 10-K, 10-Q or 8-K filings and document links. Historical submission pages are enabled by default with a bounded maxArchivePages; use includeAmendments for /A forms. Requires server SEC_USER_AGENT with a contact email. Respect historyComplete and coverage warnings; this tool returns metadata, not parsed filing content.',
        parameters: secFilingsInputSchema,
        execute: (params: z.input<typeof secFilingsInputSchema>) => {
          this.secClient ??= new SECClient(this.config.secUserAgent ?? process.env.SEC_USER_AGENT ?? '', this.config.fetcher);
          return this.secClient.getSECFilings(params);
        },
      },
      getNews: {
        description: 'Get company news and latest events. Include article dates and data-source warnings in the answer.',
        parameters: z.object({ ticker, limit: z.number().int().min(1).max(5000).optional().default(5) }),
        execute: (params: { ticker: string; limit?: number }) => this.request('news', params),
      },
      getStockPrices: {
        description: 'Get a current stock-price snapshot, market cap when available, and dated historical prices. Provider coverage and interval limits vary; respect returned warnings.',
        parameters: z.object({
          ticker,
          start_date: z.string().optional().describe('Historical start date, YYYY-MM-DD').default(() => {
            const date = new Date();
            date.setMonth(date.getMonth() - 1);
            return date.toISOString().split('T')[0];
          }),
          end_date: z.string().optional().describe('Historical end date, YYYY-MM-DD').default(() => new Date().toISOString().split('T')[0]),
          interval: z.enum(['second', 'minute', 'day', 'week', 'month', 'year']).default('day'),
          interval_multiplier: z.number().int().positive().default(1),
        }),
        execute: (params: {
          ticker: string; start_date?: string; end_date?: string;
          interval?: 'second' | 'minute' | 'day' | 'week' | 'month' | 'year'; interval_multiplier?: number;
        }) => this.request('prices', params),
      },
      getIncomeStatements: {
        description: 'Get company income statements; unavailable fields are null, not zero.',
        parameters: statements,
        execute: (params: z.input<typeof statements>) => this.request('income-statements', params),
      },
      getBalanceSheets: {
        description: 'Get company balance sheets; unavailable fields are null, not zero.',
        parameters: statements,
        execute: (params: z.input<typeof statements>) => this.request('balance-sheets', params),
      },
      getCashFlowStatements: {
        description: 'Get company cash-flow statements; unavailable fields are null, not zero.',
        parameters: statements,
        execute: (params: z.input<typeof statements>) => this.request('cash-flow-statements', params),
      },
      getFinancialMetrics: {
        description: 'Get company valuation, profitability and financial ratios. Coverage and period availability depend on the provider; respect metadata warnings.',
        parameters: statements,
        execute: (params: z.input<typeof statements>) => this.request('financial-metrics', params),
      },
      searchStocksByFilters: {
        description: 'Screen stocks by financial criteria such as revenue, net income or debt. Requires configured Financial Datasets credentials; other providers do not support this screener.',
        parameters: z.object({
          filters: z.array(z.object({
            field: z.enum(validStockSearchFilters as [string, ...string[]]),
            operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq']),
            value: z.number().finite(),
          })),
          period: period.optional(),
          limit: z.number().int().min(1).max(5000).optional().default(5),
          order_by: z.enum(['-report_period', 'report_period']).optional().default('-report_period'),
        }),
        execute: (params: {
          filters: Array<{ field: string; operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'; value: number }>;
          period?: 'quarterly' | 'annual' | 'ttm'; limit?: number; order_by?: 'report_period' | '-report_period';
        }) => this.request('search', params),
      },
    };
  }
}