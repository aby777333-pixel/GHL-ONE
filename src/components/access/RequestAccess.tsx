"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, Modal, Select, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { fmtDate, type Tables } from "@/lib/utils";

export type AccessResourceType = "project" | "file" | "channel" | "department" | "task" | "wiki" | "folder" | "dataset";
export type AccessLevel = "view" | "comment" | "edit" | "download";
export type AccessDuration = "once" | "until_date" | "project_active" | "permanent";

const LEVELS: { key: AccessLevel; label: string; hint: string }[] = [
  { key: "view", label: "View", hint: "Read only." },
  { key: "comment", label: "Comment", hint: "Read and add comments." },
  { key: "edit", label: "Edit", hint: "Change content." },
  { key: "download", label: "Download", hint: "Save a copy outside GHL ONE. Reviewed more carefully." },
];
const DURATIONS: { key: AccessDuration; label: string }[] = [
  { key: "once", label: "Once (24 hours)" },
  { key: "until_date", label: "Until a date" },
  { key: "project_active", label: "While the project is active" },
  { key: "permanent", label: "Permanent" },
];

type Existing = Pick<Tables<"access_requests">, "id" | "status" | "level" | "approver_id" | "created_at" | "decision_note" | "granted_until">;

export type RequestAccessProps = {
  resource_type: AccessResourceType;
  resource_id: string;
  resource_label: string;
  project_id?: string | null;
  /** Called after the request is created. */
  onSent?: (id: string) => void;
};

/** The form itself (no chrome). Shows "Sent to <approver>" once submitted, or the state of a pending request. */
export function RequestAccessForm({ resource_type, resource_id, resource_label, project_id, onSent }: RequestAccessProps) {
  const { profile, people } = useSession();
  const toast = useToast();
  const [level, setLevel] = React.useState<AccessLevel>("view");
  const [reason, setReason] = React.useState("");
  const [duration, setDuration] = React.useState<AccessDuration>(project_id || resource_type === "project" ? "project_active" : "until_date");
  const [until, setUntil] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [existing, setExisting] = React.useState<Existing | null | undefined>(undefined);

  React.useEffect(() => {
    let alive = true;
    createClient()
      .from("access_requests")
      .select("id,status,level,approver_id,created_at,decision_note,granted_until")
      .eq("requester_id", profile.id)
      .eq("resource_type", resource_type)
      .eq("resource_id", resource_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setExisting(data || null);
      });
    return () => {
      alive = false;
    };
  }, [profile.id, resource_type, resource_id]);

  const approverName = (id: string | null) => (id ? people.find((p) => p.id === id)?.full_name || "the data owner" : "the data owner");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return toast.push("Please say why you need access", "danger");
    if (duration === "until_date" && !until) return toast.push("Pick an end date", "danger");
    setBusy(true);
    const { data, error } = await createClient()
      .from("access_requests")
      .insert({
        org_id: profile.org_id!,
        requester_id: profile.id,
        resource_type,
        resource_id,
        resource_label,
        level,
        reason: reason.trim(),
        duration,
        until_at: duration === "until_date" && until ? new Date(`${until}T23:59:59`).toISOString() : null,
        project_id: project_id || (resource_type === "project" ? resource_id : null),
      })
      .select("id,status,level,approver_id,created_at,decision_note,granted_until")
      .single();
    setBusy(false);
    if (error || !data) return toast.push(error?.message || "Could not send the request", "danger");
    setExisting(data);
    toast.push(`Request sent to ${approverName(data.approver_id)}`, "success");
    onSent?.(data.id);
  }

  if (existing && existing.status === "pending") {
    return (
      <div className="rounded-[var(--radius)] border sunken p-[var(--s4)] text-center anim-pop">
        <span className="w-11 h-11 rounded-full tone-success inline-flex items-center justify-center mb-3"><CheckCircle2 size={20} /></span>
        <div className="font-medium">Sent to {approverName(existing.approver_id)}</div>
        <div className="text-sm text-muted mt-1">
          Requested {LEVELS.find((l) => l.key === existing.level)?.label.toLowerCase() || existing.level} access on {fmtDate(existing.created_at, true)}. You will get a notification in your inbox as soon as it is decided.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {existing && existing.status !== "pending" && (
        <div className="rounded-[var(--radius-sm)] border px-3 py-2 text-xs text-muted">
          Your previous request was <span className="font-medium text-2">{existing.status.replace(/_/g, " ")}</span>{existing.decision_note ? ` — “${existing.decision_note}”` : ""}. You can ask again with more context.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Access level" hint={LEVELS.find((l) => l.key === level)?.hint}>
          <Select value={level} onChange={(e) => setLevel(e.target.value as AccessLevel)}>
            {LEVELS.map((l) => (
              <option key={l.key} value={l.key}>{l.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="For how long">
          <Select value={duration} onChange={(e) => setDuration(e.target.value as AccessDuration)}>
            {DURATIONS.filter((d) => d.key !== "project_active" || project_id || resource_type === "project").map((d) => (
              <option key={d.key} value={d.key}>{d.label}</option>
            ))}
          </Select>
        </Field>
        {duration === "until_date" && (
          <Field label="Until" className="sm:col-span-2">
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} required />
          </Field>
        )}
      </div>
      <Field label="Why do you need it?" hint="The approver sees exactly this. One or two clear sentences work best.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I'm preparing the Q4 investor update and need the latest figures from this project." style={{ minHeight: 84 }} required autoFocus />
      </Field>
      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-[11px] text-muted inline-flex items-center gap-1"><ShieldCheck size={12} /> Routed to the data owner; high-risk requests go to the primary admin.</span>
        <Button type="submit" variant="primary" loading={busy}><KeyRound size={14} /> Request access</Button>
      </div>
    </form>
  );
}

/** Modal wrapper. */
export function RequestAccessModal({ open, onClose, ...props }: RequestAccessProps & { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={`Request access · ${props.resource_label}`} width={560}>
      <RequestAccessForm {...props} onSent={(id) => { props.onSent?.(id); }} />
    </Modal>
  );
}

/** Full-page friendly "restricted" state, used instead of a bare 404 / forbidden. */
export function RestrictedResource({ kind, backHref, backLabel, ...props }: RequestAccessProps & { kind: string; backHref: string; backLabel: string }) {
  return (
    <div className="page page-narrow anim-fade-up">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs text-muted hover:underline mb-[var(--s3)]"><ArrowLeft size={12} /> {backLabel}</Link>
      <Card className="p-[var(--s5)]">
        <div className="flex items-start gap-4 mb-[var(--s4)]">
          <span className="w-12 h-12 rounded-[var(--radius)] tone-warn flex items-center justify-center shrink-0"><Lock size={20} /></span>
          <div className="min-w-0">
            <h1 className="h2">This {kind} is restricted</h1>
            <p className="text-sm text-muted mt-1">
              You do not have permission to open it right now — or the link is no longer valid. Tell the owner why you need it and they can grant access for exactly as long as you need.
            </p>
          </div>
        </div>
        <RequestAccessForm {...props} />
      </Card>
    </div>
  );
}
