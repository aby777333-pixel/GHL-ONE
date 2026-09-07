"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, Hourglass, MoreHorizontal, Play, UserCheck, UserPlus, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Menu, MenuItem, Modal, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { isManagerPlus, type Tables } from "@/lib/utils";
import type { HelpRequest, HelpStatus } from "./lib";

type Json = Tables<"help_requests">["form_data"];
type Patch = Partial<Pick<HelpRequest, "status" | "owner_id" | "form_data" | "acknowledged_at" | "completed_at">>;
export type ActionRequest = Pick<HelpRequest, "id" | "title" | "status" | "owner_id" | "requester_id" | "department_id" | "channel_id" | "form_data">;

/** Who may work a request: its owner, anyone in the department, managers and above. */
export function useCanWork(r: Pick<ActionRequest, "owner_id" | "department_id">) {
  const { profile } = useSession();
  return r.owner_id === profile.id || r.department_id === profile.department_id || isManagerPlus(profile.role);
}

function mergeForm(form: Json, extra: Record<string, string>): Json {
  const base = form && typeof form === "object" && !Array.isArray(form) ? (form as Record<string, Json>) : {};
  return { ...base, ...extra };
}

/**
 * Accept / Assign / Start / Waiting / Complete / Decline. `compact` renders a "…" menu (queue rows); otherwise full buttons.
 * `onChange` receives the patch so callers can update local state without a refetch.
 */
export function RequestActions({ r, compact, onChange }: { r: ActionRequest; compact?: boolean; onChange?: (id: string, patch: Patch) => void }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const canWork = useCanWork(r);
  const [dialog, setDialog] = React.useState<"assign" | "complete" | "decline" | null>(null);
  const [assignee, setAssignee] = React.useState(r.owner_id || "");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const closed = r.status === "completed" || r.status === "declined";
  if (!canWork || closed) return null;

  async function apply(patch: Patch, okMsg: string, systemLine?: string) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("help_requests").update(patch).eq("id", r.id);
    if (!error && systemLine && r.channel_id) {
      await supabase.from("messages").insert({ channel_id: r.channel_id, author_id: profile.id, kind: "system", body: systemLine });
    }
    setBusy(false);
    if (error) return toast.push(error.message.includes("row-level security") ? "You do not have permission to change this request." : error.message, "danger");
    toast.push(okMsg, "success");
    onChange?.(r.id, patch);
    setDialog(null);
    setNote("");
    router.refresh();
  }

  const setStatus = (status: HelpStatus, okMsg: string, line?: string) => apply({ status, ...(status === "accepted" && !r.owner_id ? { owner_id: profile.id } : {}) }, okMsg, line);

  const items: { key: string; label: string; icon: React.ReactNode; onClick: () => void; primary?: boolean; danger?: boolean }[] = [];
  if (r.status === "new") items.push({ key: "accept", label: "Accept", icon: <UserCheck size={14} />, primary: true, onClick: () => apply({ status: "accepted", owner_id: profile.id }, "Accepted — a room with the requester is open") });
  items.push({ key: "assign", label: r.owner_id ? "Reassign" : "Assign", icon: <UserPlus size={14} />, onClick: () => { setAssignee(r.owner_id || ""); setDialog("assign"); } });
  if (r.status === "accepted" || r.status === "waiting") items.push({ key: "start", label: "Start working", icon: <Play size={14} />, primary: r.status === "accepted", onClick: () => setStatus("working", "Marked as working", `${profile.full_name} started working on this request`) });
  if (r.status === "accepted" || r.status === "working") items.push({ key: "waiting", label: "Waiting on requester", icon: <Hourglass size={14} />, onClick: () => setStatus("waiting", "Waiting on the requester", `${profile.full_name} is waiting on the requester`) });
  if (r.status !== "new") items.push({ key: "complete", label: "Complete", icon: <CircleCheck size={14} />, primary: r.status === "working", onClick: () => setDialog("complete") });
  items.push({ key: "decline", label: "Decline", icon: <XCircle size={14} />, danger: true, onClick: () => setDialog("decline") });

  return (
    <>
      {compact ? (
        <Menu width={200} trigger={<button type="button" className="btn btn-ghost btn-xs btn-icon" aria-label="Actions"><MoreHorizontal size={15} /></button>}>
          {items.map((it) => (
            <MenuItem key={it.key} icon={it.icon} danger={it.danger} onClick={it.onClick}>{it.label}</MenuItem>
          ))}
        </Menu>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <Button key={it.key} size="sm" variant={it.primary ? "primary" : it.danger ? "ghost" : "secondary"} className={it.danger ? "text-danger" : undefined} loading={busy && it.primary} onClick={it.onClick}>
              {it.icon} {it.label}
            </Button>
          ))}
        </div>
      )}

      <Modal open={dialog === "assign"} onClose={() => setDialog(null)} title="Assign request" width={440}>
        <div className="space-y-3">
          <Field label="Owner" hint="They get a notification and join the request room.">
            <PersonPicker value={assignee} onChange={setAssignee} placeholder="Choose a person" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!assignee} onClick={() => apply({ owner_id: assignee, ...(r.status === "new" ? { status: "accepted" as HelpStatus } : {}) }, "Assigned")}><Check size={14} /> Assign</Button>
          </div>
        </div>
      </Modal>

      <Modal open={dialog === "complete"} onClose={() => setDialog(null)} title="Complete request" width={480}>
        <div className="space-y-3">
          <Field label="Completion note" hint="What was done, where to find it. The requester sees this.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Access granted to the Finance drive; link sent in the room." style={{ minHeight: 84 }} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="success" loading={busy} onClick={() => apply({ status: "completed", form_data: mergeForm(r.form_data, { _completion_note: note.trim() }) }, "Completed", `Completed by ${profile.full_name}${note.trim() ? `: ${note.trim()}` : ""}`)}><CircleCheck size={14} /> Mark completed</Button>
          </div>
        </div>
      </Modal>

      <Modal open={dialog === "decline"} onClose={() => setDialog(null)} title="Decline request" width={480}>
        <div className="space-y-3">
          <Field label="Reason" hint="Be specific — and if another department should handle it, say which.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. This is a Finance matter; please raise it with them." style={{ minHeight: 84 }} autoFocus required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="danger" loading={busy} disabled={!note.trim()} onClick={() => apply({ status: "declined", form_data: mergeForm(r.form_data, { _decline_reason: note.trim() }) }, "Declined", `Declined by ${profile.full_name}: ${note.trim()}`)}><XCircle size={14} /> Decline</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
