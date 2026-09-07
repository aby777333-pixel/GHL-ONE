import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isLeadPlus } from "@/lib/utils";
import { Forbidden } from "@/components/admin/Forbidden";
import { AutomationBuilder } from "@/components/automations/AutomationBuilder";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: id === "new" ? "New automation" : "Automation" };
}

export default async function AutomationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const session = await getSession();
  const { id } = await params;
  const sp = await searchParams;
  if (!isLeadPlus(session.profile.role)) return <Forbidden title="Automations are restricted" hint="Team leads and above can view automations; managers and above can edit them." />;
  const isNew = id === "new";
  if (!isNew && !UUID.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: row }, { data: channels }, { data: integrations }, { data: templates }, { data: projects }] = await Promise.all([
    isNew ? Promise.resolve({ data: null }) : supabase.from("automations").select("*").eq("id", id).maybeSingle(),
    supabase.from("channels").select("id,name,slug,type").in("type", ["company", "department", "group", "announcement"]).order("type").order("name"),
    supabase.from("integrations").select("id,name,provider,enabled").in("provider", ["webhook_out", "slack"]).order("name"),
    supabase.from("project_templates").select("key,name").order("name"),
    supabase.from("projects").select("id,name").eq("archived", false).order("name"),
  ]);
  if (!isNew && !row) notFound();

  return (
    <AutomationBuilder
      row={row}
      templateKey={isNew ? one(sp.template) || undefined : undefined}
      channels={channels || []}
      integrations={integrations || []}
      projectTemplates={templates || []}
      projects={projects || []}
    />
  );
}
