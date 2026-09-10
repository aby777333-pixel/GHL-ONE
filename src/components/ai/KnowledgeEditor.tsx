"use client";

import * as React from "react";
import { BookOpen, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, Field, Input, Modal, Select, Textarea, useToast } from "@/components/ui";
import { ClassificationPicker, DepartmentPicker } from "@/components/pickers";
import type { Classification } from "@/lib/utils";

export const KNOWLEDGE_KINDS = ["sop", "policy", "faq", "script", "objection", "guide", "incident", "positioning", "checklist", "template"] as const;
export const KIND_LABEL: Record<string, string> = { sop: "SOP", policy: "Policy", faq: "FAQ", script: "Script", objection: "Objection handling", guide: "Guide", incident: "Incident learning", positioning: "Positioning", checklist: "Checklist", template: "Template" };

export type KnowledgeDraft = {
  id?: string;
  title: string;
  body: string;
  kind: string;
  department_id: string;
  tags: string;
  classification: Classification;
  review_at: string;
  source_type?: string | null;
  source_id?: string | null;
};

export function emptyKnowledge(departmentId?: string | null): KnowledgeDraft {
  return { title: "", body: "", kind: "guide", department_id: departmentId || "", tags: "", classification: "internal", review_at: "" };
}

/**
 * Create / edit a knowledge article. Anyone can create a draft; owners may approve on save.
 * `approveOnSave` sets status = approved (the DB trigger validates ownership).
 */
export function KnowledgeEditor({ open, onClose, initial, canApprove, onSaved }: {
  open: boolean;
  onClose: () => void;
  initial: KnowledgeDraft;
  canApprove?: boolean;
  onSaved?: (id: string, approved: boolean) => void;
}) {
  const { profile } = useSession();
  const toast = useToast();
  const [d, setD] = React.useState<KnowledgeDraft>(initial);
  const [busy, setBusy] = React.useState<"draft" | "approve" | null>(null);
  const lastInitial = React.useRef(initial);

  // Re-seed when a different article is opened.
  React.useEffect(() => {
    if (lastInitial.current === initial) return;
    lastInitial.current = initial;
    const t = setTimeout(() => setD(initial), 0);
    return () => clearTimeout(t);
  }, [initial]);

  const patch = (p: Partial<KnowledgeDraft>) => setD((s) => ({ ...s, ...p }));
  const [today] = React.useState(() => new Date().toISOString().slice(0, 10));

  const save = async (approve: boolean) => {
    if (!d.title.trim()) return toast.push("Give the article a title", "danger");
    if (!d.body.trim()) return toast.push("Write the article body", "danger");
    if (d.review_at && d.review_at < today) return toast.push("The review date is in the past — pick today or later", "danger");
    setBusy(approve ? "approve" : "draft");
    const supabase = createClient();
    const tags = d.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    const payload = {
      title: d.title.trim(),
      body: d.body,
      kind: d.kind,
      department_id: d.department_id || null,
      tags,
      classification: d.classification,
      review_at: d.review_at || null,
    };
    let id = d.id;
    let error: { message: string } | null = null;
    if (id) {
      ({ error } = await supabase.from("ai_knowledge").update({ ...payload, ...(approve ? { status: "approved" } : {}) }).eq("id", id));
    } else {
      const res = await supabase.from("ai_knowledge").insert({ ...payload, org_id: profile.org_id!, status: "draft", created_by: profile.id, owner_id: approve ? profile.id : null, source_type: d.source_type || "manual", source_id: d.source_id || null }).select("id").single();
      error = res.error;
      id = res.data?.id;
      if (!error && approve && id) ({ error } = await supabase.from("ai_knowledge").update({ status: "approved" }).eq("id", id));
    }
    setBusy(null);
    if (error || !id) return toast.push(error?.message || "Could not save", "danger");
    toast.push(approve ? "Approved — Buddy will use this from now on" : d.id ? "Saved" : "Draft sent to your department's knowledge owner for approval", "success");
    onSaved?.(id, approve);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><BookOpen size={16} /> {d.id ? "Edit knowledge" : "New knowledge article"}</span>}
      width={760}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={canApprove ? "secondary" : "primary"} onClick={() => save(false)} loading={busy === "draft"}><Save size={14} /> {d.id ? "Save" : "Save draft"}</Button>
          {canApprove && <Button variant="primary" onClick={() => save(true)} loading={busy === "approve"}>Save &amp; approve</Button>}
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Title"><Input value={d.title} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. How we hand a design over to Content" autoFocus /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Kind">
            <Select value={d.kind} onChange={(e) => patch({ kind: e.target.value })}>
              {KNOWLEDGE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </Select>
          </Field>
          <Field label="Department" hint="Empty = company-wide"><DepartmentPicker value={d.department_id} onChange={(v) => patch({ department_id: v })} placeholder="Company-wide" /></Field>
          <Field label="Classification"><ClassificationPicker value={d.classification} onChange={(v) => patch({ classification: v })} /></Field>
        </div>
        <Field label="Body" hint="Markdown. Write what a colleague needs to act: steps, who owns what, where things live.">
          <Textarea value={d.body} onChange={(e) => patch({ body: e.target.value })} className="!min-h-[260px] font-mono !text-[13px]" placeholder={"## When to use\n\n## Steps\n1. …"} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Tags" hint="Comma separated"><Input value={d.tags} onChange={(e) => patch({ tags: e.target.value })} placeholder="leave, self-service" /></Field>
          {/* Same rule as the "Set review date" dialog: a review date in the past is born overdue. */}
          <Field label="Review by" hint="Buddy warns when guidance is past its review date" error={d.review_at && d.review_at < today ? "Pick today or a later date." : undefined}>
            <Input type="date" min={today} value={d.review_at} onChange={(e) => patch({ review_at: e.target.value })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
