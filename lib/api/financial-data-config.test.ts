import assert from 'node:assert/strict';
import test from 'node:test';
import { hasFinancialDataCredentials, resolveFinancialDataConfig } from './financial-data-config';

test('Financial Datasets remains the default when its credentials are configured', () => {
  for (const config of [
    resolveFinancialDataConfig(undefined, 'legacy', { FMP_API_KEY: 'fmp' }),
    resolveFinancialDataConfig(undefined, undefined, { FINANCIAL_DATASETS_API_KEY: 'fd', FMP_API_KEY: 'fmp' }),
  ]) {
    assert.equal(config.provider, 'financial-datasets');
    assert.equal(hasFinancialDataCredentials(config), true);
  }
});

test('explicit provider selection overrides the Financial Datasets default', () => {
  const environment = { FINANCIAL_DATASETS_API_KEY: 'fd', FMP_API_KEY: 'fmp' };
  assert.equal(resolveFinancialDataConfig({ provider: 'auto', apiKeys: {} }, undefined, environment).provider, 'auto');
  assert.equal(resolveFinancialDataConfig(undefined, undefined, { ...environment, FINANCIAL_DATA_PROVIDER: 'fmp' }).provider, 'fmp');
});

test('alternative credentials do not require Financial Datasets', () => {
  const config = resolveFinancialDataConfig(undefined, undefined, { FMP_API_KEY: 'test' });
  assert.equal(config.provider, 'auto');
  assert.equal(hasFinancialDataCredentials(config), true);
  assert.equal(config.apiKeys['financial-datasets'], undefined);
});

test('explicit provider requires its own credentials', () => {
  const config = resolveFinancialDataConfig({ provider: 'twelve-data', apiKeys: { fmp: 'test' } }, undefined, {});
  assert.equal(hasFinancialDataCredentials(config), false);
});

test('request keys override environment without erasing keys with blanks', () => {
  const config = resolveFinancialDataConfig({ provider: 'auto', apiKeys: { fmp: '', 'alpha-vantage': 'request' } }, 'legacy', { FMP_API_KEY: 'server' });
  assert.equal(config.apiKeys.fmp, 'server');
  assert.equal(config.apiKeys['alpha-vantage'], 'request');
  assert.equal(config.apiKeys['financial-datasets'], 'legacy');
});

test('unknown provider is rejected', () => {
  assert.throws(() => resolveFinancialDataConfig(undefined, undefined, { FINANCIAL_DATA_PROVIDER: 'invalid' }));
});