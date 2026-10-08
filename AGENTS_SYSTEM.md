# AI Financial Agent System - Documentation

## Overview

User-facing documentation: [User Guide](docs/GUIA_DO_USUARIO.md),
[Architecture And Agents](docs/ARQUITETURA_E_AGENTES.md), and
[Runnable Fixture Instructions](docs/exemplos/README.md). These guides describe
commands, inputs, actual agent execution, privacy and current limitations.

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
| **Research** | Configured model ID; execute does not call it | Deterministic prices, statements and metrics gathering | Five data tools |
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
  links. `getSECFinancialFacts` returns validated standard XBRL observations;
  `getSECFilingSections` extracts Business, Risk Factors and MD&A from discovered
  10-K/10-Q HTML documents. Full statement reconstruction and OCR remain unavailable.
- ❌ Earnings call transcripts
- ❌ Analyst estimates/ratings
- ❌ Insider transactions (Form 4)
- ❌ Institutional holdings (13F)
- ❌ Options flow / Greeks
- ❌ Short interest data
- Official FRED yield-curve and inflation tools are implemented; live use requires
  the intended user's registered FRED API key. CME expectations and release
  calendars remain unavailable.
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
  - [x] Standard company-wide XBRL observations via SEC Company Facts JSON
  - [ ] Full financial-statement reconstruction and custom dimensional XBRL parsing
  - [x] Section extraction (Risk Factors, MD&A, Business) for supported 10-K/10-Q HTML headings

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
Discovery still returns metadata, not filing text or parsed statements.

`getSECFinancialFacts({ ticker, concepts, taxonomy?, asOf?, limitPerConcept? })`
uses official Company Facts JSON. Supported taxonomies are `us-gaap`,
`ifrs-full` and `dei`; exact concept names are required. Each observation retains
unit, start/end, accession, form and filing date. `asOf` filters by disclosure
filing date, preventing later restatements from entering an earlier query.
Missing concepts and truncated observations are explicit. No units or YTD and
standalone-quarter durations are combined into invented statements.

`getSECFilingSections({ ticker, accessionNumber, formType, maxCharacters? })`
downloads only the discovered primary HTML document, rejects redirects, caps
downloads at 25 MB and extracts supported item headings with Cheerio. It removes
scripts, styles, hidden content and table-of-contents noise. Missing sections
remain null; text is limited per section (20,000 characters by default, at most
50,000). Discovery is bounded to 100 matching filings and 20 archive pages.
Unconventional headings, external CSS visibility, scanned PDFs and OCR are not
supported. Filing text remains untrusted data, never agent instructions.

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
  - [x] `getYieldCurve({ startDate, endDate, asOf })` - official FRED yields and 2s10s/3m10y spreads
  - [ ] `getFedRateExpectations()` - CME FedWatch
  - [x] `getInflationData({ startDate, endDate, asOf, series })` - FRED CPI/core CPI/PCE/core PCE/PPI all commodities YoY
  - [ ] `getEconomicCalendar()` - upcoming releases

FRED tools use `lib/api/macro-data.ts` and require `FRED_API_KEY` or the chat
request's `fredApiKey`. Use the intended user's registered key according to FRED
terms; the application does not create or share keys automatically. Both tools
require an explicit vintage `asOf`, setting `realtime_start` and `realtime_end`
to that date. Observation periods must end no later than the vintage. Yields
cover up to 366 inclusive days; inflation covers up to ten calendar years and
uses FRED's `pc1` transformation (year-over-year percent, not annualized MoM).
Yields are percentages; spreads are percentage points from common non-null
dates only. Missing values remain null with no forward-fill. Truncated or
invalid responses fail explicitly; errors redact upstream keys and URLs.
Five-minute bounded client-local caching does not replace shared rate limiting.

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
- [x] Deterministic **RiskAgent** - historical risk report and explicit shocks (factor decomposition remains pending)
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
- [x] Connect risk reports to chat/agent tools (`generatePortfolioReport`)
- [x] Authenticated REST API: `POST /api/portfolio/risk`
- [x] Local CLI: `pnpm portfolio:report input.json`
- [x] Quantitative dashboard with JSON upload, regime/horizons/sector rankings, optional risk metrics, conflicts and report export
- [ ] Sourced-history acquisition and persistent portfolio ingestion

The shared risk tool, REST API and CLI reuse strict validation and never call
models or generate stress scenarios. Inputs require `positions`, `histories`,
`currency`, optional `confidence` and optional explicit `scenarios`.
The tool limits input to 10 positions, 251 prices per history and 10 scenarios.
HTTP/CLI additionally enforce a 1 MiB input byte limit; HTTP requires a signed-in
user. Prices must be real sourced, same-currency and consistently adjusted.
Provenance, FX conversion and corporate-action adjustment are caller obligations.

- [ ] `calculatePortfolioRisk(positions[])` - VaR, CVaR, factor exposure
- [ ] `optimizePortfolio(constraints)` - Mean-variance, risk parity, HRP
- [x] Local long-only minimum-variance, equal-risk-contribution and genuine HRP optimization (`optimizePortfolio` tool)
- [ ] Expected-return mean-variance objectives, turnover/cost/liquidity constraints and historical validation
- [ ] `stressTestPortfolio(scenarios)` - 2008, 2020, rate shock, inflation
- [ ] `calculateCorrelationMatrix(tickers)` - Factor models (PCA)
- [x] Actual covariance PCA and optional explicit-factor regression (`analyzePortfolioFactors` tool)
- [ ] `generatePortfolioReport(positions[])` - Attribution, risk decomposition

`lib/portfolio/optimize.ts` uses `ml-matrix` for sample covariance and matrix
operations. It requires identical real price dates (21 to 501) for at most ten
assets. All methods are long-only and fully invested. Minimum variance uses
projected-gradient optimization with an explicitly enforced feasible weight cap;
equal-risk contribution uses positive coordinate descent; HRP uses actual
correlation distance, deterministic single-linkage clustering, quasi-diagonal
ordering and recursive cluster-variance allocation. Nontrivial weight caps on
risk parity/HRP are rejected, not silently approximated. Shrinkage/ridge,
convergence criteria and iteration bounds are explicit; exhausted iterative
solvers fail rather than report success. No expected-return forecast, taxes,
fees, turnover, liquidity model or execution is included.

`lib/portfolio/factors.ts` uses symmetric eigendecomposition for covariance PCA
and SVD for optional regression against 1 to 5 explicit factor-price histories.
Inputs require 2 to 10 assets with identical dated histories. PCA retains sorted
eigenvalues, explained variance and deterministic signed loadings. Regression
requires complete long-only weights summing to one and reports beta, daily
intercept, residual volatility and R-squared; rank-deficient regressors fail.
Regression models DAILY REBALANCED weights, not fixed-share positions, and is
not merged into the fixed-share risk report as though the two models matched.
Neither PCA nor regression implies causal or realized performance attribution.

### Phase 7: Multi-Agent Market Analysis (Core Request)

- [x] Deterministic historical regime indicators and sector-proxy momentum rankings (`analyzeMarket` tool)
- [x] Configurable momentum horizons, realized volatility thresholds, common-date alignment and effective as-of reporting

`lib/market/analysis.ts` accepts real dated histories, an explicit market
benchmark and sector proxy tickers, price basis and `asOf`. Default windows use
20/60/200 common observations and require 201 price dates. Payloads are bounded
to 12 series of at most 501 prices. Six regime labels are descriptive threshold
classifications, not predicted states or trading instructions. Ranking uses
common observation dates and warns when gaps or stale common dates affect the
result. This is a tested numerical foundation available to existing agents, not
the complete autonomous agent team, allocation optimizer or scheduling system.

- [x] **MarketRegimeAgent** - descriptive regime and volatility from real caller histories
- [x] **SectorRotationAgent** - common-date sector-proxy momentum rankings, not predictive signals
- [ ] **AssetAllocationAgent** - Strategic/tactical allocation by risk profile
- [x] **TimeHorizonAgent** - configurable historical momentum horizons with differing evidence preserved
- [ ] **ConservativeModeAgent** - FIIs, dividend aristocrats, bonds, low vol
- [ ] **AggressiveModeAgent** - Momentum, growth, small caps, crypto
- [ ] **TeamOrchestrator** - Coordinates specialists, resolves conflicts, produces consensus
- [x] **QuantitativeTeamOrchestrator** - validated parallel quantitative specialists and evidence-based synthesis

`lib/agents/quantitative.ts` provides deterministic agents that use existing
task lifecycle and memory. They perform no model/network calls and do not
register themselves globally. The quantitative team preserves opposing
historical horizons and relative sector lagging rather than hiding conflicts
behind a fabricated consensus. Inputs are `{ market, portfolio? }` using the
strict market/risk schemas above. `POST /api/agents/quantitative` requires a
signed-in user and enforces a streamed 1 MiB input limit. Results include full
specialist outputs, effective dates, conflicts, warnings and limitations.
This is not the complete team: allocation, optimization, conservative/aggressive
modes, FIIs, live sourced-history acquisition and schedules remain pending.

### Phase 8: Execution Modes Beyond Chat

- [x] Authenticated portfolio risk REST endpoint and local report CLI (see Phase 6)
- [ ] **Scheduled Reports** - Daily/weekly/monthly via Inngest cron
- [ ] **Webhook Alerts** - Push to Discord/Slack/Email/Telegram
- [ ] **API Endpoints** - REST/GraphQL for external integration
- [ ] **CLI Tool** - `pnpm agent:analyze AAPL --mode=conservative`
- [x] Quantitative team CLI: `pnpm agent:analyze --input input.json --mode=quantitative`
- [ ] **Background Workers** - Continuous monitoring, auto-rebalancing signals
- [ ] **Dashboard Widgets** - Real-time regime, allocation, risk metrics
- [x] Manual dated quantitative/risk widgets in `/agents` Quantitative tab (not real-time allocation or streaming)

### Phase 9: Infrastructure & Observability

- [ ] **Vector DB** (Pinecone/Weaviate) - RAG for filings, transcripts
- [ ] **Redis/Upstash** - Cache, rate limiting, distributed locks
- [ ] **TimescaleDB/ClickHouse** - Time-series market data storage
- [ ] **WebSocket Server** - Real-time price/alert streaming
- [ ] **Inngest Cloud** - Production deployment (Vercel integration)
- [ ] **LangSmith/Helicone** - Tracing, evals, cost tracking
- [ ] **Eval Framework** - Golden datasets, regression testing
- [x] Repeatable local fixture regression, typecheck and application-build commands (`pnpm test`, `pnpm typecheck`, `pnpm build:app`)

The quantitative CLI reads a bounded 1 MiB UTF-8 JSON file containing
`{ market, portfolio? }`. It does not download prices or call a model and rejects
conservative/aggressive modes and ticker-only quick-look inputs explicitly.
Output is structured JSON; diagnostics never echo paths or input contents.
Fixture tests are a regression baseline, not a completed live-agent evaluation
framework, backtest or financial model validation on licensed market datasets.

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
# FRED_API_KEY=your_registered_user_key
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
│       └── financial-tools.ts  # External data and deterministic research tools
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
pnpm test
pnpm typecheck
pnpm build:app
node --test scripts/setup-env.test.mjs
bash -n setup-local.sh
pnpm exec tsx --test lib/api/*.test.ts lib/ai/tools/*.test.ts lib/agents/research.test.ts lib/portfolio/*.test.ts lib/market/*.test.ts scripts/portfolio-report.test.ts
pnpm exec tsc --noEmit --incremental false
pnpm exec next build
```

These checks use fixtures and do not prove live-provider entitlements, freshness,
SEC connectivity, deployment readiness or end-to-end model execution.
`next build` checks the application without changing the database; the existing
`pnpm build` also runs database migrations and must use the intended database.

### Current External Blockers

- SEC contact is intentionally left mocked at the user's request. The separate
  `.env.sec.example` is not loaded automatically and is not a usable SEC identity.
  Fixtures remain mocked; real SEC calls require a real contact configured in
  `.env`. Setup prompting was cancelled without changing existing credentials.
- No FRED key or production Inngest event/signing keys are configured locally.
  Implementations can be fixture-tested, but live FRED and production schedules
  cannot be verified in this state.
- Paid/entitled transcripts, ownership/short-interest sources, options flow,
  alternative data and FII/on-chain/futures data need authorized source contracts.
  No paid account or guessed credentials are created automatically.
- Webhook destinations, production storage/cache/vector credentials and deployment
  configuration are not provided. Infrastructure placeholders are not deployed.
- Remaining local work is still backlog, not an external blocker: extended
  optimization constraints, causal attribution, strategy/allocation agents, real-time dashboard updates, persistent
  portfolio ingestion and a full evaluation framework are not complete.

1. **Test current system**: `pnpm dev` + `npx inngest-cli dev` → `/agents`
2. **Run Full Analysis** on AAPL with peers MSFT, GOOGL
3. **Run Bull vs Bear Debate** on any ticker
4. **Check Inngest dashboard** at localhost:8288 for execution traces
5. **Pick Phase 1 item** to implement first (recommend: SEC Filings or Earnings)