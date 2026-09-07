import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/utils";
import { RestrictedResource } from "@/components/access/RequestAccess";
import { PeopleIntelligence } from "@/components/admin/PeopleIntelligence";

export const metadata = { title: "People Intelligence" };

/** Owner / super-admin only. Aggregated, explainable operational signals — no scores, no rankings, no device telemetry. */
export default async function PeopleIntelligencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await getSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: isPrimary } = await supabase.rpc("is_primary_admin");
  if (!isPrimary && !isAdminRole(profile.role)) {
    return (
      <RestrictedResource
        kind="report"
        backHref="/admin"
        backLabel="Administration"
        resource_type="dataset"
        resource_id={profile.org_id || profile.id}
        resource_label="People Intelligence"
      />
    );
  }
  const requested = Number(Array.isArray(sp.days) ? sp.days[0] : sp.days);
  const days = [30, 60, 90].includes(requested) ? requested : 30;
  const { data } = await supabase.rpc("people_intelligence", { p_days: days });
  return <PeopleIntelligence initial={data ?? null} initialDays={days} />;
}
