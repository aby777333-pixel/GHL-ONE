"use client";

import * as React from "react";
import type { BuddyAttachment, BuddyMode, BuddyScope } from "@/lib/ai/types";

/**
 * Tiny global store so any page can open GHL Buddy with a mode / message / scope
 * without prop drilling. `BuddyPanel` merges this with the `open` prop it receives from AppShell.
 */
export type BuddyOpenOptions = {
  mode?: BuddyMode;
  /** Prefill the composer (or send immediately when `send` is true). */
  message?: string;
  /** Overrides the scope derived from the current URL. */
  scope?: BuddyScope;
  attachments?: BuddyAttachment[];
  /** Send right away (uses `message`, or the mode's default prompt). */
  send?: boolean;
};

export type BuddyRequest = BuddyOpenOptions & { nonce: number };
export type BuddyState = { open: boolean; request: BuddyRequest | null };

let state: BuddyState = { open: false, request: null };
let nonce = 0;
const listeners = new Set<() => void>();
const SERVER_STATE: BuddyState = { open: false, request: null };

function emit(next: BuddyState) {
  state = next;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Open the Buddy panel, optionally with a mode, a message, a scope and attachments. */
export function openBuddy(opts: BuddyOpenOptions = {}) {
  nonce += 1;
  emit({ open: true, request: { ...opts, nonce } });
}
export function closeBuddy() {
  if (state.open) emit({ ...state, open: false });
}
export function toggleBuddy() {
  if (state.open) closeBuddy();
  else openBuddy();
}
/** Called by the panel once a request has been consumed. */
export function consumeBuddyRequest(n: number) {
  if (state.request?.nonce === n) emit({ ...state, request: null });
}

export function useBuddy() {
  const s = React.useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  return { open: s.open, request: s.request, openBuddy, closeBuddy, toggleBuddy };
}
