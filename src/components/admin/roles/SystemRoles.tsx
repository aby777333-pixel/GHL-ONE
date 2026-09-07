"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Info, Layers, Lock, Pencil, Plus, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, fmtDate, isAdminRole, ROLE_LABEL, type RoleLevel } from "@/lib/utils";
import { Note, PersonLine } from "../AdminBits";
import { hasPerm } from "../perms";
import { ASSIGNABLE_LEVELS, PERMISSION_GROUPS, PERMISSION_KEYS, permName, ROLE_LEVELS, endOfDayIso, type RoleDefaultRow, type ScreenRow, type SystemRoleRow, type UserRoleRow } from "../people/lib";

export type SystemRolesData = { systemRoles: SystemRoleRow[]; userRoles: UserRoleRow[]; roleDefaults: RoleDefaultRow[]; screens: ScreenRow[] };

/** "System roles" section of the Admin roles tab: catalogue, assignment with expiry/acting, level defaults, department defaults. */
export function SystemRoles({ data, orgId, isPrimary, perms }: { data: SystemRolesData; orgId: string; isPrimary: boolean; perms: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, people } = useSession();
  const canManage = isAdminRole(profile.role) || hasPerm(perms, "people.manage", "security.manage");
  const [now] = React.useState(() => Date.now());
  const [editing, setEditing] = React.useState<SystemRoleRow | "new" | null>(null);
  const [removing, setRemoving] = React.useState<UserRoleRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  // assign form
  const [user, setUser] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [acting, setActing] = React.useState(false);
  const [expires, setExpires] = React.useState("");
  const [reason, setReason] = React.useState("");

  const roleById = (id: string) => data.systemRoles.find((r) => r.id === id);
  const active = (a: UserRoleRow) => !a.expires_at || new Date(a.expires_at).getTime() > now;
  const holders = (id: string) => data.userRoles.filter((a) => a.system_role_id === id && active(a)).length;

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !roleId) return;
    setBusy(true);
    const { error } = await createClient().from("user_roles").upsert({ user_id: user, system_role_id: roleId, acting, expires_at: endOfDayIso(expires), granted_by: profile.id, reason: reason.trim() || null }, { onConflict: "user_id,system_role_id" });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`${people.find((p) => p.id === user)?.full_name || "Person"} now holds ${roleById(roleId)?.name}`, "success");
    setUser(""); setActing(false); setExpires(""); setReason("");
    router.refresh();
  }
  async function remove(a: UserRoleRow) {
    setBusy(true);
    const { error } = await createClient().from("user_roles").delete().eq("id", a.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Role removed", "success"); setRemoving(null); router.refresh();
  }
  async function deleteRole(r: SystemRoleRow) {
    if (!confirm(`Delete the custom role “${r.name}”? People holding it lose its permissions.`)) return;
    const { error } = await createClient().from("system_roles").delete().eq("id", r.id);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Role deleted", "success"); router.refresh();
  }

  const sorted = data.userRoles.slice().sort((a, b) => Number(active(b)) - Number(active(a)) || b.created_at.localeCompare(a.created_at));

  return (
    <div className="space-y-[var(--s4)]">
      <div className="flex items-end justify-between gap-3">
        <div><div className="eyebrow">System roles</div><div className="text-[11px] text-muted mt-0.5">Capabilities people hold — separate from their designation. Several at once, temporary if needed.</div></div>
        {canManage && <Button size="sm" variant="primary" onClick={() => setEditing("new")}><Plus size={14} /> Custom role</Button>}
      </div>
      <Note tone="info" icon={<Info size={14} />}><span className="font-medium">Role ≠ title.</span> “Senior Designer” is a designation; <em>Design Reviewer</em> is a system role that adds the Approve permission for design work. Roles stack, can be marked <em>acting</em>, and expire automatically — the audit log records the reversal.</Note>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[var(--s2)] stagger">
        {data.systemRoles.map((r) => (
          <Card key={r.id} className="p-3 min-w-0 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="text-sm font-medium truncate inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-muted" />{r.name}<Pill tone="tone-neutral">{ROLE_LABEL[r.base_level]}</Pill></div><div className="text-[11px] text-muted truncate-2 mt-0.5">{r.description || "No description"}</div></div>
              <span className="pill tone-neutral shrink-0" title="Active holders">{holders(r.id)}</span>
            </div>
            <div className="flex flex-wrap gap-1">{r.permissions.map((p) => <Pill key={p} tone="tone-neutral">{permName(p)}</Pill>)}</div>
            {(r.screens.length > 0 || r.denied_screens.length > 0) && <div className="flex flex-wrap gap-1">{r.screens.map((s) => <Pill key={s} tone="tone-success">+ {data.screens.find((x) => x.key === s)?.label || s}</Pill>)}{r.denied_screens.map((s) => <Pill key={s} tone="tone-danger">− {data.screens.find((x) => x.key === s)?.label || s}</Pill>)}</div>}
            <div className="mt-auto flex items-center justify-between text-[10px] text-muted"><span>{r.is_system ? "Built-in" : `Custom · ${fmtDate(r.created_at)}`}</span>{canManage && <span className="inline-flex gap-1"><Button size="xs" variant="ghost" onClick={() => setEditing(r)}><Pencil size={11} /> Edit</Button>{!r.is_system && <Button size="xs" variant="ghost" className="text-danger" onClick={() => deleteRole(r)}><Trash2 size={11} /></Button>}</span>}</div>
          </Card>
        ))}
      </div>

      {canManage && (
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><UserPlus size={16} className="text-[var(--brand-2)]" /> Assign a system role</span>} subtitle="Acting = temporary authority (e.g. Acting Manager). Set an expiry so it reverts on its own." />
          <form onSubmit={assign} className="px-[var(--s4)] pb-[var(--s4)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_90px_150px_1fr_auto] gap-3 items-end">
            <Field label="Person"><PersonPicker value={user} onChange={setUser} placeholder="Choose…" required /></Field>
            <Field label="Role"><Select value={roleId} onChange={(e) => setRoleId(e.target.value)} required><option value="">Choose…</option>{data.systemRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
            <label className="text-xs inline-flex items-center gap-1.5 h-10"><input type="checkbox" checked={acting} onChange={(e) => setActing(e.target.checked)} className="accent-[var(--brand)]" /> Acting</label>
            <Field label="Expires"><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
            <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" /></Field>
            <Button type="submit" variant="primary" loading={busy} disabled={!user || !roleId}><Plus size={14} /> Assign</Button>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2">Role holders <span className="pill tone-neutral">{data.userRoles.length}</span></span>} subtitle="Every grant is attributed and recorded in config history (undoable)." />
        <div className="overflow-x-auto border-t">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted"><th className="px-[var(--s4)] py-2 font-medium">Person</th><th className="px-3 py-2 font-medium">Role</th><th className="px-3 py-2 font-medium">Expires</th><th className="px-3 py-2 font-medium">Granted</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y">
              {sorted.map((a) => { const r = roleById(a.system_role_id); const expired = !active(a); return (
                <tr key={a.id} className={cn("row-hover", expired && "opacity-60")}>
                  <td className="px-[var(--s4)] py-2"><PersonLine id={a.user_id} size={24} /></td>
                  <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 flex-wrap"><Pill tone="tone-violet">{r?.name || "Unknown"}</Pill>{a.acting && <Pill tone="tone-warn">Acting</Pill>}{a.reason && <span className="text-[11px] text-muted">{a.reason}</span>}</span></td>
                  <td className={cn("px-3 py-2 whitespace-nowrap num", expired ? "text-danger" : "text-muted")}>{a.expires_at ? (expired ? <Pill tone="tone-danger">Expired</Pill> : fmtDate(a.expires_at)) : "Never"}</td>
                  <td className="px-3 py-2 text-xs text-muted whitespace-nowrap"><span className="inline-flex items-center gap-1">{ago(a.created_at)}{a.granted_by && <> by <PersonLine id={a.granted_by} size={14} className="!gap-1" /></>}</span></td>
                  <td className="px-3 py-2 text-right">{canManage && <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRemoving(a)}><Trash2 size={13} /> Remove</Button>}</td>
                </tr>
              ); })}
              {sorted.length === 0 && <tr><td colSpan={5}><EmptyState title="No system roles assigned yet" hint="Assign above, or from the Employee Command Center." className="py-[var(--s4)]" /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-[var(--s4)] items-start">
        <LevelDefaults defaults={data.roleDefaults} orgId={orgId} isPrimary={isPrimary} />
        <DepartmentDefaults screens={data.screens} canManage={canManage} />
      </div>

      {editing && <RoleEditor role={editing === "new" ? null : editing} screens={data.screens} orgId={orgId} onClose={() => setEditing(null)} />}
      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Remove system role" footer={<><Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" loading={busy} onClick={() => removing && remove(removing)}><Trash2 size={14} /> Remove</Button></>}>
        {removing && <div className="text-sm flex items-center gap-2 flex-wrap"><PersonLine id={removing.user_id} size={22} /> <span className="text-muted">loses</span> <Pill tone="tone-violet">{roleById(removing.system_role_id)?.name}</Pill></div>}
      </Modal>
    </div>
  );
}

/* ---------------------------------------------------------- Role editor */
function RoleEditor({ role, screens, orgId, onClose }: { role: SystemRoleRow | null; screens: ScreenRow[]; orgId: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [name, setName] = React.useState(role?.name || "");
  const [description, setDescription] = React.useState(role?.description || "");
  const [level, setLevel] = React.useState<RoleLevel>(role?.base_level || "employee");
  const [perms, setPerms] = React.useState<string[]>(role?.permissions || ["view", "comment"]);
  const [adds, setAdds] = React.useState<string[]>(role?.screens || []);
  const [denies, setDenies] = React.useState<string[]>(role?.denied_screens || []);
  const [busy, setBusy] = React.useState(false);
  const flip = (set: React.Dispatch<React.SetStateAction<string[]>>, k: string) => set((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    const key = role?.key || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "").slice(0, 40);
    const payload = { name: name.trim(), description: description.trim() || null, base_level: level, permissions: perms, screens: adds, denied_screens: denies };
    const { error } = role ? await createClient().from("system_roles").update(payload).eq("id", role.id) : await createClient().from("system_roles").insert({ org_id: orgId, key, is_system: false, created_by: profile.id, ...payload });
    setBusy(false);
    if (error) { toast.push(error.code === "23505" ? "A role with this name already exists" : error.message, "danger"); return; }
    toast.push(role ? "Role updated" : `Role “${name.trim()}” created`, "success");
    onClose(); router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={role ? `Edit ${role.name}` : "New system role"} width={720} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!name.trim()} onClick={save}><Check size={14} /> {role ? "Save" : "Create"}</Button></>}>
      <div className="space-y-3">
        {role?.is_system && <Note tone="warn" icon={<Lock size={14} />}>Built-in role: edits apply to everyone holding it. The key stays <span className="font-mono">{role.key}</span>.</Note>}
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Behaves like" hint="Hierarchy level used for screens and assignment rules."><Select value={level} onChange={(e) => setLevel(e.target.value as RoleLevel)}>{ASSIGNABLE_LEVELS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
          <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        <div><span className="label">Permissions</span>
          <div className="space-y-2">{PERMISSION_GROUPS.map((g) => <div key={g}><div className="text-[10px] uppercase tracking-wider text-muted mb-1">{g}</div><div className="flex flex-wrap gap-1.5">{PERMISSION_KEYS.filter((p) => p.group === g).map((p) => <button type="button" key={p.key} title={p.hint} onClick={() => flip(setPerms, p.key)} className={cn("pill pill-lg", perms.includes(p.key) ? "tone-brand" : "tone-neutral")}>{p.label}</button>)}</div></div>)}</div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><span className="label">Adds screens</span><div className="flex flex-wrap gap-1.5">{screens.map((s) => <button type="button" key={s.key} onClick={() => { flip(setAdds, s.key); setDenies((d) => d.filter((x) => x !== s.key)); }} className={cn("pill", adds.includes(s.key) ? "tone-success" : "tone-neutral")}>{s.label}</button>)}</div></div>
          <div><span className="label">Denies screens</span><div className="flex flex-wrap gap-1.5">{screens.map((s) => <button type="button" key={s.key} onClick={() => { flip(setDenies, s.key); setAdds((a) => a.filter((x) => x !== s.key)); }} className={cn("pill", denies.includes(s.key) ? "tone-danger" : "tone-neutral")}>{s.label}</button>)}</div></div>
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------- Level defaults */
function LevelDefaults({ defaults, orgId, isPrimary }: { defaults: RoleDefaultRow[]; orgId: string; isPrimary: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [level, setLevel] = React.useState<RoleLevel>("employee");
  const [saving, setSaving] = React.useState(false);
  const row = defaults.find((d) => d.level === level);
  const [key, setKey] = React.useState(level);
  const [perms, setPerms] = React.useState<string[]>(row?.permissions || []);
  if (key !== level) { setKey(level); setPerms(defaults.find((d) => d.level === level)?.permissions || []); }
  const dirty = JSON.stringify(perms.slice().sort()) !== JSON.stringify((row?.permissions || []).slice().sort());

  async function save() {
    setSaving(true);
    const { error } = await createClient().from("role_defaults").upsert({ org_id: orgId, level, permissions: perms }, { onConflict: "org_id,level" });
    setSaving(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`Defaults for ${ROLE_LABEL[level]} saved`, "success"); router.refresh();
  }

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Layers size={15} className="text-[var(--violet)]" /> Level defaults</span>} subtitle={isPrimary ? "Baseline permissions by hierarchy level — the last stop in the precedence chain." : "Baseline permissions by hierarchy level. Only the primary admin can change them."} action={isPrimary && <Button size="sm" variant="primary" loading={saving} disabled={!dirty} onClick={save}><Check size={13} /> Save</Button>} />
      <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2">
        <Select value={level} onChange={(e) => setLevel(e.target.value as RoleLevel)}>{ROLE_LEVELS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
        <div className="flex flex-wrap gap-1.5">{PERMISSION_KEYS.map((p) => <button type="button" key={p.key} disabled={!isPrimary} title={p.hint} onClick={() => setPerms((s) => (s.includes(p.key) ? s.filter((x) => x !== p.key) : [...s, p.key]))} className={cn("pill pill-lg disabled:cursor-default", perms.includes(p.key) ? "tone-brand" : "tone-neutral")}>{p.label}</button>)}</div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------- Department defaults */
function DepartmentDefaults({ screens, canManage }: { screens: ScreenRow[]; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { departments } = useSession();
  const [deptId, setDeptId] = React.useState(departments[0]?.id || "");
  const dept = departments.find((d) => d.id === deptId);
  const [key, setKey] = React.useState(deptId);
  const [perms, setPerms] = React.useState<string[]>(dept?.default_permissions || []);
  const [scr, setScr] = React.useState<string[]>(dept?.default_screens || []);
  const [saving, setSaving] = React.useState(false);
  if (key !== deptId) { setKey(deptId); setPerms(dept?.default_permissions || []); setScr(dept?.default_screens || []); }

  async function save() {
    if (!dept) return;
    setSaving(true);
    const { error } = await createClient().from("departments").update({ default_permissions: perms, default_screens: scr }).eq("id", dept.id);
    setSaving(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`${dept.name} defaults saved`, "success"); router.refresh();
  }

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Building2 size={15} className="text-[var(--info)]" /> Department defaults</span>} subtitle="Extra permissions and screens everyone in a department gets (e.g. Sales → GHL Connect)." action={canManage && <Button size="sm" variant="primary" loading={saving} disabled={!dept} onClick={save}><Check size={13} /> Save</Button>} />
      <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2">
        <DepartmentPicker value={deptId} onChange={setDeptId} allowEmpty={false} />
        <div><div className="text-[10px] uppercase tracking-wider text-muted mb-1">Permissions</div><div className="flex flex-wrap gap-1.5">{PERMISSION_KEYS.map((p) => <button type="button" key={p.key} disabled={!canManage} onClick={() => setPerms((s) => (s.includes(p.key) ? s.filter((x) => x !== p.key) : [...s, p.key]))} className={cn("pill", perms.includes(p.key) ? "tone-brand" : "tone-neutral")}>{p.label}</button>)}</div></div>
        <div><div className="text-[10px] uppercase tracking-wider text-muted mb-1">Screens</div><div className="flex flex-wrap gap-1.5">{screens.map((s) => <button type="button" key={s.key} disabled={!canManage} onClick={() => setScr((x) => (x.includes(s.key) ? x.filter((k) => k !== s.key) : [...x, s.key]))} className={cn("pill", scr.includes(s.key) ? "tone-success" : "tone-neutral")}>{s.label}</button>)}</div></div>
      </div>
    </Card>
  );
}

export function describeRole(r: SystemRoleRow) {
  return `${r.name} · ${ROLE_LABEL[r.base_level]} · ${r.permissions.length} permissions`;
}

