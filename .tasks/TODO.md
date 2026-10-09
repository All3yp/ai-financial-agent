# TODO — Implementation Tasks And Verified Progress

This file tracks actionable implementation tasks and verified progress. Current
capabilities and user instructions live in the [User Guide](../docs/GUIA_DO_USUARIO.md),
[Architecture And Agents](../docs/ARQUITETURA_E_AGENTES.md), and
[Data Provider Guide](../docs/PROVEDORES_DE_DADOS.md).

## Current Activities

Execute the activities in this order. Read the corresponding specification
before making changes.

- [x] [Activity 01 — Update local Copilot agents and project-review contracts](01-copilot-agent-review.md)
- [x] [Activity 02 — Implement optional decision-model support in the financial application](02-financial-decision-support.md)

Activity 01's local agent frontmatter, discovery/delegation, declared tool paths and development/runtime documentation alignment were validated in this workspace. No runtime project-review bridge exists; the proposed contract remains non-executable, and host/account-specific VS Code diagnostics remain outside the available evidence.

Activity 02 implements default-off deterministic evidence-gap checking for the queued debate workflow, with bounded contracts, persisted decisions, chat-only model filtering, tests, and a synthetic evaluator. The Decisions API schema was not verified and no external adapter ships; the gate does not establish freshness, source correctness, recent-event coverage, or semantic conflict detection. See the activity record for exact validation results.

Activity 02 depends on the contracts and agent responsibilities established
in Activity 01.

The activity files contain implementation instructions and acceptance criteria.
This TODO file tracks their status; it does not duplicate their specifications.

Mark an activity complete only after its implementation and required checks
have been verified. Record remaining limitations in the corresponding activity
file and keep unfinished work unchecked.

Documentation links assume the existing guides are in `docs/`; verify their actual paths locally. Historical completion statuses below are preserved from the supplied TODO, not independently revalidated in this delivery.

## Runtime Workflow And Prompt Map

This is the source map for extending actual application workflows. `.github/agents/*.agent.md` and `.github/copilot-instructions.md` configure development-time Copilot personas; they do not register or execute financial application agents.

| Concern | Runtime owner | What to change when extending |
| --- | --- | --- |
| Manual workflow request and auth | `app/api/agents/trigger/route.ts` | Add or route an authenticated workflow request; keep it queued-only. |
| Manual input schema and workflow type | `lib/agents/run-store.ts` (`workflowRunSchemas`, `manualAgentWorkflowTypes`) | Add strict bounded input and the new manual type. |
| Inngest event name and sender | `lib/agents/client.ts` (`AgentEvents`, `request*`) | Add the typed request event helper. |
| Durable workflow steps | `lib/agents/workflows.ts` | Implement stable named Inngest steps and owner-scoped run persistence. |
| Inngest registration | `app/api/inngest/route.ts` | Register every new Inngest function here. |
| Workflow controls | `components/agent-dashboard.tsx` | Add a user-facing trigger only when the workflow needs a dashboard control. |
| Runtime specialist agents and data tools | `lib/agents/specialized.ts`; shared task/model calls in `lib/agents/base.ts` | Update the actual `execute` path and its data/tool contract; a prompt string or model ID alone does not make an agent execute an LLM. |
| Analysis user prompt | `lib/agents/analysis-context.ts` (`buildAnalysisPrompt`) | Update the prompt actually passed by `AnalysisAgent.execute`. |
| Debate synthesis prompt | `lib/agents/workflows.ts` (`runDebateWorkflow`) | Update the prompt at the existing persisted synthesis step. |
| Chat system/task-decomposition prompts | `lib/ai/prompts.ts`; `app/(chat)/api/chat/route.ts` | Update the system prompt or the inline task-decomposition prompt used by chat. |
| New-chat title prompt | `app/(chat)/actions.ts` (`generateTitleFromUserMessage`) | Update the server action's actual title prompt. |
| Chat-capable model catalog | `lib/ai/model-catalog.ts`, `lib/ai/models.ts` | Register endpoint capability and keep decision-only endpoints out of chat paths. |

Current registered manual workflows: `analysis` = Research -> Analysis plus peer research -> Report; `debate` = Research -> Bull/Bear in parallel -> synthesis -> Report (with the optional default-off evidence-gap gate after Research); `screening` = Screener; `monitoring` = Monitor. Their manual event consumers are `runAnalysisWorkflow`, `runDebateWorkflow`, `runScreeningWorkflow`, and `runMonitoringWorkflow` in `lib/agents/workflows.ts`.

Current scheduled/internal functions registered by `app/api/inngest/route.ts`: `scheduledMonitoring` dispatches due opted-in portfolio monitoring every 15 minutes; `dailyScreening` runs four screens weekdays at 17:00 UTC; `runReportWorkflow` consumes the internal `agent/report.requested` event and is not a manual trigger type; `cleanupExpiredAgentRuns` deletes expired runs daily at 03:00 UTC. Daily screening result persistence remains incomplete. The quantitative API/CLI in `lib/agents/quantitative.ts` and `scripts/agent-analyze.ts` are separate deterministic paths, not these LLM workflows.

Prompt execution caveat verified in `lib/agents/specialized.ts`: `AnalysisAgent` and `ReportAgent` call chat completions with configured system prompts. `ResearchAgent`, `ScreenerAgent`, and `MonitorAgent` currently execute deterministic data/tool code and do not call their configured model/system-prompt fields. Their prompt strings must not be presented as active runtime prompts unless the `execute` behavior changes.

- [ ] Inventory active vs. unused runtime prompt definitions and centralize the active workflow prompts in an authoritative module without creating a second agent framework. Preserve workflow ownership, input/tool contracts and behavior; label or remove unused prompt strings from Research/Screener/Monitor; add prompt-call tests and update this map when workflows change.

## Task Completion Rules

- Fix warnings encountered in build, typecheck, lint, tests and package-manager commands before declaring the affected work done; do not suppress warnings as a substitute. If a warning cannot be fixed safely in the current scope, record its exact cause as unchecked follow-up work and do not describe that command as warning-free.
- Commit completed task changes. Keep commit subjects direct and concise (one line, at most two short phrases); do not include unrelated user changes.
- Keep the final completion summary to at most two direct sentences.

---

## ✅ Completed Activities (Verified)

- **Activity 01** — Local Copilot agents audit, project-review contracts, 14 agents validated. See `.tasks/01-copilot-agent-review.md`
- **Activity 02** — Deterministic evidence-gap checking for debate workflow (default-off), bounded contracts, persisted decisions, tests, synthetic evaluator. See `.tasks/02-financial-decision-support.md`

---

## 📋 Backlog (Not Started)

All items below are backlog — not implemented, not validated. Implement only after prerequisites satisfied.

### Outstanding Dependency Warnings

- [ ] Resolve package-manager deprecation and peer warnings through scoped compatibility upgrades; validate each affected workflow before marking complete. Observed warnings: deprecated `eslint@8.57.1` with `eslint-config-next@14.2.5`; deprecated `inngest@3.28.0`; deprecated `drizzle-kit@0.25.0` transitive `@esbuild-kit/core-utils@3.3.2` and `@esbuild-kit/esm-loader@2.6.5`; other deprecated transitive packages reported by pnpm (`@humanwhocodes/*`, `acorn-import-assertions`, `glob@7.2.3`, `inflight`, `node-domexception`, `rimraf@3`, `serialize-error-cjs`, `whatwg-encoding`); OpenTelemetry peer mismatch (`@opentelemetry/api@1.9.0` versus `sdk-logs@0.46.0` / core/resources requiring `<1.8.0`); Zod peer mismatch (`zod@3.22.4` versus `openai@4.96.0` and `zod-to-json-schema@3.24.5`). Do not bundle major Inngest, ESLint/Next, Drizzle, OpenTelemetry or schema upgrades into unrelated feature work.

## Implementation Policy And Verified Progress

Financial Datasets is retained, not replaced. Optional providers supplement it.
Only tested behavior is marked complete; a tool name, placeholder, prompt or
synthetic dataset does not count as a completed integration.

The portfolio module implements a local subset of the Portfolio And Risk Engine tasks. SEC discovery and
Form 4 parsing implement parts of the Core Data Expansion tasks. All unchecked items remain backlog,
not silently discarded or considered complete.

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

## Persistent And Reliable Autonomous Operation

These prerequisites come before promising unattended monitoring or remote
notifications. Owner-scoped portfolios/watchlists, holding snapshots, caller-
submitted price histories, manual workflow runs and configurable per-portfolio
monitoring runs/schedules now have durable records. Scheduled daily screening,
notification delivery and separate report/screening-result entities remain
unimplemented.

- [x] Add owner-scoped portfolio/watchlist persistence: schema, migrations,
validated CRUD, import/export, and tests for cross-user isolation.

Portfolio and watchlist data use `Portfolio`, `PortfolioHolding`, `Watchlist`
and `WatchlistTicker` tables, with cascading owner/parent foreign keys and
per-owner collection-name uniqueness. Authenticated CRUD is available at
`/api/portfolio`, `/api/portfolio/[id]`, `/api/watchlists` and
`/api/watchlists/[id]`. `GET /api/portfolio` exports a versioned JSON bundle;
`PUT /api/portfolio` imports it by merging collections by owner and name,
replacing holdings/tickers only for collections present in the import. Omitted
collections are left unchanged. Inputs are strict and bounded (1 MiB request,
50 collections per type, 100 holdings per portfolio, 500 tickers per watchlist).
Every record lookup and mutation is owner-filtered; foreign IDs return the same
404 as missing IDs. Apply migrations with `pnpm db:migrate` against the intended
`POSTGRES_URL` before using these routes. Cross-user, validation, size-limit and
import/export behavior has fixture-backed coverage in
`lib/portfolio/persistence-http.test.ts`.

- [x] Store holding snapshots and caller-submitted price histories with currency,
adjustment basis, source, observed-at/as-of timestamps and staleness checks;
do not treat manually uploaded quantitative JSON as an automatically updated
portfolio.

`POST /api/portfolio/[id]/snapshots` captures current holdings and caller-
supplied prices as an immutable snapshot; `GET` lists snapshots in 100-record
cursor pages. `POST /api/portfolio/[id]/price-history` saves up to 12 histories
of 251 dated prices each; repeated submissions replace the rolling series for
that portfolio/ticker/source. Both require an existing owner-scoped portfolio,
exact portfolio currency, dates no more than seven days old, and explicit source
and adjustment-basis fields. Source/basis claims are caller-declared, not
independently verified; `unknown` remains unknown. The shared price client does
not establish currency or adjustment basis, so these endpoints do not fetch
prices automatically or feed the risk/quantitative tools. Manual quantitative
JSON uploads remain separate.

- [ ] Persist all job runs, statuses, step results, errors, reports and screening
results; connect dashboard History/status to those records and define retention.

All four manual workflows (analysis, debate, screening, monitoring) create an
owner-scoped `AgentRun` before enqueueing. Statuses, step results, final outputs
and sanitized failures are persisted. Authenticated owner-filtered history and
detail are available at `/api/agents/runs` and `/api/agents/runs/[id]`; the
`/agents` History tab polls status while open. Manual runs are queued-only and
return HTTP 202. Submit `Idempotency-Key` as a UUID; same-owner/key/workflow/
input retries reuse the run, while changed input returns 409. The key is also
the Inngest event ID. Run creation is serialized per owner and at most three
manual runs may be active per user. Records expire after 90 days and a daily
03:00 UTC Inngest job deletes expired records with cascading step cleanup.

Scheduled portfolio monitoring also creates an owner-scoped run per portfolio
and schedule occurrence, storing monitor-step results and sanitized failures.
However, the daily screening cron still does not persist runs/results, and
separate report/screening-result entities and dashboard history for that cron
are not implemented. Deployments must register Inngest functions and apply
migrations for these paths to work.

- [x] Choose queued/background execution with run ID and status polling for
manual agent triggers; remove their duplicate synchronous execution.
- [x] Add idempotency keys, bounded manual-run concurrency and per-user limits.
- [x] Add default-off, owner-scoped portfolio monitoring consent and durable
scheduled monitoring statuses/results.
- [x] Add configurable per-portfolio daily/weekly/monthly monitoring frequency,
timezone, local time, weekday/month-day and pause/resume controls.
- [ ] Complete scheduled monitoring policy for exchange sessions, holidays,
stale data and provider quotas; do not describe it as exchange-hours aware.

`monitoringEnabled` defaults to `false`. The authenticated `/agents` Monitoring
tab controls consent and schedule settings. Monthly dates are limited to 1-28.
A 15-minute UTC dispatcher evaluates local schedules with timezone/DST offsets;
a wall time that does not exist during spring-forward is skipped until its next
occurrence. Schedules do not skip holidays or market closures. Stale-price
gating, shared provider quota coordination and per-user concurrency for scheduled
work remain incomplete.

- [ ] Add an opt-in notification outbox with deduplication, bounded retries,
throttling, delivery status, quiet hours and revocation. Begin with concise
summaries/critical alerts that omit holdings and secrets by default.
- [ ] After durable runs, ownership checks and opt-in controls exist, implement
Telegram as a private notification/control channel: short-lived single-use
account-link codes, unlink/revoke, server-only bot token, webhook secret
validation, bounded request parsing, update deduplication and authorization for
deterministic commands such as `/status`, `/ultimo_relatorio`, `/pausar` and
`/retomar`. Never let a chat command authorize trades or rebalance.
- [ ] Harden account identity and authorization before exposing portfolio data
or controls remotely; audit ownership checks on every route and define secret
handling, data minimization, consent, retention and backup/restore procedures.
- [ ] Add operational health checks and alerts for missed/failed/stale runs,
provider failures, exhausted quotas, notification failures and Inngest
configuration; document deployment, recovery and migration procedures.

## Core Data Expansion

- [x] SEC discovery, Company Facts and supported filing sections.
  - [x] `getSECFilings` metadata and official links for supported filings.
  - [x] Bounded historical submissions pagination and optional amendments.
  - [x] Automatic `SEC_USER_AGENT` setup without erasing existing settings.
  - [x] Standard company-wide XBRL observations via SEC Company Facts JSON.
  - [x] Heading-based Business, Risk Factors and MD&A extraction for supported
 10-K/10-Q HTML documents.
  - [ ] Full financial-statement reconstruction and custom dimensional XBRL.
- [x] `getSECInsiderTransactions(ticker)` parses reported Form 4/4-A
non-derivative and derivative transactions.
- [ ] Earnings intelligence: transcripts, earnings calendar, analyst estimates
and revisions, and guidance history.
- [ ] Institutional holdings (13F) by ticker and short-interest data.
- [ ] Options chain, unusual activity, Greeks exposure and max pain.

SEC calls require a real `SEC_USER_AGENT` contact, are spaced at least 200 ms
apart per process, have bounded client-local caching and a 15-second timeout,
and do not automatically retry blocks/429 responses. Multi-process deployments
still need shared rate coordination. Form 4 parsing downloads only discovered
primary documents (5 MB maximum), validates issuer CIK and form, preserves SEC
transaction codes and leaves missing values null. It does not infer trading
intent, unreported activity, 13D/13G beneficial ownership or cluster behavior.

The other ownership, transcripts, estimates, guidance and options items require
verified provider coverage/entitlements or a distinct SEC filing discovery
strategy. Do not treat the ticker's own submissions as a search index of all
institutions holding that ticker.

## Macro And Market Structure

- [ ] Macro data:
  - [x] `getYieldCurve({ startDate, endDate, asOf })` using official FRED yields
  and 2s10s/3m10y spreads.
  - [x] `getInflationData({ startDate, endDate, asOf, series })` using FRED CPI,
  core CPI, PCE, core PCE and PPI year-over-year values.
  - [ ] CME Fed rate expectations and upcoming economic calendar.
- [ ] Market breadth/internals: sector performance, advance/decline and highs/
lows, VIX term structure, and put/call ratios.
- [ ] Crypto, forex and commodity prices/futures.

FRED tools use `lib/api/macro-data.ts`, require the intended user's registered
`FRED_API_KEY` or request key, and require explicit `asOf` vintages. Yields are
percentages; spreads are percentage points from common non-null dates. Inflation
uses FRED `pc1` year-over-year transformation. Missing values remain null; no
forward fill. Bounds, malformed-response failures and redacted errors are tested.
Live FRED use still requires credentials. CME expectations and release calendars
need an authorized, verified source.

## Alternative Data

- [ ] Satellite parking/production, credit-card spending, web traffic/app
downloads, job postings and app-store data.
- Access requires verified authorized providers or user-supplied data; do not
scrape restricted services or claim free coverage.

## News And Sentiment NLP

- [ ] News sentiment (FinBERT/FinGPT), earnings surprise history, analyst rating
changes and news clustering.
- Existing headline retrieval is not sentiment analysis; model-generated
classifications need versioned evaluation and source/date preservation.

## Specialized Agents

- [ ] MacroAgent, EarningsAgent, OptionsAgent, CryptoAgent, CommodityAgent,
ForexAgent and FIIAgent; implement each only after its real data tools exist.
- [ ] Factor-decomposition RiskAgent; the deterministic historical risk-report
slice is implemented, but causal/factor decomposition remains pending.
- [ ] InsiderAgent for filing-based tracking and cluster interpretation; Form 4
transaction parsing exists, but an agent and cluster logic do not.

## Portfolio And Risk Engine

Implemented local subset: `lib/portfolio/risk.ts`, with fixture tests. Inputs are
caller-supplied same-currency dated histories and current holdings.

- [x] Historical VaR/CVaR, sample volatility, fixed-share drawdown and
concentration.
- [x] Aligned Pearson correlations and explicit caller-supplied stress shocks.
- [x] Structured deterministic reports, warnings and limitations.
- [x] Chat/tool connection, authenticated `POST /api/portfolio/risk` and
`pnpm portfolio:report input.json`.
- [x] Long-only minimum variance, equal risk contribution, HRP, covariance PCA
and explicit-factor regression.
- [ ] Automatic sourced-history acquisition and ingestion into quantitative
reports. Caller-submitted portfolio snapshots/history are persisted separately
and are not wired into these tools.
- [ ] Expected-return mean-variance objectives, turnover/cost/liquidity
constraints and historical validation.
- [ ] Historical crisis replay, inferred macro shocks, causal attribution and
realized performance attribution.

Risk tool/API/CLI share strict schemas and never call models or invent shocks.
Inputs are bounded; HTTP/CLI require authentication and cap input at 1 MiB.
Prices must be real, same-currency and consistently adjusted. Provenance, FX
conversion and corporate-action adjustment remain caller obligations.

`lib/portfolio/optimize.ts` uses `ml-matrix`, requires identical dated histories
(21-501 prices) for up to ten assets, and is long-only/fully invested. Minimum
variance uses projected gradient with a feasible weight cap; risk parity uses
positive coordinate descent; HRP uses correlation distance and deterministic
single-linkage ordering. Unsupported caps reject rather than approximate.
Exhausted solvers fail rather than claim convergence. No expected-return
forecast, taxes, fees, turnover, liquidity model or execution is included.

`lib/portfolio/factors.ts` uses symmetric eigendecomposition for covariance PCA
and SVD for optional regression against 1-5 explicit factor histories. It
requires 2-10 assets with identical dated histories. Regression models DAILY
REBALANCED weights, not fixed-share holdings; neither PCA nor regression implies
causal or realized attribution.

## Multi-Agent Market Analysis

- [x] Deterministic historical regime indicators and sector-proxy momentum
rankings (`analyzeMarket`), with configurable horizons, volatility thresholds,
common-date alignment and effective `asOf` reporting.
- [x] MarketRegimeAgent, SectorRotationAgent, TimeHorizonAgent and deterministic
QuantitativeTeamOrchestrator.
- [ ] AssetAllocationAgent, ConservativeModeAgent, AggressiveModeAgent and
traditional TeamOrchestrator; FII-specific strategies remain unsupported.

`lib/market/analysis.ts` uses caller-supplied real dated histories, an explicit
market benchmark and sector proxies. Default windows use 20/60/200 common
observations and require 201 prices; payloads are bounded to 12 series of 501
prices. Labels are descriptive threshold classifications, not predictions or
trading instructions. The quantitative team preserves conflicting horizons and
relative lagging rather than manufacturing consensus. It makes no model/network
calls. Live sourced-history acquisition and schedule integration remain pending.

## Execution Beyond Chat

- [x] Authenticated portfolio risk REST endpoint and local report CLI.
- [x] Authenticated quantitative analysis REST subset and quantitative team CLI.
- [x] Manual analysis/debate/screening/monitoring triggers are queued-only,
owner-scoped, idempotent, concurrency-bounded and status-polled.
- [x] Opt-in owner-scoped portfolio monitoring with durable scheduled run
status, step results and timezone-aware daily/weekly/monthly schedules.
- [ ] Scheduled daily screening persistence, durable scheduled reports, complete
REST coverage, user-facing schedule history and alert delivery.
- [ ] Conservative/aggressive ticker-only CLI modes; current quantitative CLI
requires bounded `{ market, portfolio? }` fixture/input JSON.
- [ ] Real-time regime/allocation widgets and auto-rebalancing; no trades or
execution strategy are implemented.

## Infrastructure And Observability

- [ ] Vector DB RAG, Redis/Upstash distributed coordination, time-series storage,
WebSocket price/alert streaming, production Inngest Cloud and tracing/cost tools.
- [x] Repeatable local fixture tests, typecheck and application-build commands.
- [ ] Dedicated model/agent evaluation suite with versioned golden cases,
quality/safety criteria, provider compatibility, cost and latency tracking.
Current fixture regression is not model evaluation, backtesting or validation on
licensed market datasets.
- Infrastructure deployment requires intended credentials, authorization,
persistence configuration and operational testing; no placeholders are deployed.

## Agent-Team Implementation Tasks

The following unchecked tasks are proposed implementations, not validated targets or guarantees. Implement them only after their data, numerical validation, and operational prerequisites are satisfied.

### Conservative Mode

- [ ] Implement and validate a conservative research workflow after macro, FII, dividend, and bond data coverage is verified.

`Orchestrator -> [MacroAgent, FIIAgent, DividendAgent, BondAgent] -> Synthesis -> Allocation`

Example output: monthly income portfolio. The illustrative yield/volatility
figures previously associated with this mode are not validated targets.

### Balanced Mode

- [ ] Implement and validate a balanced research workflow after sector, factor, and quality data tools exist.

`Orchestrator -> [MacroAgent, SectorAgent, FactorAgent, QualityAgent] -> Synthesis -> Allocation`

Example sketch: core/satellite portfolio with factor tilts and periodic review;
no allocation strategy is implemented.

### Aggressive Mode

- [ ] Implement and validate an aggressive research workflow after momentum, growth, crypto, and small-cap coverage is verified.

`Orchestrator -> [MomentumAgent, GrowthAgent, CryptoAgent, SmallCapAgent] -> Synthesis -> Allocation`

Example sketch only; crypto and small-cap source coverage and strategy are not
implemented.

### Market Regime Detection

- [ ] Implement an opt-in scheduled regime event system with freshness checks, durable runs, and delivery controls; preserve the distinction between historical descriptions and forecasts.

The proposed hourly regime broadcast is not implemented as a continuous event
system. Existing labels are historical descriptions, not forecasts.

## Local Checks And External Blockers

Run from the repository root:

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
SEC connectivity, deployment readiness or end-to-end model execution. `next build`
checks the application without changing the database; the existing `pnpm build`
also runs migrations and must use the intended database.

Current external blockers: live SEC calls need a real contact in `SEC_USER_AGENT`;
FRED and production Inngest need intended credentials; paid/entitled transcripts,
options, ownership/short-interest and alternative data require authorized
contracts; webhook destinations and production storage/cache/vector credentials
are not provided. No paid account or guessed credentials are created
automatically.

Suggested manual smoke tests, after configuring the required local services:

1. Start `pnpm dev` and `npx inngest-cli dev`, then open `/agents`.
2. Run Full Analysis on AAPL with peers MSFT and GOOGL.
3. Run Bull vs Bear Debate on a ticker.
4. Inspect Inngest run traces at the CLI-provided dashboard URL.
5. Choose a remaining Core Data Expansion provider-backed task only after verifying access,
   entitlements and usage rights.
