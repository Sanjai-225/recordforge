"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  LogOut,
  RefreshCw,
  ShieldCheck,
  X,
  Radio,
} from "lucide-react";
import { formatTime, remainingSeconds, post, time } from "@/lib/client";
import type { EventClock, FieldDefinition, Fields } from "@/lib/types";
export function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-mark">
        <Activity size={23} />
      </span>
      Record<span>Forge</span>
    </Link>
  );
}
export function Logout() {
  const router = useRouter();
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        className="button ghost"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            await post("/api/auth/logout", {});
            router.replace("/login");
            router.refresh();
          } catch {
            setError("Sign out failed. Try again.");
            setPending(false);
          }
        }}
      >
        <LogOut size={16} />
        Sign out
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function StateBadge({ state }: { state: string }) {
  return (
    <Badge
      tone={
        state === "LIVE"
          ? "success"
          : state === "PAUSED"
            ? "warning"
            : "neutral"
      }
    >
      {state === "LIVE" && <Radio size={13} />} {state.replaceAll("_", " ")}
    </Badge>
  );
}
export function SyncStatus({
  status,
  lastSync,
  loading,
  onRefresh,
}: {
  status: string;
  lastSync: string | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="sync">
      <span>{status === "Connected" ? "Live updates" : status}</span>
      <span className="secondary">
        {lastSync ? `Synced ${time(lastSync)}` : "Awaiting synchronization"}
      </span>
      <button
        className="icon-button"
        onClick={onRefresh}
        aria-label="Synchronize authoritative state"
        disabled={loading}
      >
        <RefreshCw size={16} className={loading ? "spin" : ""} />
      </button>
    </div>
  );
}
export function Notice({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success" | "info";
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <ShieldCheck size={32} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Loading() {
  return (
    <div className="empty" role="status">
      <RefreshCw className="spin" size={24} />
      <p>Synchronizing event data…</p>
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "accent" : ""}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}
export function Progress({ value, max }: { value: number; max: number }) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label="Verified completion progress"
    >
      <div
        style={{ width: `${Math.min(100, max ? (100 * value) / max : 0)}%` }}
      />
    </div>
  );
}
export function Timer({
  event,
  serverTime,
}: {
  event: EventClock;
  serverTime: string;
}) {
  const [clock, setClock] = useState(() => ({
    source: serverTime,
    now: Date.parse(serverTime),
  }));
  useEffect(() => {
    const anchor = Date.parse(serverTime),
      local = performance.now();
    const id = setInterval(
      () =>
        setClock({
          source: serverTime,
          now: anchor + performance.now() - local,
        }),
      500,
    );
    return () => clearInterval(id);
  }, [serverTime]);
  return (
    <span className="timer">
      {formatTime(
        remainingSeconds(
          event,
          clock.source === serverTime ? clock.now : Date.parse(serverTime),
        ),
      )}
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-header">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function DynamicFields({
  definitions,
  values,
  onChange,
}: {
  definitions: FieldDefinition[];
  values: Fields;
  onChange: (values: Fields) => void;
}) {
  return (
    <>
      {definitions
        .filter((f) => f.enabled !== false)
        .map((f) => (
          <label
            key={f.key}
            className={f.type === "boolean" ? "check-field" : "field"}
          >
            {f.type !== "boolean" && (
              <span>
                {f.label}
                {f.required ? " *" : ""}
              </span>
            )}
            {f.type === "select" ? (
              <select
                required={f.required}
                value={String(values[f.key] ?? "")}
                onChange={(e) =>
                  onChange({ ...values, [f.key]: e.target.value })
                }
              >
                <option value="">Select {f.label.toLowerCase()}</option>
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : f.type === "boolean" ? (
              <>
                <input
                  type="checkbox"
                  checked={values[f.key] === true}
                  onChange={(e) =>
                    onChange({ ...values, [f.key]: e.target.checked })
                  }
                />
                <span>{f.label}</span>
              </>
            ) : (
              <input
                required={f.required}
                type={f.type === "number" ? "number" : "text"}
                maxLength={2000}
                value={String(values[f.key] ?? "")}
                onChange={(e) =>
                  onChange({
                    ...values,
                    [f.key]:
                      f.type === "number" && e.target.value !== ""
                        ? Number(e.target.value)
                        : e.target.value,
                  })
                }
              />
            )}
          </label>
        ))}
    </>
  );
}
