"use client";

import * as React from "react";
import { Download, Plus, Share, Smartphone, X } from "lucide-react";
import { Button, MenuItem, Modal } from "@/components/ui";
import { isIos, isStandalone } from "@/lib/push/client";
import { cn } from "@/lib/utils";

/**
 * Installing GHL ONE from the browser — "Add to Home Screen" on a phone, an app window on a
 * desktop. The service worker's `fetch` handler is what makes the browser offer this at all; this
 * file is the part the person sees.
 *
 * Chrome fires `beforeinstallprompt` during page load, which is usually BEFORE React has mounted.
 * A listener registered inside an effect misses it on a cold load and the install option silently
 * never appears. So the listener is registered at module scope, the moment this module is first
 * imported on the client, and components read the captured event through `useSyncExternalStore`.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = "ready" | "installed" | "none";

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((cb) => cb());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Suppresses Chrome's own mini-infobar. We own when and where the offer is made instead, and
    // keeping the event means we can replay it later from the user menu.
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function snapshot(): InstallState {
  if (installed) return "installed";
  return deferred ? "ready" : "none";
}
/** Server render and hydration show nothing — installability is a browser fact, not a page fact. */
function serverSnapshot(): InstallState {
  return "none";
}

function useInstallState(): InstallState {
  return React.useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** True only where the browser will never fire `beforeinstallprompt` but CAN still install. */
function useNeedsIosSteps(): boolean {
  return React.useSyncExternalStore(
    () => () => {},
    () => isIos() && !isStandalone(),
    () => false
  );
}

async function runInstall(): Promise<void> {
  const e = deferred;
  if (!e) return;
  // The captured event is single-use: once prompted it can never be prompted again, so it is
  // cleared whatever the person chooses. Chrome hands us a fresh one on a later visit.
  deferred = null;
  emit();
  try {
    await e.prompt();
    await e.userChoice;
  } catch {
    /* the person closed the sheet — nothing to report */
  }
}

/* -------------------------------------------------------------------------- */
/* iOS: there is no prompt to fire, only instructions                          */
/* -------------------------------------------------------------------------- */

function IosSteps({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Install GHL ONE" width={420} footer={<Button onClick={onClose}>Got it</Button>}>
      <p className="text-sm text-muted mb-3">
        Safari installs apps from its Share menu rather than offering a button. Three taps, and GHL
        ONE gets its own icon, opens without the address bar, and can receive notifications — which
        on iPhone only an installed app can.
      </p>
      <ol className="text-sm space-y-2.5">
        <li className="flex items-start gap-2.5">
          <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--neutral-bg)] text-[11px] font-semibold flex items-center justify-center mt-0.5">1</span>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            Tap <Share size={14} className="inline text-brand-2" /> <b>Share</b> at the bottom of Safari.
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--neutral-bg)] text-[11px] font-semibold flex items-center justify-center mt-0.5">2</span>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            Scroll down and choose <Plus size={14} className="inline text-brand-2" /> <b>Add to Home Screen</b>.
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--neutral-bg)] text-[11px] font-semibold flex items-center justify-center mt-0.5">3</span>
          <span>
            Tap <b>Add</b>, then open GHL ONE from your home screen.
          </span>
        </li>
      </ol>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* In the topbar user menu — available at every width, never in the way        */
/* -------------------------------------------------------------------------- */

/**
 * Renders nothing unless the app can actually be installed right now. Already installed, or a
 * browser that cannot install, and this disappears rather than offering a dead control.
 */
export function InstallAppMenuItem() {
  const state = useInstallState();
  const iosSteps = useNeedsIosSteps();
  const [open, setOpen] = React.useState(false);

  if (state === "installed") return null;
  if (state !== "ready" && !iosSteps) return null;

  return (
    <>
      <MenuItem
        icon={<Download size={14} />}
        onClick={() => {
          if (state === "ready") void runInstall();
          else setOpen(true);
        }}
      >
        Install app
      </MenuItem>
      <IosSteps open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* One-line prompt on phones and tablets                                       */
/* -------------------------------------------------------------------------- */

const DISMISS_KEY = "ghl-install-dismissed";

/**
 * "Not now" lives in localStorage and is read through an external store, the same shape the push
 * opt-in uses: the bar stays hidden through hydration rather than flashing in and back out.
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
function dismissedServerSnapshot(): boolean {
  return true;
}
function dismissFor(days: number) {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 86_400_000));
  } catch {
    /* private mode — the bar simply reappears next session */
  }
  dismissSnapshot = true;
  dismissListeners.forEach((cb) => cb());
}

/**
 * Mounted above the page content below `lg`. Desktop is left exactly as it was — the user menu
 * carries the same action there — because the install offer is worth a line of a phone screen and
 * is not worth changing a workspace people already know.
 */
export function InstallPrompt({ className }: { className?: string }) {
  const state = useInstallState();
  const iosSteps = useNeedsIosSteps();
  const dismissed = React.useSyncExternalStore(subscribeDismissed, dismissedSnapshot, dismissedServerSnapshot);
  const [open, setOpen] = React.useState(false);

  if (dismissed || state === "installed") return null;
  if (state !== "ready" && !iosSteps) return null;

  return (
    <>
      <div className={cn("lg:hidden min-w-0 flex items-center gap-2 rounded-[var(--radius-sm)] border bg-[var(--bg-elev)] px-2.5 py-2", className)}>
        <Smartphone size={15} className="shrink-0 text-brand-2" />
        <div className="min-w-0 flex-1 text-[12px] leading-tight">
          <span className="font-medium">Install GHL ONE</span>
          <span className="text-muted"> · full screen, opens like an app</span>
        </div>
        <button
          type="button"
          className="shrink-0 pill tone-brand hover:opacity-80"
          onClick={() => {
            if (state === "ready") void runInstall();
            else setOpen(true);
          }}
        >
          Install
        </button>
        <button type="button" className="shrink-0 text-muted hover:text-[var(--fg)] p-0.5" onClick={() => dismissFor(30)} aria-label="Not now">
          <X size={14} />
        </button>
      </div>
      <IosSteps open={open} onClose={() => setOpen(false)} />
    </>
  );
}
