// Model Catalog - Centralized model definitions
// This file contains all built-in model definitions organized by provider
// Users can extend this by adding custom models via the UI (API Keys Modal)

// ============================================
// MODEL INTERFACE
// ============================================

export interface Model {
  id: string;
  label: string;
  apiIdentifier: string;
  description: string;
  isCustom?: boolean;
  providerId?: string; // Optional: associate model with a specific provider
  // Categorization for easier selection
  category?: 'reasoning' | 'general' | 'lightweight' | 'coding' | 'analysis' | 'embedding' | 'audio' | 'specialized';
  // Recommended use cases
  recommendedFor?: string[];
  // Context window (in tokens)
  contextWindow?: number;
  // Whether model is expiring soon
  expiringSoon?: boolean;
  expiryDate?: string;
  endpointType?: 'chat' | 'decision';
}

// ============================================
// PROVIDER MODEL REGISTRY
// ============================================
// Add new providers here by creating a new entry in the registry
// Each provider can have its own set of built-in models

export interface ProviderModels {
  providerId: string;
  providerName: string;
  models: Model[];
  // If true, these models are only available when this provider is explicitly selected
  // If false (default), models are available globally
  providerSpecific?: boolean;
}

// ============================================
// OPENROUTER FREE TIER MODELS - ORGANIZED BY CAPABILITY
// ============================================

// REASONING MODELS - Best for complex analysis, planning, decision making
export const reasoningModels: Model[] = [
  {
    id: 'apodex/apodex-1.1-mini:free',
    label: 'Apodex 1.1 Mini',
    apiIdentifier: 'apodex/apodex-1.1-mini:free',
    description: 'Reasoning-first model for complex, long-horizon research and forecasting. Works with files, data, code, tools. 262K context.',
    providerId: 'default',
    category: 'reasoning',
    recommendedFor: ['research', 'forecasting', 'long-horizon-analysis', 'agentic-workflows', 'evidence-grounded-answers'],
    contextWindow: 262000,
  },
  {
    id: 'inception/mercury-decide:free',
    label: 'Mercury Decide',
    apiIdentifier: 'inception/mercury-decide:free',
    description: 'Structured decision model (System One). Returns choices/scores/yes-no with calibrated probabilities. Up to 14 decisions/sec. 33K context.',
    providerId: 'default',
    category: 'reasoning',
    recommendedFor: ['decision-making', 'structured-output', 'high-throughput-decisions', 'escalation-systems'],
    contextWindow: 33000,
  },
  {
    id: 'liquid/lfm-2.5-2.6b:free',
    label: 'LFM2.5-2.6B',
    apiIdentifier: 'liquid/lfm-2.5-2.6b:free',
    description: 'Compact reasoning model from Liquid AI. Suited for agent workflows, data extraction, RAG, long-context. NOT for agentic coding or knowledge-heavy tasks. 66K context.',
    providerId: 'default',
    category: 'reasoning',
    recommendedFor: ['agent-workflows', 'data-extraction', 'rag', 'long-context-processing'],
    contextWindow: 66000,
  },
];

// CODING MODELS - Specialized for software engineering, agentic coding
export const codingModels: Model[] = [
  {
    id: 'poolside/laguna-s-2.1:free',
    label: 'Laguna S 2.1',
    apiIdentifier: 'poolside/laguna-s-2.1:free',
    description: 'Strongest coding agent model (70.2% Terminal-Bench, 40.4% DeepSWE). 118B total/8B active params. 262K context. EXPIRES Oct 31, 2026.',
    providerId: 'default',
    category: 'coding',
    recommendedFor: ['software-engineering', 'agentic-coding', 'terminal-tasks', 'code-generation'],
    contextWindow: 262000,
    expiringSoon: true,
    expiryDate: '2026-10-31',
  },
  {
    id: 'poolside/laguna-xs-2.1:free',
    label: 'Laguna XS 2.1',
    apiIdentifier: 'poolside/laguna-xs-2.1:free',
    description: 'Compact coding agent (33B-A3B category). Tool calling + reasoning, 256K context, 32K output. FP8 quantized. EXPIRES Oct 31, 2026.',
    providerId: 'default',
    category: 'coding',
    recommendedFor: ['software-engineering', 'agentic-coding', 'tool-calling', 'fast-inference'],
    contextWindow: 256000,
    expiringSoon: true,
    expiryDate: '2026-10-31',
  },
  {
    id: 'cohere/north-mini-code:free',
    label: 'North Mini Code',
    apiIdentifier: 'cohere/north-mini-code:free',
    description: 'Cohere\'s agentic coding model (MoE 30B total/3B active). Code generation, agentic SE, terminal tasks. 256K context, 64K output. Apache 2.0.',
    providerId: 'default',
    category: 'coding',
    recommendedFor: ['code-generation', 'agentic-software-engineering', 'terminal-tasks', 'local-inference'],
    contextWindow: 256000,
  },
  {
    id: 'dots-studio/dots-3-note-preview:free',
    label: 'Dots3-Note Preview',
    apiIdentifier: 'dots-studio/dots-3-note-preview:free',
    description: 'MoE 16B active/280B total. Reasoning, coding, multimodal, long-context, multi-step agent workflows. 512K context. EXPIRES Dec 31, 2026.',
    providerId: 'default',
    category: 'coding',
    recommendedFor: ['coding', 'multimodal', 'long-context', 'multi-step-agents', 'reasoning'],
    contextWindow: 512000,
    expiringSoon: true,
    expiryDate: '2026-12-31',
  },
];

// GENERAL PURPOSE MODELS - Good balance of capability and speed
export const generalModels: Model[] = [
  {
    id: 'thinkingmachines/inkling:free',
    label: 'Inkling',
    apiIdentifier: 'thinkingmachines/inkling:free',
    description: 'Multimodal MoE (41B active/975B total). General-purpose reasoning, coding, agentic, tool-use, RAG, multimodal (image/audio). 1.05M context. SEO #43.',
    providerId: 'default',
    category: 'general',
    recommendedFor: ['general-reasoning', 'coding', 'agentic-workflows', 'multimodal', 'rag', 'instruction-following'],
    contextWindow: 1050000,
  },
  {
    id: 'thinkingmachines/inkling-small:free',
    label: 'Inkling Small',
    apiIdentifier: 'thinkingmachines/inkling-small:free',
    description: 'Smaller multimodal MoE (12B active/276B total). Reasoning, coding, agentic, RAG, multilingual. 1.05M context.',
    providerId: 'default',
    category: 'general',
    recommendedFor: ['general-reasoning', 'coding', 'agentic-workflows', 'multilingual', 'efficient-inference'],
    contextWindow: 1050000,
  },
  {
    id: 'meta-llama/llama-3.1-70b-instruct:free',
    label: 'Llama 3.1 70B',
    apiIdentifier: 'meta-llama/llama-3.1-70b-instruct:free',
    description: 'Most capable free model - strong reasoning, coding, and analysis.',
    providerId: 'default',
    category: 'general',
    recommendedFor: ['analysis', 'report-generation', 'complex-tasks', 'coding'],
  },
  {
    id: 'google/gemini-flash-1.5:free',
    label: 'Gemini 1.5 Flash',
    apiIdentifier: 'google/gemini-flash-1.5:free',
    description: 'Fast, 1M context window - excellent for large documents.',
    providerId: 'default',
    category: 'general',
    recommendedFor: ['long-context', 'document-analysis', 'report-generation'],
    contextWindow: 1000000,
  },
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    label: 'Nemotron 3.5 Lightning',
    apiIdentifier: 'nvidia/nemotron-3.5-lightning:free',
    description: 'MoE (3B active/30B total). High-throughput agentic workloads, domain-specific customization. 1M context. Programming #44.',
    providerId: 'default',
    category: 'general',
    recommendedFor: ['agentic-workflows', 'high-throughput', 'domain-customization', 'programming'],
    contextWindow: 1000000,
  },
  {
    id: 'meta-llama/llama-3.1-8b-instruct:free',
    label: 'Llama 3.1 8B',
    apiIdentifier: 'meta-llama/llama-3.1-8b-instruct:free',
    description: 'Fast and efficient - good for general tasks.',
    providerId: 'default',
    category: 'general',
    recommendedFor: ['general-chat', 'quick-tasks', 'data-extraction'],
  },
  {
    id: 'google/gemma-2-9b-it:free',
    label: 'Gemma 2 9B',
    apiIdentifier: 'google/gemma-2-9b-it:free',
    description: 'Strong open model from Google - good reasoning.',
    providerId: 'default',
    category: 'general',
    recommendedFor: ['analysis', 'reasoning', 'general-tasks'],
  },
  {
    id: 'mistralai/mistral-7b-instruct:free',
    label: 'Mistral 7B',
    apiIdentifier: 'mistralai/mistral-7b-instruct:free',
    description: 'Popular efficient model - good all-rounder.',
    providerId: 'default',
    category: 'general',
    recommendedFor: ['general-chat', 'coding', 'analysis'],
  },
  {
    id: 'qwen/qwen-2.5-7b-instruct:free',
    label: 'Qwen 2.5 7B',
    apiIdentifier: 'qwen/qwen-2.5-7b-instruct:free',
    description: 'Strong multilingual model from Alibaba.',
    providerId: 'default',
    category: 'general',
    recommendedFor: ['multilingual', 'general-tasks', 'coding'],
  },
];

// ANALYSIS MODELS - Specialized for specific analysis domains
export const analysisModels: Model[] = [
  {
    id: 'inclusionai/ling-3.0-flash-sante:free',
    label: 'Ling 3.0 Flash Sante',
    apiIdentifier: 'inclusionai/ling-3.0-flash-sante:free',
    description: 'Health/medicine-focused MoE (5.1B active/124B total). Medical knowledge reasoning, clinical safety, evidence-based retrieval, long-horizon medical tasks. 262K context. SEO #26.',
    providerId: 'default',
    category: 'analysis',
    recommendedFor: ['medical-analysis', 'clinical-reasoning', 'healthcare', 'evidence-based-retrieval'],
    contextWindow: 262000,
  },
];

// LIGHTWEIGHT MODELS - Only for very simple tasks (classification, extraction, etc.)
export const lightweightModels: Model[] = [
  {
    id: 'microsoft/phi-3-mini-128k-instruct:free',
    label: 'Phi-3 Mini 128K',
    apiIdentifier: 'microsoft/phi-3-mini-128k-instruct:free',
    description: 'Lightweight with 128K context - only for simple extraction/classification.',
    providerId: 'default',
    category: 'lightweight',
    recommendedFor: ['simple-extraction', 'classification', 'formatting', 'summarization'],
    contextWindow: 128000,
  },
  {
    id: 'meta-llama/llama-3.2-3b-instruct:free',
    label: 'Llama 3.2 3B',
    apiIdentifier: 'meta-llama/llama-3.2-3b-instruct:free',
    description: 'Ultra-lightweight - ONLY for trivial tasks (formatting, simple extraction).',
    providerId: 'default',
    category: 'lightweight',
    recommendedFor: ['formatting', 'simple-extraction', 'trivial-tasks'],
  },
  {
    id: 'respan/span-01-lite:free',
    label: 'Span-01 Lite',
    apiIdentifier: 'respan/span-01-lite:free',
    description: 'Behavior scoring model - returns probability of defined behaviors in conversation spans. High-volume evaluation/monitoring.',
    providerId: 'default',
    category: 'lightweight',
    recommendedFor: ['behavior-scoring', 'conversation-monitoring', 'high-volume-evaluation'],
  },
];

// EMBEDDING MODELS - For retrieval and semantic search (not for chat/completion)
export const embeddingModels: Model[] = [
  {
    id: 'liquid/lfm-2.5-embedding-350m:free',
    label: 'LFM2.5-Embedding-350M',
    apiIdentifier: 'liquid/lfm-2.5-embedding-350m:free',
    description: 'Text embedding model from Liquid AI. 1,024-dimensional embeddings for retrieval and semantic search. 512 context.',
    providerId: 'default',
    category: 'embedding',
    recommendedFor: ['embeddings', 'retrieval', 'semantic-search', 'rag'],
    contextWindow: 512,
  },
  {
    id: 'nvidia/nemotron-3-embed-1b:free',
    label: 'Nemotron 3 Embed 1B',
    apiIdentifier: 'nvidia/nemotron-3-embed-1b:free',
    description: 'NVIDIA text embedding model. High-throughput, low-latency retrieval. >95% of 8B model accuracy. 33K context.',
    providerId: 'default',
    category: 'embedding',
    recommendedFor: ['embeddings', 'enterprise-search', 'rag', 'code-retrieval', 'agentic-retrieval'],
    contextWindow: 33000,
  },
];

// AUDIO MODELS - For speech synthesis (not for chat/completion)
export const audioModels: Model[] = [
  {
    id: 'fish-audio/s2.1-pro-free:free',
    label: 'S2.1 Pro Free',
    apiIdentifier: 'fish-audio/s2.1-pro-free:free',
    description: 'Fish Audio speech synthesis model. For testing, prototyping, low-volume applications. No production latency guarantees.',
    providerId: 'default',
    category: 'audio',
    recommendedFor: ['speech-synthesis', 'prototyping', 'testing'],
  },
];

// All free models combined (reasoning + coding + general + analysis + lightweight + embedding + audio)
export const openRouterFreeModels: Model[] = [
  ...reasoningModels,
  ...codingModels,
  ...generalModels,
  ...analysisModels,
  ...lightweightModels,
  ...embeddingModels,
  ...audioModels,
];

// ============================================
// PROVIDER REGISTRY
// ============================================
// Register all providers here. This makes it easy to add new providers.

export const providerModelRegistry: ProviderModels[] = [
  {
    providerId: 'default',
    providerName: 'OpenRouter (Free Tier)',
    models: [...openRouterFreeModels],
    providerSpecific: false, // Available globally
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

// Get all built-in models from all registered providers
export const getAllBuiltInModels = (): Model[] => {
  return providerModelRegistry.flatMap(p => p.models);
};

// Get models for a specific provider
export const getModelsForProvider = (providerId: string): Model[] => {
  const provider = providerModelRegistry.find(p => p.providerId === providerId);
  return provider?.models || [];
};

// Get models by category
export const getModelsByCategory = (category: Model['category']): Model[] => {
  return openRouterFreeModels.filter(m => m.category === category);
};

// Get non-embedding/audio models (for chat/completion)
export const isChatModel = (model: Model): boolean =>
  model.endpointType !== 'decision' &&
  model.category !== 'embedding' &&
  model.category !== 'audio';

export const filterChatModels = (models: Model[]): Model[] =>
  models.filter(isChatModel);

export const getChatModels = (): Model[] =>
  filterChatModels(openRouterFreeModels);

// Get non-expiring models
export const getNonExpiringModels = (): Model[] => {
  return openRouterFreeModels.filter(m => !m.expiringSoon);
};

// Get the default model (best reasoning model)
export const getDefaultModel = (): string => {
  return reasoningModels[0]?.id || 'apodex/apodex-1.1-mini:free';
};

// Get the best model for a specific use case
export const getBestModelFor = (useCase: string): Model | undefined => {
  return openRouterFreeModels.find(m => m.recommendedFor?.includes(useCase));
};

// Get best model for a category (non-expiring preferred)
export const getBestModelForCategory = (category: Model['category']): Model | undefined => {
  const models = getModelsByCategory(category).filter(m => !m.expiringSoon);
  return models[0];
};

// Check if a model ID is a built-in model
export const isBuiltInModel = (modelId: string): boolean => {
  return getAllBuiltInModels().some(m => m.id === modelId);
};

// Get provider ID for a built-in model
export const getProviderForModel = (modelId: string): string | undefined => {
  for (const provider of providerModelRegistry) {
    if (provider.models.some(m => m.id === modelId)) {
      return provider.providerId;
    }
  }
  return undefined;
};