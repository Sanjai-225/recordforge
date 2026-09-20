import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "./supabase/admin";
import { AppError, publicError } from "./errors";
export async function body(request: Request) {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new AppError("SETUP_REQUIRED", 503);
  if (
    request.headers.get("origin") !== new URL(origin).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AppError("INVALID_ORIGIN", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("INVALID_INPUT", 415);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 32768) throw new AppError("INVALID_INPUT", 413);
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("INVALID_INPUT");
  }
}
export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
export function failure(error: unknown) {
  const requestId = randomUUID();
  if (error instanceof z.ZodError)
    return ok(
      {
        error: error.issues[0]?.message ?? "Check the form values.",
        code: "INVALID_INPUT",
        request_id: requestId,
      },
      400,
    );
  const e = publicError(error);
  // Never log request bodies, passwords, Supabase errors, cookies or auth tokens.
  console.error(
    JSON.stringify({
      request_id: requestId,
      code: e.code,
      status: e.status,
      at: new Date().toISOString(),
    }),
  );
  return ok(
    { error: e.message, code: e.code, request_id: requestId },
    e.status,
  );
}
export async function rateLimit(
  request: Request,
  action: string,
  identity: string,
  limit: number,
  window = 60,
) {
  const salt = process.env.RATE_LIMIT_SALT;
  if (!salt) throw new AppError("SETUP_REQUIRED", 503);
  const admin = adminClient();
  // Vercel owns x-vercel-forwarded-for. Other hosts must enforce edge IP limits themselves.
  const ip = process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for") || "unknown"
    : "local";
  for (const [label, value, maximum] of [
    ["identity", identity, limit],
    ["edge", ip, Math.max(600, limit)],
  ] as const) {
    const key = createHmac("sha256", salt)
      .update(`${action}:${label}:${value}`)
      .digest("hex");
    const { data, error } = await admin.rpc("take_rate_limit", {
      p_key: key,
      p_limit: maximum,
      p_window: window,
    });
    if (error) throw new AppError("UNAVAILABLE", 503);
    if (!data) throw new AppError("RATE_LIMITED", 429);
  }
}
