"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Textarea, useToast } from "@/components/ui";
import { PersonPicker, PriorityPicker, ProjectPicker, DepartmentPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { AssigneeLoadPill, type LoadInfo } from "@/components/tasks/TaskGovernance";
import type { TaskPriority } from "@/lib/utils";

export type QuickTaskDefaults = {
  title?: string;
  description?: string;
  project_id?: string | null;
  department_id?: string | null;
  assignee_id?: string | null;
  approver_id?: string | null;
  due_date?: string | null;
  priority?: TaskPriority;
  parent_id?: string | null;
  source_message_id?: string | null;
  source_meeting_id?: string | null;
};

/** Create a task. Used by Quick Capture, project rooms, chat → task, meetings → task. */
export function QuickTaskForm({ defaults = {}, onCreated, onCancel, compact }: { defaults?: QuickTaskDefaults; onCreated?: (id: string) => void; onCancel?: () => void; compact?: boolean }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = React.useState(defaults.title || "");
  const [description, setDescription] = React.useState(defaults.description || "");
  const [projectId, setProjectId] = React.useState(defaults.project_id || "");
  const [departmentId, setDepartmentId] = React.useState(defaults.department_id || profile.department_id || "");
  const [assignee, setAssignee] = React.useState(defaults.assignee_id || "");
  const [approver, setApprover] = React.useState(defaults.approver_id || "");
  const [due, setDue] = React.useState(defaults.due_date ? defaults.due_date.slice(0, 16) : "");
  const [priority, setPriority] = React.useState<TaskPriority>(defaults.priority || "normal");
  const [loading, setLoading] = React.useState(false);
  // Assignment rules (`can_assign`) + load preview for the chosen assignee.
  const [load, setLoad] = React.useState<{ assignee: string; info: LoadInfo | null } | null>(null);
  const blocked = !!assignee && assignee !== profile.id && load?.assignee === assignee && !!load.info && !load.info.canAssign;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || blocked) return;
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        org_id: profile.org_id!,
        title: title.trim(),
        description: description || null,
        project_id: projectId || null,
        department_id: departmentId || null,
        assignee_id: assignee || null,
        owner_id: profile.id,
        delegated_by: assignee && assignee !== profile.id ? profile.id : null,
        approver_id: approver || null,
        requires_approval: !!approver,
        due_date: due ? new Date(due).toISOString() : null,
        priority,
        parent_id: defaults.parent_id || null,
        source_message_id: defaults.source_message_id || null,
        source_meeting_id: defaults.source_meeting_id || null,
        created_by: profile.id,
        status: "todo",
      })
      .select("id")
      .single();
    setLoading(false);
    if (error || !data) {
      toast.push(error?.message || "Could not create task", "danger");
      return;
    }
    toast.push("Task created", "success");
    router.refresh();
    onCreated?.(data.id);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="What needs to be done?">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Prepare the Mauritius investor deck" required />
      </Field>
      {!compact && (
        <Field label="Details">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Context, expectations, links…" style={{ minHeight: 72 }} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Assign to">
          <PersonPicker value={assignee} onChange={setAssignee} />
          <div className="mt-1 min-h-[18px]"><AssigneeLoadPill assignee={assignee} due={due ? new Date(due).toISOString() : null} onLoad={(info) => setLoad({ assignee, info })} /></div>
          {blocked && <span className="block text-[11px] text-danger mt-1">You cannot assign work to this person directly. <Link href="/help?tab=ask" className="underline">Request help</Link> so their manager can route it.</span>}
        </Field>
        <Field label="Priority">
          <PriorityPicker value={priority} onChange={setPriority} />
        </Field>
        <Field label="Deadline">
          <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Project">
          <ProjectPicker value={projectId} onChange={setProjectId} />
        </Field>
        {!compact && (
          <>
            <Field label="Department">
              <DepartmentPicker value={departmentId} onChange={setDepartmentId} />
            </Field>
            <Field label="Approver (optional)">
              <PersonPicker value={approver} onChange={setApprover} placeholder="No approval needed" />
            </Field>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" variant="primary" loading={loading} disabled={blocked} title={blocked ? "Use Request Help" : undefined}>Create task</Button>
      </div>
    </form>
  );
}
