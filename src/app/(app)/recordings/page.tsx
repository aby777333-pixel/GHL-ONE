import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { RecordingsHub } from "@/components/recordings/RecordingsHub";

export const metadata = { title: "Recordings" };

export default async function RecordingsPage() {
  await getSession();
  const supabase = await createClient();
  const { data } = await supabase.from("live_recordings").select("*").neq("status", "expired").order("created_at", { ascending: false }).limit(300);
  return <RecordingsHub recordings={data || []} now={new Date().toISOString()} />;
}
