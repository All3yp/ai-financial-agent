import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  MAX_PORTFOLIO_INPUT_BYTES,
  parsePortfolioReportJson,
  PortfolioReportInputError,
} from '../lib/portfolio/risk-http';

export async function generatePortfolioReportFromFile(filePath: string) {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let text: string;
  try {
    handle = await open(filePath, 'r');
    const buffer = Buffer.alloc(MAX_PORTFOLIO_INPUT_BYTES + 1);
    let byteLength = 0;
    while (byteLength < buffer.length) {
      const { bytesRead } = await handle.read(buffer, byteLength, buffer.length - byteLength, null);
      if (bytesRead === 0) break;
      byteLength += bytesRead;
    }
    if (byteLength > MAX_PORTFOLIO_INPUT_BYTES) {
      throw new PortfolioReportInputError('Portfolio input exceeds 1 MiB.', 413);
    }
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, byteLength));
    } catch {
      throw new PortfolioReportInputError('Invalid JSON.');
    }
  } catch (error) {
    if (error instanceof PortfolioReportInputError) throw error;
    throw new Error('Unable to read portfolio input file.');
  } finally {
    await handle?.close();
  }
  return parsePortfolioReportJson(text);
}

export async function main(
  args: string[] = process.argv.slice(2),
  output: {
    stdout: Pick<NodeJS.WriteStream, 'write'>;
    stderr: Pick<NodeJS.WriteStream, 'write'>;
  } = process,
): Promise<number> {
  if (args.length !== 1 || !args[0]) {
    output.stderr.write('Usage: tsx scripts/portfolio-report.ts <input.json>\n');
    return 1;
  }
  try {
    const report = await generatePortfolioReportFromFile(args[0]);
    output.stdout.write(`${JSON.stringify(report)}\n`);
    return 0;
  } catch (error) {
    output.stderr.write(`${error instanceof PortfolioReportInputError ? error.message : 'Unable to read portfolio input file.'}\n`);
    return 1;
  }
}

if (typeof __filename !== 'undefined' && process.argv[1] && resolve(process.argv[1]) === __filename) {
  void main().then((exitCode) => { process.exitCode = exitCode; });
}