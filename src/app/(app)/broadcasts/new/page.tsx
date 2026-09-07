import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { NewBroadcast } from "@/components/broadcasts/NewBroadcast";

export const metadata = { title: "New broadcast" };

export default async function NewBroadcastPage() {
  await getSession();
  const supabase = await createClient();
  const [{ data: company }, { data: department }, { data: comm }, { data: teams }] = await Promise.all([
    supabase.rpc("has_perm", { p_perm: "broadcast_company" }),
    supabase.rpc("has_perm", { p_perm: "broadcast_department" }),
    supabase.rpc("has_admin_perm", { perm: "communication.manage" }),
    supabase.from("teams").select("id,name,department_id").order("name"),
  ]);
  return <NewBroadcast canCompany={!!company || !!comm} canDepartment={!!department} teams={teams || []} />;
}
