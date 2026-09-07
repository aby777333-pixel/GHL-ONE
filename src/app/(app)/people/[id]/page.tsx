import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ProfileView, type ProfileData } from "@/components/people/ProfileView";
import type { TaskRowData } from "@/components/tasks/TaskBits";

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  await getSession();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: person } = await supabase
    .from("profiles")
    .select("*, manager:profiles!profiles_manager_id_fkey(id,full_name,avatar_url,designation), department:departments!profiles_department_id_fkey(id,name,color), team:teams!profiles_team_id_fkey(id,name)")
    .eq("id", id)
    .maybeSingle();
  if (!person) notFound();

  const [{ data: tasks }, { data: memberships }, { data: reports }, { data: leaves }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id,title,status,priority,due_date,assignee_id,waiting_on,waiting_on_user_id,project_id,project:projects!tasks_project_id_fkey(id,name)")
      .eq("assignee_id", id)
      .not("status", "in", "(done,cancelled)")
      .is("parent_id", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(40),
    supabase.from("project_members").select("role,project:projects!project_members_project_id_fkey(id,name,status,progress,due_date)").eq("user_id", id),
    supabase.from("profiles").select("id,full_name,avatar_url,designation,presence,department_id").eq("manager_id", id).eq("is_active", true).order("full_name"),
    supabase.from("leaves").select("id,starts_on,ends_on,kind,note,status").eq("user_id", id).eq("status", "approved").gte("ends_on", today).order("starts_on").limit(10),
  ]);

  return (
    <ProfileView
      person={person as unknown as ProfileData}
      tasks={(tasks || []) as unknown as TaskRowData[]}
      projects={(memberships || []).flatMap((m) => (m.project ? [{ role: m.role, ...(m.project as unknown as { id: string; name: string; status: string; progress: number; due_date: string | null }) }] : []))}
      reports={reports || []}
      leaves={leaves || []}
      edit={sp.edit === "1"}
    />
  );
}
