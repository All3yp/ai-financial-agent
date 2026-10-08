import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'dotenv';
import { configureLocalEnvironment } from './setup-env.mjs';

function fixture(context) {
  const directory = mkdtempSync(join(tmpdir(), 'financial-setup-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, '.env');
}

test('setup derives SEC identity from Git and is idempotent', async (context) => {
  const envPath = fixture(context);
  await configureLocalEnvironment({ envPath, environment: {}, gitEmail: 'dev@company.test' });
  const first = readFileSync(envPath, 'utf8');
  const values = parse(first);
  assert.equal(values.SEC_USER_AGENT, 'AI-Financial-Agent dev@company.test');
  assert.ok(values.AUTH_SECRET.length >= 32);
  await configureLocalEnvironment({ envPath, environment: {}, gitEmail: 'other@company.test' });
  assert.equal(readFileSync(envPath, 'utf8'), first);
});

test('existing secrets, comments, provider selection and SEC identity are preserved', async (context) => {
  const envPath = fixture(context);
  const original = '# Keep this\nAUTH_SECRET="existing-secret"\nOPENAI_API_KEY="existing-key"\nFINANCIAL_DATA_PROVIDER=fmp\nSEC_USER_AGENT="ExistingApp owner@company.test"\n';
  writeFileSync(envPath, original);
  await configureLocalEnvironment({ envPath, environment: { SEC_USER_AGENT: 'OtherApp other@company.test' } });
  const content = readFileSync(envPath, 'utf8');
  assert.ok(content.startsWith(original));
  assert.equal(parse(content).AUTH_SECRET, 'existing-secret');
  assert.equal(parse(content).SEC_USER_AGENT, 'ExistingApp owner@company.test');
  assert.equal(parse(content).FINANCIAL_DATA_PROVIDER, 'fmp');
});

test('environment contact takes priority over Git and blank SEC values are filled', async (context) => {
  const envPath = fixture(context);
  writeFileSync(envPath, 'SEC_USER_AGENT=\nAUTH_SECRET=\n');
  await configureLocalEnvironment({ envPath, environment: { SEC_CONTACT_EMAIL: 'owner@company.test' }, gitEmail: 'dev@company.test' });
  const values = parse(readFileSync(envPath, 'utf8'));
  assert.equal(values.SEC_USER_AGENT, 'AI-Financial-Agent owner@company.test');
  assert.ok(values.AUTH_SECRET);
});

test('missing or noreply Git contact prompts without inventing identity', async (context) => {
  const envPath = fixture(context);
  let prompts = 0;
  await configureLocalEnvironment({ envPath, environment: {}, gitEmail: '123+dev@users.noreply.github.com', prompt: async () => {
    prompts += 1;
    return 'owner@company.test';
  } });
  assert.equal(prompts, 1);
  assert.equal(parse(readFileSync(envPath, 'utf8')).SEC_USER_AGENT, 'AI-Financial-Agent owner@company.test');
});

test('invalid identity and unattended missing contact do not modify the file', async (context) => {
  for (const environment of [{}, { SEC_USER_AGENT: 'App owner@company.test\nBAD=1' }, { SEC_USER_AGENT: 'App owner@example.org' }]) {
    const envPath = fixture(context);
    await assert.rejects(configureLocalEnvironment({ envPath, environment }));
    assert.equal(existsSync(envPath), false);
  }
});