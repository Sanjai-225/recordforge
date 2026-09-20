import { config } from "dotenv";
import pg from "pg";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
config({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL is required. Prefer the Supabase CLI migration workflow for managed projects.",
  );
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(
    "select pg_advisory_lock(hashtext('recordforge_migrations'))",
  );
  await client.query(
    "create schema if not exists recordforge_migrations; create table if not exists recordforge_migrations.history(name text primary key,sha256 text not null,applied_at timestamptz default now()); revoke all on schema recordforge_migrations from public;",
  );
  for (const name of (await readdir("supabase/migrations")).sort()) {
    const sql = await readFile(`supabase/migrations/${name}`, "utf8"),
      hash = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query(
      "select sha256 from recordforge_migrations.history where name=$1",
      [name],
    );
    if (existing.rowCount) {
      if (existing.rows[0].sha256 !== hash)
        throw new Error(
          `Applied migration ${name} changed. Create a new migration; do not overwrite history.`,
        );
      continue;
    }
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        "insert into recordforge_migrations.history(name,sha256) values($1,$2)",
        [name, hash],
      );
      await client.query("commit");
      console.log("Applied", name);
    } catch {
      await client.query("rollback");
      throw new Error(
        `Migration ${name} failed and rolled back. Inspect schema in your secure database tooling.`,
      );
    }
  }
} finally {
  await client.query(
    "select pg_advisory_unlock(hashtext('recordforge_migrations'))",
  );
  await client.end();
}
