import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { BaseAgent } from '../lib/agents/base';
import { portfolioTools } from '../lib/ai/tools/portfolio-tools';
import { analyzeMarket } from '../lib/market/analysis';
import { analyzeQuantitativeFile, main } from './agent-analyze';

const MAX_INPUT_BYTES = 1024 * 1024;
const USAGE = 'Usage: tsx scripts/agent-analyze.ts --input <input.json> [--mode=quantitative]\n';

function history(ticker: string, prices: number[]) {
  return { ticker, prices: prices.map((price, index) => ({
    date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10), price,
  })) };
}

function fixture() {
  return {
    market: {
      histories: [history('MARKET', Array.from({ length: 201 }, (_, index) => 100 + index)),
        history('SECTOR', Array.from({ length: 201 }, (_, index) => 100 + index / 2))],
      marketTicker: 'MARKET', sectorTickers: ['SECTOR'], priceBasis: 'TOTAL_RETURN' as const,
      asOf: new Date(Date.UTC(2025, 0, 201)).toISOString().slice(0, 10),
    },
    portfolio: {
      positions: [{ ticker: 'AAA', shares: 2, currentPrice: 50 }],
      histories: [history('AAA', [100, 80, ...Array<number>(19).fill(72)])], currency: 'USD',
      scenarios: [{ name: 'Caller loss', returns: { AAA: -0.25 } }],
    },
  };
}

async function withFile(body: string | Uint8Array, run: (filePath: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'agent-analyze-'));
  const filePath = join(directory, 'private-input.json');
  try {
    await writeFile(filePath, body);
    await run(filePath);
    assert.deepEqual(await readFile(filePath), Buffer.from(body));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function outputCapture() {
  const capture = { stdout: '', stderr: '' };
  const output = {
    stdout: { write: (chunk: string | Uint8Array) => { capture.stdout += chunk.toString(); return true; } },
    stderr: { write: (chunk: string | Uint8Array) => { capture.stderr += chunk.toString(); return true; } },
  };
  return { capture, output };
}

test('file API and CLI return full specialist evidence and portfolio report without network/model calls or mutations', async (context) => {
  const input = fixture();
  const original = structuredClone(input);
  const expectedMarket = analyzeMarket(input.market);
  const expectedPortfolio = portfolioTools.generatePortfolioReport.execute(input.portfolio);
  const forbidden = () => { throw new Error('Network/model call forbidden'); };
  const spies = [context.mock.method(globalThis, 'fetch', forbidden), context.mock.method(http, 'request', forbidden),
    context.mock.method(https, 'request', forbidden), context.mock.method(net.Socket.prototype, 'connect', forbidden),
    context.mock.method(BaseAgent.prototype as unknown as { callLLM: () => unknown }, 'callLLM', forbidden)];
  await withFile(JSON.stringify(input), async (filePath) => {
    const report = await analyzeQuantitativeFile(filePath);
    assert.equal(report.summary.regime, 'BULL_TRENDING');
    assert.equal(report.specialists.marketRegime.regime, expectedMarket.regime);
    assert.deepEqual(report.specialists.marketRegime.indicators.trend, expectedMarket.indicators.trend);
    assert.deepEqual(report.specialists.sectorRotation.sectorRankings, expectedMarket.sectorRankings);
    assert.deepEqual(report.specialists.timeHorizon.horizons.map((entry) => entry.market), expectedMarket.indicators.momentum);
    assert.deepEqual(report.specialists.risk?.report, expectedPortfolio);
    assert.equal(report.summary.portfolio?.currentValue, 100);
    assert.equal(report.specialists.risk?.report.stressTests[0].profitLoss, -25);
    assert.ok(report.conflicts.some((entry) => entry.type === 'AS_OF_MISMATCH'));
    assert.match(report.limitations.join(' '), /conservative\/aggressive.*unsupported/);
    for (const args of [['--input', filePath], ['--input', filePath, '--mode=quantitative'],
      ['--mode', 'quantitative', `--input=${filePath}`]]) {
      const { capture, output } = outputCapture();
      assert.equal(await main(args, output), 0);
      assert.deepEqual(JSON.parse(capture.stdout), report);
      assert.equal(capture.stderr, '');
    }
  });
  assert.deepEqual(input, original);
  for (const spy of spies) assert.equal(spy.mock.callCount(), 0);
});

test('market-only source histories omit risk rather than fabricating a portfolio', async () => {
  await withFile(JSON.stringify({ market: fixture().market }), async (filePath) => {
    const result = await analyzeQuantitativeFile(filePath);
    assert.equal(result.specialists.risk, null);
    assert.equal(result.summary.portfolio, null);
    assert.match(result.limitations.join(' '), /no portfolio input/);
  });
});

test('missing input, extra arguments, and unsupported modes fail without echoing arguments', async () => {
  for (const args of [[], ['--input'], ['--input', ''], ['private-path'], ['--unknown=private-value'],
    ['--mode=quantitative'], ['--input', '--mode=quantitative'],
    ['--input', 'private-path', '--input', 'other-path'], ['--input', 'private-path', 'extra'],
    ['--input', 'private-path', '--mode=quantitative', '--mode=quantitative']]) {
    const { capture, output } = outputCapture();
    assert.equal(await main(args, output), 1);
    assert.equal(capture.stdout, '');
    assert.equal(capture.stderr, USAGE);
  }
  for (const mode of ['conservative', 'aggressive', 'private-unknown-mode']) {
    const { capture, output } = outputCapture();
    assert.equal(await main(['--input', 'private-path', `--mode=${mode}`], output), 1);
    assert.equal(capture.stdout, '');
    assert.equal(capture.stderr, 'Unsupported mode. Only quantitative is supported.\n');
  }
});

test('malformed JSON, fatal UTF-8, strict nested schema, and ticker quick-look payloads fail safely', async () => {
  const input = fixture();
  for (const [body, diagnostic] of [
    ['private malformed JSON', 'Invalid JSON.'],
    [new Uint8Array([0xff]), 'Invalid JSON.'],
    [new Uint8Array([0x22, 0xc3, 0x22]), 'Invalid JSON.'],
    [JSON.stringify(null), 'Invalid quantitative input.'],
    [JSON.stringify({ ticker: 'AAA' }), 'Invalid quantitative input.'],
    [JSON.stringify({ ...input, private: 'secret' }), 'Invalid quantitative input.'],
    [JSON.stringify({ market: { ...input.market, private: 'secret' } }), 'Invalid quantitative input.'],
    [JSON.stringify({ ...input, portfolio: { ...input.portfolio, private: 'secret' } }), 'Invalid quantitative input.'],
    [JSON.stringify({ ...input, portfolio: null }), 'Invalid quantitative input.'],
  ] as const) {
    await withFile(body, async (filePath) => {
      await assert.rejects(analyzeQuantitativeFile(filePath), { message: diagnostic });
      const { capture, output } = outputCapture();
      assert.equal(await main(['--input', filePath], output), 1);
      assert.equal(capture.stdout, '');
      assert.equal(capture.stderr, `${diagnostic}\n`);
    });
  }
});

test('insufficient source history and unreadable paths have safe API and stderr errors', async () => {
  const short = fixture();
  short.portfolio.histories[0].prices.pop();
  await withFile(JSON.stringify(short), async (filePath) => {
    await assert.rejects(analyzeQuantitativeFile(filePath), { message: 'Unable to analyze quantitative input.' });
    const { capture, output } = outputCapture();
    assert.equal(await main(['--input', filePath], output), 1);
    assert.equal(capture.stdout, '');
    assert.equal(capture.stderr, 'Unable to analyze quantitative input.\n');
  });
  for (const filePath of ['\0private-path', join(tmpdir(), 'missing-agent-input', 'private-input.json')]) {
    await assert.rejects(analyzeQuantitativeFile(filePath), { message: 'Unable to read agent input file.' });
    const { capture, output } = outputCapture();
    assert.equal(await main(['--input', filePath], output), 1);
    assert.equal(capture.stdout, '');
    assert.equal(capture.stderr, 'Unable to read agent input file.\n');
  }
});

test('bounded reader accepts exactly 1 MiB and rejects oversize bytes including multibyte text', async () => {
  const exact = JSON.stringify(fixture()).padEnd(MAX_INPUT_BYTES, ' ');
  await withFile(exact, async (filePath) => {
    assert.equal((await analyzeQuantitativeFile(filePath)).summary.regime, 'BULL_TRENDING');
  });
  for (const body of [`${exact} `, '\u00e9'.repeat(MAX_INPUT_BYTES / 2 + 1)]) {
    await withFile(body, async (filePath) => {
      await assert.rejects(analyzeQuantitativeFile(filePath), { message: 'Agent input exceeds 1 MiB.' });
      const { capture, output } = outputCapture();
      assert.equal(await main(['--input', filePath], output), 1);
      assert.equal(capture.stdout, '');
      assert.equal(capture.stderr, 'Agent input exceeds 1 MiB.\n');
    });
  }
});

test('tsx entrypoint emits JSON, exits 1 on errors, and stays silent when imported', async () => {
  const cli = resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
  const script = resolve(__dirname, 'agent-analyze.ts');
  const env = { ...process.env, NODE_NO_WARNINGS: '1' };
  const spawn = (args: string[]) => spawnSync(process.execPath, [cli, script, ...args], { encoding: 'utf8', env });
  await withFile(JSON.stringify(fixture()), async (filePath) => {
    const result = spawn(['--input', filePath, '--mode=quantitative']);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), await analyzeQuantitativeFile(filePath));
  });
  for (const [body, diagnostic] of [
    ['private malformed JSON', 'Invalid JSON.\n'],
    [' '.repeat(MAX_INPUT_BYTES + 1), 'Agent input exceeds 1 MiB.\n'],
    ['{"ticker":"PRIVATE"}', 'Invalid quantitative input.\n'],
  ]) {
    await withFile(body, async (filePath) => {
      const result = spawn(['--input', filePath]);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, diagnostic);
    });
  }
  for (const args of [[], ['--input', 'private-path', '--mode=conservative'],
    ['--input', 'private-path', '--mode=aggressive']]) {
    const result = spawn(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, args.length === 0 ? USAGE : 'Unsupported mode. Only quantitative is supported.\n');
  }
  const imported = spawnSync(process.execPath, [cli, '-e', `require(${JSON.stringify(script)})`], { encoding: 'utf8', env });
  assert.equal(imported.status, 0);
  assert.equal(imported.stdout, '');
  assert.equal(imported.stderr, '');
});