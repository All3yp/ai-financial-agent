import type { QuantitativeTeamResult } from './quantitative';

export const MAX_QUANTITATIVE_FILE_BYTES = 1024 * 1024;

export async function requestQuantitativeAnalysis(text: string, fetcher: typeof fetch = fetch): Promise<QuantitativeTeamResult> {
  if (new TextEncoder().encode(text).byteLength > MAX_QUANTITATIVE_FILE_BYTES) {
    throw new Error('Input exceeds 1 MiB.');
  }
  try {
    JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file.');
  }
  let response: Response;
  try {
    response = await fetcher('/api/agents/quantitative', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text,
    });
  } catch {
    throw new Error('Unable to connect to the quantitative service.');
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error('Sign in to run quantitative analysis.');
    if (response.status === 413) throw new Error('Input exceeds 1 MiB.');
    if (response.status === 400) throw new Error('Invalid histories or analysis configuration.');
    throw new Error('Quantitative service unavailable.');
  }
  try {
    const result = await response.json();
    if (!result?.specialists?.marketRegime || !result?.specialists?.sectorRotation
      || !Array.isArray(result.warnings) || !Array.isArray(result.limitations)) {
      throw new Error('Invalid result');
    }
    return result;
  } catch {
    throw new Error('Invalid quantitative service response.');
  }
}