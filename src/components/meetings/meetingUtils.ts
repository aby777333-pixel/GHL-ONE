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
