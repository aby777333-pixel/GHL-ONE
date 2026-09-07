import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isLeadPlus } from "@/lib/utils";
import { AcademyClient, type AcademyData } from "@/components/academy/AcademyClient";

export const metadata = { title: "GHL Academy" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function AcademyPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { profile } = await getSession();
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: courses }, { data: lessons }, { data: enrollments }, { data: hr }] = await Promise.all([
    supabase.from("courses").select("*").neq("status", "archived").order("mandatory", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("lessons").select("id,course_id,kind,duration_minutes"),
    supabase.from("enrollments").select("*").order("created_at", { ascending: false }),
    supabase.rpc("is_hr"),
  ]);

  const canManage = isLeadPlus(profile.role) || !!hr;
  const data: AcademyData = {
    courses: courses || [],
    lessons: lessons || [],
    enrollments: enrollments || [],
    canManage,
    openCreate: canManage && one(sp.new) === "1",
    openAssign: canManage ? one(sp.assign) : "",
    tab: one(sp.tab) === "mine" ? "mine" : one(sp.tab) === "team" && canManage ? "team" : "catalogue",
  };
  return <AcademyClient data={data} />;
}
