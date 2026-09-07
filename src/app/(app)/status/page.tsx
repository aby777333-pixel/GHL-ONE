import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole, isLeadPlus } from "@/lib/utils";
import { ServiceStatus } from "@/components/status/ServiceStatus";

export const metadata = { title: "Service status" };

/** Service status board. Editing rights mirror the RLS policy: admins, `system.manage`, or Technology leads. */
export default async function StatusPage() {
  const { profile } = await getSession();
  const supabase = await createClient();
  const [{ data: rows }, { data: sysPerm }, { data: dept }] = await Promise.all([
    supabase.from("service_status").select("*").order("name"),
    supabase.rpc("has_admin_perm", { perm: "system.manage" }),
    profile.department_id ? supabase.from("departments").select("slug").eq("id", profile.department_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const canEdit = isAdminRole(profile.role) || !!sysPerm || (dept?.slug === "technology" && isLeadPlus(profile.role));
  return <ServiceStatus rows={rows || []} canEdit={canEdit} />;
}
