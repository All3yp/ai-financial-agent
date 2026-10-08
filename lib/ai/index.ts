import { createOpenAI } from '@ai-sdk/openai';
import { experimental_wrapLanguageModel as wrapLanguageModel } from 'ai';

import { customMiddleware } from './custom-middleware';

export interface ModelProviderConfig {
  apiKey: string;
  baseURL?: string;
  name?: string;
}

export const customModel = (apiIdentifier: string, config: ModelProviderConfig) => {
  const provider = createOpenAI({ 
    apiKey: config.apiKey, 
    baseURL: config.baseURL,
    name: config.name,
    compatibility: 'strict' 
  });
  return wrapLanguageModel({
    model: provider.chat(apiIdentifier),
    middleware: customMiddleware,
  });
};
