import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || process.env.ALLOW_DESTRUCTIVE_TESTS !== "true")
  throw new Error(
    "Set TEST_DATABASE_URL to a dedicated empty PostgreSQL test database and ALLOW_DESTRUCTIVE_TESTS=true.",
  );
const parsed = new URL(connectionString);
if (!parsed.pathname.toLowerCase().includes("recordforge_test"))
  throw new Error(
    "The database name must contain recordforge_test. Never run on an event database.",
  );
const pool = new pg.Pool({ connectionString, max: 121 });
const d = await pool.connect();
try {
  const existing = await d.query(
    "select to_regclass('public.events') as existing",
  );
  if (existing.rows[0].existing)
    throw new Error(
      "Refusing to initialize a database that contains an event. Use a fresh disposable test database.",
    );
  await d.query(`do $$ begin create role anon; exception when duplicate_object then null; end $$;
 do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
 do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end $$;
 create schema if not exists auth; create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  for (const name of (await readdir("supabase/migrations")).sort())
    await d.query(await readFile(`supabase/migrations/${name}`, "utf8"));
  const dev = randomUUID();
  await d.query("insert into auth.users values($1,$2)", [
    dev,
    `${dev}@test.invalid`,
  ]);
  await d.query(
    "insert into public.profiles(user_id,username,role) values($1,'load_developer','developer')",
    [dev],
  );
  await d.query("select set_config('request.jwt.claim.sub',$1,false)", [dev]);
  async function admin(state: string) {
    const {
      rows: [e],
    } = await d.query("select generation,version from public.events");
    await d.query("select public.admin_command($1,$2,$3)", [
      "event_state",
      {
        generation: e.generation,
        event_version: e.version,
        reason: "Isolated concurrency validation",
        state,
      },
      randomUUID(),
    ]);
  }
  await admin("REGISTRATION_OPEN");
  const users: string[] = [];
  for (let i = 1; i <= 120; i++) {
    const uid = randomUUID(),
      request = randomUUID();
    users.push(uid);
    await d.query("select public.reserve_registration($1,$2)", [
      request,
      {
        name: `Load ${i}`,
        department: "IT",
        register_number: `2026${String(i).padStart(4, "0")}`,
        username: `load_${i}`,
        additional_data: {},
      },
    ]);
    await d.query("insert into auth.users values($1,$2)", [
      uid,
      `${request}@participants.invalid`,
    ]);
    await d.query("select public.finalize_registration($1,$2)", [request, uid]);
  }
  await admin("REGISTRATION_CLOSED");
  await admin("READY");
  await admin("LIVE");
  const began = Date.now(),
    connections = new Set<number>(),
    latency: number[] = [];
  await Promise.all(
    users.map(async (uid) => {
      const client = await pool.connect();
      try {
        await client.query(
          "select set_config('request.jwt.claim.sub',$1,false)",
          [uid],
        );
        await client.query("set role authenticated");
        connections.add(
          (await client.query("select pg_backend_pid() as pid")).rows[0].pid,
        );
        for (let i = 0; i < 10; i++) {
          const id = randomUUID();
          await client.query("select public.create_chatbot($1,1,$2,$3)", [
            id,
            `Chatbot ${i + 1}`,
            "https://example.com",
          ]);
          await client.query("select public.confirm_chatbot($1,'deploy',1,1)", [
            id,
          ]);
          const start = Date.now();
          await client.query("select public.confirm_chatbot($1,'verify',1,2)", [
            id,
          ]);
          latency.push(Date.now() - start);
          for (let j = 0; j < 4; j++)
            await client.query(
              "select public.confirm_chatbot($1,'verify',1,2)",
              [id],
            );
        }
      } finally {
        await client.query("reset role");
        client.release();
      }
    }),
  );
  const {
    rows: [r],
  } = await d.query("select public.consistency_check() as check");
  assert.ok(r.check.consistent);
  for (const k of [
    "qualifying_rows",
    "participant_sum",
    "leaderboard_total",
    "master_total",
  ])
    assert.equal(r.check[k], 1200);
  assert.equal(
    Number(
      (
        await d.query(
          "select count(*) as n from public.audit_logs where action='verification_confirmed'",
        )
      ).rows[0].n,
    ),
    1200,
  );
  const pub = (
    await d.query("select public.public_snapshot('leaderboard') as data")
  ).rows[0].data;
  assert.equal(
    pub.rows.reduce(
      (sum: number, row: { completed: number }) => sum + row.completed,
      0,
    ),
    1200,
  );
  assert.equal(
    (await d.query("select public.public_snapshot('progress') as data")).rows[0]
      .data.metrics.completed,
    1200,
  );
  assert.equal(
    connections.size,
    120,
    "Every participant uses a separate PostgreSQL backend",
  );
  latency.sort((a, b) => a - b);
  const report = {
    at: new Date().toISOString(),
    engine: "Native PostgreSQL",
    participants: 120,
    records: 1200,
    verification_requests: 6000,
    backend_connections: connections.size,
    consistency: r.check,
    duration_ms: Date.now() - began,
    verification_p95_ms: latency[Math.floor(latency.length * 0.95)],
  };
  await mkdir("docs/test-results", { recursive: true });
  await writeFile(
    "docs/test-results/native-concurrency.json",
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  d.release();
  await pool.end();
}
