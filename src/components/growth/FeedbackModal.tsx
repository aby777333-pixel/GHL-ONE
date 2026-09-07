"use client";

import * as React from "react";
import { MessageSquareHeart, Eye, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Field, Modal, Select, Textarea, useToast } from "@/components/ui";
import { ProjectPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";
import { FEEDBACK_KINDS, FEEDBACK_KIND_HINT, FEEDBACK_KIND_LABEL, FEEDBACK_VISIBILITY, FEEDBACK_VISIBILITY_HINT, FEEDBACK_VISIBILITY_LABEL, type FeedbackKind, type FeedbackVisibility } from "./lib";

export function FeedbackModal({ toUserId, isManagerOfRecipient, onClose, onDone }: { toUserId: string; isManagerOfRecipient?: boolean; onClose: () => void; onDone?: () => void }) {
  const { profile, people } = useSession();
  const toast = useToast();
  const self = toUserId === profile.id;
  const to = people.find((p) => p.id === toUserId);
  const [kind, setKind] = React.useState<FeedbackKind>(self ? "self" : isManagerOfRecipient ? "manager" : "peer");
  const [projectId, setProjectId] = React.useState("");
  const [body, setBody] = React.useState("");
  const [visibility, setVisibility] = React.useState<FeedbackVisibility>("recipient");
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    const { error } = await createClient().from("feedback").insert({ org_id: profile.org_id!, from_user_id: profile.id, to_user_id: toUserId, kind, project_id: kind === "project" ? projectId || null : null, body: body.trim(), visibility: self ? "recipient" : visibility });
    setLoading(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(self ? "Reflection saved to your profile." : `Feedback shared with ${to?.full_name.split(" ")[0] || "them"}.`, "success");
    onDone?.();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={self ? "Self reflection" : `Feedback for ${to?.full_name || "colleague"}`} width={520}>
      <form onSubmit={submit} className="space-y-3">
        {!self && to && <div className="flex items-center gap-2.5 text-sm"><Avatar name={to.full_name} src={to.avatar_url} size={30} /><div><div className="font-medium">{to.full_name}</div><div className="text-[11px] text-muted">{to.designation || ""}</div></div></div>}
        <Field label="Kind">
          <div className="flex flex-wrap gap-1.5">
            {FEEDBACK_KINDS.filter((k) => (self ? k === "self" : k !== "self")).map((k) => (
              <button type="button" key={k} onClick={() => setKind(k)} className={cn("pill pill-lg border transition-colors", kind === k ? "tone-brand border-transparent" : "tone-neutral border-[var(--line)] hover:bg-[var(--line)]")}>{FEEDBACK_KIND_LABEL[k]}</button>
            ))}
          </div>
          <span className="block text-[11px] text-muted mt-1">{FEEDBACK_KIND_HINT[kind]}</span>
        </Field>
        {kind === "project" && <Field label="Project"><ProjectPicker value={projectId} onChange={setProjectId} placeholder="Which project?" /></Field>}
        <Field label={self ? "Reflection" : "Feedback"} hint="Be specific: what happened, what worked, what would make it even better.">
          <Textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 130 }} placeholder={self ? "What went well this month? What would I do differently?" : "e.g. The way you handled the client escalation on Tuesday was calm and clear — the follow-up summary was exactly what they needed."} required />
        </Field>
        {!self && (
          <Field label="Who can see this">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as FeedbackVisibility)}>
              {FEEDBACK_VISIBILITY.map((v) => <option key={v} value={v}>{FEEDBACK_VISIBILITY_LABEL[v]}</option>)}
            </Select>
            <span className="block text-[11px] text-muted mt-1 inline-flex items-start gap-1">{visibility === "recipient" ? <Lock size={11} className="mt-0.5 shrink-0" /> : <Eye size={11} className="mt-0.5 shrink-0" />}<span>{FEEDBACK_VISIBILITY_HINT[visibility]} You can always see what you wrote.</span></span>
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading} disabled={!body.trim()}><MessageSquareHeart size={14} /> {self ? "Save reflection" : "Share feedback"}</Button>
        </div>
      </form>
    </Modal>
  );
}
