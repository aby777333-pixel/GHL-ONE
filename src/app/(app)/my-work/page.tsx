import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { MyWorkView } from "@/components/home/MyWorkView";

export const metadata: Metadata = { title: "My Work" };

export default async function MyWorkPage() {
  const { userId } = await getSession();
  const supabase = await createClient();
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString();

  const [{ data: mine }, { data: waitingOnMe }, { data: approvals }, { data: mentions }, { data: projects }, { data: meetings }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id,title,status,priority,due_date,assignee_id,owner_id,waiting_on,waiting_on_user_id,project_id,delegated_by,created_at,updated_at,project:projects(id,name)")
      .or(`assignee_id.eq.${userId},owner_id.eq.${userId},delegated_by.eq.${userId}`)
      .not("status", "in", "(done,cancelled)")
      .is("parent_id", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(300),
    supabase
      .from("tasks")
      .select("id,title,status,priority,due_date,assignee_id,waiting_on,waiting_on_user_id,project_id,project:projects(id,name)")
      .eq("waiting_on_user_id", userId)
      .not("status", "in", "(done,cancelled)")
      .limit(50),
    supabase.from("approvals").select("id,title,type,priority,due_date,created_at,requested_by,project_id").eq("approver_id", userId).eq("status", "pending").order("created_at"),
    supabase.from("notifications").select("id,title,body,link,created_at,read_at,actor_id").eq("user_id", userId).eq("kind", "mention").order("created_at", { ascending: false }).limit(30),
    supabase.from("project_members").select("project:projects(id,name,status,due_date,progress,department_id,owner_id)").eq("user_id", userId),
    supabase.from("meetings").select("id,title,starts_at,ends_at,project_id").gte("starts_at", new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()).lte("starts_at", in7).order("starts_at").limit(20),
  ]);

  return (
    <MyWorkView
      userId={userId}
      tasks={mine || []}
      waitingOnMe={waitingOnMe || []}
      approvals={approvals || []}
      mentions={mentions || []}
      projects={(projects || []).map((p) => p.project).filter((p): p is NonNullable<typeof p> => !!p)}
      meetings={meetings || []}
    />
  );
}
