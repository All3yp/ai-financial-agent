# AI Financial Agent System - Documentation

## Overview

This project implements an **autonomous multi-agent financial analysis system** built on Next.js 15, Inngest (background jobs), and OpenRouter (free tier models).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        NEXT.JS APP                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Chat UI   │  │Agent Dashboard│  │  API Routes │             │
│  │  (/chat)    │  │   (/agents)   │  │             │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          ▼                                      │
│              ┌─────────────────────┐                            │
              │   INNGEST (Background) │                            │
              │  ┌─────────────────┐  │                            │
              │  │ Scheduled Fns   │  │  • Hourly monitoring      │
              │  │ Event-driven Fns│  │  • Daily screening        │
              │  │ Workflow Fns    │  │  • On-demand analysis     │
              │  └────────┬────────┘  │  • Bull/Bear debate       │
              └───────────┼───────────┘                            │
                          ▼                                        │
              ┌─────────────────────┐                            │
              │   AGENT REGISTRY    │                            │
              │  ┌─────────────────┐  │                            │
              │  │ Research Agent  │  │  • Gathers financial data │
              │  │ Analysis Agent  │  │  • Deep analysis/valuation│
              │  │ Screener Agent  │  │  • Finds opportunities    │
              │  │ Monitor Agent   │  │  • Watches positions      │
              │  │ Report Agent    │  │  • Generates reports      │
              │  └─────────────────┘  │                            │
              └───────────┬───────────┘                            │
                          ▼                                        │
              ┌─────────────────────┐                            │
              │   TOOLS (Financial) │                            │
              │  • Stock Prices     │                            │
              │  • Income Stmts     │                            │
              │  • Balance Sheets   │                            │
              │  • Cash Flows       │                            │
              │  • Financial Metrics│                            │
              │  • Stock Screener   │                            │
              │  • News             │                            │
              └─────────────────────┘                            │
```

---

## Inngest CLI - What It Does

### `npx inngest-cli dev`

**Purpose**: Local development server for Inngest background functions.

**What it provides**:
1. **Local function execution** - Runs your Inngest functions locally
2. **Dashboard** - http://localhost:8288 (view runs, logs, replay failures)
3. **Webhook simulation** - Receives events from your Next.js app
4. **Function registration** - Auto-discovers functions from `app/api/inngest/route.ts`

**Why you need it**:
- Without it: Scheduled functions (cron) won't run locally
- Without it: Event-driven functions won't execute locally
- With it: Full background job simulation on your machine

**Production**: On Vercel, Inngest Cloud handles this automatically (no CLI needed).

---

## Current Agent Capabilities

### 5 Specialized Agents

| Agent | Model | Specialty | Tools |
|-------|-------|-----------|-------|
| **Research** | `apodex/apodex-1.1-mini:free` | Evidence-grounded research, 262K context | All 6 financial tools |
| **Analysis** | `thinkingmachines/inkling:free` | Deep valuation, multimodal, 1M context | Financial metrics (peers) |
| **Screener** | `nvidia/nemotron-3.5-lightning:free` | High-throughput screening, 1M context | Screener + metrics |
| **Monitor** | `meta-llama/llama-3.1-8b-instruct:free` | Fast position monitoring | Prices, metrics, income |
| **Report** | `thinkingmachines/inkling-small:free` | Professional Markdown reports | LLM only |

### Current Workflows

1. **Full Analysis** (sequential): Research → Analysis → Report
2. **Bull vs Bear Debate** (parallel + synthesis): Research → [Bull, Bear] → Synthesis → Report
3. **Daily Screening** (scheduled): 4 screens run at 5PM Mon-Fri
4. **Hourly Monitoring** (scheduled): Position checks 9AM-4PM Mon-Fri

### Trigger Methods

```typescript
// Via API (from UI)
POST /api/agents/trigger { workflowType: 'analysis', data: { ticker: 'AAPL', peers: ['MSFT'] } }

// Via Inngest Events (programmatic)
import { requestAnalysis, requestDebate, requestScreening, requestMonitoring } from '@/lib/agents/client';
await requestAnalysis('AAPL', ['MSFT', 'GOOGL'], userId);
await requestDebate('AAPL', 'Should I invest long-term?', userId);
await requestScreening({ roe: { min: 15 }, peRatio: { max: 20 } }, userId);
await requestMonitoring([{ ticker: 'AAPL', costBasis: 150, shares: 10 }], userId);
```

---

## Data Access (Current)

### Available via Financial Datasets API:
- ✅ Stock prices (historical + snapshot)
- ✅ Income statements (quarterly/annual/TTM)
- ✅ Balance sheets
- ✅ Cash flow statements
- ✅ Financial metrics (P/E, ROE, ROIC, margins, debt ratios, etc.)
- ✅ Stock screening by filters
- ✅ News headlines

### NOT Available (Gaps):
- ❌ SEC Filings (10-K, 10-Q, 8-K parsing)
- ❌ Earnings call transcripts
- ❌ Analyst estimates/ratings
- ❌ Insider transactions (Form 4)
- ❌ Institutional holdings (13F)
- ❌ Options flow / Greeks
- ❌ Short interest data
- ❌ Macro data (Fed, inflation, yield curve)
- ❌ Crypto/forex/commodities
- ❌ Alternative data (satellite, credit card, web traffic)
- ❌ News sentiment analysis (NLP)
- ❌ Earnings surprise history
- ❌ Guidance changes

---

## TODO: Planned Improvements

### Phase 1: Core Data Expansion (High Priority)

- [ ] **SEC Filings Parser**
  - [ ] `getSECFilings(ticker, formType: '10-K'|'10-Q'|'8-K')`
  - [ ] XBRL parsing for financial statements
  - [ ] Section extraction (Risk Factors, MD&A, Business)

- [ ] **Earnings Intelligence**
  - [ ] `getEarningsTranscripts(ticker, quarter)`
  - [ ] `getEarningsCalendar(dateRange)`
  - [ ] `getAnalystEstimates(ticker)` - consensus, revisions
  - [ ] `getGuidanceHistory(ticker)` - raise/lower tracking

- [ ] **Ownership & Insider Data**
  - [ ] `getInsiderTransactions(ticker)` - Form 4 parsing
  - [ ] `getInstitutionalHoldings(ticker)` - 13F parsing
  - [ ] `getShortInterest(ticker)` - short float, days to cover

- [ ] **Options & Flow Data**
  - [ ] `getOptionsChain(ticker, expiry)`
  - [ ] `getUnusualOptionsActivity(ticker)`
  - [ ] `getGreeksExposure(ticker)` - gamma, delta, vega
  - [ ] `getMaxPain(ticker)`

### Phase 2: Macro & Market Structure (High Priority)

- [ ] **Macro Data**
  - [ ] `getYieldCurve()` - 2s10s, 3m10y spreads
  - [ ] `getFedRateExpectations()` - CME FedWatch
  - [ ] `getInflationData()` - CPI, PCE, PPI, core
  - [ ] `getEconomicCalendar()` - upcoming releases

- [ ] **Market Breadth & Internals**
  - [ ] `getSectorPerformance()` - XLF, XLK, XLE, etc.
  - [ ] `getMarketBreadth()` - advance/decline, new highs/lows
  - [ ] `getVIXTermStructure()` - volatility term structure
  - [ ] `getPutCallRatio()` - equity/index

- [ ] **Crypto/Forex/Commodities**
  - [ ] `getCryptoPrices(symbols)` - BTC, ETH, majors
  - [ ] `getForexRates(pairs)` - DXY, major pairs
  - [ ] `getCommodityFutures(symbols)` - gold, oil, copper

### Phase 3: Alternative Data (Medium Priority)

- [ ] `getSatelliteData(ticker)` - parking, production
- [ ] `getCreditCardSpending(ticker)` - consumer spending
- [ ] `getWebTraffic(ticker)` - SimilarWeb, app downloads
- [ ] `getJobPostings(ticker)` - hiring trends
- [ ] `getAppStoreData(ticker)` - ratings, downloads

### Phase 4: News & Sentiment NLP (Medium Priority)

- [ ] `getNewsSentiment(ticker, period)` - FinBERT/FinGPT
- [ ] `getEarningsSurpriseHistory(ticker)` - beat/miss tracking
- [ ] `getAnalystRatingChanges(ticker)` - upgrade/downgrade
- [ ] `getNewsClustering(ticker)` - topic modeling

### Phase 5: New Specialized Agents (High Priority)

- [ ] **MacroAgent** - Fed, inflation, yield curve → sector allocation
- [ ] **RiskAgent** - VaR, stress testing, factor decomposition
- [ ] **EarningsAgent** - Pre/post earnings, transcript analysis
- [ ] **InsiderAgent** - Form 4 tracking, cluster buying/selling
- [ ] **OptionsAgent** - Flow, IV surface, gamma exposure, max pain
- [ ] **CryptoAgent** - On-chain metrics, funding rates, basis trade
- [ ] **CommodityAgent** - Futures curves, inventories, crack spreads
- [ ] **ForexAgent** - Carry trades, central bank policy, DXY analysis
- [ ] **FIIAgent** - Brazilian FIIs analysis (dividend yield, P/VP, vacancy)

### Phase 6: Portfolio & Risk Engine (High Priority)

- [ ] `calculatePortfolioRisk(positions[])` - VaR, CVaR, factor exposure
- [ ] `optimizePortfolio(constraints)` - Mean-variance, risk parity, HRP
- [ ] `stressTestPortfolio(scenarios)` - 2008, 2020, rate shock, inflation
- [ ] `calculateCorrelationMatrix(tickers)` - Factor models (PCA)
- [ ] `generatePortfolioReport(positions[])` - Attribution, risk decomposition

### Phase 7: Multi-Agent Market Analysis (Core Request)

- [ ] **MarketRegimeAgent** - Identifies regime (bull/bear/sideways/volatile)
- [ ] **SectorRotationAgent** - Tracks sector momentum, rotation signals
- [ ] **AssetAllocationAgent** - Strategic/tactical allocation by risk profile
- [ ] **TimeHorizonAgent** - Short/medium/long term specialists
- [ ] **ConservativeModeAgent** - FIIs, dividend aristocrats, bonds, low vol
- [ ] **AggressiveModeAgent** - Momentum, growth, small caps, crypto
- [ ] **TeamOrchestrator** - Coordinates specialists, resolves conflicts, produces consensus

### Phase 8: Execution Modes Beyond Chat

- [ ] **Scheduled Reports** - Daily/weekly/monthly via Inngest cron
- [ ] **Webhook Alerts** - Push to Discord/Slack/Email/Telegram
- [ ] **API Endpoints** - REST/GraphQL for external integration
- [ ] **CLI Tool** - `pnpm agent:analyze AAPL --mode=conservative`
- [ ] **Background Workers** - Continuous monitoring, auto-rebalancing signals
- [ ] **Dashboard Widgets** - Real-time regime, allocation, risk metrics

### Phase 9: Infrastructure & Observability

- [ ] **Vector DB** (Pinecone/Weaviate) - RAG for filings, transcripts
- [ ] **Redis/Upstash** - Cache, rate limiting, distributed locks
- [ ] **TimescaleDB/ClickHouse** - Time-series market data storage
- [ ] **WebSocket Server** - Real-time price/alert streaming
- [ ] **Inngest Cloud** - Production deployment (Vercel integration)
- [ ] **LangSmith/Helicone** - Tracing, evals, cost tracking
- [ ] **Eval Framework** - Golden datasets, regression testing

---

## Agent Team Modes (Future)

### Conservative Mode (FIIs, Dividends, Low Vol)
```
Orchestrator → [MacroAgent, FIIAgent, DividendAgent, BondAgent] → Synthesis → Allocation
```
**Output**: Monthly income portfolio, risk < 10% vol, 6-8% yield target

### Balanced Mode (Core-Satellite)
```
Orchestrator → [MacroAgent, SectorAgent, FactorAgent, QualityAgent] → Synthesis → Allocation
```
**Output**: 60/40 core/satellite, factor tilts, quarterly rebalance

### Aggressive Mode (Momentum, Growth, Crypto)
```
Orchestrator → [MomentumAgent, GrowthAgent, CryptoAgent, SmallCapAgent] → Synthesis → Allocation
```
**Output**: High conviction positions, 20-30% vol target, monthly rebalance

### Market Regime Detection (Continuous)
```
MarketRegimeAgent (runs hourly) → 
  Regime: {BULL_TRENDING, BULL_VOLATILE, BEAR_TRENDING, BEAR_VOLATILE, SIDEWAYS, CRISIS}
  → Broadcasts to all agents → Adjusts strategies
```

---

## Quick Start Commands

```bash
# Start everything locally
pnpm dev                    # Next.js (port 3000)
npx inngest-cli dev         # Inngest (port 8288)

# Access points
http://localhost:3000/chat      # Chat interface
http://localhost:3000/agents    # Agent dashboard
http://localhost:8288           # Inngest dashboard

# Trigger analysis programmatically
# (from Node.js script or API call)
curl -X POST http://localhost:3000/api/agents/trigger \
  -H "Content-Type: application/json" \
  -d '{"workflowType":"analysis","data":{"ticker":"AAPL","peers":["MSFT","GOOGL"]}}'
```

---

## Environment Variables Required

```env
# Core
OPENAI_API_KEY=your_openrouter_key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_PROVIDER_NAME=openrouter
FINANCIAL_DATASETS_API_KEY=your_financial_datasets_key

# Inngest (for background agents)
INNGEST_EVENT_KEY=your_inngest_key
INNGEST_SIGNING_KEY=your_inngest_signing_key

# Database
POSTGRES_URL=postgres://...
AUTH_SECRET=your_auth_secret
```

---

## File Structure Reference

```
lib/
├── agents/
│   ├── base.ts           # BaseAgent, AgentOrchestrator, memory
│   ├── specialized.ts    # 5 current agents
│   ├── client.ts         # Inngest client + event helpers
│   ├── inngest.ts        # Scheduled + workflow functions
│   └── index.ts          # Exports
├── ai/
│   ├── model-catalog.ts  # ALL OpenRouter free models (22)
│   ├── models.ts         # Custom models + getAllModels()
│   └── tools/
│       └── financial-tools.ts  # 7 financial tools
app/
├── api/
│   ├── inngest/route.ts          # Inngest webhook endpoint
│   └── agents/trigger/route.ts   # Manual trigger endpoint
├── (chat)/agents/page.tsx        # /agents dashboard
components/
├── agent-dashboard.tsx           # Full UI for agents
└── ui/
    ├── badge.tsx
    └── tabs.tsx
```

---

## Next Steps for You

1. **Test current system**: `pnpm dev` + `npx inngest-cli dev` → `/agents`
2. **Run Full Analysis** on AAPL with peers MSFT, GOOGL
3. **Run Bull vs Bear Debate** on any ticker
4. **Check Inngest dashboard** at localhost:8288 for execution traces
5. **Pick Phase 1 item** to implement first (recommend: SEC Filings or Earnings)