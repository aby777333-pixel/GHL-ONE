"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Briefcase, Check, Crown, ExternalLink, FileSpreadsheet, FileUp, Laptop, LogOut, MailPlus, PlayCircle, Search, ShieldCheck, UserCog, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { cn, fmtDate, isAdminRole, ROLE_LABEL, type RoleLevel } from "@/lib/utils";
import { RolePill } from "@/components/people/PeopleBits";
import { Note, Switch } from "../AdminBits";
import { csvToList, daysUntil, EMPLOYMENT_LABEL, EMPLOYMENT_TYPES, parseEmergency, todayIso, WORK_MODE_LABEL, WORK_MODES, type HrData, type HrPerson } from "./lib";
import { TransferModal, RoleChangeModal } from "./TransfersRoles";
import { OffboardWizard } from "./Offboarding";
import { AssignAssetModal } from "./Assets";
import { UploadDocumentModal } from "./Documents";
import { StartWorkflowModal } from "./Workflows";
import { EmployeeCenter } from "../people/EmployeeCenter";
import { EmployeeWizard } from "../people/EmployeeWizard";
import { BulkImport } from "../people/BulkImport";
import { EMPLOYEE_STATUS_LABEL, EMPLOYEE_STATUS_TONE } from "../people/lib";

type QuickAction = "onboarding" | "transfer" | "role" | "offboard" | "asset" | "document";

export function PeopleRecords({ data, perms = [], initialUser }: { data: HrData; perms?: string[]; initialUser?: string }) {
  const router = useRouter();
  const { departments } = useSession();
  const [q, setQ] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [show, setShow] = React.useState<"active" | "inactive" | "all">("active");
  const [selected, setSelected] = React.useState<HrPerson | null>(null);
  // Employee Command Center — opened from a row or `&user=<id>`.
  const [centerId, setCenterId] = React.useState<string | null>(initialUser || null);
  const center = centerId ? data.people.find((p) => p.id === centerId) || null : null;
  const [action, setAction] = React.useState<{ kind: QuickAction; person: HrPerson } | null>(null);
  const [invite, setInvite] = React.useState(false);
  const [bulk, setBulk] = React.useState(false);
  const [today] = React.useState(() => todayIso());
  const openCenter = (p: HrPerson) => { setCenterId(p.id); router.replace(`/admin?tab=hr&view=people&user=${p.id}`, { scroll: false }); };
  const closeCenter = () => { setCenterId(null); router.replace("/admin?tab=hr&view=people", { scroll: false }); };

  const needle = q.trim().toLowerCase();
  const list = data.people.filter((p) => {
    if (show === "active" && !p.is_active) return false;
    if (show === "inactive" && p.is_active) return false;
    if (dept && p.department_id !== dept) return false;
    if (!needle) return true;
    return [p.full_name, p.email, p.designation, p.employee_code, p.location].some((v) => (v || "").toLowerCase().includes(needle));
  });

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name || "—";
  const teamName = (id: string | null) => data.teams.find((t) => t.id === id)?.name || "—";
  const personName = (id: string | null) => data.people.find((p) => p.id === id)?.full_name || "—";
  const shiftName = (id: string | null) => data.shifts.find((s) => s.id === id)?.name || "—";
  const inactive = data.people.filter((p) => !p.is_active).length;

  return (
    <div className="space-y-[var(--s4)]">
      <Card>
        <CardHeader
          title="Employee records"
          subtitle={`${data.people.length - inactive} active${inactive ? ` · ${inactive} inactive` : ""} · open a row to edit the master record and private details`}
          action={<span className="inline-flex gap-1.5"><Button variant="secondary" size="sm" onClick={() => setBulk(true)}><FileSpreadsheet size={14} /> <span className="hidden sm:inline">Bulk import</span></Button><Button variant="primary" size="sm" onClick={() => setInvite(true)}><MailPlus size={14} /> <span className="hidden sm:inline">Add employee</span></Button></span>}
        />
        <div className="px-[var(--s4)] pb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, code, designation…" className="input pl-8 !h-9 !text-sm w-full" /></div>
          <DepartmentPicker value={dept} onChange={setDept} placeholder="All departments" className="!w-auto" />
          <Select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className="!w-auto">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">Everyone</option>
          </Select>
          <span className="text-xs text-muted num ml-auto">{list.length}</span>
        </div>
        {list.length === 0 ? (
          <EmptyState title="No matching people" hint="Try another filter, or add a person with an invite." className="py-[var(--s4)]" />
        ) : (
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm min-w-[1180px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-[var(--s4)] py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Person</th>
                  <th className="px-3 py-2 font-medium">Department</th>
                  <th className="px-3 py-2 font-medium">Team</th>
                  <th className="px-3 py-2 font-medium">Manager</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Mode</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">Shift</th>
                  <th className="px-3 py-2 font-medium">Joined</th>
                  <th className="px-3 py-2 font-medium">Probation</th>
                  {/* The cell leads with the role badge — Super Admin, Manager, Employee — so
                      "Status" described something the column does not show. The employment-status
                      pills (Frozen, Probation, External) still ride along and name themselves. */}
                  <th className="px-3 py-2 font-medium">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((p) => (
                  <tr key={p.id} className="row-hover cursor-pointer" onClick={() => openCenter(p)}>
                    <td className="px-[var(--s4)] py-2 num text-xs text-muted whitespace-nowrap">{p.employee_code || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={p.full_name} src={p.avatar_url} size={28} presence={p.presence} />
                        <div className="min-w-0">
                          <div className="truncate font-medium inline-flex items-center gap-1.5">{p.full_name}<Blink zone={`user:${p.id}`} /></div>
                          <div className="text-[11px] text-muted truncate">{p.designation || p.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{deptName(p.department_id)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{teamName(p.team_id)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{personName(p.manager_id)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{EMPLOYMENT_LABEL[p.employment_type] || p.employment_type}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{WORK_MODE_LABEL[p.work_mode] || p.work_mode}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{p.location || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{shiftName(p.shift_id)}</td>
                    <td className="px-3 py-2 whitespace-nowrap num">{p.joined_at ? fmtDate(p.joined_at) : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap num">{p.probation_ends_on ? <ProbationLabel date={p.probation_ends_on} today={today} /> : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><div className="flex items-center gap-1"><RolePill role={p.role} />{p.status !== "active" && <Pill tone={EMPLOYEE_STATUS_TONE[p.status] || "tone-neutral"}>{EMPLOYEE_STATUS_LABEL[p.status] || p.status}</Pill>}{p.frozen && <Pill tone="tone-danger">Frozen</Pill>}{p.is_external && <Pill tone="tone-muted">External</Pill>}<Button size="xs" variant="ghost" icon title="Employee Command Center" onClick={(e) => { e.stopPropagation(); openCenter(p); }}><Crown size={12} /></Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <PersonDrawer
          key={selected.id}
          person={selected}
          data={data}
          onClose={() => setSelected(null)}
          onAction={(kind) => { setAction({ kind, person: selected }); }}
        />
      )}
      {/*
        The bulk tools used to unfold *below* the employee table: opening them meant scrolling past
        every record to reach them, and scrolling back up to leave. They are a dialog now — one
        click in, a Close button always in reach, and the table keeps its scroll position.
      */}
      {bulk && (
        <Modal open onClose={() => setBulk(false)} title="Bulk import & bulk actions" width={980} footer={<Button variant="ghost" onClick={() => setBulk(false)}>Close</Button>}>
          <BulkImport people={data.people} />
        </Modal>
      )}

      {center && (
        <EmployeeCenter
          key={center.id}
          person={center}
          data={data}
          perms={perms}
          onClose={closeCenter}
          onAction={(kind) => { if (kind === "edit") setSelected(center); else setAction({ kind, person: center }); }}
        />
      )}
      <EmployeeWizard open={invite} onClose={() => setInvite(false)} canCreate teams={data.teams} />

      {action?.kind === "onboarding" && <StartWorkflowModal open templates={data.templates} people={data.people} defaultKey="onboarding" defaultSubject={action.person.id} onClose={() => setAction(null)} />}
      {action?.kind === "transfer" && <TransferModal open person={action.person} teams={data.teams} onClose={() => setAction(null)} />}
      {action?.kind === "role" && <RoleChangeModal open person={action.person} onClose={() => setAction(null)} />}
      {action?.kind === "offboard" && <OffboardWizard open person={action.person} people={data.people} onClose={() => setAction(null)} />}
      {action?.kind === "asset" && <AssignAssetModal open assets={data.assets} defaultUser={action.person.id} onClose={() => setAction(null)} />}
      {action?.kind === "document" && <UploadDocumentModal open userId={action.person.id} userName={action.person.full_name} onClose={() => setAction(null)} />}
    </div>
  );
}

function ProbationLabel({ date, today }: { date: string; today: string }) {
  const days = daysUntil(date, today);
  return <span className={cn(days < 0 ? "text-danger" : days <= 14 ? "text-warn" : undefined)}>{fmtDate(date)}</span>;
}

/* ------------------------------------------------------------ Drawer */
function PersonDrawer({ person, data, onClose, onAction }: { person: HrPerson; data: HrData; onClose: () => void; onAction: (k: QuickAction) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const admin = isAdminRole(profile.role);
  const self = profile.id === person.id;

  const [designation, setDesignation] = React.useState(person.designation || "");
  const [departmentId, setDepartmentId] = React.useState(person.department_id || "");
  const [teamId, setTeamId] = React.useState(person.team_id || "");
  const [managerId, setManagerId] = React.useState(person.manager_id || "");
  const [secondaryId, setSecondaryId] = React.useState(person.secondary_manager_id || "");
  const [employmentType, setEmploymentType] = React.useState(person.employment_type);
  const [workMode, setWorkMode] = React.useState(person.work_mode);
  const [location, setLocation] = React.useState(person.location || "");
  const [shiftId, setShiftId] = React.useState(person.shift_id || "");
  const [hours, setHours] = React.useState(person.working_hours || "");
  const [joined, setJoined] = React.useState(person.joined_at || "");
  const [probation, setProbation] = React.useState(person.probation_ends_on || "");
  const [languages, setLanguages] = React.useState(person.languages.join(", "));
  const [skills, setSkills] = React.useState(person.skills.join(", "));
  const [qualifications, setQualifications] = React.useState(person.qualifications || "");
  const [responsibilities, setResponsibilities] = React.useState(person.responsibilities || "");
  const [active, setActive] = React.useState(person.is_active);

  // Private record (HR-only) — loaded on open; missing row is normal.
  const [priv, setPriv] = React.useState<{ loaded: boolean; exists: boolean; name: string; relation: string; phone: string; personalEmail: string; address: string; dob: string; notes: string }>({ loaded: false, exists: false, name: "", relation: "", phone: "", personalEmail: "", address: "", dob: "", notes: "" });
  const [privDirty, setPrivDirty] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    createClient().from("profiles_private").select("*").eq("user_id", person.id).maybeSingle().then(({ data: row }) => {
      if (!alive) return;
      const ec = parseEmergency(row?.emergency_contact);
      setPriv({ loaded: true, exists: !!row, name: ec.name, relation: ec.relation, phone: ec.phone, personalEmail: row?.personal_email || "", address: row?.address || "", dob: row?.date_of_birth || "", notes: row?.notes || "" });
    });
    return () => { alive = false; };
  }, [person.id]);
  const setP = (patch: Partial<typeof priv>) => { setPriv((s) => ({ ...s, ...patch })); setPrivDirty(true); };

  const [busy, setBusy] = React.useState(false);
  const teams = data.teams.filter((t) => !departmentId || t.department_id === departmentId);

  async function save() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({
      designation: designation.trim() || null,
      department_id: departmentId || null,
      team_id: teamId || null,
      manager_id: managerId || null,
      secondary_manager_id: secondaryId || null,
      employment_type: employmentType,
      work_mode: workMode,
      location: location.trim() || null,
      shift_id: shiftId || null,
      working_hours: hours.trim() || null,
      joined_at: joined || null,
      probation_ends_on: probation || null,
      languages: csvToList(languages),
      skills: csvToList(skills),
      qualifications: qualifications.trim() || null,
      responsibilities: responsibilities.trim() || null,
      ...(admin && !self ? { is_active: active } : {}),
    }).eq("id", person.id);
    if (error) { setBusy(false); toast.push(error.message, "danger"); return; }
    if (privDirty) {
      const { error: e2 } = await supabase.from("profiles_private").upsert({
        user_id: person.id,
        emergency_contact: priv.name || priv.relation || priv.phone ? { name: priv.name, relation: priv.relation, phone: priv.phone } : null,
        personal_email: priv.personalEmail.trim() || null,
        address: priv.address.trim() || null,
        date_of_birth: priv.dob || null,
        notes: priv.notes.trim() || null,
      }, { onConflict: "user_id" });
      if (e2) { setBusy(false); toast.push(`Record saved, but the private record was not: ${e2.message}`, "danger"); router.refresh(); return; }
    }
    setBusy(false);
    toast.push(`${person.full_name} updated`, "success");
    onClose();
    router.refresh();
  }

  const actions: { kind: QuickAction; label: string; icon: React.ReactNode; danger?: boolean }[] = [
    { kind: "onboarding", label: "Start onboarding", icon: <PlayCircle size={14} /> },
    { kind: "transfer", label: "Transfer", icon: <ArrowRightLeft size={14} /> },
    { kind: "role", label: "Change role", icon: <UserCog size={14} /> },
    { kind: "asset", label: "Assign asset", icon: <Laptop size={14} /> },
    { kind: "document", label: "Upload document", icon: <FileUp size={14} /> },
    { kind: "offboard", label: "Offboard", icon: <LogOut size={14} />, danger: true },
  ];

  return (
    <Modal open onClose={onClose} side width={640} title={<span className="inline-flex items-center gap-2"><Briefcase size={16} className="text-[var(--brand)]" /> Employee record</span>}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}><Check size={15} /> Save record</Button></>}>
      <div className="space-y-[var(--s4)]">
        <div className="flex items-center gap-3">
          <Avatar name={person.full_name} src={person.avatar_url} size={44} presence={person.presence} />
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate inline-flex items-center gap-2">{person.full_name} <RolePill role={person.role} /></div>
            <div className="text-xs text-muted truncate">{person.email}{person.employee_code ? ` · ${person.employee_code}` : ""}</div>
          </div>
          <Link href={`/people/${person.id}`} className="btn btn-ghost btn-sm shrink-0"><ExternalLink size={13} /> Profile</Link>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {actions.map((a) => (
            <Button key={a.kind} size="sm" variant={a.danger ? "danger" : "secondary"} onClick={() => onAction(a.kind)} disabled={a.kind === "offboard" && self}>{a.icon} {a.label}</Button>
          ))}
        </div>

        <section className="space-y-3">
          <div className="eyebrow">Position</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Designation" className="sm:col-span-2"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Senior Sales Executive" /></Field>
            <Field label="Department"><DepartmentPicker value={departmentId} onChange={(v) => { setDepartmentId(v); setTeamId(""); }} /></Field>
            <Field label="Team">
              <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">No team</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Reports to"><PersonPicker value={managerId} onChange={setManagerId} placeholder="No manager" /></Field>
            <Field label="Secondary manager"><PersonPicker value={secondaryId} onChange={setSecondaryId} placeholder="None" /></Field>
            <Field label="Employment type">
              <Select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{EMPLOYMENT_LABEL[t]}</option>)}
              </Select>
            </Field>
            <Field label="Work mode">
              <Select value={workMode} onChange={(e) => setWorkMode(e.target.value)}>
                {WORK_MODES.map((m) => <option key={m} value={m}>{WORK_MODE_LABEL[m]}</option>)}
              </Select>
            </Field>
            <Field label="Location"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Chennai HQ" /></Field>
            <Field label="Shift">
              <Select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                <option value="">Default hours</option>
                {data.shifts.filter((s) => s.active || s.id === person.shift_id).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</option>)}
              </Select>
            </Field>
            <Field label="Working hours"><Input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 09:30–18:30 IST" /></Field>
            <Field label="Joined on"><Input type="date" value={joined} onChange={(e) => setJoined(e.target.value)} /></Field>
            <Field label="Probation ends on" hint="A review is created automatically 7 days before."><Input type="date" value={probation} onChange={(e) => setProbation(e.target.value)} /></Field>
          </div>
        </section>

        <section className="space-y-3">
          <div className="eyebrow">Capabilities</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Languages" hint="Comma separated"><Input value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="English, Tamil, Hindi" /></Field>
            <Field label="Skills" hint="Comma separated"><Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Sales, CRM, Negotiation" /></Field>
            <Field label="Qualifications" className="sm:col-span-2"><Textarea rows={2} value={qualifications} onChange={(e) => setQualifications(e.target.value)} /></Field>
            <Field label="Responsibilities" className="sm:col-span-2"><Textarea rows={3} value={responsibilities} onChange={(e) => setResponsibilities(e.target.value)} /></Field>
          </div>
        </section>

        <section className="space-y-3">
          <div className="eyebrow inline-flex items-center gap-1.5"><ShieldCheck size={12} /> Private record · HR only</div>
          {!priv.loaded ? (
            <div className="text-xs text-muted">Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Emergency contact"><Input value={priv.name} onChange={(e) => setP({ name: e.target.value })} placeholder="Name" /></Field>
                <Field label="Relation"><Input value={priv.relation} onChange={(e) => setP({ relation: e.target.value })} placeholder="e.g. Spouse" /></Field>
                <Field label="Phone"><Input value={priv.phone} onChange={(e) => setP({ phone: e.target.value })} placeholder="+91…" /></Field>
                <Field label="Personal email"><Input type="email" value={priv.personalEmail} onChange={(e) => setP({ personalEmail: e.target.value })} /></Field>
                <Field label="Date of birth"><Input type="date" value={priv.dob} onChange={(e) => setP({ dob: e.target.value })} /></Field>
                <Field label="Address" className="sm:col-span-3"><Textarea rows={2} value={priv.address} onChange={(e) => setP({ address: e.target.value })} /></Field>
                <Field label="HR notes" className="sm:col-span-3"><Textarea rows={2} value={priv.notes} onChange={(e) => setP({ notes: e.target.value })} placeholder="Visible to HR and the employee (Privacy Center)." /></Field>
              </div>
              <Note tone="info">Everything here is also visible to {person.full_name.split(" ")[0]} in their Privacy Center — nothing is recorded behind their back.</Note>
            </>
          )}
        </section>

        <section className="space-y-2">
          <div className="eyebrow">Account</div>
          {admin ? (
            <Switch on={active} onChange={setActive} disabled={self} label={active ? "Account active" : "Account disabled"} hint={self ? "You cannot deactivate yourself." : active ? "Disabling signs the person out everywhere and hides them from the directory. Use Offboard for a structured exit." : "Activating starts the onboarding workflow automatically."} />
          ) : (
            <div className="text-xs text-muted inline-flex items-center gap-1.5"><UserX size={12} /> Activation is changed by executives and above. Role: {ROLE_LABEL[person.role as RoleLevel]}.</div>
          )}
        </section>
      </div>
    </Modal>
  );
}
