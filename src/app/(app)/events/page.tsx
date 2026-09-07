import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isLeadPlus } from "@/lib/utils";
import { Events } from "@/components/events/Events";

export const metadata = { title: "Events" };

export default async function EventsPage() {
  const { profile } = await getSession();
  const supabase = await createClient();
  const from = new Date(); from.setDate(from.getDate() - 90);
  const since = from.toISOString();
  const [{ data: events }, { data: rsvps }, { data: hr }] = await Promise.all([
    supabase.from("events").select("*").gte("starts_at", since).order("starts_at").limit(300),
    supabase.from("event_rsvps").select("event_id,user_id,status").limit(5000),
    supabase.rpc("is_hr"),
  ]);
  return <Events events={events || []} rsvps={rsvps || []} canCreate={isLeadPlus(profile.role) || !!hr} />;
}
