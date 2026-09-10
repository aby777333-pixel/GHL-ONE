"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Crown, Eye, Hourglass, IdCard, Info, LayoutGrid, MailPlus, Send, ShieldCheck, Sparkles, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Modal, Pill, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, ROLE_LABEL, ROLE_RANK, type RoleLevel } from "@/lib/utils";
import { Note, PersonLine, Switch } from "../AdminBits";
import {
  ASSIGNABLE_LEVELS, PERMISSION_GROUPS, PERMISSION_KEYS, previewPermissions, previewScreens, SCREEN_GROUP_LABEL, SCREEN_GROUPS, endOfDayIso, todayIso,
  type RoleDefaultRow, type ScreenRow, type ScreenRuleRow, type SystemRoleRow,
} from "./lib";

// "Security roles", not "Role": step 1 already captured the job title and department, and those
// are organisational identity. Nothing in step 2 is derived from them.
const STEPS = ["Identity", "Organization", "Security roles", "Access", "Workspace", "Approvals", "Review"] as const;
type Tri = "inherit" | "allow" | "deny";
type RolePick = { id: string; acting: boolean; expires: string };

type Catalog = { roles: SystemRoleRow[]; defaults: RoleDefaultRow[]; screens: ScreenRow[]; rules: ScreenRuleRow[]; heldBy: { system_role_id: string; user_id: string }[] };

/**
 * Employee creation wizard (Identity → Organization → Role → Access → Workspace → Approvals → Review).
 * HR / people admins create; everyone else sees a "Request new employee" form routed to HR (`help_requests`).
 */
export function EmployeeWizard({ open, onClose, canCreate, teams }: { open: boolean; onClose: () => void; canCreate: boolean; teams: { id: string; name: string; department_id: string }[] }) {
  if (!open) return null;
  return canCreate ? <WizardBody onClose={onClose} teams={teams} /> : <RequestEmployeeForm onClose={onClose} />;
}

function WizardBody({ onClose, teams }: { onClose: () => void; teams: { id: string; name: string; department_id: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments, people } = useSession();
  const [nowMs] = React.useState(() => Date.now());
  const [today] = React.useState(() => todayIso());
  const [step, setStep] = React.useState(0);
  const [catalog, setCatalog] = React.useState<Catalog | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ mode: "applied" | "invited"; name: string } | null>(null);

  // identity
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState("");
  // organization
  const [departmentId, setDepartmentId] = React.useState("");
  const [teamId, setTeamId] = React.useState("");
  const [designation, setDesignation] = React.useState("");
  const [managerId, setManagerId] = React.useState("");
  const [secondaryId, setSecondaryId] = React.useState("");
  const [functionalId, setFunctionalId] = React.useState("");
  const [joinedOn, setJoinedOn] = React.useState("");
  const [probationEnds, setProbationEnds] = React.useState("");
  // role
  const [level, setLevel] = React.useState<RoleLevel>("employee");
  const [rolePicks, setRolePicks] = React.useState<RolePick[]>([]);
  // access
  const [overrides, setOverrides] = React.useState<Record<string, Tri>>({});
  // workspace
  const [screenOverrides, setScreenOverrides] = React.useState<Record<string, Tri>>({});
  // approvals
  const [actingRole, setActingRole] = React.useState("");
  const [actingUntil, setActingUntil] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    const sb = createClient();
    Promise.all([
      sb.from("system_roles").select("*").order("is_system", { ascending: false }).order("name"),
      sb.from("role_defaults").select("*"),
      sb.from("screens").select("*").order("position"),
      sb.from("screen_rules").select("*"),
      /* Who already holds which system role. It is the only signal in the schema for "which roles
         belong to this department" — `system_roles` is org-wide with no department column — and it
         is what lets the Role step lead with the roles this department actually uses. */
      sb.from("user_roles").select("system_role_id,user_id").limit(4000),
    ]).then(([r, d, s, ru, ur]) => { if (alive) setCatalog({ roles: r.data || [], defaults: d.data || [], screens: s.data || [], rules: ru.data || [], heldBy: ur.data || [] }); });
    return () => { alive = false; };
  }, []);

  const dept = departments.find((d) => d.id === departmentId) || null;
  const head = people.find((p) => p.id === dept?.head_id);
  const managerRequired = !["super_admin", "director"].includes(level);
  const existing = people.find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
  const pickedRoles = (catalog?.roles || []).filter((r) => rolePicks.some((p) => p.id === r.id));
  const actingPick = catalog?.roles.find((r) => r.id === actingRole);
  const allRolesForPreview = actingPick && !pickedRoles.includes(actingPick) ? [...pickedRoles, actingPick] : pickedRoles;
  const effectiveLevel: RoleLevel = allRolesForPreview.reduce<RoleLevel>((best, r) => (ROLE_RANK[r.base_level] < ROLE_RANK[best] ? r.base_level : best), level);
  const status = level === "intern" ? "intern" : probationEnds && probationEnds >= today ? "probation" : "active";

  /**
   * The Role step, split into "used in <Department>" and the rest. The department is known by then
   * (step 2 requires it), and "which roles does this department use" is answered by the roles its
   * people already hold — `system_roles` itself is org-wide and carries no department.
   */
  const roleSections = React.useMemo(() => {
    const all = catalog?.roles || [];
    if (!all.length) return [] as { title: string; roles: SystemRoleRow[] }[];
    const inDept = new Set(people.filter((p) => p.department_id === departmentId).map((p) => p.id));
    if (!departmentId || !inDept.size) return [{ title: "All roles", roles: all }];
    const used = new Set((catalog?.heldBy || []).filter((h) => inDept.has(h.user_id)).map((h) => h.system_role_id));
    const common = all.filter((r) => used.has(r.id));
    if (!common.length) return [{ title: "All roles", roles: all }];
    return [
      { title: `Used in ${dept?.name || "this department"}`, roles: common },
      { title: "Other roles", roles: all.filter((r) => !used.has(r.id)) },
    ].filter((s) => s.roles.length > 0);
  }, [catalog, people, departmentId, dept?.name]);

  const permOverrideMap = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== "inherit").map(([k, v]) => [k, v === "allow"]));
  const perms = catalog ? previewPermissions({ level, status, roles: allRolesForPreview, department: dept, levelDefaults: catalog.defaults, overrides: permOverrideMap }) : {};
  const baseScreens = catalog ? previewScreens({ screens: catalog.screens, rules: catalog.rules, level: effectiveLevel, isExternal: ROLE_RANK[level] >= ROLE_RANK.consultant, roleIds: allRolesForPreview.map((r) => r.id), roles: allRolesForPreview, departmentId: departmentId || null, department: dept, nowMs }) : [];
  const finalScreens = baseScreens.map((s) => (screenOverrides[s.key] && screenOverrides[s.key] !== "inherit" ? { ...s, allowed: screenOverrides[s.key] === "allow", source: "individual override" } : s));

  const stepValid = (i: number) => {
    if (i === 0) return fullName.trim().length >= 2 && /.+@.+\..+/.test(email.trim());
    if (i === 1) return !!designation.trim() && !!departmentId && (!managerRequired || !!managerId);
    return true;
  };
  const canCreateNow = STEPS.every((_, i) => stepValid(i)) && !!catalog;

  function toggleRole(id: string) {
    setRolePicks((s) => (s.some((p) => p.id === id) ? s.filter((p) => p.id !== id) : [...s, { id, acting: false, expires: "" }]));
  }
  function patchRole(id: string, patch: Partial<RolePick>) {
    setRolePicks((s) => s.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function create() {
    if (!profile.org_id || !catalog) return;
    setBusy(true);
    const sb = createClient();
    const emailNorm = email.trim().toLowerCase();
    const roleRows = [...rolePicks.map((p) => ({ system_role_id: p.id, acting: p.acting, expires_at: endOfDayIso(p.expires) })), ...(actingRole && !rolePicks.some((p) => p.id === actingRole) ? [{ system_role_id: actingRole, acting: true, expires_at: endOfDayIso(actingUntil) }] : [])];
    const overrideRows = Object.entries(overrides).filter(([, v]) => v !== "inherit").map(([perm, v]) => ({ perm, allowed: v === "allow" }));
    const screenRows = Object.entries(screenOverrides).filter(([, v]) => v !== "inherit").map(([screen_key, v]) => ({ screen_key, allowed: v === "allow" }));

    // Someone who already signed up (pending activation) — apply everything now.
    const { data: existingProfile } = await sb.from("profiles").select("id,is_active,full_name").ilike("email", emailNorm).maybeSingle();
    if (existingProfile) {
      const { error } = await sb.from("profiles").update({
        full_name: fullName.trim(), phone: phone.trim() || null, avatar_url: avatarUrl.trim() || null, role: level, department_id: departmentId || null, team_id: teamId || null, designation: designation.trim() || null,
        manager_id: managerId || null, secondary_manager_id: secondaryId || null, functional_manager_id: functionalId || null, joined_at: joinedOn || null, probation_ends_on: probationEnds || null,
        ...(existingProfile.is_active ? {} : { is_active: true }),
      }).eq("id", existingProfile.id);
      if (error) { setBusy(false); toast.push(error.message, "danger"); return; }
      const uid = existingProfile.id;
      const errs: string[] = [];
      if (roleRows.length) { const { error: e } = await sb.from("user_roles").upsert(roleRows.map((r) => ({ ...r, user_id: uid, granted_by: profile.id })), { onConflict: "user_id,system_role_id" }); if (e) errs.push(`roles: ${e.message}`); }
      if (overrideRows.length) { const { error: e } = await sb.from("permission_overrides").upsert(overrideRows.map((r) => ({ ...r, user_id: uid, set_by: profile.id })), { onConflict: "user_id,perm" }); if (e) errs.push(`permissions: ${e.message}`); }
      if (screenRows.length) { const { error: e } = await sb.from("screen_rules").upsert(screenRows.map((r) => ({ ...r, org_id: profile.org_id!, scope: "user", scope_id: uid, set_by: profile.id })), { onConflict: "org_id,scope,scope_id,screen_key" }); if (e) errs.push(`screens: ${e.message}`); }
      setBusy(false);
      if (errs.length) toast.push(`Profile updated, but some settings were refused — ${errs.join(" · ")}`, "danger");
      else toast.push(`${fullName.trim()} is set up`, "success");
      setResult({ mode: "applied", name: fullName.trim() });
      router.refresh();
      return;
    }

    // Pure invite: the invite pre-activates the account on first sign-in; role/screen setup is finished from the Employee Command Center.
    const { error } = await sb.from("invites").insert({ org_id: profile.org_id, email: emailNorm, full_name: fullName.trim(), role: level, department_id: departmentId || null, designation: designation.trim() || null, manager_id: managerId || null, invited_by: profile.id });
    if (error) { setBusy(false); toast.push(error.message.includes("duplicate") ? "An invite for this email already exists" : error.message, "danger"); return; }
    const plan: string[] = [];
    if (phone.trim()) plan.push(`Phone: ${phone.trim()}`);
    if (teamId) plan.push(`Team: ${teams.find((t) => t.id === teamId)?.name || teamId}`);
    if (secondaryId) plan.push(`Secondary manager: ${people.find((p) => p.id === secondaryId)?.full_name || secondaryId}`);
    if (functionalId) plan.push(`Functional manager: ${people.find((p) => p.id === functionalId)?.full_name || functionalId}`);
    if (joinedOn) plan.push(`Joining: ${joinedOn}`);
    if (probationEnds) plan.push(`Probation ends: ${probationEnds}`);
    if (roleRows.length) plan.push(`System roles: ${roleRows.map((r) => `${catalog.roles.find((x) => x.id === r.system_role_id)?.name || r.system_role_id}${r.acting ? " (acting)" : ""}${r.expires_at ? ` until ${r.expires_at.slice(0, 10)}` : ""}`).join(", ")}`);
    if (overrideRows.length) plan.push(`Permission overrides: ${overrideRows.map((r) => `${r.perm}=${r.allowed ? "allow" : "deny"}`).join(", ")}`);
    if (screenRows.length) plan.push(`Screen overrides: ${screenRows.map((r) => `${r.screen_key}=${r.allowed ? "on" : "off"}`).join(", ")}`);
    const due = new Date(nowMs + 3 * 86_400_000).toISOString();
    const { error: taskErr } = await sb.from("tasks").insert({
      org_id: profile.org_id, title: `Finish access setup for ${fullName.trim()}`, status: "todo", priority: "normal", created_by: profile.id, owner_id: profile.id, assignee_id: profile.id, due_date: due, department_id: departmentId || null,
      description: `${fullName.trim()} (${emailNorm}) was invited as ${ROLE_LABEL[level]}${designation ? ` — ${designation.trim()}` : ""}. Once they sign in for the first time, open Admin → People Ops → their row → Employee Command Center and apply:\n\n${plan.length ? plan.map((p) => `• ${p}`).join("\n") : "• Nothing extra planned — verify role, manager and screens."}`,
      tags: ["access-setup"],
    });
    setBusy(false);
    if (taskErr) toast.push(`Invite created; the reminder task could not be created (${taskErr.message})`, "info");
    else toast.push(`Invite created for ${emailNorm}`, "success");
    setResult({ mode: "invited", name: fullName.trim() });
    router.refresh();
  }

  const title = <span className="inline-flex items-center gap-2"><UserPlus size={16} className="text-[var(--brand)]" /> Add employee <span className="text-muted text-xs font-normal">· step {step + 1} of {STEPS.length}</span></span>;

  if (result) {
    return (
      <Modal open onClose={onClose} title={title} width={560} footer={<Button variant="primary" onClick={onClose}><Check size={14} /> Done</Button>}>
        <div className="space-y-3">
          <Note tone="success" icon={<Check size={14} />}>
            {result.mode === "applied" ? <><span className="font-medium">{result.name}</span> already had an account — their organization, roles, permissions and screens were applied immediately.</> : <><span className="font-medium">{result.name}</span> is invited. The account activates on first sign-in with the role, department, designation and manager you chose; an employee code is assigned and onboarding starts automatically.</>}
          </Note>
          {result.mode === "invited" && <Note tone="info" icon={<Hourglass size={14} />}>System roles, permission overrides and screen overrides need a profile, so they are applied from the <span className="font-medium">Employee Command Center</span> after their first sign-in. A reminder task “Finish access setup for {result.name}” is on your list, due in 3 days, with everything you planned.</Note>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={title} width={760}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <span className="flex-1" />
        {step > 0 && <Button variant="secondary" onClick={() => setStep((s) => s - 1)}><ArrowLeft size={14} /> Back</Button>}
        {step < STEPS.length - 1 ? <Button variant="primary" disabled={!stepValid(step)} onClick={() => setStep((s) => s + 1)}>Next <ArrowRight size={14} /></Button> : <Button variant="primary" loading={busy} disabled={!canCreateNow} onClick={create}><Check size={14} /> {existing ? "Apply to existing account" : "Create & invite"}</Button>}
      </>}>
      <div className="space-y-[var(--s3)]">
        <ol className="flex items-center gap-1 overflow-x-auto no-scrollbar text-[11px]">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => { if (i <= step || STEPS.slice(0, i).every((_, j) => stepValid(j))) setStep(i); }} className={cn("inline-flex items-center gap-1 px-2 h-6 rounded-full transition-colors", i === step ? "tone-brand font-medium" : i < step ? "tone-success" : "tone-neutral")}>
                <span className="num">{i + 1}</span> {s}
              </button>
              {i < STEPS.length - 1 && <span className="text-muted">›</span>}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Full name" className="sm:col-span-2"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Priya Raman" autoFocus required /></Field>
            <Field label="Work email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@ghlindia.com" required /></Field>
            <Field label="Phone" hint="Optional. Kept with the record."><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" /></Field>
            <Field label="Photo URL" hint="Optional — they can upload a photo to the avatars bucket after first login." className="sm:col-span-2"><Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" /></Field>
            <div className="sm:col-span-2 sunken rounded-[var(--radius-sm)] p-3 flex items-center gap-3 text-sm"><IdCard size={16} className="text-muted shrink-0" /><div><div className="font-medium">Employee ID</div><div className="text-xs text-muted">Assigned automatically on first login — the next number in the company sequence.</div></div></div>
            {existing && <Note tone="info" icon={<Info size={14} />} className="sm:col-span-2"><span className="font-medium">{existing.full_name}</span> already has an account with this email. Finishing the wizard applies the organization, roles and screens to that account instead of creating an invite.</Note>}
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Department"><DepartmentPicker value={departmentId} onChange={(v) => { setDepartmentId(v); setTeamId(""); }} placeholder="Choose…" /></Field>
            <Field label="Team">
              <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">No team</option>
                {teams.filter((t) => !departmentId || t.department_id === departmentId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Designation" hint="The job title. Roles and permissions are separate." className="sm:col-span-2"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Senior Sales Executive" required /></Field>
            <Field label={managerRequired ? "Reports to (required)" : "Reports to"} hint={managerRequired ? "Every employee needs a manager unless they are a Director or Super Admin." : "Optional at this level."}><PersonPicker value={managerId} onChange={setManagerId} placeholder="Choose a manager…" /></Field>
            <div>
              <span className="label">Department head</span>
              <div className="input flex items-center gap-2 !cursor-default">{head ? <PersonLine id={head.id} size={20} /> : <span className="text-muted text-sm">{dept ? "No head set" : "Pick a department"}</span>}</div>
              <span className="block text-[11px] text-muted mt-1">Read-only — comes from the department.</span>
            </div>
            <Field label="Secondary manager" hint="Optional dotted line."><PersonPicker value={secondaryId} onChange={setSecondaryId} placeholder="None" /></Field>
            <Field label="Functional manager" hint="Optional — e.g. a practice lead."><PersonPicker value={functionalId} onChange={setFunctionalId} placeholder="None" /></Field>
            <Field label="Joining date"><Input type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} /></Field>
            <Field label="Probation ends" hint="Probation removes download, external sharing and export until confirmed."><Input type="date" value={probationEnds} onChange={(e) => setProbationEnds(e.target.value)} /></Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Field label="Hierarchy level" hint="Where they sit in the chain of command. This drives default screens and assignment rules.">
              <Select value={level} onChange={(e) => setLevel(e.target.value as RoleLevel)}>{ASSIGNABLE_LEVELS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
            </Field>
            <Note tone="info" icon={<Info size={14} />}><span className="font-medium">Role ≠ title.</span> The designation is what is printed on the card; system roles below add capabilities and can be temporary. Someone can be a “Senior Designer” by title and hold the <em>Design Reviewer</em> role for a quarter.</Note>
            {/*
              Picking "Sales" in the previous step used to change nothing here: all seventeen roles
              were listed flat, IT and Design beside Sales, and the right one had to be hunted for.
              Roles colleagues in the chosen department already hold now come first under their own
              heading. Nothing is hidden — a cross-department role is a real case — it is just below.
            */}
            {!catalog ? <div className="flex justify-center py-6"><Spinner /></div> : (
              <div className="space-y-3">
                {roleSections.map((section) => (
                  <div key={section.title}>
                    {roleSections.length > 1 && <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{section.title}</div>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {section.roles.map((r) => {
                        const pick = rolePicks.find((p) => p.id === r.id);
                        return (
                          <div key={r.id} className={cn("rounded-[var(--radius-sm)] border p-2.5 space-y-2 transition-colors", pick ? "border-[var(--brand)] bg-[var(--brand-bg)]/30" : "border-[var(--line)]")}>
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input type="checkbox" checked={!!pick} onChange={() => toggleRole(r.id)} className="accent-[var(--brand)] mt-0.5" />
                              <span className="min-w-0 flex-1">
                                <span className="text-sm font-medium inline-flex items-center gap-1.5">{r.name}<Pill tone="tone-neutral">{ROLE_LABEL[r.base_level]}</Pill></span>
                                <span className="block text-[11px] text-muted truncate-2">{r.description || `${r.permissions.length} permissions`}</span>
                              </span>
                            </label>
                            {pick && (
                              <div className="grid grid-cols-2 gap-2 pl-6">
                                <label className="text-xs inline-flex items-center gap-1.5"><input type="checkbox" checked={pick.acting} onChange={(e) => patchRole(r.id, { acting: e.target.checked })} className="accent-[var(--brand)]" /> Acting</label>
                                <Input type="date" value={pick.expires} onChange={(e) => patchRole(r.id, { expires: e.target.value })} className="!h-8 !text-xs" title="Expires (optional)" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <Note tone="neutral" icon={<ShieldCheck size={14} />}>Effective permissions are computed like <span className="font-mono">has_perm</span>: individual override → system roles → department default → level default. Toggle an override only when the profile from roles is not enough.</Note>
            {!catalog ? <div className="flex justify-center py-6"><Spinner /></div> : PERMISSION_GROUPS.map((g) => (
              <div key={g}>
                <div className="text-[10px] uppercase tracking-wider text-muted mb-1">{g}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {PERMISSION_KEYS.filter((p) => p.group === g).map((p) => {
                    const eff = perms[p.key];
                    const ov = overrides[p.key] || "inherit";
                    return (
                      <div key={p.key} className="flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", eff?.allowed ? "bg-[var(--success)]" : "bg-[var(--line-strong)]")} />
                        <span className="min-w-0 flex-1"><span className="text-sm">{p.label}</span><span className="block text-[10px] text-muted truncate">{eff?.source}</span></span>
                        <TriToggle value={ov} onChange={(v) => setOverrides((s) => ({ ...s, [p.key]: v }))} labels={["Inherit", "Allow", "Deny"]} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <Note tone="neutral" icon={<LayoutGrid size={14} />}>The computed default follows the screen precedence (individual → role → department → company → system). Overrides here become <span className="font-mono">screen_rules</span> for this person only.</Note>
            {!catalog ? <div className="flex justify-center py-6"><Spinner /></div> : SCREEN_GROUPS.map((g) => {
              const list = baseScreens.filter((s) => s.grp === g);
              if (!list.length) return null;
              return (
                <div key={g}>
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-1">{SCREEN_GROUP_LABEL[g] || g}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {list.map((s) => {
                      const ov = screenOverrides[s.key] || "inherit";
                      const final = ov === "inherit" ? s.allowed : ov === "allow";
                      return (
                        <div key={s.key} className="flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5">
                          <span className={cn("w-2 h-2 rounded-full shrink-0", final ? "bg-[var(--success)]" : "bg-[var(--line-strong)]")} />
                          <span className="min-w-0 flex-1"><span className="text-sm">{s.label}</span><span className="block text-[10px] text-muted truncate">{ov === "inherit" ? s.source : "individual override"}</span></span>
                          <TriToggle value={ov} onChange={(v) => setScreenOverrides((st) => ({ ...st, [s.key]: v }))} labels={["Inherit", "On", "Off"]} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <div className={cn("rounded-[var(--radius-sm)] border p-3 flex items-start gap-3", perms.approve?.allowed ? "tone-success" : "sunken")}>
              <ShieldCheck size={18} className="shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium">{perms.approve?.allowed ? "May approve" : "Cannot approve"}</div>
                <div className="text-xs text-muted mt-0.5">{perms.approve?.allowed ? `Approvals routed to ${fullName.trim() || "them"} can be decided by them (source: ${perms.approve.source}). When they are away or on approved leave, approvals automatically go to their delegate or manager — nothing waits on an absent approver.` : `Approvals never route to ${fullName.trim() || "them"}; requests they raise go to their manager. Grant the “Approve” permission through a role (e.g. Senior Employee, Manager) or an individual override in the Access step.`}</div>
              </div>
            </div>
            <Note tone="neutral" icon={<Info size={14} />}>No delegation is created at this point. They can delegate their own approvals later from their profile (Delegations), and HR can set a backup from the Employee Command Center.</Note>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Acting role (optional)" hint="Temporary authority — e.g. Acting Manager while someone is away.">
                <Select value={actingRole} onChange={(e) => setActingRole(e.target.value)}>
                  <option value="">None</option>
                  {(catalog?.roles || []).filter((r) => !rolePicks.some((p) => p.id === r.id)).map((r) => <option key={r.id} value={r.id}>{r.name} · {ROLE_LABEL[r.base_level]}</option>)}
                </Select>
              </Field>
              <Field label="Acting until" hint="Reverts automatically at expiry (audited)."><Input type="date" value={actingUntil} onChange={(e) => setActingUntil(e.target.value)} disabled={!actingRole} /></Field>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sunken rounded-[var(--radius-sm)] p-3 text-sm space-y-1">
                <div className="eyebrow mb-1">Summary</div>
                <Row k="Name">{fullName.trim()}</Row>
                <Row k="Email">{email.trim().toLowerCase()}</Row>
                {phone.trim() && <Row k="Phone">{phone.trim()}</Row>}
                <Row k="Department">{dept?.name || "—"}{teamId ? ` · ${teams.find((t) => t.id === teamId)?.name}` : ""}</Row>
                <Row k="Designation">{designation.trim() || "—"}</Row>
                <Row k="Reports to">{people.find((p) => p.id === managerId)?.full_name || (managerRequired ? "Missing" : "—")}</Row>
                <Row k="Level">{ROLE_LABEL[level]}{effectiveLevel !== level ? ` (acts as ${ROLE_LABEL[effectiveLevel]})` : ""}</Row>
                <Row k="System roles">{allRolesForPreview.length ? allRolesForPreview.map((r) => r.name).join(", ") : "None"}</Row>
                <Row k="Status">{status}</Row>
              </div>
              <div className="rounded-[var(--radius-sm)] border p-3">
                <div className="eyebrow mb-1 inline-flex items-center gap-1.5"><Eye size={12} /> Preview as {fullName.trim().split(" ")[0] || "them"}</div>
                <div className="text-[11px] text-muted mb-2">Navigation they will see</div>
                <div className="flex flex-wrap gap-1 mb-3">{finalScreens.filter((s) => s.allowed).map((s) => <Pill key={s.key} tone={s.source === "individual override" ? "tone-brand" : "tone-neutral"}>{s.label}</Pill>)}</div>
                <div className="text-[11px] text-muted mb-1">Permissions</div>
                <div className="flex flex-wrap gap-1">{PERMISSION_KEYS.filter((p) => perms[p.key]?.allowed).map((p) => <Pill key={p.key} tone={perms[p.key]?.source === "individual override" ? "tone-brand" : "tone-success"}>{p.label}</Pill>)}</div>
                {PERMISSION_KEYS.some((p) => perms[p.key] && !perms[p.key]!.allowed) && <div className="text-[11px] text-muted mt-2">Not granted: {PERMISSION_KEYS.filter((p) => perms[p.key] && !perms[p.key]!.allowed).map((p) => p.label).join(", ")}</div>}
              </div>
            </div>
            {!existing && <Note tone="info" icon={<MailPlus size={14} />}>An invite is created now. Role, department, designation and manager apply on first sign-in; system roles, overrides and screen rules are applied from the Employee Command Center afterwards — you get a reminder task.</Note>}
            {existing && <Note tone="warn" icon={<Sparkles size={14} />}>This applies immediately to {existing.full_name}&apos;s existing account, including activation.</Note>}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-3 text-sm"><span className="text-xs text-muted shrink-0">{k}</span><span className="text-right min-w-0 truncate">{children}</span></div>;
}

export function TriToggle({ value, onChange, labels }: { value: Tri; onChange: (v: Tri) => void; labels: [string, string, string] }) {
  const opts: Tri[] = ["inherit", "allow", "deny"];
  return (
    <span className="inline-flex rounded-full border overflow-hidden shrink-0 text-[10px]">
      {opts.map((o, i) => (
        <button type="button" key={o} onClick={() => onChange(o)} className={cn("px-2 h-6 transition-colors", value === o ? (o === "allow" ? "tone-success" : o === "deny" ? "tone-danger" : "tone-neutral font-medium") : "text-muted hover:bg-[var(--neutral-bg)]")}>{labels[i]}</button>
      ))}
    </span>
  );
}

/* --------------------------------------------- Request new employee (non-HR) */
export function RequestEmployeeForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const { profile, departments } = useSession();
  const [name, setName] = React.useState("");
  const [designation, setDesignation] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState(profile.department_id || "");
  const [level, setLevel] = React.useState<RoleLevel>("employee");
  const [why, setWhy] = React.useState("");
  const [start, setStart] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const hr = departments.find((d) => d.slug === "hr" || /human|people|hr/i.test(d.name));

  async function send() {
    if (!profile.org_id || !hr || !name.trim()) return;
    setBusy(true);
    const { error } = await createClient().from("help_requests").insert({
      org_id: profile.org_id, department_id: hr.id, requester_id: profile.id, requester_department_id: profile.department_id, priority: "normal",
      title: `New employee request: ${name.trim()}${designation.trim() ? ` — ${designation.trim()}` : ""}`,
      details: [`Requested by ${profile.full_name}.`, `Proposed designation: ${designation.trim() || "—"}`, `Department: ${departments.find((d) => d.id === departmentId)?.name || "—"}`, `Level: ${ROLE_LABEL[level]}`, start ? `Target start: ${start}` : null, "", why.trim()].filter((x) => x != null).join("\n"),
      form_data: { kind: "new_employee", full_name: name.trim(), designation: designation.trim(), department_id: departmentId || null, role: level, start_on: start || null },
    });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Request sent to HR — they will create the employee and tell you", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={<span className="inline-flex items-center gap-2"><Users size={16} className="text-[var(--brand)]" /> Request a new employee</span>} width={540}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!name.trim() || !hr} onClick={send}><Send size={14} /> Send to HR</Button></>}>
      <div className="space-y-3">
        <Note tone="info" icon={<Crown size={14} />}>Creating accounts and assigning roles is done by HR / people admins so every employee starts with the right manager, screens and permissions. Your request opens a help ticket with HR{hr ? ` (${hr.name})` : ""}.</Note>
        {!hr && <Note tone="warn">No HR department was found. Ask an administrator to create one (slug “hr”).</Note>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full name" className="sm:col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Who is joining?" /></Field>
          <Field label="Designation"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Content Writer" /></Field>
          <Field label="Level"><Select value={level} onChange={(e) => setLevel(e.target.value as RoleLevel)}>{ASSIGNABLE_LEVELS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
          <Field label="Department"><DepartmentPicker value={departmentId} onChange={setDepartmentId} /></Field>
          <Field label="Target start date"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Why / context" className="sm:col-span-2"><Textarea rows={3} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Team, budget approval reference, who they will report to…" /></Field>
        </div>
      </div>
    </Modal>
  );
}

/** Small on/off pill used by other people screens. */
export function OnOff({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <Switch size="sm" on={on} onChange={onChange} disabled={disabled} />;
}
