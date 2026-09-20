import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
config({ path: ".env.test.local", quiet: true });
const origin = process.env.TEST_APP_ORIGIN,
  url = process.env.TEST_SUPABASE_URL,
  key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
if (
  process.env.ALLOW_DESTRUCTIVE_TESTS !== "true" ||
  !origin ||
  !url ||
  !key ||
  !process.env.TEST_DEVELOPER_USERNAME ||
  !process.env.TEST_DEVELOPER_PASSWORD
)
  throw new Error(
    "Provider validation requires explicit test project/app environment values in .env.test.local and ALLOW_DESTRUCTIVE_TESTS=true.",
  );
const results: string[] = [];
class BrowserSession {
  jar = new Map<string, string>();
  async request(path: string, payload?: unknown) {
    const response = await fetch(`${origin}${path}`, {
      method: payload ? "POST" : "GET",
      redirect: "manual",
      headers: {
        origin: origin!,
        "Content-Type": "application/json",
        cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";")[0],
        i = pair.indexOf("=");
      this.jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const data = response.headers.get("content-type")?.includes("json")
      ? await response.json()
      : null;
    return { response, data };
  }
  async command(value: unknown) {
    const r = await this.request("/api/command", value);
    assert.equal(r.response.status, 200, JSON.stringify(r.data));
    return r.data.result;
  }
}
const developer = new BrowserSession(),
  participant = new BrowserSession();
const login = await developer.request("/api/auth/login", {
  username: process.env.TEST_DEVELOPER_USERNAME,
  password: process.env.TEST_DEVELOPER_PASSWORD,
  developer: true,
});
assert.equal(login.response.status, 200);
results.push("developer login through Next.js + Supabase Auth");
const initial = await developer.request("/api/snapshot?scope=developer");
assert.equal(initial.response.status, 200);
assert.equal(
  initial.data.metrics.participants,
  0,
  "Test refuses to modify an event containing participants.",
);
assert.equal(initial.data.metrics.submitted, 0);
assert.equal(initial.data.event.state, "DRAFT");
async function admin(operation: string, payload: Record<string, unknown>) {
  const snapshot = await developer.request("/api/snapshot?scope=developer");
  return developer.command({
    type: "admin",
    operation,
    request_id: randomUUID(),
    payload: {
      generation: snapshot.data.event.generation,
      event_version: snapshot.data.event.version,
      reason: "Provider integration validation",
      ...payload,
    },
  });
}
await admin("event_state", { state: "REGISTRATION_OPEN" });
const requestId = randomUUID(),
  password = randomBytes(24).toString("base64url"),
  username = `provider_${randomBytes(5).toString("hex")}`;
const registration = {
  request_id: requestId,
  name: "Provider Test",
  department: "IT",
  register_number: "TEST9999",
  username,
  password,
  additional_data: {},
};
const reg = await participant.request("/api/auth/register", registration);
assert.equal(reg.response.status, 200);
results.push("username registration and cookie session");
assert.equal(
  (
    await new BrowserSession().request("/api/auth/register", {
      ...registration,
      request_id: randomUUID(),
      username: `other_${randomBytes(3).toString("hex")}`,
    })
  ).data.code,
  "REGISTER_EXISTS",
);
assert.equal(
  (
    await new BrowserSession().request("/api/auth/login", {
      username,
      password: "definitely-wrong",
      developer: false,
    })
  ).data.code,
  "INVALID_CREDENTIALS",
);
results.push("duplicate registration and wrong-password rejection");
assert.equal(
  (await participant.request("/api/snapshot?scope=developer")).response.status,
  403,
);
results.push("participant blocked from developer API");
await admin("event_state", { state: "REGISTRATION_CLOSED" });
await admin("event_state", { state: "READY" });
await admin("event_state", { state: "LIVE" });
const snap = await participant.request("/api/snapshot?scope=participant"),
  id = randomUUID(),
  generation = snap.data.event.generation;
await participant.command({
  type: "create",
  id,
  generation,
  title: "Provider verified chatbot",
  url: "https://example.com",
  additional_data: {},
});
const before = await participant.request("/api/command", {
  type: "confirm",
  id,
  generation,
  version: 1,
  step: "verify",
});
assert.equal(before.data.code, "DEPLOY_FIRST");
await participant.command({
  type: "confirm",
  id,
  generation,
  version: 1,
  step: "deploy",
});
// Check the actual managed Realtime invalidation before confirming verification.
const realtime = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let signal = false;
const channel = realtime
  .channel(`provider-${requestId}`)
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "event_signals" },
    () => {
      signal = true;
    },
  );
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error("Realtime subscription timed out")),
    15000,
  );
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      clearTimeout(timeout);
      resolve();
    }
    if (status === "CHANNEL_ERROR") {
      clearTimeout(timeout);
      reject(new Error("Realtime channel failed"));
    }
  });
});
await Promise.all(
  Array.from({ length: 5 }, () =>
    participant.command({
      type: "confirm",
      id,
      generation,
      version: 2,
      step: "verify",
    }),
  ),
);
for (let i = 0; i < 30 && !signal; i++)
  await new Promise((r) => setTimeout(r, 100));
assert.ok(signal, "Managed Realtime did not deliver an invalidation.");
await realtime.removeChannel(channel);
results.push("managed Realtime invalidation and duplicate verification");
const publicClient = new BrowserSession();
assert.equal(
  (await publicClient.request("/api/snapshot?scope=progress")).data.metrics
    .completed,
  1,
);
const refreshed = await participant.request("/api/snapshot?scope=participant");
assert.equal(refreshed.data.metrics.completed, 1);
assert.ok(refreshed.data.chatbots[0].verified_at);
results.push("authoritative reconciliation after ignored response");
assert.equal(
  (await developer.request("/api/snapshot?scope=developer&section=health")).data
    .consistency.consistent,
  true,
);
const exportResult = await developer.request("/api/export?kind=completions");
assert.equal(exportResult.response.status, 200);
results.push("CSV export and consistency diagnostics");
await admin("event_state", { state: "ENDED" });
await admin("prepare_clean_event", { confirmation: "PREPARE CLEAN EVENT" });
assert.equal(
  (await participant.request("/api/snapshot?scope=participant")).response
    .status,
  403,
);
results.push("clean-event reset revokes old participant session");
await mkdir("docs/test-results", { recursive: true });
await writeFile(
  "docs/test-results/provider.json",
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
);
console.log(`${results.length} provider integration checks passed.`);
