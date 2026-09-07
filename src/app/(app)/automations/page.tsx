import Link from "next/link";
import { redirect } from "next/navigation";
import { Workflow } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isLeadPlus } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { AutomationsClient } from "@/components/automations/AutomationsClient";

export const metadata = { title: "Automations" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function AutomationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await getSession();
  const sp = await searchParams;
  const template = one(sp.template);
  if (template) redirect(`/automations/new?template=${encodeURIComponent(template)}`);

  if (!isLeadPlus(session.profile.role)) {
    return (
      <div className="page page-narrow">
        <div className="card">
          <EmptyState
            icon={<Workflow size={20} />}
            title="Automations are managed by team leads and above"
            hint="Rules like “design approved → notify marketing” run in the background for everyone. If you have an idea for one, tell your lead or manager."
            action={<Link href="/" className="btn btn-secondary">Back to Home</Link>}
          />
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: automations }, { data: projects }] = await Promise.all([
    supabase.from("automations").select("*").order("enabled", { ascending: false }).order("updated_at", { ascending: false }),
    supabase.from("projects").select("id,name").eq("archived", false).order("name"),
  ]);

  return <AutomationsClient automations={automations || []} projects={projects || []} openTemplates={one(sp.templates) === "1"} />;
}
