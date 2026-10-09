# User quick guide

AI Financial Agent combines financial chat, queued analysis workflows, and calculations over price histories you provide.

## What do you want to do?

- **Ask a question:** open `/` and chat with a model. Check sources and warnings in its answer.
- **Full Analysis:** in `/agents` → `Workflows`, submit a ticker for research, analysis, and a report.
- **Debate:** submit a ticker and question to compare opposing cases and get a synthesis.
- **Screening:** submit criteria to filter stocks; this workflow is queued.
- **Monitor:** submit positions to check available prices and metrics. No alert does not mean no risk.
- **Quantitative:** use a calculator that compares supplied past prices for one market benchmark and sector proxies, describes historical direction, volatility (how much prices moved up and down), and how sector returns compare with the benchmark, and optionally calculates historical portfolio risk. It does not fetch prices, forecast, recommend asset allocation, or trade.

The four `Workflows` actions ask for their inputs in the UI. Submit the form and follow its run status; the background job runner (Inngest) processes the queued work. See [Agents and workflows](AGENT_WORKFLOWS.md) for schedules and limits.

## Quantitative: run and read it

1. Open `/agents` → `Quantitative`.
2. Select `Input JSON`, choose a UTF-8 JSON file up to 1 MiB, then select `Analyze`. The `market` input needs one benchmark (the reference for comparison), at least one sector proxy (an ETF, a fund traded on an exchange, or an index used to represent a sector), and price histories.
3. Histories are aligned when they contain the same dates. The default analysis needs 201 dates shared by every history. Missing dates are not filled. A ticker alone does not prove which sector a proxy represents.
4. Read `asOf` as the last date allowed in the analysis. “Regime” is a rule-based label for the historical trend and price movement, not an economic forecast. Read the warnings before drawing conclusions.
5. Add an optional `portfolio` to calculate historical risk. VaR is a loss percentile calculated from past portfolio returns; CVaR is the average of the worst losses beyond that percentile. Neither is a guaranteed future loss. Without a portfolio, risk is not evaluated.

Prepare the JSON from historical prices you are authorized to use; the app does not download them for this calculation. The [quantitative fixture](examples/quantitative-fixture.json) demonstrates the input shape, but every ticker and price is synthetic, includes non-trading dates, and is not market evidence. Read the [fixture warnings](examples/README.md); do not use its output as investment research.

## Limits and more detail

All quantitative output describes supplied history, not future performance. It does not acquire prices, validate the source or sector membership, convert currencies, or determine whether data is adjusted consistently. The app is not a broker and never executes orders.

- [Local setup, credentials, and operation](LOCAL_OPERATIONS.md)
- [Agent and workflow behavior](AGENT_WORKFLOWS.md)
- [Provider coverage and licensing notes](DATA_PROVIDERS.md)