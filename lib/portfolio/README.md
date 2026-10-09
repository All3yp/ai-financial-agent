# Phase 6: Deterministic Portfolio Risk

This is the first, partial Phase 6 slice, not a complete portfolio optimization
system. All calculations are local arithmetic with existing Zod validation. No
paid services, credentials or model calls are required by the core calculations.
The caller supplies prices and scenarios. The core is now integrated with a
shared tool, authenticated REST endpoint, local CLI and quantitative dashboard;
see the [user guide](../../docs/USER_GUIDE.md) for current workflows.

## API

```ts
import {
  calculatePortfolioRisk,
  calculateCorrelationMatrix,
  stressTestPortfolio,
  generatePortfolioReport,
  type PortfolioRiskInput,
  type PriceHistory,
  type Position,
  type StressScenario,
} from './risk';

calculatePortfolioRisk(input: PortfolioRiskInput): PortfolioRisk;
calculateCorrelationMatrix(histories: PriceHistory[]): CorrelationMatrix;
stressTestPortfolio(
  positions: Position[], scenarios: StressScenario[], currency: string,
): StressResult[];
generatePortfolioReport(
  input: PortfolioRiskInput, scenarios?: StressScenario[],
): PortfolioReport;
```

Input shapes:

```ts
type Position = { ticker: string; shares: number; currentPrice: number };
type PriceHistory = {
  ticker: string;
  prices: { date: string; price: number }[];
};
type PortfolioRiskInput = {
  positions: Position[];
  histories: PriceHistory[];
  currency: string;
  confidence?: number; // Default 0.95; strictly between 0 and 1.
};
type StressScenario = { name: string; returns: Record<string, number> };
```

Position and history arrays must be nonempty. Shares and all prices must be
finite and strictly positive. Tickers are trimmed, nonempty, case-sensitive,
and unique; aggregate repeated positions before calling. Portfolio histories
must contain exactly the position tickers. Scenario keys must exactly match
the normalized position tickers; missing shocks are not silently assumed zero.
Scenario returns are decimal simple returns, finite and at least -1. Names and
currency labels must be nonempty. An empty scenario array is allowed.
Validation errors and numeric overflow/underflow that prevents positive
portfolio valuations throw; functions do not return fabricated estimates.

## Definitions

- Dates must be real `YYYY-MM-DD` calendar dates. Duplicate dates within a
  ticker are rejected, even outside the eventual common window. Input order
  is immaterial: dates are sorted chronologically without mutating inputs.
- Intersect all supplied history dates **before** computing consecutive simple
  returns (`price[t] / price[t-1] - 1`). No filling, interpolation, or returns
  aligned after the fact. At least **21 common prices / 20 returns** are
  required for both portfolio risk and standalone correlation. A warning is
  emitted below **250 returns**, and when unmatched observations are discarded.
- The caller must supply consecutive daily trading-session observations. No
  exchange calendar is available here. Missing sessions can make aligned
  intervals multi-day, invalidating the nominal one-day interpretation and
  252-session annualization. No calendar-day interpolation is performed.
- Historical portfolio values are `sum(shares * historicalPrice)` at each
  common date. Shares remain fixed: **buy and hold, not constant rebalanced
  weights**. Portfolio returns are consecutive changes in those values.
- Historical one-day VaR is the nearest-rank empirical quantile of losses
  (`loss = -return`, ascending index `ceil(confidence * n) - 1`). CVaR is the
  mean of the worst `n * (1 - confidence)` empirical loss observations, with
  a fraction of the boundary observation when needed. Ties retain their
  empirical mass. This is not a normal-model estimate or a mean of all losses
  greater than or equal to VaR. Both losses remain **signed**: an all-gain
  sample can produce negative VaR/CVaR. Amounts multiply these decimal losses
  by **current** portfolio value, not the final historical value.
- Annualized volatility is the sample standard deviation of portfolio
  returns (denominator `n - 1`) times `sqrt(252)`. Max drawdown is the largest
  nonnegative fractional decline from a running historical portfolio peak.
- Correlation is actual Pearson correlation of consecutive aligned **returns**,
  not price levels or PCA. `matrix[i][j]` corresponds to `tickers[i]` and
  `tickers[j]` in history input order. Any pair involving zero return variance,
  including that ticker's diagonal, is `null` with a warning, not zero or one.
- Concentration uses current position values: weights, largest weight,
  Herfindahl index `sum(weight^2)`, and effective holdings `1 / index`.
- Stress tests apply each caller-supplied shock to current position value.
  Output includes stressed value, signed profit/loss and portfolio return.
  A scenario named after a crisis is still only the caller's hypothetical
  shocks, not a reconstructed historical event. There are no built-in
  "2008" approximations or default scenarios.
- Reports contain risk, correlation, explicit stress results, warnings and
  limitations as structured data. They do not invent causal attribution,
  recommendations, prose from an LLM, or confidence about future outcomes.

## Assumptions

All monetary inputs and outputs use the **same caller-specified currency**;
the currency string is a label, not FX conversion or proof of input units.
Histories and current prices must use a consistent split/dividend adjustment
basis and compatible share units. No cash holdings, changing shares, trading,
corporate-action handling, dividends, cash flows, fees or taxes are modeled.
Current shares applied to old prices are a hypothetical historical exposure,
not actual realized historical performance. Current prices need not match
the history endpoint. Numbers use JavaScript floating point, not accounting
decimal precision. Historical estimates are descriptive, not guarantees;
20 returns is a hard floor, not statistically strong tail-risk evidence.

## Roadmap And Budget

| Scope | Progress | Free or local path |
| --- | --- | --- |
| Validated risk, fixed-share drawdown, concentration | Implemented here | Caller-provided dated histories |
| Pearson correlation and explicit stress scenarios | Implemented here | Local arithmetic; caller-specified shocks |
| Deterministic structured report | Implemented here | No LLM or API costs |
| Data acquisition, freshness, calendars and FX | Not implemented | User CSV/export or licensed free-tier data, with limits and adjustments checked |
| Tool registration, routes and UI | Implemented subset | Shared report tool, authenticated risk/team routes, CLIs and Quantitative dashboard |
| Optimization, PCA and factor regression | Implemented as separate local models | See optimize.ts and factors.ts; daily-rebalanced factor model is not this fixed-share report |
| Causal attribution and full strategy team | Not implemented | Requires separate contracts and model validation |
| Historical crisis replay / backtesting | Not implemented | Actual dated historical data and holdings, not invented shocks |

Free-tier provider availability, licensing, coverage and rate limits must be
checked separately. This module neither downloads data nor promises free
provider coverage. Roadmap progress outside this slice is not assessed here.

## Verification

```sh
pnpm exec tsx --test lib/portfolio/risk.test.ts
```

Tests cover known tail losses and sample volatility, fractional/tied CVaR,
date alignment before returns, fixed-share drawdown, Pearson correlation,
zero variance, sample thresholds, concentration, explicit stress shocks,
validation failures, finite arithmetic and deterministic nonmutation.