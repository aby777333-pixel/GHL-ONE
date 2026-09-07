import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { NewProjectForm, type TemplateLite } from "@/components/projects/NewProjectForm";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  await getSession();
  const supabase = await createClient();
  const { data: templates } = await supabase.from("project_templates").select("id,key,name,description,department_slug,tasks,milestones").order("name");
  return (
    <div className="page page-narrow">
      <PageHeader eyebrow="Projects" title="New project" subtitle="Start from a template and the tasks, dependencies and milestones are created for you." />
      <NewProjectForm templates={(templates || []) as TemplateLite[]} />
    </div>
  );
}
