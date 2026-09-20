"use client";
import { useRef, useState } from "react";
import { formFields } from "@/lib/validation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { post, RequestError } from "@/lib/client";
import { Modal, Notice, DynamicFields } from "./shared";
import {
  columnLabels,
  type DeveloperSnapshot,
  type Participant,
  type Chatbot,
  type FieldDefinition,
  type Fields,
} from "@/lib/types";
export interface AdminIntent {
  operation: string;
  title: string;
  record?: Participant | Chatbot | FieldDefinition;
  kind?: "leaderboard" | "progress";
  state?: string;
}
export function AdminDialog({
  intent,
  data,
  onClose,
  onSaved,
}: {
  intent: AdminIntent;
  data: DeveloperSnapshot;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [review, setReview] = useState(false),
    [reason, setReason] = useState(""),
    [phrase, setPhrase] = useState(""),
    [retry, setRetry] = useState(false);
  const [columns, setColumns] = useState(data.configs.leaderboard.columns),
    [extra, setExtra] = useState<Fields>(
      (intent.record as Participant | Chatbot)?.additional_data ?? {},
    );
  const [fieldType, setFieldType] = useState(
    (intent.record as FieldDefinition)?.type ?? "text",
  );
  const stable = useRef<{
    operation: string;
    request_id: string;
    payload: Record<string, unknown>;
  } | null>(null);
  const op = intent.operation,
    destructive = op === "prepare_clean_event" || op.startsWith("reset_");
  const requiredPhrase =
    op === "prepare_clean_event"
      ? "PREPARE CLEAN EVENT"
      : `RESET ${op.replace("reset_", "").toUpperCase()}`;
  const participant = intent.record as Participant,
    bot = intent.record as Chatbot,
    field = intent.record as FieldDefinition;
  async function submit(form: FormData) {
    if (destructive && !review) {
      setReview(true);
      return;
    }
    setPending(true);
    setError("");
    try {
      if (!stable.current) {
        const payload: Record<string, unknown> = {
          generation: data.event.generation,
          event_version: data.event.version,
          reason,
        };
        const text = (name: string) => String(form.get(name) ?? ""),
          checked = (name: string) => form.get(name) === "on";
        if (intent.record) {
          payload.id = intent.record.id;
          if ("version" in intent.record)
            payload.version = intent.record.version;
        }
        if (op === "event_state") payload.state = intent.state;
        if (op === "configure_event")
          Object.assign(payload, {
            name: text("name"),
            participant_limit: Number(text("participant_limit")),
            chatbot_limit: Number(text("chatbot_limit")),
            duration_minutes: Number(text("duration_minutes")),
            id_config: {
              prefix: text("prefix").toUpperCase(),
              separator: text("separator"),
              register_digits: Number(text("register_digits")),
              include_department: checked("include_department"),
              use_sequence: checked("use_sequence"),
            },
          });
        if (op === "participant_edit")
          Object.assign(payload, {
            name: text("name"),
            department: text("department"),
            register_number: text("register_number"),
            event_code: text("event_code"),
            enabled: checked("enabled"),
            additional_data: formFields(
              data.fields.filter((f) => f.scope === "registration"),
              extra,
            ),
          });
        if (op === "chatbot_correct")
          Object.assign(payload, {
            title: text("title"),
            deployment_url: text("deployment_url"),
            deployed_at: text("deployed_at") || null,
            verified_at: text("verified_at") || null,
            additional_data: formFields(
              data.fields.filter((f) => f.scope === "submission"),
              extra,
            ),
          });
        if (op === "dashboard_save")
          Object.assign(payload, {
            kind: intent.kind,
            config:
              intent.kind === "leaderboard"
                ? {
                    title: text("title"),
                    subtitle: text("subtitle"),
                    columns,
                    sort: text("sort"),
                    direction: text("direction"),
                    row_limit: Number(text("row_limit")),
                  }
                : {
                    title: text("title"),
                    subtitle: text("subtitle"),
                    branding: text("branding"),
                    show_timer: checked("show_timer"),
                    show_percentage: checked("show_percentage"),
                    show_participants: checked("show_participants"),
                    show_target: checked("show_target"),
                    show_progress: checked("show_progress"),
                  },
          });
        if (op === "field_save")
          Object.assign(payload, {
            scope: text("scope"),
            key: text("key"),
            label: text("label"),
            type: fieldType,
            required: checked("required"),
            enabled: checked("enabled"),
            show_participant: checked("show_participant"),
            show_public: checked("show_public"),
            options: text("options")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
            position: Number(text("position")),
          });
        if (destructive) payload.confirmation = phrase;
        stable.current = {
          operation: op,
          request_id: crypto.randomUUID(),
          payload,
        };
      }
      await post("/api/command", { type: "admin", ...stable.current });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to apply changes.");
      if (
        e instanceof RequestError &&
        e.code !== "NETWORK" &&
        e.code !== "UNAVAILABLE"
      )
        stable.current = null;
      setRetry(stable.current !== null);
      setPending(false);
    }
  }
  return (
    <Modal
      title={intent.title}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <form action={submit} className="stack">
        {error && <Notice>{error}</Notice>}
        {op === "configure_event" && (
          <>
            <Text name="name" label="Event name" value={data.event.name} />
            <div className="form-grid">
              <Text
                name="participant_limit"
                label="Maximum participants"
                type="number"
                value={data.event.participant_limit}
                min={1}
                max={10000}
              />
              <Text
                name="chatbot_limit"
                label="Chatbots per participant"
                type="number"
                value={data.event.chatbot_limit}
                min={1}
                max={100}
              />
            </div>
            <Text
              name="duration_minutes"
              label="Duration in minutes"
              type="number"
              value={data.event.duration_minutes}
              min={1}
              max={1440}
            />
            <h3>Event ID rule</h3>
            <div className="form-grid">
              <Text
                name="prefix"
                label="Prefix"
                value={data.event.id_config.prefix}
                required={false}
              />
              <label className="field">
                <span>Separator</span>
                <select
                  name="separator"
                  defaultValue={data.event.id_config.separator}
                >
                  <option value="">None</option>
                  <option value="-">Hyphen (-)</option>
                  <option value="_">Underscore (_)</option>
                </select>
              </label>
              <Text
                name="register_digits"
                label="Last register digits / sequence width"
                type="number"
                value={data.event.id_config.register_digits}
                min={1}
                max={12}
              />
            </div>
            <Check
              name="include_department"
              label="Include department code"
              value={data.event.id_config.include_department}
            />
            <Check
              name="use_sequence"
              label="Use generated sequence instead of register suffix"
              value={data.event.id_config.use_sequence}
            />
            <p className="muted">
              New rules apply to future registrations. Existing Event IDs remain
              unchanged.
            </p>
          </>
        )}
        {op === "event_state" && (
          <Notice tone="info">
            Change the event from {data.event.state.replaceAll("_", " ")} to{" "}
            {intent.state?.replaceAll("_", " ")}. This affects participant
            access immediately.
          </Notice>
        )}
        {op === "participant_edit" && (
          <>
            <Text
              name="name"
              label="Participant name"
              value={participant.name}
            />
            <div className="form-grid">
              <Text
                name="department"
                label="Department"
                value={participant.department}
              />
              <Text
                name="register_number"
                label="Register number"
                value={participant.register_number}
              />
            </div>
            <Text
              name="event_code"
              label="Event ID"
              value={participant.event_code}
            />
            <Check
              name="enabled"
              label="Participant enabled"
              value={participant.enabled}
            />
            <DynamicFields
              definitions={data.fields.filter(
                (f) => f.scope === "registration",
              )}
              values={extra}
              onChange={setExtra}
            />
          </>
        )}
        {op === "chatbot_correct" && (
          <>
            <Text name="title" label="Chatbot title" value={bot.title} />
            <Text
              name="deployment_url"
              label="Deployment URL"
              type="url"
              value={bot.deployment_url}
            />
            <Notice tone="info">
              Use full ISO 8601 timestamps with a timezone, for example
              2026-09-19T10:13:21Z. Clearing verification removes this chatbot
              from the official count.
            </Notice>
            <Text
              name="deployed_at"
              label="Official deployment timestamp (UTC)"
              value={bot.deployed_at ?? ""}
              required={false}
            />
            <Text
              name="verified_at"
              label="Official verification timestamp (UTC)"
              value={bot.verified_at ?? ""}
              required={false}
            />
            <DynamicFields
              definitions={data.fields.filter((f) => f.scope === "submission")}
              values={extra}
              onChange={setExtra}
            />
          </>
        )}
        {[
          "participant_remove",
          "participant_restore",
          "participant_reset",
          "chatbot_reset",
          "chatbot_remove",
          "chatbot_restore",
          "field_delete",
        ].includes(op) && (
          <Notice tone="info">
            {op === "participant_reset"
              ? `Archive all active chatbot records for ${participant.name}. Their existing completion total will be cleared.`
              : op === "chatbot_reset"
                ? `Clear deployment and verification for ${bot.title}. The record remains editable.`
                : op.endsWith("_remove")
                  ? "Remove this record from active competition views and totals. The audit history is preserved and the record can be restored."
                  : op.endsWith("_restore")
                    ? "Restore this record after checking event limits and slot availability. Preserved valid milestones will count again."
                    : "Remove this custom field definition. Existing historical audit data is preserved."}
          </Notice>
        )}
        {op === "dashboard_save" && (
          <>
            <Text
              name="title"
              label="Dashboard title"
              value={data.configs[intent.kind!].title}
            />
            <Text
              name="subtitle"
              label="Subtitle"
              value={data.configs[intent.kind!].subtitle}
              required={false}
            />
            {intent.kind === "leaderboard" ? (
              <>
                <h3>Visible columns and order</h3>
                <div className="column-picker">
                  {Object.entries(columnLabels).map(([key, label]) => (
                    <label className="check-field" key={key}>
                      <input
                        type="checkbox"
                        checked={columns.includes(key)}
                        onChange={(e) =>
                          setColumns(
                            e.target.checked
                              ? [...columns, key]
                              : columns.filter((k) => k !== key),
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                  {columns.map((c, i) => (
                    <div className="column-order" key={c}>
                      <span>
                        {i + 1}. {columnLabels[c]}
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={i === 0}
                        aria-label={`Move ${columnLabels[c]} up`}
                        onClick={() => {
                          const copy = [...columns];
                          [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
                          setColumns(copy);
                        }}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={i === columns.length - 1}
                        aria-label={`Move ${columnLabels[c]} down`}
                        onClick={() => {
                          const copy = [...columns];
                          [copy[i + 1], copy[i]] = [copy[i], copy[i + 1]];
                          setColumns(copy);
                        }}
                      >
                        <ArrowDown size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>Sort by</span>
                    <select
                      name="sort"
                      defaultValue={data.configs.leaderboard.sort}
                    >
                      {Object.entries(columnLabels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Sort direction</span>
                    <select
                      name="direction"
                      defaultValue={data.configs.leaderboard.direction}
                    >
                      <option value="desc">Descending</option>
                      <option value="asc">Ascending</option>
                    </select>
                  </label>
                </div>
                <Text
                  name="row_limit"
                  label="Maximum rows displayed"
                  type="number"
                  min={1}
                  max={1000}
                  value={data.configs.leaderboard.row_limit}
                />
              </>
            ) : (
              <>
                <Text
                  name="branding"
                  label="Branding text"
                  value={data.configs.progress.branding}
                  required={false}
                />
                {(
                  [
                    "show_timer",
                    "show_percentage",
                    "show_participants",
                    "show_target",
                    "show_progress",
                  ] as const
                ).map((k) => (
                  <Check
                    key={k}
                    name={k}
                    label={k.replaceAll("_", " ")}
                    value={data.configs.progress[k]}
                  />
                ))}
              </>
            )}
          </>
        )}
        {op === "field_save" && (
          <>
            <div className="form-grid">
              <label className="field">
                <span>Form</span>
                <select
                  name="scope"
                  defaultValue={field?.scope ?? "registration"}
                >
                  <option value="registration">Registration</option>
                  <option value="submission">Chatbot submission</option>
                </select>
              </label>
              <Text name="key" label="Field key" value={field?.key ?? ""} />
            </div>
            <Text
              name="label"
              label="Display label"
              value={field?.label ?? ""}
            />
            <label className="field">
              <span>Type</span>
              <select
                value={fieldType}
                onChange={(e) =>
                  setFieldType(e.target.value as FieldDefinition["type"])
                }
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="select">Dropdown</option>
                <option value="boolean">Checkbox</option>
              </select>
            </label>
            <label className="field">
              <span>Dropdown choices (one per line)</span>
              <textarea
                name="options"
                defaultValue={field?.options?.join("\n") ?? ""}
              />
            </label>
            <Text
              name="position"
              label="Display order"
              type="number"
              value={field?.position ?? 0}
            />
            <Check
              name="required"
              label="Required"
              value={field?.required ?? false}
            />
            <Check
              name="enabled"
              label="Enabled"
              value={field?.enabled ?? true}
            />
            <Check
              name="show_participant"
              label="Show on participant dashboard"
              value={field?.show_participant ?? true}
            />
            <Check
              name="show_public"
              label="Publish this registration field on the public leaderboard"
              value={field?.show_public ?? false}
            />
            <p className="muted">
              Enable public display only for information intended for everyone.
              Identity, role and milestone fields are protected.
            </p>
          </>
        )}
        {destructive && (
          <>
            <Notice tone="info">
              {op === "prepare_clean_event" || op === "reset_registrations"
                ? `This will archive ${data.metrics.participants} participants and ${data.metrics.submitted} active chatbot records, retire participant access, and reset the timer. Developer accounts, event limits, forms, ID settings, dashboard configuration and audit history are preserved. Auth identities remain retained for controlled recovery.`
                : op === "reset_submissions"
                  ? `Archive ${data.metrics.submitted} chatbot records. Participant accounts, settings and audit history remain.`
                  : op === "reset_runtime"
                    ? "Reset event status and timer. Active submissions must be cleared first."
                    : "Restore both public dashboards to their default presentation settings."}
            </Notice>
            {review && (
              <Notice>
                Final confirmation: this changes the authoritative event data.
                Export evidence before continuing.
              </Notice>
            )}
            <label className="field">
              <span>
                Type <strong>{requiredPhrase}</strong>
              </span>
              <input
                value={phrase}
                onChange={(e) => {
                  setPhrase(e.target.value);
                  setReview(false);
                }}
                autoComplete="off"
                required
              />
            </label>
          </>
        )}
        <label className="field">
          <span>Reason for this action</span>
          <textarea
            required
            minLength={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain the operational reason for the audit trail."
          />
        </label>
        <div className="dialog-actions">
          <button
            type="button"
            className="button ghost"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            className={`button ${destructive || op.endsWith("_remove") ? "danger" : "primary"}`}
            disabled={
              pending ||
              reason.trim().length < 3 ||
              (destructive && phrase !== requiredPhrase) ||
              (op === "dashboard_save" &&
                intent.kind === "leaderboard" &&
                !columns.length)
            }
          >
            {pending
              ? "Applying…"
              : retry
                ? "Retry same request"
                : destructive
                  ? review
                    ? "Confirm reset"
                    : "Review reset"
                  : "Confirm changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Text({
  name,
  label,
  value,
  type = "text",
  required = true,
  min,
  max,
}: {
  name: string;
  label: string;
  value: string | number;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={min}
        max={max}
      />
    </label>
  );
}
function Check({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: boolean;
}) {
  return (
    <label className="check-field">
      <input name={name} type="checkbox" defaultChecked={value} />
      <span>{label}</span>
    </label>
  );
}
