"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Check, DoorOpen, KeyRound, ListChecks, Play, UserCog, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { fmtDate, humanize, isAdminRole, ROLE_LABEL, type RoleLevel } from "@/lib/utils";
import { RolePill } from "@/components/people/PeopleBits";
import { Note, PersonLine } from "../AdminBits";
import { hasPerm } from "../perms";
import { todayIso, TRANSFER_STATUS_TONE, type HrData, type HrPerson, type TeamRow } from "./lib";

const ROLES: RoleLevel[] = ["super_admin", "director", "executive", "department_head", "manager", "team_lead", "employee", "intern", "consultant", "vendor", "guest"];

export function TransfersView({ data, perms }: { data: HrData; perms: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments } = useSession();
  const admin = isAdminRole(profile.role);
  const canApplyTransfer = admin || hasPerm(perms, "hr.manage", "people.manage");
  const canApplyRole = admin || hasPerm(perms, "hr.manage");
  const [transfer, setTransfer] = React.useState(false);
  const [role, setRole] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [show, setShow] = React.useState<"open" | "all">("open");

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name || "—";
  const teamName = (id: string | null) => data.teams.find((t) => t.id === id)?.name;
  const transfers = data.transfers.filter((t) => show === "all" || t.status === "proposed" || t.status === "approved");
  const changes = data.roleChanges.filter((c) => show === "all" || c.status === "proposed");

  async function applyTransfer(id: string) {
    setBusy(id);
    const { error } = await createClient().rpc("apply_transfer", { p_transfer: id });
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Transfer applied — rooms, grants and the follow-up workflow are updated", "success");
    router.refresh();
  }
  async function applyRole(id: string) {
    setBusy(id);
    const { error } = await createClient().rpc("apply_role_change", { p_change: id });
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Role change applied", "success");
    router.refresh();
  }
  async function cancel(table: "employee_transfers" | "role_changes", id: string) {
    setBusy(id);
    const { error } = await createClient().from(table).update({ status: "cancelled" }).eq("id", id);
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Cancelled", "success");
    router.refresh();
  }

  return (
    <div className="space-y-[var(--s4)]">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className="!w-auto">
          <option value="open">Proposed</option>
          <option value="all">All history</option>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={() => setRole(true)}><UserCog size={14} /> Change role</Button>
          <Button size="sm" variant="primary" onClick={() => setTransfer(true)}><ArrowRightLeft size={14} /> Propose transfer</Button>
        </div>
      </div>

      <Card>
        <CardHeader title="Department transfers" subtitle="Applying a transfer moves the person, swaps their department rooms, revokes department-scoped grants and starts the transfer workflow (permission review, team intro, record update)." />
        {transfers.length === 0 ? (
          <EmptyState icon={<ArrowRightLeft size={18} />} title="No transfers" hint={show === "open" ? "Nothing proposed right now." : "No transfers recorded yet."} className="py-[var(--s4)]" />
        ) : (
          <div className="divide-y border-t">
            {transfers.map((t) => (
              <div key={t.id} className="px-[var(--s4)] py-3 flex flex-wrap items-start gap-3">
                <PersonLine id={t.user_id} size={30} sub={<span className="inline-flex items-center gap-1">{deptName(t.from_department_id)} <ArrowRightLeft size={10} /> <span className="text-[var(--fg)]">{deptName(t.to_department_id)}</span>{teamName(t.to_team_id) ? ` · ${teamName(t.to_team_id)}` : ""}</span>} className="min-w-[220px] flex-1" />
                <div className="text-xs text-muted min-w-0 flex-1 space-y-0.5">
                  {t.to_manager_id && <div className="inline-flex items-center gap-1">New manager <PersonChip id={t.to_manager_id} size={14} /></div>}
                  <div className="num">Effective {fmtDate(t.effective_on)} · proposed {fmtDate(t.created_at)}{t.requested_by ? <> by <PersonChip id={t.requested_by} size={12} /></> : null}</div>
                  {t.reason && <div className="whitespace-pre-wrap">{t.reason}</div>}
                  {t.applied_at && <div>Applied {fmtDate(t.applied_at, true)}</div>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Pill tone={TRANSFER_STATUS_TONE[t.status] || "tone-neutral"}>{humanize(t.status)}</Pill>
                  <Blink zone={`user:${t.user_id}`} />
                  {(t.status === "proposed" || t.status === "approved") && (
                    <>
                      {canApplyTransfer && <Button size="sm" variant="primary" loading={busy === t.id} onClick={() => applyTransfer(t.id)}><Play size={13} /> Apply</Button>}
                      <Button size="sm" variant="ghost" loading={busy === t.id} onClick={() => cancel("employee_transfers", t.id)}><X size={13} /> Cancel</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Role changes" subtitle="Promotions and role changes. Applying updates the role, designation and manager, notifies the person and writes the audit trail." />
        {changes.length === 0 ? (
          <EmptyState icon={<UserCog size={18} />} title="No role changes" className="py-[var(--s4)]" />
        ) : (
          <div className="divide-y border-t">
            {changes.map((c) => (
              <div key={c.id} className="px-[var(--s4)] py-3 flex flex-wrap items-start gap-3">
                <PersonLine id={c.user_id} size={30} sub={<span className="inline-flex items-center gap-1 flex-wrap">{c.old_role ? ROLE_LABEL[c.old_role] : "?"} <ArrowRightLeft size={10} /> <RolePill role={c.new_role} />{c.new_designation ? ` · ${c.new_designation}` : ""}</span>} className="min-w-[220px] flex-1" />
                <div className="text-xs text-muted min-w-0 flex-1 space-y-0.5">
                  {c.new_manager_id && <div className="inline-flex items-center gap-1">New manager <PersonChip id={c.new_manager_id} size={14} /></div>}
                  <div className="num">Effective {fmtDate(c.effective_on)} · proposed {fmtDate(c.created_at)}</div>
                  {c.reason && <div className="whitespace-pre-wrap">{c.reason}</div>}
                  {c.applied_at && <div>Applied {fmtDate(c.applied_at, true)}</div>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Pill tone={TRANSFER_STATUS_TONE[c.status] || "tone-neutral"}>{humanize(c.status)}</Pill>
                  {c.status === "proposed" && (
                    <>
                      {canApplyRole && <Button size="sm" variant="primary" loading={busy === c.id} onClick={() => applyRole(c.id)}><Play size={13} /> Apply</Button>}
                      <Button size="sm" variant="ghost" loading={busy === c.id} onClick={() => cancel("role_changes", c.id)}><X size={13} /> Cancel</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <TransferModal open={transfer} people={data.people} teams={data.teams} onClose={() => setTransfer(false)} />
      <RoleChangeModal open={role} people={data.people} onClose={() => setRole(false)} />
    </div>
  );
}

/* ---------------------------------------------------------- Transfer */
export function TransferModal({ open, person, people, teams, onClose }: { open: boolean; person?: HrPerson | null; people?: HrPerson[]; teams: TeamRow[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments } = useSession();
  const [userId, setUserId] = React.useState(person?.id || "");
  const [toDept, setToDept] = React.useState("");
  const [toManager, setToManager] = React.useState("");
  const [toTeam, setToTeam] = React.useState("");
  const [effective, setEffective] = React.useState(() => todayIso());
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const subject = person || (people || []).find((p) => p.id === userId) || null;
  const fromDept = departments.find((d) => d.id === subject?.department_id);
  const toDeptRow = departments.find((d) => d.id === toDept);

  async function submit() {
    if (!profile.org_id || !subject || !toDept) return;
    setBusy(true);
    const { error } = await createClient().from("employee_transfers").insert({ org_id: profile.org_id, user_id: subject.id, from_department_id: subject.department_id, to_department_id: toDept, from_manager_id: subject.manager_id, to_manager_id: toManager || null, to_team_id: toTeam || null, effective_on: effective, reason: reason.trim() || null, requested_by: profile.id });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`Transfer proposed for ${subject.full_name}`, "success");
    onClose();
    router.refresh();
    router.replace("/admin?tab=hr&view=transfers");
  }

  return (
    <Modal open={open} onClose={onClose} title="Propose a transfer" width={560} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!subject || !toDept || toDept === subject?.department_id} onClick={submit}><Check size={15} /> Propose</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {person ? (
            <div className="sm:col-span-2"><PersonLine id={person.id} name={person.full_name} size={32} sub={fromDept ? `Currently in ${fromDept.name}` : "No department"} /></div>
          ) : (
            <Field label="Person" className="sm:col-span-2"><PersonPicker value={userId} onChange={(v) => { setUserId(v); setToTeam(""); }} placeholder="Choose a person…" /></Field>
          )}
          <Field label="To department"><DepartmentPicker value={toDept} onChange={(v) => { setToDept(v); setToTeam(""); }} placeholder="Choose…" /></Field>
          <Field label="To team">
            <Select value={toTeam} onChange={(e) => setToTeam(e.target.value)}>
              <option value="">No team</option>
              {teams.filter((t) => !toDept || t.department_id === toDept).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          {/* Interns, consultants and individual contributors were all offered as "New manager".
              Managers and above only — the person being transferred needs a real reporting line. */}
          <Field label="New manager" hint="Team leads and above. Leave empty to keep the current manager."><PersonPicker value={toManager} onChange={setToManager} placeholder="Keep current" departmentId={toDept || undefined} minRole="team_lead" excludeIds={userId ? [userId] : undefined} /></Field>
          <Field label="Effective on"><Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} /></Field>
          <Field label="Reason" className="sm:col-span-2"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shared with the person when the transfer is applied." /></Field>
        </div>
        <Consequences kind="transfer" from={fromDept?.name} to={toDeptRow?.name} />
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------- Role change */
export function RoleChangeModal({ open, person, people, onClose }: { open: boolean; person?: HrPerson | null; people?: HrPerson[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [userId, setUserId] = React.useState(person?.id || "");
  const subject = person || (people || []).find((p) => p.id === userId) || null;
  const [newRole, setNewRole] = React.useState<RoleLevel>(subject?.role || "employee");
  const [designation, setDesignation] = React.useState(subject?.designation || "");
  const [manager, setManager] = React.useState("");
  const [effective, setEffective] = React.useState(() => todayIso());
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function pick(v: string) {
    setUserId(v);
    const p = (people || []).find((x) => x.id === v);
    if (p) { setNewRole(p.role); setDesignation(p.designation || ""); }
  }

  async function submit() {
    if (!profile.org_id || !subject) return;
    setBusy(true);
    const { error } = await createClient().from("role_changes").insert({ org_id: profile.org_id, user_id: subject.id, old_role: subject.role, new_role: newRole, old_designation: subject.designation, new_designation: designation.trim() || null, new_manager_id: manager || null, effective_on: effective, reason: reason.trim() || null, requested_by: profile.id });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`Role change proposed for ${subject.full_name}`, "success");
    onClose();
    router.refresh();
    router.replace("/admin?tab=hr&view=transfers");
  }

  return (
    <Modal open={open} onClose={onClose} title="Change role" width={560} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!subject} onClick={submit}><Check size={15} /> Propose</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {person ? (
            <div className="sm:col-span-2 flex items-center gap-2"><PersonLine id={person.id} name={person.full_name} size={32} sub={person.designation || "—"} /><span className="ml-auto"><RolePill role={person.role} /></span></div>
          ) : (
            <Field label="Person" className="sm:col-span-2"><PersonPicker value={userId} onChange={pick} placeholder="Choose a person…" /></Field>
          )}
          <Field label="New role">
            <Select value={newRole} onChange={(e) => setNewRole(e.target.value as RoleLevel)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
          </Field>
          <Field label="New designation"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Team Lead — Sales" /></Field>
          <Field label="New manager" hint="Team leads and above. Leave empty to keep the current manager."><PersonPicker value={manager} onChange={setManager} placeholder="Keep current" minRole="team_lead" excludeIds={userId ? [userId] : undefined} /></Field>
          <Field label="Effective on"><Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} /></Field>
          <Field label="Reason" className="sm:col-span-2"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shared with the person when applied." /></Field>
        </div>
        {newRole === "super_admin" && <Note tone="warn">Only the primary admin can grant Super Admin. Applying will be refused otherwise.</Note>}
        <Consequences kind="role" />
      </div>
    </Modal>
  );
}

/** Plain-words explanation of what applying does (mirrors apply_transfer / apply_role_change in 0012_hr_ops.sql). */
function Consequences({ kind, from, to }: { kind: "transfer" | "role"; from?: string; to?: string }) {
  const items = kind === "transfer"
    ? [
        { icon: <DoorOpen size={12} />, text: `Leaves the ${from || "old department"} rooms and joins the ${to || "new department"} rooms.` },
        { icon: <KeyRound size={12} />, text: `Access grants scoped to ${from || "the old department"} are revoked — nothing lingers silently.` },
        { icon: <ListChecks size={12} />, text: "The “Department transfer” workflow starts: permission review (IT), team introduction (manager), record update (HR)." },
      ]
    : [
        { icon: <UserCog size={12} />, text: "Role, designation and manager are updated on the profile; the person is notified." },
        { icon: <KeyRound size={12} />, text: "What they can see follows the new role immediately (projects, channels, admin areas)." },
        { icon: <ListChecks size={12} />, text: "Every change is written to the audit log with the old and new values." },
      ];
  return (
    <div className="sunken rounded-[var(--radius-sm)] p-3">
      <div className="eyebrow mb-1.5">When applied</div>
      <ul className="space-y-1 text-xs">{items.map((i, n) => <li key={n} className="flex items-start gap-2"><span className="text-muted mt-0.5 shrink-0">{i.icon}</span><span>{i.text}</span></li>)}</ul>
    </div>
  );
}
