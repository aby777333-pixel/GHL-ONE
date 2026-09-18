/* GHL ONE service worker — web push only.
 *
 * Deliberately NOT an offline cache: the app is a live, tenant-scoped workspace and a stale
 * cached shell would be worse than a spinner. This worker exists to receive `push` events and
 * to route `notificationclick`. The in-app notification (the `notifications` table) always
 * remains the source of truth — anything that fails here must fail silently.
 *
 * Payload contract (see src/lib/push/server.ts):
 *   { title, body, link, tag, kind, icon, badge, call, inviteId, roomId, notificationId, orgId }
 */

const DEFAULT_ICON = "/icon-192.png";
const DEFAULT_BADGE = "/badge-96.png";
const LOUD_KINDS = ["critical", "action_required"];

/* The ONLY thing this worker ever caches. Not a page of the app — a static "you are offline"
 * card, so a hard navigation with no network lands somewhere that looks like GHL ONE instead of
 * the browser's error page. Bump the version to force it to be re-fetched. */
const OFFLINE_URL = "/offline.html";
const SHELL_CACHE = "ghl-one-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => {
        /* the fallback is a nicety — never let it fail an install */
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop our own superseded shell caches only. Anything another origin feature put in
      // CacheStorage is none of this worker's business.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.indexOf("ghl-one-") === 0 && k !== SHELL_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

/**
 * Navigations only, network first, no cache on success.
 *
 * Two reasons this handler exists, and neither is offline support:
 *  1. Chrome will not treat a site as installable — no `beforeinstallprompt`, no install button in
 *     the omnibox, no "Install app" in the browser menu — unless its worker handles `fetch`.
 *  2. A standalone window has no address bar, so a failed navigation there is a dead end.
 *
 * Everything that is not a top-level navigation returns without calling `respondWith`, which hands
 * the request straight back to the browser untouched: API calls, RSC payloads, Next.js chunks,
 * images and Supabase traffic never pass through this worker. That is deliberate — see the note at
 * the top of this file. `event.request` is forwarded verbatim rather than rebuilt, so its
 * `redirect: "manual"` mode survives and the proxy's auth redirects are still followed by the
 * browser itself.
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;

  event.respondWith(
    fetch(req).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return cached || Response.error();
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json() || {};
  } catch {
    try {
      return { title: "GHL ONE", body: event.data.text() };
    } catch {
      return {};
    }
  }
}

self.addEventListener("push", (event) => {
  const p = readPayload(event);
  const title = p.title || "GHL ONE";
  const isCall = !!p.call;
  const loud = isCall || LOUD_KINDS.indexOf(p.kind) !== -1;

  const options = {
    body: p.body || undefined,
    icon: p.icon || DEFAULT_ICON,
    badge: p.badge || DEFAULT_BADGE,
    // One tag per logical thing, so a re-ring or a repeated reminder replaces rather than stacks.
    tag: p.tag || (p.notificationId ? "notif:" + p.notificationId : "ghl-one"),
    renotify: loud,
    requireInteraction: isCall,
    silent: false,
    timestamp: Date.now(),
    vibrate: isCall ? [200, 100, 200, 100, 200] : loud ? [120, 60, 120] : undefined,
    data: {
      link: p.link || "/inbox",
      kind: p.kind || "information",
      call: isCall,
      inviteId: p.inviteId || null,
      roomId: p.roomId || null,
      notificationId: p.notificationId || null,
      orgId: p.orgId || null,
    },
    actions: isCall
      ? [
          { action: "accept", title: "Accept" },
          { action: "decline", title: "Decline" },
        ]
      : p.link
        ? [{ action: "open", title: "Open" }]
        : undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/** Focus an already-open GHL ONE tab and steer it to `url`, or open a new one. */
async function openApp(url) {
  const target = new URL(url || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = all.find((c) => {
    try {
      return new URL(c.url).origin === self.location.origin;
    } catch {
      return false;
    }
  });
  if (existing) {
    try {
      await existing.focus();
    } catch {
      /* focus can be refused — fall through to navigate anyway */
    }
    // `navigate` needs a controlled client; postMessage is the fallback the app can act on.
    try {
      if (typeof existing.navigate === "function") {
        await existing.navigate(target.href);
        return;
      }
    } catch {
      /* not controlled by this worker yet */
    }
    try {
      existing.postMessage({ type: "ghl-push-navigate", url: target.href });
      return;
    } catch {
      /* fall through */
    }
  }
  if (self.clients.openWindow) await self.clients.openWindow(target.href);
}

/** Decline a live invite without opening the app. Same-origin, so the session cookie rides along. */
async function declineInvite(inviteId) {
  if (!inviteId) return;
  try {
    await fetch("/api/push/decline", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_id: inviteId }),
    });
  } catch {
    /* silent — the ring also stops when the caller hangs up */
  }
}

self.addEventListener("notificationclick", (event) => {
  const data = (event.notification && event.notification.data) || {};
  event.notification.close();

  if (event.action === "decline") {
    event.waitUntil(declineInvite(data.inviteId));
    return;
  }

  // Accept a call → straight into the room; everything else → the deep link.
  let url = data.link || "/inbox";
  if (event.action === "accept" && data.roomId) {
    url = "/live/" + data.roomId + (data.inviteId ? "?invite=" + encodeURIComponent(data.inviteId) + "&accept=1" : "?accept=1");
  }
  event.waitUntil(openApp(url));
});

/**
 * The browser can rotate a subscription on its own. Re-subscribe with the same VAPID key and
 * tell the server, otherwise the device goes quiet forever.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription || null;
      let fresh = event.newSubscription || null;
      try {
        if (!fresh) {
          const key = (old && old.options && old.options.applicationServerKey) || null;
          if (!key) return;
          fresh = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        }
        await fetch("/api/push/subscribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: fresh.toJSON(), replaces: old ? old.endpoint : null, user_agent: self.navigator ? self.navigator.userAgent : null }),
        });
      } catch {
        /* silent */
      }
    })()
  );
});
