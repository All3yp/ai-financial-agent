import { z } from 'zod';

export const financialDataProviderSchema = z.enum([
  'auto', 'fmp', 'alpha-vantage', 'twelve-data', 'financial-datasets',
]);

export const financialDataConfigSchema = z.object({
  provider: financialDataProviderSchema.default('auto'),
  apiKeys: z.object({
    fmp: z.string().max(512).optional(),
    'alpha-vantage': z.string().max(512).optional(),
    'twelve-data': z.string().max(512).optional(),
    'financial-datasets': z.string().max(512).optional(),
  }).default({}),
});

export type FinancialDataConfig = z.infer<typeof financialDataConfigSchema>;
export type FinancialDataProvider = Exclude<FinancialDataConfig['provider'], 'auto'>;

export function resolveFinancialDataConfig(
  config?: FinancialDataConfig,
  legacyKey?: string,
  environment: Partial<NodeJS.ProcessEnv> = process.env,
): FinancialDataConfig {
  const financialDatasetsKey = config?.apiKeys['financial-datasets']?.trim()
    || legacyKey?.trim()
    || environment.FINANCIAL_DATASETS_API_KEY?.trim();
  return financialDataConfigSchema.parse({
    provider: config?.provider ?? environment.FINANCIAL_DATA_PROVIDER
      ?? (financialDatasetsKey ? 'financial-datasets' : 'auto'),
    apiKeys: {
      fmp: environment.FMP_API_KEY,
      'alpha-vantage': environment.ALPHA_VANTAGE_API_KEY,
      'twelve-data': environment.TWELVE_DATA_API_KEY,
      'financial-datasets': legacyKey || environment.FINANCIAL_DATASETS_API_KEY,
      ...Object.fromEntries(Object.entries(config?.apiKeys ?? {}).filter(([, value]) => value?.trim())),
    },
  });
}

export function hasFinancialDataCredentials(config: FinancialDataConfig): boolean {
  return config.provider === 'auto'
    ? Object.values(config.apiKeys).some((key) => Boolean(key?.trim()))
    : Boolean(config.apiKeys[config.provider]?.trim());
}