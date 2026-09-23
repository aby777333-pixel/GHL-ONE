import { differenceInMinutes } from "date-fns";
import type { Meeting } from "@/lib/utils";

export const DURATIONS = [30, 45, 60, 90] as const;

export function durationMinutes(m: Pick<Meeting, "starts_at" | "ends_at">) {
  if (!m.ends_at) return null;
  return differenceInMinutes(new Date(m.ends_at), new Date(m.starts_at));
}

export function durationLabel(mins: number | null) {
  if (!mins) return "";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** Local date (yyyy-mm-dd) + time (HH:mm) → ISO UTC. */
export function localToIso(date: string, time: string) {
  return new Date(`${date}T${time || "00:00"}`).toISOString();
}

export function addMinutesIso(iso: string, mins: number) {
  return new Date(new Date(iso).getTime() + mins * 60_000).toISOString();
}

const URL_RE = /https?:\/\/[^\s<>()"']+/g;

/** Pull URLs out of free text (agenda / notes) for the Documents section. */
export function extractLinks(...texts: (string | null | undefined)[]) {
  const out = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.match(URL_RE) || []) out.add(m.replace(/[.,;:]+$/, ""));
  }
  return [...out];
}

export function isPastMeeting(m: Pick<Meeting, "starts_at" | "ends_at">, now: number) {
  const end = m.ends_at ? Date.parse(m.ends_at) : Date.parse(m.starts_at) + 60 * 60_000;
  return end < now;
}

export type MeetingPhase = "upcoming" | "live" | "ended" | "cancelled";

/*
  Where a meeting stands right now. The list used to split on the clock alone, so a cancelled meeting
  stayed under Upcoming, and a meeting whose host had already ended the GHL Live room still offered Join.
  Cancelled and a room that has ended win over the calendar; otherwise the scheduled window decides, and a
  room that is live counts as live whatever the clock says (people start early).
*/
export function meetingPhase(m: Pick<Meeting, "starts_at" | "ends_at" | "cancelled_at"> & { live_status?: string | null }, now: number): MeetingPhase {
  if (m.cancelled_at) return "cancelled";
  if (m.live_status === "ended" || m.live_status === "archived") return "ended";
  if (m.live_status === "live") return "live";
  if (isPastMeeting(m, now)) return "ended";
  return Date.parse(m.starts_at) <= now ? "live" : "upcoming";
}

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Today's local date as yyyy-mm-dd. */
export function todayLocal(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Next round half hour as HH:mm. */
export function nextSlot(d = new Date()) {
  const m = d.getMinutes() < 30 ? 30 : 60;
  const t = new Date(d);
  t.setMinutes(m, 0, 0);
  return `${pad(t.getHours() % 24)}:${pad(t.getMinutes())}`;
}
