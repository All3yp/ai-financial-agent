// Specialized Financial Agents
// Each agent has a specific role and expertise

import {
  BaseAgent,
  type AgentTask,
  createAgentConfig,
  registerAgent,
} from './base';
import { getAllModels } from '../ai/models';
import { customModel } from '../ai';
import { validStockSearchFilters } from '../api/stock-filters';

type ScreeningFilter = {
  field: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  value: number;
};

const screeningFieldAliases: Record<string, string> = {
  debtToEquity: 'debt_to_equity',
  peRatio: 'price_to_earnings_ratio',
  payoutRatio: 'payout_ratio',
  pegRatio: 'peg_ratio',
  revenueGrowth: 'revenue_growth',
  roe: 'return_on_equity',
};

export function normalizeScreeningCriteria(
  criteria: unknown,
): ScreeningFilter[] {
  if (Array.isArray(criteria)) {
    return criteria.map((filter) => {
      if (
        !filter ||
        typeof filter !== 'object' ||
        typeof filter.field !== 'string' ||
        !['gt', 'gte', 'lt', 'lte', 'eq'].includes(filter.operator) ||
        typeof filter.value !== 'number'
      ) {
        throw new Error(
          'Each screening filter must contain field, operator, and numeric value',
        );
      }
      const field = screeningFieldAliases[filter.field] ?? filter.field;
      if (!validStockSearchFilters.includes(field)) {
        throw new Error(`Unsupported screening field: ${filter.field}`);
      }
      return {
        field,
        operator: filter.operator,
        value: filter.value,
      } as ScreeningFilter;
    });
  }

  if (!criteria || typeof criteria !== 'object') {
    throw new Error(
      'Screening criteria must be an object or an array of filters',
    );
  }

  const filters: ScreeningFilter[] = [];
  for (const [inputField, constraint] of Object.entries(criteria)) {
    const field = screeningFieldAliases[inputField] ?? inputField;
    if (!validStockSearchFilters.includes(field)) {
      throw new Error(`Unsupported screening field: ${inputField}`);
    }
    if (typeof constraint === 'number') {
      filters.push({ field, operator: 'gte', value: constraint });
      continue;
    }
    if (!constraint || typeof constraint !== 'object') {
      throw new Error(`Invalid constraint for screening field: ${inputField}`);
    }
    const range = constraint as Record<string, unknown>;
    if (typeof range.min === 'number')
      filters.push({ field, operator: 'gte', value: range.min });
    if (typeof range.max === 'number')
      filters.push({ field, operator: 'lte', value: range.max });
    if (typeof range.eq === 'number')
      filters.push({ field, operator: 'eq', value: range.eq });
  }

  if (filters.length === 0)
    throw new Error('At least one screening filter is required');
  return filters;
}

// ============================================
// RESEARCH AGENT - Gathers raw financial data
// ============================================

export class ResearchAgent extends BaseAgent {
  constructor(financialDatasetsApiKey: string) {
    super(
      createAgentConfig(
        'research-agent',
        'Research Agent',
        'Gathers raw financial data from multiple sources',
        'apodex/apodex-1.1-mini:free', // Best for research: reasoning-first, 262K context, evidence-grounded
        `You are a Financial Research Agent. Your job is to gather accurate, comprehensive financial data.

AVAILABLE TOOLS:
- getStockPrices: Historical price data
- getIncomeStatements: Revenue, expenses, net income
- getBalanceSheets: Assets, liabilities, equity
- getCashFlowStatements: Operating, investing, financing cash flows
- getFinancialMetrics: P/E, ROE, margins, debt ratios, etc.
- searchStocksByFilters: Screen stocks by criteria

RULES:
1. Always use tools to get REAL data - never hallucinate numbers
2. Fetch multiple periods (quarterly + annual) for trends
3. Get data for the specific tickers mentioned
4. Return raw data in structured format
5. Note any data gaps or limitations

OUTPUT FORMAT:
{
  "ticker": "AAPL",
  "data": {
    "prices": [...],
    "incomeStatements": [...],
    "balanceSheets": [...],
    "cashFlows": [...],
    "metrics": [...]
  },
  "periodsCovered": "5 years quarterly + annual",
  "dataQuality": "complete|partial|limited",
  "notes": "..."
}`,
        [
          'getStockPrices',
          'getIncomeStatements',
          'getBalanceSheets',
          'getCashFlowStatements',
          'getFinancialMetrics',
          'searchStocksByFilters',
        ],
        15,
      ),
      financialDatasetsApiKey,
    );
  }

  async execute(task: AgentTask): Promise<any> {
    const {
      ticker,
      period = 'quarterly',
      limit = 20,
      includeMetrics = true,
    } = task.input;

    this.updateTaskStatus(task.id, 'running');

    try {
      const tools = this.toolsManager.getTools();
      const results: any = { ticker };

      // Calculate date range based on period and limit
      const endDate = new Date();
      const startDate = new Date();
      if (period === 'quarterly') {
        startDate.setMonth(startDate.getMonth() - limit * 3);
      } else if (period === 'annual') {
        startDate.setFullYear(startDate.getFullYear() - limit);
      } else {
        startDate.setMonth(startDate.getMonth() - limit);
      }

      // Parallel data fetching
      const [prices, income, balance, cashflow, metrics] = await Promise.all([
        tools.getStockPrices.execute({
          ticker,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          interval: 'day',
          interval_multiplier: 1,
        }),
        tools.getIncomeStatements.execute({ ticker, period, limit }),
        tools.getBalanceSheets.execute({ ticker, period, limit }),
        tools.getCashFlowStatements.execute({ ticker, period, limit }),
        includeMetrics
          ? tools.getFinancialMetrics.execute({ ticker, period, limit })
          : Promise.resolve({ financial_metrics: [] }),
      ]);

      results.prices = prices?.historical?.prices ?? [];
      results.incomeStatements = income?.income_statements ?? [];
      results.balanceSheets = balance?.balance_sheets ?? [];
      results.cashFlows = cashflow?.cash_flow_statements ?? [];
      results.metrics = metrics?.financial_metrics ?? [];

      // Assess data quality
      const dataPoints = [
        results.prices?.length || 0,
        results.incomeStatements?.length || 0,
        results.balanceSheets?.length || 0,
        results.cashFlows?.length || 0,
        results.metrics?.length || 0,
      ];
      const totalPoints = dataPoints.reduce((a, b) => a + b, 0);
      results.dataQuality =
        totalPoints > 50
          ? 'complete'
          : totalPoints > 20
            ? 'partial'
            : 'limited';
      results.periodsCovered = `${period}, ${limit} periods`;

      this.updateTaskStatus(task.id, 'completed', results);
      return results;
    } catch (error) {
      this.updateTaskStatus(
        task.id,
        'failed',
        null,
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw error;
    }
  }
}

// ============================================
// ANALYSIS AGENT - Analyzes financial data
// ============================================

export class AnalysisAgent extends BaseAgent {
  constructor(financialDatasetsApiKey: string) {
    super(
      createAgentConfig(
        'analysis-agent',
        'Analysis Agent',
        'Performs deep financial analysis and valuation',
        'thinkingmachines/inkling:free', // Best for analysis: multimodal MoE, 1M context, strong reasoning
        `You are a Financial Analysis Agent. You receive raw financial data and produce expert analysis.

ANALYSIS FRAMEWORKS:
1. PROFITABILITY: Gross/Operating/Net margins trends, ROE, ROA, ROIC
2. GROWTH: Revenue/FCF/EPS growth rates (YoY, QoQ, CAGR)
3. VALUATION: P/E, P/FCF, EV/EBITDA, DCF, relative vs peers/history
4. FINANCIAL HEALTH: Debt/Equity, interest coverage, current ratio, cash runway
5. QUALITY: Earnings consistency, FCF conversion, accruals, share count
6. MOAT: Pricing power, switching costs, network effects, scale advantages

OUTPUT FORMAT:
{
  "ticker": "AAPL",
  "summary": "One paragraph executive summary",
  "scores": {
    "profitability": 85,
    "growth": 70,
    "valuation": 60,
    "health": 90,
    "quality": 80,
    "moat": 95
  },
  "keyFindings": [
    "Finding 1 with specific numbers",
    "Finding 2 with specific numbers"
  ],
  "risks": ["Risk 1", "Risk 2"],
  "valuation": {
    "fairValue": 180,
    "currentPrice": 175,
    "upside": "2.9%",
    "method": "DCF + Relative",
    "assumptions": {...}
  },
  "recommendation": "BUY|HOLD|SELL",
  "confidence": 0.85
}`,
        ['getFinancialMetrics'], // Can fetch additional metrics if needed
        10,
      ),
      financialDatasetsApiKey,
    );
  }

  async execute(task: AgentTask): Promise<any> {
    const { researchData, peers = [] } = task.input;

    this.updateTaskStatus(task.id, 'running');

    try {
      // If peers provided, fetch their data for comparison
      let peerData: any = {};
      if (peers.length > 0) {
        const tools = this.toolsManager.getTools();
        const peerResults = await Promise.all(
          peers.map((p: string) =>
            tools.getFinancialMetrics.execute({
              ticker: p,
              period: 'annual',
              limit: 5,
            }),
          ),
        );
        peerData = Object.fromEntries(
          peers.map((p: string, i: number) => [p, peerResults[i].data]),
        );
      }

      // Use LLM for analysis
      const { streamText } = await import('ai');
      const model = getAllModels().find((m) => m.id === this.config.modelId);
      if (!model) throw new Error(`Model ${this.config.modelId} not found`);
      const modelInstance = customModel(model.apiIdentifier, {
        apiKey: process.env.OPENAI_API_KEY || '',
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        name: process.env.OPENAI_PROVIDER_NAME || 'openai',
      });

      const prompt = `Analyze this financial data for ${researchData.ticker}:

RAW DATA:
${JSON.stringify(researchData, null, 2)}

${Object.keys(peerData).length > 0 ? `PEER DATA:\n${JSON.stringify(peerData, null, 2)}` : ''}

Provide comprehensive analysis in the specified JSON format.`;

      const result = await streamText({
        model: modelInstance,
        system: this.config.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        maxSteps: 1,
      });

      let fullText = '';
      for await (const chunk of result.textStream) {
        fullText += chunk;
      }

      // Parse JSON from response
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      const analysis = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : { error: 'Failed to parse analysis', raw: fullText };

      this.updateTaskStatus(task.id, 'completed', analysis);
      return analysis;
    } catch (error) {
      this.updateTaskStatus(
        task.id,
        'failed',
        null,
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw error;
    }
  }
}

// ============================================
// SCREENER AGENT - Finds investment opportunities
// ============================================

export class ScreenerAgent extends BaseAgent {
  constructor(financialDatasetsApiKey: string) {
    super(
      createAgentConfig(
        'screener-agent',
        'Screener Agent',
        'Screens stocks based on criteria and finds opportunities',
        'nvidia/nemotron-3.5-lightning:free', // Best for screening: high-throughput agentic, 1M context
        `You are a Stock Screener Agent. You find stocks matching specific criteria.

SCREENING CAPABILITIES:
- searchStocksByFilters: Filter by market cap, P/E, ROE, growth, margins, etc.
- Can combine multiple criteria
- Returns ranked results with key metrics

COMMON SCREENS:
- Value: Low P/E, high FCF yield, low debt
- Quality: High ROE, consistent earnings, low accruals
- Growth: High revenue/FCF growth, expanding margins
- GARP: Growth at reasonable price
- Dividend: Yield, payout ratio, growth history

OUTPUT FORMAT:
{
  "screenName": "Quality Value Screen",
  "criteria": {...},
  "results": [
    { "ticker": "AAPL", "score": 92, "keyMetrics": {...}, "why": "..." },
    { "ticker": "MSFT", "score": 88, "keyMetrics": {...}, "why": "..." }
  ],
  "totalScreened": 5000,
  "passed": 12
}`,
        ['searchStocksByFilters', 'getFinancialMetrics'],
        10,
      ),
      financialDatasetsApiKey,
    );
  }

  async execute(task: AgentTask): Promise<any> {
    const { criteria, limit = 20 } = task.input;

    this.updateTaskStatus(task.id, 'running');

    try {
      const tools = this.toolsManager.getTools();
      const filters = normalizeScreeningCriteria(criteria);
      const results = await tools.searchStocksByFilters.execute({
        filters,
        limit,
      });

      const stocks = results?.search_results ?? [];

      // Enhance with key metrics for top results
      const topTickers = stocks.slice(0, 10).map((r: any) => r.ticker);
      const metrics = await Promise.all(
        topTickers.map((t: string) =>
          tools.getFinancialMetrics.execute({
            ticker: t,
            period: 'annual',
            limit: 3,
          }),
        ),
      );

      const enhancedResults = stocks
        .map((r: any, i: number) => ({
          ...r,
          keyMetrics: metrics[i]?.financial_metrics?.[0] || {},
          score: this.calculateScore(r, metrics[i]?.financial_metrics?.[0]),
        }))
        .sort((a: any, b: any) => b.score - a.score);

      const output = {
        screenName: criteria.name || 'Custom Screen',
        criteria,
        results: enhancedResults,
        totalScreened: stocks.length,
        passed: enhancedResults.length,
      };

      this.updateTaskStatus(task.id, 'completed', output);
      return output;
    } catch (error) {
      this.updateTaskStatus(
        task.id,
        'failed',
        null,
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw error;
    }
  }

  private calculateScore(stock: any, metrics: any): number {
    let score = 50;
    if (metrics?.return_on_equity > 15) score += 15;
    if (
      metrics?.price_to_earnings_ratio &&
      metrics.price_to_earnings_ratio < 20
    )
      score += 10;
    if (metrics?.debt_to_equity < 0.5) score += 10;
    if (metrics?.operating_margin > 15) score += 10;
    if (metrics?.revenue_growth > 10) score += 5;
    return Math.min(100, Math.max(0, score));
  }
}

// ============================================
// MONITOR AGENT - Watches for changes/alerts
// ============================================

export class MonitorAgent extends BaseAgent {
  constructor(financialDatasetsApiKey: string) {
    super(
      createAgentConfig(
        'monitor-agent',
        'Monitor Agent',
        'Monitors positions and alerts on significant changes',
        'meta-llama/llama-3.1-8b-instruct:free', // Fast general model for frequent checks (non-expiring)
        `You are a Portfolio Monitor Agent. You check positions for significant changes.

MONITORING CHECKS:
1. Price movements (>5% daily, >20% from cost basis)
2. Earnings surprises vs estimates
3. Guidance changes
4. Insider transactions
5. Analyst rating changes
6. Financial metric deterioration (margins, debt, FCF)
7. News sentiment shifts

OUTPUT FORMAT:
{
  "alerts": [
    {
      "ticker": "AAPL",
      "type": "price_movement|earnings|guidance|metric_deterioration|news",
      "severity": "info|warning|critical",
      "message": "AAPL down 8% on earnings miss",
      "details": {...},
      "action": "review|hold|consider_sell"
    }
  ],
  "summary": "3 alerts generated, 1 critical",
  "checkedAt": "2024-01-15T10:00:00Z"
}`,
        ['getStockPrices', 'getFinancialMetrics', 'getIncomeStatements'],
        5,
      ),
      financialDatasetsApiKey,
    );
  }

  async execute(task: AgentTask): Promise<any> {
    const { positions, thresholds = {} } = task.input;
    // positions = [{ ticker, costBasis, shares, targetAllocation }]

    this.updateTaskStatus(task.id, 'running');

    try {
      const tools = this.toolsManager.getTools();
      const alerts: any[] = [];

      for (const position of positions) {
        const { ticker, costBasis, shares } = position;

        // Get latest price
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 5);
        const priceData = await tools.getStockPrices.execute({
          ticker,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          interval: 'day',
          interval_multiplier: 1,
        });
        const latestPrice = priceData?.historical?.[0]?.close;
        const prevPrice = priceData?.historical?.[1]?.close;

        if (latestPrice && prevPrice) {
          const dailyChange = ((latestPrice - prevPrice) / prevPrice) * 100;
          const totalReturn = ((latestPrice - costBasis) / costBasis) * 100;

          if (Math.abs(dailyChange) > (thresholds.dailyMove || 5)) {
            alerts.push({
              ticker,
              type: 'price_movement',
              severity: Math.abs(dailyChange) > 10 ? 'critical' : 'warning',
              message: `${ticker} moved ${dailyChange.toFixed(1)}% today`,
              details: { dailyChange, totalReturn, latestPrice },
              action: dailyChange < -10 ? 'review' : 'hold',
            });
          }

          if (totalReturn < (thresholds.maxDrawdown || -20)) {
            alerts.push({
              ticker,
              type: 'drawdown',
              severity: 'critical',
              message: `${ticker} down ${totalReturn.toFixed(1)}% from cost basis`,
              details: { totalReturn, costBasis, latestPrice },
              action: 'review',
            });
          }
        }

        // Check financial health
        const metrics = await tools.getFinancialMetrics.execute({
          ticker,
          period: 'quarterly',
          limit: 4,
        });
        const latest = metrics?.financial_metrics?.[0];
        if (latest) {
          if (latest.current_ratio && latest.current_ratio < 1) {
            alerts.push({
              ticker,
              type: 'metric_deterioration',
              severity: 'warning',
              message: `${ticker} current ratio below 1: ${latest.current_ratio}`,
              details: { currentRatio: latest.current_ratio },
              action: 'review',
            });
          }
          if (latest.debt_to_equity && latest.debt_to_equity > 2) {
            alerts.push({
              ticker,
              type: 'metric_deterioration',
              severity: 'warning',
              message: `${ticker} high debt/equity: ${latest.debt_to_equity}`,
              details: { debtToEquity: latest.debt_to_equity },
              action: 'review',
            });
          }
        }
      }

      const output = {
        alerts,
        summary: `${alerts.length} alerts generated, ${alerts.filter((a) => a.severity === 'critical').length} critical`,
        checkedAt: new Date().toISOString(),
      };

      this.updateTaskStatus(task.id, 'completed', output);
      return output;
    } catch (error) {
      this.updateTaskStatus(
        task.id,
        'failed',
        null,
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw error;
    }
  }
}

// ============================================
// REPORT AGENT - Generates comprehensive reports
// ============================================

export class ReportAgent extends BaseAgent {
  constructor(financialDatasetsApiKey: string) {
    super(
      createAgentConfig(
        'report-agent',
        'Report Agent',
        'Generates professional investment reports',
        'thinkingmachines/inkling-small:free', // Best for reports: multimodal, 1M context, efficient, non-expiring
        `You are an Investment Report Agent. You create professional, well-structured reports.

REPORT TYPES:
1. COMPANY REPORT: Deep dive on single company
2. COMPARATIVE REPORT: Company vs peers
3. PORTFOLIO REPORT: Holdings analysis + allocation
4. SECTOR REPORT: Industry overview + top picks
5. SCREEN RESULTS: Formatted screening output

REPORT STRUCTURE:
- Executive Summary
- Investment Thesis
- Financial Analysis (with charts/tables)
- Valuation
- Risks & Catalysts
- Recommendation
- Appendix: Raw data, assumptions

OUTPUT: Markdown formatted report ready for display/export`,
        [],
        15,
      ),
      financialDatasetsApiKey,
    );
  }

  async execute(task: AgentTask): Promise<any> {
    const { type, data, template = 'company' } = task.input;

    this.updateTaskStatus(task.id, 'running');

    try {
      const { streamText } = await import('ai');
      const model = getAllModels().find((m) => m.id === this.config.modelId);
      if (!model) throw new Error(`Model ${this.config.modelId} not found`);
      const modelInstance = customModel(model.apiIdentifier, {
        apiKey: process.env.OPENAI_API_KEY || '',
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        name: process.env.OPENAI_PROVIDER_NAME || 'openai',
      });

      const prompt = `Generate a professional ${template} investment report in Markdown.

DATA:
${JSON.stringify(data, null, 2)}

REPORT TYPE: ${type}
TEMPLATE: ${template}

Create a comprehensive, well-formatted Markdown report with:
- Executive Summary
- Key Metrics Table
- Financial Analysis
- Valuation
- Risks
- Recommendation
- Charts/visualizations described in text`;

      const result = await streamText({
        model: modelInstance,
        system: this.config.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        maxSteps: 1,
      });

      let fullText = '';
      for await (const chunk of result.textStream) {
        fullText += chunk;
      }

      const output = {
        report: fullText,
        type,
        template,
        generatedAt: new Date().toISOString(),
        wordCount: fullText.split(/\s+/).length,
      };

      this.updateTaskStatus(task.id, 'completed', output);
      return output;
    } catch (error) {
      this.updateTaskStatus(
        task.id,
        'failed',
        null,
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw error;
    }
  }
}

// ============================================
// REGISTER ALL AGENTS
// ============================================

export function initializeAgents(financialDatasetsApiKey: string) {
  const research = new ResearchAgent(financialDatasetsApiKey);
  const analysis = new AnalysisAgent(financialDatasetsApiKey);
  const screener = new ScreenerAgent(financialDatasetsApiKey);
  const monitor = new MonitorAgent(financialDatasetsApiKey);
  const report = new ReportAgent(financialDatasetsApiKey);

  registerAgent(research);
  registerAgent(analysis);
  registerAgent(screener);
  registerAgent(monitor);
  registerAgent(report);

  return { research, analysis, screener, monitor, report };
}
