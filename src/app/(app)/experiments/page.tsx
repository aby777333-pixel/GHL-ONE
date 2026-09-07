import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Experiments, type ExperimentRow } from "@/components/experiments/Experiments";

export const metadata = { title: "Experiments" };

export default async function ExperimentsPage() {
  await getSession();
  const supabase = await createClient();
  const [{ data: rows }, { data: ideas }] = await Promise.all([
    supabase.from("experiments").select("*, idea:ideas(id,title)").order("created_at", { ascending: false }).limit(200),
    supabase.from("ideas").select("id,title").order("created_at", { ascending: false }).limit(200),
  ]);
  return <Experiments rows={(rows || []) as ExperimentRow[]} ideas={ideas || []} />;
}
