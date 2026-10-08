// Model definitions and management
// Built-in models are defined in model-catalog.ts for better organization
// Custom models are stored in localStorage and managed via the UI

import { Model } from './model-catalog';
import {
  getAllBuiltInModels,
  getModelsForProvider as getCatalogModelsForProvider,
  getDefaultModel,
  isBuiltInModel,
  getProviderForModel,
} from './model-catalog';
import { getProviderById } from '@/lib/db/api-keys';

// Re-export Model interface and catalog functions
export type { Model };
export {
  getAllBuiltInModels,
  getCatalogModelsForProvider,
  getDefaultModel,
  isBuiltInModel,
  getProviderForModel,
};

// Default model name (from catalog)
export const DEFAULT_MODEL_NAME: string = getDefaultModel();

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

// Get all models (built-in + custom), optionally filtered by provider
export const getAllModels = (providerId?: string): Model[] => {
  const customModels = getCustomModels();
  const builtInModels = getAllBuiltInModels();
  const allModels = [...builtInModels, ...customModels];
  
  if (providerId) {
    return allModels.filter(m => !m.providerId || m.providerId === providerId);
  }
  
  return allModels;
};

// Get models for a specific provider (includes custom models + provider filtering)
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
