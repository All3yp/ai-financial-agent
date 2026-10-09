# Local operation

## 1. Prerequisites and setup

Use Node.js compatible with Next.js 15, pnpm, and PostgreSQL. From the repository root:

```sh
pnpm install
env SEC_CONTACT_EMAIL='YOUR_MONITORED_EMAIL' node scripts/setup-env.mjs
```

Replace the placeholder with a real, monitored email for SEC identification. The helper creates or updates `.env`, generates a missing `AUTH_SECRET`, and preserves existing values. It does not create a PostgreSQL database.

## 2. Configure the database and start

Create a database and user, then set `POSTGRES_URL` to its connection URL in `.env` or the process environment. Run migrations and start the app:

```sh
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000/` for chat and `http://localhost:3000/agents` for workflows and quantitative analysis. Use the port printed by Next.js if 3000 is busy.

## 3. Credentials by purpose

Each group serves a different integration; configure only what your workflow needs.

- **Authentication and database:** `AUTH_SECRET` protects sessions; `POSTGRES_URL` connects to the app database.
- **Server-side LLM:** `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_PROVIDER_NAME` configure the text-generation service and its endpoint. “OpenAI-compatible” means the service accepts the OpenAI API request format.
- **Financial data providers:** `FINANCIAL_DATA_PROVIDER` selects a supported provider; keys are `FINANCIAL_DATASETS_API_KEY`, `FMP_API_KEY`, `ALPHA_VANTAGE_API_KEY`, and `TWELVE_DATA_API_KEY`.
- **SEC and FRED:** `SEC_USER_AGENT` must identify the app and include a real contact email; `FRED_API_KEY` authenticates FRED requests.
- **Inngest:** `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` let hosted background jobs be sent and verified; set `INNGEST_DEV=1` when local development needs it.
- **Blob uploads:** `BLOB_READ_WRITE_TOKEN` enables chat image uploads to Vercel Blob; uploaded images are public.

See [provider coverage and licensing notes](DATA_PROVIDERS.md) for provider-specific limits. Chat keys entered in the UI are separate: browser `localStorage` is browser storage, not an encrypted vault, and those keys are forwarded with chat requests.

## 4. Run local background workflows

With the app running, start the Inngest development server in another terminal:

```sh
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

The four public workflows are queued through Inngest. Quantitative analysis runs directly and does not require an LLM or Inngest. Daily screening currently lacks a parent `AgentRun`, so its step persistence is broken; do not rely on it for durable run history.

## 5. Verify changes

```sh
pnpm test
pnpm typecheck
pnpm build:app
```

`pnpm build` runs database migrations before the Next.js build. `pnpm lint` and `pnpm format` can write files. See [validation guidance](VALIDATION.md) for what checks do and do not prove.

## 6. Authentication and privacy limits

Fingerprint-based authentication is not production-hardened. Chat keys in browser `localStorage` are forwarded to the server, and uploaded images are public Blob objects. Review authentication, authorization, key handling, and data retention before exposing the app to untrusted users.