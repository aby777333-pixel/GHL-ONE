import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/hooks/email/{token} — inbound email for one shared inbox (token = `inboxes.webhook_token`).
 * Accepts the generic shape `{from|from_email, from_name, to[], cc[], subject, text|body, html, message_id, in_reply_to, attachments[]}`
 * — what Resend / Gmail / Outlook bridges post after normalisation. Threading, contact matching and rules happen in `ingest_email()`.
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
  const { data, error } = await supabase.rpc("ingest_email", { p_token: token, p_payload: payload as never });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const res = data as { error?: string; ok?: boolean };
  if (res?.error) return NextResponse.json(res, { status: res.error === "unknown token" ? 404 : 400 });
  return NextResponse.json(res);
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST inbound email JSON to this URL: {from, from_name, subject, text, html, message_id, in_reply_to}" });
}
