// Workflow Registry - Central catalog of all available workflows
// This is the single source of truth for discovering workflows, their triggers, steps, and contracts

import type { AgentWorkflow, WorkflowStep } from './base';

// ============================================
// WORKFLOW METADATA TYPES
// ============================================

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStepDefinition[];
  inputSchema?: Record<string, unknown>; // JSON Schema for input validation
  outputSchema?: Record<string, unknown>; // JSON Schema for output
  estimatedDurationMs?: number;
  tags: string[];
  owner: string; // Team/agent responsible
}

export interface WorkflowTrigger {
  type: 'cron' | 'event' | 'manual' | 'internal';
  schedule?: string; // Cron expression for cron triggers
  eventName?: string; // Event name for event triggers
  manualEndpoint?: string; // API endpoint for manual triggers
}

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  agentId: string;
  taskType: string;
  description: string;
  dependsOn?: string[]; // Step IDs this step depends on
  inputTemplate?: Record<string, unknown>; // Template for input with placeholders
  outputKey?: string; // Key to store output for downstream steps
  isParallel?: boolean; // Whether this step can run in parallel with others
  timeoutMs?: number;
}

// ============================================
// WORKFLOW CATALOG
// ============================================

export const WORKFLOW_CATALOG: WorkflowDefinition[] = [
  // ============================================
  // SCHEDULED WORKFLOWS (Internal/Cron)
  // ============================================
  {
    id: 'scheduled-monitoring',
    name: 'Scheduled Portfolio Monitoring',
    description: 'Runs every 15 minutes to check opted-in portfolios for monitoring alerts. Evaluates price movements, drawdowns, and financial health metrics.',
    trigger: {
      type: 'cron',
      schedule: '*/15 * * * *',
    },
    steps: [
      {
        id: 'get-enabled-portfolios',
        name: 'Get Enabled Portfolios',
        agentId: 'system',
        taskType: 'query',
        description: 'Fetch portfolios opted in for monitoring from database',
      },
      {
        id: 'check-due-portfolios',
        name: 'Check Due Portfolios',
        agentId: 'system',
        taskType: 'evaluate',
        description: 'Determine which portfolios are due for monitoring based on their schedule',
      },
      {
        id: 'run-monitor-agent',
        name: 'Run Monitor Agent',
        agentId: 'monitor-agent',
        taskType: 'monitor',
        description: 'Execute monitoring checks for each due portfolio',
        dependsOn: ['check-due-portfolios'],
        isParallel: true,
      },
      {
        id: 'send-critical-alerts',
        name: 'Send Critical Alerts',
        agentId: 'system',
        taskType: 'notify',
        description: 'Send notifications for critical severity alerts',
        dependsOn: ['run-monitor-agent'],
      },
    ],
    tags: ['scheduled', 'monitoring', 'portfolio', 'alerts'],
    owner: 'monitor-agent',
  },
  {
    id: 'daily-screening',
    name: 'Daily Stock Screening',
    description: 'Runs after market close (5PM UTC, Mon-Fri) with 4 predefined screens: Quality Value, GARP, High Quality Compounders, Dividend Growers.',
    trigger: {
      type: 'cron',
      schedule: '0 17 * * 1-5',
    },
    steps: [
      {
        id: 'screen-quality-value',
        name: 'Quality Value Screen',
        agentId: 'screener-agent',
        taskType: 'screen',
        description: 'ROE ≥15, P/E ≤20, D/E ≤0.5, Operating Margin ≥10%',
        inputTemplate: {
          criteria: {
            roe: { min: 15 },
            peRatio: { max: 20 },
            debtToEquity: { max: 0.5 },
            operating_margin: { min: 10 },
          },
          limit: 50,
        },
        isParallel: true,
      },
      {
        id: 'screen-garp',
        name: 'Growth at Reasonable Price Screen',
        agentId: 'screener-agent',
        taskType: 'screen',
        description: 'Revenue Growth ≥15%, P/E ≤25, PEG ≤1.5',
        inputTemplate: {
          criteria: {
            revenueGrowth: { min: 15 },
            peRatio: { max: 25 },
            pegRatio: { max: 1.5 },
          },
          limit: 50,
        },
        isParallel: true,
      },
      {
        id: 'screen-compounders',
        name: 'High Quality Compounders Screen',
        agentId: 'screener-agent',
        taskType: 'screen',
        description: 'ROE ≥20%, Revenue Growth ≥10%, Operating Margin ≥15%, D/E ≤1',
        inputTemplate: {
          criteria: {
            roe: { min: 20 },
            revenueGrowth: { min: 10 },
            operating_margin: { min: 15 },
            debtToEquity: { max: 1 },
          },
          limit: 50,
        },
        isParallel: true,
      },
      {
        id: 'screen-dividend',
        name: 'Dividend Growers Screen',
        agentId: 'screener-agent',
        taskType: 'screen',
        description: 'Dividends ≥$0.01, Payout Ratio ≤60%, Earnings Growth ≥5%',
        inputTemplate: {
          criteria: {
            dividends_per_common_share: { min: 0.01 },
            payoutRatio: { max: 60 },
            earnings_growth: { min: 5 },
          },
          limit: 50,
        },
        isParallel: true,
      },
      {
        id: 'store-results',
        name: 'Store Results',
        agentId: 'system',
        taskType: 'persist',
        description: 'Save screening results to database for dashboard display',
        dependsOn: ['screen-quality-value', 'screen-garp', 'screen-compounders', 'screen-dividend'],
      },
    ],
    tags: ['scheduled', 'screening', 'discovery', 'equities'],
    owner: 'screener-agent',
  },
  {
    id: 'cleanup-expired-agent-runs',
    name: 'Clean Up Expired Agent Runs',
    description: 'Deletes agent run records older than 90 days daily at 3AM UTC.',
    trigger: {
      type: 'cron',
      schedule: '0 3 * * *',
    },
    steps: [
      {
        id: 'delete-expired',
        name: 'Delete Expired Runs',
        agentId: 'system',
        taskType: 'cleanup',
        description: 'Remove runs and steps older than retention period',
      },
    ],
    tags: ['maintenance', 'cleanup', 'internal'],
    owner: 'system',
  },

  // ============================================
  // MANUAL WORKFLOWS (Triggered via API /agent/trigger)
  // ============================================
  {
    id: 'run-analysis-workflow',
    name: 'Full Company Analysis',
    description: 'Comprehensive analysis workflow: Research → Analysis (with peer comparison) → Report. Triggered via POST /api/agents/trigger with type "analysis".',
    trigger: {
      type: 'event',
      eventName: 'agent/analysis.requested',
      manualEndpoint: 'POST /api/agents/trigger (type: analysis)',
    },
    steps: [
      {
        id: 'research',
        name: 'Research Agent - Data Collection',
        agentId: 'research-agent',
        taskType: 'research',
        description: 'Gather prices, financial statements, metrics for target ticker (quarterly, 20 periods)',
        inputTemplate: {
          ticker: '{{ticker}}',
          period: 'quarterly',
          limit: 20,
          includeMetrics: true,
        },
        outputKey: 'researchData',
      },
      {
        id: 'peer-research',
        name: 'Peer Research (Parallel)',
        agentId: 'research-agent',
        taskType: 'research',
        description: 'Gather annual metrics for peer tickers (5 periods each)',
        inputTemplate: {
          ticker: '{{peer}}',
          period: 'annual',
          limit: 5,
          includeMetrics: true,
        },
        dependsOn: ['research'],
        isParallel: true,
        outputKey: 'peerResearch',
      },
      {
        id: 'analysis',
        name: 'Analysis Agent - Evaluation',
        agentId: 'analysis-agent',
        taskType: 'analysis',
        description: 'Interpret research data, compare with peers, generate scores/valuation/recommendation',
        inputTemplate: {
          researchData: '{{researchData}}',
          peers: '{{peers}}',
        },
        dependsOn: ['research', 'peer-research'],
        outputKey: 'analysis',
      },
      {
        id: 'report',
        name: 'Report Agent - Generate Report',
        agentId: 'report-agent',
        taskType: 'report',
        description: 'Create professional markdown investment report',
        inputTemplate: {
          type: 'company',
          data: { research: '{{researchData}}', analysis: '{{analysis}}', peers: '{{peerResearch}}' },
          template: 'company',
        },
        dependsOn: ['analysis', 'peer-research'],
        outputKey: 'report',
      },
      {
        id: 'save-and-notify',
        name: 'Save & Notify',
        agentId: 'system',
        taskType: 'persist',
        description: 'Save report to database and notify user',
        dependsOn: ['report'],
      },
    ],
    inputSchema: {
      type: 'object',
      required: ['ticker', 'runId'],
      properties: {
        ticker: { type: 'string' },
        peers: { type: 'array', items: { type: 'string' }, default: [] },
        runId: { type: 'string' },
      },
    },
    tags: ['manual', 'analysis', 'research', 'report', 'peers'],
    owner: 'analysis-agent',
    estimatedDurationMs: 120000,
  },
  {
    id: 'run-debate-workflow',
    name: 'Multi-Agent Investment Debate',
    description: 'Bull/Bear debate workflow: Research → Bull Analysis → Bear Analysis (parallel) → Synthesis → Report. Optional deterministic evidence-gap gate after Research (controlled by EVIDENCE_GAP_DECISION_MODE).',
    trigger: {
      type: 'event',
      eventName: 'agent/debate.requested',
      manualEndpoint: 'POST /api/agents/trigger (type: debate)',
    },
    steps: [
      {
        id: 'research',
        name: 'Research Agent - Data Collection',
        agentId: 'research-agent',
        taskType: 'research',
        description: 'Gather quarterly data (20 periods) for target ticker',
        inputTemplate: {
          ticker: '{{ticker}}',
          period: 'quarterly',
          limit: 20,
          includeMetrics: true,
        },
        outputKey: 'researchData',
      },
      {
        id: 'evidence-gap-gate',
        name: 'Evidence Gap Decision Gate (Optional)',
        agentId: 'system',
        taskType: 'evidence-gap-decision',
        description: 'Deterministic check: verify research data has sufficient coverage. Only runs if EVIDENCE_GAP_DECISION_MODE=deterministic',
        dependsOn: ['research'],
        isParallel: false,
      },
      {
        id: 'bull-analysis',
        name: 'Bull Case Analysis',
        agentId: 'analysis-agent',
        taskType: 'analysis',
        description: 'Analysis with bull perspective (upside/catalysts focus)',
        inputTemplate: {
          researchData: '{{researchData}}',
          peers: '{{peers}}',
          perspective: 'bull',
          instruction: 'Focus on upside potential, catalysts, and positive catalysts',
        },
        dependsOn: ['research', 'evidence-gap-gate'],
        isParallel: true,
        outputKey: 'bullAnalysis',
      },
      {
        id: 'bear-analysis',
        name: 'Bear Case Analysis',
        agentId: 'analysis-agent',
        taskType: 'analysis',
        description: 'Analysis with bear perspective (downside/risks focus)',
        inputTemplate: {
          researchData: '{{researchData}}',
          peers: '{{peers}}',
          perspective: 'bear',
          instruction: 'Focus on downside risks, red flags, and negative catalysts',
        },
        dependsOn: ['research', 'evidence-gap-gate'],
        isParallel: true,
        outputKey: 'bearAnalysis',
      },
      {
        id: 'synthesis',
        name: 'Synthesis Agent',
        agentId: 'analysis-agent',
        taskType: 'synthesis',
        description: 'Synthesize bull/bear analyses into balanced view using Mercury Decide model',
        inputTemplate: {
          bullAnalysis: '{{bullAnalysis}}',
          bearAnalysis: '{{bearAnalysis}}',
          question: '{{question}}',
        },
        dependsOn: ['bull-analysis', 'bear-analysis'],
        outputKey: 'synthesis',
      },
      {
        id: 'report',
        name: 'Report Agent - Generate Debate Report',
        agentId: 'report-agent',
        taskType: 'report',
        description: 'Create professional markdown report with both perspectives',
        inputTemplate: {
          type: 'debate',
          data: { synthesis: '{{synthesis}}', bull: '{{bullAnalysis}}', bear: '{{bearAnalysis}}', research: '{{researchData}}' },
          template: 'debate',
        },
        dependsOn: ['synthesis'],
        outputKey: 'report',
      },
      {
        id: 'save-and-notify',
        name: 'Save & Notify',
        agentId: 'system',
        taskType: 'persist',
        description: 'Save report to database and notify user',
        dependsOn: ['report'],
      },
    ],
    inputSchema: {
      type: 'object',
      required: ['ticker', 'question', 'runId'],
      properties: {
        ticker: { type: 'string' },
        question: { type: 'string' },
        peers: { type: 'array', items: { type: 'string' }, default: [] },
        runId: { type: 'string' },
        decisionMode: { type: 'string', enum: ['off', 'deterministic'], default: 'off' },
      },
    },
    tags: ['manual', 'debate', 'analysis', 'bull-bear', 'synthesis', 'evidence-gap'],
    owner: 'analysis-agent',
    estimatedDurationMs: 180000,
  },
  {
    id: 'run-screening-workflow',
    name: 'Custom Stock Screening',
    description: 'Run a custom screen with user-defined criteria. Triggered via POST /api/agents/trigger with type "screening".',
    trigger: {
      type: 'event',
      eventName: 'agent/screening.requested',
      manualEndpoint: 'POST /api/agents/trigger (type: screening)',
    },
    steps: [
      {
        id: 'screen',
        name: 'Screener Agent',
        agentId: 'screener-agent',
        taskType: 'screen',
        description: 'Execute screening with user criteria, enrich top 10 with metrics, rank by score',
        inputTemplate: {
          criteria: '{{criteria}}',
          limit: 50,
        },
        outputKey: 'screenResult',
      },
      {
        id: 'store-results',
        name: 'Store Results',
        agentId: 'system',
        taskType: 'persist',
        description: 'Save screening results for dashboard',
        dependsOn: ['screen'],
      },
    ],
    inputSchema: {
      type: 'object',
      required: ['criteria', 'runId'],
      properties: {
        criteria: { type: 'object' },
        runId: { type: 'string' },
      },
    },
    tags: ['manual', 'screening', 'discovery'],
    owner: 'screener-agent',
    estimatedDurationMs: 60000,
  },
  {
    id: 'run-monitoring-workflow',
    name: 'On-Demand Portfolio Monitoring',
    description: 'Run monitor checks on a specific set of positions. Triggered via POST /api/agents/trigger with type "monitoring".',
    trigger: {
      type: 'event',
      eventName: 'agent/monitoring.requested',
      manualEndpoint: 'POST /api/agents/trigger (type: monitoring)',
    },
    steps: [
      {
        id: 'monitor',
        name: 'Monitor Agent',
        agentId: 'monitor-agent',
        taskType: 'monitor',
        description: 'Check positions for price movements, drawdowns, financial health alerts',
        inputTemplate: {
          positions: '{{positions}}',
          thresholds: '{{thresholds}}',
        },
        outputKey: 'monitorResult',
      },
    ],
    inputSchema: {
      type: 'object',
      required: ['positions', 'runId'],
      properties: {
        positions: { type: 'array' },
        thresholds: { type: 'object', default: {} },
        runId: { type: 'string' },
      },
    },
    tags: ['manual', 'monitoring', 'portfolio', 'alerts'],
    owner: 'monitor-agent',
    estimatedDurationMs: 30000,
  },
  {
    id: 'run-report-workflow',
    name: 'Standalone Report Generation',
    description: 'Generate a report from provided data without research/analysis steps. Triggered internally via event agent/report.requested.',
    trigger: {
      type: 'event',
      eventName: 'agent/report.requested',
      manualEndpoint: 'Internal only (no manual trigger)',
    },
    steps: [
      {
        id: 'report',
        name: 'Report Agent',
        agentId: 'report-agent',
        taskType: 'report',
        description: 'Generate markdown report from provided data and template',
        inputTemplate: {
          type: '{{type}}',
          data: '{{data}}',
          template: '{{template}}',
        },
        outputKey: 'report',
      },
    ],
    inputSchema: {
      type: 'object',
      required: ['type', 'data'],
      properties: {
        type: { type: 'string' },
        data: { type: 'object' },
        template: { type: 'string', default: 'company' },
      },
    },
    tags: ['internal', 'report', 'generation'],
    owner: 'report-agent',
    estimatedDurationMs: 30000,
  },

  // ============================================
  // QUANTITATIVE TEAM WORKFLOW (Separate deterministic path)
  // ============================================
  {
    id: 'quantitative-team-analysis',
    name: 'Quantitative Team Analysis',
    description: 'Deterministic multi-specialist analysis: Market Regime + Sector Rotation + Time Horizon + optional Risk. No LLM calls. Via POST /api/agents/quantitative or CLI.',
    trigger: {
      type: 'manual',
      manualEndpoint: 'POST /api/agents/quantitative or pnpm agent:analyze --mode=quantitative',
    },
    steps: [
      {
        id: 'market-regime',
        name: 'Market Regime Agent',
        agentId: 'market-regime-agent',
        taskType: 'market-regime',
        description: 'Determine market regime, direction, volatility from price histories',
        isParallel: true,
      },
      {
        id: 'sector-rotation',
        name: 'Sector Rotation Agent',
        agentId: 'sector-rotation-agent',
        taskType: 'sector-rotation',
        description: 'Rank sector proxies by momentum and excess returns',
        isParallel: true,
      },
      {
        id: 'time-horizon',
        name: 'Time Horizon Agent',
        agentId: 'time-horizon-agent',
        taskType: 'time-horizon',
        description: 'Historical return evidence across horizons (no forecasts)',
        isParallel: true,
      },
      {
        id: 'risk',
        name: 'Risk Agent (Optional)',
        agentId: 'risk-agent',
        taskType: 'risk',
        description: 'Portfolio risk report: VaR, CVaR, correlations, stress tests',
        isParallel: true,
      },
      {
        id: 'orchestrate',
        name: 'Quantitative Team Orchestrator',
        agentId: 'quantitative-team-orchestrator',
        taskType: 'orchestrate',
        description: 'Aggregate specialist outputs, detect conflicts, produce summary',
        dependsOn: ['market-regime', 'sector-rotation', 'time-horizon', 'risk'],
      },
    ],
    inputSchema: {
      type: 'object',
      required: ['market'],
      properties: {
        market: { type: 'object' },
        portfolio: { type: 'object' },
      },
    },
    tags: ['quantitative', 'deterministic', 'market-regime', 'sector-rotation', 'risk', 'no-llm'],
    owner: 'quantitative-team-orchestrator',
    estimatedDurationMs: 5000,
  },
];

// ============================================
// AGENT MODEL CATALOG
// ============================================

export interface AgentModelInfo {
  agentId: string;
  agentName: string;
  role: string;
  modelId: string;
  modelLabel: string;
  actuallyCallsLLM: boolean;
  description: string;
  contextWindow?: number;
  expiringSoon?: boolean;
}

export const AGENT_MODEL_CATALOG: AgentModelInfo[] = [
  // Traditional LLM Agents (lib/agents/specialized.ts)
  {
    agentId: 'research-agent',
    agentName: 'Research Agent',
    role: 'Data Collection',
    modelId: 'apodex/apodex-1.1-mini:free',
    modelLabel: 'Apodex 1.1 Mini',
    actuallyCallsLLM: false,
    description: 'Gathers raw financial data via deterministic tool calls (getStockPrices, getIncomeStatements, getBalanceSheets, getCashFlowStatements, getFinancialMetrics, searchStocksByFilters). Model configured but NOT invoked in execute().',
    contextWindow: 262000,
  },
  {
    agentId: 'analysis-agent',
    agentName: 'Analysis Agent',
    role: 'Financial Analysis & Valuation',
    modelId: 'thinkingmachines/inkling:free',
    modelLabel: 'Inkling',
    actuallyCallsLLM: true,
    description: 'Interprets research data, compares with peers, generates scores (profitability, growth, valuation, health, quality, moat), fair value, DCF, recommendation. Uses streamText with custom prompt from buildAnalysisPrompt().',
    contextWindow: 1050000,
  },
  {
    agentId: 'screener-agent',
    agentName: 'Screener Agent',
    role: 'Stock Screening & Ranking',
    modelId: 'nvidia/nemotron-3.5-lightning:free',
    modelLabel: 'Nemotron 3.5 Lightning',
    actuallyCallsLLM: false,
    description: 'Normalizes criteria, searches stocks via Financial Datasets, enriches top 10 with metrics, calculates heuristic score (0-100). Model configured but NOT invoked in execute().',
    contextWindow: 1000000,
  },
  {
    agentId: 'monitor-agent',
    agentName: 'Monitor Agent',
    role: 'Portfolio Monitoring & Alerts',
    modelId: 'meta-llama/llama-3.1-8b-instruct:free',
    modelLabel: 'Llama 3.1 8B',
    actuallyCallsLLM: false,
    description: 'Checks positions for price movements (>5% daily, >20% from cost), current ratio <1, debt/equity >2. Model configured but NOT invoked in execute().',
    contextWindow: 128000,
  },
  {
    agentId: 'report-agent',
    agentName: 'Report Agent',
    role: 'Report Generation',
    modelId: 'thinkingmachines/inkling-small:free',
    modelLabel: 'Inkling Small',
    actuallyCallsLLM: true,
    description: 'Generates professional markdown reports from structured data (company, comparative, portfolio, sector, screen results). Uses streamText with custom system prompt.',
    contextWindow: 1050000,
  },

  // Quantitative Deterministic Agents (lib/agents/quantitative.ts) - NO LLM
  {
    agentId: 'risk-agent',
    agentName: 'Risk Agent',
    role: 'Portfolio Risk Analysis',
    modelId: 'none (deterministic)',
    modelLabel: 'N/A - Pure Arithmetic',
    actuallyCallsLLM: false,
    description: 'Computes portfolio risk: historical VaR/CVaR, volatility, drawdown, concentration (Herfindahl), Pearson correlations, explicit stress scenarios. Calls portfolioTools.generatePortfolioReport().',
  },
  {
    agentId: 'market-regime-agent',
    agentName: 'Market Regime Agent',
    role: 'Market Regime Detection',
    modelId: 'none (deterministic)',
    modelLabel: 'N/A - Pure Arithmetic',
    actuallyCallsLLM: false,
    description: 'Analyzes market regime (BULLISH/BEARISH/SIDEWAYS/CRISIS), direction, momentum, volatility from price histories. Calls analyzeMarket().',
  },
  {
    agentId: 'sector-rotation-agent',
    agentName: 'Sector Rotation Agent',
    role: 'Sector Momentum Ranking',
    modelId: 'none (deterministic)',
    modelLabel: 'N/A - Pure Arithmetic',
    actuallyCallsLLM: false,
    description: 'Ranks sector proxies by absolute and excess returns across horizons. Calls analyzeMarket().',
  },
  {
    agentId: 'time-horizon-agent',
    agentName: 'Time Horizon Agent',
    role: 'Historical Return Evidence',
    modelId: 'none (deterministic)',
    modelLabel: 'N/A - Pure Arithmetic',
    actuallyCallsLLM: false,
    description: 'Returns historical return observations for market and sectors across configured horizons. No forecasts. Calls analyzeMarket().',
  },
  {
    agentId: 'quantitative-team-orchestrator',
    agentName: 'Quantitative Team Orchestrator',
    role: 'Team Orchestration & Conflict Detection',
    modelId: 'none (deterministic)',
    modelLabel: 'N/A - Pure Arithmetic',
    actuallyCallsLLM: false,
    description: 'Runs 3-4 specialists in parallel, aggregates results, detects 6 conflict types (market/regime/sector horizon disagreements, relative lagging, AS_OF mismatch). No consensus inference.',
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return WORKFLOW_CATALOG.find((w) => w.id === id);
}

export function getWorkflowsByTag(tag?: string): WorkflowDefinition[] {
  if (!tag) return [...WORKFLOW_CATALOG];
  return WORKFLOW_CATALOG.filter((w) => w.tags.includes(tag));
}

export function getWorkflowsByOwner(owner: string): WorkflowDefinition[] {
  return WORKFLOW_CATALOG.filter((w) => w.owner === owner);
}

export function getWorkflowsByTriggerType(type: WorkflowTrigger['type']): WorkflowDefinition[] {
  return WORKFLOW_CATALOG.filter((w) => w.trigger.type === type);
}

export function getAgentModelInfo(agentId: string): AgentModelInfo | undefined {
  return AGENT_MODEL_CATALOG.find((a) => a.agentId === agentId);
}

export function getAllAgentModels(): AgentModelInfo[] {
  return [...AGENT_MODEL_CATALOG];
}

export function getLLMAgents(): AgentModelInfo[] {
  return AGENT_MODEL_CATALOG.filter((a) => a.actuallyCallsLLM);
}

export function getDeterministicAgents(): AgentModelInfo[] {
  return AGENT_MODEL_CATALOG.filter((a) => !a.actuallyCallsLLM);
}