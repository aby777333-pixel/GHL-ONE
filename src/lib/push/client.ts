"use client";

/**
 * Browser side of web push.
 *
 * Rules this file exists to enforce:
 *  - Permission is NEVER requested on load. `subscribe()` is only ever called from a click.
 *  - Every failure is returned, never thrown — push is an extra delivery channel, the in-app
 *    notification stays the source of truth.
 *  - The service worker is registered on load (harmless, no permission prompt) so that an
 *    already-granted permission keeps working after a redeploy.
 */

import * as React from "react";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export type PushBlockReason =
  | "unsupported"
  | "ios-needs-install"
  | "denied"
  | "no-vapid-key"
  | null;

export type PushState = {
  /** False until the first capability check has run in the browser (avoids a hydration flash). */
  ready: boolean;
  /** The browser can do web push here, and we have a VAPID key to sign with. */
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  /** Why the browser will not accept a subscription, if it will not. */
  blocked: PushBlockReason;
  busy: boolean;
  error: string | null;
};

/* -------------------------------------------------------------------------- */
/* Capability detection                                                       */
/* -------------------------------------------------------------------------- */

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS 13+ reports as Macintosh; the touch-point check separates it from a real Mac.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== "undefined" && navigator.maxTouchPoints > 1);
}

/** iOS only exposes PushManager to a home-screen-installed PWA. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function blockReason(): PushBlockReason {
  if (!pushSupported()) return isIos() && !isStandalone() ? "ios-needs-install" : "unsupported";
  if (!VAPID_PUBLIC_KEY) return "no-vapid-key";
  if (typeof Notification !== "undefined" && Notification.permission === "denied") return "denied";
  return null;
}

export const BLOCK_MESSAGE: Record<Exclude<PushBlockReason, null>, string> = {
  unsupported: "This browser cannot show notifications when GHL ONE is closed. Chrome, Edge, Firefox or an installed app can.",
  "ios-needs-install":
    "On iPhone and iPad, Safari only delivers notifications to an installed app. Tap Share → Add to Home Screen, open GHL ONE from there, then turn this on.",
  denied:
    "Your browser is blocking notifications for this site. Open the padlock next to the address bar → Notifications → Allow, then try again.",
  "no-vapid-key": "Push is not configured on this deployment yet. Your in-app Inbox still works normally.",
};

/* -------------------------------------------------------------------------- */
/* Keys + registration                                                        */
/* -------------------------------------------------------------------------- */

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

let registering: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Register (or reuse) the worker. Safe to call on every page load: registering a worker never
 * prompts the user for anything.
 */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  if (!registering) {
    registering = navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((r) => r)
      .catch(() => null);
  }
  return registering;
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  const reg = await registerServiceWorker();
  if (!reg) return null;
  try {
    // `ready` resolves once a worker controls the page; the registration itself is enough for push.
    return (await navigator.serviceWorker.ready) || reg;
  } catch {
    return reg;
  }
}

/* -------------------------------------------------------------------------- */
/* Subscribe / unsubscribe                                                    */
/* -------------------------------------------------------------------------- */

export type PushResult = { ok: true } | { ok: false; error: string; reason?: PushBlockReason };

/** Ask for permission (must be called from a user gesture), subscribe, and store the row. */
export async function subscribeToPush(): Promise<PushResult> {
  const blocked = blockReason();
  if (blocked) return { ok: false, error: BLOCK_MESSAGE[blocked], reason: blocked };

  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return { ok: false, error: BLOCK_MESSAGE.denied, reason: "denied" };
  }
  if (permission !== "granted") {
    return permission === "denied"
      ? { ok: false, error: BLOCK_MESSAGE.denied, reason: "denied" }
      : { ok: false, error: "Notification permission was dismissed. Nothing changed." };
  }

  const reg = await readyRegistration();
  if (!reg) return { ok: false, error: "The notification helper could not start in this browser." };

  let sub: PushSubscription | null = null;
  try {
    sub = await reg.pushManager.getSubscription();
    if (sub) {
      // A key change (rotated VAPID pair) invalidates the old subscription — replace it.
      const existingKey = sub.options?.applicationServerKey;
      const want = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      if (existingKey && !sameKey(existingKey, want)) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The browser refused the subscription." };
  }

  try {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), user_agent: navigator.userAgent }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: j.error || "Could not save this device. Try again." };
    }
  } catch {
    return { ok: false, error: "Could not reach GHL ONE to save this device." };
  }
  return { ok: true };
}

function sameKey(a: ArrayBuffer, b: Uint8Array<ArrayBuffer>): boolean {
  const x = new Uint8Array(a);
  if (x.length !== b.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== b[i]) return false;
  return true;
}

/** Drop this device: unsubscribe in the browser and delete the row. */
export async function unsubscribeFromPush(): Promise<PushResult> {
  if (!pushSupported()) return { ok: true };
  const reg = await readyRegistration();
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  const endpoint = sub?.endpoint || null;
  if (sub) await sub.unsubscribe().catch(() => {});
  try {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    // The browser already stopped delivering; the server row is pruned on the next 410.
  }
  return { ok: true };
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await readyRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription().catch(() => null);
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

export type UsePush = PushState & {
  subscribe: () => Promise<PushResult>;
  unsubscribe: () => Promise<PushResult>;
  message: string | null;
  refresh: () => void;
};

/**
 * `usePush()` — everything a toggle needs. Reads state only; it never prompts.
 * `subscribe()` must be wired to a real click.
 */
export function usePush(): UsePush {
  const [state, setState] = React.useState<PushState>({
    ready: false,
    supported: false,
    permission: "default",
    subscribed: false,
    blocked: null,
    busy: false,
    error: null,
  });
  const alive = React.useRef(true);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = pushSupported();
      const blocked = blockReason();
      const permission: NotificationPermission | "unsupported" =
        typeof Notification !== "undefined" ? Notification.permission : "unsupported";
      let subscribed = false;
      if (supported && permission === "granted") {
        const sub = await currentSubscription();
        subscribed = !!sub;
      }
      if (cancelled) return;
      setState((s) => ({ ...s, ready: true, supported, permission, subscribed, blocked }));
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = React.useCallback(() => setTick((t) => t + 1), []);

  const subscribe = React.useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null }));
    const res = await subscribeToPush();
    if (!alive.current) return res;
    setState((s) => ({
      ...s,
      busy: false,
      error: res.ok ? null : res.error,
      blocked: res.ok ? null : (res as { reason?: PushBlockReason }).reason ?? s.blocked,
      permission: typeof Notification !== "undefined" ? Notification.permission : s.permission,
      subscribed: res.ok,
    }));
    return res;
  }, []);

  const unsubscribe = React.useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null }));
    const res = await unsubscribeFromPush();
    if (!alive.current) return res;
    setState((s) => ({ ...s, busy: false, subscribed: false, error: res.ok ? null : res.error }));
    return res;
  }, []);

  const message = state.error || (state.blocked ? BLOCK_MESSAGE[state.blocked] : null);
  return { ...state, subscribe, unsubscribe, message, refresh };
}
