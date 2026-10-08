// Agent Trigger API - Triggers agent workflows from UI
// POST /api/agents/trigger

import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { initializeAgents } from '@/lib/agents';
import {
  requestAnalysis,
  requestDebate,
  requestScreening,
  requestMonitoring,
} from '@/lib/agents/client';

const FINANCIAL_DATASETS_API_KEY = process.env.FINANCIAL_DATASETS_API_KEY || '';
const agents = initializeAgents(FINANCIAL_DATASETS_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workflowType, data } = await request.json();

    switch (workflowType) {
      case 'analysis': {
        const { ticker, peers = [] } = data;
        if (!ticker) {
          return NextResponse.json(
            { error: 'Ticker required' },
            { status: 400 },
          );
        }

        // Trigger via Inngest for background execution
        await requestAnalysis(ticker, peers, session.user.id);

        // Also run synchronously for immediate feedback
        const researchData = await agents.research.execute({
          id: `research-${ticker}-${Date.now()}`,
          agentId: 'research-agent',
          type: 'research',
          input: { ticker, period: 'quarterly', limit: 20 },
          status: 'pending',
          createdAt: new Date(),
        });

        const analysis = await agents.analysis.execute({
          id: `analysis-${ticker}-${Date.now()}`,
          agentId: 'analysis-agent',
          type: 'analysis',
          input: { researchData, peers },
          status: 'pending',
          createdAt: new Date(),
        });

        const report = await agents.report.execute({
          id: `report-${ticker}-${Date.now()}`,
          agentId: 'report-agent',
          type: 'report',
          input: {
            type: 'company',
            data: { research: researchData, analysis, peers: {} },
            template: 'company',
          },
          status: 'pending',
          createdAt: new Date(),
        });

        return NextResponse.json({
          success: true,
          data: {
            research: researchData,
            analysis,
            report: report.report,
          },
        });
      }

      case 'debate': {
        const { ticker, question } = data;
        if (!ticker) {
          return NextResponse.json(
            { error: 'Ticker required' },
            { status: 400 },
          );
        }

        await requestDebate(ticker, question, session.user.id);

        // Run synchronously
        const researchData = await agents.research.execute({
          id: `research-${ticker}-${Date.now()}`,
          agentId: 'research-agent',
          type: 'research',
          input: { ticker, period: 'quarterly', limit: 20 },
          status: 'pending',
          createdAt: new Date(),
        });

        // Run bull and bear analysis in parallel
        const { AnalysisAgent } = await import('@/lib/agents/specialized');
        const bullAgent = new AnalysisAgent(FINANCIAL_DATASETS_API_KEY);
        const bearAgent = new AnalysisAgent(FINANCIAL_DATASETS_API_KEY);

        const [bullCase, bearCase] = await Promise.all([
          bullAgent.execute({
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
          }),
          bearAgent.execute({
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
          }),
        ]);

        // Synthesis
        const { streamText } = await import('ai');
        const { customModel } = await import('@/lib/ai');
        const { getAllModels } = await import('@/lib/ai/models');

        const model = getAllModels().find(
          (m) => m.id === 'thinkingmachines/inkling:free',
        );
        if (!model) {
          throw new Error('Synthesis model is not configured');
        }
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

        const report = await agents.report.execute({
          id: `report-${ticker}-${Date.now()}`,
          agentId: 'report-agent',
          type: 'report',
          input: {
            type: 'debate',
            data: { synthesis: fullText, bullCase, bearCase, researchData },
            template: 'debate',
          },
          status: 'pending',
          createdAt: new Date(),
        });

        return NextResponse.json({
          success: true,
          data: {
            synthesis: fullText,
            bullCase,
            bearCase,
            research: researchData,
            report: report.report,
          },
        });
      }

      case 'screening': {
        const { criteria } = data;
        if (!criteria) {
          return NextResponse.json(
            { error: 'Criteria required' },
            { status: 400 },
          );
        }

        await requestScreening(criteria, session.user.id);

        const result = await agents.screener.execute({
          id: `screen-${Date.now()}`,
          agentId: 'screener-agent',
          type: 'screen',
          input: { criteria, limit: 50 },
          status: 'pending',
          createdAt: new Date(),
        });

        return NextResponse.json({ success: true, data: result });
      }

      case 'monitoring': {
        const { positions } = data;
        if (!positions || !Array.isArray(positions)) {
          return NextResponse.json(
            { error: 'Positions array required' },
            { status: 400 },
          );
        }

        await requestMonitoring(positions, session.user.id);

        const result = await agents.monitor.execute({
          id: `monitor-${Date.now()}`,
          agentId: 'monitor-agent',
          type: 'monitor',
          input: { positions },
          status: 'pending',
          createdAt: new Date(),
        });

        return NextResponse.json({ success: true, data: result });
      }

      default:
        return NextResponse.json(
          { error: 'Unknown workflow type' },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error('Agent trigger error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
