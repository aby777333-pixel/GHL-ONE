"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity, BookOpen, Briefcase, Check, ClipboardList, Clock, Crown, ExternalLink, FileText, FolderKanban, History, KeyRound, Laptop, LayoutGrid, LifeBuoy, LogOut, MonitorSmartphone, Palmtree, Pencil, Plus, ScrollText, ShieldBan, ShieldCheck, Snowflake, Sun, Trash2, UserCog, Users, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, EmptyState, Field, Input, Modal, Pill, Select, Spinner, Tabs, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { ago, cn, fmtDate, humanize, isAdminRole, ROLE_LABEL, STATUS_LABEL, STATUS_TONE, type RoleLevel, type Tables, type TaskStatus } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { RolePill } from "@/components/people/PeopleBits";
import { KeyValue, Note, PersonLine, Switch } from "../AdminBits";
import { hasPerm } from "../perms";
import type { HrData, HrPerson } from "../hr/lib";
import { TriToggle } from "./EmployeeWizard";
import {
  ASSIGNABLE_LEVELS, DELEGATION_KINDS, EMPLOYEE_STATUS_LABEL, EMPLOYEE_STATUS_TONE, EMPLOYEE_STATUSES, LIFECYCLE_LABEL, LIFECYCLE_STAGES, lifecycleStage, PERMISSION_GROUPS, PERMISSION_KEYS, SCREEN_GROUP_LABEL, SCREEN_GROUPS,
  endOfDayIso, jsonObj, num, todayIso, type EffectiveScreen, type SystemRoleRow, type UserRoleRow,
} from "./lib";

type CenterTab = "overview" | "role" | "manager" | "screens" | "work" | "attendance" | "leave" | "files" | "groups" | "training" | "assets" | "permissions" | "activity" | "audit" | "sessions";

const TABS: { key: CenterTab; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <Briefcase size={13} /> }, { key: "role", label: "Role", icon: <ShieldCheck size={13} /> }, { key: "manager", label: "Manager", icon: <UserCog size={13} /> }, { key: "screens", label: "Screens", icon: <LayoutGrid size={13} /> },
  { key: "work", label: "Work", icon: <FolderKanban size={13} /> }, { key: "attendance", label: "Attendance", icon: <Clock size={13} /> }, { key: "leave", label: "Leave", icon: <Palmtree size={13} /> }, { key: "files", label: "Files", icon: <FileText size={13} /> }, { key: "groups", label: "Groups", icon: <Users size={13} /> },
  { key: "training", label: "Training", icon: <BookOpen size={13} /> }, { key: "assets", label: "Assets", icon: <Laptop size={13} /> }, { key: "permissions", label: "Permissions", icon: <KeyRound size={13} /> }, { key: "activity", label: "Activity", icon: <Activity size={13} /> }, { key: "audit", label: "Audit", icon: <ScrollText size={13} /> }, { key: "sessions", label: "Sessions", icon: <MonitorSmartphone size={13} /> },
];

/** Generic lazy loader: runs `load` on mount / when `key` changes; setState only inside the async callback. */
function useLoad<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = React.useState<{ key: string; data: T } | null>(null);
  const [tick, setTick] = React.useState(0);
  const loadRef = React.useRef(load);
  React.useEffect(() => { loadRef.current = load; });
  React.useEffect(() => {
    let alive = true;
    loadRef.current().then((data) => { if (alive) setState({ key, data }); });
    return () => { alive = false; };
  }, [key, tick]);
  return { data: state && state.key === key ? state.data : null, reload: () => setTick((t) => t + 1) };
}

/** Employee Command Center — every control for one person, opened from the People Ops table (`&user=<id>`). */
export function EmployeeCenter({ person, data, perms, onClose, onAction }: { person: HrPerson; data: HrData; perms: string[]; onClose: () => void; onAction: (kind: "offboard" | "transfer" | "role" | "onboarding" | "edit") => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  useSeen(`user:${person.id}`);
  const [tab, setTab] = React.useState<CenterTab>("overview");
  const [today] = React.useState(() => todayIso());
  const admin = isAdminRole(profile.role);
  const canSecurity = admin || hasPerm(perms, "security.manage");
  const canHr = admin || hasPerm(perms, "hr.manage", "people.manage");
  const self = profile.id === person.id;
  const [modal, setModal] = React.useState<null | "freeze" | "status" | "backup">(null);
  const [reason, setReason] = React.useState("");
  const [status, setStatus] = React.useState(person.status);
  const [busy, setBusy] = React.useState(false);
  const stage = lifecycleStage(person, data.runs.filter((r) => r.subject_user_id === person.id), today);

  async function freeze(freezeIt: boolean) {
    setBusy(true);
    const { error } = freezeIt ? await createClient().rpc("freeze_user", { p_user: person.id, p_reason: reason.trim() || "Frozen by admin" }) : await createClient().rpc("unfreeze_user", { p_user: person.id });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(freezeIt ? `${person.full_name} is frozen — signed out everywhere, access paused` : `${person.full_name} unfrozen`, "success");
    setModal(null); setReason("");
    router.refresh();
  }
  async function changeStatus(next: string) {
    setBusy(true);
    const { error } = await createClient().rpc("set_employee_status", { p_user: person.id, p_status: next, p_reason: reason.trim() || undefined });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`Status → ${EMPLOYEE_STATUS_LABEL[next] || next}`, "success");
    setModal(null); setReason("");
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} side width={980} title={<span className="inline-flex items-center gap-2"><Crown size={16} className="text-[var(--brand)]" /> Employee Command Center</span>}>
      <div className="space-y-[var(--s3)]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <Avatar name={person.full_name} src={person.avatar_url} size={56} presence={person.presence} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="h2 truncate">{person.full_name}</span>
              <RolePill role={person.role} />
              <Pill tone={EMPLOYEE_STATUS_TONE[person.status] || "tone-neutral"}>{EMPLOYEE_STATUS_LABEL[person.status] || humanize(person.status)}</Pill>
              {person.frozen && <Pill tone="tone-danger"><Snowflake size={10} className="mr-1" />Frozen</Pill>}
              {person.is_external && <Pill tone="tone-muted">External</Pill>}
              {person.config_incomplete && <Pill tone="tone-warn">Config incomplete</Pill>}
            </div>
            <div className="text-xs text-muted mt-0.5 truncate">{person.designation || "No designation"} · {person.email}{person.employee_code ? ` · ${person.employee_code}` : ""}</div>
            <div className="text-[11px] text-muted mt-1 inline-flex items-center gap-1.5">Lifecycle: <Pill tone="tone-info">{LIFECYCLE_LABEL[stage]}</Pill></div>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <Link href={`/people/${person.id}`} className="btn btn-ghost btn-sm"><ExternalLink size={13} /> Profile</Link>
            {canHr && <Button size="sm" variant="secondary" onClick={() => onAction("edit")}><Pencil size={13} /> Edit record</Button>}
            {canSecurity && !self && (person.frozen ? <Button size="sm" variant="secondary" loading={busy} onClick={() => freeze(false)}><Sun size={13} /> Unfreeze</Button> : <Button size="sm" variant="secondary" onClick={() => { setReason(""); setModal("freeze"); }}><Snowflake size={13} /> Freeze</Button>)}
            {canHr && !self && person.status !== "suspended" && <Button size="sm" variant="secondary" onClick={() => { setStatus("suspended"); setReason(""); setModal("status"); }}><ShieldBan size={13} /> Suspend</Button>}
            {canHr && !self && person.is_active && <Button size="sm" variant="secondary" onClick={() => { setStatus("inactive"); setReason(""); setModal("status"); }}><X size={13} /> Disable</Button>}
            {canHr && <Button size="sm" variant="secondary" onClick={() => setModal("backup")}><LifeBuoy size={13} /> Set backup</Button>}
            {canHr && !self && <Button size="sm" variant="danger" onClick={() => onAction("offboard")}><LogOut size={13} /> Offboard</Button>}
          </div>
        </div>

        <Tabs<CenterTab> tabs={TABS.map((t) => ({ key: t.key, label: <span className="inline-flex items-center gap-1.5">{t.icon} {t.label}</span> }))} value={tab} onChange={setTab} />

        <div key={tab} className="anim-fade-in">
          {tab === "overview" && <OverviewTab person={person} data={data} stage={stage} canHr={canHr} onChangeStatus={() => { setStatus(person.status); setReason(""); setModal("status"); }} onAction={onAction} />}
          {tab === "role" && <RoleTab person={person} canHr={canHr} canSecurity={canSecurity} />}
          {tab === "manager" && <ManagerTab person={person} canHr={canHr} />}
          {tab === "screens" && <ScreensTab person={person} canEdit={canSecurity || admin || hasPerm(perms, "features.manage")} />}
          {tab === "work" && <WorkTab person={person} />}
          {tab === "attendance" && <AttendanceTab person={person} />}
          {tab === "leave" && <LeaveTab person={person} />}
          {tab === "files" && <FilesTab person={person} />}
          {tab === "groups" && <GroupsTab person={person} />}
          {tab === "training" && <TrainingTab person={person} />}
          {tab === "assets" && <AssetsTab person={person} data={data} />}
          {tab === "permissions" && <PermissionsTab person={person} canSecurity={canSecurity} />}
          {tab === "activity" && <ActivityTab person={person} />}
          {tab === "audit" && <AuditTab person={person} />}
          {tab === "sessions" && <SessionsTab person={person} canSecurity={canSecurity} />}
        </div>
      </div>

      {/* Freeze */}
      <Modal open={modal === "freeze"} onClose={() => setModal(null)} title="Freeze account" footer={<><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={() => freeze(true)}><Snowflake size={14} /> Freeze now</Button></>}>
        <div className="space-y-3">
          <Note tone="danger" icon={<Snowflake size={14} />}>Freezing signs {person.full_name} out everywhere and pauses all access except Home and Inbox. Approvals route to their manager meanwhile. Nothing is deleted; unfreeze restores everything. Audited.</Note>
          <Field label="Reason"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Device reported lost — pending IT check" /></Field>
        </div>
      </Modal>

      {/* Status */}
      <Modal open={modal === "status"} onClose={() => setModal(null)} title="Change employee status" footer={<><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button variant={status === "suspended" || status === "exited" ? "danger" : "primary"} loading={busy} disabled={status === person.status} onClick={() => changeStatus(status)}><Check size={14} /> Apply</Button></>}>
        <div className="space-y-3">
          <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)}>{EMPLOYEE_STATUSES.map((s) => <option key={s} value={s}>{EMPLOYEE_STATUS_LABEL[s]}</option>)}</Select></Field>
          <div className="text-xs text-muted">{status === "suspended" ? "Suspended people are signed out and lose external sharing, export and delete; the account is inactive until reinstated." : status === "inactive" || status === "exited" ? "Deactivates the account. Prefer Offboard for a structured exit with work transfer." : status === "notice_period" ? "Removes external sharing, export and delete while they serve notice." : status === "probation" ? "Removes download, external sharing and export until confirmed." : "Restores normal permissions for the level."}</div>
          <Field label="Reason" hint="Written to role history and the audit log."><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
      </Modal>

      <BackupModal open={modal === "backup"} person={person} onClose={() => setModal(null)} />
    </Modal>
  );
}

/* ----------------------------------------------------------- Overview */
function OverviewTab({ person, data, stage, canHr, onChangeStatus, onAction }: { person: HrPerson; data: HrData; stage: string; canHr: boolean; onChangeStatus: () => void; onAction: (k: "offboard" | "transfer" | "role" | "onboarding") => void }) {
  const { departments } = useSession();
  const dept = departments.find((d) => d.id === person.department_id);
  const idx = LIFECYCLE_STAGES.indexOf(stage as (typeof LIFECYCLE_STAGES)[number]);
  const runs = data.runs.filter((r) => r.subject_user_id === person.id);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s3)]">
      <div className="card p-3 space-y-1">
        <div className="flex items-center justify-between mb-1"><span className="eyebrow">Record</span>{canHr && <Button size="xs" variant="ghost" onClick={onChangeStatus}>Change status</Button>}</div>
        <KeyValue label="Status"><Pill tone={EMPLOYEE_STATUS_TONE[person.status]}>{EMPLOYEE_STATUS_LABEL[person.status] || person.status}</Pill></KeyValue>
        <KeyValue label="Department">{dept?.name || "—"}</KeyValue>
        <KeyValue label="Team">{data.teams.find((t) => t.id === person.team_id)?.name || "—"}</KeyValue>
        <KeyValue label="Manager">{person.manager_id ? <PersonLine id={person.manager_id} size={16} /> : <span className="text-danger">Missing</span>}</KeyValue>
        <KeyValue label="Designation">{person.designation || <span className="text-danger">Missing</span>}</KeyValue>
        <KeyValue label="Joined">{person.joined_at ? fmtDate(person.joined_at) : "—"}</KeyValue>
        <KeyValue label="Probation ends">{person.probation_ends_on ? fmtDate(person.probation_ends_on) : "—"}</KeyValue>
        <KeyValue label="Contract ends">{person.contract_ends_on ? fmtDate(person.contract_ends_on) : "—"}</KeyValue>
        <KeyValue label="Notice ends">{person.notice_ends_on ? fmtDate(person.notice_ends_on) : "—"}</KeyValue>
        <KeyValue label="Last seen">{person.last_seen_at ? ago(person.last_seen_at) : "never"}</KeyValue>
        {person.frozen && <div className="text-xs text-danger mt-1">Frozen: {person.frozen_reason || "no reason recorded"}</div>}
        {person.config_incomplete && <Note tone="warn" className="mt-2">Organizational configuration incomplete — a department, designation and manager are required for every active employee.</Note>}
      </div>
      <div className="space-y-[var(--s3)]">
        <div className="card p-3">
          <div className="eyebrow mb-2">Lifecycle</div>
          <ol className="flex flex-wrap gap-1">
            {LIFECYCLE_STAGES.map((s, i) => <li key={s} className={cn("pill", i < idx ? "tone-success" : i === idx ? "tone-brand font-medium" : "tone-neutral opacity-60")}>{LIFECYCLE_LABEL[s]}</li>)}
          </ol>
          <div className="text-[11px] text-muted mt-2">Derived from status, probation, role and running workflows.</div>
        </div>
        <div className="card p-3">
          <div className="eyebrow mb-2">Workflows</div>
          {runs.length === 0 ? <div className="text-xs text-muted">No workflows yet.</div> : <ul className="space-y-1 text-sm">{runs.slice(0, 6).map((r) => <li key={r.id} className="flex items-center gap-2"><Pill tone={r.status === "running" ? "tone-info" : r.status === "completed" ? "tone-success" : "tone-muted"}>{humanize(r.status)}</Pill><Link href={`/admin?tab=workflows&run=${r.id}`} className="link truncate">{humanize(r.kind)} · {r.subject_label}</Link><span className="text-[11px] text-muted ml-auto shrink-0">{ago(r.started_at)}</span></li>)}</ul>}
          {canHr && <div className="flex flex-wrap gap-1.5 mt-2"><Button size="xs" onClick={() => onAction("onboarding")}>Start workflow</Button><Button size="xs" onClick={() => onAction("transfer")}>Transfer</Button><Button size="xs" onClick={() => onAction("role")}>Promote / change role</Button></div>}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Role */
type UserRoleJoined = UserRoleRow & { system_role: SystemRoleRow | null };

function RoleTab({ person, canHr, canSecurity }: { person: HrPerson; canHr: boolean; canSecurity: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [now] = React.useState(() => Date.now());
  const { data, reload } = useLoad(async () => {
    const sb = createClient();
    const [{ data: roles }, { data: mine }, { data: ov }, permRows] = await Promise.all([
      sb.from("system_roles").select("*").order("is_system", { ascending: false }).order("name"),
      sb.from("user_roles").select("*, system_role:system_roles(*)").eq("user_id", person.id),
      sb.from("permission_overrides").select("*").eq("user_id", person.id),
      Promise.all(PERMISSION_KEYS.map(async (p) => { const { data: ok } = await sb.rpc("has_perm", { p_perm: p.key, p_user: person.id }); return [p.key, !!ok] as const; })),
    ]);
    return { roles: (roles || []) as SystemRoleRow[], mine: (mine || []) as unknown as UserRoleJoined[], overrides: (ov || []) as Tables<"permission_overrides">[], perms: Object.fromEntries(permRows) };
  }, person.id);
  const [level, setLevel] = React.useState<RoleLevel>(person.role);
  const [roleId, setRoleId] = React.useState("");
  const [acting, setActing] = React.useState(false);
  const [expires, setExpires] = React.useState("");
  const [why, setWhy] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function saveLevel() {
    setBusy(true);
    const { error } = await createClient().from("profiles").update({ role: level }).eq("id", person.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`Level → ${ROLE_LABEL[level]}`, "success");
    router.refresh(); reload();
  }
  async function addRole() {
    if (!roleId) return;
    setBusy(true);
    const { error } = await createClient().from("user_roles").upsert({ user_id: person.id, system_role_id: roleId, acting, expires_at: endOfDayIso(expires), granted_by: profile.id, reason: why.trim() || null }, { onConflict: "user_id,system_role_id" });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Role granted", "success");
    setRoleId(""); setActing(false); setExpires(""); setWhy("");
    reload(); router.refresh();
  }
  async function removeRole(id: string) {
    const { error } = await createClient().from("user_roles").delete().eq("id", id);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Role removed", "success");
    reload(); router.refresh();
  }
  async function patchRole(id: string, patch: Partial<UserRoleRow>) {
    const { error } = await createClient().from("user_roles").update(patch).eq("id", id);
    if (error) { toast.push(error.message, "danger"); return; }
    reload();
  }
  async function setOverride(perm: string, v: "inherit" | "allow" | "deny") {
    const sb = createClient();
    const { error } = v === "inherit" ? await sb.from("permission_overrides").delete().eq("user_id", person.id).eq("perm", perm) : await sb.from("permission_overrides").upsert({ user_id: person.id, perm, allowed: v === "allow", set_by: profile.id }, { onConflict: "user_id,perm" });
    if (error) { toast.push(error.message, "danger"); return; }
    reload();
  }

  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;
  const held = new Set(data.mine.map((m) => m.system_role_id));
  return (
    <div className="space-y-[var(--s3)]">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s3)]">
        <div className="card p-3 space-y-2">
          <div className="eyebrow">Hierarchy level</div>
          <div className="flex gap-2 items-end">
            <Field label="Level" className="flex-1"><Select value={level} onChange={(e) => setLevel(e.target.value as RoleLevel)} disabled={!canHr}>{ASSIGNABLE_LEVELS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
            <Button variant="primary" size="sm" className="h-10" loading={busy} disabled={!canHr || level === person.role} onClick={saveLevel}>Save</Button>
          </div>
          <div className="text-[11px] text-muted">For promotions with an effective date and a paper trail, use <em>Promote / change role</em> on the Overview tab (creates a proposal).</div>
        </div>
        <div className="card p-3 space-y-2">
          <div className="eyebrow">Grant a system role</div>
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={!canHr}><option value="">Choose a role…</option>{data.roles.filter((r) => !held.has(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name} · {ROLE_LABEL[r.base_level]}</option>)}</Select>
          <div className="grid grid-cols-2 gap-2 items-end">
            <label className="text-xs inline-flex items-center gap-1.5 h-10"><input type="checkbox" checked={acting} onChange={(e) => setActing(e.target.checked)} className="accent-[var(--brand)]" /> Acting (temporary authority)</label>
            <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} title="Expires" />
          </div>
          <div className="flex gap-2"><Input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Reason (optional)" /><Button variant="primary" loading={busy} disabled={!roleId || !canHr} onClick={addRole}><Plus size={14} /></Button></div>
        </div>
      </div>

      <div className="card">
        <div className="px-3 pt-3 pb-2 eyebrow">System roles held <span className="pill tone-neutral ml-1">{data.mine.length}</span></div>
        {data.mine.length === 0 ? <EmptyState title="No system roles" hint="Permissions come from the hierarchy level and department defaults only." className="py-4" /> : (
          <div className="divide-y border-t">
            {data.mine.map((m) => {
              const expired = !!m.expires_at && new Date(m.expires_at).getTime() <= now;
              return (
                <div key={m.id} className={cn("px-3 py-2 flex flex-wrap items-center gap-2", expired && "opacity-60")}>
                  <span className="text-sm font-medium">{m.system_role?.name || "Role"}</span>
                  {m.system_role && <Pill tone="tone-neutral">{ROLE_LABEL[m.system_role.base_level]}</Pill>}
                  {m.acting && <Pill tone="tone-violet">Acting</Pill>}
                  {m.expires_at ? <Pill tone={expired ? "tone-danger" : "tone-warn"}>{expired ? "Expired" : `until ${fmtDate(m.expires_at)}`}</Pill> : <Pill tone="tone-muted">No expiry</Pill>}
                  <span className="text-[11px] text-muted">granted {ago(m.created_at)}{m.granted_by ? <> by <PersonLine id={m.granted_by} size={12} className="!gap-1" /></> : null}{m.reason ? ` · ${m.reason}` : ""}</span>
                  {canHr && (
                    <span className="ml-auto inline-flex items-center gap-1">
                      <Input type="date" defaultValue={m.expires_at?.slice(0, 10) || ""} onBlur={(e) => { const v = endOfDayIso(e.target.value); if (v !== m.expires_at) patchRole(m.id, { expires_at: v }); }} className="!h-7 !text-[11px] !w-[130px]" title="Change expiry" />
                      <Switch size="sm" on={m.acting} onChange={(v) => patchRole(m.id, { acting: v })} />
                      <Button size="xs" variant="ghost" className="text-danger" onClick={() => removeRole(m.id)}><Trash2 size={12} /></Button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card p-3">
        <div className="flex items-center justify-between mb-2"><span className="eyebrow">Permission profile</span><span className="text-[11px] text-muted">Effective now via <span className="font-mono">has_perm</span> · overrides win over roles, department and level</span></div>
        <div className="space-y-2">
          {PERMISSION_GROUPS.map((g) => (
            <div key={g}>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">{g}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {PERMISSION_KEYS.filter((p) => p.group === g).map((p) => {
                  const ov = data.overrides.find((o) => o.perm === p.key);
                  const on = data.perms[p.key];
                  return (
                    <div key={p.key} className="flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5" title={p.hint}>
                      <span className={cn("w-2 h-2 rounded-full shrink-0", on ? "bg-[var(--success)]" : "bg-[var(--line-strong)]")} />
                      <span className="min-w-0 flex-1"><span className="text-sm">{p.label}</span>{ov && <span className="block text-[10px] text-muted">override{ov.expires_at ? ` · until ${fmtDate(ov.expires_at)}` : ""}</span>}</span>
                      {canSecurity ? <TriToggle value={ov ? (ov.allowed ? "allow" : "deny") : "inherit"} onChange={(v) => setOverride(p.key, v)} labels={["Inherit", "Allow", "Deny"]} /> : <Pill tone={on ? "tone-success" : "tone-muted"}>{on ? "Yes" : "No"}</Pill>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Manager */
function ManagerTab({ person, canHr }: { person: HrPerson; canHr: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { data, reload } = useLoad(async () => { const { data: h } = await createClient().from("manager_history").select("*").eq("user_id", person.id).order("changed_at", { ascending: false }).limit(50); return h || []; }, person.id);
  const [kind, setKind] = React.useState<"primary" | "secondary" | "functional">("primary");
  const [target, setTarget] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [impact, setImpact] = React.useState<Record<string, Json | undefined> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const current = kind === "primary" ? person.manager_id : kind === "secondary" ? person.secondary_manager_id : person.functional_manager_id;

  async function preview() {
    if (!target) return;
    setBusy(true);
    const { data: im, error } = await createClient().rpc("change_impact", { p_user: person.id, p_new_manager: target });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setImpact(jsonObj(im));
  }
  async function apply() {
    setBusy(true);
    const { error } = await createClient().rpc("change_manager", { p_user: person.id, p_new_manager: target, p_kind: kind, p_reason: reason.trim() || undefined });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`${humanize(kind)} manager changed`, "success");
    setImpact(null); setTarget(""); setReason("");
    reload(); router.refresh();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s3)]">
      <div className="space-y-[var(--s3)]">
        <div className="card p-3 space-y-1">
          <div className="eyebrow mb-1">Reporting lines</div>
          <KeyValue label="Primary">{person.manager_id ? <PersonLine id={person.manager_id} size={16} /> : <span className="text-danger">Missing</span>}</KeyValue>
          <KeyValue label="Secondary">{person.secondary_manager_id ? <PersonLine id={person.secondary_manager_id} size={16} /> : "—"}</KeyValue>
          <KeyValue label="Functional">{person.functional_manager_id ? <PersonLine id={person.functional_manager_id} size={16} /> : "—"}</KeyValue>
        </div>
        {canHr && (
          <div className="card p-3 space-y-2">
            <div className="eyebrow">Change a manager</div>
            <div className="grid grid-cols-[130px_1fr] gap-2">
              <Select value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setImpact(null); }}><option value="primary">Primary</option><option value="secondary">Secondary</option><option value="functional">Functional</option></Select>
              <PersonPicker value={target} onChange={(v) => { setTarget(v); setImpact(null); }} placeholder="New manager…" />
            </div>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shared with both people)" />
            <Button variant="secondary" size="sm" loading={busy} disabled={!target || target === current || target === person.id} onClick={preview}>Preview impact</Button>
            {impact && (
              <div className="sunken rounded-[var(--radius-sm)] p-3 text-xs space-y-1">
                {impact.error ? <span className="text-danger">You cannot change this person&apos;s manager.</span> : (
                  <>
                    <div>Pending approvals as approver: <span className="num font-medium">{num(impact.pending_approvals_as_approver)}</span> · pending leaves: <span className="num font-medium">{num(impact.pending_leaves_as_manager)}</span></div>
                    <div>Direct reports of {person.full_name.split(" ")[0]}: <span className="num font-medium">{num(impact.direct_reports)}</span> (unchanged)</div>
                    <div>Delegations affected: <span className="num font-medium">{num(impact.approval_routes_affected)}</span></div>
                    <div>{kind === "primary" ? "Pending approvals raised by them move to the new manager. " : ""}Both people are notified; history keeps the old line.</div>
                    <Button variant="primary" size="sm" loading={busy} onClick={apply} className="mt-1"><Check size={13} /> Apply change</Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="card">
        <div className="px-3 pt-3 pb-2 eyebrow inline-flex items-center gap-1.5"><History size={12} /> Manager history</div>
        {!data ? <div className="flex justify-center py-6"><Spinner /></div> : data.length === 0 ? <EmptyState title="No changes recorded" className="py-4" /> : (
          <ul className="divide-y border-t">
            {data.map((h) => <li key={h.id} className="px-3 py-2 text-xs flex flex-wrap items-center gap-1.5"><Pill tone="tone-neutral">{humanize(h.kind)}</Pill><PersonLine id={h.old_manager_id} size={14} name={h.old_manager_id ? undefined : "None"} className="!gap-1" /> → <PersonLine id={h.new_manager_id} size={14} name={h.new_manager_id ? undefined : "None"} className="!gap-1" /><span className="text-muted ml-auto">{ago(h.changed_at)}{h.reason ? ` · ${h.reason}` : ""}</span></li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Screens */
function ScreensTab({ person, canEdit }: { person: HrPerson; canEdit: boolean }) {
  const toast = useToast();
  const { profile } = useSession();
  const { data, reload } = useLoad(async () => {
    const sb = createClient();
    const [{ data: eff }, { data: rules }] = await Promise.all([sb.rpc("effective_screens", { p_user: person.id }), sb.from("screen_rules").select("*").eq("scope", "user").eq("scope_id", person.id)]);
    return { screens: (eff || []) as EffectiveScreen[], rules: (rules || []) as Tables<"screen_rules">[] };
  }, person.id);
  const [expiry, setExpiry] = React.useState("");

  async function setRule(key: string, v: "inherit" | "allow" | "deny") {
    if (!profile.org_id) return;
    const sb = createClient();
    const { error } = v === "inherit" ? await sb.from("screen_rules").delete().eq("scope", "user").eq("scope_id", person.id).eq("screen_key", key) : await sb.from("screen_rules").upsert({ org_id: profile.org_id, scope: "user", scope_id: person.id, screen_key: key, allowed: v === "allow", expires_at: endOfDayIso(expiry), set_by: profile.id }, { onConflict: "org_id,scope,scope_id,screen_key" });
    if (error) { toast.push(error.message, "danger"); return; }
    reload();
  }

  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;
  return (
    <div className="space-y-[var(--s3)]">
      <div className="flex flex-wrap items-center gap-2">
        <Note tone="neutral" className="flex-1">Precedence: individual override → role rule → system role → department rule → department default → company default → system default. What you see here is exactly what the navigation and route guard use.</Note>
        {canEdit && <Field label="Override expiry (optional)"><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="!h-8 !text-xs" /></Field>}
      </div>
      {SCREEN_GROUPS.map((g) => {
        const list = data.screens.filter((s) => s.grp === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1">{SCREEN_GROUP_LABEL[g] || g}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {list.map((s) => {
                const rule = data.rules.find((r) => r.screen_key === s.key);
                return (
                  <div key={s.key} className="flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", s.allowed ? "bg-[var(--success)]" : "bg-[var(--line-strong)]")} />
                    <span className="min-w-0 flex-1"><span className="text-sm">{s.label}</span><span className="block text-[10px] text-muted truncate">{s.source}{rule?.expires_at ? ` · until ${fmtDate(rule.expires_at)}` : ""}</span></span>
                    {canEdit ? <TriToggle value={rule ? (rule.allowed ? "allow" : "deny") : "inherit"} onChange={(v) => setRule(s.key, v)} labels={["Inherit", "On", "Off"]} /> : <Pill tone={s.allowed ? "tone-success" : "tone-muted"}>{s.allowed ? "On" : "Off"}</Pill>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- Work */
function WorkTab({ person }: { person: HrPerson }) {
  const { data } = useLoad(async () => {
    const sb = createClient();
    const [{ data: tasks }, { data: projects }] = await Promise.all([
      sb.from("tasks").select("id,title,status,priority,due_date,project_id").eq("assignee_id", person.id).not("status", "in", "(done,cancelled)").order("due_date", { ascending: true, nullsFirst: false }).limit(40),
      sb.from("project_members").select("role, project:projects!project_members_project_id_fkey(id,name,status,progress)").eq("user_id", person.id),
    ]);
    return { tasks: tasks || [], projects: (projects || []).flatMap((m) => (m.project ? [{ role: m.role, ...(m.project as unknown as { id: string; name: string; status: string; progress: number }) }] : [])) };
  }, person.id);
  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s3)]">
      <ListCard title={`Open tasks · ${data.tasks.length}`} empty="No open tasks">{data.tasks.map((t) => <li key={t.id} className="px-3 py-1.5 flex items-center gap-2 text-sm"><Link href={`/tasks/${t.id}`} className="truncate flex-1 hover:underline">{t.title}</Link><span className={cn("pill", STATUS_TONE[t.status as TaskStatus])}>{STATUS_LABEL[t.status as TaskStatus]}</span>{t.due_date && <span className="text-[11px] text-muted num">{fmtDate(t.due_date)}</span>}</li>)}</ListCard>
      <ListCard title={`Projects · ${data.projects.length}`} empty="Not on any project">{data.projects.map((p) => <li key={p.id} className="px-3 py-1.5 flex items-center gap-2 text-sm"><Link href={`/projects/${p.id}`} className="truncate flex-1 hover:underline">{p.name}</Link><span className="text-[11px] text-muted capitalize">{p.role}</span><span className="text-[11px] text-muted num">{p.progress}%</span></li>)}</ListCard>
    </div>
  );
}

function ListCard({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return <div className="card"><div className="px-3 pt-3 pb-2 eyebrow">{title}</div>{children.length === 0 ? <EmptyState title={empty} className="py-4" /> : <ul className="divide-y border-t max-h-[420px] overflow-y-auto">{children}</ul>}</div>;
}

/* ---------------------------------------------------------- Attendance */
function AttendanceTab({ person }: { person: HrPerson }) {
  const { data } = useLoad(async () => { const { data: d } = await createClient().from("attendance_days").select("*").eq("user_id", person.id).order("day", { ascending: false }).limit(21); return d || []; }, person.id);
  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;
  const worked = data.reduce((a, d) => a + d.minutes_worked, 0);
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted">Last {data.length} recorded days · {Math.round(worked / 60)}h worked · {data.filter((d) => d.late).length} late · {data.filter((d) => d.missing_checkout).length} missing checkout. Only explicit clock events are recorded — nothing else.</div>
      <ListCard title="Attendance days" empty="No attendance recorded">{data.map((d) => <li key={d.day} className="px-3 py-1.5 flex items-center gap-2 text-sm"><span className="num w-[90px]">{fmtDate(d.day)}</span><Pill tone={d.status === "present" ? "tone-success" : d.status === "leave" ? "tone-warn" : d.status === "absent" ? "tone-danger" : "tone-info"}>{humanize(d.status)}</Pill><span className="text-[11px] text-muted num">{d.first_in ? d.first_in.slice(11, 16) : "—"} → {d.last_out ? d.last_out.slice(11, 16) : "—"}</span><span className="text-[11px] text-muted num ml-auto">{Math.round(d.minutes_worked / 60 * 10) / 10}h{d.mode ? ` · ${d.mode}` : ""}</span></li>)}</ListCard>
    </div>
  );
}

/* --------------------------------------------------------------- Leave */
function LeaveTab({ person }: { person: HrPerson }) {
  const { data } = useLoad(async () => {
    const sb = createClient();
    const [{ data: bal }, { data: leaves }] = await Promise.all([sb.rpc("my_leave_balances", { p_user: person.id }), sb.from("leaves").select("id,starts_on,ends_on,kind,status,note").eq("user_id", person.id).order("starts_on", { ascending: false }).limit(30)]);
    return { balances: bal || [], leaves: leaves || [] };
  }, person.id);
  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;
  return (
    <div className="space-y-[var(--s3)]">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{data.balances.map((b) => <div key={b.leave_type_id} className="card px-3 py-2"><div className="text-[11px] text-muted truncate">{b.name}</div><div className="text-lg font-semibold num" style={{ color: b.color }}>{b.remaining}</div><div className="text-[10px] text-muted">of {b.allocated} · {b.used} used{b.pending ? ` · ${b.pending} pending` : ""}</div></div>)}</div>
      <ListCard title="Leave requests" empty="No leave requests">{data.leaves.map((l) => <li key={l.id} className="px-3 py-1.5 flex items-center gap-2 text-sm"><span className="num">{fmtDate(l.starts_on)}{l.ends_on !== l.starts_on ? ` → ${fmtDate(l.ends_on)}` : ""}</span><Pill tone="tone-neutral" className="capitalize">{l.kind}</Pill><Pill tone={l.status === "approved" ? "tone-success" : l.status === "pending" ? "tone-warn" : "tone-muted"}>{humanize(l.status)}</Pill><span className="text-[11px] text-muted truncate ml-auto">{l.note}</span></li>)}</ListCard>
    </div>
  );
}

/* --------------------------------------------------------------- Files */
function FilesTab({ person }: { person: HrPerson }) {
  const { data } = useLoad(async () => { const { data: f } = await createClient().from("files").select("id,name,classification,folder,updated_at").eq("owner_id", person.id).order("updated_at", { ascending: false }).limit(50); return f || []; }, person.id);
  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;
  return <ListCard title={`Files owned · ${data.length}`} empty="No files owned">{data.map((f) => <li key={f.id} className="px-3 py-1.5 flex items-center gap-2 text-sm"><Link href={`/files/${f.id}`} className="truncate flex-1 hover:underline">{f.name}</Link><Pill tone={f.classification === "public" || f.classification === "internal" ? "tone-neutral" : "tone-warn"}>{humanize(f.classification)}</Pill><span className="text-[11px] text-muted">{ago(f.updated_at)}</span></li>)}</ListCard>;
}

/* -------------------------------------------------------------- Groups */
function GroupsTab({ person }: { person: HrPerson }) {
  const { data } = useLoad(async () => { const { data: m } = await createClient().from("channel_members").select("role,expires_at,joined_at, channel:channels(id,name,type,archived)").eq("user_id", person.id); return (m || []).flatMap((x) => (x.channel ? [{ ...x, channel: x.channel as unknown as { id: string; name: string; type: string; archived: boolean } }] : [])).filter((x) => x.channel.type !== "dm"); }, person.id);
  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;
  return <ListCard title={`Rooms & groups · ${data.length}`} empty="Not in any room">{data.map((m) => <li key={m.channel.id} className="px-3 py-1.5 flex items-center gap-2 text-sm"><Link href={`/chat/${m.channel.id}`} className="truncate flex-1 hover:underline">{m.channel.name}</Link><Pill tone="tone-neutral">{humanize(m.channel.type)}</Pill>{m.role !== "member" && <Pill tone="tone-violet">{humanize(m.role)}</Pill>}{m.expires_at && <Pill tone="tone-warn">until {fmtDate(m.expires_at)}</Pill>}{m.channel.archived && <Pill tone="tone-muted">Archived</Pill>}</li>)}</ListCard>;
}

/* ------------------------------------------------------------ Training */
function TrainingTab({ person }: { person: HrPerson }) {
  const { data } = useLoad(async () => { const { data: e } = await createClient().from("enrollments").select("id,status,progress,due_on,completed_at, course:courses(id,title,mandatory)").eq("user_id", person.id).order("created_at", { ascending: false }); return (e || []).flatMap((x) => (x.course ? [{ ...x, course: x.course as unknown as { id: string; title: string; mandatory: boolean } }] : [])); }, person.id);
  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;
  return <ListCard title={`Courses · ${data.length}`} empty="No enrolments">{data.map((e) => <li key={e.id} className="px-3 py-1.5 flex items-center gap-2 text-sm"><Link href={`/academy/${e.course.id}`} className="truncate flex-1 hover:underline">{e.course.title}</Link>{e.course.mandatory && <Pill tone="tone-warn">Mandatory</Pill>}<Pill tone={e.status === "completed" ? "tone-success" : "tone-info"}>{humanize(e.status)}</Pill><span className="text-[11px] text-muted num">{e.progress}%</span>{e.due_on && e.status !== "completed" && <span className="text-[11px] text-muted num">due {fmtDate(e.due_on)}</span>}</li>)}</ListCard>;
}

/* -------------------------------------------------------------- Assets */
function AssetsTab({ person, data }: { person: HrPerson; data: HrData }) {
  const mine = data.assignments.filter((a) => a.user_id === person.id && !a.returned_at);
  return <ListCard title={`Assets held · ${mine.length}`} empty="No equipment assigned">{mine.map((a) => { const asset = data.assets.find((x) => x.id === a.asset_id); return <li key={a.id} className="px-3 py-1.5 flex items-center gap-2 text-sm"><span className="truncate flex-1">{asset?.name || "Asset"} <span className="text-muted text-xs num">· {asset?.tag}</span></span><Pill tone="tone-neutral">{humanize(asset?.kind)}</Pill><span className="text-[11px] text-muted">since {fmtDate(a.assigned_at)}</span></li>; })}</ListCard>;
}

/* --------------------------------------------------------- Permissions */
function PermissionsTab({ person, canSecurity }: { person: HrPerson; canSecurity: boolean }) {
  const toast = useToast();
  const { data, reload } = useLoad(async () => {
    const sb = createClient();
    const [{ data: grants }, { data: admins }, { data: dl }] = await Promise.all([
      sb.from("access_grants").select("*").eq("user_id", person.id).is("revoked_at", null).order("created_at", { ascending: false }),
      sb.from("admin_assignments").select("*, role:admin_roles(name,permissions)").eq("user_id", person.id),
      sb.from("delegations").select("*").or(`from_user_id.eq.${person.id},to_user_id.eq.${person.id}`).order("created_at", { ascending: false }).limit(30),
    ]);
    return { grants: grants || [], admins: (admins || []) as unknown as (Tables<"admin_assignments"> & { role: { name: string; permissions: string[] } | null })[], delegations: dl || [] };
  }, person.id);
  async function revoke(id: string) {
    const { error } = await createClient().rpc("revoke_grant", { p_grant: id, p_reason: "Revoked from Employee Command Center" });
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Grant revoked", "success"); reload();
  }
  async function endDelegation(id: string) {
    const { error } = await createClient().from("delegations").update({ active: false }).eq("id", id);
    if (error) { toast.push(error.message, "danger"); return; }
    reload();
  }
  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s3)]">
      <ListCard title={`Access grants · ${data.grants.length}`} empty="No grants">{data.grants.map((g) => <li key={g.id} className="px-3 py-1.5 flex items-center gap-2 text-sm"><Pill tone="tone-neutral">{humanize(g.resource_type)}</Pill><span className="truncate flex-1 font-mono text-xs">{g.resource_id.slice(0, 8)}</span><Pill tone="tone-info">{humanize(g.level)}</Pill><span className="text-[11px] text-muted">{g.expires_at ? `until ${fmtDate(g.expires_at)}` : "permanent"}</span>{canSecurity && <Button size="xs" variant="ghost" className="text-danger" onClick={() => revoke(g.id)}>Revoke</Button>}</li>)}</ListCard>
      <ListCard title={`Admin roles · ${data.admins.length}`} empty="No admin roles">{data.admins.map((a) => <li key={a.id} className="px-3 py-1.5 flex items-center gap-2 text-sm"><Pill tone="tone-violet">{a.role?.name || "Admin role"}</Pill><span className="text-[11px] text-muted truncate flex-1">{(a.role?.permissions || []).join(", ")}</span><span className="text-[11px] text-muted">{a.expires_at ? `until ${fmtDate(a.expires_at)}` : "no expiry"}</span></li>)}</ListCard>
      <div className="lg:col-span-2"><ListCard title={`Delegations · ${data.delegations.length}`} empty="No delegations for or by this person">{data.delegations.map((d) => <li key={d.id} className={cn("px-3 py-1.5 flex flex-wrap items-center gap-2 text-sm", !d.active && "opacity-60")}><PersonLine id={d.from_user_id} size={16} /> → <PersonLine id={d.to_user_id} size={16} /><span className="text-[11px] text-muted">{d.kinds.join(", ")}</span><span className="text-[11px] text-muted ml-auto">{d.ends_at ? `until ${fmtDate(d.ends_at)}` : "open-ended"}</span>{d.active ? <Pill tone="tone-success">Active</Pill> : <Pill tone="tone-muted">Ended</Pill>}{d.active && <Button size="xs" variant="ghost" onClick={() => endDelegation(d.id)}>End</Button>}</li>)}</ListCard></div>
    </div>
  );
}

/* ------------------------------------------------------------ Activity */
function ActivityTab({ person }: { person: HrPerson }) {
  const { data } = useLoad(async () => {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86_400_000);
    const { data: rows } = await createClient().rpc("activity_timeline", { p_user: person.id, p_from: from.toISOString(), p_to: to.toISOString() });
    return rows || [];
  }, person.id);
  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;
  return (
    <div className="space-y-2">
      <Note tone="neutral">Work activity only — tasks, approvals, meetings, files, attendance the person did themselves. No keystrokes, screenshots or location. The same timeline is visible to them in their Privacy Center.</Note>
      <ListCard title={`Last 30 days · ${data.length}`} empty="No activity in the last 30 days">{data.map((r, i) => <li key={i} className="px-3 py-1.5 flex items-center gap-2 text-sm"><Pill tone="tone-neutral">{humanize(r.kind)}</Pill>{r.link ? <Link href={r.link} className="truncate flex-1 hover:underline">{r.title}</Link> : <span className="truncate flex-1">{r.title}</span>}<span className="text-[11px] text-muted num shrink-0">{fmtDate(r.occurred_at, true)}</span></li>)}</ListCard>
    </div>
  );
}

/* --------------------------------------------------------------- Audit */
function AuditTab({ person }: { person: HrPerson }) {
  const { data } = useLoad(async () => {
    const sb = createClient();
    const [{ data: logs }, { data: rh }] = await Promise.all([sb.from("audit_logs").select("id,action,summary,actor_id,created_at").eq("entity_id", person.id).order("created_at", { ascending: false }).limit(60), sb.from("role_history").select("*").eq("user_id", person.id).order("changed_at", { ascending: false }).limit(40)]);
    return { logs: logs || [], rh: rh || [] };
  }, person.id);
  const { departments } = useSession();
  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;
  const dn = (id: string | null) => departments.find((d) => d.id === id)?.name || "—";
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s3)]">
      <ListCard title={`Role & status history · ${data.rh.length}`} empty="No changes recorded">{data.rh.map((h) => <li key={h.id} className="px-3 py-1.5 text-xs space-y-0.5"><div className="flex flex-wrap gap-1">{h.old_role !== h.new_role && <span>Role {h.old_role ? ROLE_LABEL[h.old_role] : "—"} → <b>{h.new_role ? ROLE_LABEL[h.new_role] : "—"}</b></span>}{h.old_status !== h.new_status && <span>Status {h.old_status} → <b>{h.new_status}</b></span>}{h.old_designation !== h.new_designation && <span>Title {h.old_designation || "—"} → <b>{h.new_designation || "—"}</b></span>}{h.old_department_id !== h.new_department_id && <span>Dept {dn(h.old_department_id)} → <b>{dn(h.new_department_id)}</b></span>}</div><div className="text-muted flex items-center gap-1">{ago(h.changed_at)}{h.changed_by && <> · <PersonLine id={h.changed_by} size={12} className="!gap-1" /></>}{h.reason ? ` · ${h.reason}` : ""}</div></li>)}</ListCard>
      <ListCard title={`Audit log · ${data.logs.length}`} empty="No audit entries">{data.logs.map((l) => <li key={l.id} className="px-3 py-1.5 flex items-center gap-2 text-xs"><Pill tone="tone-neutral">{l.action}</Pill><span className="truncate flex-1">{l.summary}</span><span className="text-muted shrink-0">{ago(l.created_at)}</span></li>)}</ListCard>
    </div>
  );
}

/* ------------------------------------------------------------ Sessions */
function SessionsTab({ person, canSecurity }: { person: HrPerson; canSecurity: boolean }) {
  const toast = useToast();
  const { data, reload } = useLoad(async () => { const { data: s, error } = await createClient().rpc("admin_sessions", { p_user: person.id }); return { rows: s || [], error: error?.message || null }; }, person.id);
  async function revoke(id: string) {
    const { error } = await createClient().rpc("revoke_session", { p_session: id });
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Session revoked", "success"); reload();
  }
  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (data.error) return <Note tone="warn">{data.error}</Note>;
  return <ListCard title={`Active sessions · ${data.rows.length}`} empty="No active sessions">{data.rows.map((s) => <li key={s.session_id} className="px-3 py-1.5 flex items-center gap-2 text-sm"><MonitorSmartphone size={14} className="text-muted shrink-0" /><span className="truncate flex-1 text-xs" title={s.user_agent || ""}>{(s.user_agent || "Unknown device").slice(0, 80)}</span><span className="text-[11px] text-muted font-mono">{s.ip || ""}</span><span className="text-[11px] text-muted">{s.updated_at ? ago(s.updated_at) : ago(s.created_at)}</span>{s.current && <Pill tone="tone-info">This device</Pill>}{canSecurity && <Button size="xs" variant="ghost" className="text-danger" onClick={() => revoke(s.session_id)}>Revoke</Button>}</li>)}</ListCard>;
}

/* ------------------------------------------------------- Backup modal */
export function BackupModal({ open, person, onClose }: { open: boolean; person: Pick<HrPerson, "id" | "full_name">; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [to, setTo] = React.useState("");
  const [kinds, setKinds] = React.useState<string[]>(["approvals", "leave", "requests"]);
  const [until, setUntil] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const toggle = (k: string) => setKinds((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  async function save() {
    if (!profile.org_id || !to || !kinds.length) return;
    setBusy(true);
    const { error } = await createClient().from("delegations").insert({ org_id: profile.org_id, from_user_id: person.id, to_user_id: to, kinds, ends_at: endOfDayIso(until), reason: reason.trim() || null });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Backup set — routing switches automatically", "success");
    onClose(); router.refresh();
  }
  return (
    <Modal open={open} onClose={onClose} title={`Set a backup for ${person.full_name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!to || to === person.id || !kinds.length} onClick={save}><Check size={14} /> Create delegation</Button></>}>
      <div className="space-y-3">
        <Field label="Backup person"><PersonPicker value={to} onChange={setTo} placeholder="Choose…" /></Field>
        <div><span className="label">What is delegated</span><div className="flex flex-wrap gap-1.5">{DELEGATION_KINDS.map((k) => <button type="button" key={k.key} title={k.hint} onClick={() => toggle(k.key)} className={cn("pill pill-lg", kinds.includes(k.key) ? "tone-brand" : "tone-neutral")}>{k.label}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Until" hint="Empty = until ended manually"><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field><Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Annual leave" /></Field></div>
        <Note tone="info" icon={<ClipboardList size={14} />}>Approvals, leave and requests addressed to {person.full_name.split(" ")[0]} are routed to the backup while the delegation is active. The backup is notified now; both are notified when it ends.</Note>
      </div>
    </Modal>
  );
}

