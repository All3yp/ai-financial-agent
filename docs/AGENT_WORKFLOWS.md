# Agents and workflows

An **agent** is one focused task worker; a **workflow** is an ordered set of tasks that uses workers to complete a larger job. “Deterministic” means code calculates or collects results by fixed rules; an **LLM** generates or interprets text. Inngest is the background job runner for queued and scheduled workflows.

## Runtime agents

| Agent | Runtime | What it does |
| --- | --- | --- |
| `research-agent` | Deterministic | Collects available prices, financial statements, and metrics from configured sources. |
| `analysis-agent` | LLM | Interprets supplied financial evidence and writes an analysis. |
| `screener-agent` | Deterministic | Applies filters and ranks stocks using available data. |
| `monitor-agent` | Deterministic | Checks supplied positions against available prices and metrics. |
| `report-agent` | LLM | Turns supplied results into a Markdown report. |
| `risk-agent` | Deterministic | Calculates portfolio risk from supplied holdings and histories. |
| `market-regime-agent` | Deterministic | Describes market direction and regime from historical prices. |
| `sector-rotation-agent` | Deterministic | Compares historical returns for supplied sector proxies. |
| `time-horizon-agent` | Deterministic | Compares historical returns across selected time horizons. |
| `quantitative-team-orchestrator` | Deterministic | Runs quantitative specialists, combines their results, and reports conflicts. |

The quantitative specialists run through the team; there is no individual public entry point for them.

## Workflows

| Workflow | How it runs |
| --- | --- |
| `run-analysis-workflow` | Public queued event `analysis`; `/agents` → `Workflows` starts research, analysis, and reporting. |
| `run-debate-workflow` | Public queued event `debate`; the UI starts opposing cases and a synthesis. |
| `run-screening-workflow` | Public queued event `screening`; the UI starts a filter using submitted criteria. |
| `run-monitoring-workflow` | Public queued event `monitoring`; the UI checks submitted positions. |
| `quantitative-team-analysis` | Direct deterministic calculation; use the `Quantitative` tab, authenticated endpoint, or CLI, not a queued event. |
| `scheduled-monitoring` | Scheduled every 15 minutes; checks enabled portfolios when each portfolio's timezone schedule is due. |
| `daily-screening` | Scheduled weekdays at 17:00 UTC; its persistence is broken because it writes without a parent `AgentRun`. |
| `cleanup-expired-agent-runs` | Scheduled daily at 03:00 UTC; removes expired runs. |
| `run-report-workflow` | Internal report event only; there is no public manual trigger. |

## Launch and inputs

Start the four public actions in `/agents` → `Workflows`, fill in the requested fields, and submit. The authenticated `POST /api/agents/trigger` accepts `analysis`, `debate`, `screening`, or `monitoring`, and returns `202` with a `runId` and status; it queues work rather than completing it in that request.

For **Quantitative**, open `/agents` → `Quantitative` and upload JSON containing a `market` object with one benchmark, at least one sector proxy, and aligned histories supplied by the caller. It compares those past prices; it does not acquire prices or call an LLM. Optionally provide `portfolio` for historical risk. The same calculation is available locally with `pnpm agent:analyze --input <file> --mode=quantitative`.

See [the user guide](USER_GUIDE.md) for output interpretation and [agent architecture](AGENT_ARCHITECTURE.md) for setup.