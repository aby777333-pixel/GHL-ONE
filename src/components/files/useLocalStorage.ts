"use client";

import * as React from "react";

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** SSR-safe localStorage string value (falls back on the server and in private windows). */
export function useLocalStorage(key: string, fallback: string): [string, (v: string) => void] {
  const value = React.useSyncExternalStore(
    subscribe,
    () => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    () => fallback
  );
  const set = React.useCallback((v: string) => {
    try { localStorage.setItem(key, v); } catch {}
    listeners.forEach((l) => l());
  }, [key]);
  return [value, set];
}
