import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { pushClient } from "@/lib/push/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/hooks/account-mail/{secret} — emails a notice about somebody's OWN account (0078).
 *
 * Called by Postgres (`notification_account_mail()` via pg_net) for a notification carrying
 * `meta.email = true`: registration moved into a company, workspace activated, account approved /
 * not approved / suspended / deactivated, access to another company. Those are exactly the moments
 * the person is NOT inside GHL ONE to read the in-app notice.
 *
 * Same contract as the push hook beside it: authenticated by PUSH_HOOK_SECRET (constant time), no
 * service-role key, and the privileged read happens inside `account_mail(secret, id)`, which returns
 * the recipient only for an email-flagged notification that has not been emailed yet. Always 200 —
 * the notification row is already the record; email is a second delivery channel.
 */

function secretOk(candidate: string | null): boolean {
  const expected = process.env.PUSH_HOOK_SECRET || "";
  if (!expected || !candidate) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Mail = { to: string | null; name: string | null; company: string | null; title: string; body: string | null; link: string | null };

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  let pathSecret = token;
  try {
    pathSecret = decodeURIComponent(token);
  } catch {
    pathSecret = token;
  }
  if (!secretOk(req.headers.get("x-ghl-push-secret")) && !secretOk(pathSecret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let id = "";
  try {
    id = String(((await req.json()) as { notification_id?: string }).notification_id || "");
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" });
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "bad notification_id" });

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ACCOUNT_FROM_EMAIL || process.env.CONNECT_FROM_EMAIL || "";
  if (!apiKey || !from) return NextResponse.json({ ok: false, skipped: "email-not-configured" });

  const db = pushClient();
  if (!db) return NextResponse.json({ ok: false, skipped: "not-configured" });
  const { data, error } = await db.rpc("account_mail", { p_secret: process.env.PUSH_HOOK_SECRET || "", p_id: id });
  if (error) return NextResponse.json({ ok: false, error: error.message });
  const mail = (data ?? null) as Mail | null;
  if (!mail?.to) return NextResponse.json({ ok: false, skipped: "nothing-to-send" });

  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://ghl-one.netlify.app").replace(/\/$/, "");
  const link = mail.link && mail.link.startsWith("/") ? `${base}${mail.link}` : `${base}/`;
  const greeting = mail.name ? `Hi ${mail.name.split(/\s+/)[0]},` : "Hello,";
  const text = `${greeting}\n\n${mail.title}\n\n${mail.body || ""}\n\nOpen GHL ONE: ${link}\n\n— GHL ONE${mail.company ? ` · ${mail.company}` : ""}`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#0f172a;line-height:1.55;max-width:560px">
<p>${esc(greeting)}</p>
<p style="font-size:17px;font-weight:600;margin:16px 0 8px">${esc(mail.title)}</p>
${mail.body ? `<p>${esc(mail.body)}</p>` : ""}
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Open GHL ONE</a></p>
<p style="font-size:12px;color:#64748b">GHL ONE${mail.company ? ` · ${esc(mail.company)}` : ""}. You are receiving this because it concerns your own account.</p>
</div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.title, text, html }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return NextResponse.json({ ok: false, error: `Provider error ${res.status}: ${json.message || "unknown"}` });
    return NextResponse.json({ ok: true, id: json.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "network error" });
  }
}
