"use client";
import { useState } from "react";
import Link from "next/link";
import { formFields } from "@/lib/validation";
import {
  Plus,
  ExternalLink,
  Check,
  ArrowRight,
  Clock3,
  Code2,
  CheckCheck,
  Pencil,
} from "lucide-react";
import { useSnapshot, post, dateTime } from "@/lib/client";
import {
  Brand,
  Logout,
  Notice,
  Loading,
  StateBadge,
  SyncStatus,
  Timer,
  Progress,
  Modal,
  DynamicFields,
  Badge,
} from "./shared";
import type { Chatbot, Fields, ParticipantSnapshot } from "@/lib/types";
export function ParticipantDashboard() {
  const sync = useSnapshot<ParticipantSnapshot>(
    "/api/snapshot?scope=participant",
  );
  const [editor, setEditor] = useState<Chatbot | "new" | null>(null),
    [confirmation, setConfirmation] = useState<{
      bot: Chatbot;
      step: "deploy" | "verify";
    } | null>(null),
    [notice, setNotice] = useState("");
  const data = sync.data;
  return (
    <>
      <header className="topbar">
        <Brand />
        <nav>
          <Link href="/display/leaderboard">Leaderboard</Link>
          <Logout />
        </nav>
      </header>
      <main id="main-content" className="participant-main">
        <div className="page-top">
          <span className="eyebrow">YOUR BUILDER WORKSPACE</span>
          <SyncStatus
            status={sync.realtime}
            lastSync={sync.lastSync}
            loading={sync.loading}
            onRefresh={sync.refresh}
          />
        </div>
        {sync.error && <Notice>{sync.error}</Notice>}
        {notice && <Notice tone="success">{notice}</Notice>}
        {!data ? (
          <Loading />
        ) : (
          <>
            <section className="participant-heading">
              <div>
                <h1>Let’s build, {data.participant.name.split(" ")[0]}.</h1>
                <div className="identity">
                  <Badge tone="blue">{data.participant.event_code}</Badge>
                  <span>{data.participant.department}</span>
                  <span className="secondary">
                    Reg. {data.participant.register_number}
                  </span>
                </div>
              </div>
              <div className="time-card">
                <StateBadge state={data.event.state} />
                <Timer event={data.event} serverTime={data.server_time} />
                <small>
                  {data.event.state === "PAUSED"
                    ? "Timer paused"
                    : "Time remaining"}
                </small>
              </div>
            </section>
            <section className="participant-progress">
              <div className="progress-summary">
                <span className="metric-icon">
                  <CheckCheck size={28} />
                </span>
                <div>
                  <span className="eyebrow">VERIFIED CHATBOTS</span>
                  <div className="completion-number">
                    {data.metrics.completed}
                    <span> / {data.event.chatbot_limit}</span>
                  </div>
                </div>
                <p>
                  Deployment confirmed.
                  <br />
                  Participant verified.
                  <br />
                  <strong>Officially counted.</strong>
                </p>
              </div>
              <Progress
                value={data.metrics.completed}
                max={data.event.chatbot_limit}
              />
            </section>
            {data.event.state !== "LIVE" && (
              <Notice tone="info">
                {data.event.state === "PAUSED"
                  ? "The event is paused. Your saved work is safe."
                  : data.event.state === "ENDED"
                    ? "The event has ended. Your records remain available below."
                    : "Your workspace is ready. Chatbot submissions open when the event goes live."}
              </Notice>
            )}
            <div className="section-heading">
              <div>
                <h2>
                  Your chatbots{" "}
                  <span className="count-pill">{data.chatbots.length}</span>
                </h2>
                <p>Complete both confirmations for each chatbot.</p>
              </div>
              <button
                className="button primary"
                onClick={() => setEditor("new")}
                disabled={
                  data.event.state !== "LIVE" ||
                  data.chatbots.length >= data.event.chatbot_limit
                }
              >
                <Plus size={18} />
                Add chatbot
              </button>
            </div>
            <div className="chatbot-grid">
              {data.chatbots.map((bot) => (
                <article
                  className={`chatbot-card ${bot.verified_at ? "verified" : ""}`}
                  key={bot.id}
                >
                  <div className="card-top">
                    <span className="bot-number">
                      {String(bot.sequence).padStart(2, "0")}
                    </span>
                    <Badge
                      tone={
                        bot.verified_at
                          ? "success"
                          : bot.deployed_at
                            ? "blue"
                            : "neutral"
                      }
                    >
                      {bot.verified_at
                        ? "Completed"
                        : bot.deployed_at
                          ? "Deployed"
                          : "Draft"}
                    </Badge>
                  </div>
                  <h3>{bot.title}</h3>
                  <a
                    className="deployment-link"
                    href={bot.deployment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open chatbot
                    <ExternalLink size={14} />
                  </a>
                  <div className="milestones">
                    <div className={bot.deployed_at ? "done" : ""}>
                      <span>{bot.deployed_at ? <Check size={14} /> : 1}</span>
                      <p>
                        Deployment
                        <small>
                          {bot.deployed_at
                            ? dateTime(bot.deployed_at)
                            : "Awaiting confirmation"}
                        </small>
                      </p>
                    </div>
                    <div className={bot.verified_at ? "done" : ""}>
                      <span>{bot.verified_at ? <Check size={14} /> : 2}</span>
                      <p>
                        Verification
                        <small>
                          {bot.verified_at
                            ? dateTime(bot.verified_at)
                            : "Not yet counted"}
                        </small>
                      </p>
                    </div>
                  </div>
                  <div className="card-actions">
                    {!bot.deployed_at && (
                      <button
                        className="button ghost"
                        disabled={data.event.state !== "LIVE"}
                        onClick={() => setEditor(bot)}
                      >
                        <Pencil size={15} />
                        Edit
                      </button>
                    )}
                    {!bot.verified_at ? (
                      <button
                        className="button secondary"
                        disabled={data.event.state !== "LIVE"}
                        onClick={() =>
                          setConfirmation({
                            bot,
                            step: bot.deployed_at ? "verify" : "deploy",
                          })
                        }
                      >
                        {bot.deployed_at
                          ? "Verify chatbot"
                          : "Confirm deployment"}
                        <ArrowRight size={16} />
                      </button>
                    ) : (
                      <span className="verified-note">
                        <CheckCheck size={17} />
                        Counted toward the event
                      </span>
                    )}
                  </div>
                </article>
              ))}
              {data.chatbots.length < data.event.chatbot_limit && (
                <button
                  className="chatbot-add"
                  disabled={data.event.state !== "LIVE"}
                  onClick={() => setEditor("new")}
                >
                  <span>
                    <Plus size={27} />
                  </span>
                  <h3>Your next idea belongs here</h3>
                  <p>
                    {data.event.chatbot_limit - data.chatbots.length} chatbot
                    slots available
                  </p>
                </button>
              )}
            </div>
            {data.fields.filter(
              (f) => f.scope === "registration" && f.show_participant,
            ).length > 0 && (
              <section className="panel">
                <h2>Participant information</h2>
                <dl className="details">
                  {data.fields
                    .filter(
                      (f) => f.scope === "registration" && f.show_participant,
                    )
                    .map((f) => (
                      <div key={f.key}>
                        <dt>{f.label}</dt>
                        <dd>
                          {String(
                            data.participant.additional_data[f.key] ?? "—",
                          )}
                        </dd>
                      </div>
                    ))}
                </dl>
              </section>
            )}
            <footer className="workspace-footer">
              <Clock3 size={15} />
              Official times are recorded by the event server.{" "}
              <Link href="/display/progress">View event progress</Link>
            </footer>
            {editor && (
              <ChatbotEditor
                key={editor === "new" ? "new" : editor.id}
                bot={editor}
                data={data}
                onClose={() => setEditor(null)}
                onSaved={async () => {
                  setEditor(null);
                  await sync.refresh();
                  setNotice(
                    "Chatbot saved. Confirm deployment when it is ready.",
                  );
                }}
              />
            )}
            {confirmation && (
              <MilestoneDialog
                {...confirmation}
                generation={data.event.generation}
                onClose={() => setConfirmation(null)}
                onSaved={async () => {
                  const step = confirmation.step;
                  setConfirmation(null);
                  await sync.refresh();
                  setNotice(
                    step === "verify"
                      ? "Chatbot verified successfully. Your official timestamp is shown on the record."
                      : "Deployment confirmed. You can now verify this chatbot.",
                  );
                }}
                onReconcile={sync.refresh}
              />
            )}
          </>
        )}
      </main>
    </>
  );
}
function ChatbotEditor({
  bot,
  data,
  onClose,
  onSaved,
}: {
  bot: Chatbot | "new";
  data: ParticipantSnapshot;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<Fields>(
      bot === "new" ? {} : bot.additional_data,
    ),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function save(form: FormData) {
    setPending(true);
    setError("");
    try {
      const content = {
        title: form.get("title"),
        url: form.get("url"),
        additional_data: formFields(
          data.fields.filter((f) => f.scope === "submission"),
          values,
        ),
      };
      if (bot === "new") {
        const key = `new-chatbot:${data.participant.id}:${data.event.generation}`;
        let id = sessionStorage.getItem(key);
        if (!id || data.chatbots.some((b) => b.id === id)) {
          id = crypto.randomUUID();
          sessionStorage.setItem(key, id);
        }
        await post("/api/command", {
          type: "create",
          id,
          generation: data.event.generation,
          ...content,
        });
        sessionStorage.removeItem(key);
      } else
        await post("/api/command", {
          type: "edit",
          id: bot.id,
          version: bot.version,
          ...content,
        });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
      setPending(false);
    }
  }
  return (
    <Modal
      title={bot === "new" ? "Add your chatbot" : "Edit chatbot"}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <form action={save} className="stack">
        <p className="muted">
          Save the chatbot details, then confirm its milestones separately.
        </p>
        {error && <Notice>{error}</Notice>}
        <label className="field">
          <span>Chatbot title</span>
          <input
            name="title"
            defaultValue={bot === "new" ? "" : bot.title}
            required
            maxLength={160}
          />
        </label>
        <label className="field">
          <span>Deployment URL</span>
          <input
            name="url"
            type="url"
            placeholder="https://your-chatbot.example"
            defaultValue={bot === "new" ? "" : bot.deployment_url}
            required
            maxLength={2048}
          />
        </label>
        <DynamicFields
          definitions={data.fields.filter((f) => f.scope === "submission")}
          values={values}
          onChange={setValues}
        />
        <div className="dialog-actions">
          <button
            type="button"
            className="button ghost"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button className="button primary" disabled={pending}>
            <Code2 size={17} />
            {pending ? "Saving…" : "Save chatbot"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function MilestoneDialog({
  bot,
  step,
  generation,
  onClose,
  onSaved,
  onReconcile,
}: {
  bot: Chatbot;
  step: "deploy" | "verify";
  generation: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onReconcile: () => Promise<void>;
}) {
  const [checked, setChecked] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function confirm() {
    setPending(true);
    setError("");
    try {
      await post("/api/command", {
        type: "confirm",
        id: bot.id,
        step,
        generation,
        version: bot.version,
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to confirm.");
      setPending(false);
      await onReconcile();
    }
  }
  return (
    <Modal
      title={step === "deploy" ? "Confirm deployment" : "Confirm verification"}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <div className="stack">
        <div className="milestone-bot">
          <Code2 size={22} />
          <strong>{bot.title}</strong>
        </div>
        <p>
          {step === "deploy"
            ? "You are confirming that this chatbot has been deployed. The official deployment time will be recorded now."
            : "You are confirming that this chatbot is deployed and verified. After confirmation, it will count toward your completion total and the event total."}
        </p>
        {error && <Notice>{error}</Notice>}
        <label className="check-field">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={pending}
          />
          <span>
            {step === "deploy"
              ? "Chatbot Deployed"
              : "Verified — I have checked my deployed chatbot"}
          </span>
        </label>
        <div className="dialog-actions">
          <button className="button ghost" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={!checked || pending}
            onClick={confirm}
          >
            {pending
              ? "Confirming…"
              : step === "deploy"
                ? "Confirm deployment"
                : "Confirm verification"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
