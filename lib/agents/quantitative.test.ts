import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import test from 'node:test';
import { portfolioTools } from '../ai/tools/portfolio-tools';
import { analyzeMarket, type MarketAnalysisInput } from '../market/analysis';
import { BaseAgent, agentMemory, getAllAgents, type AgentTask } from './base';
import { RiskAgent, MarketRegimeAgent, SectorRotationAgent, TimeHorizonAgent,
  QuantitativeTeamOrchestrator, quantitativeTeamInputSchema } from './quantitative';

let taskSequence = 0;

function task(agent: BaseAgent, input: unknown): AgentTask {
  return { id: `quantitative-test-${++taskSequence}`, agentId: agent.config.id,
    type: 'analysis', input, status: 'pending', createdAt: new Date() };
}

function date(index: number): string {
  return new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10);
}

function history(ticker: string, prices: number[]) {
  return { ticker, prices: prices.map((price, index) => ({ date: date(index), price })) };
}

function market(): MarketAnalysisInput {
  return { histories: [history('MARKET', Array.from({ length: 201 }, (_, index) => 100 + index)),
    history('SECTOR', Array.from({ length: 201 }, (_, index) => 100 + index / 2))],
  marketTicker: 'MARKET', sectorTickers: ['SECTOR'], priceBasis: 'TOTAL_RETURN', asOf: date(200) };
}

function portfolio() {
  return { positions: [{ ticker: 'AAA', shares: 2, currentPrice: 50 }],
    histories: [history('AAA', [100, 80, ...Array<number>(19).fill(72)])], currency: 'USD' };
}

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}

test('risk delegates strict report input and preserves known results, warnings and explicit scenarios', async () => {
  const agent = new RiskAgent();
  const input = { ...portfolio(), scenarios: [{ name: 'Caller shock', returns: { AAA: -0.25 } }] };
  const work = task(agent, input);
  const output = await agent.execute(work);
  assert.deepEqual(output.report, portfolioTools.generatePortfolioReport.execute(input));
  near(output.report.risk.valueAtRisk.amount, 10);
  near(output.report.risk.conditionalValueAtRisk.amount, 20);
  near(output.report.risk.maxDrawdown, 0.28);
  assert.equal(output.report.stressTests[0].profitLoss, -25);
  assert.equal(output.asOf, date(20));
  assert.match(output.warnings.join(' '), /fewer than 250/);
  assert.equal(agentMemory.getTask(work.id), work);
  assert.equal(work.status, 'completed');
  assert.equal(work.result, output);
  assert.ok(work.startedAt instanceof Date && work.completedAt instanceof Date);
  assert.ok(work.createdAt <= work.startedAt && work.startedAt <= work.completedAt);
});

test('market specialists independently return exact evidence subsets without forecasts', async () => {
  const input = market();
  const original = structuredClone(input);
  const expected = analyzeMarket(input);
  const regimeAgent = new MarketRegimeAgent();
  const sectorAgent = new SectorRotationAgent();
  const horizonAgent = new TimeHorizonAgent();
  const regime = await regimeAgent.execute(task(regimeAgent, input));
  const sector = await sectorAgent.execute(task(sectorAgent, input));
  const horizon = await horizonAgent.execute(task(horizonAgent, input));
  assert.equal(regime.regime, 'BULL_TRENDING');
  near(regime.indicators.trend.totalReturn, 2);
  assert.deepEqual(regime.indicators.trend, expected.indicators.trend);
  assert.deepEqual(sector.sectorRankings, expected.sectorRankings);
  assert.deepEqual(horizon.horizons.map((entry) => entry.market), expected.indicators.momentum);
  assert.deepEqual(horizon.horizons.map((entry) => entry.sectors), expected.sectorRankings);
  assert.equal('regime' in horizon, false);
  assert.equal('sectorRankings' in regime, false);
  assert.equal('indicators' in sector, false);
  for (const result of [regime, sector, horizon]) {
    assert.equal(result.asOf, expected.asOf);
    assert.deepEqual(result.alignment, expected.alignment);
    assert.deepEqual(result.warnings, expected.warnings);
    for (const limitation of expected.limitations) assert.ok(result.limitations.includes(limitation));
  }
  sector.sectorRankings[0].entries[0].totalReturn = 999;
  assert.notEqual(horizon.horizons[0].sectors.entries[0].totalReturn, 999);
  assert.deepEqual(input, original);
});

test('malformed direct inputs reject and persist failed task lifecycle', async () => {
  const agents = [new RiskAgent(), new MarketRegimeAgent(), new SectorRotationAgent(), new TimeHorizonAgent()];
  for (const agent of agents) {
    const valid = agent instanceof RiskAgent ? portfolio() : market();
    for (const input of [null, undefined, {}, { ...valid, extra: true }]) {
      const work = task(agent, input);
      await assert.rejects(agent.execute(work));
      assert.equal(agentMemory.getTask(work.id)?.status, 'failed');
      assert.ok(work.startedAt instanceof Date && work.completedAt instanceof Date);
      assert.ok(work.error);
      assert.equal(work.result, undefined);
    }
  }
  const risk = agents[0];
  const badRisk = portfolio();
  badRisk.histories[0].prices.pop();
  await assert.rejects(risk.execute(task(risk, badRisk)), /20 aligned returns/);
  const regime = agents[1];
  const shortMarket = market();
  shortMarket.histories[0].prices.pop();
  await assert.rejects(regime.execute(task(regime, shortMarket)), /201 common price dates/);
  await assert.rejects(risk.execute(task(risk, { ...portfolio(), scenarios: [{ name: 'Incomplete', returns: {} }] })), /every portfolio ticker/);
  const mismatch = task(risk, portfolio());
  mismatch.agentId = 'other-agent';
  await assert.rejects(risk.execute(mismatch), /Task agentId/);
  assert.equal(mismatch.status, 'failed');
});

test('team includes full independent specialist results and optional portfolio without registering agents', async () => {
  const registered = getAllAgents();
  const agent = new QuantitativeTeamOrchestrator();
  const input = { market: market(), portfolio: portfolio() };
  const original = structuredClone(input);
  const work = task(agent, input);
  const result = await agent.execute(work);
  const standalone = new RiskAgent();
  assert.deepEqual(result.specialists.risk, await standalone.execute(task(standalone, input.portfolio)));
  assert.deepEqual(result.specialists.marketRegime,
    await agent.marketRegimeAgent.execute(task(agent.marketRegimeAgent, input.market)));
  assert.deepEqual(result.specialists.sectorRotation,
    await agent.sectorRotationAgent.execute(task(agent.sectorRotationAgent, input.market)));
  assert.deepEqual(result.specialists.timeHorizon,
    await agent.timeHorizonAgent.execute(task(agent.timeHorizonAgent, input.market)));
  assert.deepEqual(result, await agent.execute(task(agent, input)));
  assert.deepEqual(input, original);
  assert.deepEqual(getAllAgents(), registered);
  assert.equal(work.status, 'completed');
  assert.equal(result.summary.portfolio?.currentValue, 100);
  assert.ok(result.conflicts.some((entry) => entry.type === 'AS_OF_MISMATCH'));
  const riskCount = agentMemory.getTasksByAgent(agent.riskAgent.config.id).length;
  const optional = await agent.execute(task(agent, { market: input.market }));
  assert.equal(optional.specialists.risk, null);
  assert.equal(optional.summary.portfolio, null);
  assert.match(optional.limitations.join(' '), /no portfolio input/);
  assert.equal(agentMemory.getTasksByAgent(agent.riskAgent.config.id).length, riskCount);
});

test('team validates the entire strict payload before any specialist calls', async (context) => {
  const agent = new QuantitativeTeamOrchestrator();
  const calls = [agent.marketRegimeAgent, agent.sectorRotationAgent, agent.timeHorizonAgent, agent.riskAgent]
    .map((specialist) => context.mock.method(specialist, 'execute', async () => { throw new Error('Must not run'); }));
  for (const input of [null, {}, market(), { market: market(), extra: true },
    { market: market(), portfolio: null }, { market: market(), portfolio: { ...portfolio(), extra: true } },
    { market: { ...market(), config: { unexpected: true } } }]) {
    assert.equal(quantitativeTeamInputSchema.safeParse(input).success, false);
    const work = task(agent, input);
    await assert.rejects(agent.execute(work));
    assert.equal(work.status, 'failed');
  }
  for (const call of calls) assert.equal(call.mock.callCount(), 0);
});

test('a specialist failure does not prevent independent specialist completion', async () => {
  const agent = new QuantitativeTeamOrchestrator();
  const invalid = portfolio();
  invalid.histories[0].prices.pop();
  const counts = [agent.marketRegimeAgent, agent.sectorRotationAgent, agent.timeHorizonAgent, agent.riskAgent]
    .map((specialist) => agentMemory.getTasksByAgent(specialist.config.id).length);
  const work = task(agent, { market: market(), portfolio: invalid });
  await assert.rejects(agent.execute(work), /20 aligned returns/);
  assert.equal(work.status, 'failed');
  for (const [index, specialist] of [agent.marketRegimeAgent, agent.sectorRotationAgent, agent.timeHorizonAgent, agent.riskAgent].entries()) {
    const tasks = agentMemory.getTasksByAgent(specialist.config.id).slice(counts[index]);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].status, index === 3 ? 'failed' : 'completed');
    if (index !== 3) assert.ok(tasks[0].result);
  }
});

test('synthesis preserves opposing horizons and absolute-positive relative-lagging sectors', async () => {
  const input = market();
  input.horizons = [1, 2];
  input.config = { regimeWindow: 2, volatilityWindow: 2, volatileThreshold: 10, crisisThreshold: 20 };
  input.asOf = date(2);
  input.sectorTickers = ['REVERSAL', 'LAGGING'];
  input.histories = [history('MARKET', [100, 120, 110]), history('REVERSAL', [100, 130, 115]),
    history('LAGGING', [100, 102, 105])];
  const agent = new QuantitativeTeamOrchestrator();
  const output = await agent.execute(task(agent, { market: input }));
  assert.equal(output.summary.direction, 'bullish');
  assert.deepEqual(output.summary.marketHorizons.map((entry) => entry.direction), ['negative', 'positive']);
  for (const kind of ['MARKET_HORIZON_DISAGREEMENT', 'REGIME_HORIZON_DISAGREEMENT',
    'SECTOR_HORIZON_DISAGREEMENT', 'SECTOR_RELATIVE_HORIZON_DISAGREEMENT', 'RELATIVE_SECTOR_LAGGING']) {
    assert.ok(output.conflicts.some((entry) => entry.type === kind), kind);
  }
  const lagging = output.conflicts.find((entry) => entry.type === 'RELATIVE_SECTOR_LAGGING' && entry.subject === 'LAGGING')!;
  assert.equal(lagging.evidence[0].horizon, 2);
  near(lagging.evidence[0].totalReturn, 0.05);
  near(lagging.evidence[0].excessReturnVsMarket!, -0.05);
  assert.ok(output.summary.sectorHorizons[1].laggingVsMarket.includes('LAGGING'));
});

test('specialists preserve alignment warnings and effective asOf on sparse, caller-adjusted histories', async () => {
  const input = market();
  input.horizons = [1, 2];
  input.config = { regimeWindow: 2, volatilityWindow: 2 };
  input.priceBasis = 'ADJUSTED_PRICE';
  input.asOf = date(4);
  input.histories = [history('MARKET', [100, 110, 120, 130, 140, 150]),
    { ticker: 'SECTOR', prices: [{ date: date(0), price: 100 }, { date: date(2), price: 105 },
      { date: date(3), price: 110 }, { date: date(5), price: 999 }] }];
  const expected = analyzeMarket(input);
  const agent = new QuantitativeTeamOrchestrator();
  const output = await agent.execute(task(agent, { market: input }));
  assert.equal(output.asOf, date(3));
  for (const specialist of [output.specialists.marketRegime, output.specialists.sectorRotation, output.specialists.timeHorizon]) {
    assert.equal(specialist.requestedAsOf, date(4));
    assert.deepEqual(specialist.warnings, expected.warnings);
    assert.deepEqual(specialist.alignment, expected.alignment);
  }
  assert.deepEqual(output.warnings, expected.warnings);
});

test('execution uses no network or model and emits no recommendations or fabricated allocations', async (context) => {
  const forbidden = () => { throw new Error('Network/model call forbidden'); };
  const spies = [context.mock.method(globalThis, 'fetch', forbidden), context.mock.method(http, 'request', forbidden),
    context.mock.method(https, 'request', forbidden), context.mock.method(net.Socket.prototype, 'connect', forbidden),
    context.mock.method(BaseAgent.prototype as unknown as { callLLM: () => unknown }, 'callLLM', forbidden)];
  const agent = new QuantitativeTeamOrchestrator();
  const output = await agent.execute(task(agent, { market: market(), portfolio: portfolio() }));
  assert.deepEqual(output.specialists.risk?.report.stressTests, []);
  const forbiddenKeys = /^(recommendations?|allocations?|forecasts?|predictions?|guarantees?|targetWeights|consensus)$/i;
  const check = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbiddenKeys.test(key), false, key);
      check(child);
    }
  };
  check(output);
  assert.match(output.limitations.join(' '), /factor decomposition.*unsupported/);
  assert.match(output.limitations.join(' '), /AssetAllocation.*conservative\/aggressive.*FII.*unsupported/);
  for (const spy of spies) assert.equal(spy.mock.callCount(), 0);
});