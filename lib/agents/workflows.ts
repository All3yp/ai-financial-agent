// Inngest Functions - Background Agent Execution
// Handles scheduled tasks, workflows, and async agent communication

import { inngest } from './client';
import type { GetStepTools } from 'inngest';
import { agentMemory } from './base';
import { initializeAgents } from './specialized';
import { agentRunStore } from '@/lib/db/agent-runs';
import { portfolioRepository } from '@/lib/db/portfolio';
import { sanitizeRunError } from './run-store';

type WorkflowStepRunner = GetStepTools<typeof inngest>;

async function startPersistedRun(runId: string, step: WorkflowStepRunner) {
  await step.run('persist-run-start', () =>
    agentRunStore.markRunRunning(runId),
  );
}

async function persistedStep<T>(
  runId: string,
  step: WorkflowStepRunner,
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  await step.run(`persist-${name}-start`, () =>
    agentRunStore.markStepRunning(runId, name),
  );
  try {
    const result = await step.run(name, operation);
    await step.run(`persist-${name}-result`, () =>
      agentRunStore.completeStep(runId, name, result),
    );
    return result as T;
  } catch (error) {
    await step.run(`persist-${name}-failure`, () =>
      agentRunStore.failRun(runId, sanitizeRunError(error)),
    );
    throw error;
  }
}

async function completePersistedRun(
  runId: string,
  step: WorkflowStepRunner,
  result: unknown,
) {
  try {
    await step.run('persist-run-result', () =>
      agentRunStore.completeRun(runId, result),
    );
  } catch (error) {
    await step.run('persist-run-failure', () =>
      agentRunStore.failRun(runId, sanitizeRunError(error)),
    );
    throw error;
  }
}

// Initialize agents with API key from environment
const FINANCIAL_DATASETS_API_KEY = process.env.FINANCIAL_DATASETS_API_KEY || '';
const agents = initializeAgents(FINANCIAL_DATASETS_API_KEY);

export const cleanupExpiredAgentRuns = inngest.createFunction(
  { id: 'cleanup-expired-agent-runs', name: 'Clean Up Expired Agent Runs' },
  { cron: '0 3 * * *' },
  async ({ step }) =>
    step.run('delete-expired-runs', () => agentRunStore.deleteExpiredRuns()),
);

// ============================================
// Fixed UTC weekday/hour baseline; this is not exchange-calendar aware.
// ============================================

export const scheduledMonitoring = inngest.createFunction(
  { id: 'scheduled-monitoring', name: 'Scheduled Portfolio Monitoring' },
  { cron: '0 9-16 * * 1-5' },
  async ({ event, step }) => {
    const occurrence =
      typeof event.ts === 'number'
        ? new Date(event.ts).toISOString().slice(0, 13)
        : new Date().toISOString().slice(0, 13);
    const portfolios = await step.run('get-enabled-portfolios', () =>
      portfolioRepository.listEnabledPortfoliosForMonitoring(),
    );

    if (portfolios.length === 0) {
      return { message: 'No portfolios to monitor' };
    }

    // Run monitor agent for each portfolio
    const results = await Promise.all(
      portfolios.map(async (portfolio) => {
        const creation = await step.run(
          `create-monitor-run-${portfolio.portfolioId}`,
          () =>
            agentRunStore.createScheduledMonitoringRun(
              portfolio.userId,
              portfolio.portfolioId,
              `scheduled:${occurrence}`,
              portfolio.positions,
            ),
        );
        if (creation.kind === 'limit') {
          return {
            portfolioId: portfolio.portfolioId,
            userId: portfolio.userId,
            alerts: [],
            skipped: 'active-run-limit',
          };
        }
        if (creation.kind === 'conflict') {
          return {
            portfolioId: portfolio.portfolioId,
            userId: portfolio.userId,
            alerts: [],
            skipped: 'portfolio-not-enabled',
          };
        }
        const runId = creation.run.id;
        if (
          creation.kind === 'existing' &&
          creation.run.status === 'completed'
        ) {
          return {
            portfolioId: portfolio.portfolioId,
            userId: portfolio.userId,
            alerts: [],
            runId,
            skipped: 'already-processed',
          };
        }

        await step.run(`monitor-start-${runId}`, () =>
          agentRunStore.markRunRunning(runId),
        );
        try {
          await step.run(`monitor-step-start-${runId}`, () =>
            agentRunStore.markStepRunning(runId, 'monitor'),
          );
          const result = await step.run(`monitor-${runId}`, () =>
            agents.monitor.execute({
              id: runId,
              agentId: 'monitor-agent',
              type: 'monitor',
              input: { positions: portfolio.positions },
              status: 'pending',
              createdAt: new Date(),
            }),
          );
          await step.run(`monitor-step-result-${runId}`, () =>
            agentRunStore.completeStep(runId, 'monitor', result),
          );
          await step.run(`monitor-run-result-${runId}`, () =>
            agentRunStore.completeRun(runId, result),
          );
          return {
            portfolioId: portfolio.portfolioId,
            userId: portfolio.userId,
            alerts: result.alerts,
            runId,
          };
        } catch (error) {
          await step.run(`monitor-run-failure-${runId}`, () =>
            agentRunStore.failRun(runId, sanitizeRunError(error)),
          );
          throw error;
        }
      }),
    );

    // Send notifications for critical alerts
    const criticalAlerts = results.flatMap((r) =>
      r.alerts.filter((a: any) => a.severity === 'critical'),
    );
    if (criticalAlerts.length > 0) {
      await step.run('send-critical-alerts', async () => {
        // TODO: Send email/push notifications
        console.log('CRITICAL ALERTS:', criticalAlerts);
      });
    }

    return {
      monitored: portfolios.length,
      alerts: results.flatMap((r) => r.alerts).length,
      skipped: results.filter((result) => 'skipped' in result).length,
    };
  },
);

// ============================================
// DAILY SCREENING - Runs after market close
// ============================================

export const dailyScreening = inngest.createFunction(
  { id: 'daily-screening', name: 'Daily Stock Screening' },
  { cron: '0 17 * * 1-5' }, // 5PM Mon-Fri (after market close)
  async ({ event, step }) => {
    const screens = [
      {
        name: 'Quality Value',
        criteria: {
          roe: { min: 15 },
          peRatio: { max: 20 },
          debtToEquity: { max: 0.5 },
          operating_margin: { min: 10 },
        },
      },
      {
        name: 'Growth at Reasonable Price',
        criteria: {
          revenueGrowth: { min: 15 },
          peRatio: { max: 25 },
          pegRatio: { max: 1.5 },
        },
      },
      {
        name: 'High Quality Compounders',
        criteria: {
          roe: { min: 20 },
          revenueGrowth: { min: 10 },
          operating_margin: { min: 15 },
          debtToEquity: { max: 1 },
        },
      },
      {
        name: 'Dividend Growers',
        criteria: {
          dividends_per_common_share: { min: 0.01 },
          payoutRatio: { max: 60 },
          earnings_growth: { min: 5 },
        },
      },
    ];

    const results = await Promise.all(
      screens.map((screen) =>
        step.run(`screen-${screen.name}`, async () => {
          return await agents.screener.execute({
            id: `screen-${screen.name}-${Date.now()}`,
            agentId: 'screener-agent',
            type: 'screen',
            input: { criteria: screen.criteria, limit: 50 },
            status: 'pending',
            createdAt: new Date(),
          });
        }),
      ),
    );

    // Store results for UI display
    await step.run('store-results', async () => {
      // TODO: Save to database for dashboard
      console.log(
        'Daily screening results:',
        results.map((r) => ({
          screen: r.screenName,
          top: r.results.slice(0, 5),
        })),
      );
    });

    return {
      screens: results.length,
      totalResults: results.reduce((sum, r) => sum + r.passed, 0),
    };
  },
);

export const runScreeningWorkflow = inngest.createFunction(
  { id: 'run-screening-workflow', name: 'Run Stock Screening' },
  { event: 'agent/screening.requested' },
  async ({ event, step }) => {
    const { criteria, runId } = event.data;
    if (typeof runId !== 'string')
      throw new Error('Screening run ID is missing');
    try {
      await step.run('persist-run-start', () =>
        agentRunStore.markRunRunning(runId),
      );
      await step.run('persist-screen-start', () =>
        agentRunStore.markStepRunning(runId, 'screen'),
      );
      const result = await step.run('screen', () =>
        agents.screener.execute({
          id: runId,
          agentId: 'screener-agent',
          type: 'screen',
          input: { criteria, limit: 50 },
          status: 'pending',
          createdAt: new Date(),
        }),
      );
      await step.run('persist-screen-result', () =>
        agentRunStore.completeStep(runId, 'screen', result),
      );
      await step.run('persist-run-result', () =>
        agentRunStore.completeRun(runId, result),
      );
      return { runId, result };
    } catch (error) {
      await step.run('persist-run-failure', () =>
        agentRunStore.failRun(runId, sanitizeRunError(error)),
      );
      throw error;
    }
  },
);

export const runMonitoringWorkflow = inngest.createFunction(
  { id: 'run-monitoring-workflow', name: 'Run Portfolio Monitoring' },
  { event: 'agent/monitoring.requested' },
  async ({ event, step }) => {
    const { positions, runId } = event.data;
    if (typeof runId !== 'string')
      throw new Error('Monitoring run ID is missing');
    await startPersistedRun(runId, step);
    const result = await persistedStep(runId, step, 'monitor', () =>
      agents.monitor.execute({
        id: runId,
        agentId: 'monitor-agent',
        type: 'monitor',
        input: { positions },
        status: 'pending',
        createdAt: new Date(),
      }),
    );
    await completePersistedRun(runId, step, result);
    return result;
  },
);

export const runReportWorkflow = inngest.createFunction(
  { id: 'run-report-workflow', name: 'Generate Investment Report' },
  { event: 'agent/report.requested' },
  async ({ event, step }) => {
    const { type, data } = event.data;
    return step.run('report', () =>
      agents.report.execute({
        id: `report-${Date.now()}`,
        agentId: 'report-agent',
        type: 'report',
        input: { type, data, template: type },
        status: 'pending',
        createdAt: new Date(),
      }),
    );
  },
);

// ============================================
// ON-DEMAND ANALYSIS WORKFLOW
// ============================================

export const runAnalysisWorkflow = inngest.createFunction(
  { id: 'run-analysis-workflow', name: 'Run Full Analysis Workflow' },
  { event: 'agent/analysis.requested' },
  async ({ event, step }) => {
    const { ticker, peers = [], runId } = event.data;
    if (typeof runId !== 'string')
      throw new Error('Analysis run ID is missing');
    await startPersistedRun(runId, step);

    // Step 1: Research Agent gathers data
    const researchData = await persistedStep(
      runId,
      step,
      'research',
      async () => {
        return await agents.research.execute({
          id: `research-${ticker}-${Date.now()}`,
          agentId: 'research-agent',
          type: 'research',
          input: { ticker, period: 'quarterly', limit: 20 },
          status: 'pending',
          createdAt: new Date(),
        });
      },
    );

    // Step 2: Analysis Agent analyzes (can run in parallel with peer research)
    const [analysis, peerResearch] = await Promise.all([
      persistedStep(runId, step, 'analysis', async () => {
        return await agents.analysis.execute({
          id: `analysis-${ticker}-${Date.now()}`,
          agentId: 'analysis-agent',
          type: 'analysis',
          input: { researchData, peers },
          status: 'pending',
          createdAt: new Date(),
        });
      }),
      persistedStep(runId, step, 'peer-research', async () => {
        if (peers.length === 0) return {};
        const peerData = await Promise.all(
          peers.map((p: string) =>
            agents.research.execute({
              id: `research-${p}-${Date.now()}`,
              agentId: 'research-agent',
              type: 'research',
              input: { ticker: p, period: 'annual', limit: 5 },
              status: 'pending',
              createdAt: new Date(),
            }),
          ),
        );
        return Object.fromEntries(
          peers.map((p: string, i: number) => [p, peerData[i]]),
        );
      }),
    ]);

    // Step 3: Report Agent generates report
    const report = await persistedStep(runId, step, 'report', async () => {
      return await agents.report.execute({
        id: `report-${ticker}-${Date.now()}`,
        agentId: 'report-agent',
        type: 'report',
        input: {
          type: 'company',
          data: { research: researchData, analysis, peers: peerResearch },
          template: 'company',
        },
        status: 'pending',
        createdAt: new Date(),
      });
    });

    // Step 4: Save to database and notify user
    await step.run('save-and-notify', async () => {
      // TODO: Save report to DB, send notification to user
      console.log(`Analysis complete for ${ticker}`, {
        reportLength: report.report.length,
      });
    });

    const output = {
      ticker,
      report: report.report,
      analysis: analysis.recommendation,
    };
    await completePersistedRun(runId, step, output);
    return output;
  },
);

// ============================================
// MULTI-AGENT DEBATE WORKFLOW
// ============================================

export const runDebateWorkflow = inngest.createFunction(
  { id: 'run-debate-workflow', name: 'Multi-Agent Investment Debate' },
  { event: 'agent/debate.requested' },
  async ({ event, step }) => {
    const { ticker, question, runId } = event.data;
    if (typeof runId !== 'string') throw new Error('Debate run ID is missing');
    await startPersistedRun(runId, step);

    // Step 1: Research agent gets data
    const researchData = await persistedStep(
      runId,
      step,
      'research',
      async () => {
        return await agents.research.execute({
          id: `research-${ticker}-${Date.now()}`,
          agentId: 'research-agent',
          type: 'research',
          input: { ticker, period: 'quarterly', limit: 20 },
          status: 'pending',
          createdAt: new Date(),
        });
      },
    );

    // Step 2: Two analysis agents with different perspectives
    const [bullCase, bearCase] = await Promise.all([
      persistedStep(runId, step, 'bull-case', async () => {
        const bullAgent = new (await import('./specialized')).AnalysisAgent(
          FINANCIAL_DATASETS_API_KEY,
        );
        // Override system prompt for bull perspective
        return await bullAgent.execute({
          id: `bull-${ticker}-${Date.now()}`,
          agentId: 'analysis-agent',
          type: 'analysis',
          input: {
            researchData,
            perspective: 'bull',
            instruction:
              'Focus on upside potential, growth catalysts, competitive advantages. Be optimistic but grounded in data.',
          },
          status: 'pending',
          createdAt: new Date(),
        });
      }),
      persistedStep(runId, step, 'bear-case', async () => {
        const bearAgent = new (await import('./specialized')).AnalysisAgent(
          FINANCIAL_DATASETS_API_KEY,
        );
        return await bearAgent.execute({
          id: `bear-${ticker}-${Date.now()}`,
          agentId: 'analysis-agent',
          type: 'analysis',
          input: {
            researchData,
            perspective: 'bear',
            instruction:
              'Focus on risks, downside scenarios, competitive threats, valuation concerns. Be pessimistic but grounded in data.',
          },
          status: 'pending',
          createdAt: new Date(),
        });
      }),
    ]);

    // Step 3: Synthesis agent creates balanced view
    const synthesis = await persistedStep(
      runId,
      step,
      'synthesis',
      async () => {
        const { streamText } = await import('ai');
        const { customModel } = await import('../ai');
        const { getAllModels } = await import('../ai/models');

        const model = getAllModels().find(
          (m) => m.id === 'thinkingmachines/inkling:free',
        );
        if (!model) throw new Error('Synthesis model is not configured');
        const modelInstance = customModel(model.apiIdentifier, {
          apiKey: process.env.OPENAI_API_KEY || '',
          baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
          name: process.env.OPENAI_PROVIDER_NAME || 'openai',
        });

        const prompt = `Synthesize a balanced investment view from these two perspectives:

QUESTION: ${question}
TICKER: ${ticker}

BULL CASE:
${JSON.stringify(bullCase, null, 2)}

BEAR CASE:
${JSON.stringify(bearCase, null, 2)}

RAW DATA:
${JSON.stringify(researchData, null, 2)}

Provide:
1. Balanced assessment
2. Key swing factors (what would change your mind)
3. Probability-weighted scenarios
4. Final recommendation with confidence`;

        const result = await streamText({
          model: modelInstance,
          system:
            'You are a Senior Investment Committee Member. Synthesize opposing views into a balanced, nuanced investment decision.',
          messages: [{ role: 'user', content: prompt }],
          maxSteps: 1,
        });

        let fullText = '';
        for await (const chunk of result.textStream) {
          fullText += chunk;
        }

        return { synthesis: fullText, bullCase, bearCase, researchData };
      },
    );

    // Step 4: Generate report
    const report = await persistedStep(runId, step, 'report', async () => {
      return await agents.report.execute({
        id: `report-${ticker}-${Date.now()}`,
        agentId: 'report-agent',
        type: 'report',
        input: {
          type: 'debate',
          data: synthesis,
          template: 'debate',
        },
        status: 'pending',
        createdAt: new Date(),
      });
    });

    await step.run('notify-user', async () => {
      // TODO: Notify user via email/push
      console.log(`Debate complete for ${ticker}`);
    });

    const output = {
      ticker,
      report: report.report,
      synthesis: synthesis.synthesis,
    };
    await completePersistedRun(runId, step, output);
    return output;
  },
);

// ============================================
// AGENT COMMUNICATION HELPER
// ============================================

export async function sendAgentMessage(
  fromAgentId: string,
  toAgentId: string,
  type: 'request' | 'response' | 'notification' | 'handoff',
  payload: any,
  correlationId?: string,
) {
  const { generateUUID } = await import('../utils');
  const message = {
    id: generateUUID(),
    fromAgentId,
    toAgentId,
    type,
    payload,
    timestamp: new Date(),
    correlationId,
  };
  agentMemory.addMessage(message);
  return message;
}

export async function waitForAgentResponse(
  toAgentId: string,
  correlationId: string,
  timeoutMs = 60000,
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const messages = agentMemory.getMessagesByCorrelation(correlationId);
    const response = messages.find(
      (m) =>
        m.toAgentId === toAgentId &&
        m.type === 'response' &&
        m.correlationId === correlationId,
    );
    if (response) return response.payload;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for response from ${toAgentId}`);
}
