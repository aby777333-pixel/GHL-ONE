"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Beaker, ChevronRight, Lightbulb, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pill, Select, Tabs, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink, useSeen } from "@/components/providers/ActivityProvider";
import { ago, cn, fmtDate, isManagerPlus, type Tables } from "@/lib/utils";
import { useTouchModule } from "@/components/intel/lib";

export type ExperimentRow = Tables<"experiments"> & { idea: { id: string; title: string } | null };
type Status = "proposed" | "running" | "concluded" | "dropped";
const TONE: Record<string, string> = { proposed: "tone-info", running: "tone-warn", concluded: "tone-success", dropped: "tone-muted" };

/** Experiments: hypothesis → run → result. Optionally linked to an idea. */
export function Experiments({ rows, ideas }: { rows: ExperimentRow[]; ideas: { id: string; title: string }[] }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  useTouchModule("experiments");
  useSeen("nav:/experiments");
  const [tab, setTab] = React.useState<"active" | "done">("active");
  const [create, setCreate] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);
  const [result, setResult] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const list = rows.filter((r) => (tab === "active" ? r.status === "proposed" || r.status === "running" : r.status === "concluded" || r.status === "dropped"));

  async function setStatus(r: ExperimentRow, status: Status) {
    setBusy(r.id);
    const { error } = await createClient().from("experiments").update({ status, result: status === "concluded" || status === "dropped" ? result.trim() || r.result : r.result }).eq("id", r.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push(`Experiment ${status}`, status === "concluded" ? "success" : "info"); setResult(""); router.refresh();
  }
  const canEdit = (r: ExperimentRow) => r.owner_id === profile.id || r.created_by === profile.id || isManagerPlus(profile.role);

  return (
    <div className="page">
      <PageHeader eyebrow="Learning" title="Experiments" subtitle="Small bets with a hypothesis, an owner and an end date — so ideas get tested instead of debated." actions={<Button variant="primary" onClick={() => setCreate(true)}><Plus size={15} /> New experiment</Button>} />
      <Tabs tabs={[{ key: "active" as const, label: "Proposed & running", count: rows.filter((r) => r.status === "proposed" || r.status === "running").length }, { key: "done" as const, label: "Concluded", count: rows.filter((r) => r.status === "concluded" || r.status === "dropped").length || undefined }]} value={tab} onChange={setTab} className="mb-3" />
      {list.length === 0 ? <Card><EmptyState icon={<Beaker size={18} />} title={tab === "active" ? "No experiments running" : "Nothing concluded yet"} hint="Pick an idea from the Ideas board and give it two weeks." action={<Link href="/ideas" className="btn btn-secondary btn-sm"><Lightbulb size={14} /> Ideas board</Link>} /></Card> : (
        <Card className="divide-y">
          {list.map((r) => {
            const expanded = open === r.id;
            return (
              <div key={r.id} className="px-[var(--s4)] py-3">
                <button type="button" className="w-full text-left flex items-center gap-3" onClick={() => setOpen(expanded ? null : r.id)}>
                  <span className={cn("w-8 h-8 rounded-full inline-flex items-center justify-center shrink-0", TONE[r.status])}><Beaker size={14} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium">{r.title}</span><Pill tone={TONE[r.status]} className="capitalize">{r.status}</Pill>{r.owner_id && <><PersonChip id={r.owner_id} size={14} /><Blink zone={`user:${r.owner_id}`} /></>}</div>
                    <div className="text-[11px] text-muted mt-0.5">{r.starts_on ? `${fmtDate(r.starts_on)}${r.ends_on ? ` → ${fmtDate(r.ends_on)}` : ""}` : `created ${ago(r.created_at)}`}{r.idea && <> · from idea <Link href={`/ideas#${r.idea.id}`} className="hover:underline">{r.idea.title}</Link></>}</div>
                  </div>
                  <ChevronRight size={14} className={cn("text-muted transition-transform", expanded && "rotate-90")} />
                </button>
                {expanded && (
                  <div className="mt-3 pl-11 space-y-2 text-sm">
                    {r.hypothesis && <div><div className="eyebrow mb-0.5">Hypothesis</div><div className="whitespace-pre-wrap text-2">{r.hypothesis}</div></div>}
                    {r.result && <div><div className="eyebrow mb-0.5">Result</div><div className="whitespace-pre-wrap text-2">{r.result}</div></div>}
                    {canEdit(r) && (r.status === "proposed" || r.status === "running") && (
                      <div className="space-y-2 pt-1">
                        {r.status === "running" && <Textarea value={result} onChange={(e) => setResult(e.target.value)} placeholder="What did we learn? Numbers if you have them." style={{ minHeight: 56 }} />}
                        <div className="flex flex-wrap gap-1.5">
                          {r.status === "proposed" && <Button size="sm" variant="primary" loading={busy === r.id} onClick={() => setStatus(r, "running")}>Start</Button>}
                          {r.status === "running" && <Button size="sm" variant="success" loading={busy === r.id} onClick={() => setStatus(r, "concluded")}>Conclude</Button>}
                          <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => setStatus(r, "dropped")}>Drop</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
      <Modal open={create} onClose={() => setCreate(false)} title="New experiment" width={600}><ExperimentForm ideas={ideas} onDone={() => { setCreate(false); router.refresh(); }} onCancel={() => setCreate(false)} /></Modal>
    </div>
  );
}

function ExperimentForm({ ideas, onDone, onCancel }: { ideas: { id: string; title: string }[]; onDone: () => void; onCancel: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [hypothesis, setHypothesis] = React.useState("");
  const [owner, setOwner] = React.useState(profile.id);
  const [ideaId, setIdeaId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await createClient().from("experiments").insert({ org_id: profile.org_id!, title: title.trim(), hypothesis: hypothesis.trim() || null, owner_id: owner || null, idea_id: ideaId || null, starts_on: from || null, ends_on: to || null, created_by: profile.id });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Experiment proposed", "success"); onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Title"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Reply to WhatsApp leads within 5 minutes" required /></Field>
      <Field label="Hypothesis" hint="If we … then … because …"><Textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} style={{ minHeight: 72 }} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="Owner"><PersonPicker value={owner} onChange={setOwner} allowEmpty={false} /></Field>
        <Field label="From an idea"><Select value={ideaId} onChange={(e) => setIdeaId(e.target.value)}><option value="">—</option>{ideas.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</Select></Field>
        <Field label="Starts"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Ends"><Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Propose</Button></div>
    </form>
  );
}
