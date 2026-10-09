# TODO — Active Work, Priorities, and Verified History

## ✅ Completed Activities

- [x] [Local Copilot agents and review contract](01-copilot-agent-review.md)
- [x] [Financial decision support](02-financial-decision-support.md)

---

## 🔴 PRIORITY 0 — CRITICAL: Autonomous Workflows & Multi-Asset Foundation

**These are blocking/architectural items that enable everything else. Must be addressed before or in parallel with Priority 1.**

### 0. Autonomous Market Analysis in Full Analysis Workflow
**ID:** Enhance `run-analysis-workflow` | **Trigger:** Automatic (part of existing workflow) | **Effort:** ~1-2 weeks
- **Problem:** Current Full Analysis requires user to specify ticker + peers; doesn't automatically run market regime, sector rotation, or cross-asset context
- **Solution:** Auto-invoke quantitative team (market-regime, sector-rotation, time-horizon) as parallel steps in analysis workflow; inject results into analysis prompt as market context
- **Value:** User gets complete picture (company + market + sector + regime) without knowing what to ask for; differentiates from chat-based tools
- **Prereqs:** Quantitative team already exists ✅; needs workflow orchestration update in `lib/agents/workflows.ts`
- **Status:** 🔴 READY TO START — minimal code change, high impact

### 1. Multi-Asset Quantitative Engine Foundation
**ID:** Multi-asset data + correlation + regime engine | **Effort:** ~3-4 weeks (phased)
- **Problem:** Entire quantitative stack is equity-only (SPY benchmark, sector ETFs, equity risk model)
- **Solution:** 
  - Phase 1: Add bond/commodity/FX price histories to market analysis (FRED, Treasury, commodity APIs)
  - Phase 2: Cross-asset correlation engine (regime-dependent correlation matrices)
  - Phase 3: Multi-asset regime detection (equity + rates + commodities + FX regimes)
  - Phase 4: Multi-asset optimization (Black-Litterman with regime priors, cross-asset constraints)
- **Value:** Enables all multi-asset workflows (Macro Allocation, Risk Budgeting, Portfolio Construction beyond equities)
- **Prereqs:** 
  - Data providers: FRED (rates), Treasury (yields), commodity/FX APIs (Alpha Vantage, Twelve Data)
  - Schema changes: `market` input to accept multi-asset histories, not just equity proxies
  - Correlation engine extension in `lib/portfolio/risk.ts` / `lib/market/analysis.ts`
- **Status:** 🟡 NEEDS ARCHITECTURE DESIGN — start Phase 1 data integration now

---

## 🔴 PRIORITY 1 — IMMEDIATE NEXT WORK (High User Value, Low Risk)

These are the highest-impact items to work on **now**. They leverage existing infrastructure and deliver core differentiation.

### 2. Portfolio Construction & Optimization Workflow (Multi-Asset Aware)
**ID:** `run-portfolio-construction-workflow` | **Trigger:** Manual (`agent/portfolio-construction.requested`) | **Effort:** ~2-3 weeks (multi-asset adds ~1 week)
- **Steps:** Screen candidates (equities + ETFs across asset classes) → Analyze top N (parallel) → Quant risk assessment (cross-asset) → Market regime (multi-asset) → Optimization (min-var/risk-parity/HRP with cross-asset constraints) → Rebalancing plan → Report
- **Value:** **Core differentiation** — bridges screening→analysis→actionable portfolio; quant+qual unique; premium feature; multi-asset ready
- **Prereqs:** User constraint UI (sector/asset-class caps, position limits, turnover budget), transaction cost model, cross-asset correlation (from Priority 0)
- **Status:** 🔴 READY TO START — optimization tool ✅, risk agent ✅, market regime ✅; multi-asset needs Priority 0 Phase 1

### 2b. Autonomous Screening → Construction Pipeline
**ID:** `run-autonomous-pipeline-workflow` | **Trigger:** Scheduled (weekly) + Manual | **Effort:** ~2 weeks
- **Problem:** User runs screen → manually picks → runs construction. Should be automatic.
- **Solution:** Chain daily screening → auto-select top candidates → run construction → present rebalancing plan. User only approves.
- **Value:** True autonomy; weekly touchpoint; reduces user decision fatigue
- **Prereqs:** Portfolio construction workflow (Item 2), screening workflow ✅, chain orchestration
- **Status:** 🟡 NEEDS ITEM 2 FIRST

### 3. Comparative Company Analysis Workflow
**ID:** `run-comparative-analysis-workflow` | **Trigger:** Manual (`agent/comparative.requested`) | **Effort:** ~1-2 weeks
- **Steps:** Parallel research (target + 5-8 peers) → Unified metrics → Comparative analysis → Moat assessment → Scenario analysis → Comparative report
- **Value:** Core analyst workflow (4-6 hrs → 5 min); consistent framework; corporate upsell potential
- **Prereqs:** Parallel research rate limits, comparative prompt/report templates
- **Status:** 🔴 READY TO START — extends existing analysis workflow

### 3. Earnings/Event-Driven Monitoring Workflow (with Autonomous Market Context)
**ID:** `run-earnings-monitoring-workflow` | **Trigger:** Scheduled (daily pre/post-market) + Manual | **Effort:** ~2-3 weeks
- **Steps:** Upcoming earnings → **Auto: Market regime + sector context** → Pre-earnings research/analysis (parallel) → Post-earnings monitoring → Revision tracking → Earnings scorecard with market/sector attribution
- **Value:** Highest-impact recurring events; daily touchpoint during earnings season; automates manual analyst process; **market context explains earnings reaction**
- **Prereqs:** Earnings calendar API (FMP/Alpha Vantage), post-earnings event triggers, **Priority 0 autonomous market analysis**
- **Status:** 🟡 NEEDS DATA PROVIDER — earnings calendar integration required first

### 3b. Autonomous Portfolio Monitoring Enhancement
**ID:** Enhance `run-monitoring-workflow` / `scheduled-monitoring` | **Trigger:** Automatic (part of scheduled) | **Effort:** ~1 week
- **Problem:** Current monitoring only checks price moves & basic metrics. No market/sector regime context.
- **Solution:** Auto-inject market regime, sector rotation, and cross-asset correlation alerts into monitoring checks. Alert when portfolio factor exposure conflicts with regime.
- **Value:** Monitoring becomes predictive, not just reactive; explains *why* alerts triggered
- **Prereqs:** Priority 0 autonomous market analysis, multi-asset correlation (Phase 2)
- **Status:** 🟡 NEEDS PRIORITY 0 FIRST

---

## 🟠 PRIORITY 2 — HIGH VALUE, MEDIUM EFFORT (1-2 months)

### 4. Portfolio Attribution & Performance Decomposition (Multi-Asset)
**ID:** `run-portfolio-attribution-workflow` | **Trigger:** Scheduled (monthly) + Manual | **Effort:** ~1-2 months
- **Steps:** Portfolio history → Benchmark alignment → Brinson attribution → Factor attribution → Risk decomposition → Regime consistency → Attribution report
- **Value:** Institutional-grade (Brinson + factor); explains *why* not just *what*; monthly recurring value
- **Prereqs:** Brinson attribution implementation, benchmark price history
- **Status:** 🟡 NEEDS CORE ENGINE — factor regression ✅, Brinson impl needed

### 5. Risk Budgeting & Stress Testing Workflow (Multi-Asset)
**ID:** `run-risk-budgeting-workflow` | **Trigger:** Manual + Scheduled (quarterly) | **Effort:** ~1-2 months
- **Steps:** Current risk decomposition (cross-asset) → Risk budget allocation (by asset class + factor) → Historical stress tests (2008, 2020, 2022 + regime-specific) → Custom scenarios (rates, FX, commodities) → Limit monitoring → Risk report
- **Value:** Institutional risk management; regulatory/compliance support; deterministic/auditable; premium positioning; **multi-asset complete**
- **Prereqs:** Stress test framework, risk budget data model, limit breach notifications, **Priority 0 multi-asset correlation**
- **Status:** 🟡 NEEDS CORE ENGINE — risk agent ✅, stress engine + budget framework needed, cross-asset from Priority 0

### 5b. Multi-Asset Factor Attribution & Risk Decomposition
**ID:** `run-multiasset-attribution-workflow` | **Trigger:** Scheduled (monthly) + Manual | **Effort:** ~2-3 months
- **Steps:** Multi-asset portfolio history → Multi-asset benchmark alignment → Cross-asset Brinson attribution → Multi-asset factor attribution (rates, FX, commodity factors) → Risk decomposition by asset class → Regime consistency across assets → Attribution report
- **Value:** **Only retail tool with multi-asset attribution**; explains performance across all asset classes; institutional-grade
- **Prereqs:** Priority 4 (equity attribution), multi-asset factor models, cross-asset benchmark data
- **Status:** 🟡 NEEDS PRIORITY 0 + 4 FIRST

---

## 🟢 PRIORITY 3 — STRATEGIC DIFFERENTIATION (3-6 months)

### 6. Sector/Theme Deep-Dive Workflow (Enhanced with Multi-Asset)
**ID:** `run-sector-deepdive-workflow` | **Trigger:** Manual | **Effort:** ~3-4 months
- **Value:** Automates 2-3 day analyst initiation; quant rotation + fundamental deep-dive unique; quarterly recurring; **adds rates/FX/commodity drivers per sector**
- **Prereqs:** GICS/industry mapping, industry-specific driver templates, parallel research for 8-10 tickers, **multi-asset macro drivers**

### 7. Idea Generation → Conviction Building Pipeline (Multi-Asset Funnel)
**ID:** `run-idea-pipeline-workflow` | **Trigger:** Scheduled (weekly) + Manual | **Effort:** ~4-6 months
- **Value:** Systematizes analyst funnel (50 ideas → 5 positions across asset classes); full evidence trail; weekly + deep-dive engagement; **includes bonds, commodities, FX, alternatives**
- **Prereqs:** Idea Funnel persistence, conviction methodology, funnel visualization UI, **multi-asset screening + research**

### 8. Macro-Regime Aware Asset Allocation Workflow
**ID:** `run-macro-allocation-workflow` | **Trigger:** Scheduled (monthly/regime change) + Manual | **Effort:** ~4-6 months
- **Value:** Multi-asset scope (rare in retail); dynamic not static 60/40; deterministic rules; monthly rebalance touchpoint
- **Prereqs:** Bond/commodity/FX price histories, cross-asset correlation engine, ETF universe, regime-allocation rules, **Priority 0 Phase 3-4**

### 9. Fixed Income & Credit Analysis Workflow
**ID:** `run-fixedincome-workflow` | **Trigger:** Manual + Scheduled | **Effort:** ~3-4 months
- **Steps:** Curve regime → Credit spread analysis → Issuer research (fundamentals, covenants) → Relative value (spread vs rating vs sector) → Portfolio integration → Report
- **Value:** **Major gap** — no retail tool does systematic credit analysis; high demand from RIAs/individuals moving to bonds
- **Prereqs:** Treasury curve data (FRED ✅), credit spreads (ICE/Markit or ETF proxies), issuer fundamentals, credit factor models
- **Status:** 🟡 NEEDS DATA PROVIDERS + PRIORITY 0

### 10. Commodities & Real Assets Workflow
**ID:** `run-commodities-workflow` | **Trigger:** Manual + Scheduled | **Effort:** ~3-4 months
- **Steps:** Supply/demand fundamentals → Term structure (contango/backwardation) → Roll yield analysis → Inflation linkage → Portfolio role (hedge/diversifier) → Report
- **Value:** Inflation hedge demand; term structure analysis unique; real assets allocation
- **Prereqs:** Commodity futures data, inventory/production data, roll yield engine, inflation correlation
- **Status:** 🟡 NEEDS DATA PROVIDERS + PRIORITY 0

---

## P0 — Reliability And Safety (Infrastructure)

- [ ] Persist scheduled daily-screening run statuses, results and reports; add owner-scoped history/UI and retention.
- [ ] Implement scheduled-monitoring stale-data gating, exchange-session/holiday policy, shared provider quotas and concurrency limits.
- [ ] Audit authorization and account isolation across portfolio, run, monitoring and remote-control routes; fix findings and document consent, secret handling, retention and backup/restore gaps.
- [ ] Add health signals for missed, failed or stale runs, provider/quota failures, notification failures and missing Inngest configuration; document recovery procedures.

## P1 — Existing Capability Improvements

- [ ] Connect saved price histories to quantitative reports through verified acquisition/ingestion or supported user import, with currency, adjustment, date, freshness and provenance validation.
- [ ] Add a versioned model/agent evaluation suite covering correctness, safety, provider compatibility, cost and latency.
- [ ] Inventory active and unused runtime prompts; consolidate active prompt ownership, export existing workflow/model catalogs through the public agent index and update registry documentation.
- [ ] Investigate actionable dependency warnings and apply compatible, scoped fixes with regression checks.

## P2 — Optional Capabilities

- [ ] Add earnings calendar, transcripts, estimates/revisions and guidance history.
- [ ] Add institutional holdings, short interest, options chains, Greeks and unusual-activity coverage.
- [ ] Add economic calendar/Fed expectations, market breadth, VIX term structure and put/call ratios.
- [ ] Extend portfolio optimization with expected returns, costs, turnover and liquidity constraints.
- [ ] Add historical crisis replay and portfolio attribution.
- [ ] Add specialized financial agents and portfolio modes.
- [ ] Add news sentiment analysis.
- [ ] Add alternative-data coverage.
- [ ] Add crypto, FX and commodity coverage.

## Deferred Tasks

- [ ] Add vector-database/RAG integration.
- [ ] Add Redis/Upstash distributed coordination.
- [ ] Add time-series infrastructure.
- [ ] Add WebSocket streaming.
- [ ] Integrate additional production observability platforms.
- [ ] Add real-time allocation widgets.
- [ ] Add automated rebalancing and trade execution.
- [ ] Implement an opt-in notification outbox with deduplication, bounded retries and delivery controls.
- [ ] Add Telegram notifications and authenticated controls with account linking, opt-in/revocation and operational safeguards.
- [ ] Add hourly regime broadcasts.
- [ ] Add conservative, balanced and aggressive strategy workflows.
- [ ] Implement an external Decisions API adapter.
- [ ] Implement the project-review/MCP integration.

## Completed Features

- [x] Owner-scoped portfolio/watchlist CRUD and import/export.
- [x] Holdings snapshots and caller-submitted price-history persistence.
- [x] Queued manual analysis, debate, screening and monitoring workflows with owner-scoped status/history, idempotency, bounded concurrency and retention.
- [x] Opt-in scheduled portfolio monitoring with timezone-aware daily/weekly/monthly schedules and pause/resume.
- [x] SEC filing discovery, supported filing sections, Company Facts and Form 4/4-A parsing.
- [x] FRED yield-curve and inflation tools.
- [x] Deterministic portfolio risk reports, supported optimization, factor/PCA analysis and authenticated API/CLI paths.
- [x] Deterministic historical market-regime and sector-proxy momentum analysis and quantitative team agents.
- [x] Bounded deterministic evidence-gap gate with server-side default-off mode, persisted decision metadata and chat/decision model separation.

- [ ] Add vector-database/RAG integration.
- [ ] Add Redis/Upstash distributed coordination.
- [ ] Add time-series infrastructure.
- [ ] Add WebSocket streaming.
- [ ] Integrate additional production observability platforms.
- [ ] Add real-time allocation widgets.
- [ ] Add automated rebalancing and trade execution.
- [ ] Implement an opt-in notification outbox with deduplication, bounded retries and delivery controls.
- [ ] Add Telegram notifications and authenticated controls with account linking, opt-in/revocation and operational safeguards.
- [ ] Add hourly regime broadcasts.
- [ ] Add conservative, balanced and aggressive strategy workflows.
- [ ] Implement an external Decisions API adapter.
- [ ] Implement the project-review/MCP integration.

## Completed Features

- [x] Owner-scoped portfolio/watchlist CRUD and import/export.
- [x] Holdings snapshots and caller-submitted price-history persistence.
- [x] Queued manual analysis, debate, screening and monitoring workflows with owner-scoped status/history, idempotency, bounded concurrency and retention.
- [x] Opt-in scheduled portfolio monitoring with timezone-aware daily/weekly/monthly schedules and pause/resume.
- [x] SEC filing discovery, supported filing sections, Company Facts and Form 4/4-A parsing.
- [x] FRED yield-curve and inflation tools.
- [x] Deterministic portfolio risk reports, supported optimization, factor/PCA analysis and authenticated API/CLI paths.
- [x] Deterministic historical market-regime and sector-proxy momentum analysis and quantitative team agents.
- [x] Bounded deterministic evidence-gap gate with server-side default-off mode, persisted decision metadata and chat/decision model separation.
