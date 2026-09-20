"use client";
import { useState } from "react";
import Link from "next/link";
import { formFields } from "@/lib/validation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { post, useSnapshot, RequestError } from "@/lib/client";
import { Brand, DynamicFields, Notice } from "./shared";
import type {
  EventClock,
  FieldDefinition,
  Fields,
  SnapshotBase,
} from "@/lib/types";
export function AuthForm({
  register = false,
  developer = false,
}: {
  register?: boolean;
  developer?: boolean;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [additional, setAdditional] = useState<Fields>({});
  const config = useSnapshot<
    SnapshotBase & { event: EventClock; fields: FieldDefinition[] }
  >("/api/snapshot?scope=registration");
  async function submit(form: FormData) {
    setPending(true);
    setError("");
    try {
      const username = String(form.get("username")),
        password = String(form.get("password"));
      let result;
      if (register) {
        let id = sessionStorage.getItem("registration-request");
        if (!id) {
          id = crypto.randomUUID();
          sessionStorage.setItem("registration-request", id);
        }
        result = await post("/api/auth/register", {
          request_id: id,
          name: form.get("name"),
          department: form.get("department"),
          register_number: form.get("register_number"),
          username,
          password,
          additional_data: formFields(config.data?.fields ?? [], additional),
        });
        sessionStorage.removeItem("registration-request");
      } else
        result = await post("/api/auth/login", {
          username,
          password,
          developer,
        });
      window.location.assign(result.redirect);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      if (
        e instanceof RequestError &&
        [
          "RESERVATION_EXPIRED",
          "STALE_GENERATION",
          "REQUEST_CONFLICT",
        ].includes(e.code)
      )
        sessionStorage.removeItem("registration-request");
      setPending(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">THE LLM CHATBOT CHALLENGE</span>
          <h1>
            One event.
            <br />
            Every creation
            <br />
            <em>counts.</em>
          </h1>
          <p>
            A shared stage for builders. A clear record of every deployed and
            verified chatbot.
          </p>
        </div>
        <div className="auth-proof">
          <ShieldCheck size={20} />
          <span>Official milestones. Server-recorded time.</span>
        </div>
      </section>
      <section className="auth-main">
        <div className="auth-card">
          <span className="eyebrow">
            {developer
              ? "EVENT OPERATIONS"
              : register
                ? "JOIN THE CHALLENGE"
                : "PARTICIPANT ACCESS"}
          </span>
          <h2>
            {register
              ? "Make your mark."
              : developer
                ? "Developer sign in"
                : "Welcome back."}
          </h2>
          <p className="muted">
            {register
              ? "Register once, then build your way to the finish."
              : "Sign in with your event username and password."}
          </p>
          {error && <Notice>{error}</Notice>}
          {config.error && <Notice>{config.error}</Notice>}
          {register &&
            config.data &&
            config.data.event.state !== "REGISTRATION_OPEN" && (
              <Notice tone="info">Registration is currently closed.</Notice>
            )}
          <form action={submit} className="stack">
            {register && (
              <>
                <label className="field">
                  <span>Full name</span>
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={120}
                  />
                </label>
                <div className="form-grid">
                  <label className="field">
                    <span>Department code</span>
                    <input
                      name="department"
                      placeholder="IT"
                      required
                      maxLength={16}
                      pattern="[A-Za-z0-9&-]+"
                    />
                  </label>
                  <label className="field">
                    <span>Register number</span>
                    <input
                      name="register_number"
                      required
                      minLength={4}
                      maxLength={40}
                    />
                  </label>
                </div>
              </>
            )}
            <label className="field">
              <span>Username</span>
              <input
                name="username"
                autoComplete="username"
                required
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_]+"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={register ? 12 : 1}
                maxLength={128}
              />
              {register && (
                <small>
                  At least 12 characters. Use a password unique to this event.
                </small>
              )}
            </label>
            {register && (
              <DynamicFields
                definitions={config.data?.fields ?? []}
                values={additional}
                onChange={setAdditional}
              />
            )}
            <button
              className="button primary full"
              disabled={
                pending ||
                !!config.error ||
                (register && config.data?.event.state !== "REGISTRATION_OPEN")
              }
            >
              {pending
                ? "Please wait…"
                : register
                  ? "Create participant account"
                  : "Sign in"}
              {!pending && <ArrowRight size={18} />}
            </button>
          </form>
          <p className="auth-switch">
            {register ? (
              <>
                Already registered? <Link href="/login">Sign in</Link>
              </>
            ) : developer ? (
              <Link href="/login">Participant sign in</Link>
            ) : (
              <>
                New to the event? <Link href="/register">Register</Link>
              </>
            )}
          </p>
          <div className="auth-links">
            <Link href="/display/leaderboard">Leaderboard</Link>
            <Link href="/display/progress">Live progress</Link>
            {!developer && (
              <Link href="/developer/login">Developer access</Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
