import type { Database } from "@/lib/database.types";
import type { Tables } from "@/lib/utils";

/* ------------------------------------------------------------------ types */
export type AttendanceEvent = Tables<"attendance_events">;
export type AttendanceDay = Tables<"attendance_days">;
export type Shift = Tables<"shifts">;
export type ShiftAssignment = Tables<"shift_assignments">;
export type ShiftSwap = Tables<"shift_swaps">;
export type TimeEntry = Tables<"time_entries">;
export type BoardRow = Database["public"]["Functions"]["attendance_board"]["Returns"][number];
export type RosterRow = Database["public"]["Functions"]["roster"]["Returns"][number];

export type ClockKind = "clock_in" | "clock_out" | "break_start" | "break_end";
export type ClockMode = "office" | "remote" | "field" | "client_visit" | "travel" | "training" | "half_day";
export type ClockPhase = "out" | "in" | "break" | "done";

export const MODES: { key: ClockMode; label: string; hint: string }[] = [
  { key: "office", label: "Office", hint: "At the workplace" },
  { key: "remote", label: "Remote", hint: "Working from home or elsewhere" },
  { key: "field", label: "Field", hint: "Site visit, outdoor work" },
  { key: "client_visit", label: "Client visit", hint: "At a client's premises" },
  { key: "travel", label: "Travel", hint: "On the move for work" },
  { key: "training", label: "Training", hint: "Course, workshop or induction" },
  { key: "half_day", label: "Half day", hint: "Working a half day today" },
];
export const MODE_LABEL: Record<string, string> = Object.fromEntries(MODES.map((m) => [m.key, m.label]));

/** Day status → label + tone (attendance_days.status / attendance_board.att_status). */
export const ATT_STATUS_LABEL: Record<string, string> = {
  present: "Present", late: "Late", half_day: "Half day", remote: "Remote", field: "Field", travel: "Travel", training: "Training",
  leave: "On leave", absent: "Absent", not_yet: "Not yet in", wfh: "Remote", holiday: "Holiday", weekend: "Weekend",
};
export const ATT_STATUS_TONE: Record<string, string> = {
  present: "tone-success", late: "tone-warn", half_day: "tone-info", remote: "tone-info", field: "tone-violet", travel: "tone-violet", training: "tone-violet",
  leave: "tone-orange", absent: "tone-danger", not_yet: "tone-muted", wfh: "tone-info", holiday: "tone-muted", weekend: "tone-muted",
};
/** Solid colour for heatmap cells / avatars rings. */
export const ATT_STATUS_COLOR: Record<string, string> = {
  present: "var(--success)", late: "var(--warn)", half_day: "var(--info)", remote: "var(--info)", field: "var(--violet)", travel: "var(--violet)", training: "var(--violet)",
  leave: "var(--orange)", absent: "var(--danger)", not_yet: "var(--line-strong)", wfh: "var(--info)",
};
export const CORRECTABLE_STATUSES = ["present", "late", "half_day", "remote", "field", "travel", "training", "leave", "absent"] as const;

/* --------------------------------------------------------------- IST time */
const IST = "Asia/Kolkata";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false });

/** YYYY-MM-DD for a moment, in India Standard Time (what the database uses for day boundaries). */
export function istDay(d: Date | string | number = new Date()) {
  return dayFmt.format(typeof d === "string" || typeof d === "number" ? new Date(d) : d);
}
/** HH:MM in IST. */
export function istTime(d?: Date | string | null) {
  if (!d) return "—";
  return timeFmt.format(typeof d === "string" ? new Date(d) : d);
}
/** ISO timestamps bounding an IST calendar day. */
export function istDayRange(day: string) {
  return { from: `${day}T00:00:00+05:30`, to: `${day}T23:59:59.999+05:30` };
}
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function isoWeekday(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}
/** Monday of the ISO week containing `day`. */
export function weekStart(day: string) {
  return addDays(day, 1 - isoWeekday(day));
}
export function monthBounds(year: number, month0: number) {
  const first = `${year}-${String(month0 + 1).padStart(2, "0")}-01`;
  const lastDate = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return { from: first, to: `${year}-${String(month0 + 1).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`, days: lastDate };
}
export function dayLabel(day: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...opts }).format(new Date(Date.UTC(y, m - 1, d)));
}

/* ---------------------------------------------------------------- numbers */
export function fmtMinutes(min: number | null | undefined) {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r ? `${h}h ${String(r).padStart(2, "0")}m` : `${h}h`;
}
export function fmtHours(min: number | null | undefined) {
  return ((min || 0) / 60).toFixed(1);
}
export function hhmm(t?: string | null) {
  return t ? t.slice(0, 5) : "";
}

/* ------------------------------------------------------------ clock state */
export type ClockSnapshot = {
  phase: ClockPhase;
  mode: ClockMode | null;
  since: string | null;        // ISO of the event that started the current phase
  firstIn: string | null;
  lastOut: string | null;
  /** worked minutes excluding breaks, as of `at` */
  minutes: number;
  breakMinutes: number;
  events: AttendanceEvent[];
};

/** Fold today's events into a live snapshot (`at` = now). */
export function deriveClock(events: AttendanceEvent[], at: number): ClockSnapshot {
  const sorted = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  let phase: ClockPhase = "out";
  let mode: ClockMode | null = null;
  let since: string | null = null;
  let firstIn: string | null = null;
  let lastOut: string | null = null;
  let openIn: number | null = null;
  let openBreak: number | null = null;
  let worked = 0;
  let brk = 0;
  for (const e of sorted) {
    const t = new Date(e.occurred_at).getTime();
    if (e.kind === "clock_in") {
      if (!firstIn) firstIn = e.occurred_at;
      mode = e.mode as ClockMode;
      openIn = t;
      phase = "in";
      since = e.occurred_at;
    } else if (e.kind === "clock_out") {
      if (openIn != null) worked += (t - openIn) / 60000;
      if (openBreak != null) { brk += (t - openBreak) / 60000; openBreak = null; }
      openIn = null;
      lastOut = e.occurred_at;
      phase = "done";
      since = e.occurred_at;
    } else if (e.kind === "break_start") {
      openBreak = t;
      phase = "break";
      since = e.occurred_at;
    } else if (e.kind === "break_end") {
      if (openBreak != null) { brk += (t - openBreak) / 60000; openBreak = null; }
      phase = "in";
      since = e.occurred_at;
    }
  }
  if (openIn != null) worked += (at - openIn) / 60000;
  if (openBreak != null) brk += (at - openBreak) / 60000;
  return { phase, mode, since, firstIn, lastOut, minutes: Math.max(0, worked - brk), breakMinutes: brk, events: sorted };
}

/* --------------------------------------------------------------------- CSV */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map((c) => {
    const s = c == null ? "" : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n");
}
export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const SHARE_LOCATION_KEY = "ghl.clock.shareLocation";
