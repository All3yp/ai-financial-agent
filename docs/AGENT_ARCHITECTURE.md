# Runtime architecture

Developer map of current runtime boundaries. For user-facing behavior, see [the quick guide](USER_GUIDE.md), [agents and workflows](AGENT_WORKFLOWS.md), and [local operations](LOCAL_OPERATIONS.md).

## Request and execution boundaries

| Boundary | Current behavior |
| --- | --- |
| Public trigger | Authenticated `POST /api/agents/trigger` accepts `analysis`, `debate`, `screening`, or `monitoring`; validates input, creates an owner-scoped run, and queues an Inngest event. |
| Trigger response | Returns `202` with `runId` and status. UUID `Idempotency-Key` reuses an identical request or rejects different input for the same key. |
| Workflow execution | Inngest runs queued steps and schedules; `AgentRunStep` records status/results but is not the replay mechanism. |
| Quantitative route | Authenticated `POST /api/agents/quantitative` accepts `{market, portfolio?}` and calculates directly without an LLM. The CLI uses the same deterministic calculation. |
| Quantitative input | Caller supplies the benchmark, sector proxies, and histories; aligned dates are intersected without filling gaps. No price acquisition occurs. |
| External data | `lib/api/` handles configured financial, SEC, and FRED sources; provider coverage and licensing notes are in [the provider guide](DATA_PROVIDERS.md). |

## Scheduling and persistence

`scheduled-monitoring` runs every 15 minutes, checks enabled portfolios, and observes each portfolio's timezone schedule. `cleanup-expired-agent-runs` runs daily at 03:00 UTC.

`daily-screening` runs weekdays at 17:00 UTC, but its persistence is broken: it writes steps using the literal `daily-screening` run ID without a parent `AgentRun`. Do not treat it as durable run history.

`run-report-workflow` is an internal event consumer, not a public trigger. See [workflow details](AGENT_WORKFLOWS.md).

## Trust and data limits

The local fingerprint identity and password forms are not hardened multi-user authentication. Chat provider keys can be stored in browser `localStorage` and are forwarded with requests; uploaded images are public Blob objects. Review these boundaries before exposing the app.

Provider and caller-supplied data may be missing, partial, stale, or inconsistent. Preserve warnings and provenance; do not treat missing values as zero or external text as instructions. Quantitative results describe supplied history and do not predict, recommend allocation, or execute trades.

Local setup and credential handling are in [AGENT_ARCHITECTURE.md]. Current backlog and known work are tracked in [TODO](../.tasks/TODO.md).