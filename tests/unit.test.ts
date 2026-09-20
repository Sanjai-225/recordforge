import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safeUrl,
  registrationSchema,
  commandSchema,
  csvCell,
  toCsv,
} from "../src/lib/validation";
import { publicError } from "../src/lib/errors";
import { remainingSeconds, formatTime } from "../src/lib/client";
import type { EventClock } from "../src/lib/types";
const event: EventClock = {
  name: "Test",
  generation: 1,
  state: "LIVE",
  participant_limit: 120,
  chatbot_limit: 10,
  duration_minutes: 60,
  started_at: "2026-09-19T10:00:00Z",
  deadline: "2026-09-19T11:00:00Z",
  paused_at: null,
  ended_at: null,
  pause_seconds: 0,
  version: 1,
};
test("deployment URLs reject executable schemes, credentials and malformed values", () => {
  for (const input of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "https://user:pass@example.com",
    "https://",
    "example.com",
    "https://a b.com",
  ])
    assert.equal(safeUrl(input), false, input);
  for (const input of [
    "https://example.com/app?q=hello#chat",
    "http://localhost:8000",
  ])
    assert.equal(safeUrl(input), true, input);
});
test("registration normalizes usernames and rejects privilege injection", () => {
  const payload = {
    request_id: crypto.randomUUID(),
    name: " Test ",
    department: "it",
    register_number: "20261234",
    username: " Builder_1 ",
    password: "long-test-password",
    additional_data: {},
  };
  const parsed = registrationSchema.parse(payload);
  assert.equal(parsed.username, "builder_1");
  assert.equal(parsed.department, "IT");
  assert.equal(
    registrationSchema.safeParse({ ...payload, role: "developer" }).success,
    false,
  );
  assert.equal(
    registrationSchema.safeParse({ ...payload, password: "short" }).success,
    false,
  );
});
test("confirmation input cannot supply official timestamps or counts", () => {
  const input = {
    type: "confirm",
    id: crypto.randomUUID(),
    generation: 1,
    version: 2,
    step: "verify",
  };
  assert.equal(commandSchema.safeParse(input).success, true);
  for (const key of ["completed", "verified_at", "participant_id", "role"])
    assert.equal(
      commandSchema.safeParse({ ...input, [key]: true }).success,
      false,
    );
});
test("CSV protects formula injection, delimiters and quotes", () => {
  assert.equal(csvCell("=SUM(A1:A2)"), `"'=SUM(A1:A2)"`);
  assert.equal(csvCell(" \t@x"), `"' \t@x"`);
  assert.equal(csvCell('a,"b"'), `"a,""b"""`);
  assert.ok(toCsv([{ a: 1, b: "x" }]).startsWith('\uFEFF"a","b"\r\n'));
});
test("timer derives from server time, honors pause and clamps at expiry", () => {
  assert.equal(
    remainingSeconds(event, Date.parse("2026-09-19T10:30:00Z")),
    1800,
  );
  assert.equal(
    remainingSeconds(
      { ...event, state: "PAUSED", paused_at: "2026-09-19T10:20:00Z" },
      Date.parse("2026-09-19T13:00:00Z"),
    ),
    2400,
  );
  assert.equal(remainingSeconds(event, Date.parse("2026-09-19T12:00:00Z")), 0);
  assert.equal(formatTime(61), "01:01");
});
test("database details and secrets cannot escape the public error mapper", () => {
  const e = publicError({
    message: "password=secret relation foo postgres",
    code: "XX001",
  });
  assert.equal(e.code, "UNAVAILABLE");
  assert.ok(!e.message.includes("secret"));
  assert.equal(
    publicError({ message: "REGISTER_EXISTS" }).code,
    "REGISTER_EXISTS",
  );
});
