"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Textarea, useToast } from "@/components/ui";
import { ClassificationPicker, DepartmentPicker, ProjectPicker } from "@/components/pickers";
import { PeopleMultiSelect } from "@/components/meetings/PeopleMultiSelect";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { isLeadPlus, type Classification, type Decision } from "@/lib/utils";

export type DecisionDefaults = {
  title?: string;
  decision?: string;
  project_id?: string | null;
  department_id?: string | null;
  meeting_id?: string | null;
  message_id?: string | null;
  channel_id?: string | null;
  participants?: string[];
};

/**
 * Record (or edit) a decision. Insert requires Lead+ (RLS) — we surface the error as a toast.
 * Pass `existing` to edit; only decided_by / admins can update per RLS.
 */
export function RecordDecisionForm({ defaults = {}, existing, onDone, onCancel, compact }: { defaults?: DecisionDefaults; existing?: Decision; onDone?: (id: string) => void; onCancel?: () => void; compact?: boolean }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = React.useState(existing?.title || defaults.title || "");
  const [decision, setDecision] = React.useState(existing?.decision || defaults.decision || "");
  const [reason, setReason] = React.useState(existing?.reason || "");
  const [projectId, setProjectId] = React.useState(existing?.project_id || defaults.project_id || "");
  const [departmentId, setDepartmentId] = React.useState(existing?.department_id || defaults.department_id || profile.department_id || "");
  const [participants, setParticipants] = React.useState<string[]>(existing?.participants || defaults.participants || []);
  const [followUp, setFollowUp] = React.useState(existing?.follow_up || "");
  const [classification, setClassification] = React.useState<Classification>(existing?.classification || "internal");
  const [showPeople, setShowPeople] = React.useState(!compact);
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !decision.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const payload = {
      title: title.trim(),
      decision: decision.trim(),
      reason: reason.trim() || null,
      project_id: projectId || null,
      department_id: departmentId || null,
      participants,
      follow_up: followUp.trim() || null,
      classification,
    };
    if (existing) {
      const { error } = await supabase.from("decisions").update(payload).eq("id", existing.id);
      setLoading(false);
      if (error) return toast.push(error.message, "danger");
      toast.push("Decision updated", "success");
      router.refresh();
      onDone?.(existing.id);
      return;
    }
    const { data, error } = await supabase
      .from("decisions")
      .insert({
        ...payload,
        org_id: profile.org_id!,
        decided_by: profile.id,
        meeting_id: defaults.meeting_id || null,
        message_id: defaults.message_id || null,
        channel_id: defaults.channel_id || null,
      })
      .select("id")
      .single();
    setLoading(false);
    if (error || !data) {
      toast.push(error?.message?.includes("row-level security") ? "Only team leads and above can record decisions." : error?.message || "Could not record decision", "danger");
      return;
    }
    toast.push("Decision recorded", "success");
    router.refresh();
    onDone?.(data.id);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {!existing && !isLeadPlus(profile.role) && (
        <div className="rounded-[var(--radius-sm)] tone-warn px-3 py-2 text-xs">Recording decisions is reserved for team leads and above. Ask your lead to record it.</div>
      )}
      <Field label="Decision title">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Move the investor deck launch to 15 Oct" required />
      </Field>
      <Field label="What was decided?">
        <Textarea value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="State the decision clearly, so anyone reading it later understands what changes." style={{ minHeight: 89 }} required />
      </Field>
      <Field label="Why?" hint="The reasoning is what makes this useful six months from now.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Trade-offs, constraints, options considered…" style={{ minHeight: 72 }} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Project">
          <ProjectPicker value={projectId} onChange={setProjectId} />
        </Field>
        <Field label="Department">
          <DepartmentPicker value={departmentId} onChange={setDepartmentId} />
        </Field>
        <Field label="Classification">
          <ClassificationPicker value={classification} onChange={setClassification} />
        </Field>
        <Field label="Follow-up action">
          <Input value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="What must happen next?" />
        </Field>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="label mb-0">Participants</span>
          {compact && (
            <button type="button" className="text-xs link" onClick={() => setShowPeople((s) => !s)}>{showPeople ? "Hide" : `${participants.length ? `${participants.length} selected · ` : ""}Choose`}</button>
          )}
        </div>
        {showPeople && <PeopleMultiSelect value={participants} onChange={setParticipants} maxHeight={180} />}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" variant="primary" loading={loading}>{existing ? "Save changes" : "Record decision"}</Button>
      </div>
    </form>
  );
}
