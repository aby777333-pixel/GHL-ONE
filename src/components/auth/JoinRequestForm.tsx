"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";

export type JoinRequestRow = {
  id: string;
  department_id: string | null;
  designation: string | null;
  note: string | null;
  status: string;
  decision_note: string | null;
  decided_label: string | null;
};

/**
 * The half of activation that was missing: the person says which department they belong to, and
 * that is what routes the request to the people who can admit them (`account_approvers`). Without
 * it a Super Admin saw a name and an email and had no way of knowing whose colleague this was.
 *
 * This page sits outside the app shell, so it has no ToastProvider — every message is inline.
 */
export function JoinRequestForm({
  departments,
  request,
  company,
}: {
  departments: { id: string; name: string }[];
  request: JoinRequestRow | null;
  company: string | null;
}) {
  const router = useRouter();
  const pending = request?.status === "pending" ? request : null;
  const declined = request?.status === "declined" ? request : null;

  const [open, setOpen] = React.useState(!pending);
  const [departmentId, setDepartmentId] = React.useState(request?.department_id || "");
  const [designation, setDesignation] = React.useState(request?.designation || "");
  const [note, setNote] = React.useState(request?.note || "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<{ department: string; notified: number } | null>(null);

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name || null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!departmentId) { setErr("Choose the department you work in."); return; }
    setBusy(true);
    const { data, error } = await createClient().rpc("request_account_activation", {
      p_department: departmentId,
      // Optional arguments are omitted rather than sent as null: the function signature
      // already defaults them, and the generated type will not take a null.
      p_designation: designation.trim() || undefined,
      p_note: note.trim() || undefined,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const res = (data || {}) as { notified?: number; already_active?: boolean };
    // Approved while this page was open: the shell is a normal navigation away.
    if (res.already_active) { router.push("/"); return; }
    setSent({ department: deptName(departmentId) || "your department", notified: res.notified || 0 });
    setOpen(false);
  }

  if (sent) {
    return (
      <div className="sunken rounded-[var(--radius)] p-[var(--s3)] text-left">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Check size={15} className="text-[var(--success)]" /> Sent to {sent.department}
        </div>
        <p className="text-xs text-muted mt-1">
          {sent.notified > 0
            ? `${sent.notified} ${sent.notified === 1 ? "person" : "people"} who can approve it ${sent.notified === 1 ? "has" : "have"} been notified.`
            : "Your company administrator has been notified."}{" "}
          You will get an email-style notice in GHL ONE the moment it is approved — press Check again then.
        </p>
      </div>
    );
  }

  if (pending && !open) {
    return (
      <div className="sunken rounded-[var(--radius)] p-[var(--s3)] text-left">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Building2 size={15} className="text-muted" />
          Waiting on {deptName(pending.department_id) || company || "your company"}
        </div>
        <p className="text-xs text-muted mt-1">
          Your request is with the head of that department and the company administrators. Nothing more is needed from you.
        </p>
        <button className="link text-xs mt-2" onClick={() => setOpen(true)}>Correct the details</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="text-left space-y-3">
      {declined && (
        <div className="rounded-[var(--radius-sm)] tone-danger px-3 py-2 text-xs">
          <span className="font-medium">Not approved{declined.decided_label ? ` by ${declined.decided_label}` : ""}.</span>{" "}
          {declined.decision_note || "No reason was given."} Correct the details below and ask again.
        </div>
      )}
      <Field label="Which department do you work in?">
        <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required>
          <option value="">Choose a department…</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </Field>
      <Field label="Your role" hint="Optional — what you were hired as, e.g. Sales Executive.">
        <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Sales Executive" maxLength={80} />
      </Field>
      <Field label="Anything that helps them recognise you" hint="Optional — who hired you, when you started.">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Joined on 15 Sep, reporting to…" maxLength={300} />
      </Field>
      {err && <div className="text-sm text-danger">{err}</div>}
      <div className="flex gap-2">
        {pending && <Button type="button" variant="ghost" onClick={() => { setOpen(false); setErr(null); }}>Cancel</Button>}
        <Button type="submit" variant="primary" className="flex-1" loading={busy}><Send size={15} /> {pending ? "Send the correction" : "Send for approval"}</Button>
      </div>
    </form>
  );
}
