"use client";

import * as React from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";

type Existing = { id: string; status: string; created_at: string; decision_note: string | null };

/** Request that a governed screen be enabled for me. Creates an `access_requests` row (resource_type 'screen'); routing/approval is handled in the database. */
export function ScreenAccessRequest({ screenKey, label, path }: { screenKey: string; label: string; path: string }) {
  const { profile } = useSession();
  const toast = useToast();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [existing, setExisting] = React.useState<Existing | null | undefined>(undefined);
  const resourceLabel = `Screen: ${label}`;

  React.useEffect(() => {
    let alive = true;
    createClient()
      .from("access_requests")
      .select("id,status,created_at,decision_note")
      .eq("requester_id", profile.id)
      .eq("resource_type", "screen")
      .eq("resource_label", resourceLabel)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (alive) setExisting((data as Existing | null) ?? null); });
    return () => { alive = false; };
  }, [profile.id, resourceLabel]);

  async function send() {
    if (reason.trim().length < 10) { toast.push("Say in a sentence why you need it (10+ characters).", "danger"); return; }
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("access_requests")
      .insert({ org_id: profile.org_id, requester_id: profile.id, resource_type: "screen", resource_id: null, resource_label: resourceLabel, level: "view", reason: reason.trim(), duration: "permanent" } as never)
      .select("id,status,created_at,decision_note")
      .single();
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setExisting(data as Existing);
    void supabase.rpc("log_access_event", { p_kind: "denied", p_type: "screen", p_id: null, p_path: path, p_details: { screen: screenKey, requested: true } } as never);
    toast.push("Request sent. You will be notified when it is decided.", "success");
  }

  if (existing === undefined) return null;
  if (existing && existing.status === "pending") {
    return (
      <div className="card tone-info p-[var(--s3)] text-sm flex items-center gap-2">
        <CheckCircle2 size={16} /> Your request for <strong>{label}</strong> is waiting for a decision.
      </div>
    );
  }
  return (
    <div className="space-y-[var(--s3)]">
      {existing?.status === "rejected" && existing.decision_note ? (
        <div className="text-xs text-muted">Last time this was declined: “{existing.decision_note}”. You can ask again with more context.</div>
      ) : null}
      <Field label="Why do you need this screen?">
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I cover the Support inbox on Saturdays and need Workforce Live to see who is on shift." />
      </Field>
      <Button onClick={send} disabled={busy}><KeyRound size={14} /> Request access</Button>
    </div>
  );
}
