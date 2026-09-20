# Validation guide

## Fast local gates

From the project root run `npm ci`, then `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`, `npm run test:load`, `npm run build` and `npm run test:browser`.

The unit suite checks input protection, URLs, CSV escaping, error sanitization and timer behavior. The SQL suite applies every migration to a fresh PostgreSQL-compatible PGlite engine, creates anon/authenticated/service_role roles and checks real SQL grants/RLS. Only the Auth provider and `auth.uid()` JWT plumbing are replaced by a controlled test stub.

Browser tests start a production Next server for public/auth pages and an isolated server bundling the actual participant/developer components. Authenticated API responses are mocked in that harness. This separation does not add a production bypass. Screenshots are synthetic fixtures, not evidence of a hosted event. The browser suite exercises confirmation dialogs, pending buttons, lost responses, second-tab reconnect, slow snapshot recovery under continuous invalidation, errors, mobile layout, privacy and reset confirmation.

## 1,200 workflow simulation

`npm run test:load` creates 120 participants, each with 10 records; deploys all 1,200; sends bursts plus 480 duplicate verification requests; and asserts:

- 1,200 qualifying, non-deleted records;
- participant sum = 1,200;
- leaderboard aggregate = 1,200;
- public leaderboard row sum = 1,200;
- progress display / master aggregate = 1,200;
- exactly 1,200 verification audit records.

PGlite serializes submitted transactions. Its queued latency measurements are not production throughput or native connection tests. Record the generated `docs/test-results/load.json` separately from native results.

## Native 120-connection PostgreSQL test

Use an empty disposable PostgreSQL instance. Never point this test at the production or staging event database. The script refuses a database name without `recordforge_test` and refuses an existing event table.

With Docker Compose available:

```sh
export TEST_POSTGRES_PASSWORD="$(openssl rand -hex 24)"
docker compose -f compose.test.yaml up -d --wait
export TEST_DATABASE_URL="postgresql://recordforge_test:${TEST_POSTGRES_PASSWORD}@127.0.0.1:54324/recordforge_test"
ALLOW_DESTRUCTIVE_TESTS=true npm run test:concurrency
docker compose -f compose.test.yaml down
unset TEST_DATABASE_URL TEST_POSTGRES_PASSWORD
```

The disposable server allows 150 connections. The runner reserves one coordinator connection and 120 participant connections, creates 1,200 chatbot workflows, sends 6,000 verification calls including 4,800 repeats, asserts 120 separate backend PIDs and checks the same count invariant and audit cardinality. It writes `native-concurrency.json` only if all assertions pass. The fixture contains a stub Auth schema; native PostgreSQL concurrency still does not prove Supabase Auth or WebSocket behavior.

This suite was not executable in the provided environment (no Docker/native PostgreSQL and no permitted non-root service user). Run it on the CI runner or a development host and inspect the actual generated report before release.

## Managed Supabase integration test

Provision a separate staging Supabase project, apply migrations, disable direct public signup, bootstrap a staging developer, configure the app against it and start its production build. The event must be empty and DRAFT. Tests create a fake participant, change event states and execute a clean reset. They must not be run on a final event.

Create a private `.env.test.local`:

```dotenv
ALLOW_DESTRUCTIVE_TESTS=true
TEST_APP_ORIGIN=http://localhost:3000
TEST_SUPABASE_URL=https://YOUR_STAGING_PROJECT.supabase.co
TEST_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_STAGING_KEY
TEST_DEVELOPER_USERNAME=YOUR_STAGING_DEVELOPER
TEST_DEVELOPER_PASSWORD=YOUR_PRIVATE_STAGING_PASSWORD
```

Then run `npm run test:provider` against that running app. The suite verifies real session cookies, registration and duplicate registration, wrong-password rejection, role restrictions, chatbot creation and transitions, repeated verification, public snapshots, exports, actual Realtime revision delivery and clean reset. It writes `provider.json` on success. Keep the server and runner on the same accessible network and align APP_ORIGIN exactly. Do not copy these files or credentials into source control.

## Rehearsal and release decision

After all automated gates pass, rehearse the actual network with approximately 120 devices or a separately approved HTTP load generator. Verify shared-IP rate limits, Auth limits, realtime client quotas, database health and end-to-end latency on the selected provider plan. The native SQL test bypasses HTTP/Auth and cannot establish event Wi-Fi or hosted API capacity.

Exercise two devices for one account, timeout immediately after a committed verification, projector disconnect/reconnect, expiry while a browser is asleep, concurrent organizer corrections and repeated clean-reset submission. Verify a backup restore and exports in organizer storage. Record the application version, migration filenames, environment, measured results and unresolved issues. Do not treat a successful build alone as production acceptance.

The included CI workflow runs local checks and isolated native SQL concurrency. It does not deploy or contact a managed event database; it has not been executed on GitHub from this workspace.
