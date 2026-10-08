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

### Provider Selection

Financial Datasets remains supported and is the default when its API key is
configured. FMP, Alpha Vantage and Twelve Data are optional alternatives through
the shared `FinancialDataClient`, used by chat and agent financial tools.

- Set `FINANCIAL_DATA_PROVIDER` to `financial-datasets`, `fmp`, `alpha-vantage`,
  `twelve-data`, or explicitly opt into `auto`.
- Chat API requests may supply `financialData: { provider, apiKeys }`; the legacy
  `financialDatasetsApiKey` field remains supported. Alternative keys can also be
  configured on the server. The existing key dialog still manages Financial
  Datasets only, not alternative provider keys.
- `auto` prefers Twelve Data for daily prices and FMP for fundamentals/news,
  then tries configured alternatives. Explicit provider selection never silently
  falls back. Automatic retries across providers can consume multiple quotas.
- Stock screening currently requires Financial Datasets. Twelve Data currently
  supports daily prices only. Alpha Vantage statements do not support TTM;
  its metrics are a latest TTM snapshot, and compact daily history covers at most
  100 trading days. FMP endpoints may require a paid plan.
- Missing normalized fields are `null`, not fabricated zeroes. Results carry
  source, fetch time and warnings. Client-local caches use 60 seconds for
  prices/news and 300 seconds for fundamentals; these are not distributed caches.
- Free tiers, coverage, redistribution rights and prices must be checked with
  each provider before deployment. Shibui/MCP is not integrated: its transport,
  access policy and data contract still need verification.

### Available via Financial Datasets API:
- ✅ Stock prices (historical + snapshot)
- ✅ Income statements (quarterly/annual/TTM)
- ✅ Balance sheets
- ✅ Cash flow statements
- ✅ Financial metrics (P/E, ROE, ROIC, margins, debt ratios, etc.)
- ✅ Stock screening by filters
- ✅ News headlines

### NOT Available (Gaps):
- SEC discovery is available through `getSECFilings`: 10-K/10-Q/8-K metadata,
  bounded historical pagination, optional amendments and official document/index
  links. XBRL parsing and document section extraction remain unavailable.
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

### Implementation Policy And Verified Progress

Financial Datasets is retained, not replaced. Optional providers supplement it.
Only tested behavior is marked complete; a tool name, placeholder, prompt or
synthetic dataset does not count as a completed integration.

The portfolio module implements a local subset of Phase 6. SEC discovery below
implements only the first part of Phase 1. All other unchecked items remain
backlog, not silently discarded or considered complete.

Before implementing these items, resolve their concrete prerequisites:

- Transcripts, estimates, guidance, short interest, options flow and alternative
  data need verified endpoints, entitlements and usage rights. No assumption that
  a free provider covers them; no paid subscription is activated automatically.
- CME FedWatch, satellite, credit-card and SimilarWeb data are not treated as
  freely scrapeable sources. Prefer an authorized API or user-provided data.
- New specialist agents require the corresponding real data tools first;
  prompts alone must not imply options, on-chain, FII or macro coverage.
- Portfolio optimization, factor attribution and historical crisis scenarios
  require separate numerical-model tests and actual aligned input data.
- Vector/time-series stores, Redis, production Inngest, webhooks and streaming
  require deployment configuration, credentials where applicable, persistence,
  authorization and operational testing. Provider/tool caches are not substitutes.
- Mode-specific yield and volatility figures below are design examples, not
  validated targets or guarantees.

### Phase 1: Core Data Expansion (High Priority)

- [ ] **SEC Filings Parser**
  - [x] `getSECFilings({ ticker, formType: '10-K'|'10-Q'|'8-K', limit? })` - metadata and official links
  - [x] Historical submissions pagination and amended-form support (bounded, with coverage metadata)
  - [x] Automatic `SEC_USER_AGENT` configuration in local setup without erasing existing settings
  - [ ] XBRL parsing for financial statements
  - [ ] Section extraction (Risk Factors, MD&A, Business)

SEC discovery uses `lib/api/sec-filings.ts` and is exposed by the shared tool
manager. `bash setup-local.sh` configures `SEC_USER_AGENT` automatically, preserving
an existing value or using `SEC_CONTACT_EMAIL`, the Git contact email, or an
interactive contact prompt. GitHub noreply and example-domain addresses are not
accepted as contacts. For unattended setup, provide a real contact through
`SEC_CONTACT_EMAIL` or a full `SEC_USER_AGENT`. Existing `.env` values, comments,
API keys and nonempty `AUTH_SECRET` are preserved on repeated setup. The helper
can also be run alone with `node scripts/setup-env.mjs` after dependencies are
installed; it does not install PostgreSQL or run migrations.

No SEC API key is required. Requests are server-side, spaced at least 200ms
apart per process, with a bounded five-minute client cache and a 15-second fetch
timeout. There is no automatic retry on SEC blocks/429 responses. Multiple
processes or deployments still need shared rate coordination to respect SEC's
aggregate fair-access limit.

Historical pages are enabled by default (`includeHistorical: true`), with up to
five archive pages per query (`maxArchivePages`, configurable from 1 to 20).
`includeHistorical: false` keeps requests to recent metadata. Set
`includeAmendments: true` to include `/A` forms alongside the requested base form.
Results merge, deduplicate by accession and sort before applying `limit`.
`archivePagesRead`, `archivePagesAvailable` and `historyComplete` expose the
coverage; reaching the page bound is never presented as a complete archive.
Archive failures reject the query rather than silently returning partial data.
This still returns discovery metadata, not filing text or parsed statements.

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

Implemented local subset: `lib/portfolio/risk.ts`, with fixture-based tests.
It accepts caller-supplied, same-currency dated histories and current holdings.
The broader checkboxes remain open because their full planned scope is not done.

- [x] Historical VaR/CVaR, sample volatility, fixed-share drawdown and concentration
- [x] Aligned Pearson return correlations (not PCA or factor models)
- [x] Explicit caller-supplied stress scenarios (not historical crisis replay)
- [x] Structured deterministic risk report with warnings and limitations
- [ ] Connect risk reports to chat/agent tools and dashboard

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

# Optional data alternatives (only configure the providers you intend to use)
# FINANCIAL_DATA_PROVIDER=fmp
# FMP_API_KEY=your_fmp_key
# ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
# TWELVE_DATA_API_KEY=your_twelve_data_key
# Without an explicit selection, a configured Financial Datasets key takes priority.
# SEC_USER_AGENT is generated by local setup from your existing identity or contact.
# SEC_CONTACT_EMAIL=your-real-contact@your-domain.com  # unattended setup input
# SEC_USER_AGENT="YourApp your-real-contact@your-domain.com"  # optional explicit override

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

### Automated Checks

```bash
node --test scripts/setup-env.test.mjs
bash -n setup-local.sh
pnpm exec tsx --test lib/api/financial-data-config.test.ts lib/api/financial-data.test.ts lib/api/sec-filings.test.ts lib/ai/tools/financial-tools.test.ts lib/agents/research.test.ts lib/portfolio/risk.test.ts
pnpm exec tsc --noEmit --incremental false
```

These checks use fixtures and do not prove live-provider entitlements, freshness,
SEC connectivity, deployment readiness or end-to-end model execution.

1. **Test current system**: `pnpm dev` + `npx inngest-cli dev` → `/agents`
2. **Run Full Analysis** on AAPL with peers MSFT, GOOGL
3. **Run Bull vs Bear Debate** on any ticker
4. **Check Inngest dashboard** at localhost:8288 for execution traces
5. **Pick Phase 1 item** to implement first (recommend: SEC Filings or Earnings)