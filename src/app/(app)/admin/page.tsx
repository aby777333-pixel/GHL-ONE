import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isLeadPlus, isManagerPlus, isAdminRole, type Tables } from "@/lib/utils";
import { AdminShell, type AdminTab } from "@/components/admin/AdminShell";
import { Forbidden } from "@/components/admin/Forbidden";
import type { AdminPerson } from "@/components/admin/PeopleAdmin";
import type { InviteItem } from "@/components/admin/InvitesAdmin";

export const metadata = { title: "Administration" };

const TABS: AdminTab[] = ["people", "invites", "departments", "organization", "audit", "templates", "ai"];

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  const sp = await searchParams;
  const role = session.profile.role;
  if (!isLeadPlus(role)) return <Forbidden />;

  const supabase = await createClient();
  const manager = isManagerPlus(role);
  const admin = isAdminRole(role);

  const [{ data: people }, { data: invites }, { data: departments }, { data: teams }, { data: org }, { data: projectTemplates }, { data: taskTemplates }] = await Promise.all([
    manager ? supabase.from("profiles").select("id,full_name,email,avatar_url,designation,department_id,manager_id,role,is_active,is_external,joined_at,created_at").order("is_active").order("full_name") : Promise.resolve({ data: [] as AdminPerson[] }),
    manager ? supabase.from("invites").select("*, inviter:profiles!invites_invited_by_fkey(id,full_name,avatar_url)").order("created_at", { ascending: false }) : Promise.resolve({ data: [] as InviteItem[] }),
    supabase.from("departments").select("*").order("position").order("name"),
    supabase.from("teams").select("*").order("name"),
    admin && session.profile.org_id ? supabase.from("organizations").select("*").eq("id", session.profile.org_id).maybeSingle() : Promise.resolve({ data: null as Tables<"organizations"> | null }),
    manager ? supabase.from("project_templates").select("*").order("name") : Promise.resolve({ data: [] as Tables<"project_templates">[] }),
    manager ? supabase.from("task_templates").select("*").order("name") : Promise.resolve({ data: [] as Tables<"task_templates">[] }),
  ]);

  const tab = (typeof sp.tab === "string" && TABS.includes(sp.tab as AdminTab) ? sp.tab : "people") as AdminTab;

  return (
    <AdminShell
      tab={tab}
      people={(people || []) as AdminPerson[]}
      invites={(invites || []) as unknown as InviteItem[]}
      departments={departments || []}
      teams={teams || []}
      org={org || null}
      projectTemplates={projectTemplates || []}
      taskTemplates={taskTemplates || []}
    />
  );
}
