// Inngest Client - Serverless background job platform
// Handles agent scheduling, workflows, and async execution

import { Inngest } from 'inngest';

// Create Inngest client
export const inngest = new Inngest({
  id: 'ai-financial-agent',
  name: 'AI Financial Agent',
  // Event key for production (get from https://app.inngest.com)
  eventKey: process.env.INNGEST_EVENT_KEY,
  // Signing key for verifying webhooks
  signingKey: process.env.INNGEST_SIGNING_KEY,
});

// Helper to send events to Inngest
export async function sendEvent(name: string, data: any) {
  await inngest.send({ name, data });
}

// Event names for type safety
export const AgentEvents = {
  ANALYSIS_REQUESTED: 'agent/analysis.requested',
  DEBATE_REQUESTED: 'agent/debate.requested',
  SCREENING_REQUESTED: 'agent/screening.requested',
  MONITORING_REQUESTED: 'agent/monitoring.requested',
  REPORT_REQUESTED: 'agent/report.requested',
} as const;

// Type-safe event sending
export async function requestAnalysis(
  ticker: string,
  peers?: string[],
  userId?: string,
) {
  await sendEvent(AgentEvents.ANALYSIS_REQUESTED, { ticker, peers, userId });
}

export async function requestDebate(
  ticker: string,
  question: string,
  userId?: string,
) {
  await sendEvent(AgentEvents.DEBATE_REQUESTED, { ticker, question, userId });
}

export async function requestScreening(
  criteria: any,
  userId?: string,
  runId?: string,
) {
  await sendEvent(AgentEvents.SCREENING_REQUESTED, { criteria, userId, runId });
}

export async function requestMonitoring(positions: any[], userId?: string) {
  await sendEvent(AgentEvents.MONITORING_REQUESTED, { positions, userId });
}

export async function requestReport(type: string, data: any, userId?: string) {
  await sendEvent(AgentEvents.REPORT_REQUESTED, { type, data, userId });
}
