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

// OpenAI / OpenRouter compatible models (default provider)
export const openaiModels: Model[] = [
  {
    id: 'gpt-4.1-nano-2025-04-14',
    label: 'GPT 4.1 nano',
    apiIdentifier: 'gpt-4.1-nano-2025-04-14',
    description: 'Fastest, most cost-effective GPT-4.1 model',
    providerId: 'default',
  },
  {
    id: 'gpt-4.1-mini-2025-04-14',
    label: 'GPT 4.1 mini',
    apiIdentifier: 'gpt-4.1-mini-2025-04-14',
    description: 'Balance between intelligence, speed, and cost',
    providerId: 'default',
  },
  {
    id: 'gpt-4.1-2025-04-14',
    label: 'GPT 4.1',
    apiIdentifier: 'gpt-4.1-2025-04-14',
    description: 'Flagship model for complex tasks',
    providerId: 'default',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    apiIdentifier: 'gpt-4o',
    description: 'Omni-purpose model for complex tasks',
    providerId: 'default',
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    apiIdentifier: 'gpt-4o-mini',
    description: 'Small, fast, cost-effective model',
    providerId: 'default',
  },
  {
    id: 'o1-preview',
    label: 'o1 Preview',
    apiIdentifier: 'o1-preview',
    description: 'Reasoning model for complex problems',
    providerId: 'default',
  },
  {
    id: 'o1-mini',
    label: 'o1 Mini',
    apiIdentifier: 'o1-mini',
    description: 'Faster, cheaper reasoning model',
    providerId: 'default',
  },
];

// OpenRouter Free Tier Models
export const openRouterFreeModels: Model[] = [
  {
    id: 'meta-llama/llama-3.1-70b-instruct:free',
    label: 'Llama 3.1 70B (Free)',
    apiIdentifier: 'meta-llama/llama-3.1-70b-instruct:free',
    description: 'Meta Llama 3.1 70B - More capable free model',
    providerId: 'default',
  },
  {
    id: 'microsoft/phi-3-mini-128k-instruct:free',
    label: 'Phi-3 Mini 128K (Free)',
    apiIdentifier: 'microsoft/phi-3-mini-128k-instruct:free',
    description: 'Microsoft Phi-3 Mini - 128K context free model',
    providerId: 'default',
  },
  {
    id: 'google/gemini-flash-1.5:free',
    label: 'Gemini 1.5 Flash (Free)',
    apiIdentifier: 'google/gemini-flash-1.5:free',
    description: 'Google Gemini 1.5 Flash - Fast, 1M context free tier',
    providerId: 'default',
  },
];

// Anthropic Models (for future provider support)
export const anthropicModels: Model[] = [
  {
    id: 'claude-3-5-sonnet-20241022',
    label: 'Claude 3.5 Sonnet',
    apiIdentifier: 'claude-3-5-sonnet-20241022',
    description: 'Most capable Claude model',
    providerId: 'anthropic',
  },
  {
    id: 'claude-3-5-haiku-20241022',
    label: 'Claude 3.5 Haiku',
    apiIdentifier: 'claude-3-5-haiku-20241022',
    description: 'Fast, cost-effective Claude model',
    providerId: 'anthropic',
  },
  {
    id: 'claude-3-opus-20240229',
    label: 'Claude 3 Opus',
    apiIdentifier: 'claude-3-opus-20240229',
    description: 'Most powerful Claude 3 model',
    providerId: 'anthropic',
  },
];

// Google Models (for future provider support)
export const googleModels: Model[] = [
  {
    id: 'gemini-1.5-pro',
    label: 'Gemini 1.5 Pro',
    apiIdentifier: 'gemini-1.5-pro',
    description: 'Google\'s most capable model, 2M context',
    providerId: 'google',
  },
  {
    id: 'gemini-1.5-flash',
    label: 'Gemini 1.5 Flash',
    apiIdentifier: 'gemini-1.5-flash',
    description: 'Fast, efficient model with 1M context',
    providerId: 'google',
  },
];

// ============================================
// PROVIDER REGISTRY
// ============================================
// Register all providers here. This makes it easy to add new providers.

export const providerModelRegistry: ProviderModels[] = [
  {
    providerId: 'default',
    providerName: 'OpenAI / OpenRouter',
    models: [...openaiModels, ...openRouterFreeModels],
    providerSpecific: false, // Available globally
  },
  // Future providers can be added here:
  // {
  //   providerId: 'anthropic',
  //   providerName: 'Anthropic',
  //   models: anthropicModels,
  //   providerSpecific: true,
  // },
  // {
  //   providerId: 'google',
  //   providerName: 'Google',
  //   models: googleModels,
  //   providerSpecific: true,
  // },
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

// Get the default model (first free model, or first available)
export const getDefaultModel = (): string => {
  // Prefer a free model as default
  const freeModel = openRouterFreeModels[0];
  return freeModel?.id || openaiModels[0]?.id || 'gpt-4o';
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