import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { MeetingRoom } from "@/components/meetings/MeetingRoom";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  await getSession();
  const { id } = await params;
  const supabase = await createClient();
  const { data: meeting } = await supabase.from("meetings").select("*").eq("id", id).maybeSingle();
  if (!meeting) notFound();

  const [{ data: parts }, { data: actions }, { data: tasks }, { data: decisions }, { data: files }, { data: project }, { data: previous }] = await Promise.all([
    supabase.from("meeting_participants").select("user_id").eq("meeting_id", id),
    supabase.from("meeting_actions").select("*").eq("meeting_id", id).order("created_at"),
    supabase.from("tasks").select("id,title,status").eq("source_meeting_id", id),
    supabase.from("decisions").select("*").eq("meeting_id", id).order("decided_at"),
    meeting.project_id ? supabase.from("files").select("id,name,folder,current_version").eq("project_id", meeting.project_id).order("updated_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    meeting.project_id ? supabase.from("projects").select("id,name").eq("id", meeting.project_id).maybeSingle() : Promise.resolve({ data: null }),
    meeting.project_id
      ? supabase.from("meetings").select("id,title,starts_at,summary,notes").eq("project_id", meeting.project_id).lt("starts_at", meeting.starts_at).neq("id", id).order("starts_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const [{ data: prevActions }, { data: prevTasks }, { data: approvals }, { data: projectDecisions }] = await Promise.all([
    previous ? supabase.from("meeting_actions").select("*").eq("meeting_id", previous.id).order("created_at") : Promise.resolve({ data: [] }),
    previous ? supabase.from("tasks").select("id,title,status").eq("source_meeting_id", previous.id) : Promise.resolve({ data: [] }),
    meeting.project_id ? supabase.from("approvals").select("id,title,status,created_at,requested_by").eq("project_id", meeting.project_id).eq("status", "pending").order("created_at", { ascending: false }).limit(8) : Promise.resolve({ data: [] }),
    meeting.project_id ? supabase.from("decisions").select("id,title,decided_at,decided_by").eq("project_id", meeting.project_id).neq("meeting_id", id).order("decided_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
  ]);

  return (
    <MeetingRoom
      meeting={meeting}
      participantIds={(parts || []).map((p) => p.user_id)}
      actions={actions || []}
      tasks={tasks || []}
      decisions={decisions || []}
      files={files || []}
      project={project}
      prepare={{ previous: previous || null, previousActions: prevActions || [], previousTasks: prevTasks || [], approvals: approvals || [], decisions: projectDecisions || [] }}
    />
  );
}
