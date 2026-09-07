import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/hooks/message/{token} — inbound WhatsApp / SMS / phone event for one inbox (token = `inboxes.webhook_token`).
 * Payload `{from|phone, name, text|body, external_id, direction?, started_at?, ended_at?, duration?, disposition?, recording_url?}`
 * — what Twilio / Exotel / WhatsApp Cloud bridges post after normalisation. Handled by `ingest_message()`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) return NextResponse.json({ error: "bad token" }, { status: 400 });
  let payload: unknown = {};
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) payload = await req.json();
    else if (ct.includes("form")) payload = Object.fromEntries((await req.formData()).entries());
    else payload = { text: await req.text() };
  } catch {
    payload = {};
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ingest_message", { p_token: token, p_payload: payload as never });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const res = data as { error?: string; ok?: boolean };
  if (res?.error) return NextResponse.json(res, { status: res.error === "unknown token" ? 404 : 400 });
  return NextResponse.json(res);
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST inbound message JSON to this URL: {from, name, text, external_id}" });
}
