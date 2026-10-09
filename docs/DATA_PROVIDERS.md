# Data Providers and Sources

This guide incorporates proposed alternatives and distinguishes third-party provider offerings from existing repository integrations. It does not validate pricing, free-tier availability, licensing terms, or endpoint uptime. Verify these factors against official vendor documentation and account terms before use.

Financial Datasets remains supported. No alternative removes it, no external subscriptions are activated automatically, and complementary services do not replace all existing financial tools.

## Integration Status

| Source | Proposed Use | Actual Repository Status |
| --- | --- | --- |
| [Financial Datasets](https://docs.financialdatasets.ai/) | Prices, fundamentals, screener, and news | Integrated; default when key exists and no explicit provider is chosen |
| [FMP](https://site.financialmodelingprep.com/developer/docs) | General equity research alternative | Integrated for daily prices, financial statements, key metrics, and news; access depends on plan; current screener does not use FMP |
| [EODHD](https://eodhd.com/financial-apis) | International coverage and long history | Candidate; no adapter or configuration variable implemented; [official pricing](https://eodhd.com/pricing) must be verified |
| [Twelve Data](https://twelvedata.com/docs) | Time series, intraday, and streaming | Adapter currently implemented only for daily prices; intraday, technical indicators, and WebSockets not integrated |
| [Alpha Vantage](https://www.alphavantage.co/documentation/) | Prototyping and small-volume queries | Integrated for compact daily prices, news, annual/quarterly financial statements, and TTM metric snapshots |
| [Yahoo/yfinance](https://ranaroussi.github.io/yfinance/) | Personal research and history preparation | Not integrated; unofficial Python scraper library without uptime guarantees or commercial/redistribution authorization |
| [SEC EDGAR](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) | Primary source for US corporate disclosures | Company Filings, Company Facts, and HTML filing sections integrated with explicit boundaries and coverage; does not provide market quotes or reconstructed full statements |
| [FRED](https://fred.stlouisfed.org/docs/api/fred/) | Macroeconomic indicators | Yield curve and inflation series with vintage data integrated; GDP, unemployment, and other series not yet exposed as general tools |
| [Nasdaq Data Link](https://docs.data.nasdaq.com/) | Specialized economic and financial datasets | Candidate; schemas, formats, licensing, and pricing vary per dataset |
| [CoinGecko](https://docs.coingecko.com/) | Cryptoasset pricing and metadata | Candidate; no CoinGecko tool or on-chain analysis implemented |
| [GDELT](https://www.gdeltproject.org/data.html) | Global news and event discovery | Candidate; financial sentiment scoring, deduplication, and event extraction not implemented |

Vendor support for crypto, forex, ETFs, or transcripts does not imply end-to-end support in this application. Tickers, currency, exchanges, price adjustments, and response schemas must be verified per operation.

## Choosing by Objective

- **General equity research:** Financial Datasets or FMP, depending on required endpoints and license entitlements. Compare cost per workflow, not just monthly subscription.
- **International coverage:** Evaluate EODHD against required exchanges, tickers, currencies, and split/dividend adjusted histories.
- **Intraday and streaming:** Evaluate Twelve Data; implementing WebSocket or sub-daily transports is separate work from the existing daily adapter.
- **US disclosures and macro:** SEC + FRED complement market data. They do not replace adjusted prices, stock screeners, or analyst consensus estimates.
- **Low-budget personal research:** Evaluate authorized data exports alongside SEC/FRED. Free access does not confer commercial rights, redistribution permissions, or an SLA.
- **Crypto:** Evaluate CoinGecko as a dedicated crypto source, distinguishing prices from on-chain transactions, funding rates, derivatives, or executable liquidity.
- **News and events:** Evaluate GDELT for discovery. Media volume and tone metrics are not equivalent to validated financial sentiment.
- **Reproducible research:** Archive authorized raw data, parameters, provider, vintage, currency, and adjustment conventions. Parquet/DuckDB are storage candidates, not currently integrated infrastructure.
- **External agent integration:** A dedicated Model Context Protocol (MCP) server could expose validated tool schemas in the future. This repository does not implement that server; MCP does not bypass licensing, authentication, rate limits, or data fidelity requirements.

## Selecting an Integrated Provider

Set the corresponding key in the server environment and select the provider. Example selection without committing secrets:

```sh
env FINANCIAL_DATA_PROVIDER=fmp pnpm dev
```

Supported values: `financial-datasets`, `fmp`, `alpha-vantage`, `twelve-data`, `auto`. Keys: `FINANCIAL_DATASETS_API_KEY`, `FMP_API_KEY`, `ALPHA_VANTAGE_API_KEY`, and `TWELVE_DATA_API_KEY`.

Do not set `eodhd`, `coingecko`, `yahoo`, `gdelt`, or `nasdaq` in this variable: they are not in the configuration schema and will be rejected. SEC and FRED use independent configurations, `SEC_USER_AGENT` and `FRED_API_KEY` respectively.

The chat endpoint also accepts `financialData: { provider, apiKeys }` in requests, in addition to the legacy `financialDatasetsApiKey` parameter. The UI settings modal does not manage all provider options; setting environment variables or passing API parameters does not mean a browser selector exists. See [User Guide](USER_GUIDE.md) for current chat client limitations.

Without explicit selection, a configured Financial Datasets key takes priority. Specifying a provider explicitly disables silent fallback. In `auto` mode, prices prefer Twelve Data while fundamentals and news prefer FMP, falling back to configured alternatives depending on operation. This can consume request quotas across multiple providers. Filtered stock screening still requires Financial Datasets.

## Criteria Before Integrating a New Provider

1. Confirm endpoint documentation, authentication methods, account tiers, rate limits, and licensing terms for intended usage.
2. Verify supported exchanges, ticker formats, currencies, timezones, quote delays, and adjustment methodologies (splits, dividends).
3. Define runtime schemas and contract tests, treating absent data as `null` without fabricating zeroes or assuming field equivalence across providers.
4. Implement bounds on request volume, payload size, caching, and retries; prevent API keys from leaking in error URLs, server logs, tracing, or user-facing messages.
5. Preserve publication and vintage dates to prevent lookahead bias in historical analyses; never mix YTD figures with isolated quarterly metrics.
6. Test error handling for plan limit exhaustion, nonexistent symbols, rate limits, malformed responses, adjustments, and partial coverage.
7. Update guides, UI controls, and roadmaps without advertising planned integrations as available.

Total operating cost includes repeated API calls, tickers, credit consumption, LLM tokens, retries, and data storage. Current caching is in-memory per process, not a persistent distributed cache or quota management system.

## Candidate Future Integrations

EODHD is a candidate for expanded global market coverage; CoinGecko for separating crypto data from equity pipelines; GDELT for global event discovery. Prioritization depends on asset class requirements, access authorization, and verifiable schemas. Nasdaq Data Link requires selecting specific underlying datasets rather than treating the platform as a single source. yfinance is best evaluated as an offline export tool for research rather than an unofficial runtime dependency in Next.js.

These candidates remain pending. No live requests, plan purchases, account registrations, or pricing commitments have been made in this guide.