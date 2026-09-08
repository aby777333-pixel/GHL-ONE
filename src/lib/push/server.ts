import "server-only";
import webpush, { WebPushError } from "web-push";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server side of web push.
 *
 * Contract: **nothing in here ever throws into the caller.** Push is a second delivery channel;
 * the `notifications` row is the source of truth and must never be lost because a browser
 * endpoint went away. Every entry point returns a small result object instead.
 *
 * Dead endpoints (410 Gone / 404 Not Found) are deleted on sight — that is the only way a
 * `push_subscriptions` table stays honest.
 */

export type PushPayload = {
  title: string;
  body?: string | null;
  link?: string | null;
  tag?: string | null;
  kind?: string | null;
  icon?: string | null;
  badge?: string | null;
  /** Ring-style notification: requireInteraction + Accept/Decline actions in the worker. */
  call?: boolean;
  inviteId?: string | null;
  roomId?: string | null;
  notificationId?: string | null;
  orgId?: string | null;
};

export type PushSendResult = {
  ok: boolean;
  sent: number;
  failed: number;
  pruned: number;
  /** No devices registered, push not configured, or suppressed by the recipient's preferences. */
  skipped?: "not-configured" | "no-subscriptions" | "quiet-hours" | "no-secret";
  error?: string;
};

/** Kinds that ignore quiet hours and Do-not-disturb entirely (documented exception). */
export const ALWAYS_DELIVER: ReadonlySet<string> = new Set(["critical", "action_required"]);

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@ghlindiaventures.com";

export function pushConfigured(): boolean {
  return !!PUBLIC_KEY && !!PRIVATE_KEY;
}

let vapidReady = false;
function ensureVapid(): boolean {
  if (!pushConfigured()) return false;
  if (!vapidReady) {
    try {
      webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
      vapidReady = true;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * The client the push path uses. **Anon key only** — there is deliberately no service-role key in
 * this app: a service key bypasses every RLS policy in the product, and push is not worth that
 * blast radius. The push hook is called by Postgres (`pg_net`) with no user session, so the three
 * privileged reads it needs live in SECURITY DEFINER functions (`push_notification`,
 * `push_targets`, `push_settle` in 0025_push.sql), each gated on `PUSH_HOOK_SECRET`.
 *
 * Memoised, sessionless, and null when the public env is missing so callers degrade rather
 * than crash.
 */
let pushDb: SupabaseClient | null = null;
export function pushClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!pushDb) {
    pushDb = createSupabaseClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "X-Client-Info": "ghl-one-push" } },
    });
  }
  return pushDb;
}

/** The hook's only credential. Absent = push cannot authenticate to Postgres at all. */
function hookSecret(): string {
  return process.env.PUSH_HOOK_SECRET || "";
}

/* -------------------------------------------------------------------------- */
/* Preferences                                                                */
/* -------------------------------------------------------------------------- */

export type PrefsDecision = { deliver: boolean; reason?: "quiet-hours" };

/**
 * Quiet hours + Do-not-disturb, evaluated in Postgres so push obeys exactly the same rule as
 * escalations and digests (`in_quiet_hours(uid)`), with the documented exception for
 * `critical` and `action_required`.
 *
 * `sendPushToUser` does NOT call this — `push_targets()` applies the identical rule inside the
 * same round trip that fetches the devices. It stays exported for any caller that needs the
 * decision on its own (a digest, an email fallback) without a send.
 */
export async function respectsPrefs(db: SupabaseClient, userId: string, kind?: string | null): Promise<PrefsDecision> {
  if (kind && ALWAYS_DELIVER.has(kind)) return { deliver: true };
  try {
    const { data, error } = await db.rpc("in_quiet_hours", { uid: userId });
    if (error) return { deliver: true }; // fail open: a missed rule is better than a missed alert
    return data === true ? { deliver: false, reason: "quiet-hours" } : { deliver: true };
  } catch {
    return { deliver: true };
  }
}

/* -------------------------------------------------------------------------- */
/* Sending                                                                    */
/* -------------------------------------------------------------------------- */

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string; failure_count: number | null };

/** Shape of `push_targets()`: quiet hours already applied, so `quiet` always means empty `subs`. */
type Targets = { ok?: boolean; quiet?: boolean; subs?: SubRow[] | null };

/** Endpoints that are permanently gone. Anything else is a transient failure. */
function isGone(status?: number): boolean {
  return status === 404 || status === 410;
}

/**
 * Send one payload to every device belonging to `userId`, inside `orgId` when given.
 * Tenant scoping matters: a person who belongs to two companies must not receive company B's
 * alert on a device registered while working in company A — so the scoping, like quiet hours,
 * is decided by `push_targets()` in Postgres rather than by a query we could get wrong here.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  opts: { db?: SupabaseClient | null; orgId?: string | null } = {}
): Promise<PushSendResult> {
  const base: PushSendResult = { ok: false, sent: 0, failed: 0, pruned: 0 };
  if (!ensureVapid()) return { ...base, skipped: "not-configured" };

  const secret = hookSecret();
  if (!secret) return { ...base, skipped: "no-secret" };

  const db = opts.db ?? pushClient();
  if (!db) return { ...base, skipped: "not-configured" };

  // One round trip: quiet hours + DND + tenant scoping + the devices themselves.
  let rows: SubRow[] = [];
  try {
    const { data, error } = await db.rpc("push_targets", {
      p_secret: secret,
      p_user: userId,
      p_org: opts.orgId ?? null,
      p_kind: payload.kind ?? null,
    });
    if (error) return { ...base, error: error.message };
    const targets = (data ?? null) as Targets | null;
    if (!targets) return { ...base, error: "push_targets returned nothing" };
    // ok:false means Postgres rejected the shared secret — that is a misconfiguration, not "no devices".
    if (targets.ok === false) return { ...base, error: "push hook secret rejected" };
    if (targets.quiet === true) return { ...base, ok: true, skipped: "quiet-hours" };
    rows = Array.isArray(targets.subs) ? targets.subs : [];
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "subscription lookup failed" };
  }
  if (rows.length === 0) return { ...base, ok: true, skipped: "no-subscriptions" };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? undefined,
    link: payload.link ?? undefined,
    tag: payload.tag ?? undefined,
    kind: payload.kind ?? undefined,
    icon: payload.icon ?? undefined,
    badge: payload.badge ?? undefined,
    call: payload.call === true,
    inviteId: payload.inviteId ?? undefined,
    roomId: payload.roomId ?? undefined,
    notificationId: payload.notificationId ?? undefined,
    orgId: payload.orgId ?? undefined,
  });

  const dead: string[] = [];
  const shaky: string[] = [];
  const delivered: string[] = [];

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
          { TTL: payload.call ? 45 : 60 * 60 * 12, urgency: payload.call || payload.kind === "critical" ? "high" : "normal" }
        );
        delivered.push(row.id);
      } catch (e) {
        const status = e instanceof WebPushError ? e.statusCode : undefined;
        if (isGone(status)) dead.push(row.id);
        else shaky.push(row.id);
      }
    })
  );
  const sent = delivered.length;

  // Book-keeping in one call: prune the gone, strike the shaky (retired at 10), stamp the rest.
  // Failing here must never turn a delivered push into an error.
  let pruned = dead.length;
  if (dead.length || shaky.length || delivered.length) {
    try {
      const { error } = await db.rpc("push_settle", {
        p_secret: secret,
        p_dead: dead,
        p_shaky: shaky,
        p_delivered: delivered,
      });
      if (error) pruned = 0;
      else pruned += shaky.filter((id) => ((rows.find((r) => r.id === id)?.failure_count ?? 0) + 1) >= 10).length;
    } catch {
      pruned = 0; /* housekeeping only */
    }
  }

  return { ok: true, sent, failed: shaky.length + dead.length, pruned };
}

/** Fire-and-forget helper for call sites that must not wait on (or care about) delivery. */
export function sendPushQuietly(userId: string, payload: PushPayload, opts?: Parameters<typeof sendPushToUser>[2]): void {
  void sendPushToUser(userId, payload, opts).catch(() => undefined);
}
