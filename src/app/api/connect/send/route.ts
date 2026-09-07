import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

/**
 * POST /api/connect/send { messageId } — hand a *queued* outbound message to the provider, then record the outcome via `mark_message_sent`.
 * Runs under the caller's RLS client: they can only send what they can see. Email → Resend (RESEND_API_KEY); other channels are integration stubs.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let body: { messageId?: string } = {};
  try {
    body = (await req.json()) as { messageId?: string };
  } catch {
    body = {};
  }
  const id = body.messageId;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "messageId required" }, { status: 400 });

  const { data: m, error } = await supabase.from("conversation_messages").select("id,conversation_id,kind,status,from_address,to_addresses,cc_addresses,subject,body,html,attachments").eq("id", id).maybeSingle();
  if (error || !m) return NextResponse.json({ error: "Message not found" }, { status: 404 });
  if (m.status !== "queued") return NextResponse.json({ ok: false, error: `Message is ${m.status.replace(/_/g, " ")} — not queued`, status: m.status }, { status: 409 });

  const fail = async (reason: string) => {
    await supabase.rpc("mark_message_sent", { p_message: id, p_ok: false, p_error: reason });
    return NextResponse.json({ ok: false, error: reason });
  };

  if (m.kind !== "email") return fail("Channel not connected yet");
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return fail("Email provider not configured (set RESEND_API_KEY)");

  let from = m.from_address || process.env.CONNECT_FROM_EMAIL || "";
  if (!from) {
    const { data: conv } = await supabase.from("conversations").select("inbox_id").eq("id", m.conversation_id).maybeSingle();
    if (conv?.inbox_id) {
      const { data: ib } = await supabase.from("inboxes").select("address,name").eq("id", conv.inbox_id).maybeSingle();
      if (ib?.address) from = ib.name ? `${ib.name} <${ib.address}>` : ib.address;
    }
  }
  if (!from) return fail("No sender address: set the inbox address or CONNECT_FROM_EMAIL");
  if (!m.to_addresses?.length) return fail("No recipient address");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: m.to_addresses,
        cc: m.cc_addresses?.length ? m.cc_addresses : undefined,
        subject: m.subject || "(no subject)",
        text: m.body || "",
        html: m.html || undefined,
        headers: { "X-GHL-Conversation": m.conversation_id },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) return fail(`Provider error ${res.status}: ${json.message || json.name || "unknown"}`);
    const { error: markErr } = await supabase.rpc("mark_message_sent", { p_message: id, p_ok: true, p_external_id: json.id ?? undefined });
    if (markErr) return NextResponse.json({ ok: true, warning: markErr.message, external_id: json.id });
    return NextResponse.json({ ok: true, external_id: json.id });
  } catch (e) {
    return fail(`Provider unreachable: ${e instanceof Error ? e.message : "network error"}`);
  }
}
