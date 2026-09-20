import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { usernameSchema, passwordSchema } from "../src/lib/validation";
config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error("Set the Supabase URL and service role key in .env.local.");
const username = usernameSchema.parse(process.env.DEVELOPER_USERNAME),
  password = passwordSchema.parse(process.env.DEVELOPER_PASSWORD),
  email = process.env.DEVELOPER_EMAIL;
if (!email || !email.includes("@"))
  throw new Error(
    "Set DEVELOPER_EMAIL to an organizer-controlled email address.",
  );
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: existing, error: lookupError } = await admin
  .from("profiles")
  .select("user_id")
  .eq("username", username)
  .is("retired_at", null)
  .maybeSingle();
if (lookupError)
  throw new Error("Database migrations must be applied before bootstrap.");
if (existing)
  throw new Error(
    "That username is already assigned. This script never overwrites an existing identity.",
  );
const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { bootstrap: "recordforge_developer" },
});
if (error)
  throw new Error(
    "Developer Auth creation failed. Check the email, password requirements and Auth settings.",
  );
const { error: profileError } = await admin.from("profiles").insert({
  user_id: data.user.id,
  username,
  role: "developer",
  enabled: true,
});
if (profileError) {
  await admin.auth.admin.deleteUser(data.user.id);
  throw new Error(
    "Developer profile creation failed; the newly created Auth user was removed. Retry after resolving the database error.",
  );
}
console.log(
  "Developer account created. Sign in at /developer/login. No password or service key has been printed.",
);
