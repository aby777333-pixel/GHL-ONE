import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { TaskListView, type TaskLite } from "@/components/tasks/TaskListView";

export const metadata = { title: "Tasks" };

type Search = { status?: string; priority?: string; assignee?: string; project?: string; q?: string; view?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { profile } = await getSession();
  const supabase = await createClient();

  const [{ data: tasks }, { data: subtasks }, { data: projects }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id,title,status,priority,due_date,start_date,assignee_id,owner_id,waiting_on,waiting_on_user_id,project_id,department_id,tags,created_at,parent_id,milestone_id,project:projects(id,name)")
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(600),
    supabase.from("tasks").select("parent_id,status").not("parent_id", "is", null).limit(2000),
    supabase.from("projects").select("id,name").eq("archived", false).order("name"),
  ]);

  const counts = new Map<string, { total: number; done: number }>();
  for (const s of subtasks || []) {
    if (!s.parent_id) continue;
    const c = counts.get(s.parent_id) || { total: 0, done: 0 };
    c.total++;
    if (s.status === "done") c.done++;
    counts.set(s.parent_id, c);
  }
  const list: TaskLite[] = (tasks || []).map((t) => ({ ...t, subtask_count: counts.get(t.id)?.total, done_count: counts.get(t.id)?.done }));
  const open = list.filter((t) => t.status !== "done" && t.status !== "cancelled").length;
  const mine = list.filter((t) => t.assignee_id === profile.id && t.status !== "done" && t.status !== "cancelled").length;

  return (
    <div className="page">
      <PageHeader eyebrow="Work" title="Tasks" subtitle={`${open} open · ${mine} assigned to you`} />
      <TaskListView
        tasks={list}
        projects={projects || []}
        initialFilters={{ status: sp.status, priority: sp.priority, assignee: sp.assignee, project: sp.project, q: sp.q }}
        initialView={sp.view === "board" ? "board" : "list"}
        syncUrl
        emptyHint="Every task has one Responsible person and one Accountable owner. Create the first one to get moving."
      />
    </div>
  );
}
