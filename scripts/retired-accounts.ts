import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase environment missing.");
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: profiles, error } = await admin
  .from("profiles")
  .select("user_id,retired_at")
  .eq("role", "participant")
  .not("retired_at", "is", null);
if (error) throw new Error("Could not list retired identities.");
if (process.argv.includes("--ban")) {
  if (process.env.RETIRED_ACCOUNT_CONFIRMATION !== "BAN RETIRED PARTICIPANTS")
    throw new Error(
      'Set RETIRED_ACCOUNT_CONFIRMATION="BAN RETIRED PARTICIPANTS". This operation bans retained Auth identities; it does not delete audit data.',
    );
  let done = 0;
  for (const profile of profiles) {
    const { error: e } = await admin.auth.admin.updateUserById(
      profile.user_id,
      { ban_duration: "876000h" },
    );
    if (e)
      throw new Error(
        `Banning stopped after ${done} accounts. Retry safely; prior bans remain applied.`,
      );
    done++;
  }
  console.log(
    `Banned ${done} retired Auth identities. Database records and audit evidence preserved.`,
  );
} else
  console.log(
    `${profiles.length} participant Auth identities are retired by database authorization. Use --ban for an additional provider-level ban. Hard deletion is deliberately excluded because profile/evidence foreign keys are retained.`,
  );
