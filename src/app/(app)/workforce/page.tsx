import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/utils";
import { RestrictedResource } from "@/components/access/RequestAccess";
import { WorkforceLive, type WorkforceData, type WorkforceTab } from "@/components/workforce/WorkforceLive";
import { istDay, type BoardRow } from "@/components/attendance/attendanceUtils";
import { asLive, parseSettings, type BreakPolicy, type BreakType, type CoverageRequirement, type ShiftLite } from "@/components/workforce/lib";

export const metadata = { title: "Workforce Live" };

const TABS: WorkforceTab[] = ["live", "exceptions", "coverage", "breaks", "summary", "settings"];

/** Workforce Live — the operational picture for managers, HR and attendance admins. Never device telemetry. */
export default async function WorkforcePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await getSession();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: canSee } = await supabase.rpc("can_see_workforce", { p_department: undefined });
  if (!canSee) {
    return (
      <RestrictedResource
        kind="workspace"
        backHref="/attendance"
        backLabel="My attendance"
        resource_type="dataset"
        resource_id={profile.org_id || profile.id}
        resource_label="Workforce Live"
      />
    );
  }

  const today = istDay();
  const [{ data: live }, { data: board }, { data: attPerm }, { data: sysPerm }, { data: breakTypes }, { data: breakPolicies }, { data: requirements }, { data: shifts }, { data: settings }] = await Promise.all([
    supabase.rpc("workforce_live"),
    supabase.rpc("attendance_board", { p_day: today }),
    supabase.rpc("has_admin_perm", { perm: "attendance.manage" }),
    supabase.rpc("has_admin_perm", { perm: "system.manage" }),
    supabase.from("break_types").select("*").order("sort_order").order("name"),
    supabase.from("break_policies").select("*").order("department_id", { nullsFirst: true }),
    supabase.from("coverage_requirements").select("*").order("created_at"),
    supabase.from("shifts").select("id,name,start_time,end_time").eq("active", true).order("start_time"),
    supabase.rpc("attendance_settings"),
  ]);

  const canManage = isAdminRole(profile.role) || !!attPerm || !!sysPerm;
  const requested = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: WorkforceTab = requested && (TABS as string[]).includes(requested) && (requested !== "settings" || canManage) ? (requested as WorkforceTab) : "live";

  const data: WorkforceData = {
    today,
    live: asLive(live),
    board: (board || []) as BoardRow[],
    breakTypes: (breakTypes || []) as BreakType[],
    breakPolicies: (breakPolicies || []) as BreakPolicy[],
    requirements: (requirements || []) as CoverageRequirement[],
    shifts: (shifts || []) as ShiftLite[],
    settings: parseSettings(settings),
    canManage,
    canEditBreaks: canManage,
  };
  return <WorkforceLive data={data} initialTab={tab} />;
}
