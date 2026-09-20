"use client";
import { useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Code2,
  Radio,
  SlidersHorizontal,
  Monitor,
  Settings2,
  RotateCcw,
  ScrollText,
  Activity,
  Download,
  Search,
  ArrowRight,
  ExternalLink,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useSnapshot, dateTime, time } from "@/lib/client";
import {
  Brand,
  Logout,
  Notice,
  Loading,
  StateBadge,
  SyncStatus,
  Timer,
  Metric,
  Progress,
  Empty,
  Badge,
  Modal,
} from "./shared";
import { AdminDialog, type AdminIntent } from "./admin-dialog";
import {
  transitions,
  type DeveloperSnapshot,
  type Participant,
  type Chatbot,
  type Audit,
} from "@/lib/types";
const sections = [
  ["overview", "Overview", LayoutDashboard],
  ["participants", "Participants", Users],
  ["chatbots", "Chatbot submissions", Code2],
  ["completions", "Live completions", Radio],
  ["control", "Event control", SlidersHorizontal],
  ["displays", "Master dashboards", Monitor],
  ["configuration", "Configuration", Settings2],
  ["fields", "Form fields", Plus],
  ["reset", "Reset / testing", RotateCcw],
  ["audit", "Audit trail", ScrollText],
  ["activity", "Developer activity", ShieldCheck],
  ["health", "System health", Activity],
] as const;
export function DeveloperDashboard({
  section,
  initialQuery = "",
}: {
  section: string;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery),
    [department, setDepartment] = useState(""),
    [deleted, setDeleted] = useState(false),
    [offset, setOffset] = useState(0),
    [sort, setSort] = useState("verified_at"),
    [direction, setDirection] = useState("desc"),
    [intent, setIntent] = useState<AdminIntent | null>(null),
    [inspect, setInspect] = useState<Audit | null>(null),
    [notice, setNotice] = useState("");
  const params = new URLSearchParams({
    scope: "developer",
    section,
    q: query,
    department,
    deleted: String(deleted),
    offset: String(offset),
    sort,
    direction,
  });
  const sync = useSnapshot<DeveloperSnapshot>(`/api/snapshot?${params}`),
    data = sync.data;
  const selected = sections.find((s) => s[0] === section) ?? sections[0];
  const tableSection = [
    "participants",
    "chatbots",
    "completions",
    "audit",
    "activity",
  ].includes(section);
  function action(
    operation: string,
    title: string,
    record?: Participant | Chatbot,
  ) {
    setIntent({ operation, title, record });
  }
  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-label">EVENT OPERATIONS</div>
        <nav aria-label="Developer sections">
          {sections.map(([key, label, Icon]) => (
            <Link
              key={key}
              href={`/developer?section=${key}`}
              className={section === key ? "active" : ""}
              aria-current={section === key ? "page" : undefined}
            >
              <Icon size={18} />
              {label}
              {key === "completions" && <span className="live-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Badge tone="blue">
            <ShieldCheck size={14} />
            Developer access
          </Badge>
          <Logout />
        </div>
      </aside>
      <div className="admin-content">
        <header className="admin-topbar">
          <span>
            Control center <span className="secondary">/ {selected[1]}</span>
          </span>
          <SyncStatus
            status={sync.realtime}
            lastSync={sync.lastSync}
            loading={sync.loading}
            onRefresh={sync.refresh}
          />
        </header>
        <main id="main-content" className="admin-main">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {data?.event.name ?? "LLM CHATBOT CHALLENGE"}
              </span>
              <h1>{selected[1]}</h1>
            </div>
            {data && (
              <div className="heading-status">
                <StateBadge state={data.event.clock.state} />
                <Timer event={data.event.clock} serverTime={data.server_time} />
              </div>
            )}
          </div>
          {sync.error && <Notice>{sync.error}</Notice>}
          {notice && <Notice tone="success">{notice}</Notice>}
          {!data ? (
            <Loading />
          ) : (
            <>
              {(section === "overview" || section === "health") && (
                <>
                  <div className="metrics-grid">
                    <Metric
                      label="Registered participants"
                      value={data.metrics.participants}
                      detail={`Capacity ${data.event.participant_limit}`}
                    />
                    <Metric
                      label="Deployed chatbots"
                      value={data.metrics.deployed}
                      detail={`${data.metrics.submitted} submissions saved`}
                    />
                    <Metric
                      label="Official completions"
                      value={data.metrics.completed}
                      detail="Deployed and participant verified"
                      accent
                    />
                    <Metric
                      label="Collective target"
                      value={data.metrics.target.toLocaleString()}
                      detail={`${data.event.participant_limit} builders × ${data.event.chatbot_limit} chatbots`}
                    />
                  </div>
                  {section === "overview" ? (
                    <>
                      <section className="panel event-progress-panel">
                        <div>
                          <span className="eyebrow">
                            EVERY COMPLETION, ONE SHARED GOAL
                          </span>
                          <h2>
                            {(
                              (100 * data.metrics.completed) /
                              data.metrics.target
                            ).toFixed(1)}
                            % of the event target
                          </h2>
                          <Progress
                            value={data.metrics.completed}
                            max={data.metrics.target}
                          />
                          <p>
                            {(
                              data.metrics.target - data.metrics.completed
                            ).toLocaleString()}{" "}
                            completions to go
                          </p>
                        </div>
                        <Link
                          className="button secondary"
                          href="/display/progress"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open live display
                          <ExternalLink size={16} />
                        </Link>
                      </section>
                      <div className="admin-two-col">
                        <section className="panel">
                          <div className="section-heading compact">
                            <h2>Latest completions</h2>
                            <Link href="/developer?section=completions">
                              View feed <ArrowRight size={15} />
                            </Link>
                          </div>
                          <CompletionList rows={data.recent_completions} />
                        </section>
                        <section className="panel">
                          <h2>Event readiness</h2>
                          <dl className="readiness">
                            <div>
                              <dt>Database</dt>
                              <dd>
                                <Badge tone="success">Reachable</Badge>
                              </dd>
                            </div>
                            <div>
                              <dt>Count consistency</dt>
                              <dd>
                                <Badge
                                  tone={
                                    data.consistency?.consistent
                                      ? "success"
                                      : "warning"
                                  }
                                >
                                  {data.consistency?.consistent
                                    ? "Consistent"
                                    : "Check required"}
                                </Badge>
                              </dd>
                            </div>
                            <div>
                              <dt>Live synchronization</dt>
                              <dd>{sync.realtime}</dd>
                            </div>
                            <div>
                              <dt>Participant actions</dt>
                              <dd>
                                {data.event.clock.state === "LIVE"
                                  ? "Open"
                                  : "Closed"}
                              </dd>
                            </div>
                          </dl>
                          <Link
                            className="button ghost"
                            href="/developer?section=health"
                          >
                            View system health <ArrowRight size={16} />
                          </Link>
                        </section>
                      </div>
                    </>
                  ) : (
                    <section className="panel">
                      <h2>Database consistency</h2>
                      <p>
                        The checks read the authoritative chatbot records within
                        one database snapshot.
                      </p>
                      <dl className="details">
                        {data.consistency &&
                          Object.entries(data.consistency).map(([k, v]) => (
                            <div key={k}>
                              <dt>{k.replaceAll("_", " ")}</dt>
                              <dd>
                                {typeof v === "boolean"
                                  ? v
                                    ? "CONSISTENT"
                                    : "DISCREPANCY"
                                  : String(v)}
                              </dd>
                            </div>
                          ))}
                      </dl>
                      <button
                        className="button secondary"
                        onClick={sync.refresh}
                      >
                        Reconcile from database
                      </button>
                      <p className="muted">
                        Counts are derived queries. Reconciliation fetches
                        current records; it never rewrites history. Rejected API
                        requests are recorded with correlation IDs in the
                        deployment logs.
                      </p>
                      <dl className="details">
                        <div>
                          <dt>Realtime connection</dt>
                          <dd>{sync.realtime}</dd>
                        </div>
                        <div>
                          <dt>Last successful sync</dt>
                          <dd>{dateTime(sync.lastSync)}</dd>
                        </div>
                        <div>
                          <dt>Current data generation</dt>
                          <dd>{data.event.generation}</dd>
                        </div>
                      </dl>
                    </section>
                  )}
                </>
              )}
              {tableSection && (
                <>
                  <div className="toolbar">
                    <form
                      className="search-box"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = new FormData(e.currentTarget);
                        setQuery(String(form.get("q") || ""));
                        setOffset(0);
                      }}
                    >
                      <Search size={18} />
                      <input
                        name="q"
                        defaultValue={query}
                        placeholder={
                          section === "audit" || section === "activity"
                            ? "Search action or entity ID…"
                            : "Search name, Event ID or chatbot…"
                        }
                        aria-label="Search records"
                      />
                      <button className="button ghost">Search</button>
                    </form>
                    {["participants", "chatbots", "completions"].includes(
                      section,
                    ) && (
                      <select
                        aria-label="Filter department"
                        value={department}
                        onChange={(e) => {
                          setDepartment(e.target.value);
                          setOffset(0);
                        }}
                      >
                        <option value="">All departments</option>
                        {data.departments.map((d) => (
                          <option key={d}>{d}</option>
                        ))}
                      </select>
                    )}
                    {["chatbots", "completions"].includes(section) && (
                      <>
                        <select
                          aria-label="Sort submissions"
                          value={sort}
                          onChange={(e) => {
                            setSort(e.target.value);
                            setOffset(0);
                          }}
                        >
                          <option value="verified_at">Verification time</option>
                          <option value="deployed_at">Deployment time</option>
                          <option value="created_at">Creation time</option>
                          <option value="title">Title</option>
                        </select>
                        <select
                          aria-label="Sort direction"
                          value={direction}
                          onChange={(e) => {
                            setDirection(e.target.value);
                            setOffset(0);
                          }}
                        >
                          <option value="desc">Descending</option>
                          <option value="asc">Ascending</option>
                        </select>
                      </>
                    )}
                    {["participants", "chatbots"].includes(section) && (
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={deleted}
                          onChange={(e) => {
                            setDeleted(e.target.checked);
                            setOffset(0);
                          }}
                        />
                        Include removed
                      </label>
                    )}
                    <a
                      className="button secondary"
                      href={`/api/export?kind=${section === "activity" ? "audit" : section}`}
                    >
                      <Download size={16} />
                      Export CSV
                    </a>
                  </div>
                  <div className="panel table-panel">
                    <div className="table-wrap">
                      {section === "participants" ? (
                        <table>
                          <thead>
                            <tr>
                              <th>Event ID</th>
                              <th>Participant</th>
                              <th>Department</th>
                              <th>Completed</th>
                              <th>Access</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(data.rows as Participant[]).map((p) => (
                              <tr key={p.id}>
                                <td className="code-cell">{p.event_code}</td>
                                <td>
                                  <strong>{p.name}</strong>
                                  <small>
                                    {p.register_number} · {p.username}
                                  </small>
                                </td>
                                <td>{p.department}</td>
                                <td>
                                  {p.completed} / {data.event.chatbot_limit}
                                </td>
                                <td>
                                  <Badge
                                    tone={
                                      p.deleted_at
                                        ? "warning"
                                        : p.enabled
                                          ? "success"
                                          : "neutral"
                                    }
                                  >
                                    {p.deleted_at
                                      ? "Removed"
                                      : p.enabled
                                        ? "Enabled"
                                        : "Disabled"}
                                  </Badge>
                                </td>
                                <td>
                                  <div className="row-actions">
                                    <button
                                      onClick={() =>
                                        action(
                                          "participant_edit",
                                          "Edit participant",
                                          p,
                                        )
                                      }
                                    >
                                      Edit
                                    </button>
                                    <Link
                                      href={`/developer?section=chatbots&q=${encodeURIComponent(p.event_code)}`}
                                    >
                                      Chatbots
                                    </Link>
                                    <button
                                      onClick={() =>
                                        action(
                                          "participant_reset",
                                          "Reset participant chatbots",
                                          p,
                                        )
                                      }
                                    >
                                      Reset
                                    </button>
                                    <button
                                      onClick={() =>
                                        action(
                                          p.deleted_at
                                            ? "participant_restore"
                                            : "participant_remove",
                                          p.deleted_at
                                            ? "Restore participant"
                                            : "Remove participant",
                                          p,
                                        )
                                      }
                                    >
                                      {p.deleted_at ? "Restore" : "Remove"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : ["chatbots", "completions"].includes(section) ? (
                        <table>
                          <thead>
                            <tr>
                              <th>Chatbot</th>
                              <th>Participant</th>
                              <th>Deployment</th>
                              <th>Verification</th>
                              <th>State</th>
                              {section === "chatbots" && <th>Actions</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {(data.rows as Chatbot[]).map((c) => (
                              <tr key={c.id}>
                                <td>
                                  <strong>{c.title}</strong>
                                  <a
                                    href={c.deployment_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Open deployment <ExternalLink size={12} />
                                  </a>
                                </td>
                                <td>
                                  <strong className="code-cell">
                                    {c.event_code}
                                  </strong>
                                  <small>
                                    {c.participant_name} · {c.department}
                                  </small>
                                </td>
                                <td>{dateTime(c.deployed_at)}</td>
                                <td>{dateTime(c.verified_at)}</td>
                                <td>
                                  <Badge
                                    tone={
                                      c.deleted_at
                                        ? "warning"
                                        : c.verified_at
                                          ? "success"
                                          : "neutral"
                                    }
                                  >
                                    {c.deleted_at
                                      ? "Removed"
                                      : c.verified_at
                                        ? "Completed"
                                        : c.deployed_at
                                          ? "Deployed"
                                          : "Draft"}
                                  </Badge>
                                </td>
                                {section === "chatbots" && (
                                  <td>
                                    <div className="row-actions">
                                      <button
                                        onClick={() =>
                                          action(
                                            "chatbot_correct",
                                            "Correct chatbot",
                                            c,
                                          )
                                        }
                                      >
                                        Correct
                                      </button>
                                      <button
                                        onClick={() =>
                                          action(
                                            "chatbot_reset",
                                            "Reset chatbot milestones",
                                            c,
                                          )
                                        }
                                      >
                                        Reset
                                      </button>
                                      <button
                                        onClick={() =>
                                          action(
                                            c.deleted_at
                                              ? "chatbot_restore"
                                              : "chatbot_remove",
                                            c.deleted_at
                                              ? "Restore chatbot"
                                              : "Remove chatbot",
                                            c,
                                          )
                                        }
                                      >
                                        {c.deleted_at ? "Restore" : "Remove"}
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <table>
                          <thead>
                            <tr>
                              <th>Server time</th>
                              <th>Actor</th>
                              <th>Action</th>
                              <th>Reason</th>
                              <th>Generation</th>
                              <th>Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(data.rows as Audit[]).map((a) => (
                              <tr key={a.id}>
                                <td>{dateTime(a.server_timestamp)}</td>
                                <td>{a.actor_username ?? a.actor_role}</td>
                                <td>
                                  <Badge>{a.action.replaceAll("_", " ")}</Badge>
                                </td>
                                <td>{a.reason || "—"}</td>
                                <td>{a.generation}</td>
                                <td>
                                  <button
                                    className="button ghost"
                                    onClick={() => setInspect(a)}
                                  >
                                    Inspect
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    {!data.rows.length && (
                      <Empty
                        title={
                          section === "completions"
                            ? "Waiting for the next verified chatbot"
                            : "No matching records"
                        }
                      >
                        Try another filter or synchronize to load the latest
                        state.
                      </Empty>
                    )}
                    <div className="pagination">
                      <span>
                        {data.total} records · {data.total ? offset + 1 : 0}–
                        {Math.min(offset + 100, data.total)}
                      </span>
                      <div>
                        <button
                          className="button ghost"
                          disabled={!offset}
                          onClick={() => setOffset(Math.max(0, offset - 100))}
                        >
                          Previous
                        </button>
                        <button
                          className="button ghost"
                          disabled={offset + 100 >= data.total}
                          onClick={() => setOffset(offset + 100)}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {section === "control" && (
                <section className="panel">
                  <h2>Control the competition</h2>
                  <p>
                    Event controls are recorded in the audit trail. Pausing
                    freezes both the timer and participant changes.
                  </p>
                  <div className="event-control-state">
                    <StateBadge state={data.event.state} />
                    <Timer
                      event={data.event.clock}
                      serverTime={data.server_time}
                    />
                  </div>
                  <div className="control-actions">
                    {(data.event.clock.state === "ENDED" &&
                    data.event.state === "LIVE"
                      ? (["ENDED"] as const)
                      : transitions[data.event.state]
                    ).map((state) => (
                      <button
                        key={state}
                        className={`button ${state === "ENDED" ? "danger" : "primary"}`}
                        onClick={() =>
                          setIntent({
                            operation: "event_state",
                            title: `Change event to ${state.replaceAll("_", " ")}`,
                            state,
                          })
                        }
                      >
                        {state === "LIVE"
                          ? data.event.state === "PAUSED"
                            ? "Resume event"
                            : "Start event"
                          : state === "PAUSED"
                            ? "Pause event"
                            : state === "ENDED"
                              ? "End event"
                              : state.replaceAll("_", " ")}
                      </button>
                    ))}
                    {data.event.state === "ENDED" && (
                      <p>
                        Participant changes are frozen. Export evidence, then
                        prepare a clean event when ready.
                      </p>
                    )}
                  </div>
                  <dl className="details">
                    <div>
                      <dt>Started</dt>
                      <dd>{dateTime(data.event.started_at)}</dd>
                    </div>
                    <div>
                      <dt>Paused</dt>
                      <dd>{dateTime(data.event.paused_at)}</dd>
                    </div>
                    <div>
                      <dt>Ended</dt>
                      <dd>{dateTime(data.event.ended_at)}</dd>
                    </div>
                    <div>
                      <dt>Accumulated pause</dt>
                      <dd>{Math.round(data.event.pause_seconds)} seconds</dd>
                    </div>
                  </dl>
                </section>
              )}
              {section === "configuration" && (
                <section className="panel">
                  <div className="section-heading">
                    <h2>Event configuration</h2>
                    <button
                      className="button primary"
                      onClick={() =>
                        setIntent({
                          operation: "configure_event",
                          title: "Configure event",
                        })
                      }
                    >
                      Edit configuration
                    </button>
                  </div>
                  <dl className="details">
                    <div>
                      <dt>Event name</dt>
                      <dd>{data.event.name}</dd>
                    </div>
                    <div>
                      <dt>Maximum participants</dt>
                      <dd>{data.event.participant_limit}</dd>
                    </div>
                    <div>
                      <dt>Chatbots per participant</dt>
                      <dd>{data.event.chatbot_limit}</dd>
                    </div>
                    <div>
                      <dt>Calculated target</dt>
                      <dd>{data.metrics.target}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{data.event.duration_minutes} minutes</dd>
                    </div>
                    <div>
                      <dt>Event ID rule</dt>
                      <dd>
                        {data.event.id_config.prefix}
                        {data.event.id_config.include_department
                          ? "{DEPARTMENT}"
                          : ""}
                        {data.event.id_config.separator}
                        {data.event.id_config.use_sequence
                          ? "{SEQUENCE}"
                          : `{REGISTER_LAST_${data.event.id_config.register_digits}}`}
                      </dd>
                    </div>
                  </dl>
                  <p className="muted">
                    Conflicting limit reductions are rejected. Duration is
                    locked after start, and ID rules are locked while live,
                    paused or ended.
                  </p>
                </section>
              )}
              {section === "displays" && (
                <div className="display-config-grid">
                  {(["leaderboard", "progress"] as const).map((kind) => (
                    <section className="panel" key={kind}>
                      <Monitor size={28} />
                      <span className="eyebrow">
                        MASTER DISPLAY {kind === "leaderboard" ? "01" : "02"}
                      </span>
                      <h2>{data.configs[kind].title}</h2>
                      <p>{data.configs[kind].subtitle}</p>
                      <div className="control-actions">
                        <Link
                          className="button secondary"
                          target="_blank"
                          rel="noopener noreferrer"
                          href={`/display/${kind}`}
                        >
                          Open display
                          <ExternalLink size={16} />
                        </Link>
                        <button
                          className="button primary"
                          onClick={() =>
                            setIntent({
                              operation: "dashboard_save",
                              title: "Configure public display",
                              kind,
                            })
                          }
                        >
                          Configure
                        </button>
                      </div>
                    </section>
                  ))}
                </div>
              )}
              {section === "fields" && (
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Configurable forms</h2>
                      <p>
                        Core identity and authentication fields remain
                        protected.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() =>
                        setIntent({
                          operation: "field_save",
                          title: "Add custom field",
                        })
                      }
                    >
                      <Plus size={17} />
                      Add field
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Label / key</th>
                          <th>Form</th>
                          <th>Type</th>
                          <th>Required</th>
                          <th>Visibility</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.fields.map((f) => (
                          <tr key={f.id}>
                            <td>
                              <strong>{f.label}</strong>
                              <small>{f.key}</small>
                            </td>
                            <td>{f.scope}</td>
                            <td>{f.type}</td>
                            <td>{f.required ? "Yes" : "No"}</td>
                            <td>
                              {!f.enabled
                                ? "Disabled"
                                : f.show_public
                                  ? "Public display"
                                  : "Private"}
                            </td>
                            <td>
                              <div className="row-actions">
                                <button
                                  onClick={() =>
                                    setIntent({
                                      operation: "field_save",
                                      title: "Edit custom field",
                                      record: f,
                                    })
                                  }
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() =>
                                    setIntent({
                                      operation: "field_delete",
                                      title: "Remove field definition",
                                      record: f,
                                    })
                                  }
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!data.fields.length && (
                    <Empty title="Your core forms are ready">
                      Add college, year, team, or other event-specific fields
                      when needed.
                    </Empty>
                  )}
                </section>
              )}
              {section === "reset" && (
                <>
                  <section className="panel danger-panel">
                    <span className="eyebrow">CONTROLLED EVENT CLEANUP</span>
                    <h2>Prepare clean event</h2>
                    <p>
                      Use the same interface for testing and the final event.
                      When testing is complete, clear competition data and
                      revoke test participant access while retaining your entire
                      event configuration.
                    </p>
                    <div className="reset-impact">
                      <span>
                        <strong>{data.metrics.participants}</strong>{" "}
                        participants
                      </span>
                      <span>
                        <strong>{data.metrics.submitted}</strong> chatbot
                        records
                      </span>
                      <span>
                        <strong>{data.metrics.completed}</strong> completions
                      </span>
                    </div>
                    <p>
                      <strong>Preserved:</strong> developers, event limits, form
                      definitions, Event ID rules, dashboard settings and audit
                      history.
                    </p>
                    <div className="control-actions">
                      <a
                        className="button secondary"
                        href="/api/export?kind=audit"
                      >
                        <Download size={16} />
                        Export audit first
                      </a>
                      <button
                        className="button danger"
                        onClick={() =>
                          setIntent({
                            operation: "prepare_clean_event",
                            title: "Prepare clean event",
                          })
                        }
                      >
                        PREPARE CLEAN EVENT
                      </button>
                    </div>
                  </section>
                  <section className="panel">
                    <h2>Granular reset controls</h2>
                    <div className="reset-options">
                      {[
                        [
                          "reset_submissions",
                          "Chatbot submissions",
                          "Archive all chatbot records and progress.",
                        ],
                        [
                          "reset_registrations",
                          "Participant registrations",
                          "Retire participant access and start a clean generation.",
                        ],
                        [
                          "reset_runtime",
                          "Event timer and state",
                          "Requires no active chatbot submissions.",
                        ],
                        [
                          "reset_dashboards",
                          "Public dashboard settings",
                          "Restore display presentation defaults.",
                        ],
                      ].map(([operation, title, desc]) => (
                        <div key={operation}>
                          <div>
                            <h3>{title}</h3>
                            <p>{desc}</p>
                          </div>
                          <button
                            className="button secondary"
                            onClick={() =>
                              setIntent({
                                operation,
                                title: `Reset ${title.toLowerCase()}`,
                              })
                            }
                          >
                            Reset
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
              {intent && (
                <AdminDialog
                  intent={intent}
                  data={data}
                  onClose={() => setIntent(null)}
                  onSaved={async () => {
                    setIntent(null);
                    await sync.refresh();
                    setNotice(
                      "Change committed successfully. The audit trail has been updated.",
                    );
                  }}
                />
              )}
            </>
          )}
          {inspect && (
            <Modal title="Audit record" onClose={() => setInspect(null)}>
              <p>
                {inspect.action} · {dateTime(inspect.server_timestamp)}
              </p>
              <p>Reason: {inspect.reason || "—"}</p>
              <h3>Previous state</h3>
              <pre className="json-view">
                {JSON.stringify(inspect.old_data, null, 2)}
              </pre>
              <h3>New state</h3>
              <pre className="json-view">
                {JSON.stringify(inspect.new_data, null, 2)}
              </pre>
              <p className="muted">Request: {inspect.request_id}</p>
            </Modal>
          )}
        </main>
      </div>
    </div>
  );
}
function CompletionList({ rows }: { rows: Chatbot[] }) {
  return rows.length ? (
    <div className="completion-list">
      {rows.map((c) => (
        <div key={c.id}>
          <span className="completion-check">
            <ShieldCheck size={19} />
          </span>
          <div>
            <strong>{c.title}</strong>
            <p>
              {c.event_code} · {c.participant_name}
            </p>
          </div>
          <time>{time(c.verified_at)}</time>
        </div>
      ))}
    </div>
  ) : (
    <Empty title="Ready for the first completion">
      Confirmed verifications will appear here in real time.
    </Empty>
  );
}
