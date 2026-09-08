import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/decline { invite_id } — the "Decline" button on a ring notification.
 *
 * Called by the service worker, so it must work without a page: it is same-origin and the
 * session cookie rides along. `respond_live_invite` already checks that the caller is the
 * person being rung (or the caller), so there is nothing to authorise here beyond a session.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let inviteId: string | null = null;
  try {
    const body = (await req.json()) as { invite_id?: string };
    inviteId = typeof body.invite_id === "string" ? body.invite_id : null;
  } catch {
    inviteId = null;
  }
  if (!inviteId || !/^[0-9a-f-]{36}$/i.test(inviteId)) {
    return NextResponse.json({ error: "invite_id required" }, { status: 400 });
  }

  const { error } = await supabase.rpc("respond_live_invite", { p_id: inviteId, p_status: "declined" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
