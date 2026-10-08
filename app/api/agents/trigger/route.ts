// Agent Trigger API - Triggers agent workflows from UI
// POST /api/agents/trigger

import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import {
  requestAnalysis,
  requestDebate,
  requestMonitoring,
  requestScreening,
} from '@/lib/agents/client';
import { readAgentRunRequest, submitAgentRun } from '@/lib/agents/run-http';
import type { AgentWorkflowType } from '@/lib/agents/run-store';
import { agentRunStore } from '@/lib/db/agent-runs';

async function enqueueWorkflow(
  workflowType: AgentWorkflowType,
  input: Record<string, unknown>,
  userId: string,
  runId: string,
): Promise<void> {
  switch (workflowType) {
    case 'analysis':
      return requestAnalysis(
        input.ticker as string,
        input.peers as string[],
        userId,
        runId,
      );
    case 'debate':
      return requestDebate(
        input.ticker as string,
        input.question as string,
        userId,
        runId,
      );
    case 'screening':
      return requestScreening(
        input.criteria as Record<string, unknown>,
        userId,
        runId,
      );
    case 'monitoring':
      return requestMonitoring(input.positions as unknown[], userId, runId);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await readAgentRunRequest(request);
    if ('response' in parsed) return parsed.response;
    const body = parsed.value;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Invalid workflow request.' },
        { status: 400 },
      );
    }
    const { workflowType, data } = body as {
      workflowType?: unknown;
      data?: unknown;
    };
    if (
      typeof workflowType !== 'string' ||
      !['analysis', 'debate', 'screening', 'monitoring'].includes(workflowType)
    ) {
      return NextResponse.json(
        { error: 'Unknown workflow type' },
        { status: 400 },
      );
    }

    const idempotencyKey = request.headers.get('Idempotency-Key') ?? '';
    return await submitAgentRun(
      session.user.id,
      workflowType as AgentWorkflowType,
      data,
      idempotencyKey,
      agentRunStore,
      enqueueWorkflow,
    );
  } catch {
    return NextResponse.json(
      { error: 'Unable to submit agent workflow.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
