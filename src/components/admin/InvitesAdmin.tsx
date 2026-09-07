"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MailPlus, Trash2, CheckCircle2, Clock, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { fmtDate, ROLE_LABEL, type RoleLevel, type Tables } from "@/lib/utils";
import { RolePill } from "@/components/people/PeopleBits";

export type InviteItem = Tables<"invites"> & { inviter: { id: string; full_name: string; avatar_url: string | null } | null };

const ROLES: RoleLevel[] = ["director", "executive", "department_head", "manager", "team_lead", "employee", "intern", "consultant", "vendor", "guest"];

export function InvitesAdmin({ invites }: { invites: InviteItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments, people } = useSession();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [role, setRole] = React.useState<RoleLevel>("employee");
  const [departmentId, setDepartmentId] = React.useState("");
  const [designation, setDesignation] = React.useState("");
  const [managerId, setManagerId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const pending = invites.filter((i) => !i.accepted_at);
  const accepted = invites.filter((i) => !!i.accepted_at);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!profile.org_id) return;
    setBusy(true);
    const { error } = await createClient().from("invites").insert({
      org_id: profile.org_id, email: email.trim().toLowerCase(), full_name: fullName.trim() || null, role, department_id: departmentId || null, designation: designation.trim() || null, manager_id: managerId || null, invited_by: profile.id,
    });
    setBusy(false);
    if (error) { toast.push(error.message.includes("duplicate") ? "An invite for this email already exists" : error.message, "danger"); return; }
    toast.push(`Invite created for ${email.trim()}`, "success");
    setOpen(false);
    setEmail(""); setFullName(""); setRole("employee"); setDepartmentId(""); setDesignation(""); setManagerId("");
    router.refresh();
  }

  async function remove(inv: InviteItem) {
    const { error } = await createClient().from("invites").delete().eq("id", inv.id);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Invite removed", "success");
    router.refresh();
  }

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name;
  const personName = (id: string | null) => people.find((p) => p.id === id)?.full_name;

  return (
    <div className="space-y-[var(--s4)]">
      <div className="card px-[var(--s4)] py-[var(--s3)] flex items-start gap-3 text-sm">
        <Info size={16} className="text-[var(--brand)] shrink-0 mt-0.5" />
        <div>
          <div className="font-medium">How invites work</div>
          <div className="text-muted">When this email signs up, the account activates automatically with these settings — role, department, designation and manager. No manual approval needed.</div>
        </div>
        <Button variant="primary" className="ml-auto shrink-0" onClick={() => setOpen(true)}><MailPlus size={15} /> <span className="hidden sm:inline">New invite</span></Button>
      </div>

      <Card>
        <CardHeader title="Pending" subtitle={pending.length ? `${pending.length} waiting to sign up` : "No pending invites"} action={<Clock size={15} className="text-muted" />} />
        {pending.length === 0 ? (
          <EmptyState title="No pending invites" hint="Invite a colleague and their account will be ready the moment they sign up." className="py-[var(--s4)]" action={<Button variant="primary" size="sm" onClick={() => setOpen(true)}><MailPlus size={14} /> New invite</Button>} />
        ) : (
          <div className="divide-y border-t">
            {pending.map((i) => (
              <div key={i.id} className="flex items-center gap-3 px-[var(--s4)] py-2.5">
                <Avatar name={i.full_name || i.email} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{i.full_name || i.email}</div>
                  <div className="text-[11px] text-muted truncate flex items-center gap-1.5 flex-wrap">
                    <span>{i.email}</span>
                    {deptName(i.department_id) && <span>· {deptName(i.department_id)}</span>}
                    {i.designation && <span>· {i.designation}</span>}
                    {personName(i.manager_id) && <span>· reports to {personName(i.manager_id)}</span>}
                    <span>· invited {fmtDate(i.created_at)}{i.inviter ? ` by ${i.inviter.full_name}` : ""}</span>
                  </div>
                </div>
                <RolePill role={i.role} />
                <Button size="sm" variant="ghost" icon className="text-danger" onClick={() => remove(i)} aria-label="Delete invite"><Trash2 size={14} /></Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {accepted.length > 0 && (
        <Card>
          <CardHeader title="Accepted" subtitle={`${accepted.length} joined via invite`} action={<CheckCircle2 size={15} className="text-success" />} />
          <div className="divide-y border-t">
            {accepted.map((i) => (
              <div key={i.id} className="flex items-center gap-3 px-[var(--s4)] py-2">
                <Avatar name={i.full_name || i.email} size={26} />
                <div className="min-w-0 flex-1 text-sm truncate">{i.full_name || i.email} <span className="text-muted text-xs">· {i.email}</span></div>
                <Pill tone="tone-success">Joined {fmtDate(i.accepted_at)}</Pill>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Invite a colleague" width={520}>
        <form onSubmit={create} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email" className="sm:col-span-2"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@ghlindia.com" required autoFocus /></Field>
            <Field label="Full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Optional" /></Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value as RoleLevel)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            </Field>
            <Field label="Department"><DepartmentPicker value={departmentId} onChange={setDepartmentId} /></Field>
            <Field label="Designation"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Content Writer" /></Field>
            <Field label="Reports to" className="sm:col-span-2"><PersonPicker value={managerId} onChange={setManagerId} placeholder="No manager" /></Field>
          </div>
          <p className="text-[11px] text-muted">Share the sign-in link with them separately. When {email.trim() || "this email"} signs up, everything above is applied automatically.</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}><MailPlus size={15} /> Create invite</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
