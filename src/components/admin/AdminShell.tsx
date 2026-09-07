"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Shield, Users, MailPlus, Building2, Settings2, ScrollText, LayoutTemplate, Sparkles, Siren, Plug } from "lucide-react";
import { PageHeader, Tabs, EmptyState } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { isAdminRole, isManagerPlus, type Tables } from "@/lib/utils";
import { PeopleAdmin, type AdminPerson } from "./PeopleAdmin";
import { InvitesAdmin, type InviteItem } from "./InvitesAdmin";
import { DepartmentsAdmin } from "./DepartmentsAdmin";
import { OrganizationAdmin } from "./OrganizationAdmin";
import { AuditLog } from "./AuditLog";
import { TemplatesAdmin } from "./TemplatesAdmin";
import { IntelligenceAdmin } from "./IntelligenceAdmin";
import { EscalationAdmin } from "./EscalationAdmin";
import { IntegrationsAdmin } from "./IntegrationsAdmin";

export type AdminTab = "people" | "invites" | "departments" | "organization" | "escalation" | "integrations" | "audit" | "templates" | "ai";

export function AdminShell({ tab, people, invites, departments, teams, org, projectTemplates, taskTemplates, escalationRules, integrations, channels }: {
  tab: AdminTab;
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
}) {
  const router = useRouter();
  const { profile } = useSession();
  const manager = isManagerPlus(profile.role);
  const admin = isAdminRole(profile.role);
  const pending = people.filter((p) => !p.is_active).length;

  const tabs: { key: AdminTab; label: React.ReactNode; count?: number; allowed: boolean }[] = [
    { key: "people", label: <span className="inline-flex items-center gap-1.5"><Users size={14} /> People</span>, count: pending || undefined, allowed: manager },
    { key: "invites", label: <span className="inline-flex items-center gap-1.5"><MailPlus size={14} /> Invites</span>, count: invites.filter((i) => !i.accepted_at).length || undefined, allowed: manager },
    { key: "departments", label: <span className="inline-flex items-center gap-1.5"><Building2 size={14} /> Departments</span>, allowed: admin },
    { key: "organization", label: <span className="inline-flex items-center gap-1.5"><Settings2 size={14} /> Organization</span>, allowed: admin },
    { key: "escalation", label: <span className="inline-flex items-center gap-1.5"><Siren size={14} /> Escalation</span>, allowed: admin },
    { key: "integrations", label: <span className="inline-flex items-center gap-1.5"><Plug size={14} /> Integrations</span>, allowed: admin },
    { key: "audit", label: <span className="inline-flex items-center gap-1.5"><ScrollText size={14} /> Audit log</span>, allowed: manager },
    { key: "templates", label: <span className="inline-flex items-center gap-1.5"><LayoutTemplate size={14} /> Templates</span>, allowed: manager },
    { key: "ai", label: <span className="inline-flex items-center gap-1.5"><Sparkles size={14} /> Intelligence</span>, allowed: admin },
  ];
  const allowedTabs = tabs.filter((t) => t.allowed);
  const current = allowedTabs.some((t) => t.key === tab) ? tab : allowedTabs[0]?.key;

  return (
    <div className="page page-wide">
      <PageHeader eyebrow="Company" title={<span className="inline-flex items-center gap-2"><Shield size={22} className="text-[var(--brand)]" /> Administration</span>} subtitle="People, access, structure and the rules that keep the company running." />
      {allowedTabs.length === 0 ? (
        <div className="card"><EmptyState icon={<Shield size={20} />} title="Nothing to administer at your level" hint="Team leads can see this area, but managing people, invites and settings requires a manager role or above." /></div>
      ) : (
        <>
          <Tabs tabs={allowedTabs.map(({ key, label, count }) => ({ key, label, count }))} value={current} onChange={(k) => router.replace(`/admin?tab=${k}`)} className="mb-[var(--s4)]" />
          {current === "people" && <PeopleAdmin people={people} />}
          {current === "invites" && <InvitesAdmin invites={invites} />}
          {current === "departments" && <DepartmentsAdmin departments={departments} teams={teams} />}
          {current === "organization" && <OrganizationAdmin org={org} />}
          {current === "escalation" && <EscalationAdmin rules={escalationRules} />}
          {current === "integrations" && <IntegrationsAdmin integrations={integrations} channels={channels} />}
          {current === "audit" && <AuditLog />}
          {current === "templates" && <TemplatesAdmin projectTemplates={projectTemplates} taskTemplates={taskTemplates} />}
          {current === "ai" && <IntelligenceAdmin />}
        </>
      )}
    </div>
  );
}
