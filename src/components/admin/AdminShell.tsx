"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, Users, MailPlus, Building2, Settings2, ScrollText, LayoutTemplate, Sparkles, Siren, Plug, Activity, KeyRound, Crown, Eye, ToggleRight, ShieldAlert, Hourglass, Inbox, HeartHandshake, Workflow, Network, ClipboardList, LayoutGrid } from "lucide-react";
import { PageHeader, Tabs, EmptyState } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink, useSeen } from "@/components/providers/ActivityProvider";
import { cn, type Tables } from "@/lib/utils";
import { PeopleAdmin, type AdminPerson } from "./PeopleAdmin";
import { InvitesAdmin, type InviteItem } from "./InvitesAdmin";
import { DepartmentsAdmin } from "./DepartmentsAdmin";
import { OrganizationAdmin } from "./OrganizationAdmin";
import { AuditLog } from "./AuditLog";
import { TemplatesAdmin } from "./TemplatesAdmin";
import { IntelligenceAdmin } from "./IntelligenceAdmin";
import { EscalationAdmin } from "./EscalationAdmin";
import { IntegrationsAdmin } from "./IntegrationsAdmin";
import { CompanyNow, type CollabRow, type CompanyNowData } from "./CompanyNow";
import { AccessAdmin, type AccessGrantRow, type AccessRequestRow } from "./AccessAdmin";
import { AdminRoles, type AdminAssignmentRow, type AdminRoleRow } from "./AdminRoles";
import { VisibilityAdmin } from "./VisibilityAdmin";
import { FeatureFlags, type FeatureFlagRow } from "./FeatureFlags";
import { SecurityCenter, type ExpiringGrant, type GuestRow, type SecurityAuditRow, type SecurityEventRow } from "./SecurityCenter";
import { ADMIN_TABS, tabAllowed, type AdminTab } from "./perms";
import { HrConsole, WorkflowsView, type HrData, type HrView } from "./hr";
import { ScreenAccessManager, type ScreenData } from "./screens/ScreenAccessManager";
import { ReportingTree } from "./people/ReportingTree";
import { Responsibilities } from "./people/Responsibilities";
import type { SystemRolesData } from "./roles/SystemRoles";
import type { ResponsibilityRow, StructurePerson } from "./people/lib";

export type { AdminTab } from "./perms";

/** Phase 5 data — each slice is loaded only when its tab is shown (null otherwise). */
export type OrgControlSlices = {
  systemRoles: SystemRolesData | null;
  screens: ScreenData | null;
  structure: StructurePerson[] | null;
  responsibilities: { rows: ResponsibilityRow[]; knowledge: { id: string; title: string }[] } | null;
  review: string | null;
};

export type Governance = { accessPending: number; highRisk: number; staleApprovals: number; tempGrants: number; admins: number };

/** Everything the Super Admin control plane needs, fetched server-side with the caller's client. */
export type ControlPlaneData = {
  perms: string[];
  isPrimary: boolean;
  primaryAdminId: string | null;
  orgId: string;
  governance: Governance;
  companyNow: CompanyNowData | null;
  collab: CollabRow[];
  accessRequests: AccessRequestRow[];
  accessGrants: AccessGrantRow[];
  adminRoles: AdminRoleRow[];
  adminAssignments: AdminAssignmentRow[];
  featureFlags: FeatureFlagRow[];
  securityEvents: SecurityEventRow[];
  securityAudit: SecurityAuditRow[];
  guests: GuestRow[];
  expiringGrants: ExpiringGrant[];
};

export function AdminShell({ tab, people, invites, departments, teams, org, projectTemplates, taskTemplates, escalationRules, integrations, channels, plane, hr, hrView, run, user, slices }: {
  tab: AdminTab;
  slices: OrgControlSlices;
  /** People Operations data (only loaded when the `hr` / `workflows` tab is allowed). */
  hr: HrData | null;
  hrView: HrView;
  run?: string | null;
  user?: string | null;
  people: AdminPerson[];
  invites: InviteItem[];
  departments: Tables<"departments">[];
  teams: Tables<"teams">[];
  org: Tables<"organizations"> | null;
  projectTemplates: Tables<"project_templates">[];
  taskTemplates: Tables<"task_templates">[];
  escalationRules: Tables<"escalation_rules">[];
  integrations: Tables<"integrations">[];
  channels: { id: string; name: string; slug: string | null; type: string }[];
  plane: ControlPlaneData;
}) {
  const router = useRouter();
  const { profile } = useSession();
  useSeen("nav:/admin");
  const { perms, governance } = plane;
  const pending = people.filter((p) => !p.is_active).length;
  const allowed = (t: AdminTab) => tabAllowed(t, profile.role, perms);

  const labels: Record<AdminTab, { label: React.ReactNode; count?: number }> = {
    now: { label: <span className="inline-flex items-center gap-1.5"><Activity size={14} /> Company Now</span> },
    people: { label: <span className="inline-flex items-center gap-1.5"><Users size={14} /> People</span>, count: pending || undefined },
    invites: { label: <span className="inline-flex items-center gap-1.5"><MailPlus size={14} /> Invites</span>, count: invites.filter((i) => !i.accepted_at).length || undefined },
    hr: { label: <span className="inline-flex items-center gap-1.5"><HeartHandshake size={14} /> People Ops</span>, count: hr ? hr.assetRequests.filter((r) => r.status === "pending").length + hr.transfers.filter((t) => t.status === "proposed").length || undefined : undefined },
    workflows: { label: <span className="inline-flex items-center gap-1.5"><Workflow size={14} /> Workflows</span>, count: hr ? hr.runs.filter((r) => r.status === "running").length || undefined : undefined },
    structure: { label: <span className="inline-flex items-center gap-1.5"><Network size={14} /> Structure</span> },
    responsibilities: { label: <span className="inline-flex items-center gap-1.5"><ClipboardList size={14} /> Responsibilities</span> },
    departments: { label: <span className="inline-flex items-center gap-1.5"><Building2 size={14} /> Departments</span> },
    access: { label: <span className="inline-flex items-center gap-1.5"><KeyRound size={14} /> Access<Blink zones={plane.accessRequests.filter((r) => r.status === "pending").map((r) => `access:${r.id}`)} /></span>, count: governance.accessPending || undefined },
    roles: { label: <span className="inline-flex items-center gap-1.5"><Crown size={14} /> Roles</span> },
    screens: { label: <span className="inline-flex items-center gap-1.5"><LayoutGrid size={14} /> Screens</span> },
    visibility: { label: <span className="inline-flex items-center gap-1.5"><Eye size={14} /> Visibility</span> },
    features: { label: <span className="inline-flex items-center gap-1.5"><ToggleRight size={14} /> Features</span> },
    security: { label: <span className="inline-flex items-center gap-1.5"><ShieldAlert size={14} /> Security</span>, count: governance.highRisk || undefined },
    organization: { label: <span className="inline-flex items-center gap-1.5"><Settings2 size={14} /> Organization</span> },
    escalation: { label: <span className="inline-flex items-center gap-1.5"><Siren size={14} /> Escalation</span> },
    integrations: { label: <span className="inline-flex items-center gap-1.5"><Plug size={14} /> Integrations</span> },
    templates: { label: <span className="inline-flex items-center gap-1.5"><LayoutTemplate size={14} /> Templates</span> },
    ai: { label: <span className="inline-flex items-center gap-1.5"><Sparkles size={14} /> Intelligence</span> },
    audit: { label: <span className="inline-flex items-center gap-1.5"><ScrollText size={14} /> Audit log</span> },
  };
  const allowedTabs = ADMIN_TABS.filter(allowed).map((key) => ({ key, ...labels[key] }));
  const current = allowedTabs.some((t) => t.key === tab) ? tab : allowedTabs[0]?.key;

  return (
    <div className="page page-wide">
      <PageHeader eyebrow="Company" title={<span className="inline-flex items-center gap-2"><Shield size={22} className="text-[var(--brand)]" /> Administration</span>} subtitle="People, access, structure and the rules that keep the company running." />
      {allowedTabs.length === 0 ? (
        <div className="card"><EmptyState icon={<Shield size={20} />} title="Nothing to administer at your level" hint="Team leads can see this area, but managing people, invites and settings requires a manager role, or an admin role assigned by the primary admin." /></div>
      ) : (
        <>
          <GovernanceStrip g={governance} allowed={allowed} />
          <Tabs tabs={allowedTabs} value={current} onChange={(k) => router.replace(`/admin?tab=${k}`)} className="mb-[var(--s4)]" />
          {current === "now" && <CompanyNow initial={plane.companyNow} initialCollab={plane.collab} />}
          {current === "people" && <PeopleAdmin people={people} />}
          {current === "invites" && <InvitesAdmin invites={invites} />}
          {current === "hr" && hr && <HrConsole data={hr} perms={perms} view={hrView} run={run} user={user} />}
          {current === "workflows" && hr && <WorkflowsView runs={hr.runs} templates={hr.templates} people={hr.people} perms={perms} initialRun={run} showTemplates={allowed("hr")} />}
          {current === "structure" && slices.structure && <ReportingTree people={slices.structure} teams={teams} perms={perms} />}
          {current === "responsibilities" && slices.responsibilities && <Responsibilities rows={slices.responsibilities.rows} knowledge={slices.responsibilities.knowledge} teams={teams} perms={perms} />}
          {current === "departments" && <DepartmentsAdmin departments={departments} teams={teams} />}
          {current === "access" && <AccessAdmin requests={plane.accessRequests} grants={plane.accessGrants} perms={perms} isPrimary={plane.isPrimary} review={slices.review} />}
          {current === "roles" && <AdminRoles roles={plane.adminRoles} assignments={plane.adminAssignments} isPrimary={plane.isPrimary} primaryAdminId={plane.primaryAdminId} orgId={plane.orgId} systemRoles={slices.systemRoles} perms={perms} />}
          {current === "screens" && slices.screens && <ScreenAccessManager initial={slices.screens} orgId={plane.orgId} perms={perms} />}
          {current === "visibility" && <VisibilityAdmin perms={perms} isPrimary={plane.isPrimary} />}
          {current === "features" && <FeatureFlags flags={plane.featureFlags} orgId={plane.orgId} perms={perms} />}
          {current === "security" && <SecurityCenter events={plane.securityEvents} audit={plane.securityAudit} guests={plane.guests} expiringGrants={plane.expiringGrants} />}
          {current === "organization" && <OrganizationAdmin org={org} />}
          {current === "escalation" && <EscalationAdmin rules={escalationRules} />}
          {current === "integrations" && <IntegrationsAdmin integrations={integrations} channels={channels} />}
          {current === "templates" && <TemplatesAdmin projectTemplates={projectTemplates} taskTemplates={taskTemplates} />}
          {current === "ai" && <IntelligenceAdmin />}
          {current === "audit" && <AuditLog />}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- Governance strip */
function GovernanceStrip({ g, allowed }: { g: Governance; allowed: (t: AdminTab) => boolean }) {
  const items: { key: string; label: string; value: number; tone?: string; icon: React.ReactNode; href: string; show: boolean }[] = [
    { key: "pending", label: "Access requests", value: g.accessPending, tone: g.accessPending > 0 ? "text-warn" : undefined, icon: <Inbox size={13} />, href: "/admin?tab=access", show: allowed("access") },
    { key: "risk", label: "High-risk", value: g.highRisk, tone: g.highRisk > 0 ? "text-danger" : undefined, icon: <ShieldAlert size={13} />, href: "/admin?tab=access", show: allowed("access") || allowed("security") },
    { key: "stale", label: "Stale approvals", value: g.staleApprovals, tone: g.staleApprovals > 0 ? "text-warn" : undefined, icon: <Hourglass size={13} />, href: "/approvals?tab=all", show: true },
    { key: "temp", label: "Temporary grants", value: g.tempGrants, icon: <KeyRound size={13} />, href: "/admin?tab=access", show: allowed("access") || allowed("security") },
    { key: "admins", label: "Admins", value: g.admins, icon: <Crown size={13} />, href: "/admin?tab=roles", show: true },
  ].filter((i) => i.show);
  return (
    <div className="card mb-[var(--s3)] px-[var(--s3)] py-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
      <span className="eyebrow shrink-0 mr-2 inline-flex items-center gap-1.5"><Shield size={12} /> Governance</span>
      {items.map((i) => (
        <Link key={i.key} href={i.href} className="shrink-0 inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs row-hover">
          <span className="text-muted">{i.icon}</span>
          <span className={cn("font-semibold num", i.tone)}>{i.value}</span>
          <span className="text-muted whitespace-nowrap">{i.label}</span>
        </Link>
      ))}
    </div>
  );
}
