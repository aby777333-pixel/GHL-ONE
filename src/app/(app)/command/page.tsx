import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isManagerPlus } from "@/lib/utils";
import { CommandCenter } from "@/components/command/CommandCenter";

export const metadata: Metadata = { title: "Command Center" };

export default async function CommandPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { profile } = await getSession();
  if (!isManagerPlus(profile.role)) redirect("/");
  const { tab } = await searchParams;
  const supabase = await createClient();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const in14 = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10);

  const taskCols = "id,title,status,priority,due_date,assignee_id,waiting_on,waiting_on_user_id,project_id,department_id,project:projects(id,name)";
  const [
    { data: pulse },
    { data: depts },
    { data: workload },
    { data: critical },
    { data: waiting },
    { data: overdue },
    { data: projects },
    { data: approvals },
    { data: milestones },
    { data: meetings },
    { data: decisions },
    { data: risks },
    { data: activity },
    { data: announcements },
    { data: deps },
  ] = await Promise.all([
    supabase.rpc("company_pulse"),
    supabase.rpc("department_health"),
    supabase.rpc("workload"),
    supabase.from("tasks").select(taskCols).not("status", "in", "(done,cancelled)").in("priority", ["critical", "urgent"]).is("parent_id", null).order("due_date", { ascending: true, nullsFirst: false }).limit(30),
    supabase.from("tasks").select(taskCols).not("status", "in", "(done,cancelled)").neq("waiting_on", "none").is("parent_id", null).order("updated_at", { ascending: false }).limit(120),
    supabase.from("tasks").select(taskCols).not("status", "in", "(done,cancelled)").lt("due_date", now.toISOString()).is("parent_id", null).order("due_date").limit(60),
    supabase.from("projects").select("id,name,status,due_date,progress,department_id,owner_id,priority,classification").eq("archived", false).not("status", "in", "(completed,cancelled)").order("due_date", { ascending: true, nullsFirst: false }).limit(60),
    supabase.from("approvals").select("id,title,type,created_at,approver_id,requested_by,priority,project_id,due_date").eq("status", "pending").order("created_at").limit(100),
    supabase.from("milestones").select("id,title,due_date,project_id,completed_at,project:projects(name)").is("completed_at", null).gte("due_date", startOfDay.slice(0, 10)).lte("due_date", in14).order("due_date").limit(20),
    supabase.from("meetings").select("id,title,starts_at,ends_at,project_id,organizer_id").gte("starts_at", startOfDay).lte("starts_at", new Date(now.getTime() + 86400000).toISOString()).order("starts_at").limit(20),
    supabase.from("decisions").select("id,title,decided_at,decided_by,project_id").order("decided_at", { ascending: false }).limit(8),
    supabase.from("project_risks").select("id,title,severity,project_id,owner_id,mitigation,project:projects(name)").is("resolved_at", null).order("severity").limit(20),
    supabase.from("audit_logs").select("id,action,entity_type,entity_id,summary,actor_id,created_at,project_id,task_id").order("created_at", { ascending: false }).limit(40),
    supabase.from("announcements").select("id,title,published_at,mandatory").order("published_at", { ascending: false }).limit(3),
    supabase.from("task_dependencies").select("task_id,depends_on_id").limit(500),
  ]);

  return (
    <CommandCenter
      initialTab={tab}
      pulse={(pulse as Record<string, unknown>) || {}}
      departments={depts || []}
      workload={workload || []}
      critical={critical || []}
      waiting={waiting || []}
      overdue={overdue || []}
      projects={projects || []}
      approvals={approvals || []}
      milestones={milestones || []}
      meetings={meetings || []}
      decisions={decisions || []}
      risks={risks || []}
      activity={activity || []}
      announcements={announcements || []}
      deps={deps || []}
    />
  );
}
