import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { HelpRequestDetail, type HelpDetailData } from "@/components/help/HelpRequestDetail";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Help request" };
  const supabase = await createClient();
  const { data } = await supabase.from("help_requests").select("title").eq("id", id).maybeSingle();
  return { title: data ? `${data.title} · Help` : "Help request" };
}

export default async function HelpRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  await getSession();
  const supabase = await createClient();

  const { data: request } = await supabase.from("help_requests").select("*").eq("id", id).maybeSingle();
  if (!request) notFound();

  const [{ data: service }, { data: task }, { data: project }, { data: channel }, { data: activity }] = await Promise.all([
    request.service_id ? supabase.from("service_catalog").select("*").eq("id", request.service_id).maybeSingle() : Promise.resolve({ data: null }),
    request.task_id ? supabase.from("tasks").select("id,title,status").eq("id", request.task_id).maybeSingle() : Promise.resolve({ data: null }),
    request.project_id ? supabase.from("projects").select("id,name,status").eq("id", request.project_id).maybeSingle() : Promise.resolve({ data: null }),
    request.channel_id ? supabase.from("channels").select("id,name,last_message_at").eq("id", request.channel_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("audit_logs").select("id,action,summary,created_at,actor_id,new_value").eq("entity_type", "help_request").eq("entity_id", id).order("created_at", { ascending: false }).limit(60),
  ]);

  const data: HelpDetailData = {
    request,
    service: service || null,
    task: task || null,
    project: project || null,
    channel: channel || null,
    activity: activity || [],
  };
  return <HelpRequestDetail data={data} />;
}
