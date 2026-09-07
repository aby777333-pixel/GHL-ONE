import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ApprovalDetail } from "@/components/approvals/ApprovalDetail";

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  await getSession();
  const { id } = await params;
  const supabase = await createClient();
  const { data: approval } = await supabase.from("approvals").select("*").eq("id", id).maybeSingle();
  if (!approval) notFound();

  const [{ data: events }, { data: task }, { data: project }, { data: file }] = await Promise.all([
    supabase.from("approval_events").select("*").eq("approval_id", id).order("created_at", { ascending: true }),
    approval.task_id ? supabase.from("tasks").select("id,title,status,priority,due_date,assignee_id").eq("id", approval.task_id).maybeSingle() : Promise.resolve({ data: null }),
    approval.project_id ? supabase.from("projects").select("id,name,status").eq("id", approval.project_id).maybeSingle() : Promise.resolve({ data: null }),
    approval.file_id ? supabase.from("files").select("id,name,folder,current_version").eq("id", approval.file_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return <ApprovalDetail approval={approval} events={events || []} task={task} project={project} file={file} />;
}
