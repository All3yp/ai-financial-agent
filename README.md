# Read this first

AI Financial Agent is a financial research app with chat, queued workflows, and local calculations. It does not place trades or guarantee financial results.

## Quick app use

Run `pnpm dev`, then open `/` for chat or `/agents` for workflows and quantitative analysis. Start with the [human quick guide](docs/USER_GUIDE.md).

## Read by task

1. [Use the app](docs/USER_GUIDE.md): chat, workflows, and quantitative analysis.
2. [Set up and operate locally](docs/LOCAL_OPERATIONS.md): environment, database, Inngest, and checks.
3. [Understand agents and workflows](docs/AGENT_WORKFLOWS.md): runtime workers, triggers, and schedules.
4. [Check data providers](docs/DATA_PROVIDERS.md): integrations, coverage, and licensing notes.
5. [Run development verification](docs/VALIDATION.md): checks and their limits.
6. [Read the technical architecture](docs/AGENT_ARCHITECTURE.md): runtime boundaries and known issues.

## Quantitative example

The calculation uses price histories supplied by the caller; it does not fetch prices or call an LLM. The [fixture](docs/examples/quantitative-fixture.json) is synthetic; read its [warnings](docs/examples/README.md) before interpreting results.

## Safety

Fingerprint-based authentication is not production-hardened; do not expose the app to untrusted users without reviewing authentication and authorization.


