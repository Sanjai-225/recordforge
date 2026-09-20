import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AppError } from "@/lib/errors";
export function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export async function serverClient() {
  if (!configured()) throw new AppError("SETUP_REQUIRED", 503);
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return jar.getAll();
        },
        setAll(items) {
          try {
            items.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Server components cannot write cookies; proxy performs refresh. */
          }
        },
      },
    },
  );
}
export async function authenticated(developer = false) {
  const client = await serverClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new AppError("NOT_AUTHORIZED", 401);
  const { data: profile } = await client
    .from("profiles")
    .select("user_id,username,role,enabled,retired_at")
    .eq("user_id", user.id)
    .single();
  if (
    !profile ||
    !profile.enabled ||
    profile.retired_at ||
    (developer && profile.role !== "developer")
  )
    throw new AppError("NOT_AUTHORIZED", 403);
  return { client, user, profile };
}
