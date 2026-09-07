"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity, AlertTriangle, ArrowRight, Building2, Check, Crown, Eye, FolderKanban, GraduationCap, History, KeyRound, LayoutGrid, ListChecks, Lock, LockOpen, MonitorSmartphone, Network, Pencil, Plus, RefreshCw, ScrollText, ShieldAlert, ShieldCheck, Siren, Snowflake, Sun, Undo2, Users, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Pill, Progress, Select, Spinner, Tabs, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { ago, cn, fmtDate, humanize, ROLE_LABEL, type RoleLevel, type Tables } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { Metric, Note, PersonLine, Switch } from "./AdminBits";
import { hasPerm } from "./perms";
import { EMPLOYMENT_LABEL, EMPLOYMENT_TYPES } from "./hr/lib";
import { jsonArray, jsonObj, LOCKABLE_FEATURES, num, parseQuiz, POLICY_CATEGORIES, ROLE_LEVELS, str, type ConfigHistoryRow, type PolicyRow, type QuizQuestion } from "./people/lib";

import { ORG_TABS, type OrgTab } from "./orgTabs";

export type { OrgTab } from "./orgTabs";

export type OrgControlData = {
  org: Tables<"organizations"> | null;
  isPrimary: boolean;
  perms: string[];
  policies: PolicyRow[];
  courses: { id: string; title: string; status: string }[];
  featureFlags: Tables<"feature_flags">[];
};

/** Organization Control — the master switchboard (`/admin/organization`). */
export function OrganizationControl({ data, tab: initialTab }: { data: OrgControlData; tab: OrgTab }) {
  const router = useRouter();
  const { profile } = useSession();
  useSeen("nav:/admin");
  const [tab, setTab] = React.useState<OrgTab>(initialTab);
  const canSecurity = data.isPrimary || hasPerm(data.perms, "security.manage");
  const go = (t: OrgTab) => { setTab(t); router.replace(`/admin/organization?tab=${t}`, { scroll: false }); };

  const labels: Record<OrgTab, React.ReactNode> = {
    health: <span className="inline-flex items-center gap-1.5"><Activity size={13} /> Health</span>, people: <span className="inline-flex items-center gap-1.5"><Users size={13} /> People</span>, structure: <span className="inline-flex items-center gap-1.5"><Network size={13} /> Structure</span>,
    roles: <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} /> Roles</span>, screens: <span className="inline-flex items-center gap-1.5"><LayoutGrid size={13} /> Screens</span>, permissions: <span className="inline-flex items-center gap-1.5"><KeyRound size={13} /> Permissions</span>,
    policies: <span className="inline-flex items-center gap-1.5"><ScrollText size={13} /> Policies</span>, emergency: <span className="inline-flex items-center gap-1.5"><Siren size={13} /> Emergency</span>, sessions: <span className="inline-flex items-center gap-1.5"><MonitorSmartphone size={13} /> Sessions</span>,
    config: <span className="inline-flex items-center gap-1.5"><History size={13} /> Config history</span>, activity: <span className="inline-flex items-center gap-1.5"><Eye size={13} /> Activity</span>, audit: <span className="inline-flex items-center gap-1.5"><ListChecks size={13} /> Audit</span>,
  };

  return (
    <div className="page page-wide">
      <PageHeader eyebrow="Company" title={<span className="inline-flex items-center gap-2"><Crown size={22} className="text-[var(--brand)]" /> Organization Control</span>} subtitle="One place to see and steer people, structure, roles, screens, policies and security — with an undo trail." actions={<Link href="/admin" className="btn btn-secondary btn-sm">Admin console <ArrowRight size={13} /></Link>} />
      <Tabs<OrgTab> tabs={ORG_TABS.map((k) => ({ key: k, label: labels[k] }))} value={tab} onChange={go} className="mb-[var(--s4)]" />
      <div key={tab} className="anim-fade-in">
        {tab === "health" && <HealthTab />}
        {tab === "people" && <LinkGrid items={[
          { href: "/admin?tab=hr&view=people", title: "People Ops", hint: "Employee records, Employee Command Center, add & import", icon: <Users size={16} /> },
          { href: "/admin?tab=invites", title: "Invites", hint: "Pending invitations", icon: <Plus size={16} /> },
          { href: "/admin?tab=hr&view=transfers", title: "Transfers & roles", hint: "Proposals waiting to be applied", icon: <ArrowRight size={16} /> },
          { href: "/admin?tab=hr&view=probation", title: "Probation", hint: "Reviews due and overdue", icon: <ListChecks size={16} /> },
          { href: "/admin?tab=workflows", title: "Workflows", hint: "Onboarding, offboarding, transfer runs", icon: <FolderKanban size={16} /> },
          { href: "/people/team", title: "My team", hint: "Direct and indirect reports today", icon: <Users size={16} /> },
        ]} />}
        {tab === "structure" && <LinkGrid items={[
          { href: "/admin?tab=structure", title: "Reporting tree", hint: "Org chart editor, orphans, span of control, team leads", icon: <Network size={16} /> },
          { href: "/admin?tab=departments", title: "Departments & teams", hint: "Heads, on-duty, service catalog", icon: <Building2 size={16} /> },
          { href: "/admin?tab=responsibilities", title: "Responsibilities", hint: "Who owns what, backups, continuity gaps", icon: <ListChecks size={16} /> },
          { href: "/people?view=org", title: "Org chart", hint: "Public view", icon: <Eye size={16} /> },
        ]} />}
        {tab === "roles" && <LinkGrid items={[
          { href: "/admin?tab=roles", title: "System roles & admin roles", hint: "Catalogue, holders, level defaults, department defaults", icon: <ShieldCheck size={16} /> },
          { href: "/admin?tab=hr&view=people", title: "Per-person roles", hint: "Open a person → Role tab", icon: <Crown size={16} /> },
        ]} />}
        {tab === "screens" && <LinkGrid items={[
          { href: "/admin?tab=screens", title: "Screen Access Manager", hint: "Matrix, preview-as, test access, screen designer", icon: <LayoutGrid size={16} /> },
          { href: "/admin?tab=features", title: "Feature flags", hint: "Modules on / off per department", icon: <Lock size={16} /> },
        ]} />}
        {tab === "permissions" && <LinkGrid items={[
          { href: "/admin?tab=access", title: "Access requests, grants, reviews & findings", hint: "Approve, revoke, recertify", icon: <KeyRound size={16} /> },
          { href: "/admin?tab=visibility", title: "Visibility", hint: "Who can see what · explain access · view-as", icon: <Eye size={16} /> },
          { href: "/admin?tab=security", title: "Security center", hint: "Events, guests, expiring grants", icon: <ShieldAlert size={16} /> },
        ]} />}
        {tab === "policies" && <PoliciesTab data={data} />}
        {tab === "emergency" && <EmergencyTab data={data} canSecurity={canSecurity} />}
        {tab === "sessions" && <SessionsTab canSecurity={canSecurity} me={profile.id} />}
        {tab === "config" && <ConfigHistoryTab canUndo={canSecurity || hasPerm(data.perms, "system.manage")} />}
        {tab === "activity" && <LinkGrid items={[
          { href: "/admin?tab=now", title: "Company Now", hint: "Live pulse and collaboration map", icon: <Activity size={16} /> },
          { href: "/workforce", title: "Workforce Live", hint: "Attendance, breaks, coverage", icon: <Users size={16} /> },
          { href: "/command", title: "Command Center", hint: "Workload, risks, reports", icon: <Crown size={16} /> },
        ]} />}
        {tab === "audit" && <LinkGrid items={[
          { href: "/admin?tab=audit", title: "Audit log", hint: "Every recorded action with before / after", icon: <ScrollText size={16} /> },
          { href: "/admin/organization?tab=config", title: "Config history", hint: "Role, screen, permission and flag changes — undoable", icon: <History size={16} /> },
          { href: "/admin?tab=security", title: "Security trail", hint: "security.* and access.* actions", icon: <ShieldAlert size={16} /> },
        ]} />}
      </div>
    </div>
  );
}

function LinkGrid({ items }: { items: { href: string; title: string; hint: string; icon: React.ReactNode }[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[var(--s3)] stagger">
      {items.map((i) => <Link key={i.href} href={i.href} className="card card-hover p-[var(--s3)] flex items-start gap-3"><span className="w-9 h-9 rounded-[var(--radius-sm)] tone-brand inline-flex items-center justify-center shrink-0">{i.icon}</span><span className="min-w-0"><span className="block font-medium">{i.title}</span><span className="block text-xs text-muted">{i.hint}</span></span><ArrowRight size={14} className="text-muted ml-auto mt-1 shrink-0" /></Link>)}
    </div>
  );
}

/* --------------------------------------------------------------- Health */
type Health = Record<string, Json | undefined>;
function HealthTab() {
  const [h, setH] = React.useState<Health | null>(null);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => { let alive = true; createClient().rpc("org_health").then(({ data }) => { if (alive) setH(jsonObj(data)); }); return () => { alive = false; }; }, [tick]);
  if (!h) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (h.error) return <Note tone="warn">Organization health needs a manager role or People / Audit permissions.</Note>;
  const people = jsonObj(h.people);
  const list = (k: string) => jsonArray(h[k]).map((x) => jsonObj(x));
  const sections: { group: string; icon: React.ReactNode; tiles: { label: string; value: number; tone?: string; href?: string; sub?: string }[]; lists: { key: string; title: string; href: (x: Record<string, Json | undefined>) => string; label: (x: Record<string, Json | undefined>) => string }[] }[] = [
    { group: "PEOPLE", icon: <Users size={13} />, tiles: [{ label: "Employees", value: num(people.employees) }, { label: "External", value: num(people.external) }, { label: "Config incomplete", value: num(h.config_incomplete), tone: num(h.config_incomplete) ? "text-warn" : undefined, href: "/admin?tab=hr&view=people" }, { label: "Frozen", value: num(h.frozen), tone: num(h.frozen) ? "text-danger" : undefined }, { label: "Probation overdue", value: list("probation_overdue").length, tone: list("probation_overdue").length ? "text-danger" : undefined, href: "/admin?tab=hr&view=probation" }, { label: "Contracts ending 30d", value: list("contracts_ending_30d").length, tone: list("contracts_ending_30d").length ? "text-warn" : undefined }],
      lists: [{ key: "missing_manager", title: "Without manager", href: (x) => `/admin?tab=hr&view=people&user=${str(x.id)}`, label: (x) => str(x.name) }, { key: "missing_department", title: "Without department", href: (x) => `/admin?tab=hr&view=people&user=${str(x.id)}`, label: (x) => str(x.name) }, { key: "missing_designation", title: "Without designation", href: (x) => `/admin?tab=hr&view=people&user=${str(x.id)}`, label: (x) => str(x.name) }, { key: "no_responsibility", title: "No responsibility recorded", href: () => "/admin?tab=responsibilities", label: (x) => str(x.name) }, { key: "probation_overdue", title: "Probation overdue", href: () => "/admin?tab=hr&view=probation", label: (x) => `${str(x.name)} · ended ${x.ended ? fmtDate(str(x.ended)) : ""}` }, { key: "contracts_ending_30d", title: "Contracts ending", href: (x) => `/admin?tab=hr&view=people&user=${str(x.id)}`, label: (x) => `${str(x.name)} · ${x.ends ? fmtDate(str(x.ends)) : ""}` }] },
    { group: "STRUCTURE", icon: <Network size={13} />, tiles: [{ label: "Departments", value: num(people.departments) }, { label: "Teams", value: num(people.teams) }, { label: "Teams without lead", value: list("teams_without_lead").length, tone: list("teams_without_lead").length ? "text-warn" : undefined, href: "/admin?tab=structure" }, { label: "Departments without head", value: list("departments_without_head").length, tone: list("departments_without_head").length ? "text-danger" : undefined, href: "/admin?tab=departments" }, { label: "Critical without backup", value: list("critical_without_backup").length, tone: list("critical_without_backup").length ? "text-danger" : undefined, href: "/admin?tab=responsibilities" }],
      lists: [{ key: "teams_without_lead", title: "Teams without lead", href: () => "/admin?tab=structure", label: (x) => str(x.name) }, { key: "departments_without_head", title: "Departments without head", href: () => "/admin?tab=departments", label: (x) => str(x.name) }, { key: "critical_without_backup", title: "Critical responsibilities without backup", href: () => "/admin?tab=responsibilities", label: (x) => `${str(x.name)} · owner ${str(x.owner, "—")}` }] },
    { group: "ACCESS", icon: <KeyRound size={13} />, tiles: [{ label: "Pending access requests", value: num(h.pending_access_requests), tone: num(h.pending_access_requests) ? "text-warn" : undefined, href: "/admin?tab=access" }, { label: "Temp grants expiring 7d", value: num(h.temp_expiring_7d), href: "/admin?tab=security" }, { label: "Expired temp roles", value: num(h.expired_temp_roles), tone: num(h.expired_temp_roles) ? "text-warn" : undefined, href: "/admin?tab=roles", sub: "cleared every 15 min" }, { label: "Policies with unconfirmed readers", value: num(h.unacked_mandatory_policies), tone: num(h.unacked_mandatory_policies) ? "text-warn" : undefined, href: "/admin/organization?tab=policies" }], lists: [] },
    { group: "WORK", icon: <FolderKanban size={13} />, tiles: [{ label: "Overdue tasks", value: num(h.overdue_tasks), tone: num(h.overdue_tasks) ? "text-danger" : undefined, href: "/tasks?overdue=1" }, { label: "Blocked / at-risk projects", value: num(h.blocked_projects), tone: num(h.blocked_projects) ? "text-warn" : undefined, href: "/projects" }, { label: "Unowned tasks", value: list("tasks_without_owner").length, tone: list("tasks_without_owner").length ? "text-warn" : undefined }, { label: "Unowned projects", value: list("projects_without_owner").length, tone: list("projects_without_owner").length ? "text-danger" : undefined }, { label: "Unowned groups", value: list("groups_without_owner").length, tone: list("groups_without_owner").length ? "text-warn" : undefined }, { label: "Files of exited owners", value: num(h.files_of_exited_owners) }],
      lists: [{ key: "projects_without_owner", title: "Projects without an active owner", href: (x) => `/projects/${str(x.id)}`, label: (x) => str(x.name) }, { key: "tasks_without_owner", title: "Tasks without an active assignee", href: (x) => `/tasks/${str(x.id)}`, label: (x) => str(x.title) }, { key: "groups_without_owner", title: "Groups without an active owner", href: (x) => `/chat/${str(x.id)}`, label: (x) => str(x.name) }] },
  ];
  return (
    <div className="space-y-[var(--s4)]">
      <div className="flex items-center justify-between"><div className="text-xs text-muted">Nightly completeness audit notifies the primary admin; this view is live.</div><Button size="sm" variant="ghost" onClick={() => setTick((t) => t + 1)}><RefreshCw size={13} /> Refresh</Button></div>
      {sections.map((s) => (
        <section key={s.group} className="space-y-2">
          <div className="eyebrow inline-flex items-center gap-1.5">{s.icon} {s.group}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-[var(--s2)]">{s.tiles.map((t) => <Metric key={t.label} label={t.label} value={t.value} tone={t.tone} href={t.href} sub={t.sub} />)}</div>
          {s.lists.some((l) => list(l.key).length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[var(--s2)]">
              {s.lists.map((l) => { const rows = list(l.key); if (!rows.length) return null; return (
                <Card key={l.key} className="p-3"><div className="text-xs font-medium mb-1.5 flex items-center gap-1.5"><AlertTriangle size={12} className="text-warn" />{l.title} <span className="pill tone-neutral">{rows.length}</span></div><ul className="space-y-0.5 text-xs max-h-[160px] overflow-y-auto">{rows.slice(0, 30).map((x, i) => <li key={i} className="flex items-center gap-2"><span className="truncate flex-1">{l.label(x)}</span><Link href={l.href(x)} className="link shrink-0">Fix</Link></li>)}</ul></Card>
              ); })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- Policies */
function PoliciesTab({ data }: { data: OrgControlData }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [editing, setEditing] = React.useState<PolicyRow | "new" | null>(null);
  const [progress, setProgress] = React.useState<Record<string, { target: number; acked: number }> | null>(null);
  const [courseId, setCourseId] = React.useState(() => { const s = jsonObj(data.org?.settings); return str(s.security_training_course_id); });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const sb = createClient();
    Promise.all([sb.from("profiles").select("id,department_id,role,employment_type").eq("is_active", true).eq("is_external", false), sb.from("policy_acks").select("policy_id,user_id,version")]).then(([p, a]) => {
      if (!alive) return;
      const people = p.data || [];
      const acks = a.data || [];
      const out: Record<string, { target: number; acked: number }> = {};
      for (const pl of data.policies) {
        const targets = people.filter((x) => (!pl.department_ids || (x.department_id && pl.department_ids.includes(x.department_id))) && (!pl.roles || pl.roles.includes(x.role)) && (!pl.employment_types || pl.employment_types.includes(x.employment_type)));
        out[pl.id] = { target: targets.length, acked: acks.filter((k) => k.policy_id === pl.id && k.version === pl.version && targets.some((t) => t.id === k.user_id)).length };
      }
      setProgress(out);
    });
    return () => { alive = false; };
  }, [data.policies]);

  async function saveCourse() {
    if (!data.org) return;
    setSaving(true);
    const settings = { ...jsonObj(data.org.settings), security_training_course_id: courseId || null } as Json;
    const { error } = await createClient().from("organizations").update({ settings }).eq("id", data.org.id);
    setSaving(false);
    if (error) { toast.push(`Could not save: ${error.message}`, "danger"); return; }
    toast.push(courseId ? "Security training gate enabled" : "Security training gate disabled", "success"); router.refresh();
  }
  async function setStatus(p: PolicyRow, status: string) {
    const { error } = await createClient().from("policies").update({ status }).eq("id", p.id);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(status === "active" ? `“${p.title}” published — readers are notified` : `“${p.title}” ${status}`, "success"); router.refresh();
  }

  return (
    <div className="space-y-[var(--s4)]">
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><GraduationCap size={16} className="text-[var(--violet)]" /> Security training gate</span>} subtitle="When a course is set, non-managers must complete it before they can open confidential material (training_gate_ok)." />
        <div className="px-[var(--s4)] pb-[var(--s4)] flex flex-col sm:flex-row gap-2 sm:items-end">
          <Field label="Course" className="flex-1"><Select value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">No gate</option>{data.courses.map((c) => <option key={c.id} value={c.id}>{c.title}{c.status !== "published" ? ` (${c.status})` : ""}</option>)}</Select></Field>
          <Button variant="primary" loading={saving} onClick={saveCourse} disabled={!data.org || !(data.isPrimary || hasPerm(data.perms, "system.manage", "security.manage"))}><Check size={14} /> Save</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><ScrollText size={16} className="text-[var(--brand-2)]" /> Policies <span className="pill tone-neutral">{data.policies.length}</span></span>} subtitle="Markdown body, targeting, mandatory confirmation with optional quiz. Publishing creates a version and notifies every targeted person." action={<Button size="sm" variant="primary" onClick={() => setEditing("new")}><Plus size={14} /> New policy</Button>} />
        {data.policies.length === 0 ? <EmptyState icon={<ScrollText size={18} />} title="No policies yet" hint="Start with attendance, leave, IT security or conduct." className="py-[var(--s4)]" /> : (
          <div className="divide-y border-t">
            {data.policies.map((p) => {
              const pr = progress?.[p.id];
              const pct = pr && pr.target ? Math.round((pr.acked / pr.target) * 100) : 0;
              return (
                <div key={p.id} className="px-[var(--s4)] py-2.5 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate inline-flex items-center gap-2"><Link href={`/policies/${p.id}`} className="hover:underline">{p.title}</Link><Pill tone={p.status === "active" ? "tone-success" : p.status === "draft" ? "tone-neutral" : "tone-muted"}>{humanize(p.status)}</Pill><Pill tone="tone-neutral">{humanize(p.category)}</Pill><span className="text-[11px] text-muted">v{p.version}</span></div><div className="text-[11px] text-muted">Effective {fmtDate(p.effective_on)} · {p.requires_ack ? "confirmation required" : "no confirmation"}{p.quiz ? " · quiz" : ""}{p.department_ids ? ` · ${p.department_ids.length} dept` : " · everyone"}{p.owner_id ? <> · owner <PersonLine id={p.owner_id} size={12} className="!gap-1" /></> : null}</div></div>
                  {p.requires_ack && p.status === "active" && <div className="w-[150px]"><Progress value={pct} height={5} tone={pct === 100 ? "var(--success)" : "var(--brand)"} /><div className="text-[10px] text-muted num mt-0.5">{pr ? `${pr.acked}/${pr.target} confirmed` : "…"}</div></div>}
                  <span className="inline-flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setEditing(p)}><Pencil size={12} /> Edit</Button>
                    {p.status !== "active" && <Button size="xs" variant="primary" onClick={() => setStatus(p, "active")}>Publish</Button>}
                    {p.status === "active" && <Button size="xs" variant="ghost" onClick={() => setStatus(p, "retired")}>Retire</Button>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {editing && <PolicyEditor policy={editing === "new" ? null : editing} orgId={profile.org_id || ""} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PolicyEditor({ policy, orgId, onClose }: { policy: PolicyRow | null; orgId: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments } = useSession();
  const [title, setTitle] = React.useState(policy?.title || "");
  const [category, setCategory] = React.useState(policy?.category || "conduct");
  const [body, setBody] = React.useState(policy?.body || "");
  const [effective, setEffective] = React.useState(policy?.effective_on || new Date().toISOString().slice(0, 10));
  const [requiresAck, setRequiresAck] = React.useState(policy?.requires_ack ?? true);
  const [passMark, setPassMark] = React.useState(policy?.pass_mark ?? 70);
  const [depts, setDepts] = React.useState<string[]>(policy?.department_ids || []);
  const [roles, setRoles] = React.useState<RoleLevel[]>(policy?.roles || []);
  const [types, setTypes] = React.useState<string[]>(policy?.employment_types || []);
  const [owner, setOwner] = React.useState(policy?.owner_id || profile.id);
  const [reviewAt, setReviewAt] = React.useState(policy?.review_at || "");
  const [quiz, setQuiz] = React.useState<QuizQuestion[]>(() => parseQuiz(policy?.quiz ?? null));
  const [publish, setPublish] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const flip = <T,>(set: React.Dispatch<React.SetStateAction<T[]>>, k: T) => set((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  async function save() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    const key = policy?.key || title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "").slice(0, 48);
    const q = quiz.filter((x) => x.q.trim() && x.options.filter((o) => o.trim()).length >= 2).map((x) => ({ q: x.q.trim(), options: x.options.filter((o) => o.trim()), answer: Math.min(x.answer, x.options.filter((o) => o.trim()).length - 1) }));
    const payload = { title: title.trim(), category, body, effective_on: effective, requires_ack: requiresAck, pass_mark: passMark, department_ids: depts.length ? depts : null, roles: roles.length ? roles : null, employment_types: types.length ? types : null, owner_id: owner || null, review_at: reviewAt || null, quiz: q.length ? (q as unknown as Json) : null, ...(publish ? { status: "active" } : {}) };
    const sb = createClient();
    const { error } = policy ? await sb.from("policies").update(payload).eq("id", policy.id) : await sb.from("policies").insert({ org_id: orgId, key, created_by: profile.id, ...payload, status: "draft" });
    if (!error && !policy && publish) {
      // A brand-new policy must exist before the publish trigger runs (it fires on update).
      const { data: row } = await sb.from("policies").select("id").eq("org_id", orgId).eq("key", key).maybeSingle();
      if (row) await sb.from("policies").update({ status: "active" }).eq("id", row.id);
    }
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(policy ? "Policy saved" : "Policy created", "success");
    onClose(); router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={policy ? `Edit · ${policy.title}` : "New policy"} width={800} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><label className="text-xs inline-flex items-center gap-1.5 mr-2"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="accent-[var(--brand)]" /> Publish now</label><Button variant="primary" loading={busy} disabled={!title.trim() || !body.trim()} onClick={save}><Check size={14} /> Save</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Title" className="sm:col-span-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
          <Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{POLICY_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select></Field>
        </div>
        <Field label="Body (Markdown)" hint={policy?.status === "active" ? "Changing the body of an active policy creates a new version and asks everyone to confirm again." : undefined}><Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono !text-xs" placeholder={"## Purpose\n\n…"} /></Field>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Effective on"><Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} /></Field>
          <Field label="Review at"><Input type="date" value={reviewAt} onChange={(e) => setReviewAt(e.target.value)} /></Field>
          <Field label="Owner"><PersonPicker value={owner} onChange={setOwner} /></Field>
          <Field label="Pass mark %"><Input type="number" min={0} max={100} value={passMark} onChange={(e) => setPassMark(Number(e.target.value) || 0)} disabled={!quiz.length} /></Field>
        </div>
        <Switch on={requiresAck} onChange={setRequiresAck} label="Requires read & confirm" hint="Targeted people are notified and see a banner until they confirm." />
        <div className="sunken rounded-[var(--radius-sm)] p-3 space-y-2">
          <div className="eyebrow">Targeting <span className="text-muted font-normal normal-case tracking-normal">— empty = everyone</span></div>
          <div className="flex flex-wrap gap-1.5">{departments.map((d) => <button type="button" key={d.id} onClick={() => flip(setDepts, d.id)} className={cn("pill", depts.includes(d.id) ? "tone-brand" : "tone-neutral")}>{d.name}</button>)}</div>
          <div className="flex flex-wrap gap-1.5">{ROLE_LEVELS.map((r) => <button type="button" key={r} onClick={() => flip(setRoles, r)} className={cn("pill", roles.includes(r) ? "tone-violet" : "tone-neutral")}>{ROLE_LABEL[r]}</button>)}</div>
          <div className="flex flex-wrap gap-1.5">{EMPLOYMENT_TYPES.map((t) => <button type="button" key={t} onClick={() => flip<string>(setTypes, t)} className={cn("pill", types.includes(t) ? "tone-info" : "tone-neutral")}>{EMPLOYMENT_LABEL[t]}</button>)}</div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="eyebrow">Quiz <span className="text-muted font-normal normal-case tracking-normal">— optional, {quiz.length} question{quiz.length === 1 ? "" : "s"}</span></span><Button size="xs" onClick={() => setQuiz((q) => [...q, { q: "", options: ["", ""], answer: 0 }])}><Plus size={12} /> Question</Button></div>
          {quiz.map((q, i) => (
            <div key={i} className="rounded-[var(--radius-sm)] border p-2.5 space-y-1.5">
              <div className="flex gap-2"><Input value={q.q} onChange={(e) => setQuiz((s) => s.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} placeholder={`Question ${i + 1}`} /><Button size="sm" variant="ghost" icon onClick={() => setQuiz((s) => s.filter((_, j) => j !== i))} aria-label="Remove"><X size={13} /></Button></div>
              {q.options.map((o, j) => <div key={j} className="flex items-center gap-2"><input type="radio" name={`ans-${i}`} checked={q.answer === j} onChange={() => setQuiz((s) => s.map((x, k) => (k === i ? { ...x, answer: j } : x)))} className="accent-[var(--brand)]" title="Correct answer" /><Input value={o} onChange={(e) => setQuiz((s) => s.map((x, k) => (k === i ? { ...x, options: x.options.map((y, l) => (l === j ? e.target.value : y)) } : x)))} placeholder={`Option ${j + 1}`} className="!h-8 !text-xs" /></div>)}
              <Button size="xs" variant="ghost" onClick={() => setQuiz((s) => s.map((x, k) => (k === i ? { ...x, options: [...x.options, ""] } : x)))}><Plus size={11} /> Option</Button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ Emergency */
function EmergencyTab({ data, canSecurity }: { data: OrgControlData; canSecurity: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { departments } = useSession();
  const [dept, setDept] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const frozenDepts = departments.filter((d) => d.frozen);
  const lockedSet = new Set(data.featureFlags.filter((f) => f.locked).map((f) => f.feature));

  async function freezeDept(id: string, frozen: boolean) {
    setBusy(id);
    const { data: n, error } = await createClient().rpc("freeze_department", { p_department: id, p_frozen: frozen, p_reason: reason.trim() || undefined });
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(frozen ? `${departments.find((d) => d.id === id)?.name} frozen — ${n ?? 0} people paused` : "Department unfrozen", "success");
    setReason(""); setDept(""); router.refresh();
  }
  async function lock(feature: string, locked: boolean) {
    setBusy(feature);
    const { error } = await createClient().rpc("lock_feature", { p_feature: feature, p_locked: locked, p_reason: reason.trim() || undefined });
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(locked ? `${feature} locked company-wide` : `${feature} unlocked`, locked ? "info" : "success"); router.refresh();
  }

  return (
    <div className="space-y-[var(--s4)]">
      <Note tone="danger" icon={<Siren size={14} />}>Emergency controls act immediately and are audited with your name and reason. {data.isPrimary ? "" : "Freezing a department needs the primary admin; locking features needs Security."}</Note>
      <Field label="Reason (applies to the next action)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Suspected credential leak — IT investigating" /></Field>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s4)] items-start">
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Snowflake size={15} className="text-[var(--info)]" /> Freeze a department</span>} subtitle="Everyone in it is treated as inactive until unfrozen: no access, approvals reroute to managers outside the department." />
          <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2">
            <div className="flex gap-2"><DepartmentPicker value={dept} onChange={setDept} placeholder="Choose…" /><Button variant="danger" disabled={!dept || !data.isPrimary} loading={busy === dept && !!dept} onClick={() => freezeDept(dept, true)}><Snowflake size={14} /> Freeze</Button></div>
            {frozenDepts.length > 0 && <ul className="space-y-1">{frozenDepts.map((d) => <li key={d.id} className="flex items-center gap-2 text-sm"><Pill tone="tone-danger">Frozen</Pill><span className="flex-1">{d.name}</span><Button size="xs" variant="secondary" disabled={!data.isPrimary} loading={busy === d.id} onClick={() => freezeDept(d.id, false)}><Sun size={12} /> Unfreeze</Button></li>)}</ul>}
          </div>
        </Card>
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Lock size={15} className="text-[var(--warn)]" /> Lock a feature</span>} subtitle="Locks override every flag and department scope until unlocked." />
          <ul className="divide-y border-t">
            {LOCKABLE_FEATURES.map((f) => { const locked = lockedSet.has(f.key); return (
              <li key={f.key} className="px-[var(--s4)] py-2.5 flex items-center gap-3"><span className={cn("w-8 h-8 rounded-[var(--radius-sm)] inline-flex items-center justify-center shrink-0", locked ? "tone-danger" : "sunken text-muted")}>{locked ? <Lock size={14} /> : <LockOpen size={14} />}</span><div className="min-w-0 flex-1"><div className="text-sm font-medium">{f.label}{locked && <Pill tone="tone-danger" className="ml-2">Locked</Pill>}</div><div className="text-[11px] text-muted">{f.hint}</div></div><Button size="sm" variant={locked ? "secondary" : "danger"} disabled={!canSecurity} loading={busy === f.key} onClick={() => lock(f.key, !locked)}>{locked ? "Unlock" : "Lock"}</Button></li>
            ); })}
          </ul>
        </Card>
      </div>
      <Card className="border-[var(--danger)]">
        <CardHeader title={<span className="inline-flex items-center gap-2 text-danger"><ShieldAlert size={15} /> Revoke access now</span>} subtitle="Remove one person from everything (grants, rooms, projects) and deactivate the account — for departures and compromised accounts." action={<Link href="/admin?tab=access" className="btn btn-danger btn-sm">Open revoke everywhere <ArrowRight size={13} /></Link>} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------- Sessions */
function SessionsTab({ canSecurity, me }: { canSecurity: boolean; me: string }) {
  const toast = useToast();
  const [rows, setRows] = React.useState<{ session_id: string; user_id: string; full_name: string; created_at: string; updated_at: string | null; user_agent: string | null; ip: string | null; current: boolean }[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const [q, setQ] = React.useState("");
  React.useEffect(() => { let alive = true; createClient().rpc("admin_sessions").then(({ data, error }) => { if (!alive) return; setErr(error?.message || null); setRows((data || []) as NonNullable<typeof rows>); }); return () => { alive = false; }; }, [tick]);
  async function revoke(id: string) {
    const { error } = await createClient().rpc("revoke_session", { p_session: id });
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Session revoked", "success"); setTick((t) => t + 1);
  }
  const list = (rows || []).filter((r) => !q.trim() || r.full_name.toLowerCase().includes(q.trim().toLowerCase()));
  const byUser = new Map<string, number>();
  for (const r of rows || []) byUser.set(r.user_id, (byUser.get(r.user_id) || 0) + 1);
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><MonitorSmartphone size={16} className="text-[var(--brand-2)]" /> Sessions & devices <span className="pill tone-neutral">{rows?.length ?? "…"}</span></span>} subtitle={`${byUser.size} people signed in. Revoking signs that device out immediately; the person is not otherwise affected.`} action={<div className="flex gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name" className="!h-8 !text-xs w-[160px]" /><Button size="sm" variant="ghost" icon onClick={() => setTick((t) => t + 1)} aria-label="Refresh"><RefreshCw size={14} /></Button></div>} />
      {err ? <div className="px-[var(--s4)] pb-[var(--s4)]"><Note tone="warn">{err}</Note></div> : rows === null ? <div className="flex justify-center py-6"><Spinner /></div> : list.length === 0 ? <EmptyState title="No sessions" className="py-4" /> : (
        <div className="overflow-x-auto border-t"><table className="w-full text-sm min-w-[760px]"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted"><th className="px-[var(--s4)] py-2 font-medium">Person</th><th className="px-3 py-2 font-medium">Device</th><th className="px-3 py-2 font-medium">IP</th><th className="px-3 py-2 font-medium">Last active</th><th className="px-3 py-2" /></tr></thead><tbody className="divide-y">{list.map((s) => <tr key={s.session_id} className="row-hover"><td className="px-[var(--s4)] py-2"><PersonLine id={s.user_id} name={s.full_name} size={22} />{(byUser.get(s.user_id) || 0) > 2 && <Pill tone="tone-warn" className="ml-2">{byUser.get(s.user_id)} devices</Pill>}</td><td className="px-3 py-2 text-xs truncate max-w-[320px]" title={s.user_agent || ""}>{(s.user_agent || "Unknown").slice(0, 90)}{s.current && <Pill tone="tone-info" className="ml-2">This device</Pill>}</td><td className="px-3 py-2 text-xs font-mono text-muted">{s.ip || "—"}</td><td className="px-3 py-2 text-xs text-muted num">{ago(s.updated_at || s.created_at)}</td><td className="px-3 py-2 text-right">{(canSecurity || s.user_id === me) && !s.current && <Button size="xs" variant="ghost" className="text-danger" onClick={() => revoke(s.session_id)}>Revoke</Button>}</td></tr>)}</tbody></table></div>
      )}
    </Card>
  );
}

/* --------------------------------------------------------- Config history */
const UNDOABLE = ["screen_rules", "permission_overrides", "user_roles", "delegations", "system_roles", "nav_layouts"];
function ConfigHistoryTab({ canUndo }: { canUndo: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = React.useState<ConfigHistoryRow[] | null>(null);
  const [entity, setEntity] = React.useState("");
  const [tick, setTick] = React.useState(0);
  const [busy, setBusy] = React.useState<number | null>(null);
  const [open, setOpen] = React.useState<number | null>(null);
  React.useEffect(() => {
    let alive = true;
    let q = createClient().from("config_history").select("*").order("at", { ascending: false }).limit(200);
    if (entity) q = q.eq("entity", entity);
    q.then(({ data }) => { if (alive) setRows(data || []); });
    return () => { alive = false; };
  }, [entity, tick]);
  async function undo(id: number) {
    setBusy(id);
    const { error } = await createClient().rpc("undo_config", { p_history: id });
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Change reverted", "success"); setTick((t) => t + 1); router.refresh();
  }
  const summary = (r: ConfigHistoryRow) => {
    const o = jsonObj(r.op === "DELETE" ? r.before : r.after);
    const bits = [o.perm, o.screen_key, o.scope, o.feature, o.name, o.kinds ? jsonArray(o.kinds).join("/") : null, o.allowed != null ? (o.allowed ? "allow" : "deny") : null, o.enabled != null ? (o.enabled ? "on" : "off") : null].filter((x) => x != null && x !== "").map(String);
    return bits.join(" · ") || r.entity_id || "";
  };
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><History size={16} className="text-[var(--violet)]" /> Config history</span>} subtitle="Every change to roles, screen rules, permission overrides, delegations, feature flags, admin roles and layouts — with before / after. Undo where supported." action={<Select value={entity} onChange={(e) => setEntity(e.target.value)} className="!h-8 !text-xs !w-auto"><option value="">All entities</option>{["system_roles", "user_roles", "screen_rules", "permission_overrides", "feature_flags", "delegations", "admin_assignments", "nav_layouts"].map((e) => <option key={e} value={e}>{humanize(e)}</option>)}</Select>} />
      {rows === null ? <div className="flex justify-center py-6"><Spinner /></div> : rows.length === 0 ? <EmptyState title="No configuration changes yet" className="py-4" /> : (
        <div className="divide-y border-t">
          {rows.map((r) => {
            const undone = !!r.undone_at;
            const can = canUndo && !undone && UNDOABLE.includes(r.entity);
            const isOpen = open === r.id;
            return (
              <div key={r.id} className={cn(undone && "opacity-60")}>
                <div className="px-[var(--s4)] py-2 flex flex-wrap items-center gap-2 text-sm">
                  <Pill tone={r.op === "DELETE" ? "tone-danger" : r.op === "INSERT" ? "tone-success" : "tone-info"}>{r.op}</Pill>
                  <Pill tone="tone-neutral">{humanize(r.entity)}</Pill>
                  <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} className="truncate flex-1 text-left hover:underline">{summary(r)}</button>
                  <span className="text-[11px] text-muted inline-flex items-center gap-1"><PersonLine id={r.actor_id} size={14} name={r.actor_id ? undefined : "System"} className="!gap-1" /> · {ago(r.at)}</span>
                  {undone ? <Pill tone="tone-muted">Undone {ago(r.undone_at!)}</Pill> : can ? <Button size="xs" variant="ghost" loading={busy === r.id} onClick={() => undo(r.id)}><Undo2 size={12} /> Undo</Button> : null}
                </div>
                {isOpen && <div className="px-[var(--s4)] pb-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono"><pre className="sunken rounded-[var(--radius-sm)] p-2 overflow-x-auto max-h-[200px]">{JSON.stringify(r.before, null, 1) || "—"}</pre><pre className="sunken rounded-[var(--radius-sm)] p-2 overflow-x-auto max-h-[200px]">{JSON.stringify(r.after, null, 1) || "—"}</pre></div>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

