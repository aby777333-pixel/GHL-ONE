import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import type { Enums, Tables } from "@/lib/utils";

export type EventKind = Enums<"event_kind">;

export const KINDS: EventKind[] = ["meeting", "deadline", "milestone", "campaign", "event", "release", "interview", "holiday", "leave", "publishing", "client_meeting", "compliance"];

export const KIND_LABEL: Record<EventKind, string> = {
  meeting: "Meetings",
  deadline: "Deadlines",
  milestone: "Milestones",
  campaign: "Campaigns",
  event: "Events",
  release: "Releases",
  interview: "Interviews",
  holiday: "Holidays",
  leave: "Leave",
  publishing: "Publishing",
  client_meeting: "Client meetings",
  compliance: "Compliance",
};

export const KIND_SINGULAR: Record<EventKind, string> = {
  meeting: "Meeting",
  deadline: "Deadline",
  milestone: "Milestone",
  campaign: "Campaign",
  event: "Event",
  release: "Release",
  interview: "Interview",
  holiday: "Holiday",
  leave: "Leave",
  publishing: "Publishing",
  client_meeting: "Client meeting",
  compliance: "Compliance",
};

/** One colour per kind, all design tokens so dark mode just works. */
export const KIND_COLOR: Record<EventKind, string> = {
  meeting: "var(--info)",
  deadline: "var(--danger)",
  milestone: "var(--violet)",
  campaign: "var(--orange)",
  event: "var(--brand-2)",
  release: "var(--success)",
  interview: "var(--accent)",
  holiday: "var(--success)",
  leave: "var(--warn)",
  publishing: "var(--violet)",
  client_meeting: "var(--info)",
  compliance: "var(--neutral)",
};

export type CalItem = {
  id: string;
  kind: EventKind;
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at?: string | null;
  all_day: boolean;
  project_id?: string | null;
  meeting_id?: string | null;
  task_id?: string | null;
  user_id?: string | null;
  created_by?: string | null;
  source: "event" | "task" | "leave";
  /** raw row id for deletes */
  row_id: string;
};

export type LeaveRow = Tables<"leaves">;

export function fromEvent(e: Tables<"calendar_events">): CalItem {
  return {
    id: `ev:${e.id}`,
    row_id: e.id,
    kind: e.kind,
    title: e.title,
    description: e.description,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    all_day: e.all_day,
    project_id: e.project_id,
    meeting_id: e.meeting_id,
    task_id: e.task_id,
    user_id: e.user_id,
    created_by: e.created_by,
    source: "event",
  };
}

export function fromTask(t: { id: string; title: string; due_date: string | null; project_id: string | null; status: string; priority: string }): CalItem {
  return {
    id: `task:${t.id}`,
    row_id: t.id,
    kind: "deadline",
    title: t.title,
    description: `Task due · ${t.priority} priority · ${t.status.replace(/_/g, " ")}`,
    starts_at: t.due_date!,
    ends_at: null,
    all_day: false,
    project_id: t.project_id,
    task_id: t.id,
    source: "task",
  };
}

export function fromLeave(l: LeaveRow, name: string): CalItem {
  return {
    id: `leave:${l.id}`,
    row_id: l.id,
    kind: "leave",
    title: `${name} · ${l.kind === "leave" ? "on leave" : l.kind.replace(/_/g, " ")}`,
    description: l.note,
    starts_at: `${l.starts_on}T00:00:00`,
    ends_at: `${l.ends_on}T23:59:59`,
    all_day: true,
    user_id: l.user_id,
    source: "leave",
  };
}

/** Does the item occur on this local calendar day? */
export function occursOn(item: CalItem, day: Date) {
  const s = startOfDay(new Date(item.starts_at));
  const e = item.ends_at ? startOfDay(new Date(item.ends_at)) : s;
  const d = startOfDay(day);
  return d >= s && d <= e;
}

export function itemsForDay(items: CalItem[], day: Date) {
  return items.filter((i) => occursOn(i, day)).sort(sortItems);
}

export function sortItems(a: CalItem, b: CalItem) {
  if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
  return a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title);
}

/** 6-row month grid (Mon–Sun). */
export function monthGrid(cursor: Date) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  while (days.length < 42) days.push(addDays(days[days.length - 1]!, 1));
  return days;
}

export function weekDays(cursor: Date) {
  const start = startOfWeek(cursor, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Window we keep loaded around the cursor: previous month → +2 months. */
export function windowFor(cursor: Date) {
  return { from: startOfMonth(addMonths(cursor, -1)), to: endOfMonth(addMonths(cursor, 2)) };
}

export function inWindow(d: Date, w: { from: Date; to: Date }) {
  return d >= w.from && d <= w.to;
}

export const isSame = isSameDay;
export const fmt = format;

export function timeLabel(item: CalItem) {
  if (item.all_day) return "All day";
  const s = format(new Date(item.starts_at), "HH:mm");
  return item.ends_at && !item.all_day ? `${s}–${format(new Date(item.ends_at), "HH:mm")}` : s;
}

export function entityLink(item: CalItem) {
  if (item.meeting_id) return { href: `/meetings/${item.meeting_id}`, label: "Open meeting" };
  if (item.task_id) return { href: `/tasks/${item.task_id}`, label: "Open task" };
  if (item.project_id) return { href: `/projects/${item.project_id}`, label: "Open project" };
  if (item.source === "leave" && item.user_id) return { href: `/people/${item.user_id}`, label: "View person" };
  return null;
}

export const LEAVE_KINDS = [
  { value: "leave", label: "Annual leave" },
  { value: "sick", label: "Sick leave" },
  { value: "casual", label: "Casual leave" },
  { value: "wfh", label: "Work from home" },
  { value: "half_day", label: "Half day" },
  { value: "comp_off", label: "Comp off" },
];
