import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { OfficeHours } from "@/components/officehours/OfficeHours";

export const metadata = { title: "Office hours" };

export default async function OfficeHoursPage() {
  await getSession();
  const supabase = await createClient();
  const [{ data: hours }, { data: slots }] = await Promise.all([
    supabase.from("office_hours").select("*").order("weekday").order("start_time"),
    supabase.from("expert_slots").select("*").gte("ends_at", new Date().toISOString()).order("starts_at").limit(500),
  ]);
  return <OfficeHours hours={hours || []} slots={slots || []} />;
}
