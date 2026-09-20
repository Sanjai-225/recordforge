import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  database,
  developer,
  admin,
  enroll,
  caller,
  scalar,
} from "./db-harness";
import type { Chatbot, Consistency, PublicSnapshot } from "../src/lib/types";
const db = await database(),
  start = performance.now(),
  dev = await developer(db);
const participants = 120,
  perParticipant = 10,
  users: Awaited<ReturnType<typeof enroll>>[] = [],
  bots: { id: string; userId: string; version: number }[] = [];
try {
  await admin(db, dev, "event_state", { state: "REGISTRATION_OPEN" });
  for (let i = 1; i <= participants; i++) users.push(await enroll(db, i));
  await assert.rejects(() => enroll(db, 121), /PARTICIPANT_LIMIT/);
  await admin(db, dev, "event_state", { state: "REGISTRATION_CLOSED" });
  await admin(db, dev, "event_state", { state: "READY" });
  await admin(db, dev, "event_state", { state: "LIVE" });
  for (const user of users) {
    await caller(db, user.userId);
    for (let j = 1; j <= perParticipant; j++) {
      const id = randomUUID();
      let bot = await scalar<Chatbot>(
        db,
        "select public.create_chatbot($1,1,$2,$3)",
        [id, `Chatbot ${j}`, "https://example.com/chat"],
      );
      bot = await scalar(
        db,
        "select public.confirm_chatbot($1,'deploy',1,$2)",
        [id, bot.version],
      );
      bots.push({ id, userId: user.userId, version: bot.version });
    }
  }
  console.log(
    "120 participants registered; 1,200 separate chatbots created and deployed.",
  );
  await db.exec("reset role");
  const latency: number[] = [];
  let duplicateRequests = 0;
  // Submit bursts concurrently. PGlite serializes transactions internally: this is a
  // deterministic PostgreSQL invariant test, not evidence of hosted multi-connection throughput.
  const verificationStart = performance.now();
  for (let startIndex = 0; startIndex < bots.length; startIndex += 120) {
    await Promise.all(
      bots.slice(startIndex, startIndex + 120).flatMap((bot, index) => {
        const repeats = index % 10 === 0 ? 5 : 1;
        duplicateRequests += repeats - 1;
        return Array.from({ length: repeats }, async () => {
          const begin = performance.now();
          await db.transaction(async (tx) => {
            await tx.query(
              "select set_config('request.jwt.claim.sub',$1,true)",
              [bot.userId],
            );
            await tx.exec("set local role authenticated");
            const result = await tx.query<{ row: Chatbot }>(
              "select public.confirm_chatbot($1,'verify',1,$2) as row",
              [bot.id, bot.version],
            );
            assert.ok(result.rows[0].row.verified_at);
          });
          latency.push(performance.now() - begin);
        });
      }),
    );
  }
  await caller(db, dev);
  const consistency = await scalar<Consistency>(
    db,
    "select public.consistency_check()",
  );
  assert.ok(consistency.consistent);
  assert.equal(consistency.qualifying_rows, 1200);
  assert.equal(consistency.participant_sum, 1200);
  assert.equal(consistency.leaderboard_total, 1200);
  assert.equal(consistency.master_total, 1200);
  assert.equal(
    await scalar(
      db,
      "select count(*)::integer from public.audit_logs where action='verification_confirmed'",
    ),
    1200,
  );
  assert.equal(
    await scalar(
      db,
      "select count(*)::integer from public.chatbot_submissions",
    ),
    1200,
  );
  await caller(db, "", "anon");
  const leaderboard = await scalar<PublicSnapshot>(
      db,
      "select public.public_snapshot('leaderboard')",
    ),
    progress = await scalar<PublicSnapshot>(
      db,
      "select public.public_snapshot('progress')",
    );
  assert.equal(
    leaderboard.rows.reduce((sum, row) => sum + Number(row.completed), 0),
    1200,
  );
  assert.equal(progress.metrics.completed, 1200);
  latency.sort((a, b) => a - b);
  const report = {
    engine: "PGlite PostgreSQL (single engine; queued concurrent transactions)",
    scope:
      "Database invariants and queued burst/retry simulation; NOT hosted connection/throughput verification",
    participants,
    chatbots_per_participant: perParticipant,
    chatbot_records: bots.length,
    duplicate_verification_requests: duplicateRequests,
    verification_calls: latency.length,
    unique_verification_audits: 1200,
    consistency,
    public_leaderboard_sum: 1200,
    public_progress_total: progress.metrics.completed,
    verification_duration_ms: Math.round(performance.now() - verificationStart),
    total_duration_ms: Math.round(performance.now() - start),
    queued_call_p95_ms: Math.round(latency[Math.floor(latency.length * 0.95)]),
    at: new Date().toISOString(),
  };
  await mkdir("docs/test-results", { recursive: true });
  await writeFile(
    "docs/test-results/load.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await db.close();
}
