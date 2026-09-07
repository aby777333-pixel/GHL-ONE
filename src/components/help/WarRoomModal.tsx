"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Modal, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";

const SEVERITIES = [
  { key: "critical", label: "Critical", hint: "Business stopped; executives alerted", tone: "var(--danger)" },
  { key: "high", label: "High", hint: "Major impact, needs the room now", tone: "var(--orange)" },
  { key: "medium", label: "Medium", hint: "Contained but needs coordination", tone: "var(--warn)" },
] as const;

/**
 * Start a war room: emergency channel with the department's on-duty person, head and escalation chain,
 * a critical incident task, an incident record and alerts. Navigates into the room when created.
 */
export function WarRoomModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [title, setTitle] = React.useState("");
  const [severity, setSeverity] = React.useState<(typeof SEVERITIES)[number]["key"]>("high");
  const [dept, setDept] = React.useState(profile.department_id || "");
  const [summary, setSummary] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function start() {
    if (!title.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const { data: incidentId, error } = await supabase.rpc("start_war_room", { p_title: title.trim(), p_severity: severity, p_department: dept || undefined, p_summary: summary.trim() || undefined });
    if (error || !incidentId) { setBusy(false); toast.push(error?.message || "Could not start the war room", "danger"); return; }
    const { data: inc } = await supabase.from("incidents").select("channel_id").eq("id", incidentId).maybeSingle();
    setBusy(false);
    toast.push("War room open — the response team has been alerted", "success");
    setTitle(""); setSummary("");
    onClose();
    router.push(inc?.channel_id ? `/chat/${inc.channel_id}` : `/help/incidents/${incidentId}`);
  }

  return (
    <Modal open={open} onClose={onClose} title={<span className="inline-flex items-center gap-2"><Flame size={16} className="text-danger" /> Start a war room</span>} width={540}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} disabled={!title.trim()} onClick={start}><Flame size={15} /> Open the room</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-muted">Opens an emergency room with the department’s on-duty person, head and escalation chain, creates a critical incident task and records the incident. Critical severity also alerts executives.</p>
        <Field label="What is the incident?"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Website down for all clients" autoFocus /></Field>
        <div className="grid grid-cols-3 gap-2">
          {SEVERITIES.map((s) => (
            <button key={s.key} type="button" onClick={() => setSeverity(s.key)} className={cn("card p-2.5 text-left transition-colors", severity === s.key ? "ring-2" : "card-hover")} style={severity === s.key ? { ["--tw-ring-color" as string]: s.tone } : undefined}>
              <div className="text-sm font-medium inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: s.tone }} /> {s.label}</div>
              <div className="text-[11px] text-muted leading-tight mt-0.5">{s.hint}</div>
            </button>
          ))}
        </div>
        <Field label="Department" hint="Whose on-duty person and escalation chain to pull in."><DepartmentPicker value={dept} onChange={setDept} placeholder="No specific department" /></Field>
        <Field label="Summary"><Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Impact, what is known, what has been tried." /></Field>
      </div>
    </Modal>
  );
}
