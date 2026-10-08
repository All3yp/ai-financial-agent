import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { QuantitativeTeamOrchestrator, quantitativeTeamInputSchema } from '../lib/agents/quantitative';

const MAX_INPUT_BYTES = 1024 * 1024;
const USAGE = 'Usage: tsx scripts/agent-analyze.ts --input <input.json> [--mode=quantitative]';

class AgentAnalyzeInputError extends Error {}

async function readInput(filePath: string): Promise<string> {
  try {
    const handle = await open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(MAX_INPUT_BYTES + 1);
      let byteLength = 0;
      while (byteLength < buffer.length) {
        const { bytesRead } = await handle.read(buffer, byteLength, buffer.length - byteLength, null);
        if (bytesRead === 0) break;
        byteLength += bytesRead;
      }
      if (byteLength > MAX_INPUT_BYTES) {
        throw new AgentAnalyzeInputError('Agent input exceeds 1 MiB.');
      }
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, byteLength));
      } catch {
        throw new AgentAnalyzeInputError('Invalid JSON.');
      }
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof AgentAnalyzeInputError) throw error;
    throw new AgentAnalyzeInputError('Unable to read agent input file.');
  }
}

export async function analyzeQuantitativeFile(filePath: string) {
  const text = await readInput(filePath);
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new AgentAnalyzeInputError('Invalid JSON.');
  }
  const parsed = quantitativeTeamInputSchema.safeParse(input);
  if (!parsed.success) throw new AgentAnalyzeInputError('Invalid quantitative input.');
  const team = new QuantitativeTeamOrchestrator();
  try {
    return await team.execute({
      id: randomUUID(), agentId: team.config.id, type: 'quantitative-analysis',
      input: parsed.data, status: 'pending', createdAt: new Date(),
    });
  } catch {
    throw new AgentAnalyzeInputError('Unable to analyze quantitative input.');
  }
}

function inputArgument(args: string[]): string {
  let filePath: string | undefined;
  let mode: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const name = argument.split('=', 1)[0];
    if (name !== '--input' && name !== '--mode') throw new AgentAnalyzeInputError(USAGE);
    const value = argument.includes('=') ? argument.slice(name.length + 1) : args[++index];
    if (!value || value.startsWith('--')) throw new AgentAnalyzeInputError(USAGE);
    if (name === '--input') {
      if (filePath !== undefined) throw new AgentAnalyzeInputError(USAGE);
      filePath = value;
    } else {
      if (mode !== undefined) throw new AgentAnalyzeInputError(USAGE);
      if (value !== 'quantitative') throw new AgentAnalyzeInputError('Unsupported mode. Only quantitative is supported.');
      mode = value;
    }
  }
  if (filePath === undefined) throw new AgentAnalyzeInputError(USAGE);
  return filePath;
}

export async function main(
  args: string[] = process.argv.slice(2),
  output: {
    stdout: Pick<NodeJS.WriteStream, 'write'>;
    stderr: Pick<NodeJS.WriteStream, 'write'>;
  } = process,
): Promise<number> {
  try {
    const report = await analyzeQuantitativeFile(inputArgument(args));
    output.stdout.write(`${JSON.stringify(report)}\n`);
    return 0;
  } catch (error) {
    output.stderr.write(`${error instanceof AgentAnalyzeInputError ? error.message : 'Unable to analyze quantitative input.'}\n`);
    return 1;
  }
}

if (typeof __filename !== 'undefined' && process.argv[1] && resolve(process.argv[1]) === __filename) {
  void main().then((exitCode) => { process.exitCode = exitCode; });
}