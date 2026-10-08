// Base Agent System - Autonomous Financial Agents
// Agents can run independently, communicate with each other, and execute complex workflows

import { customModel } from '../ai';
import { getAllModels } from '../ai/models';
import { FinancialToolsManager, financialTools } from '../ai/tools/financial-tools';
import { generateUUID } from '../utils';

// ============================================
// TYPES
// ============================================

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  modelId: string;
  systemPrompt: string;
  tools?: string[]; // subset of financialTools
  maxSteps?: number;
}

export interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  type: 'request' | 'response' | 'notification' | 'handoff';
  payload: any;
  timestamp: Date;
  correlationId?: string; // for tracking multi-agent workflows
}

export interface AgentTask {
  id: string;
  agentId: string;
  type: string;
  input: any;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface AgentWorkflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowStep {
  id: string;
  agentId: string;
  taskType: string;
  input: any;
  dependsOn?: string[]; // step IDs this depends on
  output?: any;
}

// ============================================
// AGENT MEMORY (in-memory for now, can persist to DB)
// ============================================

class AgentMemory {
  private messages: AgentMessage[] = [];
  private tasks: Map<string, AgentTask> = new Map();
  private workflows: Map<string, AgentWorkflow> = new Map();
  private agentStates: Map<string, any> = new Map();

  // Messages
  addMessage(message: AgentMessage) {
    this.messages.push(message);
    // Keep last 1000 messages
    if (this.messages.length > 1000) {
      this.messages = this.messages.slice(-1000);
    }
  }

  getMessages(toAgentId?: string, fromAgentId?: string): AgentMessage[] {
    return this.messages.filter(m => 
      (!toAgentId || m.toAgentId === toAgentId) &&
      (!fromAgentId || m.fromAgentId === fromAgentId)
    );
  }

  getMessagesByCorrelation(correlationId: string): AgentMessage[] {
    return this.messages.filter(m => m.correlationId === correlationId);
  }

  // Tasks
  setTask(task: AgentTask) {
    this.tasks.set(task.id, task);
  }

  getTask(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  getTasksByAgent(agentId: string): AgentTask[] {
    return Array.from(this.tasks.values()).filter(t => t.agentId === agentId);
  }

  // Workflows
  setWorkflow(workflow: AgentWorkflow) {
    this.workflows.set(workflow.id, workflow);
  }

  getWorkflow(id: string): AgentWorkflow | undefined {
    return this.workflows.get(id);
  }

  getAllWorkflows(): AgentWorkflow[] {
    return Array.from(this.workflows.values());
  }

  // Agent State
  setAgentState(agentId: string, state: any) {
    this.agentStates.set(agentId, { ...this.agentStates.get(agentId), ...state, updatedAt: new Date() });
  }

  getAgentState(agentId: string): any {
    return this.agentStates.get(agentId);
  }
}

export const agentMemory = new AgentMemory();

// ============================================
// BASE AGENT CLASS
// ============================================

export abstract class BaseAgent {
  public readonly config: AgentConfig;
  protected toolsManager: FinancialToolsManager;

  constructor(config: AgentConfig, financialDatasetsApiKey: string) {
    this.config = config;
    this.toolsManager = new FinancialToolsManager({
      financialDatasetsApiKey,
      dataStream: null, // Not needed for background agents
    });
  }

  abstract execute(task: AgentTask): Promise<any>;

  protected async callLLM(messages: any[], tools?: any) {
    const model = getAllModels().find(m => m.id === this.config.modelId);
    if (!model) throw new Error(`Model ${this.config.modelId} not found`);

    const modelInstance = customModel(model.apiIdentifier, {
      apiKey: process.env.OPENAI_API_KEY || '',
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      name: process.env.OPENAI_PROVIDER_NAME || 'openai',
    });

    const { streamText } = await import('ai');
    const result = await streamText({
      model: modelInstance,
      tools: tools || this.toolsManager.getTools(),
      system: this.config.systemPrompt,
      messages,
      maxSteps: this.config.maxSteps || 10,
    });

    return result;
  }

  protected async sendMessage(toAgentId: string, type: AgentMessage['type'], payload: any, correlationId?: string) {
    const message: AgentMessage = {
      id: generateUUID(),
      fromAgentId: this.config.id,
      toAgentId,
      type,
      payload,
      timestamp: new Date(),
      correlationId,
    };
    agentMemory.addMessage(message);
    return message;
  }

  protected async waitForResponse(correlationId: string, timeoutMs = 60000): Promise<AgentMessage | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const messages = agentMemory.getMessagesByCorrelation(correlationId);
      const response = messages.find(m => 
        m.toAgentId === this.config.id && 
        m.type === 'response' &&
        m.correlationId === correlationId
      );
      if (response) return response;
      await new Promise(r => setTimeout(r, 500));
    }
    return null;
  }

  protected updateTaskStatus(taskId: string, status: AgentTask['status'], result?: any, error?: string) {
    const task = agentMemory.getTask(taskId);
    if (task) {
      task.status = status;
      if (result) task.result = result;
      if (error) task.error = error;
      if (status === 'running') task.startedAt = new Date();
      if (status === 'completed' || status === 'failed') task.completedAt = new Date();
      agentMemory.setTask(task);
    }
  }
}

// ============================================
// AGENT REGISTRY
// ============================================

const agentRegistry: Map<string, BaseAgent> = new Map();

export function registerAgent(agent: BaseAgent) {
  agentRegistry.set(agent.config.id, agent);
}

export function getAgent(id: string): BaseAgent | undefined {
  return agentRegistry.get(id);
}

export function getAllAgents(): BaseAgent[] {
  return Array.from(agentRegistry.values());
}

// ============================================
// AGENT ORCHESTRATOR
// ============================================

export class AgentOrchestrator {
  private financialDatasetsApiKey: string;

  constructor(financialDatasetsApiKey: string) {
    this.financialDatasetsApiKey = financialDatasetsApiKey;
  }

  async executeTask(agentId: string, taskType: string, input: any): Promise<any> {
    const agent = getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const task: AgentTask = {
      id: generateUUID(),
      agentId,
      type: taskType,
      input,
      status: 'pending',
      createdAt: new Date(),
    };
    agentMemory.setTask(task);

    try {
      task.status = 'running';
      task.startedAt = new Date();
      agentMemory.setTask(task);

      const result = await agent.execute(task);

      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date();
      agentMemory.setTask(task);

      return result;
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
      task.completedAt = new Date();
      agentMemory.setTask(task);
      throw error;
    }
  }

  async executeWorkflow(workflow: AgentWorkflow): Promise<any> {
    workflow.status = 'running';
    workflow.updatedAt = new Date();
    agentMemory.setWorkflow(workflow);

    const stepResults: Map<string, any> = new Map();

    try {
      // Execute steps in dependency order
      const completedSteps = new Set<string>();
      
      while (completedSteps.size < workflow.steps.length) {
        for (const step of workflow.steps) {
          if (completedSteps.has(step.id)) continue;
          
          // Check dependencies
          const depsMet = (step.dependsOn || []).every(dep => completedSteps.has(dep));
          if (!depsMet) continue;

          // Execute step
          const input = this.resolveInput(step.input, stepResults);
          const result = await this.executeTask(step.agentId, step.taskType, input);
          
          step.output = result;
          stepResults.set(step.id, result);
          completedSteps.add(step.id);
        }
      }

      workflow.status = 'completed';
      workflow.updatedAt = new Date();
      agentMemory.setWorkflow(workflow);

      return stepResults;
    } catch (error) {
      workflow.status = 'failed';
      workflow.updatedAt = new Date();
      agentMemory.setWorkflow(workflow);
      throw error;
    }
  }

  private resolveInput(input: any, stepResults: Map<string, any>): any {
    if (typeof input === 'string' && input.startsWith('{{') && input.endsWith('}}')) {
      const stepId = input.slice(2, -2).trim();
      return stepResults.get(stepId);
    }
    if (typeof input === 'object' && input !== null) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(input)) {
        resolved[key] = this.resolveInput(value, stepResults);
      }
      return resolved;
    }
    return input;
  }
}

// ============================================
// HELPER: Create agent config with model resolution
// ============================================

export function createAgentConfig(
  id: string,
  name: string,
  description: string,
  modelId: string,
  systemPrompt: string,
  tools?: string[],
  maxSteps = 10
): AgentConfig {
  return { id, name, description, modelId, systemPrompt, tools, maxSteps };
}