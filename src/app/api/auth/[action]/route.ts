import { body, ok, failure, rateLimit } from "@/lib/http";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";
import { loginSchema, registrationSchema } from "@/lib/validation";
import { AppError } from "@/lib/errors";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params,
      raw = await body(request);
    if (action === "logout") {
      const client = await serverClient();
      await client.auth.signOut();
      return ok({ success: true });
    }
    if (action === "login") {
      const data = loginSchema.parse(raw);
      await rateLimit(request, "login", data.username, 8);
      const admin = adminClient();
      const { data: profile } = await admin
        .from("profiles")
        .select("user_id,role,enabled")
        .eq("username", data.username)
        .is("retired_at", null)
        .maybeSingle();
      // Even unknown users make a password request; never disclose whether the username exists.
      const user = profile
        ? await admin.auth.admin.getUserById(profile.user_id)
        : null;
      const email = user?.data.user?.email ?? "unknown@participants.invalid";
      const client = await serverClient();
      const { error } = await client.auth.signInWithPassword({
        email,
        password: data.password,
      });
      if (
        error ||
        !profile?.enabled ||
        (data.developer && profile.role !== "developer")
      ) {
        await client.auth.signOut();
        throw new AppError("INVALID_CREDENTIALS", 401);
      }
      return ok({
        redirect: profile.role === "developer" ? "/developer" : "/dashboard",
      });
    }
    if (action === "register") {
      const { request_id, password, ...payload } =
        registrationSchema.parse(raw);
      await rateLimit(request, "register", payload.username, 8, 300);
      const admin = adminClient();
      const { data: reservation, error: reserveError } = await admin.rpc(
        "reserve_registration",
        { p_request_id: request_id, p_payload: payload },
      );
      if (reserveError) throw reserveError;
      let authId: string | undefined = reservation.user_id;
      if (!authId) {
        const { data: existing, error: lookupError } = await admin.rpc(
          "registration_auth_user",
          { p_request_id: request_id },
        );
        if (lookupError) throw lookupError;
        authId = existing ?? undefined;
        if (!authId) {
          const { data, error } = await admin.auth.admin.createUser({
            email: `${request_id}@participants.invalid`,
            password,
            email_confirm: true,
            app_metadata: { registration_request: request_id },
          });
          if (error) {
            // The request may have succeeded even when the response was interrupted.
            const { data: recovered } = await admin.rpc(
              "registration_auth_user",
              { p_request_id: request_id },
            );
            if (!recovered) throw new AppError("UNAVAILABLE", 503);
            authId = recovered;
          } else authId = data.user.id;
        }
      }
      if (!authId) throw new AppError("UNAVAILABLE", 503);
      const { data: participant, error } = await admin.rpc(
        "finalize_registration",
        { p_request_id: request_id, p_user_id: authId },
      );
      if (error) throw error;
      const client = await serverClient();
      const { error: loginError } = await client.auth.signInWithPassword({
        email: `${request_id}@participants.invalid`,
        password,
      });
      if (loginError)
        return ok({
          redirect: "/login",
          message: "Registration saved. Log in using the original password.",
          event_code: participant.event_code,
        });
      return ok({ redirect: "/dashboard", event_code: participant.event_code });
    }
    throw new AppError("NOT_FOUND", 404);
  } catch (error) {
    return failure(error);
  }
}
