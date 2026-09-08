import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { sendPushToUser, pushClient, pushConfigured, type PushPayload } from "@/lib/push/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/hooks/push/{secret} — the endpoint Postgres calls.
 *
 * Reached from the `AFTER INSERT` trigger on `notifications` via `pg_net` (migration 0025), so:
 *  - it is unauthenticated (covered by the `/api/hooks/` allowlist in `src/proxy.ts`) and
 *    proves itself with `PUSH_HOOK_SECRET`, compared in constant time;
 *  - it holds **no service-role key**. There is no user session, so the two privileged reads it
 *    needs happen inside SECURITY DEFINER functions that check the same shared secret:
 *    `push_notification()` here and `push_targets()` inside `sendPushToUser()`. The anon key
 *    can do nothing else;
 *  - it ALWAYS returns 200 with a reason. The in-app notification has already been written and
 *    is the source of truth; a non-200 here would only make pg_net noisy.
 *
 * Body: `{ notification_id }` (preferred — the row is re-read server-side) or an explicit
 * `{ user_id, title, body, link, tag, kind, org_id }` for callers that have no row.
 */

function secretOk(candidate: string | null): boolean {
  const expected = process.env.PUSH_HOOK_SECRET || "";
  if (!expected || !candidate) return false;
  // Hash first so the comparison length never leaks and timingSafeEqual gets equal buffers.
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

type Body = {
  notification_id?: string;
  user_id?: string;
  title?: string;
  body?: string | null;
  link?: string | null;
  tag?: string | null;
  kind?: string | null;
  org_id?: string | null;
};

type NotificationRow = {
  id: string;
  user_id: string;
  org_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
};

/** A ring/knock notification carries `/live/<room>?invite=<id>` — turn it into a call payload. */
function callBits(row: Pick<NotificationRow, "entity_type" | "entity_id" | "link">) {
  if (row.entity_type !== "live_room" || !row.link) return null;
  const q = row.link.indexOf("?");
  if (q < 0) return null;
  const invite = new URLSearchParams(row.link.slice(q + 1)).get("invite");
  if (!invite) return null;
  return { roomId: row.entity_id, inviteId: invite };
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  let pathSecret = token;
  try {
    pathSecret = decodeURIComponent(token);
  } catch {
    pathSecret = token; // malformed percent-encoding — fall back to the raw segment
  }
  const header = req.headers.get("x-ghl-push-secret");
  if (!secretOk(header) && !secretOk(pathSecret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!pushConfigured()) return NextResponse.json({ ok: false, skipped: "not-configured" });

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" });
  }

  const secret = process.env.PUSH_HOOK_SECRET || "";
  const db = pushClient();
  if (!db) return NextResponse.json({ ok: false, skipped: "not-configured" });

  let userId: string | null = null;
  let orgId: string | null = null;
  let payload: PushPayload | null = null;

  if (body.notification_id) {
    if (!/^[0-9a-f-]{36}$/i.test(body.notification_id)) return NextResponse.json({ ok: false, error: "bad notification_id" });
    // SECURITY DEFINER, gated on the same shared secret — no service key, no session needed.
    const { data, error } = await db.rpc("push_notification", { p_secret: secret, p_id: body.notification_id });
    if (error) return NextResponse.json({ ok: false, error: error.message });
    const row = (data ?? null) as NotificationRow | null;
    if (!row) return NextResponse.json({ ok: false, skipped: "notification-not-found" });
    userId = row.user_id;
    orgId = row.org_id;
    const call = callBits(row);
    payload = {
      title: row.title,
      body: row.body,
      link: row.link,
      kind: row.kind,
      tag: call ? `call:${call.roomId}` : `notif:${row.id}`,
      notificationId: row.id,
      orgId: row.org_id,
      call: !!call,
      roomId: call?.roomId ?? null,
      inviteId: call?.inviteId ?? null,
    };
  } else if (body.user_id && body.title) {
    if (!/^[0-9a-f-]{36}$/i.test(body.user_id)) return NextResponse.json({ ok: false, error: "bad user_id" });
    userId = body.user_id;
    orgId = body.org_id ?? null;
    payload = {
      title: String(body.title).slice(0, 120),
      body: body.body ? String(body.body).slice(0, 400) : null,
      link: body.link ?? null,
      kind: body.kind ?? "information",
      tag: body.tag ?? null,
      orgId,
    };
  }

  if (!userId || !payload) return NextResponse.json({ ok: false, error: "notification_id or user_id + title required" });

  // Quiet hours and Do-not-disturb (with the documented exception for critical / action_required)
  // are applied by `push_targets()` inside the same round trip that fetches the devices.
  const result = await sendPushToUser(userId, payload, { db, orgId });
  return NextResponse.json({ ...result, ok: true });
}

export function GET() {
  return NextResponse.json({ ok: true, hint: "POST { notification_id } with the push hook secret" });
}
