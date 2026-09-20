# RecordForge — Antigravity handoff

This folder is the complete project. Do not upload the Markdown files one by
one. Extract the ZIP, open this whole folder in Antigravity, and ask the agent
to read this file first.

## What this application is

RecordForge is a real-time competition-management platform for an LLM chatbot
creation event. The default event accepts 120 participants, with up to 10
chatbots each, for a calculated target of 1,200 completions. These values are
developer-configurable and are not duplicated throughout the UI.

The production architecture is:

```text
Browser -> Next.js on Vercel or Render -> Supabase Auth/PostgREST
                                      -> PostgreSQL + RLS
                                      -> Supabase Realtime invalidation
```

PostgreSQL is authoritative. A chatbot counts once only when both database
timestamps `deployed_at` and `verified_at` exist. Both normal milestones are
confirmed by the owning participant. The browser cannot set official times or
completion counts. Realtime messages cause a database refetch; they never
increment a counter.

## Current implementation status

- Native Next.js 16 App Router, TypeScript, Tailwind CSS and React 19.
- Supabase Auth with participant/developer roles and server-side username lookup.
- Six ordered SQL migrations with schema, constraints, RLS, RPC functions,
  audit, snapshots, reset receipts, rate limits and Realtime signal setup.
- Participant dashboard, developer control center, leaderboard and progress
  display implemented.
- `PREPARE CLEAN EVENT` archives active participant/event data by advancing the
  data generation. It preserves developer accounts, configuration and audit.
- CSV evidence exports, configurable fields, ID generation, dashboard columns,
  event state/timer, corrections, soft deletion and consistency diagnostics.
- No fake production authentication path and no frontend authoritative counter.

Executed validation at handoff:

- TypeScript: passed.
- ESLint: passed with zero warnings.
- Production Next.js build: passed.
- Unit tests: 6 passed.
- Database/RLS tests: 30 passed.
- Chromium browser tests: 12 passed.
- PGlite workflow simulation: 120 participants, 1,200 chatbot records, 1,680
  verification calls including 480 duplicate requests, exactly 1,200 unique
  completion audit records, and all authoritative totals equal 1,200.
- Runtime production dependency audit: zero reported vulnerabilities at scan time.

The PGlite test proves SQL invariants but serializes transactions. The supplied
native 120-connection PostgreSQL test and managed Supabase provider test remain
release gates. They must be run against an isolated staging environment, never
against final-event data.

## Mandatory reading order for an AI agent

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/SECURITY.md`
4. `docs/CLOUD_ONLY_SETUP.md`
5. `docs/TESTING.md`
6. `docs/TEST_RESULTS.md`
7. `EVENT_DAY.md`
8. Every file in `supabase/migrations`, in filename order

The reports under `docs/test-results` are machine-readable evidence from the
tests that actually ran. The screenshots under `docs/screenshots` use synthetic
test fixtures and show the implemented interface; they are not hosted-event
evidence.

## Rules for future changes

1. Preserve PostgreSQL as the only authoritative event state.
2. Preserve `deployed_at IS NOT NULL AND verified_at IS NOT NULL` as the
   official completion condition.
3. Official timestamps must come from PostgreSQL.
4. Participant, leaderboard, progress display and diagnostics must derive from
   the same chatbot records.
5. Preserve ownership checks, transaction locks, idempotence and optimistic
   versions.
6. Never expose the service-role key to client/browser code or logs.
7. Preserve RLS, explicit function grants and sanitized public snapshots.
8. Never edit a migration that was applied to a cloud project. Create a new
   migration with `npx supabase migration new <name>`.
9. Do not run destructive/provider tests against a final event.
10. Do not claim a provider test or deployment succeeded unless it actually ran.

## Antigravity continuation prompt

Paste this into the Antigravity agent after opening the folder:

```text
Read START_HERE_ANTIGRAVITY.md and every document/file in its mandatory reading
order before editing anything. This project is RecordForge, a correctness-first
LLM chatbot competition platform. Treat the checked-in migrations and reports as
the current implementation contract. Preserve all ten future-change rules in the
handoff. Do not rewrite the architecture or weaken RLS to make a request pass.

First report your understanding of the architecture, current implemented
features, executed tests, unexecuted release gates, and the files you expect to
touch. Then help me configure a cloud Supabase staging project and deploy this
Next.js application to my chosen host. Never print or commit secrets. After any
code change, run typecheck, lint, unit tests, database tests and production build;
state exactly which commands passed or were not run.
```

## Repository and secrets

Run `npm ci` after opening the folder so dependencies are reconstructed from the
lockfile. Secrets are intentionally absent. Create a private `.env.local` only
when a local command needs cloud credentials. Antigravity may edit code without
that file. Never upload `.env.local` to GitHub or paste service keys into agent
chat. The supplied `.gitignore` already ignores environment files.

There was no managed Supabase project or production database at handoff, so
there is no missing event data inside the ZIP. Once cloud Supabase is used, the
database stays in Supabase; opening the same code in another editor does not move
or delete it.
