# Cloud-only setup — Supabase plus Vercel or Render

No local Supabase and no Docker are required for this route. Node/npm are still
used by Antigravity to install dependencies, run checks and send the checked-in
migrations to the cloud database.

Use exactly one frontend host for the canonical event URL. Vercel is the
recommended choice because this is a native Next.js application. Render is also
supported through `render.yaml`. Both connect to the same type of Supabase cloud
project.

## 1. Put the code in GitHub

Extract the delivery ZIP, open its folder in Antigravity, run `npm ci`, and run
the local code-only checks from README. Create a private empty GitHub repository,
then use Antigravity's Source Control panel or these terminal commands:

```sh
git init
git add .
git commit -m "Initial RecordForge cloud release"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/recordforge.git
git push -u origin main
```

Confirm `.env.local` is absent from the GitHub file list. Keep `main` as the
final-event branch. A `testing` branch can create preview/staging deployments.

## 2. Create the cloud database

Create a Supabase project intended for testing first. Record its project
reference, project URL, publishable/anon key and service-role key in a password
manager. Do not put the service key in GitHub or an agent message.

From Antigravity's terminal, authenticate the CLI and apply the ordered
migrations directly to the cloud project:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

The dry run must list only this repository's migrations. Never use
`supabase db reset --linked`; it would target linked cloud data. New future
changes must be new migration files.

In the Supabase dashboard, keep password sign-in enabled, disable direct public
signup, require passwords of at least 12 characters, and set the Auth Site URL
to the final HTTPS application URL. Confirm `event_signals` is in the Realtime
publication after migrations.

## 3. Create the initial developer

The preferred auditable route uses the included script from a trusted terminal.
Create a temporary private `.env.local` containing the cloud project URL,
publishable key, service-role key and these one-time variables:

```dotenv
DEVELOPER_USERNAME=event_admin
DEVELOPER_PASSWORD=USE_A_UNIQUE_12_PLUS_CHARACTER_PASSWORD
DEVELOPER_EMAIL=ORGANIZER_CONTROLLED_EMAIL
```

Run `npm run bootstrap:developer`, sign in successfully, and then delete the
three `DEVELOPER_*` lines. Keep the service-role key only in trusted server
environment settings. The script never overwrites an identity or prints the
password.

## 4A. Deploy on Vercel (recommended)

Import the private GitHub repository into Vercel using the Next.js preset. Add
these Production environment variables before the final build:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
APP_ORIGIN
RATE_LIMIT_SALT
```

`APP_ORIGIN` must be the exact assigned HTTPS domain, without a trailing slash.
Generate `RATE_LIMIT_SALT` as a random 32-byte hexadecimal value. Do not deploy
`DATABASE_URL`, developer passwords, seed passwords or
`ALLOW_DESTRUCTIVE_TESTS=true`. Redeploy after changing public variables or the
origin. Point Preview deployments to a staging database, not final-event data.

## 4B. Deploy on Render

Create a Blueprint from the private GitHub repository and select its
`render.yaml`, or create a Node Web Service manually with:

```text
Build command: npm ci && npm run build
Start command: npm start
Health check: /login
```

Enter the same five environment variables listed for Vercel. After Render gives
the service its final HTTPS URL, set that exact value as `APP_ORIGIN`, update the
Supabase Auth Site URL and trigger a new deployment. Do not add a Render
PostgreSQL database; Supabase is the one authoritative database.

## 5. Test and then prepare the same cloud event

Use the developer dashboard to open registration, register fake participants,
move through READY/LIVE, create/deploy/verify chatbots, inspect both public
displays, test reconnect/two tabs, pause/resume/end, corrections, exports and
consistency. The provider test in `docs/TESTING.md` is destructive and is allowed
only while the cloud event is an empty designated test event.

Before the real event:

1. End the test event.
2. Export participants, submissions, completions, timeline and audit.
3. Confirm a cloud backup/recovery method.
4. Run **PREPARE CLEAN EVENT**, enter a reason and type the required phrase.
5. Confirm state is DRAFT, active participants/submissions/completions are zero,
   developer login still works, configuration remains and the reset is audited.
6. Configure the final limits/fields/displays, open registration and follow
   `EVENT_DAY.md`.

Using test and final data in the same cloud environment is supported by the
generation-based clean-event operation. Separate staging and production
projects are safer, but are not required for the specified single-event model.
