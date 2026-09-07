import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isManagerPlus, isAdminRole } from "@/lib/utils";
import { HomeEmployee } from "@/components/home/HomeEmployee";
import { HomeManager } from "@/components/home/HomeManager";
import { HomeExecutive } from "@/components/home/HomeExecutive";

export default async function HomePage() {
  const { userId, profile } = await getSession();
  const supabase = await createClient();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString();

  // Shared personal data
  const [{ data: myTasks }, { data: approvals }, { data: meetings }, { data: announcements }, { data: unread }, { data: waitingOnMe }, { data: memberships }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id,title,status,priority,due_date,assignee_id,waiting_on,waiting_on_user_id,project_id,project:projects(id,name)")
      .eq("assignee_id", userId)
      .not("status", "in", "(done,cancelled)")
      .is("parent_id", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(60),
    supabase.from("approvals").select("id,title,type,created_at,requested_by,priority").eq("approver_id", userId).eq("status", "pending").order("created_at").limit(10),
    supabase.from("meetings").select("id,title,starts_at,ends_at,project_id").gte("starts_at", startOfDay).lte("starts_at", in7).order("starts_at").limit(10),
    supabase.from("announcements").select("id,title,body,kind,mandatory,pinned,published_at,author_id").order("pinned", { ascending: false }).order("published_at", { ascending: false }).limit(4),
    supabase.rpc("my_unread_counts"),
    supabase.from("tasks").select("id,title,status,priority,due_date,assignee_id,waiting_on,waiting_on_user_id,project_id,project:projects(id,name)").eq("waiting_on_user_id", userId).not("status", "in", "(done,cancelled)").limit(20),
    supabase.from("project_members").select("project:projects(id,name,status,due_date,progress,owner_id)").eq("user_id", userId),
  ]);

  const unreadTotal = (unread || []).reduce((a, r) => a + Number(r.unread || 0), 0);
  const myProjects = (memberships || []).map((m) => m.project).filter(Boolean) as { id: string; name: string; status: string; due_date: string | null; progress: number; owner_id: string | null }[];
  const personal = { tasks: myTasks || [], approvals: approvals || [], meetings: meetings || [], announcements: announcements || [], unreadTotal, waitingOnMe: waitingOnMe || [], projects: myProjects };

  if (isAdminRole(profile.role)) {
    const [{ data: pulse }, { data: depts }, { data: projects }, { data: staleApprovals }, { data: decisions }, { data: risks }] = await Promise.all([
      supabase.rpc("company_pulse"),
      supabase.rpc("department_health"),
      supabase.from("projects").select("id,name,status,due_date,progress,department_id,owner_id,priority").eq("archived", false).not("status", "in", "(completed,cancelled)").order("priority").order("due_date", { ascending: true, nullsFirst: false }).limit(12),
      supabase.from("approvals").select("id,title,type,created_at,approver_id,requested_by,priority").eq("status", "pending").order("created_at").limit(8),
      supabase.from("decisions").select("id,title,decided_at,decided_by,project_id").order("decided_at", { ascending: false }).limit(5),
      supabase.from("project_risks").select("id,title,severity,project_id,owner_id,project:projects(name)").is("resolved_at", null).order("severity").limit(8),
    ]);
    return <HomeExecutive personal={personal} pulse={(pulse as Record<string, unknown>) || {}} departments={depts || []} projects={projects || []} pendingApprovals={staleApprovals || []} decisions={decisions || []} risks={risks || []} />;
  }

  if (isManagerPlus(profile.role)) {
    const [{ data: workload }, { data: teamTasks }, { data: projects }] = await Promise.all([
      supabase.rpc("workload"),
      supabase
        .from("tasks")
        .select("id,title,status,priority,due_date,assignee_id,waiting_on,waiting_on_user_id,project_id,project:projects(id,name)")
        .not("status", "in", "(done,cancelled)")
        .is("parent_id", null)
        .or(`status.eq.blocked,status.eq.waiting,due_date.lt.${now.toISOString()}`)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(40),
      supabase.from("projects").select("id,name,status,due_date,progress,department_id,owner_id").eq("archived", false).not("status", "in", "(completed,cancelled)").order("due_date", { ascending: true, nullsFirst: false }).limit(10),
    ]);
    return <HomeManager personal={personal} workload={workload || []} teamTasks={teamTasks || []} projects={projects || []} />;
  }

  return <HomeEmployee personal={personal} />;
}
