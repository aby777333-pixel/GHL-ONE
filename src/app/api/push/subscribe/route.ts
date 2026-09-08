import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = {
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  user_agent?: string | null;
  /** Endpoint the browser rotated away from (sent by the worker's `pushsubscriptionchange`). */
  replaces?: string | null;
};

/**
 * POST /api/push/subscribe — register (or refresh) this browser as a push target for the
 * signed-in person, in the workspace they are currently in.
 *
 * Called twice in the life of a device: once from the explicit opt-in click, and then silently
 * on every app load so `org_id` follows a workspace switch and `last_used_at` stays honest.
 * A device therefore belongs to exactly one tenant at a time — company B never rings a device
 * that is currently signed into company A.
 *
 * The write goes through `save_push_subscription()` (0025) rather than a plain upsert: a shared
 * browser can already hold a row for a *different* person on the same endpoint, and only a
 * SECURITY DEFINER function can retire that row without opening up the table.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  if (!endpoint || !/^https:\/\//i.test(endpoint) || endpoint.length > 2000) {
    return NextResponse.json({ error: "A valid push endpoint is required" }, { status: 400 });
  }
  if (!p256dh || !auth) return NextResponse.json({ error: "Subscription keys are missing" }, { status: 400 });

  // `push_subscriptions` + its RPCs ship in migration 0025 and are not in the generated types yet.
  const db = supabase as unknown as SupabaseClient;

  if (body.replaces && body.replaces !== endpoint) {
    await db.rpc("remove_push_subscription", { p_endpoint: body.replaces });
  }

  const { error } = await db.rpc("save_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: (body.user_agent || req.headers.get("user-agent") || "").slice(0, 400) || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
