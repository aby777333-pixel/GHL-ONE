import type { Tables, TaskStatus } from "@/lib/utils";

export type Goal = Tables<"goals">;
export type GoalTaskLink = { goal_id: string; task_id: string; task: { id: string; title: string; status: TaskStatus; assignee_id: string | null; due_date: string | null } | null };

export const GOAL_LEVELS = ["company", "department", "team", "employee"] as const;
export type GoalLevel = (typeof GOAL_LEVELS)[number];
export const LEVEL_LABEL: Record<string, string> = { company: "Company", department: "Department", team: "Team", employee: "Individual" };
export const LEVEL_TONE: Record<string, string> = { company: "tone-brand", department: "tone-violet", team: "tone-info", employee: "tone-neutral" };
export const LEVEL_RANK: Record<string, number> = { company: 0, department: 1, team: 2, employee: 3 };

export const GOAL_STATUSES = ["active", "done", "dropped"] as const;
export const STATUS_LABEL: Record<string, string> = { active: "Active", done: "Achieved", dropped: "Dropped" };
export const STATUS_TONE: Record<string, string> = { active: "tone-info", done: "tone-success", dropped: "tone-muted" };

/** Progress shown for a goal: manual value wins; otherwise derived from linked tasks; achieved = 100. */
export function goalProgress(g: Pick<Goal, "progress" | "status">, links: GoalTaskLink[]) {
  if (g.status === "done") return 100;
  if (g.progress > 0) return Math.min(100, g.progress);
  const tasks = links.filter((l) => l.task);
  if (tasks.length === 0) return 0;
  const done = tasks.filter((l) => l.task!.status === "done").length;
  return Math.round((done / tasks.length) * 100);
}

export function progressTone(pct: number, g: Pick<Goal, "status" | "due_on">) {
  if (g.status === "done") return "var(--success)";
  if (g.status === "dropped") return "var(--line-strong)";
  if (g.due_on && new Date(g.due_on) < new Date() && pct < 100) return "var(--danger)";
  if (pct >= 70) return "var(--success)";
  if (pct >= 30) return "var(--brand)";
  return "var(--warn)";
}

/** Suggest periods around today: this quarter, next quarter, this year. */
export function suggestPeriods(now = new Date()) {
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  const out = [`Q${q} ${y}`];
  out.push(q === 4 ? `Q1 ${y + 1}` : `Q${q + 1} ${y}`);
  out.push(`H${now.getMonth() < 6 ? 1 : 2} ${y}`);
  out.push(`FY ${y}-${String(y + 1).slice(2)}`);
  out.push(`${y}`);
  return [...new Set(out)];
}
