"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Siren } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Modal, Textarea, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

const KINDS = [
  { key: "it", label: "IT", hint: "Systems down, account locked, device lost" },
  { key: "hr", label: "HR", hint: "Personal emergency, harassment, safety" },
  { key: "management", label: "Management", hint: "Client escalation, decision needed now" },
  { key: "security", label: "Security", hint: "Breach, phishing, physical security" },
  { key: "operations", label: "Operations", hint: "Site, logistics, vendor failure" },
] as const;
type Kind = (typeof KINDS)[number]["key"];

/**
 * Urgent assistance: a critical help request routed to the right department's on-duty person / head and their
 * escalation chain (management and security also alert executives). Navigates to the request when created.
 */
export function UrgentAssistanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = React.useState<Kind>("it");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function send() {
    if (!message.trim()) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("urgent_assistance", { p_kind: kind, p_message: message.trim() });
    setBusy(false);
    if (error || !data) { toast.push(error?.message || "Could not raise the request", "danger"); return; }
    toast.push("Help is on the way — the on-duty person has been alerted", "success");
    setMessage("");
    onClose();
    router.push(`/help/${data}`);
  }

  return (
    <Modal open={open} onClose={onClose} title={<span className="inline-flex items-center gap-2 text-danger"><Siren size={16} /> Urgent assistance</span>} width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} disabled={!message.trim()} onClick={send}><Siren size={15} /> Alert now</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-muted">Creates a critical request and pings the on-duty person, the department head and their escalation chain immediately — even during quiet hours. Use it when waiting is not an option.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)} className={cn("card p-2.5 text-left transition-colors", kind === k.key ? "ring-2 ring-[var(--danger)]" : "card-hover")}>
              <div className="text-sm font-medium">{k.label}</div>
              <div className="text-[11px] text-muted leading-tight mt-0.5">{k.hint}</div>
            </button>
          ))}
        </div>
        <Field label="What is happening?"><Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Where you are, what is wrong, what you need. Short is fine." autoFocus /></Field>
        {(kind === "management" || kind === "security") && <p className="text-[11px] text-warn">Executives are alerted for management and security emergencies.</p>}
      </div>
    </Modal>
  );
}
