import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { IdeasClient } from "./IdeasClient";

export const metadata = { title: "Ideas" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function IdeasPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await getSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: ideas }, { data: votes }] = await Promise.all([
    supabase.from("ideas").select("*").order("votes", { ascending: false }).order("created_at", { ascending: false }).limit(300),
    supabase.from("idea_votes").select("idea_id").eq("user_id", session.userId),
  ]);
  return <IdeasClient ideas={ideas || []} myVotes={(votes || []).map((v) => v.idea_id)} openNew={one(sp.new) === "1"} />;
}
