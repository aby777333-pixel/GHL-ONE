import type { ProjectSummary } from "@/components/projects/ProjectCard";

type ProjectBase = Omit<ProjectSummary, "total_tasks" | "done_tasks" | "overdue_tasks" | "member_ids">;
type TaskBit = { project_id: string | null; status: string; due_date: string | null };
type MemberBit = { project_id: string; user_id: string };

/** Progress / overdue / member roll-up for project lists (server-side, computed once per request). */
export function summariseProjects(projects: ProjectBase[], tasks: TaskBit[], members: MemberBit[], now: number = Date.now()): ProjectSummary[] {
  const agg = new Map<string, { total: number; done: number; overdue: number; members: string[] }>();
  for (const p of projects) agg.set(p.id, { total: 0, done: 0, overdue: 0, members: [] });
  for (const t of tasks) {
    const a = t.project_id ? agg.get(t.project_id) : undefined;
    if (!a || t.status === "cancelled") continue;
    a.total++;
    if (t.status === "done") a.done++;
    else if (t.due_date && new Date(t.due_date).getTime() < now) a.overdue++;
  }
  for (const m of members) agg.get(m.project_id)?.members.push(m.user_id);
  return projects.map((p) => {
    const a = agg.get(p.id)!;
    return { ...p, total_tasks: a.total, done_tasks: a.done, overdue_tasks: a.overdue, member_ids: a.members };
  });
}
