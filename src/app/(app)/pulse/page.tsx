import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isManagerPlus } from "@/lib/utils";
import { Pulse } from "@/components/pulse/Pulse";

export const metadata = { title: "Pulse" };

export default async function PulsePage() {
  const { profile } = await getSession();
  const supabase = await createClient();
  const [{ data: surveys }, { data: responses }, { data: hr }] = await Promise.all([
    supabase.from("surveys").select("*").order("created_at", { ascending: false }).limit(200),
    // RLS: HR / managers see all responses (aggregated in the UI); others only their own named responses.
    supabase.from("survey_responses").select("*").limit(5000),
    supabase.rpc("is_hr"),
  ]);
  return <Pulse surveys={surveys || []} responses={responses || []} canCreate={isManagerPlus(profile.role) || !!hr} />;
}
