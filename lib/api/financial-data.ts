import { z } from 'zod';
import type { FinancialDataConfig, FinancialDataProvider } from './financial-data-config';

export type FinancialDataOperation = 'prices' | 'income-statements' | 'balance-sheets' | 'cash-flow-statements' | 'financial-metrics' | 'news' | 'search';
export type FinancialDataParams = Record<string, unknown>;
export interface FinancialDataMetadata {
  source: FinancialDataProvider;
  provider: FinancialDataProvider;
  fetched_at: string;
  warnings: string[];
}

const operations = ['prices', 'income-statements', 'balance-sheets', 'cash-flow-statements', 'financial-metrics', 'news', 'search'] as const;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const paramsSchema = z.object({
  ticker: z.string().trim().min(1).max(100).optional(),
  period: z.enum(['annual', 'quarterly', 'ttm']).optional(),
  limit: z.number().int().min(1).max(5000).optional(),
  start_date: dateSchema.optional(),
  end_date: dateSchema.optional(),
  report_period_gte: dateSchema.optional(),
  report_period_lte: dateSchema.optional(),
  interval: z.enum(['second', 'minute', 'day', 'week', 'month', 'year']).optional(),
  interval_multiplier: z.number().int().positive().optional(),
  multiplier: z.number().int().positive().optional(),
  filters: z.array(z.object({
    field: z.string().min(1),
    operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq']),
    value: z.number().finite(),
  })).optional(),
  order_by: z.enum(['report_period', '-report_period']).optional(),
});
type Params = z.infer<typeof paramsSchema>;
type Row = Record<string, unknown>;
type Mapping = Record<string, readonly [string | null, string | null]>;
const rowSchema = z.record(z.unknown());
const rowsSchema = z.array(rowSchema);

const incomeFields: Mapping = {
  revenue: ['revenue', 'totalRevenue'],
  cost_of_revenue: ['costOfRevenue', 'costOfRevenue'],
  gross_profit: ['grossProfit', 'grossProfit'],
  operating_expense: ['operatingExpenses', 'operatingExpenses'],
  selling_general_and_administrative_expenses: ['sellingGeneralAndAdministrativeExpenses', 'sellingGeneralAndAdministrative'],
  research_and_development: ['researchAndDevelopmentExpenses', 'researchAndDevelopment'],
  operating_income: ['operatingIncome', 'operatingIncome'],
  interest_expense: ['interestExpense', 'interestExpense'],
  ebit: ['ebit', 'ebit'],
  income_tax_expense: ['incomeTaxExpense', 'incomeTaxExpense'],
  net_income: ['netIncome', 'netIncome'],
  net_income_common_stock: [null, null],
  earnings_per_share: ['eps', null],
  earnings_per_share_diluted: ['epsDiluted', null],
  weighted_average_shares: ['weightedAverageShsOut', null],
  weighted_average_shares_diluted: ['weightedAverageShsOutDil', null],
};
const balanceFields: Mapping = {
  total_assets: ['totalAssets', 'totalAssets'],
  current_assets: ['totalCurrentAssets', 'totalCurrentAssets'],
  cash_and_equivalents: ['cashAndCashEquivalents', 'cashAndCashEquivalentsAtCarryingValue'],
  inventory: ['inventory', 'inventory'],
  current_investments: ['shortTermInvestments', 'shortTermInvestments'],
  trade_and_non_trade_receivables: ['netReceivables', 'currentNetReceivables'],
  non_current_assets: ['totalNonCurrentAssets', 'totalNonCurrentAssets'],
  property_plant_and_equipment: ['propertyPlantEquipmentNet', 'propertyPlantEquipment'],
  goodwill_and_intangible_assets: ['goodwillAndIntangibleAssets', null],
  investments: ['totalInvestments', 'investments'],
  non_current_investments: ['longTermInvestments', 'longTermInvestments'],
  tax_assets: ['taxAssets', null],
  total_liabilities: ['totalLiabilities', 'totalLiabilities'],
  current_liabilities: ['totalCurrentLiabilities', 'totalCurrentLiabilities'],
  current_debt: ['shortTermDebt', 'shortTermDebt'],
  trade_and_non_trade_payables: ['accountPayables', 'currentAccountsPayable'],
  deferred_revenue: ['deferredRevenue', 'deferredRevenue'],
  deposit_liabilities: [null, null],
  non_current_liabilities: ['totalNonCurrentLiabilities', 'totalNonCurrentLiabilities'],
  non_current_debt: ['longTermDebt', 'longTermDebt'],
  tax_liabilities: [null, null],
  shareholders_equity: ['totalStockholdersEquity', 'totalShareholderEquity'],
  retained_earnings: ['retainedEarnings', 'retainedEarnings'],
  accumulated_other_comprehensive_income: ['accumulatedOtherComprehensiveIncomeLoss', null],
  outstanding_shares: [null, 'commonStockSharesOutstanding'],
  total_debt: ['totalDebt', null],
};
const cashFields: Mapping = {
  net_income: ['netIncome', 'netIncome'],
  depreciation_and_amortization: ['depreciationAndAmortization', 'depreciationDepletionAndAmortization'],
  share_based_compensation: ['stockBasedCompensation', null],
  net_cash_flow_from_operations: ['operatingCashFlow', 'operatingCashflow'],
  net_cash_flow_from_investing: ['netCashProvidedByInvestingActivities', 'cashflowFromInvestment'],
  capital_expenditure: ['capitalExpenditure', 'capitalExpenditures'],
  property_plant_and_equipment: ['investmentsInPropertyPlantAndEquipment', null],
  business_acquisitions_and_disposals: ['acquisitionsNet', null],
  investment_acquisitions_and_disposals: [null, null],
  net_cash_flow_from_financing: ['netCashProvidedByFinancingActivities', 'cashflowFromFinancing'],
  issuance_or_repayment_of_debt_securities: ['netDebtIssuance', null],
  issuance_or_purchase_of_equity_shares: ['netStockIssuance', null],
  dividends_and_other_cash_distributions: ['netDividendsPaid', null],
  change_in_cash_and_equivalents: ['netChangeInCash', 'changeInCashAndCashEquivalents'],
  effect_of_exchange_rate_changes: ['effectOfForexChangesOnCash', 'changeInExchangeRate'],
  ending_cash_balance: ['cashAtEndOfPeriod', null],
  free_cash_flow: ['freeCashFlow', null],
};
const metricFields: Mapping = {
  market_cap: ['marketCap', 'MarketCapitalization'],
  enterprise_value: ['enterpriseValue', null],
  price_to_earnings_ratio: ['priceToEarningsRatio', 'PERatio'],
  price_to_book_ratio: ['priceToBookRatio', 'PriceToBookRatio'],
  price_to_sales_ratio: ['priceToSalesRatio', 'PriceToSalesRatioTTM'],
  enterprise_value_to_ebitda_ratio: ['evToEBITDA', 'EVToEBITDA'],
  enterprise_value_to_revenue_ratio: ['evToSales', 'EVToRevenue'],
  free_cash_flow_yield: ['freeCashFlowYield', null],
  peg_ratio: ['priceToEarningsGrowthRatio', 'PEGRatio'],
  gross_margin: ['grossProfitMargin', null],
  operating_margin: ['operatingProfitMargin', 'OperatingMarginTTM'],
  net_margin: ['netProfitMargin', 'ProfitMargin'],
  return_on_equity: ['returnOnEquity', 'ReturnOnEquityTTM'],
  return_on_assets: ['returnOnAssets', 'ReturnOnAssetsTTM'],
  return_on_invested_capital: ['returnOnInvestedCapital', null],
  asset_turnover: ['assetTurnover', null],
  inventory_turnover: ['inventoryTurnover', null],
  receivables_turnover: ['receivablesTurnover', null],
  days_sales_outstanding: ['daysOfSalesOutstanding', null],
  operating_cycle: ['operatingCycle', null],
  working_capital_turnover: ['workingCapitalTurnoverRatio', null],
  current_ratio: ['currentRatio', null],
  quick_ratio: ['quickRatio', null],
  cash_ratio: ['cashRatio', null],
  operating_cash_flow_ratio: ['operatingCashFlowRatio', null],
  debt_to_equity: ['debtToEquityRatio', null],
  debt_to_assets: ['debtToAssetsRatio', null],
  interest_coverage: ['interestCoverageRatio', null],
  revenue_per_share: ['revenuePerShare', 'RevenuePerShareTTM'],
  earnings_per_share: ['netIncomePerShare', 'EPS'],
  book_value_per_share: ['bookValuePerShare', 'BookValue'],
  free_cash_flow_per_share: ['freeCashFlowPerShare', null],
  operating_cash_flow_per_share: ['operatingCashFlowPerShare', null],
  dividend_yield: ['dividendYield', 'DividendYield'],
  payout_ratio: ['dividendPayoutRatio', null],
};

function numeric(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function reportDate(value: unknown): string | null {
  const parsed = dateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function mapped(row: Row, fields: Mapping, provider: 'fmp' | 'alpha-vantage', ttm = false): Row {
  return Object.fromEntries(Object.entries(fields).map(([target, sources]) => {
    const source = sources[provider === 'fmp' ? 0 : 1];
    return [target, source ? numeric(ttm && provider === 'fmp' ? row[`${source}TTM`] ?? row[source] : row[source]) : null];
  }));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

export class FinancialDataClient {
  private readonly config: FinancialDataConfig;
  private readonly cache = new Map<string, { expires: number; promise: Promise<any> }>();

  constructor(config: FinancialDataConfig, private readonly fetcher: typeof fetch = fetch) {
    this.config = { provider: config.provider, apiKeys: { ...config.apiKeys } };
  }

  request(operation: string, params: FinancialDataParams): Promise<any> {
    if (!operations.includes(operation as FinancialDataOperation)) {
      return Promise.reject(new Error('Unsupported financial data operation'));
    }
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) return Promise.reject(new Error('Invalid financial data parameters: unsupported period, interval, or parameter value'));
    const input = parsed.data;
    if (operation !== 'search' && !input.ticker) return Promise.reject(new Error('A ticker is required'));
    if (operation === 'search' && !input.filters) return Promise.reject(new Error('Search filters are required'));
    if (input.start_date && input.end_date && input.start_date > input.end_date) return Promise.reject(new Error('Invalid price date range'));
    if (input.report_period_gte && input.report_period_lte && input.report_period_gte > input.report_period_lte) return Promise.reject(new Error('Invalid report date range'));
    if (input.multiplier !== undefined && input.interval_multiplier !== undefined && input.multiplier !== input.interval_multiplier) return Promise.reject(new Error('Conflicting interval multipliers'));
    const key = JSON.stringify([operation, stableValue(input)]);
    const now = Date.now();
    for (const [cachedKey, entry] of this.cache) if (entry.expires <= now) this.cache.delete(cachedKey);
    const cached = this.cache.get(key);
    if (cached) return cached.promise;
    const promise = this.execute(operation as FinancialDataOperation, input);
    if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value as string);
    const entry = { expires: Number.POSITIVE_INFINITY, promise };
    this.cache.set(key, entry);
    void promise.then(() => {
      entry.expires = Date.now() + (operation === 'prices' || operation === 'news' ? 60_000 : 300_000);
    }, () => {
      if (this.cache.get(key) === entry) this.cache.delete(key);
    });
    return promise;
  }

  private async execute(operation: FinancialDataOperation, params: Params): Promise<any> {
    const preferred: FinancialDataProvider[] = operation === 'search'
      ? ['financial-datasets']
      : operation === 'prices'
        ? ['twelve-data', 'fmp', 'alpha-vantage', 'financial-datasets']
        : ['fmp', 'alpha-vantage', 'financial-datasets'];
    const candidates = (this.config.provider === 'auto' ? preferred : [this.config.provider])
      .filter((provider) => this.config.apiKeys[provider]?.trim());
    if (!candidates.length) throw new Error('No configured financial data provider is available');
    const warnings: string[] = [];
    let lastError: Error | undefined;
    for (const provider of candidates) {
      try {
        const result = await this.fromProvider(provider, operation, params, warnings);
        const metadata: FinancialDataMetadata = { source: provider, provider, fetched_at: new Date().toISOString(), warnings: [...warnings] };
        return { ...result, metadata };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Financial data request failed');
        warnings.push(`${provider} unavailable; tried the next configured provider`);
      }
    }
    throw lastError ?? new Error('Financial data unavailable');
  }

  private async http(provider: FinancialDataProvider, path: string, query: Record<string, unknown>, body?: unknown): Promise<any> {
    const origins = {
      fmp: 'https://financialmodelingprep.com/stable/',
      'alpha-vantage': 'https://www.alphavantage.co/',
      'twelve-data': 'https://api.twelvedata.com/',
      'financial-datasets': 'https://api.financialdatasets.ai/',
    };
    const url = new URL(path, origins[provider]);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
    const headers: Record<string, string> = {};
    if (provider === 'financial-datasets') headers['X-API-Key'] = this.config.apiKeys[provider]!;
    else url.searchParams.set('apikey', this.config.apiKeys[provider]!);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('timeout'));
        }, 15_000);
      });
      return await Promise.race([timeout, (async () => {
        const response = await this.fetcher(url.toString(), { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
        if (!response.ok) throw new Error('http');
        const data: unknown = await response.json();
        if (data === null || typeof data !== 'object') throw new Error('schema');
        const envelope = data as Row;
        if ('Note' in envelope || 'Information' in envelope || 'Error Message' in envelope || envelope.status === 'error' || 'error' in envelope) throw new Error('upstream');
        return data;
      })()]);
    } catch {
      throw new Error(`${provider} request failed or timed out; upstream details redacted`);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private rows(data: unknown): Row[] {
    const parsed = rowsSchema.safeParse(data);
    if (!parsed.success) throw new Error('Invalid financial data response schema');
    return parsed.data;
  }

  private object(data: unknown): Row {
    const parsed = rowSchema.safeParse(data);
    if (!parsed.success) throw new Error('Invalid financial data response schema');
    return parsed.data;
  }

  private bounded(rows: Row[], params: Params, dateKey = 'report_period', ascending = false): Row[] {
    const lower = dateKey === 'time' ? params.start_date : params.report_period_gte;
    const upper = dateKey === 'time' ? params.end_date : params.report_period_lte;
    return rows.filter((row) => {
      const date = text(row[dateKey])?.slice(0, 10);
      return (!lower || Boolean(date && date >= lower)) && (!upper || Boolean(date && date <= upper));
    }).sort((left, right) => {
      const comparison = String(left[dateKey] ?? '').localeCompare(String(right[dateKey] ?? ''));
      return ascending ? comparison : -comparison;
    }).slice(0, params.limit ?? (dateKey === 'time' ? 5000 : 5));
  }

  private async fromProvider(provider: FinancialDataProvider, operation: FinancialDataOperation, params: Params, warnings: string[]): Promise<Row> {
    if (provider === 'financial-datasets') return this.financialDatasets(operation, params);
    if (operation === 'search') throw new Error(`${provider} does not support financial filter search`);
    if (provider === 'twelve-data' && operation !== 'prices') throw new Error('twelve-data does not support this operation');
    if (operation === 'prices') {
      if ((params.interval ?? 'day') !== 'day' || (params.interval_multiplier ?? params.multiplier ?? 1) !== 1) throw new Error(`${provider} supports only daily prices with multiplier 1`);
      return this.prices(provider as 'fmp' | 'alpha-vantage' | 'twelve-data', params, warnings);
    }
    if (operation === 'news') return this.news(provider as 'fmp' | 'alpha-vantage', params);
    return this.fundamentals(provider as 'fmp' | 'alpha-vantage', operation, params, warnings);
  }

  private async financialDatasets(operation: FinancialDataOperation, params: Params): Promise<Row> {
    if (operation === 'prices') {
      const [snapshot, history] = await Promise.all([
        this.http('financial-datasets', 'prices/snapshot', { ticker: params.ticker }),
        this.http('financial-datasets', 'prices/', { ticker: params.ticker, start_date: params.start_date, end_date: params.end_date, interval: params.interval ?? 'day', interval_multiplier: params.interval_multiplier ?? params.multiplier ?? 1 }),
      ]);
      const quote = this.object(this.object(snapshot).snapshot);
      const historical = this.object(history);
      const prices = this.rows(historical.prices).map((row) => this.priceRow(row, 'time'));
      return { ticker: params.ticker, snapshot: { snapshot: { ticker: params.ticker, price: numeric(quote.price), day_change: numeric(quote.day_change), day_change_percent: numeric(quote.day_change_percent), market_cap: numeric(quote.market_cap), volume: numeric(quote.volume), time: text(quote.time) } }, historical: { ticker: params.ticker, prices: this.bounded(prices, params, 'time', true) } };
    }
    const key = operation.replaceAll('-', '_');
    const path = operation === 'search' ? 'financials/search/' : operation === 'news' || operation === 'financial-metrics' ? `${operation}/` : `financials/${operation}/`;
    const data = this.object(await this.http('financial-datasets', path, operation === 'search' ? {} : { ticker: params.ticker, period: operation === 'news' ? undefined : params.period ?? 'ttm', limit: params.limit ?? 5, report_period_gte: params.report_period_gte, report_period_lte: params.report_period_lte, start_date: params.start_date, end_date: params.end_date }, operation === 'search' ? { filters: params.filters, period: params.period ?? 'ttm', limit: params.limit ?? 5, order_by: params.order_by } : undefined));
    const outputKey = operation === 'search' ? 'search_results' : key;
    return { [outputKey]: this.rows(data[outputKey]) };
  }

  private priceRow(row: Row, timeKey: string, keys = ['open', 'high', 'low', 'close', 'volume']): Row {
    const time = text(row[timeKey]);
    if (!time || !reportDate(time.slice(0, 10))) throw new Error('Invalid price timestamp');
    const values = keys.map((key) => numeric(row[key]));
    if (values.slice(0, 4).some((value) => value === null)) throw new Error('Invalid price response schema');
    return { open: values[0], high: values[1], low: values[2], close: values[3], volume: values[4], time };
  }

  private async prices(provider: 'fmp' | 'alpha-vantage' | 'twelve-data', params: Params, warnings: string[]): Promise<Row> {
    let quote: Row;
    let history: Row[];
    let snapshot: Row;
    if (provider === 'fmp') {
      const [quotes, prices] = await Promise.all([
        this.http(provider, 'quote', { symbol: params.ticker }),
        this.http(provider, 'historical-price-eod/full', { symbol: params.ticker, from: params.start_date, to: params.end_date }),
      ]);
      quote = this.rows(quotes)[0];
      if (!quote) throw new Error('No quote is available');
      history = this.rows(prices).map((row) => this.priceRow(row, 'date'));
      const timestamp = numeric(quote.timestamp);
      snapshot = { price: numeric(quote.price), day_change: numeric(quote.change), day_change_percent: numeric(quote.changePercentage), market_cap: numeric(quote.marketCap), volume: numeric(quote.volume), time: timestamp === null ? null : new Date(timestamp * 1000).toISOString() };
    } else if (provider === 'twelve-data') {
      const [quoted, series] = await Promise.all([
        this.http(provider, 'quote', { symbol: params.ticker }),
        this.http(provider, 'time_series', { symbol: params.ticker, interval: '1day', order: 'asc', outputsize: 5000, start_date: params.start_date, end_date: params.end_date }),
      ]);
      quote = this.object(quoted);
      history = this.rows(this.object(series).values).map((row) => this.priceRow(row, 'datetime'));
      snapshot = { price: numeric(quote.close), day_change: numeric(quote.change), day_change_percent: numeric(quote.percent_change), market_cap: numeric(quote.market_cap), volume: numeric(quote.volume), time: text(quote.datetime) };
      warnings.push('Twelve Data history is capped at 5000 daily points; market cap and volume may be unavailable for this instrument');
    } else {
      const [quoted, series] = await Promise.all([
        this.http(provider, 'query', { function: 'GLOBAL_QUOTE', symbol: params.ticker }),
        this.http(provider, 'query', { function: 'TIME_SERIES_DAILY', symbol: params.ticker, outputsize: 'compact' }),
      ]);
      quote = this.object(this.object(quoted)['Global Quote']);
      const daily = this.object(this.object(series)['Time Series (Daily)']);
      history = Object.entries(daily).map(([time, value]) => this.priceRow({ ...this.object(value), time }, 'time', ['1. open', '2. high', '3. low', '4. close', '5. volume']));
      const percent = text(quote['10. change percent']);
      snapshot = { price: numeric(quote['05. price']), day_change: numeric(quote['09. change']), day_change_percent: numeric(percent?.replace(/%$/, '')), market_cap: null, volume: numeric(quote['06. volume']), time: text(quote['07. latest trading day']) };
      warnings.push('Alpha Vantage daily compact history covers at most 100 trading days; requested dates may not be fully covered');
    }
    if (snapshot.price === null) throw new Error('Invalid quote response schema');
    return { ticker: params.ticker, snapshot: { snapshot: { ticker: params.ticker, ...snapshot } }, historical: { ticker: params.ticker, prices: this.bounded(history, params, 'time', true) } };
  }

  private async fundamentals(provider: 'fmp' | 'alpha-vantage', operation: FinancialDataOperation, params: Params, warnings: string[]): Promise<Row> {
    const period = params.period ?? 'ttm';
    const fields = operation === 'income-statements' ? incomeFields : operation === 'balance-sheets' ? balanceFields : operation === 'cash-flow-statements' ? cashFields : metricFields;
    let reports: Row[];
    if (provider === 'fmp') {
      const paths: Record<string, string> = { 'income-statements': 'income-statement', 'balance-sheets': 'balance-sheet-statement', 'cash-flow-statements': 'cash-flow-statement', 'financial-metrics': 'key-metrics' };
      const suffix = period === 'ttm' ? '-ttm' : '';
      const query = { symbol: params.ticker, period: period === 'ttm' ? undefined : period === 'annual' ? 'annual' : 'quarter', limit: params.limit ?? 5 };
      const primary = this.rows(await this.http(provider, `${paths[operation]}${suffix}`, query));
      if (operation === 'financial-metrics') {
        const ratios = this.rows(await this.http(provider, `ratios${suffix}`, query));
        const combined = new Map<string, Row>();
        for (const row of [...primary, ...ratios]) {
          const date = reportDate(row.date);
          if (!date && period !== 'ttm') throw new Error('Invalid financial report date');
          const key = date ?? 'ttm-snapshot';
          combined.set(key, { ...combined.get(key), ...row, date });
        }
        reports = [...combined.values()];
        if (period === 'ttm') warnings.push('FMP TTM metrics are a current snapshot; absent upstream report dates remain null');
      } else reports = primary;
    } else {
      if (operation === 'financial-metrics' && period !== 'ttm') throw new Error('alpha-vantage historical financial metrics are unavailable; only a TTM overview is supported');
      if (operation !== 'financial-metrics' && period === 'ttm') throw new Error('alpha-vantage TTM statements are unavailable');
      const functions: Record<string, string> = { 'income-statements': 'INCOME_STATEMENT', 'balance-sheets': 'BALANCE_SHEET', 'cash-flow-statements': 'CASH_FLOW', 'financial-metrics': 'OVERVIEW' };
      const data = this.object(await this.http(provider, 'query', { function: functions[operation], symbol: params.ticker }));
      reports = operation === 'financial-metrics' ? [data] : this.rows(data[period === 'annual' ? 'annualReports' : 'quarterlyReports']);
      if (operation === 'financial-metrics') {
        if (!text(data.Symbol)) throw new Error('No financial overview is available');
        warnings.push('Alpha Vantage OVERVIEW is a latest TTM snapshot, not historical metrics; report_period is LatestQuarter only when supplied');
      }
    }
    const normalized = reports.map((row) => {
      const date = reportDate(provider === 'fmp' ? row.date : operation === 'financial-metrics' ? row.LatestQuarter : row.fiscalDateEnding);
      if (!date && operation !== 'financial-metrics') throw new Error('Invalid financial report date');
      return { ticker: params.ticker, report_period: date, period, currency: text(provider === 'fmp' ? row.reportedCurrency : operation === 'financial-metrics' ? row.Currency : row.reportedCurrency), ...mapped(row, fields, provider, period === 'ttm' && operation === 'financial-metrics') };
    });
    warnings.push('Fundamental fields absent from the upstream response are null');
    return { [operation.replaceAll('-', '_')]: this.bounded(normalized, params) };
  }

  private async news(provider: 'fmp' | 'alpha-vantage', params: Params): Promise<Row> {
    const data = await this.http(provider, provider === 'fmp' ? 'news/stock' : 'query', provider === 'fmp'
      ? { symbols: params.ticker, limit: params.limit ?? 5, from: params.start_date, to: params.end_date }
      : { function: 'NEWS_SENTIMENT', tickers: params.ticker, limit: params.limit ?? 5, sort: 'LATEST', time_from: params.start_date?.replaceAll('-', '') + (params.start_date ? 'T0000' : ''), time_to: params.end_date ? `${params.end_date.replaceAll('-', '')}T2359` : undefined });
    const rows = this.rows(provider === 'fmp' ? data : this.object(data).feed);
    const articles = rows.map((row) => {
      const rawDate = text(provider === 'fmp' ? row.publishedDate : row.time_published);
      const date = provider === 'alpha-vantage' && rawDate && /^\d{8}T\d{6}$/.test(rawDate)
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T${rawDate.slice(9, 11)}:${rawDate.slice(11, 13)}:${rawDate.slice(13, 15)}` : rawDate;
      if (!date || !reportDate(date.slice(0, 10)) || !text(row.title) || !text(row.url)) throw new Error('Invalid news response schema');
      return { ticker: params.ticker, title: text(row.title), author: text(row.publisher) ?? text(row.source), source: text(row.publisher) ?? text(row.source), date, url: text(row.url), image_url: text(provider === 'fmp' ? row.image : row.banner_image), summary: text(provider === 'fmp' ? row.text : row.summary) };
    });
    const filtered = articles.filter((row) => (!params.start_date || row.date.slice(0, 10) >= params.start_date) && (!params.end_date || row.date.slice(0, 10) <= params.end_date));
    return { news: filtered.sort((left, right) => right.date.localeCompare(left.date)).slice(0, params.limit ?? 5) };
  }
}