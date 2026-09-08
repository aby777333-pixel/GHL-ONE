import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/unsubscribe { endpoint? } — stop pushing to this device.
 * Omitting `endpoint` removes every device for the signed-in person ("turn it off everywhere").
 * Always answers `{ ok: true }` on a well-formed request: turning something off must never
 * leave the user staring at an error.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let endpoint: string | null = null;
  try {
    const body = (await req.json()) as { endpoint?: string | null };
    endpoint = typeof body.endpoint === "string" && body.endpoint.length <= 2000 ? body.endpoint : null;
  } catch {
    endpoint = null;
  }

  // `push_subscriptions` ships in migration 0025 and is not in the generated types yet.
  const db = supabase as unknown as SupabaseClient;

  const q = db.from("push_subscriptions").delete().eq("user_id", user.id);
  const { error } = endpoint ? await q.eq("endpoint", endpoint) : await q;
  if (error) return NextResponse.json({ ok: true, warning: error.message });

  return NextResponse.json({ ok: true });
}
