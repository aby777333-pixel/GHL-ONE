"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserCheck, UserX, Pencil, Check, ExternalLink, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, fmtDate, isAdminRole, ROLE_LABEL, type RoleLevel, type Profile } from "@/lib/utils";
import { RolePill } from "@/components/people/PeopleBits";

export type AdminPerson = Pick<Profile, "id" | "full_name" | "email" | "avatar_url" | "designation" | "department_id" | "manager_id" | "role" | "is_active" | "is_external" | "joined_at" | "created_at">;

const ROLES: RoleLevel[] = ["super_admin", "director", "executive", "department_head", "manager", "team_lead", "employee", "intern", "consultant", "vendor", "guest"];

export function PeopleAdmin({ people }: { people: AdminPerson[] }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments } = useSession();
  const admin = isAdminRole(profile.role);
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState<AdminPerson | null>(null);
  const [activating, setActivating] = React.useState<AdminPerson | null>(null);

  const pending = people.filter((p) => !p.is_active);
  const active = people.filter((p) => p.is_active);
  const needle = q.trim().toLowerCase();
  const list = needle ? active.filter((p) => p.full_name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle) || (p.designation || "").toLowerCase().includes(needle)) : active;

  async function toggleActive(p: AdminPerson) {
    if (!admin) return;
    if (p.id === profile.id) { toast.push("You cannot deactivate yourself", "danger"); return; }
    const { error } = await createClient().from("profiles").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(p.is_active ? `${p.full_name} deactivated` : `${p.full_name} activated`, "success");
    router.refresh();
  }

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name || "—";
  const personName = (id: string | null) => people.find((p) => p.id === id)?.full_name || "—";

  return (
    <div className="space-y-[var(--s4)]">
      {pending.length > 0 && (
        <Card className="border-[var(--warn)]">
          <CardHeader title={<span className="inline-flex items-center gap-2"><UserCheck size={16} className="text-warn" /> Pending activation</span>} subtitle={`${pending.length} account${pending.length > 1 ? "s" : ""} signed up without an invite and ${pending.length > 1 ? "are" : "is"} waiting for approval.`} />
          <div className="divide-y border-t">
            {pending.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-[var(--s4)] py-2.5">
                <Avatar name={p.full_name} src={p.avatar_url} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.full_name}</div>
                  <div className="text-xs text-muted truncate">{p.email} · signed up {fmtDate(p.created_at)}</div>
                </div>
                {admin ? <Button size="sm" variant="primary" onClick={() => setActivating(p)}><UserCheck size={14} /> Activate</Button> : <Pill tone="tone-warn">Needs an admin</Pill>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Members"
          subtitle={`${active.length} active · ${admin ? "you can change roles, departments, managers and activation" : "managers can change department, manager and designation"}`}
          action={<div className="relative hidden sm:block"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="input pl-8 !h-8 !text-xs w-[200px]" /></div>}
        />
        <div className="sm:hidden px-[var(--s4)] pb-2"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter members…" /></div>
        {list.length === 0 ? (
          <EmptyState title="No members" className="py-[var(--s4)]" />
        ) : (
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-[var(--s4)] py-2 font-medium">Person</th>
                  <th className="px-3 py-2 font-medium">Department</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Manager</th>
                  <th className="px-3 py-2 font-medium">Joined</th>
                  <th className="px-3 py-2 font-medium">Active</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((p) => (
                  <tr key={p.id} className="row-hover">
                    <td className="px-[var(--s4)] py-2">
                      <Link href={`/people/${p.id}`} className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={p.full_name} src={p.avatar_url} size={28} />
                        <div className="min-w-0"><div className="truncate font-medium">{p.full_name}{p.is_external && <span className="text-muted font-normal"> · external</span>}</div><div className="text-[11px] text-muted truncate">{p.email}{p.designation ? ` · ${p.designation}` : ""}</div></div>
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{deptName(p.department_id)}</td>
                    <td className="px-3 py-2"><RolePill role={p.role} /></td>
                    <td className="px-3 py-2 whitespace-nowrap">{personName(p.manager_id)}</td>
                    <td className="px-3 py-2 whitespace-nowrap num">{p.joined_at ? fmtDate(p.joined_at) : "—"}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => toggleActive(p)} disabled={!admin || p.id === profile.id} className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50", p.is_active ? "bg-[var(--success)]" : "bg-[var(--line-strong)]")} aria-label={p.is_active ? "Deactivate" : "Activate"}>
                        <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", p.is_active ? "translate-x-[18px]" : "translate-x-[2px]")} />
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}><Pencil size={13} /> Edit</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <EditPersonModal person={editing} onClose={() => setEditing(null)} people={people} />
      <ActivateModal person={activating} onClose={() => setActivating(null)} />
    </div>
  );
}

function EditPersonModal({ person, onClose, people }: { person: AdminPerson | null; onClose: () => void; people: AdminPerson[] }) {
  // Keyed on the person so the form state re-initialises for each member.
  return person ? <EditPersonForm key={person.id} person={person} onClose={onClose} people={people} /> : null;
}

function EditPersonForm({ person, onClose, people }: { person: AdminPerson; onClose: () => void; people: AdminPerson[] }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const admin = isAdminRole(profile.role);
  const [designation, setDesignation] = React.useState(person.designation || "");
  const [departmentId, setDepartmentId] = React.useState(person.department_id || "");
  const [managerId, setManagerId] = React.useState(person.manager_id || "");
  const [role, setRole] = React.useState<RoleLevel>(person.role);
  const [isActive, setIsActive] = React.useState(person.is_active);
  const [isExternal, setIsExternal] = React.useState(person.is_external);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const patch: Partial<Profile> = { designation: designation.trim() || null, department_id: departmentId || null, manager_id: managerId || null };
    if (admin) { patch.role = role; patch.is_active = isActive; patch.is_external = isExternal; }
    const { error } = await createClient().from("profiles").update(patch).eq("id", person.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Member updated", "success");
    onClose();
    router.refresh();
  }

  const managerOptions = people.filter((p) => p.is_active && p.id !== person.id);

  return (
    <Modal open onClose={onClose} title={`Edit ${person.full_name}`} width={520} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}><Check size={15} /> Save</Button></>}>
      {(
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar name={person.full_name} src={person.avatar_url} size={40} />
            <div className="min-w-0"><div className="font-medium truncate">{person.full_name}</div><div className="text-xs text-muted truncate">{person.email}</div></div>
            <Link href={`/people/${person.id}?edit=1`} className="ml-auto btn btn-ghost btn-sm"><ExternalLink size={13} /> Full profile</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Designation" className="sm:col-span-2"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></Field>
            <Field label="Department"><DepartmentPicker value={departmentId} onChange={setDepartmentId} /></Field>
            <Field label="Reports to">
              <Select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">No manager</option>
                {managerOptions.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.designation ? ` — ${p.designation}` : ""}</option>)}
              </Select>
            </Field>
            {admin && (
              <>
                <Field label="Role">
                  <Select value={role} onChange={(e) => setRole(e.target.value as RoleLevel)}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                </Field>
                <div className="flex flex-col justify-end gap-2 pb-1">
                  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={person.id === profile.id} className="accent-[var(--brand)]" /> Active</label>
                  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={isExternal} onChange={(e) => setIsExternal(e.target.checked)} className="accent-[var(--brand)]" /> External</label>
                </div>
              </>
            )}
          </div>
          {!admin && <p className="text-[11px] text-muted">Role and activation can only be changed by executives and above.</p>}
        </div>
      )}
    </Modal>
  );
}

function ActivateModal({ person, onClose }: { person: AdminPerson | null; onClose: () => void }) {
  return person ? <ActivateForm key={person.id} person={person} onClose={onClose} /> : null;
}

function ActivateForm({ person, onClose }: { person: AdminPerson; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [departmentId, setDepartmentId] = React.useState(person.department_id || "");
  const [managerId, setManagerId] = React.useState(person.manager_id || "");
  const [role, setRole] = React.useState<RoleLevel>(person.role);
  const [designation, setDesignation] = React.useState(person.designation || "");
  const [busy, setBusy] = React.useState(false);

  async function activate() {
    setBusy(true);
    const { error } = await createClient().from("profiles").update({ is_active: true, department_id: departmentId || null, manager_id: managerId || null, role, designation: designation.trim() || null, joined_at: person.joined_at || new Date().toISOString().slice(0, 10) }).eq("id", person.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`${person.full_name} is now active`, "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={`Activate ${person.full_name}`} width={480} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={activate} loading={busy}><UserCheck size={15} /> Activate account</Button></>}>
      {(
        <div className="space-y-3">
          <div className="text-sm text-muted">{person.email} will get access to the workspace immediately with these settings.</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value as RoleLevel)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            </Field>
            <Field label="Department"><DepartmentPicker value={departmentId} onChange={setDepartmentId} /></Field>
            <Field label="Designation"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Sales Executive" /></Field>
            <Field label="Reports to"><PersonPicker value={managerId} onChange={setManagerId} placeholder="No manager" /></Field>
          </div>
          <div className="text-[11px] text-muted inline-flex items-center gap-1"><UserX size={12} /> Not a colleague? Leave them inactive — they cannot see anything until activated.</div>
        </div>
      )}
    </Modal>
  );
}
