"use client";

/*
  Three tabs, one sound.

  Every tab of GHL ONE holds its own realtime subscription and therefore hears about every new
  notification. The pop-up is fine to show in each of them (it is where the eye is), but a sound
  and a desktop notification must happen once. `claimOnce(id, fn)` lets exactly one tab win:
  a Web Lock serialises the check-and-set on a localStorage key, and the tab that sets it runs
  `fn`. Browsers without Web Locks fall back to the plain check-and-set, where two tabs racing
  within the same millisecond is the worst case.

  The second question is "is anybody looking?". A desktop notification while the person is
  reading the app is noise; one while every tab is hidden is the whole point. The visible,
  focused tab writes a heartbeat; a hidden tab reads it before deciding.
*/

const TAB_ID = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const CLAIM_PREFIX = "ghl-notified:";
const VISIBLE_KEY = "ghl-visible-tab";
const HEARTBEAT_MS = 2000;
const FRESH_MS = 6000;

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode or blocked storage: single-tab behaviour */
  }
}
function lsDel(k: string) {
  try {
    localStorage.removeItem(k);
  } catch {}
}

export function tabId() {
  return TAB_ID;
}

/** Run `fn` in exactly one tab per `key`. Resolves true in the tab that ran it. */
export async function claimOnce(key: string, fn: () => void | Promise<void>): Promise<boolean> {
  const k = CLAIM_PREFIX + key;
  const run = async (): Promise<boolean> => {
    if (lsGet(k)) return false;
    lsSet(k, String(Date.now()));
    await fn();
    return true;
  };
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (locks?.request) {
    try {
      return await locks.request("ghl-notify:" + key, run);
    } catch {
      return run();
    }
  }
  return run();
}

/** Forget claims older than an hour so the key space does not grow forever. */
export function gcClaims() {
  try {
    const cutoff = Date.now() - 3600_000;
    const dead: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(CLAIM_PREFIX)) continue;
      const at = Number(localStorage.getItem(k) || 0);
      if (!at || at < cutoff) dead.push(k);
    }
    dead.forEach(lsDel);
  } catch {}
}

/** This tab is on screen and has the window's attention. */
export function thisTabActive() {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible" && document.hasFocus();
}

/** Some *other* tab of GHL ONE is on screen right now (its heartbeat is fresh). */
export function anotherTabActive(): boolean {
  const raw = lsGet(VISIBLE_KEY);
  if (!raw) return false;
  try {
    const { tab, at } = JSON.parse(raw) as { tab: string; at: number };
    return tab !== TAB_ID && Date.now() - at < FRESH_MS;
  } catch {
    return false;
  }
}

/** Keep the heartbeat while this tab is the one being looked at. Returns the cleanup. */
export function startVisibilityHeartbeat(): () => void {
  if (typeof window === "undefined") return () => {};
  const beat = () => {
    if (thisTabActive()) lsSet(VISIBLE_KEY, JSON.stringify({ tab: TAB_ID, at: Date.now() }));
  };
  beat();
  const id = setInterval(beat, HEARTBEAT_MS);
  window.addEventListener("focus", beat);
  document.addEventListener("visibilitychange", beat);
  return () => {
    clearInterval(id);
    window.removeEventListener("focus", beat);
    document.removeEventListener("visibilitychange", beat);
  };
}
