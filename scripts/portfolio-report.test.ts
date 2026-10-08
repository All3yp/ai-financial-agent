import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { portfolioTools } from '../lib/ai/tools/portfolio-tools';
import { MAX_PORTFOLIO_INPUT_BYTES } from '../lib/portfolio/risk-http';
import { generatePortfolioReportFromFile, main } from './portfolio-report';

function fixture() {
  return {
    positions: [{ ticker: 'AAA', shares: 2, currentPrice: 50 }],
    histories: [{
      ticker: 'AAA',
      prices: [100, 80, ...Array<number>(19).fill(72)].map((price, index) => ({
        date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
        price,
      })),
    }],
    currency: 'USD',
    scenarios: [{ name: 'Caller loss', returns: { AAA: -0.25 } }],
  };
}

async function withFile(body: string | Uint8Array, run: (filePath: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'portfolio-report-'));
  const filePath = join(directory, 'input.json');
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

test('reusable file report and CLI stdout match known deterministic results without mutations', async () => {
  const input = fixture();
  await withFile(JSON.stringify(input), async (filePath) => {
    const report = await generatePortfolioReportFromFile(filePath);
    assert.deepEqual(report, portfolioTools.generatePortfolioReport.execute(input));
    assert.equal(report.risk.currentValue, 100);
    assert.ok(Math.abs(report.risk.valueAtRisk.amount - 10) < 1e-10);
    assert.ok(Math.abs(report.risk.conditionalValueAtRisk.amount - 20) < 1e-10);
    assert.equal(report.stressTests[0].profitLoss, -25);
    const { capture, output } = outputCapture();
    assert.equal(await main([filePath], output), 0);
    assert.deepEqual(JSON.parse(capture.stdout), report);
    assert.equal(capture.stderr, '');
  });
});

test('invalid JSON, strict schema, calculation, and UTF-8 errors have safe stderr only', async () => {
  const short = fixture();
  short.histories[0].prices.pop();
  const overflow = fixture();
  overflow.positions[0].shares = 1e308;
  for (const body of [
    'secret malformed JSON',
    JSON.stringify({ ...fixture(), secret: 'private-value' }),
    JSON.stringify({ ...fixture(), positions: [{ ...fixture().positions[0], secret: 'private-value' }] }),
    JSON.stringify(short), JSON.stringify(overflow), new Uint8Array([0xff]),
  ]) {
    await withFile(body, async (filePath) => {
      await assert.rejects(generatePortfolioReportFromFile(filePath));
      const { capture, output } = outputCapture();
      assert.equal(await main([filePath], output), 1);
      assert.equal(capture.stdout, '');
      assert.match(capture.stderr, /^(Invalid JSON\.|Invalid portfolio input\.|Unable to calculate portfolio report\.)\n$/);
    });
  }
});

test('bounded file reads accept exactly 1 MiB and reject larger or multibyte inputs', async () => {
  const exact = JSON.stringify(fixture()).padEnd(MAX_PORTFOLIO_INPUT_BYTES, ' ');
  await withFile(exact, async (filePath) => {
    assert.equal((await generatePortfolioReportFromFile(filePath)).risk.currentValue, 100);
  });
  for (const body of [`${exact} `, 'é'.repeat(MAX_PORTFOLIO_INPUT_BYTES / 2 + 1)]) {
    await withFile(body, async (filePath) => {
      await assert.rejects(generatePortfolioReportFromFile(filePath), /exceeds 1 MiB/);
      const { capture, output } = outputCapture();
      assert.equal(await main([filePath], output), 1);
      assert.equal(capture.stdout, '');
      assert.equal(capture.stderr, 'Portfolio input exceeds 1 MiB.\n');
    });
  }
});

test('missing, extra, and unreadable file arguments fail cleanly without echoing paths', async () => {
  for (const args of [[], ['secret-path', 'extra'], [''], ['\0secret-path']]) {
    const { capture, output } = outputCapture();
    assert.equal(await main(args, output), 1);
    assert.equal(capture.stdout, '');
    assert.doesNotMatch(capture.stderr, /secret-path|Error:| at /);
    assert.match(capture.stderr, /^(Usage: tsx scripts\/portfolio-report.ts <input.json>|Unable to read portfolio input file\.)\n$/);
  }
});

test('tsx entrypoint emits JSON on success and exits 1 with only safe diagnostics on failure', async () => {
  const cli = resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
  const script = resolve(__dirname, 'portfolio-report.ts');
  const env = { ...process.env, NODE_NO_WARNINGS: '1' };
  await withFile(JSON.stringify(fixture()), async (filePath) => {
    const result = spawnSync(process.execPath, [cli, script, filePath], { encoding: 'utf8', env });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).risk.currentValue, 100);
  });
  for (const body of ['secret malformed JSON', ' '.repeat(MAX_PORTFOLIO_INPUT_BYTES + 1)]) {
    await withFile(body, async (filePath) => {
      const result = spawnSync(process.execPath, [cli, script, filePath], { encoding: 'utf8', env });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^(Invalid JSON\.|Portfolio input exceeds 1 MiB\.)\n$/);
    });
  }
  const missing = spawnSync(process.execPath, [cli, script], { encoding: 'utf8', env });
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.equal(missing.stderr, 'Usage: tsx scripts/portfolio-report.ts <input.json>\n');
  const imported = spawnSync(process.execPath, [cli, '-e', `require(${JSON.stringify(script)})`], { encoding: 'utf8', env });
  assert.equal(imported.status, 0);
  assert.equal(imported.stdout, '');
  assert.equal(imported.stderr, '');
});