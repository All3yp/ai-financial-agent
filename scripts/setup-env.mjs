import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { parse } from 'dotenv';

function validEmail(email) {
  return /^[A-Za-z0-9.!%+_-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)
    && !/@(?:users\.)?noreply\.github\.com$/i.test(email)
    && !/@example\.(?:com|org|net)$/i.test(email);
}

function validUserAgent(value) {
  const parts = value?.trim().split(/\s+/) ?? [];
  return value?.length <= 256 && !/[\r\n"\\]/.test(value)
    && parts.length >= 2 && validEmail(parts.at(-1));
}

export async function configureLocalEnvironment({
  envPath, environment = process.env, gitEmail = '', prompt,
}) {
  const original = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const existing = parse(original);
  let userAgent = existing.SEC_USER_AGENT || environment.SEC_USER_AGENT;
  if (userAgent && !validUserAgent(userAgent)) {
    throw new Error('SEC_USER_AGENT must contain an application name and a real contact email');
  }
  if (!userAgent) {
    let email = environment.SEC_CONTACT_EMAIL || gitEmail;
    if (!validEmail(email)) {
      if (!prompt) throw new Error('Set SEC_CONTACT_EMAIL or SEC_USER_AGENT before running noninteractive setup');
      email = (await prompt('Contact email for SEC access: ')).trim();
    }
    if (!validEmail(email)) throw new Error('A valid contact email is required for SEC access');
    userAgent = `AI-Financial-Agent ${email}`;
  }

  const defaults = {
    AUTH_SECRET: environment.AUTH_SECRET || randomBytes(32).toString('base64'),
    OPENAI_API_KEY: environment.OPENAI_API_KEY || '',
    OPENAI_BASE_URL: environment.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1',
    OPENAI_PROVIDER_NAME: environment.OPENAI_PROVIDER_NAME || 'openrouter',
    POSTGRES_URL: environment.POSTGRES_URL || 'postgres://postgres:postgres@localhost:5432/ai_financial_agent',
    FINANCIAL_DATASETS_API_KEY: environment.FINANCIAL_DATASETS_API_KEY || '',
    FMP_API_KEY: environment.FMP_API_KEY || '',
    ALPHA_VANTAGE_API_KEY: environment.ALPHA_VANTAGE_API_KEY || '',
    TWELVE_DATA_API_KEY: environment.TWELVE_DATA_API_KEY || '',
    SEC_USER_AGENT: userAgent,
    LANGCHAIN_API_KEY: environment.LANGCHAIN_API_KEY || '',
    LANGCHAIN_TRACING_V2: 'true',
    LANGCHAIN_PROJECT: 'ai-financial-agent',
    BLOB_READ_WRITE_TOKEN: environment.BLOB_READ_WRITE_TOKEN || '',
  };
  if (environment.FINANCIAL_DATA_PROVIDER) defaults.FINANCIAL_DATA_PROVIDER = environment.FINANCIAL_DATA_PROVIDER;
  let content = original || '# AI Financial Agent - Local Development Configuration\n';
  for (const [key, value] of Object.entries(defaults)) {
    const replaceEmpty = ['AUTH_SECRET', 'SEC_USER_AGENT'].includes(key) && !existing[key];
    if (Object.hasOwn(existing, key) && !replaceEmpty) continue;
    if (replaceEmpty && Object.hasOwn(existing, key)) {
      content = content.replace(new RegExp(`^(?:export\\s+)?${key}\\s*=.*$`, 'gm'), `${key}=${JSON.stringify(value)}`);
    } else {
      content += `${content.endsWith('\n') ? '' : '\n'}${key}=${JSON.stringify(value)}\n`;
    }
  }
  if (content !== original) writeFileSync(envPath, content, { mode: 0o600 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let gitEmail = '';
  try {
    gitEmail = execFileSync('git', ['config', 'user.email'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {}
  let terminal;
  try {
    await configureLocalEnvironment({
      envPath: resolve('.env'), gitEmail,
      prompt: process.stdin.isTTY ? async (question) => {
        terminal ??= createInterface({ input: process.stdin, output: process.stdout });
        return terminal.question(question);
      } : undefined,
    });
    console.log('Local environment configured; existing values preserved and SEC_USER_AGENT ready.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    terminal?.close();
  }
}