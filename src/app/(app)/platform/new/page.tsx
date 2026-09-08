import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { CompanyWizard } from "@/components/platform/CompanyWizard";
import { PlatformError } from "@/components/platform/PlatformError";
import { canCreateCompany } from "@/components/platform/lib";

export const metadata = { title: "Onboard a company" };

/**
 * The company creation wizard (§13, §14, §167). `create_company()` itself refuses anyone who is not
 * a platform owner or operations admin; this page says so politely instead of letting them fill in
 * nine steps and be rejected at the end.
 */
export default async function NewCompanyPage() {
  await getSession();
  const supabase = await createClient();

  const [{ data: isPlatformAdmin }, { data: platformRole }] = await Promise.all([supabase.rpc("is_platform_admin"), supabase.rpc("platform_role")]);
  if (!isPlatformAdmin) notFound();

  const role = (platformRole as string | null) ?? null;
  if (!canCreateCompany(role)) {
    return (
      <PlatformError
        title="Creating companies is restricted"
        message="Only a platform owner or an operations administrator can onboard a new company. Ask one of them to create it, then take it from there."
      />
    );
  }

  // Companies this person may touch — offered as a structure to copy from (departments only).
  const { data: companies } = await supabase.from("organizations").select("id,name").order("name");

  return <CompanyWizard companies={(companies || []).map((c) => ({ org_id: c.id, name: c.name }))} />;
}
