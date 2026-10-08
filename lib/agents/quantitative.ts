import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { portfolioReportInputSchema, portfolioTools } from '../ai/tools/portfolio-tools';
import { analyzeMarket, marketAnalysisInputSchema, type MarketAnalysis } from '../market/analysis';
import type { PortfolioReport } from '../portfolio/risk';
import { BaseAgent, agentMemory, createAgentConfig, type AgentTask } from './base';

export const quantitativeTeamInputSchema = z.object({
  market: marketAnalysisInputSchema,
  portfolio: portfolioReportInputSchema.optional(),
}).strict();

export type QuantitativeTeamInput = z.input<typeof quantitativeTeamInputSchema>;

const unsupported = [
  'Risk factor decomposition and factor attribution are unsupported.',
  'AssetAllocation, portfolio optimization, conservative/aggressive allocations, and FII-specific strategies are unsupported.',
  'No forecasts, time-travel forecasts, investment recommendations, invented stress scenarios, or guarantees are produced.',
];

interface MarketEvidence {
  requestedAsOf: string;
  asOf: string;
  priceBasis: MarketAnalysis['priceBasis'];
  alignment: MarketAnalysis['alignment'];
  warnings: string[];
  limitations: string[];
}

export interface RiskAgentResult {
  asOf: string;
  report: PortfolioReport;
  warnings: string[];
  limitations: string[];
}

export interface MarketRegimeResult extends MarketEvidence {
  regime: MarketAnalysis['regime'];
  direction: MarketAnalysis['direction'];
  config: MarketAnalysis['config'];
  indicators: Pick<MarketAnalysis['indicators'], 'marketTicker' | 'trend' | 'annualizedRealizedVolatility' | 'volatility'>;
}

export interface SectorRotationResult extends MarketEvidence {
  marketTicker: string;
  sectorRankings: MarketAnalysis['sectorRankings'];
}

export interface TimeHorizonResult extends MarketEvidence {
  marketTicker: string;
  horizons: {
    market: MarketAnalysis['indicators']['momentum'][number];
    sectors: MarketAnalysis['sectorRankings'][number];
  }[];
}

function marketEvidence(analysis: MarketAnalysis): MarketEvidence {
  return {
    requestedAsOf: analysis.requestedAsOf,
    asOf: analysis.asOf,
    priceBasis: analysis.priceBasis,
    alignment: analysis.alignment,
    warnings: analysis.warnings,
    limitations: [...analysis.limitations, ...unsupported],
  };
}

abstract class DeterministicAgent<Result> extends BaseAgent {
  constructor(id: string, name: string, apiKey = '') {
    super(createAgentConfig(id, name, 'Deterministic caller-history analysis', '', '', []), apiKey);
  }

  protected abstract analyze(input: unknown): Result | Promise<Result>;

  async execute(task: AgentTask): Promise<Result> {
    agentMemory.setTask(task);
    delete task.result;
    delete task.error;
    delete task.completedAt;
    this.updateTaskStatus(task.id, 'running');
    try {
      if (task.agentId !== this.config.id) {
        throw new Error(`Task agentId must be ${this.config.id}`);
      }
      const result = await this.analyze(task.input);
      this.updateTaskStatus(task.id, 'completed', result);
      return result;
    } catch (error) {
      this.updateTaskStatus(task.id, 'failed', undefined, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}

export class RiskAgent extends DeterministicAgent<RiskAgentResult> {
  constructor(apiKey = '') {
    super('risk-agent', 'Risk Agent', apiKey);
  }

  protected analyze(input: unknown): RiskAgentResult {
    const report = portfolioTools.generatePortfolioReport.execute(portfolioReportInputSchema.parse(input));
    return {
      asOf: report.risk.dates[report.risk.dates.length - 1],
      report,
      warnings: [...new Set([...report.risk.warnings, ...report.correlations.warnings])],
      limitations: [...report.limitations, ...unsupported],
    };
  }
}

export class MarketRegimeAgent extends DeterministicAgent<MarketRegimeResult> {
  constructor(apiKey = '') {
    super('market-regime-agent', 'Market Regime Agent', apiKey);
  }

  protected analyze(input: unknown): MarketRegimeResult {
    const analysis = analyzeMarket(input);
    const { marketTicker, trend, annualizedRealizedVolatility, volatility } = analysis.indicators;
    return {
      ...marketEvidence(analysis),
      regime: analysis.regime,
      direction: analysis.direction,
      config: analysis.config,
      indicators: { marketTicker, trend, annualizedRealizedVolatility, volatility },
    };
  }
}

export class SectorRotationAgent extends DeterministicAgent<SectorRotationResult> {
  constructor(apiKey = '') {
    super('sector-rotation-agent', 'Sector Rotation Agent', apiKey);
  }

  protected analyze(input: unknown): SectorRotationResult {
    const analysis = analyzeMarket(input);
    return {
      ...marketEvidence(analysis),
      marketTicker: analysis.indicators.marketTicker,
      sectorRankings: analysis.sectorRankings,
    };
  }
}

export class TimeHorizonAgent extends DeterministicAgent<TimeHorizonResult> {
  constructor(apiKey = '') {
    super('time-horizon-agent', 'Time Horizon Agent', apiKey);
  }

  protected analyze(input: unknown): TimeHorizonResult {
    const analysis = analyzeMarket(input);
    return {
      ...marketEvidence(analysis),
      marketTicker: analysis.indicators.marketTicker,
      horizons: analysis.indicators.momentum.map((market, index) => ({ market, sectors: analysis.sectorRankings[index] })),
    };
  }
}

type Direction = 'positive' | 'negative' | 'flat';

function direction(value: number): Direction {
  return value > 0 ? 'positive' : value < 0 ? 'negative' : 'flat';
}

interface ReturnEvidence {
  horizon: number;
  startDate: string;
  endDate: string;
  totalReturn: number;
  excessReturnVsMarket?: number;
}

export interface QuantitativeConflict {
  type: 'MARKET_HORIZON_DISAGREEMENT' | 'REGIME_HORIZON_DISAGREEMENT'
    | 'SECTOR_HORIZON_DISAGREEMENT' | 'SECTOR_RELATIVE_HORIZON_DISAGREEMENT'
    | 'RELATIVE_SECTOR_LAGGING' | 'AS_OF_MISMATCH';
  subject: string;
  evidence: ReturnEvidence[];
  explanation: string;
}

export interface QuantitativeTeamResult {
  asOf: string;
  specialists: {
    marketRegime: MarketRegimeResult;
    sectorRotation: SectorRotationResult;
    timeHorizon: TimeHorizonResult;
    risk: RiskAgentResult | null;
  };
  summary: {
    regime: MarketAnalysis['regime'];
    direction: MarketAnalysis['direction'];
    marketHorizons: (ReturnEvidence & { direction: Direction })[];
    sectorHorizons: { horizon: number; leaders: string[]; laggingVsMarket: string[] }[];
    portfolio: { asOf: string; currency: string; currentValue: number; valueAtRisk: PortfolioReport['risk']['valueAtRisk']; maxDrawdown: number } | null;
  };
  conflicts: QuantitativeConflict[];
  warnings: string[];
  limitations: string[];
}

function findConflicts(specialists: QuantitativeTeamResult['specialists']): QuantitativeConflict[] {
  const { marketRegime, sectorRotation, timeHorizon, risk } = specialists;
  const conflicts: QuantitativeConflict[] = [];
  const momentum = timeHorizon.horizons.map(({ market }) => market);
  if (new Set(momentum.map((entry) => direction(entry.totalReturn))).size > 1) {
    conflicts.push({ type: 'MARKET_HORIZON_DISAGREEMENT', subject: timeHorizon.marketTicker, evidence: momentum,
      explanation: 'Historical market return signs differ across observation horizons; no single horizon consensus is inferred.' });
  }
  const opposite = momentum.filter((entry) => marketRegime.direction === 'bullish' ? entry.totalReturn < 0
    : marketRegime.direction === 'bearish' ? entry.totalReturn > 0 : false);
  if (opposite.length > 0) {
    conflicts.push({ type: 'REGIME_HORIZON_DISAGREEMENT', subject: timeHorizon.marketTicker,
      evidence: [marketRegime.indicators.trend, ...opposite],
      explanation: 'Configured regime trend and other historical horizons have opposite return signs.' });
  }
  const tickers = sectorRotation.sectorRankings[0].entries.map((entry) => entry.ticker);
  for (const ticker of tickers) {
    const evidence = sectorRotation.sectorRankings.map((ranking) => {
      const entry = ranking.entries.find((entry) => entry.ticker === ticker)!;
      return { horizon: ranking.horizon, startDate: ranking.startDate, endDate: ranking.endDate,
        totalReturn: entry.totalReturn, excessReturnVsMarket: entry.excessReturnVsMarket };
    });
    if (new Set(evidence.map((entry) => direction(entry.totalReturn))).size > 1) {
      conflicts.push({ type: 'SECTOR_HORIZON_DISAGREEMENT', subject: ticker, evidence,
        explanation: 'Sector-proxy absolute return signs differ across historical horizons.' });
    }
    if (new Set(evidence.map((entry) => direction(entry.excessReturnVsMarket))).size > 1) {
      conflicts.push({ type: 'SECTOR_RELATIVE_HORIZON_DISAGREEMENT', subject: ticker, evidence,
        explanation: 'Sector-proxy returns relative to the market differ in sign across historical horizons.' });
    }
    const lagging = evidence.filter((entry) => entry.totalReturn > 0 && entry.excessReturnVsMarket < 0);
    if (lagging.length > 0) {
      conflicts.push({ type: 'RELATIVE_SECTOR_LAGGING', subject: ticker, evidence: lagging,
        explanation: 'Positive absolute sector-proxy returns still lag the market; positive does not imply relative leadership.' });
    }
  }
  if (risk && risk.asOf !== marketRegime.asOf) {
    conflicts.push({ type: 'AS_OF_MISMATCH', subject: 'portfolio/market', evidence: [],
      explanation: `Portfolio history ends ${risk.asOf}; market history ends ${marketRegime.asOf}. These are separate samples, not a synchronized estimate.` });
  }
  return conflicts;
}

export class QuantitativeTeamOrchestrator extends DeterministicAgent<QuantitativeTeamResult> {
  public readonly marketRegimeAgent: MarketRegimeAgent;
  public readonly sectorRotationAgent: SectorRotationAgent;
  public readonly timeHorizonAgent: TimeHorizonAgent;
  public readonly riskAgent: RiskAgent;

  constructor(apiKey = '') {
    super('quantitative-team-orchestrator', 'Quantitative Team Orchestrator', apiKey);
    this.marketRegimeAgent = new MarketRegimeAgent(apiKey);
    this.sectorRotationAgent = new SectorRotationAgent(apiKey);
    this.timeHorizonAgent = new TimeHorizonAgent(apiKey);
    this.riskAgent = new RiskAgent(apiKey);
  }

  private runSpecialist<Result>(agent: DeterministicAgent<Result>, input: unknown): Promise<Result> {
    return agent.execute({ id: randomUUID(), agentId: agent.config.id, type: 'quantitative-analysis',
      input, status: 'pending', createdAt: new Date() });
  }

  protected async analyze(input: unknown): Promise<QuantitativeTeamResult> {
    const parsed = quantitativeTeamInputSchema.parse(input);
    const results = await Promise.allSettled([
      this.runSpecialist(this.marketRegimeAgent, parsed.market),
      this.runSpecialist(this.sectorRotationAgent, parsed.market),
      this.runSpecialist(this.timeHorizonAgent, parsed.market),
      parsed.portfolio === undefined ? Promise.resolve(null) : this.runSpecialist(this.riskAgent, parsed.portfolio),
    ] as const);
    const [marketRegime, sectorRotation, timeHorizon, risk] = results.map((result) => {
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    }) as [MarketRegimeResult, SectorRotationResult, TimeHorizonResult, RiskAgentResult | null];
    const specialists = { marketRegime, sectorRotation, timeHorizon, risk };
    const outputs = [marketRegime, sectorRotation, timeHorizon, ...(risk ? [risk] : [])];
    return {
      asOf: marketRegime.asOf,
      specialists,
      summary: {
        regime: marketRegime.regime,
        direction: marketRegime.direction,
        marketHorizons: timeHorizon.horizons.map(({ market }) => ({ ...market, direction: direction(market.totalReturn) })),
        sectorHorizons: sectorRotation.sectorRankings.map((ranking) => ({ horizon: ranking.horizon,
          leaders: ranking.entries.filter((entry) => entry.rank === 1).map((entry) => entry.ticker),
          laggingVsMarket: ranking.entries.filter((entry) => entry.excessReturnVsMarket < 0).map((entry) => entry.ticker) })),
        portfolio: risk ? { asOf: risk.asOf, currency: risk.report.risk.currency, currentValue: risk.report.risk.currentValue,
          valueAtRisk: risk.report.risk.valueAtRisk, maxDrawdown: risk.report.risk.maxDrawdown } : null,
      },
      conflicts: findConflicts(specialists),
      warnings: [...new Set(outputs.flatMap((output) => output.warnings))],
      limitations: [...new Set([...outputs.flatMap((output) => output.limitations),
        'Specialists compute independently from caller histories; synthesis does not infer a consensus or combine market proxies with portfolio risk.',
        ...(!risk ? ['Portfolio risk was not evaluated because no portfolio input was supplied.'] : [])])],
    };
  }
}