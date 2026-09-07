import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { TaskDetail, type TaskDetailData } from "@/components/tasks/TaskDetail";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getSession();
  const supabase = await createClient();

  const { data: task } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (!task) notFound();

  const [
    { data: project },
    { data: subtasks },
    { data: checklist },
    { data: comments },
    { data: history },
    { data: collaborators },
    { data: depsOut },
    { data: depsIn },
    { data: approvals },
    { data: files },
    { data: sourceMessage },
    { data: sourceMeeting },
    { data: parent },
    { data: handoffs },
  ] = await Promise.all([
    task.project_id ? supabase.from("projects").select("id,name,department_id").eq("id", task.project_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase
      .from("tasks")
      .select("id,title,status,priority,due_date,start_date,assignee_id,owner_id,waiting_on,waiting_on_user_id,project_id,department_id,tags,created_at,parent_id,milestone_id")
      .eq("parent_id", id)
      .order("position")
      .order("created_at"),
    supabase.from("task_checklist").select("*").eq("task_id", id).order("position"),
    supabase.from("task_comments").select("*, author:profiles(id,full_name,avatar_url)").eq("task_id", id).order("created_at"),
    supabase.from("task_history").select("*").eq("task_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("task_collaborators").select("user_id").eq("task_id", id),
    supabase.from("task_dependencies").select("depends_on_id").eq("task_id", id),
    supabase.from("task_dependencies").select("task_id").eq("depends_on_id", id),
    supabase.from("approvals").select("id,title,status,approver_id,created_at,type").eq("task_id", id).order("created_at", { ascending: false }),
    supabase.from("files").select("*, file_versions(id,version,storage_path,size_bytes,mime_type,created_at)").eq("task_id", id).order("updated_at", { ascending: false }),
    task.source_message_id ? supabase.from("messages").select("id,channel_id,body").eq("id", task.source_message_id).maybeSingle() : Promise.resolve({ data: null }),
    task.source_meeting_id ? supabase.from("meetings").select("id,title").eq("id", task.source_meeting_id).maybeSingle() : Promise.resolve({ data: null }),
    task.parent_id ? supabase.from("tasks").select("id,title").eq("id", task.parent_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("handoffs").select("*").eq("task_id", id).order("created_at", { ascending: false }),
  ]);

  const depIds = [...(depsOut || []).map((d) => d.depends_on_id), ...(depsIn || []).map((d) => d.task_id)];
  const { data: depTasks } = depIds.length
    ? await supabase.from("tasks").select("id,title,status,assignee_id").in("id", depIds)
    : { data: [] as { id: string; title: string; status: TaskDetailData["task"]["status"]; assignee_id: string | null }[] };
  const byId = new Map((depTasks || []).map((t) => [t.id, t]));

  const data: TaskDetailData = {
    task,
    project: project || null,
    parent: parent || null,
    subtasks: subtasks || [],
    checklist: checklist || [],
    comments: (comments || []).map((c) => ({ ...c, author: c.author || null })),
    history: history || [],
    collaborators: (collaborators || []).map((c) => c.user_id),
    blockedBy: (depsOut || []).map((d) => byId.get(d.depends_on_id)).filter(Boolean) as TaskDetailData["blockedBy"],
    blocks: (depsIn || []).map((d) => byId.get(d.task_id)).filter(Boolean) as TaskDetailData["blocks"],
    approvals: approvals || [],
    files: (files || []).map((f) => ({ ...f, file_versions: f.file_versions || [] })),
    sourceMessage: sourceMessage || null,
    sourceMeeting: sourceMeeting || null,
    handoffs: (handoffs || []) as TaskDetailData["handoffs"],
  };

  return <TaskDetail data={data} />;
}
