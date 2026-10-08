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

See [Data Provider Guide](docs/PROVEDORES_DE_DADOS.md) for current adapters and
proposed EODHD, yfinance, Nasdaq Data Link, CoinGecko and GDELT integrations.
These candidates are not selectable providers yet. Parquet/DuckDB and a custom
MCP server are architectural options, not implemented infrastructure.

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
  10-K/10-Q HTML documents. `getSECInsiderTransactions` parses reported
  non-derivative and derivative rows from Form 4/4-A. Full statement
  reconstruction and OCR remain unavailable.
- ❌ Earnings call transcripts
- ❌ Analyst estimates/ratings
- SEC Form 4/4-A reported transactions are available through
  `getSECInsiderTransactions`; this does not infer trades or unreported activity.
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

## Roadmap

Implementation backlog, verified progress, future agent-mode sketches, local checks and external blockers are maintained in [docs/ROADMAP.md](docs/ROADMAP.md), not in this agent context file.

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