import { createClient } from "@supabase/supabase-js";
import { authenticated, configured } from "@/lib/supabase/server";
import { ok, failure } from "@/lib/http";
import { AppError } from "@/lib/errors";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!configured()) throw new AppError("SETUP_REQUIRED", 503);
    const q = new URL(request.url).searchParams,
      scope = q.get("scope");
    let result;
    if (
      scope === "registration" ||
      scope === "leaderboard" ||
      scope === "progress"
    ) {
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      result =
        scope === "registration"
          ? await client.rpc("registration_config")
          : await client.rpc("public_snapshot", { p_kind: scope });
    } else {
      const { client } = await authenticated(scope === "developer");
      if (scope === "participant")
        result = await client.rpc("participant_snapshot");
      else if (scope === "developer")
        result = await client.rpc("developer_snapshot", {
          p_section: q.get("section") || "overview",
          p_query: (q.get("q") || "").slice(0, 120),
          p_department: q.get("department") || "",
          p_offset: Math.max(0, Number(q.get("offset")) || 0),
          p_limit: 100,
          p_sort: q.get("sort") || "verified_at",
          p_direction: q.get("direction") || "desc",
          p_include_deleted: q.get("deleted") === "true",
          p_action: q.get("action") || "",
          p_generation: q.get("generation")
            ? Number(q.get("generation"))
            : null,
        });
      else throw new AppError("NOT_FOUND", 404);
    }
    if (result.error) throw result.error;
    return ok(result.data);
  } catch (error) {
    return failure(error);
  }
}
