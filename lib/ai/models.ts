// Define your models here.

export interface Model {
  id: string;
  label: string;
  apiIdentifier: string;
  description: string;
  isCustom?: boolean;
  providerId?: string; // Optional: associate model with a specific provider
}

export const models: Array<Model> = [
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
] as const;

export const DEFAULT_MODEL_NAME: string = 'gpt-4o';

// Custom models storage key
const CUSTOM_MODELS_KEY = 'customModels';

export const getCustomModels = (): Model[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(CUSTOM_MODELS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const setCustomModels = (customModels: Model[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(customModels));
};

export const addCustomModel = (model: Model) => {
  const customModels = getCustomModels();
  const exists = customModels.find(m => m.id === model.id);
  if (!exists) {
    setCustomModels([...customModels, { ...model, isCustom: true }]);
  }
};

export const removeCustomModel = (modelId: string) => {
  const customModels = getCustomModels();
  setCustomModels(customModels.filter(m => m.id !== modelId));
};

export const getAllModels = (providerId?: string): Model[] => {
  const customModels = getCustomModels();
  const allModels = [...models, ...customModels];
  
  if (providerId) {
    return allModels.filter(m => !m.providerId || m.providerId === providerId);
  }
  
  return allModels;
};

import { getProviderById } from '@/lib/db/api-keys';

export const getModelsForProvider = (providerId: string): Model[] => {
  const allModels = getAllModels(providerId);
  const provider = getProviderById(providerId);
  
  // If provider has enabledModelIds configured, filter to only those models
  if (provider?.enabledModelIds && provider.enabledModelIds.length > 0) {
    return allModels.filter(model => provider.enabledModelIds!.includes(model.id));
  }
  
  // Otherwise return all models for this provider
  return allModels;
};
