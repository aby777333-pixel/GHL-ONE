import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DepartmentWorkspace, type DepartmentWorkspaceData } from "@/components/departments/DepartmentWorkspace";
import type { ProjectSummary } from "@/components/projects/ProjectCard";
import { summariseProjects } from "@/components/projects/summarise";

export default async function DepartmentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab } = await searchParams;
  await getSession();
  const supabase = await createClient();

  const { data: dept } = await supabase.from("departments").select("*").eq("slug", slug).maybeSingle();
  if (!dept) notFound();

  const [{ data: health }, { data: members }, { data: tasks }, { data: projects }, { data: channel }, { data: files }, { data: workload }, { data: handoffs }] = await Promise.all([
    supabase.rpc("department_health"),
    supabase.from("profiles").select("id,full_name,avatar_url,designation,role,presence,email,manager_id").eq("department_id", dept.id).eq("is_active", true).order("full_name"),
    supabase
      .from("tasks")
      .select("id,title,status,priority,due_date,start_date,assignee_id,owner_id,waiting_on,waiting_on_user_id,project_id,department_id,tags,created_at,parent_id,milestone_id,project:projects(id,name)")
      .eq("department_id", dept.id)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(800),
    supabase
      .from("projects")
      .select("id,name,description,status,priority,classification,department_id,owner_id,due_date,start_date,client_name,tags,archived,updated_at")
      .eq("department_id", dept.id)
      .eq("archived", false)
      .order("updated_at", { ascending: false }),
    supabase.from("channels").select("id").eq("department_id", dept.id).eq("type", "department").limit(1).maybeSingle(),
    supabase.from("files").select("*, file_versions(id,version,storage_path,size_bytes,mime_type,created_at)").eq("department_id", dept.id).order("updated_at", { ascending: false }).limit(100),
    supabase.rpc("workload"),
    supabase.from("handoffs").select("*, task:tasks!handoffs_task_id_fkey(id,title)").eq("to_department_id", dept.id).eq("status", "pending").order("created_at", { ascending: false }).limit(50),
  ]);

  const projectIds = (projects || []).map((p) => p.id);
  const [{ data: ptasks }, { data: pmembers }] = projectIds.length
    ? await Promise.all([
        supabase.from("tasks").select("project_id,status,due_date").in("project_id", projectIds).is("parent_id", null).limit(5000),
        supabase.from("project_members").select("project_id,user_id").in("project_id", projectIds),
      ])
    : [{ data: [] }, { data: [] }];
  const projectSummaries: ProjectSummary[] = summariseProjects(projects || [], ptasks || [], pmembers || []);

  const h = (health || []).find((x) => x.department_id === dept.id) || null;
  const data: DepartmentWorkspaceData = {
    department: dept,
    health: h ? { ...h, head_id: dept.head_id, description: dept.description } : null,
    members: members || [],
    tasks: tasks || [],
    projects: projectSummaries,
    channelId: channel?.id || null,
    files: (files || []).map((f) => ({ ...f, file_versions: f.file_versions || [] })),
    workload: (workload || []).filter((w) => w.department_id === dept.id),
    handoffs: ((handoffs || []) as unknown as DepartmentWorkspaceData["handoffs"]).map((h) => ({ ...h, task: h.task || null })),
    initialTab: tab || "overview",
  };
  return <DepartmentWorkspace data={data} />;
}
