import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { RequestCenter } from "@/components/requests/RequestCenter";

export const metadata = { title: "Request Center" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

/** Self-service requests — RLS already scopes rows to mine, ones I approve, my reports', HR and audit readers. */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  const supabase = await createClient();
  const [{ data: rows }, { data: org }] = await Promise.all([
    supabase.from("requests").select("*").order("created_at", { ascending: false }).limit(400),
    supabase.from("organizations").select("settings").eq("id", session.profile.org_id!).maybeSingle(),
  ]);
  const settings = (org?.settings && typeof org.settings === "object" && !Array.isArray(org.settings) ? org.settings : {}) as Record<string, unknown>;
  const threshold = Number(settings.expense_second_approval_above) || 25000;
  return <RequestCenter rows={rows || []} initialTab={one(sp.tab) || undefined} threshold={threshold} />;
}
