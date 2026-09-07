import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Skills, type SkillsData } from "@/components/growth/Skills";

export const metadata = { title: "Skills & experts" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function SkillsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [sp] = await Promise.all([searchParams, getSession()]);
  const supabase = await createClient();
  const [{ data: people }, { data: endorsements }] = await Promise.all([
    supabase.from("profiles").select("id,full_name,avatar_url,designation,department_id,presence,skills").eq("is_active", true).order("full_name"),
    supabase.from("skill_endorsements").select("user_id,skill,verified,endorsed_by"),
  ]);
  const data: SkillsData = { people: people || [], endorsements: endorsements || [], initialSkill: one(sp.skill), initialQuery: one(sp.q) };
  return <Skills data={data} />;
}
