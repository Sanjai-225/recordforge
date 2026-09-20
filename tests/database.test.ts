import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import {
  database,
  developer,
  admin,
  caller,
  enroll,
  scalar,
} from "./db-harness";
import type {
  Chatbot,
  Consistency,
  DeveloperSnapshot,
  PublicSnapshot,
} from "../src/lib/types";
const db = await database(),
  dev = await developer(db),
  results: { test: string; status: string }[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ test: name, status: "passed" });
    console.log("PASS", name);
  } catch (e) {
    console.error("FAIL", name, (e as Error).message);
    throw e;
  }
}
let first: Awaited<ReturnType<typeof enroll>>,
  second: Awaited<ReturnType<typeof enroll>>,
  bot: Chatbot;
const id = randomUUID();
try {
  await check("registration closed in DRAFT", async () => {
    await assert.rejects(() => enroll(db, 1), /REGISTRATION_CLOSED/);
  });
  await admin(db, dev, "event_state", { state: "REGISTRATION_OPEN" });
  await check("registration and Event ID generation", async () => {
    first = await enroll(db, 1);
    second = await enroll(db, 2);
    await caller(db, first.userId);
    assert.equal(
      await scalar(db, "select event_code from public.participants"),
      "IT0001",
    );
  });
  await check(
    "duplicate register number rejected at database boundary",
    async () => {
      await db.exec("reset role");
      await assert.rejects(() => enroll(db, 1), /REGISTER_EXISTS/);
    },
  );
  await check(
    "simultaneous reservation requests reject duplicate registration",
    async () => {
      await caller(db, "", "service_role");
      const payload = {
        name: "Race",
        username: "race_user",
        department: "IT",
        register_number: "20261111",
        additional_data: {},
      };
      const out = await Promise.allSettled([
        scalar(db, "select public.reserve_registration($1,$2)", [
          randomUUID(),
          payload,
        ]),
        scalar(db, "select public.reserve_registration($1,$2)", [
          randomUUID(),
          payload,
        ]),
      ]);
      assert.equal(out.filter((x) => x.status === "fulfilled").length, 1);
    },
  );
  await check("Event ID collision fails safely", async () => {
    await caller(db, "", "service_role");
    await assert.rejects(
      () =>
        scalar(db, "select public.reserve_registration($1,$2)", [
          randomUUID(),
          {
            name: "Collision",
            username: "collision_user",
            department: "IT",
            register_number: "99990001",
            additional_data: {},
          },
        ]),
      /EVENT_ID_COLLISION/,
    );
  });
  await check(
    "RLS isolates profiles and chatbot records; direct role/timestamp writes denied",
    async () => {
      await caller(db, first.userId);
      assert.equal(
        (await db.query("select * from public.participants")).rows.length,
        1,
      );
      assert.equal(
        (await db.query("select * from public.profiles")).rows.length,
        1,
      );
      await assert.rejects(
        () => db.exec("update public.profiles set role='developer'"),
        /permission denied/,
      );
      await assert.rejects(
        () => db.exec("insert into public.audit_logs(action) values('fake')"),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          scalar(db, "select public.admin_command($1,$2,$3)", [
            "event_state",
            {},
            randomUUID(),
          ]),
        /NOT_AUTHORIZED/,
      );
      await assert.rejects(
        () => scalar(db, "select public.developer_snapshot()"),
        /NOT_AUTHORIZED/,
      );
      await assert.rejects(
        () => scalar(db, "select public.evidence_export($1)", ["audit"]),
        /NOT_AUTHORIZED/,
      );
    },
  );
  await check("participant cannot add before LIVE", async () => {
    await caller(db, first.userId);
    await assert.rejects(
      () =>
        scalar(db, "select public.create_chatbot($1,1,$2,$3)", [
          id,
          "First",
          "https://example.com",
        ]),
      /EVENT_NOT_LIVE/,
    );
  });
  await admin(db, dev, "event_state", { state: "REGISTRATION_CLOSED" });
  await admin(db, dev, "event_state", { state: "READY" });
  await admin(db, dev, "event_state", { state: "LIVE" });
  await check(
    "create retry returns same record with one audit event",
    async () => {
      await caller(db, first.userId);
      bot = await scalar(db, "select public.create_chatbot($1,1,$2,$3)", [
        id,
        "First",
        "https://example.com",
      ]);
      const retry = await scalar<Chatbot>(
        db,
        "select public.create_chatbot($1,1,$2,$3)",
        [id, "First", "https://example.com"],
      );
      assert.equal(retry.id, bot.id);
      await caller(db, dev);
      assert.equal(
        await scalar(
          db,
          "select count(*)::integer from public.audit_logs where action='chatbot_created'",
        ),
        1,
      );
    },
  );
  await check("verification before deployment rejected", async () => {
    await caller(db, first.userId);
    await assert.rejects(
      () => scalar(db, "select public.confirm_chatbot($1,null,1,1)", [id]),
      /INVALID_TRANSITION/,
    );
    await assert.rejects(
      () => scalar(db, "select public.confirm_chatbot($1,'verify',1,1)", [id]),
      /DEPLOY_FIRST/,
    );
  });
  await check("other participant cannot read or confirm chatbot", async () => {
    await caller(db, second.userId);
    assert.equal(
      (await db.query("select * from public.chatbot_submissions")).rows.length,
      0,
    );
    await assert.rejects(
      () => scalar(db, "select public.confirm_chatbot($1,'deploy',1,1)", [id]),
      /NOT_FOUND/,
    );
  });
  await check("draft edits are version guarded", async () => {
    await caller(db, first.userId);
    bot = await scalar(db, "select public.edit_chatbot($1,1,$2,$3)", [
      id,
      "First revised",
      "https://example.com",
    ]);
    await assert.rejects(
      () =>
        scalar(db, "select public.edit_chatbot($1,1,$2,$3)", [
          id,
          "Stale",
          "https://example.com",
        ]),
      /STALE_VERSION/,
    );
  });
  await check(
    "deployment timestamp comes from database and freezes participant edits",
    async () => {
      await caller(db, first.userId);
      bot = await scalar(
        db,
        "select public.confirm_chatbot($1,'deploy',1,$2)",
        [id, bot.version],
      );
      assert.ok(bot.deployed_at);
      assert.equal(bot.verified_at, null);
      await assert.rejects(
        () =>
          scalar(db, "select public.edit_chatbot($1,$2,$3,$4)", [
            id,
            bot.version,
            "Nope",
            "https://example.com",
          ]),
        /RECORD_LOCKED/,
      );
      await assert.rejects(
        () =>
          db.query(
            "update public.chatbot_submissions set verified_at=now() where id=$1",
            [id],
          ),
        /permission denied/,
      );
    },
  );
  await check(
    "burst of duplicate verification requests counts once with original timestamp",
    async () => {
      await caller(db, first.userId);
      const copies = await Promise.all(
        Array.from({ length: 30 }, () =>
          scalar<Chatbot>(
            db,
            "select public.confirm_chatbot($1,'verify',1,$2)",
            [id, bot.version],
          ),
        ),
      );
      bot = copies[0];
      assert.equal(new Set(copies.map((b) => b.verified_at)).size, 1);
      await caller(db, dev);
      assert.equal(
        await scalar(
          db,
          "select count(*)::integer from public.audit_logs where action='verification_confirmed'",
        ),
        1,
      );
      const d = await scalar<Consistency>(
        db,
        "select public.consistency_check()",
      );
      assert.ok(d.consistent);
      assert.equal(d.master_total, 1);
    },
  );
  await check(
    "public RPC has safe columns, accurate totals and no private IDs",
    async () => {
      await caller(db, "", "anon");
      await assert.rejects(
        () => db.exec("select * from public.participants"),
        /permission denied/,
      );
      await assert.rejects(
        () => db.exec("select * from public.audit_logs"),
        /permission denied/,
      );
      const snapshot = await scalar<PublicSnapshot>(
        db,
        "select public.public_snapshot('leaderboard')",
      );
      assert.equal(snapshot.metrics.completed, 1);
      assert.equal(snapshot.rows.length, 2);
      const raw = JSON.stringify(snapshot);
      for (const secret of [
        first.userId,
        first.id,
        "register_number",
        "password",
        "actor_user_id",
      ])
        assert.ok(!raw.includes(secret));
    },
  );
  await check(
    "configuration removes private display columns server-side",
    async () => {
      await admin(db, dev, "dashboard_save", {
        kind: "leaderboard",
        config: { columns: ["event_code", "completed"] },
      });
      await caller(db, "", "anon");
      const snap = await scalar<PublicSnapshot>(
        db,
        "select public.public_snapshot('leaderboard')",
      );
      assert.ok(!("name" in snap.rows[0]));
      assert.ok(!("department" in snap.rows[0]));
    },
  );
  await check(
    "participant limit and per-user chatbot limit enforced",
    async () => {
      await caller(db, first.userId);
      for (let i = 2; i <= 10; i++)
        await scalar(db, "select public.create_chatbot($1,1,$2,$3)", [
          randomUUID(),
          `Bot ${i}`,
          "https://example.com",
        ]);
      await assert.rejects(
        () =>
          scalar(db, "select public.create_chatbot($1,1,$2,$3)", [
            randomUUID(),
            "Overflow",
            "https://example.com",
          ]),
        /CHATBOT_LIMIT/,
      );
      await caller(db, dev);
      const e = await scalar<Record<string, unknown>>(
        db,
        "select to_jsonb(e) from public.events e",
      );
      await assert.rejects(
        () => admin(db, dev, "configure_event", { ...e, participant_limit: 1 }),
        /CONFIG_CONFLICT/,
      );
      await assert.rejects(
        () => admin(db, dev, "configure_event", { ...e, chatbot_limit: 5 }),
        /CONFIG_CONFLICT/,
      );
    },
  );
  await check(
    "pause blocks changes and resume preserves deadline",
    async () => {
      await admin(db, dev, "event_state", { state: "PAUSED" });
      await caller(db, second.userId);
      await assert.rejects(
        () =>
          scalar(db, "select public.create_chatbot($1,1,$2,$3)", [
            randomUUID(),
            "Paused",
            "https://example.com",
          ]),
        /EVENT_NOT_LIVE/,
      );
      await admin(db, dev, "event_state", { state: "LIVE" });
      await caller(db, dev);
      const e = await scalar<{ pause_seconds: number }>(
        db,
        "select to_jsonb(e) from public.events e",
      );
      assert.ok(e.pause_seconds >= 0);
    },
  );
  await check(
    "developer correction reduces count and preserves audit",
    async () => {
      await admin(db, dev, "chatbot_correct", {
        id: bot.id,
        version: bot.version,
        title: bot.title,
        deployment_url: bot.deployment_url,
        deployed_at: bot.deployed_at,
        verified_at: null,
        additional_data: {},
      });
      await caller(db, dev);
      const state = await scalar<Consistency>(
        db,
        "select public.consistency_check()",
      );
      assert.equal(state.master_total, 0);
      assert.ok(state.consistent);
    },
  );
  await check(
    "stale participant retry cannot reverify a developer-corrected record",
    async () => {
      await caller(db, first.userId);
      await assert.rejects(
        () =>
          scalar(db, "select public.confirm_chatbot($1,'verify',1,$2)", [
            id,
            bot.version,
          ]),
        /STALE_VERSION/,
      );
    },
  );
  await check(
    "disabled participant access denied while retained completions remain consistent",
    async () => {
      await caller(db, dev);
      let p = await scalar<Record<string, unknown>>(
        db,
        "select to_jsonb(p) from public.participants p where id=$1",
        [first.id],
      );
      await admin(db, dev, "participant_edit", { ...p, enabled: false });
      await caller(db, first.userId);
      await assert.rejects(
        () => scalar(db, "select public.participant_snapshot()"),
        /NOT_AUTHORIZED/,
      );
      await caller(db, dev);
      p = await scalar(
        db,
        "select to_jsonb(p) from public.participants p where id=$1",
        [first.id],
      );
      await admin(db, dev, "participant_edit", { ...p, enabled: true });
    },
  );
  await check("soft deletion and restoration honor current slots", async () => {
    await caller(db, dev);
    bot = await scalar(
      db,
      "select to_jsonb(c) from public.chatbot_submissions c where id=$1",
      [id],
    );
    await admin(db, dev, "chatbot_remove", { id, version: bot.version });
    await caller(db, dev);
    bot = await scalar(
      db,
      "select to_jsonb(c) from public.chatbot_submissions c where id=$1",
      [id],
    );
    await admin(db, dev, "chatbot_restore", { id, version: bot.version });
  });
  await check(
    "developer feed and exports derive authoritative data",
    async () => {
      await caller(db, dev);
      const snap = await scalar<DeveloperSnapshot>(
        db,
        "select public.developer_snapshot('chatbots')",
      );
      assert.equal(snap.total, 10);
      const exported = await scalar<{ rows: unknown[] }>(
        db,
        "select public.evidence_export('chatbots')",
      );
      assert.equal(exported.rows.length, 10);
    },
  );
  await check(
    "developer sorting uses an allowlist and ordered database results",
    async () => {
      await caller(db, dev);
      const sorted = await scalar<DeveloperSnapshot>(
        db,
        "select public.developer_snapshot(p_section=>'chatbots',p_sort=>'title',p_direction=>'asc')",
      );
      const titles = (sorted.rows as Chatbot[]).map((row) => row.title);
      assert.deepEqual(titles, [...titles].sort());
      await assert.rejects(
        () =>
          scalar(db, "select public.developer_snapshot(p_sort=>'drop table')"),
        /INVALID_INPUT/,
      );
    },
  );
  await check(
    "server deadline blocks writes even when stored state is LIVE",
    async () => {
      await db.exec("reset role");
      const original = await scalar<string>(
        db,
        "select started_at::text from public.events",
      );
      await db.exec(
        "update public.events set started_at=clock_timestamp()-interval '2 hours'",
      );
      await caller(db, second.userId);
      await assert.rejects(
        () =>
          scalar(db, "select public.create_chatbot($1,1,$2,$3)", [
            randomUUID(),
            "Too late",
            "https://example.com",
          ]),
        /EVENT_EXPIRED/,
      );
      await caller(db, "", "anon");
      const display = await scalar<PublicSnapshot>(
        db,
        "select public.public_snapshot('progress')",
      );
      assert.equal(display.event.state, "ENDED");
      await db.exec("reset role");
      await db.query("update public.events set started_at=$1", [original]);
    },
  );
  await check(
    "rate limits retain live windows and deny unauthenticated execution",
    async () => {
      await caller(db, "", "service_role");
      const key = "a".repeat(64);
      assert.equal(
        await scalar(db, "select public.take_rate_limit($1,1,300)", [key]),
        true,
      );
      assert.equal(
        await scalar(db, "select public.take_rate_limit($1,1,300)", [key]),
        false,
      );
      await db.exec("reset role");
      assert.equal(
        await scalar(
          db,
          "select count(*)::integer from public.rate_limits where key=$1 and expires_at>clock_timestamp()",
          [key],
        ),
        1,
      );
      await caller(db, "", "anon");
      await assert.rejects(
        () => scalar(db, "select public.take_rate_limit($1,1,300)", [key]),
        /permission denied/,
      );
    },
  );
  await check("reset cannot execute during live competition", async () => {
    await assert.rejects(
      () =>
        admin(db, dev, "prepare_clean_event", {
          confirmation: "PREPARE CLEAN EVENT",
        }),
      /END_EVENT_BEFORE_RESET/,
    );
  });
  await admin(db, dev, "event_state", { state: "ENDED" });
  await check("event end blocks participant writes", async () => {
    await caller(db, second.userId);
    await assert.rejects(
      () =>
        scalar(db, "select public.create_chatbot($1,1,$2,$3)", [
          randomUUID(),
          "Ended",
          "https://example.com",
        ]),
      /EVENT_NOT_LIVE/,
    );
  });
  await check(
    "unsafe field configuration cannot override protected role",
    async () => {
      await assert.rejects(
        () =>
          admin(db, dev, "field_save", {
            scope: "registration",
            key: "role",
            label: "Role",
            type: "text",
            required: false,
            enabled: true,
            show_participant: true,
            show_public: false,
            options: [],
          }),
        /check constraint/,
      );
    },
  );
  await check(
    "prepare clean event preserves configuration/audit and retry does not reset new data",
    async () => {
      await caller(db, dev);
      const before = await scalar<DeveloperSnapshot>(
          db,
          "select public.developer_snapshot()",
        ),
        auditCount = await scalar<number>(
          db,
          "select count(*)::integer from public.audit_logs",
        );
      await assert.rejects(
        () => admin(db, dev, "prepare_clean_event", { confirmation: "WRONG" }),
        /CONFIRMATION_REQUIRED/,
      );
      const request = randomUUID(),
        payload = {
          generation: before.event.generation,
          event_version: before.event.version,
          reason: "Final readiness check",
          confirmation: "PREPARE CLEAN EVENT",
        };
      const result = await scalar(db, "select public.admin_command($1,$2,$3)", [
        "prepare_clean_event",
        payload,
        request,
      ]);
      await admin(db, dev, "event_state", { state: "REGISTRATION_OPEN" });
      const fresh = await enroll(db, 1);
      await caller(db, dev);
      assert.deepEqual(
        await scalar(db, "select public.admin_command($1,$2,$3)", [
          "prepare_clean_event",
          payload,
          request,
        ]),
        result,
      );
      const after = await scalar<DeveloperSnapshot>(
        db,
        "select public.developer_snapshot()",
      );
      assert.equal(after.metrics.participants, 1);
      assert.equal(after.event.generation, 2);
      assert.equal(
        after.event.participant_limit,
        before.event.participant_limit,
      );
      assert.deepEqual(after.configs, before.configs);
      assert.ok(
        (await scalar<number>(
          db,
          "select count(*)::integer from public.audit_logs",
        )) > auditCount,
      );
      await caller(db, first.userId);
      await assert.rejects(
        () => scalar(db, "select public.participant_snapshot()"),
        /NOT_AUTHORIZED/,
      );
      await caller(db, fresh.userId);
      assert.ok(await scalar(db, "select public.participant_snapshot()"));
    },
  );
  await check(
    "granular resets preserve audit and developer access",
    async () => {
      await admin(db, dev, "reset_submissions", {
        confirmation: "RESET SUBMISSIONS",
      });
      await admin(db, dev, "reset_runtime", { confirmation: "RESET RUNTIME" });
      await admin(db, dev, "reset_dashboards", {
        confirmation: "RESET DASHBOARDS",
      });
      await caller(db, dev);
      const d = await scalar<DeveloperSnapshot>(
        db,
        "select public.developer_snapshot()",
      );
      assert.equal(d.event.state, "DRAFT");
      assert.equal(d.metrics.completed, 0);
      assert.ok(d.consistency?.consistent);
    },
  );
  await mkdir("docs/test-results", { recursive: true });
  await writeFile(
    "docs/test-results/database.json",
    JSON.stringify(
      {
        engine: "PGlite PostgreSQL; Supabase auth.uid stub, SQL roles enforced",
        at: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  );
  console.log(`${results.length} database checks passed.`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await db.close();
}
