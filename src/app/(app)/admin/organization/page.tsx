import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole, type Tables } from "@/lib/utils";
import { OrganizationControl, type OrgControlData } from "@/components/admin/OrganizationControl";
import { asOrgTab } from "@/components/admin/orgTabs";

export const metadata = { title: "Organization Control" };

/** Kept out of the component body so the render stays pure. */
function nowMillis() {
  return Date.now();
}

/** Master switchboard. Gated by screen governance: only when `effective_screens` allows `org-control`. */
export default async function OrganizationControlPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: screens } = await supabase.rpc("effective_screens", { p_user: session.userId });
  const allowed = (screens || []).some((s) => s.key === "org-control" && s.allowed);
  if (!allowed) notFound();

  const orgId = session.profile.org_id || "";
  const [{ data: org }, { data: isPrimary }, { data: myAssignments }, { data: policies }, { data: courses }, { data: featureFlags }] = await Promise.all([
    orgId ? supabase.from("organizations").select("*").eq("id", orgId).maybeSingle() : Promise.resolve({ data: null as Tables<"organizations"> | null }),
    supabase.rpc("is_primary_admin"),
    supabase.from("admin_assignments").select("expires_at,role:admin_roles(permissions)").eq("user_id", session.userId),
    supabase.from("policies").select("*").order("status").order("title"),
    supabase.from("courses").select("id,title,status").neq("status", "archived").order("title"),
    supabase.from("feature_flags").select("*"),
  ]);
  const nowMs = nowMillis();
  const perms = isAdminRole(session.profile.role)
    ? ["*"]
    : [...new Set((myAssignments || []).filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > nowMs).flatMap((a) => { const r = Array.isArray(a.role) ? a.role[0] : a.role; return (r as { permissions: string[] } | null)?.permissions || []; }))];

  const data: OrgControlData = { org: org || null, isPrimary: !!isPrimary, perms, policies: policies || [], courses: courses || [], featureFlags: featureFlags || [] };
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
  const proposal = one(sp.propose) ? { action: one(sp.propose), user: one(sp.user), target: one(sp.target), reason: one(sp.reason) } : null;
  return <OrganizationControl data={data} tab={asOrgTab(sp.tab)} proposal={proposal} />;
}
