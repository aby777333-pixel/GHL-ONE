import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DecisionDetail } from "@/components/decisions/DecisionDetail";

export default async function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  await getSession();
  const { id } = await params;
  const supabase = await createClient();
  const { data: decision } = await supabase.from("decisions").select("*").eq("id", id).maybeSingle();
  if (!decision) notFound();

  const [{ data: project }, { data: meeting }, { data: tasks }] = await Promise.all([
    decision.project_id ? supabase.from("projects").select("id,name").eq("id", decision.project_id).maybeSingle() : Promise.resolve({ data: null }),
    decision.meeting_id ? supabase.from("meetings").select("id,title,starts_at").eq("id", decision.meeting_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("tasks").select("id,title,status").ilike("description", `Follow-up from decision: ${decision.title.replace(/[%_]/g, "")}%`).limit(10),
  ]);

  return <DecisionDetail decision={decision} project={project} meeting={meeting} followUpTasks={tasks || []} />;
}
