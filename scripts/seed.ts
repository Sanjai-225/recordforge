import { config } from "dotenv";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });
if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "true")
  throw new Error(
    "Seeding requires ALLOW_DESTRUCTIVE_TESTS=true and a dedicated development/staging Supabase project.",
  );
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase configuration missing.");
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const seeded: { email: string; password: string }[] = [];
const { data: event, error } = await admin.from("events").select("*").single();
if (error || !event) throw new Error("Apply database migrations first.");
if (event.state !== "REGISTRATION_OPEN")
  throw new Error(
    "Open registration from the developer dashboard before seeding.",
  );
const { count } = await admin
  .from("participants")
  .select("id", { head: true, count: "exact" })
  .eq("generation", event.generation);
if (count)
  throw new Error(
    "Seed refuses to mix demo participants with existing registrations. Prepare a clean test event first.",
  );
for (let i = 1; i <= 10; i++) {
  const request = randomUUID(),
    password =
      process.env.SEED_PARTICIPANT_PASSWORD ||
      randomBytes(24).toString("base64url"),
    payload = {
      name: `Demo Participant ${i}`,
      department: i % 2 ? "IT" : "CSE",
      register_number: `9900${String(i).padStart(4, "0")}`,
      username: `demo_${i}`,
      additional_data: {},
    };
  const { error: r } = await admin.rpc("reserve_registration", {
    p_request_id: request,
    p_payload: payload,
  });
  if (r) throw new Error(`Demo reservation ${i} failed: ${r.message}`);
  const { data: u, error: a } = await admin.auth.admin.createUser({
    email: `${request}@participants.invalid`,
    password,
    email_confirm: true,
    app_metadata: { fixture: true },
  });
  if (a) throw new Error(`Demo auth provisioning ${i} failed.`);
  const { error: f } = await admin.rpc("finalize_registration", {
    p_request_id: request,
    p_user_id: u.user.id,
  });
  if (f) throw new Error(`Demo registration ${i} failed.`);
  seeded.push({ email: `${request}@participants.invalid`, password });
}
if (
  process.env.SEED_DEVELOPER_USERNAME &&
  process.env.SEED_DEVELOPER_PASSWORD
) {
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id")
    .eq("username", process.env.SEED_DEVELOPER_USERNAME)
    .eq("role", "developer")
    .is("retired_at", null)
    .single();
  if (!profile)
    throw new Error(
      "Seed developer identity not found. Participants were created; no chatbot state was changed.",
    );
  const {
    data: { user },
  } = await admin.auth.admin.getUserById(profile.user_id);
  const client = createClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: authError } = await client.auth.signInWithPassword({
    email: user!.email!,
    password: process.env.SEED_DEVELOPER_PASSWORD,
  });
  if (authError) throw new Error("Seed developer login failed.");
  for (const state of ["REGISTRATION_CLOSED", "READY", "LIVE"]) {
    const { data: snapshot, error: err } =
      await client.rpc("developer_snapshot");
    if (err) throw new Error("Developer snapshot unavailable.");
    const { error: change } = await client.rpc("admin_command", {
      p_operation: "event_state",
      p_request_id: randomUUID(),
      p_payload: {
        generation: snapshot.event.generation,
        event_version: snapshot.event.version,
        reason: "Preparing isolated demonstration data",
        state,
      },
    });
    if (change) throw new Error(`Demo state ${state} failed.`);
  }
  for (let i = 0; i < seeded.length; i++) {
    const participant = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error: loginError } = await participant.auth.signInWithPassword(
      seeded[i],
    );
    if (loginError) throw new Error("Demo participant login failed.");
    for (let j = 0; j < 1 + (i % 3); j++) {
      const id = randomUUID();
      const { error: createError } = await participant.rpc("create_chatbot", {
        p_id: id,
        p_generation: event.generation,
        p_title: ["CareerMate AI", "Study Assistant", "CodeCoach AI"][j],
        p_url: "https://example.com",
        p_additional: {},
      });
      if (createError) throw new Error("Demo chatbot creation failed.");
      if (j === 0) {
        const { error: deployError } = await participant.rpc(
          "confirm_chatbot",
          {
            p_id: id,
            p_step: "deploy",
            p_generation: event.generation,
            p_version: 1,
          },
        );
        if (deployError) throw new Error("Demo deployment failed.");
        const { error: verifyError } = await participant.rpc(
          "confirm_chatbot",
          {
            p_id: id,
            p_step: "verify",
            p_generation: event.generation,
            p_version: 2,
          },
        );
        if (verifyError) throw new Error("Demo verification failed.");
      }
    }
  }
  console.log(
    "Created 19 demo chatbot records, including 10 verified completions. The demo event is LIVE; end it before PREPARE CLEAN EVENT.",
  );
}
console.log(
  "Created 10 fake participants. Passwords were not printed or saved. Use PREPARE CLEAN EVENT before the real event. Set SEED_PARTICIPANT_PASSWORD for interactive demo logins.",
);
