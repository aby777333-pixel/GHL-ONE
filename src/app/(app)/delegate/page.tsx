import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { DelegateComposer, type RecentDelegation } from "@/components/projects/DelegateComposer";

export const metadata = { title: "Delegate" };

export default async function DelegatePage() {
  const { profile } = await getSession();
  const supabase = await createClient();
  const [{ data: projects }, { data: recent }] = await Promise.all([
    supabase.from("projects").select("id,name").eq("archived", false).order("name"),
    supabase
      .from("tasks")
      .select("id,title,status,priority,due_date,assignee_id,approver_id,department_id,project_id,created_at,project:projects(id,name)")
      .eq("delegated_by", profile.id)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);
  return (
    <div className="page page-narrow">
      <PageHeader eyebrow="Company control" title="Delegate" subtitle="Describe what you need in plain language. GHL ONE turns it into an owned, sequenced workflow with deadlines and approval." />
      <DelegateComposer projects={projects || []} recent={(recent || []) as RecentDelegation[]} />
    </div>
  );
}
