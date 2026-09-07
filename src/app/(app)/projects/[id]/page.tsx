import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ProjectRoom, type ProjectRoomData } from "@/components/projects/ProjectRoom";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  await getSession();
  const supabase = await createClient();

  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();

  const [
    { data: members },
    { data: tasks },
    { data: milestones },
    { data: risks },
    { data: decisions },
    { data: approvals },
    { data: meetings },
    { data: files },
    { data: channel },
    { data: activity },
  ] = await Promise.all([
    supabase.from("project_members").select("user_id,role,added_at").eq("project_id", id).order("added_at"),
    supabase
      .from("tasks")
      .select("id,title,status,priority,due_date,start_date,assignee_id,owner_id,waiting_on,waiting_on_user_id,waiting_note,project_id,department_id,tags,created_at,parent_id,milestone_id")
      .eq("project_id", id)
      .order("position")
      .order("created_at")
      .limit(2000),
    supabase.from("milestones").select("*").eq("project_id", id).order("position").order("due_date"),
    supabase.from("project_risks").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("decisions").select("*").eq("project_id", id).order("decided_at", { ascending: false }),
    supabase.from("approvals").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("meetings").select("id,title,starts_at,ends_at,organizer_id,location,meeting_link").eq("project_id", id).order("starts_at", { ascending: false }).limit(50),
    supabase.from("files").select("*, file_versions(id,version,storage_path,size_bytes,mime_type,created_at)").eq("project_id", id).order("updated_at", { ascending: false }),
    supabase.from("channels").select("id").eq("project_id", id).eq("type", "project").limit(1).maybeSingle(),
    supabase.from("audit_logs").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(30),
  ]);

  const data: ProjectRoomData = {
    project,
    members: members || [],
    tasks: tasks || [],
    milestones: milestones || [],
    risks: risks || [],
    decisions: decisions || [],
    approvals: approvals || [],
    meetings: meetings || [],
    files: (files || []).map((f) => ({ ...f, file_versions: f.file_versions || [] })),
    channelId: channel?.id || null,
    activity: activity || [],
    initialTab: tab || "overview",
  };
  return <ProjectRoom data={data} />;
}
