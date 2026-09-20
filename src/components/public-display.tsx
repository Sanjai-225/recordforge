"use client";
import Link from "next/link";
import {
  Maximize2,
  Trophy,
  Users,
  CheckCheck,
  ArrowUpRight,
} from "lucide-react";
import { useSnapshot, time } from "@/lib/client";
import {
  Brand,
  StateBadge,
  SyncStatus,
  Notice,
  Loading,
  Timer,
  Progress,
  Empty,
} from "./shared";
import {
  columnLabels,
  type PublicSnapshot,
  type LeaderboardConfig,
  type ProgressConfig,
} from "@/lib/types";
export function PublicDisplay({ kind }: { kind: "leaderboard" | "progress" }) {
  const sync = useSnapshot<PublicSnapshot>(`/api/snapshot?scope=${kind}`),
    data = sync.data;
  return (
    <div className={`display-page ${kind}`}>
      <header className="display-header">
        <Brand />
        <nav>
          <Link
            href={
              kind === "progress" ? "/display/leaderboard" : "/display/progress"
            }
          >
            {kind === "progress" ? "Leaderboard" : "Global progress"}
            <ArrowUpRight size={15} />
          </Link>
          <button
            className="icon-button"
            title="Fullscreen display"
            aria-label="Toggle fullscreen"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void document.documentElement
                  .requestFullscreen()
                  .catch(() => {});
            }}
          >
            <Maximize2 size={19} />
          </button>
        </nav>
      </header>
      <main id="main-content" className="display-main">
        {sync.error && (
          <Notice>
            {sync.error} The last synchronized records remain displayed.
          </Notice>
        )}
        {!data ? (
          <Loading />
        ) : (
          <>
            <div className="display-title">
              <span className="eyebrow">
                {kind === "progress"
                  ? "THE COLLECTIVE ACHIEVEMENT"
                  : "THE BUILDERS BEHIND THE RECORD"}
              </span>
              <h1>{data.config.title}</h1>
              <p>{data.config.subtitle}</p>
              <StateBadge state={data.event.state} />
            </div>
            {kind === "progress" ? (
              <ProgressDisplay data={data} />
            ) : (
              <LeaderboardDisplay data={data} />
            )}
          </>
        )}
      </main>
      <footer className="display-footer">
        <span>
          {kind === "progress"
            ? (data?.config as ProgressConfig | undefined)?.branding
            : "RecordForge"}{" "}
          · Official competition records
        </span>
        <SyncStatus
          status={sync.realtime}
          lastSync={sync.lastSync}
          loading={sync.loading}
          onRefresh={sync.refresh}
        />
      </footer>
    </div>
  );
}
function ProgressDisplay({ data }: { data: PublicSnapshot }) {
  const cfg = data.config as ProgressConfig,
    pct = data.metrics.target
      ? (data.metrics.completed / data.metrics.target) * 100
      : 0;
  return (
    <>
      <div className="global-count">
        <span className="eyebrow">VERIFIED CHATBOT COMPLETIONS</span>
        <div className="big-number">
          {data.metrics.completed.toLocaleString()}
        </div>
        {cfg.show_target && (
          <div className="global-target">
            of {data.metrics.target.toLocaleString()} possible creations
          </div>
        )}
      </div>
      <div className="global-progress">
        {cfg.show_progress && (
          <Progress value={data.metrics.completed} max={data.metrics.target} />
        )}
        {cfg.show_percentage && (
          <p>
            <strong>{pct.toFixed(1)}%</strong> of the collective target
          </p>
        )}
      </div>
      <div className="display-stats">
        {cfg.show_participants && (
          <div>
            <Users />
            <strong>{data.metrics.participants}</strong>
            <span>Registered participants</span>
          </div>
        )}
        <div>
          <CheckCheck />
          <strong>{data.metrics.completed}</strong>
          <span>Deployed & verified</span>
        </div>
        {cfg.show_timer && (
          <div>
            <Trophy />
            <strong>
              <Timer event={data.event} serverTime={data.server_time} />
            </strong>
            <span>
              {data.event.state === "PAUSED"
                ? "Timer paused"
                : "Time remaining"}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
function LeaderboardDisplay({ data }: { data: PublicSnapshot }) {
  const cfg = data.config as LeaderboardConfig,
    extra = [
      ...new Set(
        data.rows.flatMap((r) =>
          Object.keys((r.additional_data as Record<string, unknown>) ?? {}),
        ),
      ),
    ];
  return (
    <>
      <div className="leaderboard-summary">
        <div>
          <CheckCheck size={20} />
          <strong>{data.metrics.completed.toLocaleString()}</strong> verified
          completions
        </div>
        <div>
          <Users size={20} />
          <strong>{data.metrics.participants}</strong> participants
        </div>
        <Timer event={data.event} serverTime={data.server_time} />
      </div>
      <div className="table-wrap leaderboard-table">
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              {cfg.columns.map((c) => (
                <th scope="col" key={c}>
                  {columnLabels[c]}
                </th>
              ))}
              {extra.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, index) => (
              <tr key={index}>
                <td>
                  <span className={index < 3 ? "rank podium" : "rank"}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </td>
                {cfg.columns.map((c) => (
                  <td
                    key={c}
                    className={
                      c === "completed"
                        ? "completed-cell"
                        : c === "event_code"
                          ? "code-cell"
                          : ""
                    }
                  >
                    {c === "latest_completion"
                      ? time(r[c] as string | null)
                      : String(r[c] ?? "—")}
                    {c === "completed" && (
                      <small> / {data.event.chatbot_limit}</small>
                    )}
                  </td>
                ))}
                {extra.map((c) => (
                  <td key={c}>
                    {String(
                      (r.additional_data as Record<string, unknown>)?.[c] ??
                        "—",
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!data.rows.length && (
          <Empty title="The stage is ready">
            Participant progress will appear here once registration begins.
          </Empty>
        )}
      </div>
      <p className="table-footnote">
        Showing {data.rows.length} of {data.metrics.participants} participants ·
        Both deployment and participant verification are required.
      </p>
    </>
  );
}
