"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BellOff, BellRing, Check, Info, Loader2, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  BLOCK_MESSAGE,
  currentSubscription,
  pushSupported,
  registerServiceWorker,
  usePush,
} from "@/lib/push/client";

const DISMISS_KEY = "ghl-push-prompt-dismissed";

/**
 * "Not now" lives in localStorage, read through an external store so the prompt never has to
 * set state from an effect (and so it stays hidden through hydration rather than flashing).
 */
const dismissListeners = new Set<() => void>();
let dismissSnapshot: boolean | null = null;

function readDismissed(): boolean {
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}
function subscribeDismissed(cb: () => void) {
  dismissListeners.add(cb);
  return () => {
    dismissListeners.delete(cb);
  };
}
function dismissedSnapshot(): boolean {
  if (dismissSnapshot === null) dismissSnapshot = readDismissed();
  return dismissSnapshot;
}
/** Server render (and hydration) keeps the prompt hidden — it is opt-in, never a flash. */
function dismissedServerSnapshot(): boolean {
  return true;
}
function dismissFor(days: number) {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 86_400_000));
  } catch {
    /* private mode — the prompt simply reappears next session */
  }
  dismissSnapshot = true;
  dismissListeners.forEach((cb) => cb());
}

/**
 * Mounted once in the shell. Two silent jobs, neither of which can prompt the user:
 *  1. register `/sw.js` so an already-granted permission survives a redeploy;
 *  2. re-post the existing subscription so its `org_id` follows a workspace switch.
 * Also relays the worker's navigate message when it could not steer the tab itself.
 */
export function PushRegistrar() {
  const router = useRouter();

  React.useEffect(() => {
    if (!pushSupported()) return;
    let cancelled = false;
    (async () => {
      await registerServiceWorker();
      if (cancelled) return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const sub = await currentSubscription();
      if (cancelled || !sub) return;
      try {
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON(), user_agent: navigator.userAgent }),
        });
      } catch {
        /* silent — push is never allowed to surface an error on load */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null;
      if (!data || data.type !== "ghl-push-navigate" || !data.url) return;
      try {
        const url = new URL(data.url);
        if (url.origin === window.location.origin) router.push(url.pathname + url.search);
      } catch {
        /* ignore malformed */
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}

/** What we will and will not send — shown before anyone is asked to say yes. */
function WhatYouGet({ className }: { className?: string }) {
  return (
    <ul className={cn("text-[11px] text-muted space-y-0.5", className)}>
      <li>· Incoming calls and huddle invites, with Accept and Decline on the notification itself.</li>
      <li>· Critical alerts, things assigned to you, approvals waiting on you, mentions and due-date reminders.</li>
      <li>· Nothing during your quiet hours or while Do not disturb is on — except critical and action-required items.</li>
      <li>· Only for the company workspace you are currently in. No message previews from other tenants, ever.</li>
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline prompt — one line, dismissible, never nags                           */
/* -------------------------------------------------------------------------- */

/**
 * One-line opt-in for the notifications panel. Hidden entirely when push is already on, when
 * the browser cannot do it, or when the person dismissed it (30 days).
 */
export function PushOptInPrompt({ className }: { className?: string }) {
  const { supported, subscribed, permission, blocked, busy, subscribe, message } = usePush();
  const dismissed = React.useSyncExternalStore(subscribeDismissed, dismissedSnapshot, dismissedServerSnapshot);
  const [expanded, setExpanded] = React.useState(false);
  const [done, setDone] = React.useState(false);

  // iOS Safari reports `supported === false` until the PWA is installed, and that is exactly the
  // case worth explaining — so it is the one "unsupported" state the prompt still shows for.
  const iosNeedsInstall = blocked === "ios-needs-install";
  const hide =
    dismissed ||
    done ||
    subscribed ||
    permission === "granted" ||
    blocked === "unsupported" ||
    blocked === "no-vapid-key" ||
    blocked === "denied" ||
    (!supported && !iosNeedsInstall);
  if (hide) return null;

  const iosHint = iosNeedsInstall;

  return (
    <div className={cn("rounded-[var(--radius-sm)] border px-2.5 py-2 mb-2 bg-[var(--bg)]", className)}>
      <div className="flex items-start gap-2">
        {iosHint ? <Smartphone size={14} className="mt-0.5 shrink-0 text-muted" /> : <BellRing size={14} className="mt-0.5 shrink-0 text-[var(--brand-2)]" />}
        <div className="min-w-0 flex-1">
          <div className="text-xs leading-snug">
            {iosHint ? "Get calls and alerts when GHL ONE is closed." : "Get calls and critical alerts even when this tab is closed."}
          </div>
          {iosHint ? (
            <div className="text-[11px] text-muted mt-1">{BLOCK_MESSAGE["ios-needs-install"]}</div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <Button
                size="xs"
                variant="primary"
                loading={busy}
                onClick={async () => {
                  const res = await subscribe();
                  if (res.ok) setDone(true);
                }}
              >
                Turn on
              </Button>
              <button type="button" className="pill tone-neutral hover:bg-[var(--line)]" onClick={() => setExpanded((v) => !v)}>
                <Info size={11} /> What gets sent
              </button>
            </div>
          )}
          {expanded && <WhatYouGet className="mt-2" />}
          {message && <div className="text-[11px] text-warn mt-1.5">{message}</div>}
        </div>
        <button
          type="button"
          aria-label="Not now"
          className="btn btn-ghost btn-xs btn-icon shrink-0"
          onClick={() => dismissFor(30)}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Full toggle — Privacy Center / profile settings                            */
/* -------------------------------------------------------------------------- */

/** The real control: explains what push is, turns it on from a click, and turns it off again. */
export function PushOptIn({ className }: { className?: string }) {
  const { ready, supported, subscribed, permission, blocked, busy, subscribe, unsubscribe, message } = usePush();

  const unavailable = !supported || blocked === "unsupported" || blocked === "ios-needs-install" || blocked === "no-vapid-key";
  const state = !ready ? "checking" : subscribed ? "on" : unavailable || blocked === "denied" ? "blocked" : "off";

  return (
    <div className={cn("rounded-[var(--radius-sm)] border p-3", className)}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0">
          {state === "checking" ? (
            <Loader2 size={15} className="animate-spin text-muted" />
          ) : state === "on" ? (
            <BellRing size={15} className="text-[var(--brand-2)]" />
          ) : (
            <BellOff size={15} className="text-muted" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Notifications on this device</div>
          <div className="text-[11px] text-muted mt-0.5">
            {state === "on"
              ? "This browser will show calls and alerts even when GHL ONE is closed."
              : "Off. You will only see notifications while GHL ONE is open in a tab."}
          </div>
          <WhatYouGet className="mt-2" />

          {state !== "checking" && (
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {state === "on" ? (
                <>
                  <span className="pill tone-success"><Check size={11} /> On</span>
                  <Button size="xs" variant="ghost" loading={busy} onClick={() => unsubscribe()}>
                    Turn off on this device
                  </Button>
                </>
              ) : (
                <Button size="xs" variant="primary" loading={busy} disabled={unavailable} onClick={() => subscribe()}>
                  <BellRing size={13} /> Turn on
                </Button>
              )}
            </div>
          )}

          {message && (
            <div className="text-[11px] text-warn mt-2 flex items-start gap-1.5">
              <Info size={12} className="shrink-0 mt-0.5" />
              <span>{message}</span>
            </div>
          )}
          {state === "on" && permission === "granted" && (
            <div className="text-[11px] text-muted mt-2">
              Turning this off here only affects this browser. Your Inbox inside GHL ONE is unchanged either way — it is
              always the record of what happened.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PushOptIn;
