import { authenticated } from "@/lib/supabase/server";
import { failure } from "@/lib/http";
import { toCsv } from "@/lib/validation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { client } = await authenticated(true),
      kind = new URL(request.url).searchParams.get("kind") || "completions";
    const { data, error } = await client.rpc("evidence_export", {
      p_kind: kind,
    });
    if (error) throw error;
    const rows = data.rows.map((row: Record<string, unknown>) => ({
      export_event: data.event,
      export_generation: data.generation,
      exported_at: data.exported_at,
      ...row,
    }));
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="recordforge-${kind}-generation-${data.generation}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
