"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, UserCheck, UserX, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Pill, Select, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { fmtDate, ROLE_LABEL, type RoleLevel } from "@/lib/utils";

export type PendingAccount = {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: RoleLevel;
  created_at: string;
  department_id: string | null;
  department: string | null;
  designation: string | null;
  note: string | null;
  requested_at: string | null;
  asked: boolean;
};

/** Hierarchy order — index 0 is the highest. `approve_account` refuses a level above your own. */
const ROLES: RoleLevel[] = ["super_admin", "director", "executive", "department_head", "manager", "team_lead", "employee", "intern", "consultant", "vendor", "guest"];

export function AccountRequests({ initial, may }: { initial: PendingAccount[]; may: boolean }) {
  const { profile } = useSession();
  /* The list is whatever the server sent, minus the ones answered in this visit. Holding the rows
     in state instead would need an effect to re-sync them after `router.refresh()`; a set of ids
     that have been dealt with needs nothing — the refreshed list simply no longer contains them. */
  const [answered, setAnswered] = React.useState<string[]>([]);
  const [approving, setApproving] = React.useState<PendingAccount | null>(null);
  const [declining, setDeclining] = React.useState<PendingAccount | null>(null);

  const rows = initial.filter((p) => !answered.includes(p.id));
  const remove = (id: string) => setAnswered((a) => (a.includes(id) ? a : [...a, id]));

  return (
    <div className="page">
      <PageHeader
        eyebrow="People"
        title="Account requests"
        subtitle="People who have signed up with a work email and cannot get in until somebody who knows them says yes."
      />

      {!may ? (
        <Card className="p-[var(--s4)]">
          <EmptyState
            icon={<ShieldCheck size={22} />}
            title="Only a department head, HR or an administrator can admit somebody"
            hint="If a colleague is waiting, tell the head of their department or a company administrator — they will see the request here."
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-[var(--s4)]">
          <EmptyState icon={<UserCheck size={22} />} title="Nobody is waiting" hint="New sign-ups appear here the moment they ask to join, and you are notified." />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={`${rows.length} waiting`}
            subtitle="Approving gives them access immediately. Everything you set here can be changed afterwards in the employee record."
          />
          <div className="divide-y border-t">
            {rows.map((p) => (
              <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-[var(--s4)] py-3">
                <Avatar name={p.full_name} src={p.avatar_url} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.full_name}</div>
                  <div className="text-xs text-muted truncate">
                    {p.email} · signed up {fmtDate(p.created_at)}
                    {p.designation ? ` · ${p.designation}` : ""}
                  </div>
                  {p.note && <div className="text-xs text-muted mt-1 inline-flex items-start gap-1"><Info size={12} className="mt-[2px] shrink-0" />{p.note}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.department ? <Pill tone="tone-info">{p.department}</Pill> : <Pill tone="tone-warn">{p.asked ? "No department named" : "Has not asked yet"}</Pill>}
                  <Button size="sm" variant="ghost" onClick={() => setDeclining(p)}><UserX size={14} /> Decline</Button>
                  <Button size="sm" variant="primary" onClick={() => setApproving(p)}><UserCheck size={14} /> Approve</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {approving && <ApproveModal key={approving.id} person={approving} myRole={profile.role} onClose={() => setApproving(null)} onDone={remove} />}
      {declining && <DeclineModal key={declining.id} person={declining} onClose={() => setDeclining(null)} onDone={remove} />}
    </div>
  );
}

function ApproveModal({ person, myRole, onClose, onDone }: { person: PendingAccount; myRole: RoleLevel; onClose: () => void; onDone: (id: string) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [departmentId, setDepartmentId] = React.useState(person.department_id || "");
  const [role, setRole] = React.useState<RoleLevel>(person.role || "employee");
  const [designation, setDesignation] = React.useState(person.designation || "");
  const [managerId, setManagerId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // A Super Admin may admit anybody at any level; everybody else may not hand out a level above
  // their own, which is what the database enforces too.
  const options = myRole === "super_admin" ? ROLES : ROLES.slice(Math.max(0, ROLES.indexOf(myRole)));

  async function approve() {
    setBusy(true);
    const { error } = await createClient().rpc("approve_account", {
      p_user: person.id,
      p_department: departmentId || undefined,
      p_role: role,
      p_manager: managerId || undefined,
      p_designation: designation.trim() || undefined,
      p_note: note.trim() || undefined,
    });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`${person.full_name} can sign in now`, "success");
    onDone(person.id);
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Approve ${person.full_name}`}
      width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={approve} loading={busy}><UserCheck size={15} /> Approve and let them in</Button></>}
    >
      <div className="space-y-3">
        <div className="text-sm text-muted">
          {person.email} gets access immediately and is told who approved them.
          {person.department ? <> They asked to join <span className="font-medium text-[var(--fg)]">{person.department}</span>.</> : null}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Department"><DepartmentPicker value={departmentId} onChange={setDepartmentId} /></Field>
          <Field label="Access level">
            <Select value={role} onChange={(e) => setRole(e.target.value as RoleLevel)}>
              {options.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          <Field label="Designation"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Sales Executive" /></Field>
          <Field label="Reports to"><PersonPicker value={managerId} onChange={setManagerId} placeholder="No manager" /></Field>
          <Field label="Note for the record" className="sm:col-span-2" hint="Optional — kept with the request.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Confirmed with HR." />
          </Field>
        </div>
        <div className="text-[11px] text-muted">
          The access level is where they sit in the chain of command, not what they may do — permissions come from
          security roles in Access Control.
        </div>
      </div>
    </Modal>
  );
}

function DeclineModal({ person, onClose, onDone }: { person: PendingAccount; onClose: () => void; onDone: (id: string) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function decline() {
    setBusy(true);
    const { error } = await createClient().rpc("decline_account", { p_user: person.id, p_reason: reason.trim() || undefined });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`${person.full_name} was told`, "success");
    onDone(person.id);
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Decline ${person.full_name}`}
      width={460}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={decline} loading={busy}><UserX size={15} /> Decline the request</Button></>}
    >
      <div className="space-y-3">
        <div className="text-sm text-muted">
          The account stays closed and {person.full_name.split(" ")[0]} is told, so they can correct the department they
          named and ask again. Nothing is deleted.
        </div>
        <Field label="Reason" hint="They will see this. Say what would make it approvable.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Not a member of this department — ask the head of Operations." />
        </Field>
      </div>
    </Modal>
  );
}
