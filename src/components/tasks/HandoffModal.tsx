"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Link2, Paperclip, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Modal, Select, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import type { Task } from "@/lib/utils";
import type { HandoffAsset } from "./HandoffPanel";

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * "Hand off to department": packages the task (brief, copy, assets, deadline, approver) and inserts a `handoffs` row.
 * The DB trigger moves the task to the receiving department, marks it waiting and notifies their leads.
 */
export function HandoffModal({ open, onClose, task, attachmentCount }: { open: boolean; onClose: () => void; task: Task; attachmentCount: number }) {
  const { profile, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const fromDept = task.department_id || profile.department_id || null;
  const targets = departments.filter((d) => d.id !== fromDept);

  const [toDept, setToDept] = React.useState("");
  const [toUser, setToUser] = React.useState("");
  const [brief, setBrief] = React.useState("");
  const [copy, setCopy] = React.useState("");
  const [assets, setAssets] = React.useState<HandoffAsset[]>([]);
  const [deadline, setDeadline] = React.useState(task.due_date ? toLocalInput(task.due_date) : "");
  const [approver, setApprover] = React.useState(task.approver_id || "");
  const [busy, setBusy] = React.useState(false);

  // Reset the form each time the modal opens so a second handoff starts clean.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setToDept("");
      setToUser("");
      setBrief("");
      setCopy("");
      setAssets([]);
      setDeadline(task.due_date ? toLocalInput(task.due_date) : "");
      setApprover(task.approver_id || "");
    }
  }

  function setAsset(i: number, patch: Partial<HandoffAsset>) {
    setAssets((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!toDept) return toast.push("Choose the receiving department", "danger");
    if (!brief.trim()) return toast.push("Write a brief — the receiving team needs to know what to do", "danger");
    const cleanAssets = assets.map((a) => ({ name: a.name.trim() || a.link.trim(), link: a.link.trim() })).filter((a) => a.link);
    setBusy(true);
    const { error } = await createClient().from("handoffs").insert({
      org_id: profile.org_id!,
      task_id: task.id,
      from_department_id: fromDept,
      to_department_id: toDept,
      from_user_id: profile.id,
      to_user_id: toUser || null,
      package: {
        brief: brief.trim(),
        copy: copy.trim(),
        assets: cleanAssets,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        approver_id: approver || null,
      },
    });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    const name = departments.find((d) => d.id === toDept)?.name || "the department";
    toast.push(`Handed off to ${name} — they've been notified`, "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title={<span className="inline-flex items-center gap-2"><ArrowRightLeft size={16} className="text-muted" /> Hand off to department</span>} width={620}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="To department">
            <Select value={toDept} onChange={(e) => { setToDept(e.target.value); setToUser(""); }} required>
              <option value="">Choose a department</option>
              {targets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Specific person (optional)" hint={toDept ? undefined : "Pick a department first"}>
            <PersonPicker value={toUser} onChange={setToUser} departmentId={toDept || "__none__"} placeholder={toDept ? "Department lead decides" : "—"} disabled={!toDept} />
          </Field>
        </div>

        <Field label="Brief" hint="What needs to be done, the outcome expected and anything they must know. Required.">
          <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Design a 3-page investor teaser using the attached deck. Tone: institutional, calm. Final files as PDF + Figma link." style={{ minHeight: 96 }} required />
        </Field>
        <Field label="Copy / notes" hint="Text they should use verbatim, references, or context from the client.">
          <Textarea value={copy} onChange={(e) => setCopy(e.target.value)} placeholder="Optional" style={{ minHeight: 72 }} />
        </Field>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="label mb-0">Assets</span>
            <Button type="button" size="xs" variant="ghost" onClick={() => setAssets((l) => [...l, { name: "", link: "" }])}><Plus size={12} /> Add link</Button>
          </div>
          {assets.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {assets.map((a, i) => (
                <div key={i} className="grid grid-cols-[1fr_1.618fr_auto] gap-1.5 items-center">
                  <Input value={a.name} onChange={(e) => setAsset(i, { name: e.target.value })} placeholder="Name" className="h-9 min-w-0" />
                  <Input value={a.link} onChange={(e) => setAsset(i, { link: e.target.value })} placeholder="https://…" inputMode="url" className="h-9 min-w-0" />
                  <button type="button" onClick={() => setAssets((l) => l.filter((_, j) => j !== i))} className="btn btn-ghost btn-sm btn-icon" aria-label="Remove asset"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="text-[11px] text-muted inline-flex items-center gap-1.5">
            <Paperclip size={11} />
            {attachmentCount > 0 ? `The task's ${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"} travel with it automatically.` : "Files already attached to the task travel with it automatically."}
            <Link2 size={11} className="ml-1" /> Add links for Drive, Figma or external references.
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Deadline" hint="Applied to the task once accepted."><Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
          <Field label="Approver" hint="Who signs off the delivered work."><PersonPicker value={approver} onChange={setApprover} placeholder="No approver" /></Field>
        </div>

        <div className="text-xs text-muted rounded-[var(--radius-sm)] sunken px-3 py-2">
          The task moves to the receiving department and waits for their acceptance. Their leads are notified now; you are notified when they accept or decline. You can withdraw while it is pending.
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}><ArrowRightLeft size={14} /> Send handoff</Button>
        </div>
      </form>
    </Modal>
  );
}
