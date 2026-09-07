"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, MessageSquareWarning, UserRoundCog, Undo2 } from "lucide-react";
import { Button, Field, Modal, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { isAdminRole, type Approval, type ApprovalStatus } from "@/lib/utils";

type Mode = "approved" | "rejected" | "changes_requested" | "delegate" | "withdraw" | null;

const MODE_TITLE: Record<Exclude<Mode, null>, string> = {
  approved: "Approve request",
  rejected: "Reject request",
  changes_requested: "Request changes",
  delegate: "Delegate approval",
  withdraw: "Withdraw request",
};

/**
 * Inline decision controls for an approval. Shows approver actions (approve / reject /
 * request changes / delegate) to the approver (or admins) while pending, and a Withdraw
 * action to the requester while pending.
 */
export function ApprovalActions({ approval, size = "sm", onDone, className }: { approval: Approval; size?: "xs" | "sm" | "md"; onDone?: () => void; className?: string }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = React.useState<Mode>(null);
  const [note, setNote] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const pending = approval.status === "pending";
  const canDecide = pending && (approval.approver_id === profile.id || isAdminRole(profile.role));
  const canWithdraw = pending && approval.requested_by === profile.id && !canDecide;
  if (!canDecide && !canWithdraw) return null;

  const close = () => {
    setMode(null);
    setNote("");
    setTarget("");
  };

  async function run() {
    if (!mode) return;
    setLoading(true);
    const supabase = createClient();
    let error: { message: string } | null = null;
    if (mode === "delegate") {
      if (!target) {
        setLoading(false);
        return toast.push("Choose who should approve this", "danger");
      }
      ({ error } = await supabase.from("approvals").update({ approver_id: target, delegated_from: profile.id }).eq("id", approval.id));
    } else if (mode === "withdraw") {
      ({ error } = await supabase.from("approvals").update({ status: "rejected", decision_note: note.trim() ? `Withdrawn by requester — ${note.trim()}` : "Withdrawn by requester" }).eq("id", approval.id));
    } else {
      const status: ApprovalStatus = mode;
      ({ error } = await supabase.from("approvals").update({ status, decision_note: note.trim() || null }).eq("id", approval.id));
    }
    setLoading(false);
    if (error) return toast.push(error.message, "danger");
    toast.push(
      mode === "approved" ? "Approved" : mode === "rejected" ? "Rejected" : mode === "changes_requested" ? "Changes requested" : mode === "delegate" ? "Delegated" : "Request withdrawn",
      mode === "rejected" || mode === "withdraw" ? "info" : "success"
    );
    close();
    router.refresh();
    onDone?.();
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        {canDecide && (
          <>
            <Button size={size} variant="success" onClick={() => setMode("approved")}><Check size={14} /> Approve</Button>
            <Button size={size} variant="secondary" onClick={() => setMode("changes_requested")}><MessageSquareWarning size={14} /> Changes</Button>
            <Button size={size} variant="danger" onClick={() => setMode("rejected")}><X size={14} /> Reject</Button>
            <Button size={size} variant="ghost" onClick={() => setMode("delegate")}><UserRoundCog size={14} /> Delegate</Button>
          </>
        )}
        {canWithdraw && (
          <Button size={size} variant="ghost" onClick={() => setMode("withdraw")}><Undo2 size={14} /> Withdraw</Button>
        )}
      </div>

      <Modal
        open={mode !== null}
        onClose={close}
        title={mode ? MODE_TITLE[mode] : ""}
        width={480}
        footer={
          <>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button variant={mode === "rejected" || mode === "withdraw" ? "danger" : "primary"} loading={loading} onClick={run}>
              {mode === "approved" ? "Approve" : mode === "rejected" ? "Reject" : mode === "changes_requested" ? "Send back" : mode === "delegate" ? "Delegate" : "Withdraw"}
            </Button>
          </>
        }
      >
        <div className="text-sm mb-3">
          <span className="text-muted">Request:</span> <span className="font-medium">{approval.title}</span>
        </div>
        {mode === "delegate" ? (
          <Field label="Delegate to" hint="They will be notified and become the approver. Your name stays on the record as the delegator.">
            <PersonPicker value={target} onChange={setTarget} placeholder="Choose a person" allowEmpty />
          </Field>
        ) : (
          <Field label={mode === "approved" ? "Note (optional)" : mode === "withdraw" ? "Reason (optional)" : "Note for the requester"} hint={mode === "changes_requested" ? "Be specific about what needs to change." : undefined}>
            <Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "approved" ? "Looks good — go ahead." : mode === "rejected" ? "Why this is being declined…" : mode === "changes_requested" ? "What should be changed…" : "Why you are withdrawing…"} style={{ minHeight: 89 }} />
          </Field>
        )}
      </Modal>
    </div>
  );
}
