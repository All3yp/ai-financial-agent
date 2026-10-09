# Demonstration Fixtures

The prices and tickers in this directory are **synthetic**, used exclusively for testing the input contract and user interface. The data points include weekends; they are not real market trading sessions and do not validate annualization, signals, or future returns. Never mix these fixtures with real data or interpret the results as investment research. The minimum sample size of 20 returns was chosen for a compact example; insufficient sample size warnings are an intended part of the demonstration.

Run the quantitative team without database, session, network, or model API keys:

```sh
pnpm agent:analyze --input docs/examples/quantitative-fixture.json --mode=quantitative
```

To verify the user interface, open `/agents`, select `Quantitative`, choose the file, and click `Analyze`. The endpoint requires an authenticated session; browser operation depends on the database and application configuration. The portfolio in this example serves only as calculation input; it is not saved to the database.

For real use, replace **all** tickers, dates, and prices with compatible historical data, document source and adjustment methodologies, and configure time horizons to match observation count. Currency declarations and price bases remain user responsibility, not external validations performed by this project.