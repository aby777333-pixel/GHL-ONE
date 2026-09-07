import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { fromEvent, fromLeave, fromTask, type CalItem, type LeaveRow } from "./calendarUtils";

/**
 * Everything that belongs on the unified calendar for a window:
 * calendar_events (meetings, milestones, deadlines, holidays… — RLS filtered),
 * my task deadlines, and approved leave. Used by the server page and the client refetch.
 */
export async function loadCalendarItems(supabase: SupabaseClient<Database>, from: Date, to: Date, me: string, nameOf: (id: string) => string) {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const fromDay = from.toISOString().slice(0, 10);
  const toDay = to.toISOString().slice(0, 10);
  const [{ data: events }, { data: tasks }, { data: leaves }] = await Promise.all([
    supabase.from("calendar_events").select("*").gte("starts_at", fromIso).lte("starts_at", toIso).order("starts_at").limit(1000),
    supabase.from("tasks").select("id,title,due_date,project_id,status,priority").eq("assignee_id", me).not("due_date", "is", null).gte("due_date", fromIso).lte("due_date", toIso).not("status", "in", "(done,cancelled)").limit(300),
    supabase.from("leaves").select("*").eq("status", "approved").lte("starts_on", toDay).gte("ends_on", fromDay).limit(300),
  ]);
  const items: CalItem[] = [];
  const seenMeeting = new Set<string>();
  for (const e of events || []) {
    if (e.meeting_id) {
      if (seenMeeting.has(e.meeting_id)) continue;
      seenMeeting.add(e.meeting_id);
    }
    items.push(fromEvent(e));
  }
  for (const t of tasks || []) if (t.due_date) items.push(fromTask(t));
  for (const l of (leaves || []) as LeaveRow[]) items.push(fromLeave(l, nameOf(l.user_id)));
  return items;
}
