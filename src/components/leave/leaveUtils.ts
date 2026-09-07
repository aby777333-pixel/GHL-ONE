import type { Database } from "@/lib/database.types";
import type { Tables } from "@/lib/utils";

export type LeaveType = Tables<"leave_types">;
export type LeaveRow = Tables<"leaves">;
export type Balance = Database["public"]["Functions"]["my_leave_balances"]["Returns"][number];
export type Holiday = Pick<Tables<"calendar_events">, "id" | "title" | "starts_at" | "ends_at" | "description">;
export type HandoverTask = { id: string; title: string; due_date: string | null; priority: string };

export type Impact = {
  tasks: { id: string; title: string; due_date: string | null; priority: string; project: string | null }[];
  critical: number;
  waiting_on_user: number;
  meetings: { id: string; title: string; starts_at: string }[];
  approvals: number;
  team_on_leave: { name: string; from: string; to: string }[];
};

/** `leaves.kind` (legacy text used by the calendar) derived from the leave-type code. */
export function kindForType(code: string, halfDay: boolean) {
  if (halfDay) return "half_day";
  switch (code) {
    case "SL": return "sick";
    case "CL": return "casual";
    case "WFH": return "wfh";
    case "CO": return "comp_off";
    default: return "leave";
  }
}

/** Working days (Mon–Fri) between two YYYY-MM-DD dates, inclusive; 0.5 for a half day. */
export function leaveDays(from: string, to: string, halfDay: boolean) {
  if (halfDay) return 0.5;
  if (!from || !to || to < from) return 0;
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  let n = 0;
  for (let t = a; t <= b; t += 86400000) {
    const w = new Date(t).getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

export function fmtDays(n: number | null | undefined) {
  if (n == null) return "∞";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export type StepState = "done" | "current" | "rejected" | "todo" | "skipped";
export type Step = { key: string; label: string; state: StepState; note?: string | null; at?: string | null };

/** Status timeline: submitted → manager → HR (when the type requires it) → outcome. */
export function timelineFor(l: LeaveRow, requiresHr: boolean): Step[] {
  const steps: Step[] = [{ key: "submitted", label: "Submitted", state: "done", at: l.created_at }];
  const md = l.manager_decision;
  if (md === "approved") steps.push({ key: "manager", label: "Manager approved", state: "done" });
  else if (md === "rejected" || md === "changes_requested") steps.push({ key: "manager", label: md === "rejected" ? "Manager declined" : "Changes requested", state: "rejected", note: l.decision_note, at: l.decided_at });
  else if (l.status === "pending") steps.push({ key: "manager", label: "Manager decision", state: "current" });
  else if (l.status === "approved") steps.push({ key: "manager", label: "Approved", state: "done", at: l.decided_at });
  else steps.push({ key: "manager", label: l.status === "rejected" ? "Declined" : "Changes requested", state: "rejected", note: l.decision_note, at: l.decided_at });

  if (requiresHr && md === "approved") {
    const hd = l.hr_decision;
    if (hd === "approved") steps.push({ key: "hr", label: "HR approved", state: "done", at: l.decided_at });
    else if (hd === "rejected" || hd === "changes_requested") steps.push({ key: "hr", label: hd === "rejected" ? "HR declined" : "HR asked for changes", state: "rejected", note: l.decision_note, at: l.decided_at });
    else if (l.status === "pending") steps.push({ key: "hr", label: "HR decision", state: "current" });
    else if (l.status === "approved") steps.push({ key: "hr", label: "HR approved", state: "done", at: l.decided_at });
    else steps.push({ key: "hr", label: "HR declined", state: "rejected", note: l.decision_note, at: l.decided_at });
  } else if (requiresHr) {
    steps.push({ key: "hr", label: "HR decision", state: md ? "skipped" : "todo" });
  }
  return steps;
}
