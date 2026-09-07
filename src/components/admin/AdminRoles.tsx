"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Crown, Plus, ShieldCheck, Trash2, UserPlus, Lock, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, fmtDate, isAdminRole, ROLE_LABEL, type Tables } from "@/lib/utils";
import { Note, PersonLine } from "./AdminBits";
import { ADMIN_PERMISSIONS, permLabel } from "./perms";

export type AdminRoleRow = Tables<"admin_roles">;
export type AdminAssignmentRow = Tables<"admin_assignments">;

export function AdminRoles({ roles, assignments, isPrimary, primaryAdminId, orgId }: { roles: AdminRoleRow[]; assignments: AdminAssignmentRow[]; isPrimary: boolean; primaryAdminId: string | null; orgId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, people, departments } = useSession();
  const [now] = React.useState(() => Date.now());
  const [creating, setCreating] = React.useState(false);
  const [removing, setRemoving] = React.useState<AdminAssignmentRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Assign form
  const [user, setUser] = React.useState("");
  const [roleId, setRoleId] = React.useState(roles[0]?.id || "");
  const [scope, setScope] = React.useState("");
  const [expires, setExpires] = React.useState("");

  const roleById = (id: string) => roles.find((r) => r.id === id);
  const countFor = (id: string) => assignments.filter((a) => a.admin_role_id === id && (!a.expires_at || new Date(a.expires_at).getTime() > now)).length;
  const primaryPerson = people.find((p) => p.id === primaryAdminId);
  const roleAdmins = people.filter((p) => isAdminRole(p.role));
  const selectedRole = roleById(roleId);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !roleId) return;
    setBusy(true);
    const { error } = await createClient().from("admin_assignments").insert({ org_id: orgId, user_id: user, admin_role_id: roleId, scope_department_id: scope || null, expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null, granted_by: profile.id });
    setBusy(false);
    if (error) { toast.push(error.code === "23505" ? "That person already holds this role for this scope" : error.message, "danger"); return; }
    toast.push(`${people.find((p) => p.id === user)?.full_name || "Person"} is now ${selectedRole?.name || "an admin"}`, "success");
    setUser(""); setScope(""); setExpires("");
    router.refresh();
  }

  async function remove(a: AdminAssignmentRow) {
    setBusy(true);
    const { error } = await createClient().from("admin_assignments").delete().eq("id", a.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Admin role removed", "success");
    setRemoving(null);
    router.refresh();
  }

  return (
    <div className="space-y-[var(--s4)]">
      <Note tone="info" icon={<Info size={14} />}>
        <span className="font-medium">Primary admin{primaryPerson ? `: ${primaryPerson.full_name}` : ""}.</span> The primary admin (set in organization settings) and the Super Admin role cannot be removed here; only the primary admin can assign or remove admin roles. Every assignment is scoped, optionally time-boxed and attributed to the admin who granted it, and changes are audited.
        {!isPrimary && <span className="block mt-1">You are viewing in read-only mode.</span>}
      </Note>

      {/* ------------------------------------------------------------ Roles */}
      <div className="flex items-end justify-between gap-3">
        <div><div className="eyebrow">Admin roles</div><div className="text-[11px] text-muted mt-0.5">System roles come with GHL ONE; custom roles combine any permissions.</div></div>
        {isPrimary && <Button size="sm" variant="primary" onClick={() => setCreating(true)}><Plus size={14} /> Custom role</Button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-[var(--s2)] stagger">
        {roles.map((r) => (
          <Card key={r.id} className="p-3 min-w-0 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="text-sm font-medium truncate inline-flex items-center gap-1.5">{r.permissions.includes("*") ? <Crown size={13} className="text-[var(--accent)]" /> : <ShieldCheck size={13} className="text-muted" />}{r.name}</div><div className="text-[11px] text-muted truncate-2 mt-0.5">{r.description || "No description"}</div></div>
              <span className="pill tone-neutral shrink-0" title="Active assignments">{countFor(r.id)}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {r.permissions.length === 0 ? <span className="text-[11px] text-muted">No permissions</span> : r.permissions.map((p) => <Pill key={p} tone={p === "*" ? "tone-brand" : "tone-neutral"}>{permLabel(p)}</Pill>)}
            </div>
            <div className="text-[10px] text-muted mt-auto">{r.is_system ? "System role" : `Custom · ${fmtDate(r.created_at)}`}</div>
          </Card>
        ))}
      </div>

      {/* ------------------------------------------------------------ Assign */}
      {isPrimary && (
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><UserPlus size={16} className="text-[var(--brand-2)]" /> Assign a role</span>} subtitle="Scope to one department for Department Admins; set an expiry for temporary cover." />
          <form onSubmit={assign} className="px-[var(--s4)] pb-[var(--s4)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_160px_auto] gap-3 items-end">
            <Field label="Person"><PersonPicker value={user} onChange={setUser} placeholder="Choose a person…" required /></Field>
            <Field label="Role">
              <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Scope (optional)" hint={selectedRole?.permissions.includes("department.manage") ? "Department Admins should be scoped" : undefined}><DepartmentPicker value={scope} onChange={setScope} placeholder="Whole company" /></Field>
            <Field label="Expires (optional)"><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
            <Button type="submit" variant="primary" loading={busy} disabled={!user || !roleId}><Plus size={14} /> Assign</Button>
          </form>
        </Card>
      )}

      {/* ------------------------------------------------------ Assignments */}
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2">Current admins <span className="pill tone-neutral">{assignments.length + roleAdmins.length}</span></span>} subtitle={`${roleAdmins.length} by company role (Super Admin / Director / Executive) · ${assignments.length} by assignment`} />
        <div className="overflow-x-auto border-t">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-[var(--s4)] py-2 font-medium">Person</th>
                <th className="px-3 py-2 font-medium">Admin role</th>
                <th className="px-3 py-2 font-medium">Scope</th>
                <th className="px-3 py-2 font-medium">Expires</th>
                <th className="px-3 py-2 font-medium">Granted</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {roleAdmins.map((p) => (
                <tr key={`role-${p.id}`} className="row-hover">
                  <td className="px-[var(--s4)] py-2"><PersonLine id={p.id} size={24} sub={p.designation} /></td>
                  <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5"><Pill tone="tone-brand">{ROLE_LABEL[p.role]}</Pill>{p.id === primaryAdminId && <Pill tone="tone-violet"><Crown size={10} className="mr-1" />Primary</Pill>}</span></td>
                  <td className="px-3 py-2 text-muted">Whole company</td>
                  <td className="px-3 py-2 text-muted">—</td>
                  <td className="px-3 py-2 text-muted text-xs">By company role</td>
                  <td className="px-3 py-2 text-right"><span className="text-muted inline-flex items-center gap-1 text-[11px]"><Lock size={11} /> Change in People</span></td>
                </tr>
              ))}
              {assignments.map((a) => {
                const r = roleById(a.admin_role_id);
                const expired = !!a.expires_at && new Date(a.expires_at).getTime() <= now;
                const locked = a.user_id === primaryAdminId;
                return (
                  <tr key={a.id} className={cn("row-hover", expired && "opacity-60")}>
                    <td className="px-[var(--s4)] py-2"><PersonLine id={a.user_id} size={24} /></td>
                    <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 flex-wrap"><Pill tone={r?.permissions.includes("*") ? "tone-brand" : "tone-violet"}>{r?.name || "Unknown role"}</Pill>{r?.permissions.slice(0, 3).map((p) => <span key={p} className="text-[11px] text-muted">{permLabel(p)}</span>)}{(r?.permissions.length || 0) > 3 && <span className="text-[11px] text-muted">+{(r?.permissions.length || 0) - 3}</span>}</span></td>
                    <td className="px-3 py-2">{a.scope_department_id ? <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: departments.find((d) => d.id === a.scope_department_id)?.color }} />{departments.find((d) => d.id === a.scope_department_id)?.name || "Department"}</span> : <span className="text-muted">Whole company</span>}</td>
                    <td className={cn("px-3 py-2 whitespace-nowrap num", expired ? "text-danger" : "text-muted")}>{a.expires_at ? (expired ? <Pill tone="tone-danger">Expired</Pill> : fmtDate(a.expires_at)) : "Never"}</td>
                    <td className="px-3 py-2 text-xs text-muted whitespace-nowrap"><span className="inline-flex items-center gap-1">{ago(a.created_at)}{a.granted_by && <> by <PersonLine id={a.granted_by} size={14} className="!gap-1" /></>}</span></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {isPrimary ? (
                        locked ? <span className="text-muted inline-flex items-center gap-1 text-[11px]" title="The primary admin cannot be removed"><Lock size={11} /> Primary admin</span> : <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRemoving(a)}><Trash2 size={13} /> Remove</Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {assignments.length === 0 && roleAdmins.length === 0 && <tr><td colSpan={6}><EmptyState title="No admins assigned" hint="Assign a role above to delegate part of the administration." className="py-[var(--s4)]" /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <CreateRoleModal open={creating} onClose={() => setCreating(false)} orgId={orgId} />

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Remove admin role" footer={<><Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" loading={busy} onClick={() => removing && remove(removing)}><Trash2 size={14} /> Remove</Button></>}>
        {removing && <div className="text-sm space-y-2"><div className="flex items-center gap-2 flex-wrap"><PersonLine id={removing.user_id} size={22} /> <span className="text-muted">loses</span> <Pill tone="tone-violet">{roleById(removing.admin_role_id)?.name}</Pill></div><div className="text-xs text-muted">They keep their company role and everything it already allows. This change is audited.</div></div>}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------- Create role modal */
function CreateRoleModal({ open, onClose, orgId }: { open: boolean; onClose: () => void; orgId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [perms, setPerms] = React.useState<string[]>([]);
  const [custom, setCustom] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const groups = [...new Set(ADMIN_PERMISSIONS.map((p) => p.group))];
  const toggle = (k: string) => setPerms((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const addCustom = () => {
    const k = custom.trim().toLowerCase().replace(/\s+/g, ".");
    if (!k) return;
    if (!perms.includes(k)) setPerms((s) => [...s, k]);
    setCustom("");
  };

  async function save() {
    if (!name.trim() || perms.length === 0) return;
    setBusy(true);
    const { error } = await createClient().from("admin_roles").insert({ org_id: orgId, name: name.trim(), description: description.trim() || null, permissions: perms, is_system: false, created_by: profile.id });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`Role “${name.trim()}” created`, "success");
    setName(""); setDescription(""); setPerms([]); setCustom("");
    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="New custom admin role" width={640} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!name.trim() || perms.length === 0} onClick={save}><Plus size={14} /> Create role</Button></>}>
      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Onboarding Admin" required /></Field>
          <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role is for" /></Field>
        </div>
        <div>
          <span className="label">Permissions</span>
          <div className="space-y-2">
            {groups.map((g) => (
              <div key={g}>
                <div className="text-[10px] uppercase tracking-wider text-muted mb-1">{g}</div>
                <div className="flex flex-wrap gap-1.5">
                  {ADMIN_PERMISSIONS.filter((p) => p.group === g).map((p) => {
                    const on = perms.includes(p.key);
                    return <button type="button" key={p.key} title={p.hint} onClick={() => toggle(p.key)} className={cn("pill pill-lg transition-colors", on ? "tone-brand" : "tone-neutral")}>{p.label}</button>;
                  })}
                </div>
              </div>
            ))}
            {perms.filter((k) => !ADMIN_PERMISSIONS.some((p) => p.key === k)).length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Custom keys</div>
                <div className="flex flex-wrap gap-1.5">{perms.filter((k) => !ADMIN_PERMISSIONS.some((p) => p.key === k)).map((k) => <button type="button" key={k} onClick={() => toggle(k)} className="pill pill-lg tone-violet font-mono">{k} ×</button>)}</div>
              </div>
            )}
          </div>
        </div>
        <Field label="Add a custom permission key" hint="Free text for policies added later, e.g. wiki.manage. Unknown keys have no effect until a policy checks them.">
          <div className="flex gap-2"><Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="module.action" className="font-mono" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} /><Button type="button" variant="secondary" onClick={addCustom} disabled={!custom.trim()}>Add</Button></div>
        </Field>
      </div>
    </Modal>
  );
}
