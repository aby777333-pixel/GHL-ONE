import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Retros, type RetroRow } from "@/components/retros/Retros";

export const metadata = { title: "Retrospectives" };

export default async function RetrosPage() {
  await getSession();
  const supabase = await createClient();
  const [{ data: rows }, { data: teams }] = await Promise.all([
    supabase.from("retrospectives").select("*, project:projects(id,name), team:teams(id,name)").order("created_at", { ascending: false }).limit(200),
    supabase.from("teams").select("id,name").order("name"),
  ]);
  return <Retros rows={(rows || []) as RetroRow[]} teams={teams || []} />;
}
