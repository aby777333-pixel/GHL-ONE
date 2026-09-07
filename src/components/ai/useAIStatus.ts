"use client";

import * as React from "react";

/** Whether intelligence features are configured. Fetched once per page load (module-level cache). */
export type AIStatus = { enabled: boolean; model: string | null };

let cache: AIStatus | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load() {
  if (cache || inflight) return;
  inflight = fetch("/api/ai/status", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { enabled: false, model: null }))
    .then((j: Partial<AIStatus>) => {
      cache = { enabled: !!j.enabled, model: j.model ?? null };
    })
    .catch(() => {
      cache = { enabled: false, model: null };
    })
    .finally(() => {
      inflight = null;
      listeners.forEach((l) => l());
    });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getSnapshot = () => cache;
const getServerSnapshot = () => null;

export function useAIStatus(): AIStatus & { loading: boolean } {
  const status = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  React.useEffect(() => {
    load();
  }, []);
  return { enabled: status?.enabled ?? false, model: status?.model ?? null, loading: status === null };
}
