// Inngest API Route - Handles background agent functions
// Accessible at /api/inngest

import { inngest } from '@/lib/agents/client';
import {
  scheduledMonitoring,
  dailyScreening,
  runAnalysisWorkflow,
  runDebateWorkflow,
  runMonitoringWorkflow,
  runReportWorkflow,
  runScreeningWorkflow,
} from '@/lib/agents/inngest';
import { serve } from 'inngest/next';

// Create the Inngest serve handler with all functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    scheduledMonitoring,
    dailyScreening,
    runAnalysisWorkflow,
    runDebateWorkflow,
    runScreeningWorkflow,
    runMonitoringWorkflow,
    runReportWorkflow,
  ],
});
