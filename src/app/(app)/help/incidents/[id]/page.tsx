import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { IncidentView, type IncidentData } from "@/components/help/IncidentView";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Incident" };
  const supabase = await createClient();
  const { data } = await supabase.from("incidents").select("title").eq("id", id).maybeSingle();
  return { title: data ? `${data.title} · Incident` : "Incident" };
}

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  await getSession();
  const supabase = await createClient();

  const { data: incident } = await supabase.from("incidents").select("*").eq("id", id).maybeSingle();
  if (!incident) notFound();

  const [{ data: channel }, { data: task }, { data: followUp }] = await Promise.all([
    incident.channel_id ? supabase.from("channels").select("id,name").eq("id", incident.channel_id).maybeSingle() : Promise.resolve({ data: null }),
    incident.task_id ? supabase.from("tasks").select("id,title,status").eq("id", incident.task_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("workflow_runs").select("id,status").eq("kind", "incident").contains("context", { incident_id: id }).order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const data: IncidentData = { incident, channel: channel || null, task: task || null, followUp: followUp || null };
  return <IncidentView data={data} />;
}
