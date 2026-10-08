// Agent Dashboard Component - UI for managing autonomous agents

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { QuantitativeDashboard } from '@/components/quantitative-dashboard';
import {
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Brain,
  Search,
  FileText,
  Eye,
  Bell,
  Zap,
} from 'lucide-react';

interface AgentStatus {
  id: string;
  name: string;
  description: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  lastRun?: string;
  lastResult?: any;
}

interface WorkflowResult {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
  runId?: string;
}

interface PersistedAgentRun {
  id: string;
  workflowType: string;
  status: WorkflowResult['status'];
  input: unknown;
  result: unknown;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  steps?: Array<{ name: string; status: string; error: string | null }>;
}

interface ManagedPortfolio {
  id: string;
  name: string;
  currency: string;
  monitoringEnabled: boolean;
  monitoringFrequency: 'daily' | 'weekly' | 'monthly';
  monitoringTime: string;
  monitoringTimezone: string;
  monitoringDayOfWeek: number;
  monitoringDayOfMonth: number;
  holdings: Array<{ ticker: string; shares: number; costBasis: number | null }>;
}

async function loadAgentRuns(): Promise<PersistedAgentRun[]> {
  const response = await fetch('/api/agents/runs?limit=50', {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Agent run history is unavailable.');
  const body = await response.json();
  return body.runs;
}

export function AgentDashboard() {
  const [activeTab, setActiveTab] = useState<string>('workflows');
  const [isLoading, setIsLoading] = useState(false);
  const [workflowResults, setWorkflowResults] = useState<WorkflowResult[]>([]);
  const [persistedRuns, setPersistedRuns] = useState<PersistedAgentRun[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [managedPortfolios, setManagedPortfolios] = useState<
    ManagedPortfolio[]
  >([]);
  const [monitoringError, setMonitoringError] = useState<string | null>(null);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [updatingPortfolioId, setUpdatingPortfolioId] = useState<string | null>(
    null,
  );
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([
    {
      id: 'research-agent',
      name: 'Research Agent',
      description: 'Gathers financial data',
      status: 'idle',
    },
    {
      id: 'analysis-agent',
      name: 'Analysis Agent',
      description: 'Deep financial analysis',
      status: 'idle',
    },
    {
      id: 'screener-agent',
      name: 'Screener Agent',
      description: 'Finds investment opportunities',
      status: 'idle',
    },
    {
      id: 'monitor-agent',
      name: 'Monitor Agent',
      description: 'Watches positions for alerts',
      status: 'idle',
    },
    {
      id: 'report-agent',
      name: 'Report Agent',
      description: 'Generates investment reports',
      status: 'idle',
    },
  ]);

  // Form states
  const [analysisTicker, setAnalysisTicker] = useState('');
  const [analysisPeers, setAnalysisPeers] = useState('');
  const [debateTicker, setDebateTicker] = useState('');
  const [debateQuestion, setDebateQuestion] = useState(
    'Should I invest in this company?',
  );
  const [screenCriteria, setScreenCriteria] = useState(
    '{"roe": {"min": 15}, "peRatio": {"max": 20}, "debtToEquity": {"max": 0.5}}',
  );
  const [monitorPositions, setMonitorPositions] = useState(
    '[{"ticker": "AAPL", "costBasis": 150, "shares": 10}]',
  );

  useEffect(() => {
    if (activeTab !== 'workflows' && activeTab !== 'history') return;
    let active = true;
    const refresh = async () => {
      try {
        const runs = await loadAgentRuns();
        if (!active) return;
        setPersistedRuns(runs);
        setHistoryError(null);
        setWorkflowResults((current) =>
          current.map((workflow) => {
            const run = runs.find((item) => item.id === workflow.runId);
            return run
              ? {
                  ...workflow,
                  status: run.status,
                  completedAt: run.completedAt ?? undefined,
                  result: run.result,
                  error: run.error ?? undefined,
                }
              : workflow;
          }),
        );
      } catch (error) {
        if (active)
          setHistoryError(
            error instanceof Error
              ? error.message
              : 'Agent run history is unavailable.',
          );
      }
    };
    setIsHistoryLoading(true);
    void refresh().finally(() => {
      if (active) setIsHistoryLoading(false);
    });
    const interval = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'monitoring') return;
    let active = true;
    setMonitoringLoading(true);
    void fetch('/api/portfolio/manage', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Portfolio settings are unavailable.');
        return response.json();
      })
      .then((body) => {
        if (active) {
          setManagedPortfolios(body.portfolios);
          setMonitoringError(null);
        }
      })
      .catch((error) => {
        if (active)
          setMonitoringError(
            error instanceof Error
              ? error.message
              : 'Portfolio settings are unavailable.',
          );
      })
      .finally(() => {
        if (active) setMonitoringLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeTab]);

  const updatePortfolioMonitoring = async (
    portfolio: ManagedPortfolio,
    changes: Partial<ManagedPortfolio>,
  ) => {
    setUpdatingPortfolioId(portfolio.id);
    try {
      const response = await fetch(`/api/portfolio/${portfolio.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: portfolio.name,
          currency: portfolio.currency,
          monitoringEnabled: portfolio.monitoringEnabled,
          monitoringFrequency: portfolio.monitoringFrequency,
          monitoringTime: portfolio.monitoringTime,
          monitoringTimezone: portfolio.monitoringTimezone,
          monitoringDayOfWeek: portfolio.monitoringDayOfWeek,
          monitoringDayOfMonth: portfolio.monitoringDayOfMonth,
          holdings: portfolio.holdings,
          ...changes,
        }),
      });
      if (!response.ok)
        throw new Error('Could not update monitoring preference.');
      const updated = await response.json();
      setManagedPortfolios((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMonitoringError(null);
    } catch (error) {
      setMonitoringError(
        error instanceof Error
          ? error.message
          : 'Could not update monitoring preference.',
      );
    } finally {
      setUpdatingPortfolioId(null);
    }
  };

  const triggerWorkflow = async (workflowType: string, data: any) => {
    setIsLoading(true);
    const workflowId = `${workflowType}-${Date.now()}`;
    const newWorkflow: WorkflowResult = {
      id: workflowId,
      name: workflowType,
      status: 'pending',
      startedAt: new Date().toISOString(),
    };
    setWorkflowResults((prev) => [newWorkflow, ...prev]);

    try {
      setWorkflowResults((prev) =>
        prev.map((w) =>
          w.id === workflowId ? { ...w, status: 'running' } : w,
        ),
      );

      const response = await fetch('/api/agents/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ workflowType, data }),
      });

      const result = await response.json();
      const accepted = response.ok && result.success;
      const queued = response.status === 202;

      setWorkflowResults((prev) =>
        prev.map((w) =>
          w.id === workflowId
            ? {
                ...w,
                status: accepted
                  ? queued
                    ? result.status
                    : 'completed'
                  : 'failed',
                completedAt:
                  accepted && queued ? undefined : new Date().toISOString(),
                runId: queued ? result.runId : undefined,
                result: result.data,
                error: result.error,
              }
            : w,
        ),
      );
    } catch (error) {
      setWorkflowResults((prev) =>
        prev.map((w) =>
          w.id === workflowId
            ? {
                ...w,
                status: 'failed',
                completedAt: new Date().toISOString(),
                error: error instanceof Error ? error.message : 'Unknown error',
              }
            : w,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalysis = () => {
    if (!analysisTicker) return;
    const peers = analysisPeers
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    triggerWorkflow('analysis', {
      ticker: analysisTicker.toUpperCase(),
      peers,
    });
  };

  const handleDebate = () => {
    if (!debateTicker) return;
    triggerWorkflow('debate', {
      ticker: debateTicker.toUpperCase(),
      question: debateQuestion,
    });
  };

  const handleScreening = () => {
    try {
      const criteria = JSON.parse(screenCriteria);
      triggerWorkflow('screening', { criteria });
    } catch {
      alert('Invalid JSON criteria');
    }
  };

  const handleMonitoring = () => {
    try {
      const positions = JSON.parse(monitorPositions);
      triggerWorkflow('monitoring', { positions });
    } catch {
      alert('Invalid JSON positions');
    }
  };

  const getStatusIcon = (status: WorkflowResult['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <RefreshCw className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getAgentStatusIcon = (status: AgentStatus['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Brain className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Dashboard</h1>
          <p className="text-muted-foreground">
            Autonomous financial agents running in the background
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Zap className="w-3 h-3" />
          Powered by Inngest
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="workflows">
            <Play className="w-4 h-4 mr-2" /> Workflows
          </TabsTrigger>
          <TabsTrigger value="agents">
            <Brain className="w-4 h-4 mr-2" /> Agents
          </TabsTrigger>
          <TabsTrigger value="quantitative">
            <Brain className="mr-2 size-4" />
            Quantitative
          </TabsTrigger>
          <TabsTrigger value="monitoring">
            <Bell className="w-4 h-4 mr-2" /> Monitoring
          </TabsTrigger>
          <TabsTrigger value="history">
            <FileText className="w-4 h-4 mr-2" /> History
          </TabsTrigger>
        </TabsList>

        {/* WORKFLOWS TAB */}
        <TabsContent value="workflows" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Analysis Workflow */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5" />
                  Full Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Research + Analysis + Report
                </p>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Ticker</Label>
                    <Input
                      value={analysisTicker}
                      onChange={(e) => setAnalysisTicker(e.target.value)}
                      placeholder="AAPL"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Peers (comma-separated)</Label>
                    <Input
                      value={analysisPeers}
                      onChange={(e) => setAnalysisPeers(e.target.value)}
                      placeholder="MSFT, GOOGL, AMZN"
                      className="text-sm"
                    />
                  </div>
                  <Button
                    onClick={handleAnalysis}
                    disabled={isLoading || !analysisTicker}
                    className="w-full"
                  >
                    <Play className="w-4 h-4 mr-2" /> Run Analysis
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Debate Workflow */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Bull vs Bear Debate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Multi-agent debate with synthesis
                </p>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Ticker</Label>
                    <Input
                      value={debateTicker}
                      onChange={(e) => setDebateTicker(e.target.value)}
                      placeholder="AAPL"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Question</Label>
                    <Input
                      value={debateQuestion}
                      onChange={(e) => setDebateQuestion(e.target.value)}
                      placeholder="Should I invest?"
                      className="text-sm"
                    />
                  </div>
                  <Button
                    onClick={handleDebate}
                    disabled={isLoading || !debateTicker}
                    className="w-full"
                  >
                    <Play className="w-4 h-4 mr-2" /> Start Debate
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Screening Workflow */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Stock Screening
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Find stocks matching criteria
                </p>
                <div className="space-y-2">
                  <Textarea
                    value={screenCriteria}
                    onChange={(e) => setScreenCriteria(e.target.value)}
                    placeholder='{"roe": {"min": 15}, "peRatio": {"max": 20}}'
                    className="text-xs font-mono h-24"
                  />
                  <Button
                    onClick={handleScreening}
                    disabled={isLoading}
                    className="w-full"
                  >
                    <Play className="w-4 h-4 mr-2" /> Run Screen
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Monitoring Workflow */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Portfolio Monitor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Check positions for alerts
                </p>
                <div className="space-y-2">
                  <Textarea
                    value={monitorPositions}
                    onChange={(e) => setMonitorPositions(e.target.value)}
                    placeholder='[{"ticker": "AAPL", "costBasis": 150, "shares": 10}]'
                    className="text-xs font-mono h-24"
                  />
                  <Button
                    onClick={handleMonitoring}
                    disabled={isLoading}
                    className="w-full"
                  >
                    <Play className="w-4 h-4 mr-2" /> Check Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Workflow Results */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Workflow Runs</CardTitle>
            </CardHeader>
            <CardContent>
              {workflowResults.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No workflows run yet
                </p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {workflowResults.map((workflow) => (
                    <div
                      key={workflow.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(workflow.status)}
                        <div>
                          <p className="font-medium">{workflow.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(workflow.startedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            workflow.status === 'completed'
                              ? 'default'
                              : workflow.status === 'failed'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {workflow.status}
                        </Badge>
                        {workflow.status === 'completed' && workflow.result && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              alert(JSON.stringify(workflow.result, null, 2))
                            }
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quantitative">
          <QuantitativeDashboard />
        </TabsContent>

        {/* AGENTS TAB */}
        <TabsContent value="agents" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agentStatuses.map((agent) => (
              <Card key={agent.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {getAgentStatusIcon(agent.status)}
                      {agent.name}
                    </CardTitle>
                    <Badge
                      variant={
                        agent.status === 'running'
                          ? 'default'
                          : agent.status === 'completed'
                            ? 'success'
                            : agent.status === 'failed'
                              ? 'destructive'
                              : 'outline'
                      }
                    >
                      {agent.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {agent.description}
                  </p>
                  {agent.lastRun && (
                    <p className="text-xs text-muted-foreground">
                      Last run: {new Date(agent.lastRun).toLocaleString()}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <RefreshCw className="w-4 h-4 mr-1" /> Test Run
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* MONITORING TAB */}
        <TabsContent value="monitoring" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Scheduled Monitoring
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Monitoring Consent</h4>
                <p className="mb-3 text-sm text-muted-foreground">
                  Choose when each portfolio is checked. Monitoring remains off
                  until enabled; run times use the selected IANA timezone.
                </p>
                {monitoringError ? (
                  <p role="alert" className="mb-3 text-sm text-destructive">
                    {monitoringError}
                  </p>
                ) : null}
                {monitoringLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Loading portfolios...
                  </p>
                ) : null}
                {!monitoringLoading &&
                managedPortfolios.length === 0 &&
                !monitoringError ? (
                  <p className="text-sm text-muted-foreground">
                    No portfolios available.
                  </p>
                ) : null}
                <div className="divide-y">
                  {managedPortfolios.map((portfolio) => (
                    <div
                      key={portfolio.id}
                      className="grid gap-3 py-4 md:grid-cols-[minmax(10rem,1fr)_repeat(3,minmax(8rem,auto))] md:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {portfolio.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {portfolio.holdings.length} holdings ·{' '}
                          {portfolio.currency}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={portfolio.monitoringEnabled}
                          disabled={
                            updatingPortfolioId === portfolio.id ||
                            portfolio.holdings.length === 0
                          }
                          onChange={(event) =>
                            void updatePortfolioMonitoring(portfolio, {
                              monitoringEnabled: event.target.checked,
                            })
                          }
                          aria-label={`Enable scheduled monitoring for ${portfolio.name}`}
                        />
                        Monitor
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Repeats</span>
                        <select
                          className="h-9 rounded-md border bg-background px-2"
                          value={portfolio.monitoringFrequency}
                          disabled={updatingPortfolioId === portfolio.id}
                          onChange={(event) =>
                            void updatePortfolioMonitoring(portfolio, {
                              monitoringFrequency: event.target
                                .value as ManagedPortfolio['monitoringFrequency'],
                            })
                          }
                          aria-label={`Monitoring frequency for ${portfolio.name}`}
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        {portfolio.monitoringFrequency === 'weekly' ? (
                          <label className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Day</span>
                            <select
                              className="h-9 rounded-md border bg-background px-2"
                              value={portfolio.monitoringDayOfWeek}
                              disabled={updatingPortfolioId === portfolio.id}
                              onChange={(event) =>
                                void updatePortfolioMonitoring(portfolio, {
                                  monitoringDayOfWeek: Number(
                                    event.target.value,
                                  ),
                                })
                              }
                              aria-label={`Monitoring weekday for ${portfolio.name}`}
                            >
                              <option value={1}>Monday</option>
                              <option value={2}>Tuesday</option>
                              <option value={3}>Wednesday</option>
                              <option value={4}>Thursday</option>
                              <option value={5}>Friday</option>
                              <option value={6}>Saturday</option>
                              <option value={0}>Sunday</option>
                            </select>
                          </label>
                        ) : null}
                        {portfolio.monitoringFrequency === 'monthly' ? (
                          <label className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Day</span>
                            <input
                              type="number"
                              min={1}
                              max={28}
                              className="h-9 w-16 rounded-md border bg-background px-2"
                              value={portfolio.monitoringDayOfMonth}
                              disabled={updatingPortfolioId === portfolio.id}
                              onChange={(event) =>
                                void updatePortfolioMonitoring(portfolio, {
                                  monitoringDayOfMonth: Number(
                                    event.target.value,
                                  ),
                                })
                              }
                              aria-label={`Monitoring day of month for ${portfolio.name}`}
                            />
                          </label>
                        ) : null}
                        <label className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">At</span>
                          <input
                            type="time"
                            step={900}
                            className="h-9 rounded-md border bg-background px-2"
                            value={portfolio.monitoringTime}
                            disabled={updatingPortfolioId === portfolio.id}
                            onChange={(event) =>
                              void updatePortfolioMonitoring(portfolio, {
                                monitoringTime: event.target.value,
                              })
                            }
                            aria-label={`Monitoring time for ${portfolio.name}`}
                          />
                        </label>
                      </div>
                      <label className="flex items-center gap-2 text-sm md:col-start-2 md:col-span-3">
                        <span className="text-muted-foreground">Timezone</span>
                        <input
                          type="text"
                          maxLength={64}
                          className="h-9 min-w-0 rounded-md border bg-background px-2"
                          value={portfolio.monitoringTimezone}
                          disabled={updatingPortfolioId === portfolio.id}
                          onChange={(event) =>
                            setManagedPortfolios((current) =>
                              current.map((item) =>
                                item.id === portfolio.id
                                  ? {
                                      ...item,
                                      monitoringTimezone: event.target.value,
                                    }
                                  : item,
                              ),
                            )
                          }
                          onBlur={() =>
                            void updatePortfolioMonitoring(portfolio, {
                              monitoringTimezone: portfolio.monitoringTimezone,
                            })
                          }
                          aria-label={`IANA timezone for ${portfolio.name}`}
                          placeholder="America/New_York"
                        />
                        {updatingPortfolioId === portfolio.id ? (
                          <span className="text-xs text-muted-foreground">
                            Saving...
                          </span>
                        ) : null}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Schedule Limits</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Daily Screening</span>
                    <Badge variant="default">5PM Mon-Fri (after market)</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Portfolio schedules use a 15-minute dispatcher. Exchange
                    holidays and market sessions are not applied.
                  </p>
                </div>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Configure Alerts</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Set up custom monitoring rules for your portfolio
                </p>
                <Button variant="outline">Configure Alert Rules</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Execution History</CardTitle>
                <Button
                  variant="outline"
                  size="icon"
                  title="Refresh history"
                  onClick={() => {
                    setIsHistoryLoading(true);
                    void loadAgentRuns()
                      .then(setPersistedRuns)
                      .catch((error) => {
                        setHistoryError(
                          error instanceof Error
                            ? error.message
                            : 'Agent run history is unavailable.',
                        );
                      })
                      .finally(() => setIsHistoryLoading(false));
                  }}
                  disabled={isHistoryLoading}
                >
                  <RefreshCw
                    className={`size-4 ${isHistoryLoading ? 'animate-spin' : ''}`}
                  />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {historyError ? (
                <p role="alert" className="text-sm text-destructive">
                  {historyError}
                </p>
              ) : null}
              {!historyError && persistedRuns.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {isHistoryLoading
                    ? 'Loading run history...'
                    : 'No durable screening runs yet'}
                </p>
              ) : null}
              <div className="space-y-3 max-h-[32rem] overflow-y-auto">
                {persistedRuns.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-start justify-between gap-4 border-b py-3 last:border-0"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      {getStatusIcon(run.status)}
                      <div className="min-w-0">
                        <p className="font-medium capitalize">
                          {run.workflowType}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(run.createdAt).toLocaleString()} · expires{' '}
                          {new Date(run.expiresAt).toLocaleDateString()}
                        </p>
                        {run.error ? (
                          <p className="mt-1 text-xs text-destructive">
                            {run.error}
                          </p>
                        ) : null}
                        {run.steps?.map((step) => (
                          <p
                            key={step.name}
                            className="text-xs text-muted-foreground"
                          >
                            {step.name}: {step.status}
                            {step.error ? ` · ${step.error}` : ''}
                          </p>
                        ))}
                        {run.result ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-muted-foreground">
                              View result
                            </summary>
                            <pre className="mt-2 max-h-64 overflow-auto rounded border bg-muted/40 p-3 text-xs">
                              {JSON.stringify(run.result, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                    </div>
                    <Badge
                      variant={
                        run.status === 'completed'
                          ? 'default'
                          : run.status === 'failed'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {run.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
