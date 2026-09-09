"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Modal, Select, Textarea, useToast } from "@/components/ui";
import { PersonPicker, PriorityPicker, ProjectPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { APPROVAL_TYPES, humanize, type ApprovalType, type TaskPriority } from "@/lib/utils";
import { AMOUNT_TYPES } from "./ApprovalBits";

export type RequestApprovalDefaults = {
  title?: string;
  type?: ApprovalType;
  project_id?: string | null;
  task_id?: string | null;
  file_id?: string | null;
  approver_id?: string | null;
  description?: string;
};

export function RequestApprovalModal({ open, onClose, defaults = {}, onCreated }: { open: boolean; onClose: () => void; defaults?: RequestApprovalDefaults; onCreated?: (id: string) => void }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = React.useState<ApprovalType>(defaults.type || "other");
  const [title, setTitle] = React.useState(defaults.title || "");
  const [description, setDescription] = React.useState(defaults.description || "");
  const [approver, setApprover] = React.useState(defaults.approver_id || profile.manager_id || "");
  const [priority, setPriority] = React.useState<TaskPriority>("normal");
  const [due, setDue] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [projectId, setProjectId] = React.useState(defaults.project_id || "");
  const [loading, setLoading] = React.useState(false);

  const needsAmount = AMOUNT_TYPES.includes(type);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (!approver) return toast.push("Choose an approver", "danger");
    // Belt and braces — the picker already excludes you, and a DB trigger rejects it as well.
    if (approver === profile.id) return toast.push("You cannot assign an approval to yourself.", "danger");
    setLoading(true);
    const { data, error } = await createClient()
      .from("approvals")
      .insert({
        org_id: profile.org_id!,
        type,
        title: title.trim(),
        description: description.trim() || null,
        requested_by: profile.id,
        approver_id: approver,
        priority,
        due_date: due ? new Date(due).toISOString() : null,
        amount: needsAmount && amount ? Number(amount) : null,
        project_id: projectId || null,
        task_id: defaults.task_id || null,
        file_id: defaults.file_id || null,
      })
      .select("id")
      .single();
    setLoading(false);
    if (error || !data) return toast.push(error?.message || "Could not send request", "danger");
    toast.push("Approval requested", "success");
    router.refresh();
    onCreated?.(data.id);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Request approval" width={600}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as ApprovalType)}>
              {APPROVAL_TYPES.map((t) => (
                <option key={t} value={t}>{humanize(t)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <PriorityPicker value={priority} onChange={setPriority} />
          </Field>
        </div>
        <Field label="What needs approval?">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q3 investor deck — final design" required />
        </Field>
        <Field label="Details" hint="Context the approver needs to decide quickly: links, numbers, options considered.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why, what and by when…" style={{ minHeight: 89 }} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Approver" hint={profile.manager_id ? "Defaults to your manager." : undefined}>
            <PersonPicker value={approver} onChange={setApprover} placeholder="Choose approver" excludeIds={[profile.id]} />
          </Field>
          <Field label="Needed by">
            <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          {needsAmount && (
            <Field label="Amount (₹)">
              <Input type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </Field>
          )}
          <Field label="Project">
            <ProjectPicker value={projectId} onChange={setProjectId} />
          </Field>
        </div>
        {(defaults.task_id || defaults.file_id) && (
          <div className="text-xs text-muted">
            {defaults.task_id && <span>Linked to task · </span>}
            {defaults.file_id && <span>Linked to file</span>}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading}>Send request</Button>
        </div>
      </form>
    </Modal>
  );
}
