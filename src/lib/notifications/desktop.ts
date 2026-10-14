"use client";

/*
  Desktop notifications from the page itself — the browser's Notification API — as distinct from
  web push, which arrives through the service worker whether or not a tab is open. The two meet
  on the notification `tag`: a page-shown and a push-shown notification with the same tag replace
  each other, so a person with push enabled and a hidden tab sees one card, not two.

  Shown through the service worker's registration when there is one (that is what makes the
  `notificationclick` handler in sw.js open the right conversation), and through `new
  Notification` otherwise. Permission is never requested here except from a click.
*/

export type DesktopPermission = NotificationPermission | "unsupported";

export function desktopSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function desktopPermission(): DesktopPermission {
  if (!desktopSupported()) return "unsupported";
  return Notification.permission;
}

/** Must be called from a user gesture. */
export async function requestDesktopPermission(): Promise<DesktopPermission> {
  if (!desktopSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export const OPEN_LINK_EVENT = "ghl:open-link";

export type DesktopNotice = {
  title: string;
  body?: string | null;
  tag?: string | null;
  link?: string | null;
  kind?: string | null;
  requireInteraction?: boolean;
  renotify?: boolean;
  silent?: boolean;
  icon?: string | null;
};

/** Returns true when a notification was handed to the browser. Never throws. */
export async function showDesktopNotification(n: DesktopNotice): Promise<boolean> {
  if (desktopPermission() !== "granted") return false;
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body: n.body || undefined,
    tag: n.tag || undefined,
    icon: n.icon || "/icon-192.png",
    badge: "/badge-96.png",
    requireInteraction: !!n.requireInteraction,
    renotify: !!n.renotify,
    silent: n.silent === true,
    data: { link: n.link || "/inbox", kind: n.kind || "information" },
  };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(n.title, options);
        return true;
      }
    }
  } catch {
    /* fall through to the in-page API */
  }
  try {
    const note = new Notification(n.title, options);
    note.onclick = () => {
      try {
        window.focus();
      } catch {}
      if (n.link) window.dispatchEvent(new CustomEvent(OPEN_LINK_EVENT, { detail: { link: n.link } }));
      note.close();
    };
    return true;
  } catch {
    return false;
  }
}
