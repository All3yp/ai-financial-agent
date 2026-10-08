// Agent Dashboard Component - UI for managing autonomous agents

'use client';

import { useState, } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
  Zap
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
}

export function AgentDashboard() {
  const [activeTab, setActiveTab] = useState<string>('workflows');
  const [isLoading, setIsLoading] = useState(false);
  const [workflowResults, setWorkflowResults] = useState<WorkflowResult[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([
    { id: 'research-agent', name: 'Research Agent', description: 'Gathers financial data', status: 'idle' },
    { id: 'analysis-agent', name: 'Analysis Agent', description: 'Deep financial analysis', status: 'idle' },
    { id: 'screener-agent', name: 'Screener Agent', description: 'Finds investment opportunities', status: 'idle' },
    { id: 'monitor-agent', name: 'Monitor Agent', description: 'Watches positions for alerts', status: 'idle' },
    { id: 'report-agent', name: 'Report Agent', description: 'Generates investment reports', status: 'idle' },
  ]);

  // Form states
  const [analysisTicker, setAnalysisTicker] = useState('');
  const [analysisPeers, setAnalysisPeers] = useState('');
  const [debateTicker, setDebateTicker] = useState('');
  const [debateQuestion, setDebateQuestion] = useState('Should I invest in this company?');
  const [screenCriteria, setScreenCriteria] = useState('{"roe": {"min": 15}, "peRatio": {"max": 20}, "debtToEquity": {"max": 0.5}}');
  const [monitorPositions, setMonitorPositions] = useState('[{"ticker": "AAPL", "costBasis": 150, "shares": 10}]');

  const triggerWorkflow = async (workflowType: string, data: any) => {
    setIsLoading(true);
    const workflowId = `${workflowType}-${Date.now()}`;
    const newWorkflow: WorkflowResult = {
      id: workflowId,
      name: workflowType,
      status: 'pending',
      startedAt: new Date().toISOString(),
    };
    setWorkflowResults(prev => [newWorkflow, ...prev]);

    try {
      setWorkflowResults(prev => prev.map(w => w.id === workflowId ? { ...w, status: 'running' } : w));
      
      const response = await fetch('/api/agents/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowType, data }),
      });

      const result = await response.json();
      
      setWorkflowResults(prev => prev.map(w => 
        w.id === workflowId ? { 
          ...w, 
          status: result.success ? 'completed' : 'failed',
          completedAt: new Date().toISOString(),
          result: result.data,
          error: result.error,
        } : w
      ));
    } catch (error) {
      setWorkflowResults(prev => prev.map(w => 
        w.id === workflowId ? { 
          ...w, 
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        } : w
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalysis = () => {
    if (!analysisTicker) return;
    const peers = analysisPeers.split(',').map(p => p.trim()).filter(Boolean);
    triggerWorkflow('analysis', { ticker: analysisTicker.toUpperCase(), peers });
  };

  const handleDebate = () => {
    if (!debateTicker) return;
    triggerWorkflow('debate', { ticker: debateTicker.toUpperCase(), question: debateQuestion });
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
      case 'running': return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <RefreshCw className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getAgentStatusIcon = (status: AgentStatus['status']) => {
    switch (status) {
      case 'running': return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Brain className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Dashboard</h1>
          <p className="text-muted-foreground">Autonomous financial agents running in the background</p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Zap className="w-3 h-3" />
          Powered by Inngest
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="workflows">
            <Play className="w-4 h-4 mr-2" /> Workflows
          </TabsTrigger>
          <TabsTrigger value="agents">
            <Brain className="w-4 h-4 mr-2" /> Agents
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
                <p className="text-sm text-muted-foreground">Research + Analysis + Report</p>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Ticker</Label>
                    <Input 
                      value={analysisTicker} 
                      onChange={e => setAnalysisTicker(e.target.value)}
                      placeholder="AAPL"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Peers (comma-separated)</Label>
                    <Input 
                      value={analysisPeers} 
                      onChange={e => setAnalysisPeers(e.target.value)}
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
                <p className="text-sm text-muted-foreground">Multi-agent debate with synthesis</p>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Ticker</Label>
                    <Input 
                      value={debateTicker} 
                      onChange={e => setDebateTicker(e.target.value)}
                      placeholder="AAPL"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Question</Label>
                    <Input 
                      value={debateQuestion} 
                      onChange={e => setDebateQuestion(e.target.value)}
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
                <p className="text-sm text-muted-foreground">Find stocks matching criteria</p>
                <div className="space-y-2">
                  <Textarea 
                    value={screenCriteria} 
                    onChange={e => setScreenCriteria(e.target.value)}
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
                <p className="text-sm text-muted-foreground">Check positions for alerts</p>
                <div className="space-y-2">
                  <Textarea 
                    value={monitorPositions} 
                    onChange={e => setMonitorPositions(e.target.value)}
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
                <p className="text-muted-foreground text-center py-8">No workflows run yet</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {workflowResults.map(workflow => (
                    <div key={workflow.id} className="flex items-center justify-between p-3 border rounded-lg">
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
                        <Badge variant={workflow.status === 'completed' ? 'default' : workflow.status === 'failed' ? 'destructive' : 'secondary'}>
                          {workflow.status}
                        </Badge>
                        {workflow.status === 'completed' && workflow.result && (
                          <Button variant="ghost" size="icon" onClick={() => alert(JSON.stringify(workflow.result, null, 2))}>
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

        {/* AGENTS TAB */}
        <TabsContent value="agents" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agentStatuses.map(agent => (
              <Card key={agent.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {getAgentStatusIcon(agent.status)}
                      {agent.name}
                    </CardTitle>
                    <Badge variant={agent.status === 'running' ? 'default' : agent.status === 'completed' ? 'success' : agent.status === 'failed' ? 'destructive' : 'outline'}>
                      {agent.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{agent.description}</p>
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
                <h4 className="font-medium mb-2">Active Schedules</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Portfolio Monitoring</span>
                    <Badge variant="default">Every hour (9AM-4PM, Mon-Fri)</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Daily Screening</span>
                    <Badge variant="default">5PM Mon-Fri (after market)</Badge>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Configure Alerts</h4>
                <p className="text-sm text-muted-foreground mb-4">Set up custom monitoring rules for your portfolio</p>
                <Button variant="outline">Configure Alert Rules</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Execution History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">
                History will appear here after running workflows
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}