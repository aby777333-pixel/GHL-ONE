import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DecisionsClient } from "@/components/decisions/DecisionsClient";

export const metadata = { title: "Decisions" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await getSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: decisions }, { data: projects }] = await Promise.all([
    supabase.from("decisions").select("*").order("decided_at", { ascending: false }).limit(400),
    supabase.from("projects").select("id,name").eq("archived", false).order("name"),
  ]);
  return <DecisionsClient decisions={decisions || []} projects={projects || []} openNew={one(sp.new) === "1"} defaultProject={one(sp.project) || null} />;
}
