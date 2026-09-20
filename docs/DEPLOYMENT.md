# Deployment and recovery

## 1. Prepare Supabase

Create a separate staging project first in the organizer's chosen organization and nearby region. Review the provider's displayed cost before provisioning. Use a strong project database password and store it in a secret manager. Do not send credentials in chat or commit them.

Link the correct project with the Supabase CLI:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Review the target project and migration list before applying. Do not use `db reset --linked` on event data. The ordered migrations create RLS, explicit function grants, the singleton event, default display configuration and the public revision-only realtime table. The migration adds `event_signals` to `supabase_realtime` when that publication exists. Confirm replication is enabled for this table in the managed project.

An alternative `npm run migrate` uses `DATABASE_URL`, an advisory migration lock and checksum history. Choose one migration history mechanism per environment; do not alternate it with CLI db push on the same database. Use the Supabase CLI for managed projects. New schema changes belong in new migrations created with `supabase migration new NAME`; never edit already-applied migration files.

Configure Supabase Auth:

- Disable direct public new-user signup. Registration is provisioned through the validated server-only flow.
- Enable password sign-in and set minimum password length to at least 12.
- Set Site URL and authorized redirect URLs to the actual application origin; avoid broad production wildcards.
- Set appropriate Auth rate limits for the rehearsal. The app also has database-backed request limiting; shared event Wi-Fi must be included in testing.
- Verify normal Auth session/JWT settings, project health and Realtime availability.

Use the project API URL and publishable key for public configuration. Supply the service-role key only to trusted server runtime and local admin scripts. RLS remains enabled; never grant participants direct table writes to make a failing request work.

## 2. Bootstrap and verify staging

Set the environment variables from README in `.env.local`, run the developer bootstrap once, then remove its password variables. Start the production build against staging, authenticate as developer and inspect System health. Run the provider integration suite on a clean staging event and the browser suite. Verify the effective event state, public privacy, realtime reconnection and evidence exports manually on two devices.

## 3. Vercel deployment

Import the project from a private Git repository or use the authenticated Vercel CLI from this directory. Choose the Next.js framework preset and a supported Node version (Node 24 was used for validation). Build command: `npm run build`. No static export is used; API routes and server session validation require the Node runtime.

Configure these environment variables separately for Preview and Production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (sensitive)
- `APP_ORIGIN` (exact canonical HTTPS origin)
- `RATE_LIMIT_SALT` (sensitive random value)

Do not deploy the developer password, database URL, seed/test passwords or `ALLOW_DESTRUCTIVE_TESTS=true`. Preview must point to staging, not the final event database. Public values are embedded at build time; redeploy after changing them. The canonical origin must match the browser origin or mutation requests will correctly fail CSRF checks. Use a stable staging domain for integration tests. For temporary preview URLs, set their exact origin and rebuild that preview.

```sh
vercel login
vercel link
vercel deploy
```

After staging passes, deploy a production build using the Vercel dashboard or `vercel deploy --prod` with the production environment configured. Follow the CLI's current prompts and verify the selected project before deployment. This repository includes no automatic production deployment credentials.

Post-deployment checks: login, register test participant on staging, create/deploy/verify, check both displays, pause/resume/end, correction decrement, CSV export, lost response/reconnect, clean reset and developer access afterward. Promote only after the release gates in TESTING.md pass.

## 4. Backups and recovery

Before the final event, choose a backup/PITR plan appropriate to the project and verify the provider's actual retention and recovery capabilities. Do not assume any particular paid feature is available. Perform a restoration into an isolated project and document the measured recovery time. Include the database schema, application records, Auth identities and migration history in the recovery plan. CSV exports are evidence, not a full database backup.

Before a major administrative correction or clean reset, export participants, chatbots, completions, timeline and audit from the developer UI. Save them with generation/date in protected organizer storage. Preserve a database backup as well. Exports contain participant data and must not be published as public dashboards.

For an accidental current-generation removal, use Include removed and Restore. A capacity/sequence conflict is intentional: inspect the conflicting record and resolve it explicitly; do not bypass constraints. A wrong timestamp or verification can be corrected with a reason, and the count changes from the same underlying records.

For an accidental PREPARE CLEAN EVENT, stop registrations/actions immediately. Do not manually decrement generation or flip retired flags. Retain reset audit/receipt and all subsequent records, restore the pre-reset backup into a separate project, verify identity mapping and counts, then have the operator choose a controlled cutover. There is no one-click cross-generation restore.

For infrastructure loss: pause competition if the application is reachable, record incident times externally, restore verified backups to staging, check migrations/Auth/RLS and all four totals, then point a reviewed production deployment to the recovered project. Never merge totals from browser screenshots or invent completion timestamps for failed requests.

## 5. Rollback

A Vercel code rollback does not roll back PostgreSQL migrations. Keep migrations backward-compatible where possible. If a migration fails, its transaction rolls back; inspect the secure database logs and make a corrective migration. Do not rewrite applied checksums. After any rollback, rehearse sign-in and one complete workflow on staging before reopening participant actions.

## 6. Troubleshooting

| Symptom | Check |
|---|---|
| Setup required | Public project URL/key, server service key, APP_ORIGIN and salt are present |
| Invalid origin | Canonical origin matches scheme/host/port; no alternate unconfigured domain |
| Login fails | Username normalization, active profile, original password, Auth identity and provider rate limits |
| Registration blocked | REGISTRATION_OPEN, capacity, duplicate register number, ID collision, required configured fields |
| Participant cannot submit | LIVE effective state, unexpired timer, enabled identity, ownership, current generation and limit |
| Stale version | Synchronize, inspect new state and explicitly re-enter intended correction |
| Realtime reconnecting | WebSocket reachability, Realtime publication and provider health; periodic authoritative polling continues |
| Display privacy wrong | Review server-managed visible columns and public custom-field flags |
| Count changes downward | Inspect developer corrections, soft deletions and audit; counts derive from qualifying records |
| Reset response lost | Synchronize and retry the pending request with its original receipt ID |
| Database connection limit | Check measured provider concurrency/pooling before event; do not increase clients blindly |

Technical request failures return sanitized codes and correlation IDs. Use these IDs in deployment logs. Logs intentionally omit passwords, cookies, tokens, raw request bodies and raw database errors.
