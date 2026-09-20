import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
export const eventId = "00000000-0000-4000-8000-000000000001";
export async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  for (const file of (await readdir("supabase/migrations")).sort()) {
    const sql = await readFile(`supabase/migrations/${file}`, "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      const e = error as Error & {
        position?: string;
        internalPosition?: string;
        internalQuery?: string;
      };
      const pos = Number(e.position || e.internalPosition || 0);
      console.error(
        file,
        e.message,
        "position",
        pos,
        (e.internalQuery || sql).slice(Math.max(0, pos - 130), pos + 130),
      );
      throw error;
    }
  }
  return db;
}
export async function caller(db: PGlite, id: string, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`set role ${role}`);
}
export async function developer(db: PGlite) {
  const id = randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)", [
    id,
    `${id}@test.invalid`,
  ]);
  await db.query(
    "insert into public.profiles(user_id,username,role) values($1,'test_developer','developer')",
    [id],
  );
  return id;
}
export async function scalar<T = Record<string, unknown>>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, params);
  return Object.values(r.rows[0])[0];
}
export async function admin(
  db: PGlite,
  id: string,
  op: string,
  data: Record<string, unknown> = {},
  requestId = randomUUID(),
) {
  await caller(db, id);
  const event = await scalar<{ generation: number; version: number }>(
    db,
    "select to_jsonb(e) from public.events e",
  );
  return scalar(db, "select public.admin_command($1,$2,$3)", [
    op,
    {
      generation: event.generation,
      event_version: event.version,
      reason: "Automated validation",
      ...data,
    },
    requestId,
  ]);
}
export async function enroll(db: PGlite, index: number) {
  await db.exec("reset role");
  const requestId = randomUUID(),
    userId = randomUUID();
  const payload = {
    name: `Participant ${index}`,
    username: `user_${index}`,
    department: "IT",
    register_number: `2026${String(index).padStart(4, "0")}`,
    additional_data: {},
  };
  await caller(db, "", "service_role");
  await scalar(db, "select public.reserve_registration($1,$2)", [
    requestId,
    payload,
  ]);
  await db.exec("reset role");
  await db.query("insert into auth.users(id,email) values($1,$2)", [
    userId,
    `${requestId}@participants.invalid`,
  ]);
  await caller(db, "", "service_role");
  const p = await scalar<{ id: string; generation: number }>(
    db,
    "select public.finalize_registration($1,$2)",
    [requestId, userId],
  );
  return { userId, requestId, ...p };
}
