import { z } from "zod";
import type { FieldDefinition, Fields } from "./types";
export function formFields(
  definitions: FieldDefinition[],
  values: Fields,
): Fields {
  return Object.fromEntries(
    definitions
      .filter((f) => f.enabled !== false)
      .map((f) => [
        f.key,
        values[f.key] ?? (f.type === "boolean" ? false : null),
      ]),
  );
}
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,32}$/, "Use 3–32 letters, numbers or underscores.");
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128);
export function safeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !/\s/.test(value)
    );
  } catch {
    return false;
  }
}
export const urlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(safeUrl, "Enter a complete http:// or https:// deployment URL.");
export const additionalSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]),
);
export const registrationSchema = z
  .object({
    request_id: z.uuid(),
    name: z.string().trim().min(1).max(120),
    department: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9&-]{1,16}$/),
    register_number: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{4,40}$/),
    username: usernameSchema,
    password: passwordSchema,
    additional_data: additionalSchema.default({}),
  })
  .strict();
export const loginSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(1).max(128),
    developer: z.boolean().default(false),
  })
  .strict();
export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("create"),
      id: z.uuid(),
      generation: z.number().int().positive(),
      title: z.string().trim().min(1).max(160),
      url: urlSchema,
      additional_data: additionalSchema.default({}),
    })
    .strict(),
  z
    .object({
      type: z.literal("edit"),
      id: z.uuid(),
      version: z.number().int().positive(),
      title: z.string().trim().min(1).max(160),
      url: urlSchema,
      additional_data: additionalSchema.default({}),
    })
    .strict(),
  z
    .object({
      type: z.literal("confirm"),
      id: z.uuid(),
      generation: z.number().int().positive(),
      version: z.number().int().positive(),
      step: z.enum(["deploy", "verify"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("admin"),
      operation: z.enum([
        "event_state",
        "configure_event",
        "participant_edit",
        "participant_remove",
        "participant_restore",
        "participant_reset",
        "chatbot_correct",
        "chatbot_reset",
        "chatbot_remove",
        "chatbot_restore",
        "dashboard_save",
        "field_save",
        "field_delete",
        "prepare_clean_event",
        "reset_submissions",
        "reset_registrations",
        "reset_runtime",
        "reset_dashboards",
      ]),
      request_id: z.uuid(),
      payload: z.record(z.string(), z.unknown()),
    })
    .strict(),
]);
export function csvCell(value: unknown): string {
  let text =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "\uFEFFNo records\r\n";
  const keys = [...new Set(rows.flatMap(Object.keys))];
  return (
    "\uFEFF" +
    [
      keys.map(csvCell).join(","),
      ...rows.map((r) => keys.map((k) => csvCell(r[k])).join(",")),
    ].join("\r\n")
  );
}
