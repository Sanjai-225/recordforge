# RecordForge

A real-time LLM chatbot competition platform built with Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth, PostgreSQL, RLS and Supabase Realtime.

**Delivery status:** implemented application, reproducible migrations, automated database/UI tests, production build and operational documentation. Hosted Supabase Auth/Realtime integration, native 120-connection PostgreSQL testing and a live deployment remain release gates. See [test results](docs/TEST_RESULTS.md). There is no demo authentication bypass in the production application.

## What is implemented

- Username/password registration and login with configurable participant fields; Supabase owns credentials. Unique register numbers and configurable human-readable Event IDs are enforced in PostgreSQL.
- Participant dashboard with separate chatbot records, versioned draft edits, two explicit confirmations, official database timestamps and no optimistic official counts.
- Transactional, idempotent deployment/verification; ownership checks, capacity locks, soft deletion, audited corrections and one canonical completion rule.
- Developer control center: overview, participant management, chatbot search/filter/sort/corrections, live completions, separate developer activity and audit views, event controls, form fields, ID rules, display settings, health and consistency diagnostics.
- Public leaderboard and projector progress display; only intentionally public data is returned. Names, columns, ordering, sorting, row limit, titles and display elements are configurable.
- Single primary event with configurable limits and duration, server-based pause/resume timer, deadline enforcement and strongly confirmed **PREPARE CLEAN EVENT**.
- Realtime invalidation with authoritative refetch, reconnect/focus recovery and periodic fallback. Missed realtime messages never change the database result.
- CSV participant, submission, completion, timeline and audit exports, plus preserved reset/correction history.

Defaults are stored once in the database: 120 participants, 10 chatbots each, 60 minutes. Target is calculated as participant limit × chatbot limit.

## Routes

| Route | Access / purpose |
|---|---|
| `/register` | Public registration, only while registration is open |
| `/login` | Participant username/password sign-in |
| `/dashboard` | Authenticated participant's records |
| `/developer/login` | Developer sign-in |
| `/developer` | Server- and database-authorized operations |
| `/display/leaderboard` | Public safe participant standings |
| `/display/progress` | Public official aggregate and timer |

## Requirements

Node.js 22 or newer (validated with Node 24), npm, and a Supabase project. Local Supabase requires its CLI and Docker. A cloud account is not required for the embedded PostgreSQL tests. Pinning is in `package.json` and `package-lock.json`; use `npm ci`.

## Run locally

```sh
npm ci
cp .env.example .env.local
```

For a local Supabase stack, install/use the Supabase CLI and Docker, then:

```sh
npx supabase start
npx supabase db reset --local
npx supabase status
```

`db reset --local` is destructive to the local database. Never add `--linked` to this development command. It applies all checked-in migrations and the initial singleton configuration. Copy the local API URL, anon/publishable key and service-role key from the CLI status into `.env.local`; do not commit credentials. Alternatively, follow [managed setup](docs/DEPLOYMENT.md) for a separate staging project.

Set `APP_ORIGIN=http://localhost:3000`, generate `RATE_LIMIT_SALT` with `openssl rand -hex 32`, then:

```sh
npm run bootstrap:developer
npm run dev
```

Before bootstrap, supply `DEVELOPER_USERNAME`, `DEVELOPER_PASSWORD` and `DEVELOPER_EMAIL` in your local environment or `.env.local`. Choose an organizer-controlled email and a unique password of at least 12 characters. Remove these bootstrap variables afterward. The script creates a Supabase Auth user and a protected developer profile; it never promotes an existing participant or prints a password.

Open `/developer/login`, configure the event, and open registration. Participants can register, but cannot create/confirm chatbots until the event is LIVE.

## Environment variables

| Variable | Where / meaning |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server; project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server; public publishable key (legacy anon key also supported) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only; registration provisioning, username lookup and rate limits |
| `APP_ORIGIN` | Server only; exact trusted browser origin, including scheme and port |
| `RATE_LIMIT_SALT` | Server only; random stable salt for HMAC rate-limit identifiers |
| `DATABASE_URL` | Optional migration script only; never a public environment variable |
| `DEVELOPER_USERNAME/PASSWORD/EMAIL` | Local one-time bootstrap inputs; omit from deployed runtime |
| `ALLOW_DESTRUCTIVE_TESTS` | Default false; explicitly enable only for isolated seed/integration tests |

Next.js embeds public variables at build time. Configure the correct environment **before** the production build. A missing provider configuration returns a setup error, not fabricated participant data. Do not put a service key, database password or test password in a `NEXT_PUBLIC_` variable.

## Database architecture

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the ER diagram, table definitions, constraints, permission matrix, state machines, registration/completion transactions and failure analysis. The executable schema is in `supabase/migrations`.

The singleton `events` row holds configuration and timer state. `profiles` binds Auth UUIDs to protected roles. `participants` owns normalized participant details; `chatbot_submissions` owns one row per chatbot. `field_definitions`, `dashboard_configs`, `registration_reservations`, `audit_logs`, `reset_receipts`, `event_signals` and `rate_limits` support operational behavior.

`private.completed_chatbots` defines completion from both official timestamps and active records in the current data generation. Participant totals, leaderboard and master totals derive from those records. No independently writable completion counter exists. Shared event locks and participant/record locks protect operations; resets/config changes take an exclusive event lock. RLS and explicitly granted RPCs enforce the same rules when someone bypasses the browser.

## Project structure

```text
src/app/                  Next.js pages and API routes
src/components/           participant, developer, display, dialogs and shared UI
src/lib/                  typed contracts, validation, error handling and sync
src/lib/supabase/          isolated browser, session and privileged clients
src/proxy.ts              session refresh / private no-store responses
supabase/migrations/      reproducible schema, RLS, functions and defaults
supabase/config.toml      local Supabase configuration
scripts/                  bootstrap, migrations, safe seed and account maintenance
tests/                    unit, SQL/RLS, load, native concurrency, provider, browser
.github/workflows/        repeatable CI checks
docs/                     architecture, deployment, security, results, screenshots
EVENT_DAY.md              before/during/after operational runbook
```

## Testing

```sh
npm run typecheck
npm run lint
npm test
npm run test:db
npm run test:load
npm run build
npm run test:browser
```

The browser runner uses bundled serverless Chromium on supported Linux. To use an installed Playwright Chromium instead, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its executable. The browser tests launch the production Next server and an isolated component harness; they do not require or modify live competition records. Authenticated component responses are mocked. SQL tests apply the real migrations to PGlite and enforce PostgreSQL roles, with `auth.uid()` stubbed.

The load simulation creates 120 participants and 1,200 chatbot workflows, submits duplicate verifications and asserts every official total. PGlite queues transactions; this verifies invariants, not 120 simultaneous database sessions. Run the separate native test and provider suite described in [TESTING.md](docs/TESTING.md) before production. Current measured results are in [TEST_RESULTS.md](docs/TEST_RESULTS.md), with machine-readable evidence in `docs/test-results`.

## Safe demo data

On a clean **development/staging** event, open registration, set `ALLOW_DESTRUCTIVE_TESTS=true`, and run `npm run seed`. This creates 10 fake participants (`demo_1` through `demo_10`). Optional `SEED_PARTICIPANT_PASSWORD` permits interactive demo sign-in; otherwise passwords are generated in memory and not printed. Optional `SEED_DEVELOPER_USERNAME` and `SEED_DEVELOPER_PASSWORD` also exercise the real participant RPCs to create 19 submissions, including 10 verified completions, and leave the demonstration event LIVE; end it before resetting. Configured required custom fields must be disabled or the seed extended to supply them. This managed-provider script has not been run without provider credentials.

## PREPARE CLEAN EVENT

1. Export evidence and check a backup before clearing anything important.
2. End an active/paused event. Open Developer → Reset / testing → PREPARE CLEAN EVENT.
3. Read the impact report, give a reason and type `PREPARE CLEAN EVENT` exactly.
4. Review the final confirmation and execute once. If the response is interrupted, synchronize and retry the same pending action.
5. Confirm DRAFT state, zero active participants/submissions/completions, unchanged settings and a reset audit entry. Open registration when ready.

One PostgreSQL transaction archives the previous competition data, retires participant profiles, advances an internal generation and clears runtime/timer state. It preserves developer accounts, all event/field/ID/dashboard settings and historical audit. Active competition views are clean. Old participants cannot access the new generation even with a valid old Auth session; their usernames/register numbers may be registered afresh.

Supabase Auth identities and old rows are retained for evidence and foreign-key integrity. The maintenance command `npm run accounts:retired` reports retired identities; `RETIRED_ACCOUNT_CONFIRMATION='BAN RETIRED PARTICIPANTS' npm run accounts:retired -- --ban` bans them through Supabase Auth. This is separate from the atomic application reset. There is no web-based permanent evidence deletion or audit purge. Restoring an entire earlier generation requires a verified backup/recovery procedure; an ordinary soft-deleted current-generation record can be restored in the developer UI.

## Deployment and operation

Follow [DEPLOYMENT.md](docs/DEPLOYMENT.md), [SECURITY.md](docs/SECURITY.md), and [EVENT_DAY.md](EVENT_DAY.md). Build/start locally with `npm run build` and `npm start`. Deploy the native Next.js project to Vercel with environment variables set for each environment and a separate staging Supabase project.

During this build the connected Supabase account had no projects. Project creation requires selecting the organization and acknowledging the provider cost. The Vercel deployment tool returned “tool not found,” and the CLI was not signed in. Consequently **no live deployment URL is claimed**.

## Known release gates and limits

- Run the real Supabase Auth/Realtime integration suite and native concurrency suite, then an event-network rehearsal. They are supplied but have not passed in this environment.
- Supply provider configuration, bootstrap the developer securely, deploy staging, verify backups by restoration, then deploy production.
- Participant email recovery is unavailable for opaque username identities. Organizer-assisted credential recovery uses supported Supabase administration; a self-service password-reset UI is not included.
- Application audit is append-only to application roles, not tamper-proof against the database owner. Exports support evidence; the application does not legally certify a world record.
- UI health shows database reconciliation and realtime state; rejected request correlation IDs are in deployment logs, not a centralized incident dashboard.
- Browser presentation checks use Chromium. Test the actual projector/TV/mobile browsers and event Wi-Fi.
