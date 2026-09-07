import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { ProjectsList } from "@/components/projects/ProjectsList";
import type { ProjectSummary } from "@/components/projects/ProjectCard";
import { summariseProjects } from "@/components/projects/summarise";

export const metadata = { title: "Projects" };

type Search = { view?: string; status?: string; department?: string; owner?: string; q?: string; archived?: string };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  await getSession();
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id,name,description,status,priority,classification,department_id,owner_id,due_date,start_date,client_name,tags,archived,updated_at")
    .eq("archived", sp.archived === "1")
    .order("updated_at", { ascending: false });
  const ids = (projects || []).map((p) => p.id);

  const [{ data: tasks }, { data: members }] = ids.length
    ? await Promise.all([
        supabase.from("tasks").select("project_id,status,due_date").in("project_id", ids).is("parent_id", null).limit(5000),
        supabase.from("project_members").select("project_id,user_id").in("project_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  const list: ProjectSummary[] = summariseProjects(projects || [], tasks || [], members || []);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Work"
        title="Projects"
        subtitle={`${list.filter((p) => p.status !== "completed" && p.status !== "cancelled").length} active · ${list.length} total`}
        actions={<Link href="/projects/new" className="btn btn-primary btn-sm"><Plus size={15} /> New project</Link>}
      />
      <ProjectsList projects={list} initial={{ view: sp.view === "table" ? "table" : "cards", status: sp.status, department: sp.department, owner: sp.owner, q: sp.q, archived: sp.archived === "1" }} />
    </div>
  );
}
