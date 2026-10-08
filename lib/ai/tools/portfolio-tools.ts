import { z } from 'zod';
import {
  generatePortfolioReport,
  portfolioRiskInputSchema,
  portfolioStressScenarioSchema,
} from '../../portfolio/risk';

const positionSchema = portfolioRiskInputSchema.shape.positions.element;
const historySchema = portfolioRiskInputSchema.shape.histories.element;
const scenarioSchema = portfolioStressScenarioSchema.extend({
  name: portfolioStressScenarioSchema.shape.name.max(128),
  returns: z.record(
    portfolioStressScenarioSchema.shape.returns.keySchema.max(32),
    portfolioStressScenarioSchema.shape.returns.valueSchema,
  ).refine((returns) => Object.keys(returns).length <= 10, 'At most 10 ticker shocks per scenario'),
});

export const portfolioReportInputSchema = portfolioRiskInputSchema.extend({
  positions: portfolioRiskInputSchema.shape.positions.element.extend({
    ticker: positionSchema.shape.ticker.max(32),
  }).array().min(1).max(10),
  histories: historySchema.extend({
    ticker: historySchema.shape.ticker.max(32),
    prices: historySchema.shape.prices.max(251),
  }).array().min(1).max(10),
  currency: portfolioRiskInputSchema.shape.currency.max(16),
  scenarios: scenarioSchema.array().max(10).optional(),
});

export const portfolioTools = {
  generatePortfolioReport: {
    description: 'Compute deterministic historical portfolio risk, correlations, and caller-supplied stress tests without network or LLM calls. Observations must be real sourced same-currency adjusted price history, not invented model values. Short/leveraged positions and mixed FX are unsupported. Supply positive shares and current prices, one history per ticker, and at least 21 common price dates (20 returns); 251 dates (250 returns) are recommended. Limits: 10 positions, 10 histories, 251 prices per history, 10 scenarios. Scenarios are optional explicit named per-ticker decimal returns (for example -0.2 means a 20% loss), must cover every holding exactly, and must not be fabricated or inferred. No shocks are generated when scenarios are omitted. Preserve returned warnings and limitations; estimates are descriptive, not forecasts or recommendations.',
    parameters: portfolioReportInputSchema,
    execute: (input: z.input<typeof portfolioReportInputSchema>) => {
      const { scenarios, ...riskInput } = portfolioReportInputSchema.parse(input);
      return generatePortfolioReport(riskInput, scenarios);
    },
  },
};