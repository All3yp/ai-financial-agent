import { getLocalStorage, setLocalStorage } from "../utils";

export interface ModelProviderConfig {
  id: string;
  name: string;
  apiKey: string;
  baseURL?: string;
  isDefault?: boolean;
  enabledModelIds?: string[]; // Optional: list of model IDs enabled for this provider
}

const PROVIDERS_STORAGE_KEY = 'modelProviders';
const DEFAULT_PROVIDER_ID_KEY = 'defaultModelProviderId';

// Default provider configuration (from environment variables)
const getDefaultProviderConfig = (): ModelProviderConfig => {
  const apiKey = typeof window === 'undefined' 
    ? process.env.OPENAI_API_KEY 
    : getLocalStorage('openaiApiKey') || process.env.OPENAI_API_KEY;
  
  const baseURL = typeof window === 'undefined' 
    ? process.env.OPENAI_BASE_URL 
    : getLocalStorage('openaiBaseURL') || process.env.OPENAI_BASE_URL;
  
  const name = typeof window === 'undefined' 
    ? process.env.OPENAI_PROVIDER_NAME 
    : getLocalStorage('openaiProviderName') || process.env.OPENAI_PROVIDER_NAME;

  return {
    id: 'default',
    name: name || 'OpenAI',
    apiKey: apiKey || '',
    baseURL: baseURL || undefined,
    isDefault: true,
  };
};

// Get all providers from localStorage
export const getProviders = (): ModelProviderConfig[] => {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(PROVIDERS_STORAGE_KEY);
    const providers = stored ? JSON.parse(stored) : [];
    
    // Always include default provider from env if it has an API key
    const defaultProvider = getDefaultProviderConfig();
    if (defaultProvider.apiKey) {
      const hasDefault = providers.some((p: ModelProviderConfig) => p.id === 'default');
      if (!hasDefault) {
        return [defaultProvider, ...providers];
      }
      // Update default provider with latest env values
      return providers.map((p: ModelProviderConfig) => 
        p.id === 'default' ? { ...defaultProvider, ...p } : p
      );
    }
    
    return providers;
  } catch {
    return [];
  }
};

// Save all providers to localStorage
export const setProviders = (providers: ModelProviderConfig[]) => {
  if (typeof window === 'undefined') return;
  // Don't save the default provider (it comes from env)
  const toSave = providers.filter(p => p.id !== 'default');
  localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(toSave));
};

// Get default provider ID
export const getDefaultProviderId = (): string => {
  if (typeof window === 'undefined') return 'default';
  return localStorage.getItem(DEFAULT_PROVIDER_ID_KEY) || 'default';
};

// Set default provider ID
export const setDefaultProviderId = (providerId: string) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEFAULT_PROVIDER_ID_KEY, providerId);
};

// Get default provider
export const getDefaultProvider = (): ModelProviderConfig | undefined => {
  const providers = getProviders();
  const defaultId = getDefaultProviderId();
  return providers.find(p => p.id === defaultId) || providers[0];
};

// Get provider by ID
export const getProviderById = (id: string): ModelProviderConfig | undefined => {
  const providers = getProviders();
  return providers.find(p => p.id === id);
};

// Add a new provider
export const addProvider = (provider: Omit<ModelProviderConfig, 'id'> & { id?: string }): ModelProviderConfig => {
  const providers = getProviders();
  const newProvider: ModelProviderConfig = {
    ...provider,
    id: provider.id || `provider_${Date.now()}`,
    isDefault: false,
  };
  setProviders([...providers, newProvider]);
  return newProvider;
};

// Update a provider
export const updateProvider = (id: string, updates: Partial<ModelProviderConfig>) => {
  const providers = getProviders();
  const index = providers.findIndex(p => p.id === id);
  if (index !== -1) {
    providers[index] = { ...providers[index], ...updates };
    setProviders(providers);
  }
};

// Remove a provider
export const removeProvider = (id: string) => {
  if (id === 'default') return; // Can't remove default provider
  const providers = getProviders();
  const filtered = providers.filter(p => p.id !== id);
  setProviders(filtered);
  
  // If we removed the default, set a new default
  const defaultId = getDefaultProviderId();
  if (defaultId === id) {
    const newDefault = filtered[0];
    if (newDefault) {
      setDefaultProviderId(newDefault.id);
    }
  }
};

// Set a provider as default
export const setProviderAsDefault = (id: string) => {
  const provider = getProviderById(id);
  if (provider) {
    setDefaultProviderId(id);
  }
};

// Legacy functions for backward compatibility
export const getOpenAIApiKey = () => {
  const provider = getDefaultProvider();
  return provider?.apiKey || '';
};

export const getOpenAIBaseURL = () => {
  const provider = getDefaultProvider();
  return provider?.baseURL || '';
};

export const getOpenAIProviderName = () => {
  const provider = getDefaultProvider();
  return provider?.name || 'OpenAI';
};

export const getOpenAIConfig = (): ModelProviderConfig => {
  const provider = getDefaultProvider();
  return provider || getDefaultProviderConfig();
};

export const setOpenAIApiKey = async (apiKey: string) => {
  if (typeof window === 'undefined') return;
  const providers = getProviders();
  const defaultProvider = providers.find(p => p.id === 'default');
  if (defaultProvider) {
    updateProvider('default', { apiKey });
  } else {
    // Create default provider from env
    const config = getDefaultProviderConfig();
    config.apiKey = apiKey;
    setProviders([config]);
  }
};

export const setOpenAIBaseURL = async (baseURL: string) => {
  if (typeof window === 'undefined') return;
  updateProvider('default', { baseURL });
};

export const setOpenAIProviderName = async (name: string) => {
  if (typeof window === 'undefined') return;
  updateProvider('default', { name });
};

export const setOpenAIConfig = async (config: ModelProviderConfig) => {
  if (typeof window === 'undefined') return;
  updateProvider('default', config);
};

export const getLocalOpenAIApiKey = () => {
  if (typeof window === 'undefined') return null;
  return getLocalStorage('openaiApiKey');
};

export const getLocalOpenAIBaseURL = () => {
  if (typeof window === 'undefined') return null;
  return getLocalStorage('openaiBaseURL');
};

export const getLocalOpenAIProviderName = () => {
  if (typeof window === 'undefined') return null;
  return getLocalStorage('openaiProviderName');
};

export const getFinancialDatasetsApiKey = () => {
  const envApiKey = process.env.FINANCIAL_DATASETS_API_KEY;
  if (envApiKey) return envApiKey;

  // Check localStorage on client side
  const apiKey = getLocalStorage('financialDatasetsApiKey');
  return apiKey || process.env.FINANCIAL_DATASETS_API_KEY;
};

export const setFinancialDatasetsApiKey = async (apiKey: string) => {
  if (typeof window === 'undefined') return;
  setLocalStorage('financialDatasetsApiKey', apiKey);
};