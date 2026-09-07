import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { HelpDesk, type HelpDeskData } from "@/components/help/HelpDesk";

export const metadata = { title: "Help Desk" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
const ROW = "id,title,status,priority,department_id,requester_id,owner_id,created_at,ack_due_at,acknowledged_at,deadline,channel_id,service_id,form_data";

export default async function HelpPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  const supabase = await createClient();

  const [{ data: availability }, { data: services }, { data: requests }] = await Promise.all([
    supabase.rpc("department_availability"),
    supabase.from("service_catalog").select("*").order("position").order("name"),
    // RLS already scopes this to: my requests, my department's, ones I own, the public board (managers see all).
    supabase.from("help_requests").select(ROW).order("created_at", { ascending: false }).limit(600),
  ]);

  const all = requests || [];
  const data: HelpDeskData = {
    availability: availability || [],
    services: services || [],
    mine: all.filter((r) => r.requester_id === session.userId),
    queue: all,
    initialTab: one(sp.tab) || undefined,
    initialDept: one(sp.dept) || null,
    initialService: one(sp.service) || null,
  };
  return <HelpDesk data={data} />;
}
