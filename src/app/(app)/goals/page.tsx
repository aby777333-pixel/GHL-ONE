import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { GoalsClient, type GoalsData } from "@/components/goals/GoalsClient";
import type { GoalTaskLink } from "@/components/goals/lib";

export const metadata = { title: "Goals" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function GoalsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [sp] = await Promise.all([searchParams, getSession()]);
  const supabase = await createClient();
  const [{ data: goals }, { data: links }, { data: teams }, { data: hr }] = await Promise.all([
    supabase.from("goals").select("*").order("created_at", { ascending: false }),
    supabase.from("goal_tasks").select("goal_id,task_id,task:tasks!goal_tasks_task_id_fkey(id,title,status,assignee_id,due_date)"),
    supabase.from("teams").select("id,name,department_id").order("name"),
    supabase.rpc("is_hr"),
  ]);
  const data: GoalsData = {
    goals: goals || [],
    links: ((links || []) as unknown as GoalTaskLink[]).map((l) => ({ goal_id: l.goal_id, task_id: l.task_id, task: l.task || null })),
    teams: teams || [],
    isHr: !!hr,
    openNew: one(sp.new) === "1",
    openGoal: one(sp.goal),
    initialFilter: { period: one(sp.period), level: one(sp.level), department: one(sp.department), scope: one(sp.scope) === "mine" ? "mine" : one(sp.scope) === "team" ? "team" : "all" },
  };
  return <GoalsClient data={data} />;
}
