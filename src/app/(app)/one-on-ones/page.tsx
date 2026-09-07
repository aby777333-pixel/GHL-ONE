import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { OneOnOnes, type OneOnOnesData } from "@/components/growth/OneOnOnes";

export const metadata = { title: "1-on-1s" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function OneOnOnesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [sp, { profile }] = await Promise.all([searchParams, getSession()]);
  const supabase = await createClient();
  const [{ data: sessions }, { data: reports }] = await Promise.all([
    supabase.from("one_on_ones").select("*").order("scheduled_at", { ascending: false }).limit(300),
    supabase.from("profiles").select("id,full_name,avatar_url,designation,presence,department_id").or(`manager_id.eq.${profile.id},secondary_manager_id.eq.${profile.id}`).eq("is_active", true).order("full_name"),
  ]);
  const data: OneOnOnesData = {
    sessions: sessions || [],
    reports: reports || [],
    openId: one(sp.id),
    openNew: one(sp.new) === "1",
    withId: one(sp.with),
  };
  return <OneOnOnes data={data} />;
}
