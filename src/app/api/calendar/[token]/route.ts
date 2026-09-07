import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET /api/calendar/{token}.ics — personal iCalendar feed (subscribe from Google Calendar / Outlook / Apple). */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token: raw } = await ctx.params;
  const token = raw.replace(/\.ics$/i, "");
  if (!/^[a-f0-9]{48}$/.test(token)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calendar_feed", { p_token: token });
  if (error) return new NextResponse("Feed error", { status: 500 });
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://ghl-one.netlify.app";
  const esc = (s: string) => (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const stamp = (d: string) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const day = (d: string) => new Date(d).toISOString().slice(0, 10).replace(/-/g, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GHL India Ventures//GHL ONE//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:GHL ONE", "X-WR-TIMEZONE:Asia/Kolkata"];
  for (const e of data || []) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@ghl-one`, `DTSTAMP:${stamp(new Date().toISOString())}`);
    if (e.all_day) lines.push(`DTSTART;VALUE=DATE:${day(e.starts_at)}`, `DTEND;VALUE=DATE:${day(e.ends_at)}`);
    else lines.push(`DTSTART:${stamp(e.starts_at)}`, `DTEND:${stamp(e.ends_at)}`);
    lines.push(`SUMMARY:${esc(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    lines.push(`URL:${base}${e.url}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new NextResponse(lines.join("\r\n"), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" } });
}
