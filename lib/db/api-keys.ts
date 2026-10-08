import { getLocalStorage, setLocalStorage } from "../utils";

export interface ModelProviderConfig {
  apiKey: string;
  baseURL?: string;
  name?: string;
}

export const getOpenAIApiKey = () => {
  // Only check env variable on server side
  if (typeof window === 'undefined') {
    return process.env.OPENAI_API_KEY;
  }
  
  // Check localStorage on client side
  const apiKey = getLocalStorage('openaiApiKey');
  return apiKey || process.env.OPENAI_API_KEY;
};

export const getOpenAIBaseURL = () => {
  if (typeof window === 'undefined') {
    return process.env.OPENAI_BASE_URL;
  }
  const baseURL = getLocalStorage('openaiBaseURL');
  return baseURL || process.env.OPENAI_BASE_URL;
};

export const getOpenAIProviderName = () => {
  if (typeof window === 'undefined') {
    return process.env.OPENAI_PROVIDER_NAME;
  }
  const name = getLocalStorage('openaiProviderName');
  return name || process.env.OPENAI_PROVIDER_NAME;
};

export const getOpenAIConfig = (): ModelProviderConfig => {
  return {
    apiKey: getOpenAIApiKey() || '',
    baseURL: getOpenAIBaseURL() || undefined,
    name: getOpenAIProviderName() || undefined,
  };
};

export const setOpenAIApiKey = async (apiKey: string) => {
  if (typeof window === 'undefined') return;
  setLocalStorage('openaiApiKey', apiKey);
};

export const setOpenAIBaseURL = async (baseURL: string) => {
  if (typeof window === 'undefined') return;
  setLocalStorage('openaiBaseURL', baseURL);
};

export const setOpenAIProviderName = async (name: string) => {
  if (typeof window === 'undefined') return;
  setLocalStorage('openaiProviderName', name);
};

export const setOpenAIConfig = async (config: ModelProviderConfig) => {
  if (typeof window === 'undefined') return;
  await Promise.all([
    setOpenAIApiKey(config.apiKey),
    config.baseURL ? setOpenAIBaseURL(config.baseURL) : Promise.resolve(),
    config.name ? setOpenAIProviderName(config.name) : Promise.resolve(),
  ]);
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