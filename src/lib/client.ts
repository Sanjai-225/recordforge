"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserClient } from "./supabase/browser";
import type { SnapshotBase, EventClock } from "./types";
export class RequestError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}
export async function post(path: string, value: unknown) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
      signal: AbortSignal.timeout(25000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new RequestError(
        data.error || "The request could not be completed.",
        data.code || "UNAVAILABLE",
      );
    return data;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(
      "Connection interrupted. Synchronize to check whether the action succeeded, then retry if needed.",
      "NETWORK",
    );
  }
}
export function useSnapshot<T extends SnapshotBase>(url: string) {
  const [value, setValue] = useState<{ url: string; data: T } | null>(null),
    [error, setError] = useState(""),
    [lastSync, setLastSync] = useState<string | null>(null),
    [realtime, setRealtime] = useState("Connecting"),
    [loading, setLoading] = useState(true);
  const sequence = useRef(0),
    abort = useRef<AbortController | null>(null),
    inFlight = useRef<{ url: string; promise: Promise<void> } | null>(null),
    queued = useRef(false);
  const refresh = useCallback(
    async function synchronize(): Promise<void> {
      if (inFlight.current?.url === url) {
        queued.current = true;
        return inFlight.current.promise;
      }
      const seq = ++sequence.current;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      queued.current = false;
      setLoading(true);
      const run = async () => {
        try {
          const response = await fetch(url, {
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(20000),
            ]),
          });
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Unable to synchronize.");
          if (seq !== sequence.current) return;
          setValue({ url, data });
          setLastSync(new Date().toISOString());
          setError("");
        } catch (e) {
          if (!controller.signal.aborted && seq === sequence.current)
            setError(
              e instanceof Error ? e.message : "Connection interrupted.",
            );
        } finally {
          if (seq === sequence.current) {
            setLoading(false);
            inFlight.current = null;
            if (queued.current) {
              queued.current = false;
              void synchronize();
            }
          }
        }
      };
      const promise = run();
      inFlight.current = { url, promise };
      return promise;
    },
    [url],
  );
  const cancelSynchronization = useCallback(() => {
    ++sequence.current;
    inFlight.current = null;
    queued.current = false;
    abort.current?.abort();
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const sync = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (!disposed) void refresh();
      }, 300);
    };
    timer = setTimeout(() => {
      timer = undefined;
      if (!disposed) void refresh();
    }, 0);
    const client = browserClient();
    const channel = client
      ?.channel(`event-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "event_signals" },
        sync,
      )
      .subscribe((status) => {
        if (disposed) return;
        setRealtime(
          status === "SUBSCRIBED"
            ? "Connected"
            : status === "CHANNEL_ERROR" || status === "TIMED_OUT"
              ? "Reconnecting"
              : "Connecting",
        );
        if (status === "SUBSCRIBED") sync();
      });
    const interval = setInterval(sync, 12000 + Math.random() * 4000);
    const offline = () => {
      setRealtime("Offline");
      setError(
        "Connection lost. Official counts will reconcile when you reconnect.",
      );
    };
    const focus = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", focus);
    return () => {
      disposed = true;
      cancelSynchronization();
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", focus);
      if (channel) void client?.removeChannel(channel);
    };
  }, [url, refresh, cancelSynchronization]);
  return {
    data: value?.url === url ? value.data : null,
    error,
    lastSync,
    realtime,
    loading,
    refresh,
  };
}
export function remainingSeconds(event: EventClock, serverNow: number): number {
  if (event.state === "ENDED") return 0;
  if (!event.started_at || !event.deadline) return event.duration_minutes * 60;
  const now =
    event.state === "PAUSED" && event.paused_at
      ? new Date(event.paused_at).getTime()
      : serverNow;
  return Math.max(
    0,
    Math.ceil((new Date(event.deadline).getTime() - now) / 1000),
  );
}
export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export function time(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";
}
export function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}
