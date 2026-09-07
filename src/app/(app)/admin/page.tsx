import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole, type Tables } from "@/lib/utils";
import { AdminShell, type ControlPlaneData } from "@/components/admin/AdminShell";
import { Forbidden } from "@/components/admin/Forbidden";
import type { AdminPerson } from "@/components/admin/PeopleAdmin";
import type { InviteItem } from "@/components/admin/InvitesAdmin";
import type { CollabRow, CompanyNowData } from "@/components/admin/CompanyNow";
import type { AccessGrantRow, AccessRequestRow } from "@/components/admin/AccessAdmin";
import type { AdminAssignmentRow, AdminRoleRow } from "@/components/admin/AdminRoles";
import type { FeatureFlagRow } from "@/components/admin/FeatureFlags";
import type { ExpiringGrant, GuestRow, SecurityAuditRow, SecurityEventRow } from "@/components/admin/SecurityCenter";
import { canOpenConsole, isAdminTab, tabAllowed, type AdminTab } from "@/components/admin/perms";
import { resolveResourceLabels } from "@/components/admin/resourceLabels";
import { asHrView, EMPTY_HR, type HrData } from "@/components/admin/hr";

export const metadata = { title: "Administration" };

const DAY = 86_400_000;

/** Time window for the page's queries (kept out of the component body so it stays pure per render). */
function timeWindow() {
  const nowMs = Date.now();
  return { nowMs, nowIso: new Date(nowMs).toISOString(), in7d: new Date(nowMs + 7 * DAY).toISOString(), stale: new Date(nowMs - 2 * DAY).toISOString() };
}

/** HR console data. `full` = the People Ops tab (everything); otherwise only what the Workflows tab needs. */
async function loadHrData(supabase: Awaited<ReturnType<typeof createClient>>, full: boolean): Promise<HrData> {
  const skip = <T,>(v: T) => Promise.resolve({ data: v });
  const [
    { data: people }, { data: templates }, { data: runs }, { data: shifts }, { data: teams }, { data: transfers }, { data: roleChanges }, { data: probationReviews },
    { data: assets }, { data: assignments }, { data: assetRequests }, { data: jobs }, { data: candidates }, { data: interviews },
  ] = await Promise.all([
    supabase.from("profiles").select("*").order("is_active", { ascending: false }).order("full_name"),
    supabase.from("workflow_templates").select("*").order("kind").order("name"),
    supabase.from("workflow_runs").select("*").order("started_at", { ascending: false }).limit(300),
    full ? supabase.from("shifts").select("id,name,start_time,end_time,color,active").order("name") : skip([] as HrData["shifts"]),
    full ? supabase.from("teams").select("id,name,department_id").order("name") : skip([] as HrData["teams"]),
    full ? supabase.from("employee_transfers").select("*").order("created_at", { ascending: false }).limit(200) : skip([] as HrData["transfers"]),
    full ? supabase.from("role_changes").select("*").order("created_at", { ascending: false }).limit(200) : skip([] as HrData["roleChanges"]),
    full ? supabase.from("probation_reviews").select("*").order("review_date", { ascending: false }).limit(200) : skip([] as HrData["probationReviews"]),
    full ? supabase.from("assets").select("*").order("tag") : skip([] as HrData["assets"]),
    full ? supabase.from("asset_assignments").select("*").order("assigned_at", { ascending: false }).limit(1000) : skip([] as HrData["assignments"]),
    full ? supabase.from("asset_requests").select("*").order("created_at", { ascending: false }).limit(300) : skip([] as HrData["assetRequests"]),
    full ? supabase.from("job_openings").select("*").order("created_at", { ascending: false }) : skip([] as HrData["jobs"]),
    full ? supabase.from("candidates").select("*").order("updated_at", { ascending: false }).limit(500) : skip([] as HrData["candidates"]),
    full ? supabase.from("interviews").select("*").order("scheduled_at", { ascending: false }).limit(500) : skip([] as HrData["interviews"]),
  ]);
  return {
    ...EMPTY_HR,
    people: people || [],
    templates: templates || [],
    runs: runs || [],
    shifts: shifts || [],
    teams: teams || [],
    transfers: transfers || [],
    roleChanges: roleChanges || [],
    probationReviews: probationReviews || [],
    assets: assets || [],
    assignments: assignments || [],
    assetRequests: assetRequests || [],
    jobs: jobs || [],
    candidates: candidates || [],
    interviews: interviews || [],
  };
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  const sp = await searchParams;
  const role = session.profile.role;
  const supabase = await createClient();

  // Effective admin permissions: admin-level roles get everything; otherwise the union of active admin_assignments.
  const { data: myAssignments } = await supabase.from("admin_assignments").select("id,expires_at,admin_role_id,role:admin_roles(permissions)").eq("user_id", session.userId);
  const { nowMs, nowIso, in7d, stale } = timeWindow();
  const perms = isAdminRole(role)
    ? ["*"]
    : [...new Set((myAssignments || []).filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > nowMs).flatMap((a) => {
        const r = Array.isArray(a.role) ? a.role[0] : a.role;
        return (r as { permissions: string[] } | null)?.permissions || [];
      }))];
  if (!canOpenConsole(role, perms)) return <Forbidden />;

  const can = (t: AdminTab) => tabAllowed(t, role, perms);
  const orgId = session.profile.org_id || "";
  const empty = <T,>(v: T) => Promise.resolve({ data: v, count: null as number | null });

  const [
    { data: people }, { data: invites }, { data: departments }, { data: teams }, { data: org }, { data: projectTemplates }, { data: taskTemplates }, { data: escalationRules }, { data: integrations }, { data: channels },
    { data: isPrimary }, { data: companyNow }, { data: collab }, { data: accessRequests }, { data: accessGrants }, { data: adminRoles }, { data: adminAssignments }, { data: featureFlags },
    { data: securityEvents }, { data: securityAudit }, { data: guests }, { data: expiringGrants },
    { count: accessPendingCount }, { count: highRiskCount }, { count: staleApprovals }, { count: tempGrants }, { count: assignmentsCount }, { count: roleAdmins },
  ] = await Promise.all([
    can("people") ? supabase.from("profiles").select("id,full_name,email,avatar_url,designation,department_id,manager_id,role,is_active,is_external,joined_at,created_at").order("is_active").order("full_name") : empty([] as AdminPerson[]),
    can("invites") ? supabase.from("invites").select("*, inviter:profiles!invites_invited_by_fkey(id,full_name,avatar_url)").order("created_at", { ascending: false }) : empty([] as InviteItem[]),
    supabase.from("departments").select("*").order("position").order("name"),
    supabase.from("teams").select("*").order("name"),
    can("organization") && orgId ? supabase.from("organizations").select("*").eq("id", orgId).maybeSingle() : empty(null as Tables<"organizations"> | null),
    can("templates") ? supabase.from("project_templates").select("*").order("name") : empty([] as Tables<"project_templates">[]),
    can("templates") ? supabase.from("task_templates").select("*").order("name") : empty([] as Tables<"task_templates">[]),
    can("escalation") ? supabase.from("escalation_rules").select("*").order("position").order("created_at") : empty([] as Tables<"escalation_rules">[]),
    can("integrations") ? supabase.from("integrations").select("*").order("provider").order("name") : empty([] as Tables<"integrations">[]),
    can("integrations") ? supabase.from("channels").select("id,name,slug,type").in("type", ["company", "department", "group", "announcement"]).order("type").order("name") : empty([] as { id: string; name: string; slug: string | null; type: string }[]),
    // control plane
    supabase.rpc("is_primary_admin"),
    can("now") ? supabase.rpc("company_now") : empty(null),
    can("now") ? supabase.rpc("collaboration_map") : empty([] as CollabRow[]),
    can("access") ? supabase.from("access_requests").select("*").order("created_at", { ascending: false }).limit(300) : empty([] as AccessRequestRow[]),
    can("access") ? supabase.from("access_grants").select("*").is("revoked_at", null).order("expires_at", { ascending: true, nullsFirst: false }).limit(300) : empty([] as AccessGrantRow[]),
    can("roles") ? supabase.from("admin_roles").select("*").order("is_system", { ascending: false }).order("name") : empty([] as AdminRoleRow[]),
    can("roles") ? supabase.from("admin_assignments").select("*").order("created_at", { ascending: false }) : empty([] as AdminAssignmentRow[]),
    can("features") ? supabase.from("feature_flags").select("*").order("feature") : empty([] as FeatureFlagRow[]),
    can("security") ? supabase.from("security_events").select("*").order("created_at", { ascending: false }).limit(200) : empty([] as SecurityEventRow[]),
    can("security") ? supabase.from("audit_logs").select("id,action,entity_type,entity_id,summary,actor_id,created_at,new_value").or("action.like.security.*,action.like.access.*").order("created_at", { ascending: false }).limit(200) : empty([] as SecurityAuditRow[]),
    can("security") ? supabase.from("profiles").select("id,full_name,email,avatar_url,role,designation,last_seen_at,department_id,joined_at").eq("is_external", true).eq("is_active", true).order("last_seen_at", { ascending: false, nullsFirst: false }) : empty([] as GuestRow[]),
    can("security") ? supabase.from("access_grants").select("*").is("revoked_at", null).not("expires_at", "is", null).gt("expires_at", nowIso).lte("expires_at", in7d).order("expires_at") : empty([] as ExpiringGrant[]),
    // governance strip (RLS-scoped counts)
    supabase.from("access_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("access_requests").select("id", { count: "exact", head: true }).eq("status", "pending").eq("risk", "high"),
    supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending").lt("created_at", stale),
    supabase.from("access_grants").select("id", { count: "exact", head: true }).is("revoked_at", null).not("expires_at", "is", null).gt("expires_at", nowIso),
    supabase.from("admin_assignments").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true).in("role", ["super_admin", "director", "executive"]),
  ]);

  // Human labels for grants (RLS-scoped).
  const grantRows = ((accessGrants || []) as AccessGrantRow[]);
  const expiringRows = ((expiringGrants || []) as ExpiringGrant[]);
  const labels = grantRows.length || expiringRows.length ? await resolveResourceLabels(supabase, [...grantRows, ...expiringRows]) : {};
  const withLabel = <T extends { resource_type: string; resource_id: string }>(g: T) => ({ ...g, label: labels[`${g.resource_type}:${g.resource_id}`] ?? null });

  const primaryAdminId = (() => {
    const s = org?.settings;
    if (s && typeof s === "object" && !Array.isArray(s) && typeof (s as Record<string, unknown>).primary_admin_id === "string") return (s as Record<string, string>).primary_admin_id;
    return null;
  })();

  const plane: ControlPlaneData = {
    perms,
    isPrimary: !!isPrimary,
    primaryAdminId,
    orgId,
    governance: {
      accessPending: accessPendingCount ?? 0,
      highRisk: highRiskCount ?? 0,
      staleApprovals: staleApprovals ?? 0,
      tempGrants: tempGrants ?? 0,
      admins: (assignmentsCount ?? 0) + (roleAdmins ?? 0),
    },
    companyNow: (companyNow as CompanyNowData | null) ?? null,
    collab: (collab || []) as CollabRow[],
    accessRequests: (accessRequests || []) as AccessRequestRow[],
    accessGrants: grantRows.map(withLabel),
    adminRoles: (adminRoles || []) as AdminRoleRow[],
    adminAssignments: (adminAssignments || []) as AdminAssignmentRow[],
    featureFlags: (featureFlags || []) as FeatureFlagRow[],
    securityEvents: (securityEvents || []) as SecurityEventRow[],
    securityAudit: (securityAudit || []) as SecurityAuditRow[],
    guests: (guests || []) as GuestRow[],
    expiringGrants: expiringRows.map(withLabel),
  };

  const requested = isAdminTab(sp.tab) ? sp.tab : null;
  const tab: AdminTab = requested && can(requested) ? requested : can("now") ? "now" : "people";
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null;

  // People Operations — loaded only for the tab that is being shown, with the caller's RLS-scoped client.
  const hr: HrData | null = (tab === "hr" && can("hr")) || (tab === "workflows" && can("workflows")) ? await loadHrData(supabase, tab === "hr") : null;

  return (
    <AdminShell
      tab={tab}
      hr={hr}
      hrView={asHrView(sp.view)}
      run={one(sp.run)}
      user={one(sp.user)}
      people={(people || []) as AdminPerson[]}
      invites={(invites || []) as unknown as InviteItem[]}
      departments={departments || []}
      teams={teams || []}
      org={org || null}
      projectTemplates={projectTemplates || []}
      taskTemplates={taskTemplates || []}
      escalationRules={escalationRules || []}
      integrations={integrations || []}
      channels={channels || []}
      plane={plane}
    />
  );
}
