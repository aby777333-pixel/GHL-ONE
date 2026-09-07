"use client";

import * as React from "react";
import { AlertTriangle, Check, CheckCircle2, HelpCircle, ListChecks, Plus, RotateCcw, Target, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Modal, Pill, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { ago, cn, type Task } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { jsonObj, num, parseGates, str, type QualityGate } from "@/components/admin/people/lib";

const ACK_LABEL: Record<string, string> = { accepted: "Understood", clarify: "Needs clarification", conflict: "Deadline conflict" };
const ACK_TONE: Record<string, string> = { accepted: "tone-success", clarify: "tone-warn", conflict: "tone-danger" };

/** Delegation receipt: the assignee acknowledges (Understood / Need clarification / Deadline conflict); the delegator sees the status. */
export function AckBar({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const toast = useToast();
  const { profile } = useSession();
  const [mode, setMode] = React.useState<null | "clarify" | "conflict">(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const delegator = task.delegated_by || task.created_by;
  const isAssignee = task.assignee_id === profile.id;
  const done = task.status === "done" || task.status === "cancelled";
  if (!task.assignee_id || !delegator || delegator === task.assignee_id) return null;

  async function ack(status: "accepted" | "clarify" | "conflict") {
    setBusy(true);
    const { error } = await createClient().rpc("ack_task", { p_task: task.id, p_status: status, p_note: note.trim() || undefined });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(status === "accepted" ? "Acknowledged — the delegator is informed" : "Sent to the delegator", "success");
    setMode(null); setNote(""); onChanged();
  }

  if (task.ack_status) {
    return (
      <div className={cn("rounded-[var(--radius-sm)] border px-3 py-2 text-sm flex flex-wrap items-center gap-2", ACK_TONE[task.ack_status])}>
        <CheckCircle2 size={14} />
        <span><PersonChip id={task.assignee_id} size={16} showName={false} /> <b>{ACK_LABEL[task.ack_status] || task.ack_status}</b>{task.ack_at ? ` · ${ago(task.ack_at)}` : ""}</span>
        {task.ack_note && <span className="text-xs opacity-80 truncate">“{task.ack_note}”</span>}
        {isAssignee && !done && task.ack_status !== "accepted" && <Button size="xs" variant="ghost" className="ml-auto" loading={busy} onClick={() => ack("accepted")}><Check size={12} /> Now understood</Button>}
      </div>
    );
  }
  if (!isAssignee || done) {
    return <div className="rounded-[var(--radius-sm)] border px-3 py-2 text-xs text-muted flex items-center gap-2"><HelpCircle size={13} /> Waiting for <PersonChip id={task.assignee_id} size={14} /> to acknowledge this delegation.</div>;
  }
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--brand)] bg-[var(--brand-bg)]/30 px-3 py-2 space-y-2">
      <div className="text-sm flex flex-wrap items-center gap-2"><Target size={14} className="text-[var(--brand)]" /><span>Delegated to you by <PersonChip id={delegator} size={16} /> — do you have what you need?</span></div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="success" loading={busy && !mode} onClick={() => ack("accepted")}><Check size={13} /> Understood</Button>
        <Button size="sm" variant={mode === "clarify" ? "primary" : "secondary"} onClick={() => setMode(mode === "clarify" ? null : "clarify")}><HelpCircle size={13} /> Need clarification</Button>
        <Button size="sm" variant={mode === "conflict" ? "primary" : "secondary"} onClick={() => setMode(mode === "conflict" ? null : "conflict")}><AlertTriangle size={13} /> Deadline conflict</Button>
      </div>
      {mode && <div className="flex gap-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "clarify" ? "What is unclear?" : "Which deadline clashes, and what would work?"} autoFocus /><Button size="sm" variant="primary" loading={busy} disabled={!note.trim()} onClick={() => ack(mode)}>Send</Button></div>}
    </div>
  );
}

/** Definition of done (text) + quality gates (checklist that must be complete before Done). */
export function DefinitionOfDone({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const toast = useToast();
  const { profile } = useSession();
  const [dod, setDod] = React.useState(task.definition_of_done || "");
  const [synced, setSynced] = React.useState(task.definition_of_done || "");
  if (synced !== (task.definition_of_done || "")) { setSynced(task.definition_of_done || ""); if (dod === synced) setDod(task.definition_of_done || ""); }
  const gates = React.useMemo(() => parseGates(task.quality_gates), [task.quality_gates]);
  const [label, setLabel] = React.useState("");
  const done = gates.filter((g) => g.done).length;

  async function save(patch: { definition_of_done?: string | null; quality_gates?: Json | null }, msg?: string) {
    const { error } = await createClient().from("tasks").update(patch).eq("id", task.id);
    if (error) { toast.push(error.message, "danger"); return; }
    if (msg) toast.push(msg, "success");
    onChanged();
  }
  const write = (next: QualityGate[]) => save({ quality_gates: next.length ? (next as unknown as Json) : null });
  function addGate(e: React.FormEvent) { e.preventDefault(); const v = label.trim(); if (!v) return; setLabel(""); write([...gates, { label: v, done: false }]); }
  function toggle(i: number) { write(gates.map((g, j) => (j === i ? { ...g, done: !g.done, by: !g.done ? profile.id : null, at: !g.done ? new Date().toISOString() : null } : g))); }
  function remove(i: number) { write(gates.filter((_, j) => j !== i)); }

  return (
    <section className="card">
      <div className="flex items-center gap-2 px-[var(--s4)] pt-[var(--s3)] pb-[var(--s2)]"><span className="text-muted"><ListChecks size={15} /></span><span className="h3">Definition of done</span>{gates.length > 0 && <span className={cn("pill", done === gates.length ? "tone-success" : "tone-neutral")}>{done}/{gates.length} gates</span>}{task.revision_count > 0 && <Pill tone="tone-warn" className="ml-auto"><RotateCcw size={10} className="mr-1" />{task.revision_count} revision{task.revision_count === 1 ? "" : "s"}</Pill>}</div>
      <div className="px-[var(--s4)] pb-[var(--s3)] space-y-3">
        <Textarea value={dod} onChange={(e) => setDod(e.target.value)} onBlur={() => { if (dod !== (task.definition_of_done || "")) save({ definition_of_done: dod.trim() || null }, "Definition of done saved"); }} placeholder="What does finished look like? Deliverables, acceptance criteria, who signs off… (autosaves)" style={{ minHeight: 64 }} />
        <div>
          <div className="label">Quality gates <span className="text-muted font-normal">— every gate must be ticked before the task can be marked done</span></div>
          {gates.length > 0 && (
            <ul className="space-y-0.5 mb-2">
              {gates.map((g, i) => (
                <li key={i} className="flex items-center gap-2 group px-1 py-1 rounded-[var(--radius-sm)] row-hover">
                  <button type="button" onClick={() => toggle(i)} className={cn("w-4.5 h-4.5 rounded border flex items-center justify-center shrink-0 transition-colors", g.done ? "bg-[var(--success)] border-[var(--success)] text-white" : "border-[var(--line-strong)]")} aria-label="Toggle gate">{g.done && <Check size={12} />}</button>
                  <span className={cn("text-sm flex-1 min-w-0 truncate", g.done && "line-through text-muted")}>{g.label}</span>
                  {g.done && g.by && <span className="text-[11px] text-muted inline-flex items-center gap-1"><PersonChip id={g.by} size={12} showName={false} />{g.at ? ago(g.at) : ""}</span>}
                  <button type="button" onClick={() => remove(i)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-[var(--danger)]" aria-label="Remove"><X size={13} /></button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addGate} className="flex items-center gap-2"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Add a quality gate, e.g. Reviewed by design lead" className="h-9" /><Button type="submit" size="sm" variant="secondary" disabled={!label.trim()}><Plus size={14} /></Button></form>
        </div>
        {task.reopen_reason && <div className="text-xs text-muted flex items-start gap-1.5"><RotateCcw size={12} className="mt-0.5 shrink-0" /><span>Last reopened: “{task.reopen_reason}”</span></div>}
      </div>
    </section>
  );
}

/** Asks why a done task is reopened; writes `reopen_reason` with the status change. */
export function ReopenModal({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<void> | void }) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Reopen task" width={440} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={reason.trim().length < 3} onClick={async () => { setBusy(true); await onConfirm(reason.trim()); setBusy(false); setReason(""); }}><RotateCcw size={14} /> Reopen</Button></>}>
      <div className="space-y-2">
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What was missing or wrong? This is kept with the task and counts as a revision." autoFocus />
        <p className="text-[11px] text-muted">Revisions are counted so repeated rework becomes visible.</p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------- Assignment load */
export type LoadInfo = { workload: string; open: number; urgent: number; dueSameDay: number; allocation: number; canAssign: boolean; onLeave: boolean; others: string[]; wip: number | null };
const LOAD_TONE: Record<string, string> = { light: "tone-success", balanced: "tone-info", heavy: "tone-warn", critical: "tone-danger" };

/** Calls `assignment_warnings(assignee, due)` (not yet in the generated types — cast). */
export async function fetchLoad(assignee: string, due: string | null): Promise<LoadInfo | null> {
  const sb = createClient();
  const rpc = (sb.rpc as unknown as (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: Json | null; error: { message: string } | null }>).bind(sb);
  const { data, error } = await rpc("assignment_warnings", { p_assignee: assignee, p_due: due || undefined });
  if (error) return null;
  const o = jsonObj(data);
  return { workload: str(o.workload, "light"), open: num(o.open_tasks), urgent: num(o.urgent_open), dueSameDay: num(o.due_same_day), allocation: num(o.allocation_percent), canAssign: o.can_assign !== false, onLeave: Array.isArray(o.on_leave) && o.on_leave.length > 0, others: Array.isArray(o.other_managers_assigning) ? o.other_managers_assigning.map(String) : [], wip: typeof o.wip_limit === "number" ? o.wip_limit : null };
}

/** Small load pill shown next to the assignee picker before assigning. Reports `canAssign` to the parent. */
export function AssigneeLoadPill({ assignee, due, onLoad }: { assignee: string | null | undefined; due?: string | null; onLoad?: (info: LoadInfo | null) => void }) {
  const { profile } = useSession();
  const [state, setState] = React.useState<{ key: string; info: LoadInfo | null } | null>(null);
  const key = `${assignee || ""}:${due || ""}`;
  const onLoadRef = React.useRef(onLoad);
  React.useEffect(() => { onLoadRef.current = onLoad; });
  React.useEffect(() => {
    if (!assignee || assignee === profile.id) return;
    let alive = true;
    const t = setTimeout(() => { fetchLoad(assignee, due || null).then((info) => { if (!alive) return; setState({ key, info }); onLoadRef.current?.(info); }); }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [assignee, due, key, profile.id]);
  if (!assignee || assignee === profile.id) return null;
  const info = state && state.key === key ? state.info : null;
  if (!info) return <span className="pill tone-neutral text-[10px]">checking load…</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-[10px]">
      <Pill tone={LOAD_TONE[info.workload] || "tone-neutral"} className="capitalize">{info.workload} · {info.open} open</Pill>
      {info.urgent > 0 && <Pill tone="tone-orange">{info.urgent} urgent</Pill>}
      {info.dueSameDay > 0 && <Pill tone="tone-warn">{info.dueSameDay} due same day</Pill>}
      {info.allocation > 0 && <Pill tone={info.allocation >= 100 ? "tone-danger" : "tone-neutral"}>{info.allocation}% allocated</Pill>}
      {info.wip != null && info.open >= info.wip && <Pill tone="tone-danger">WIP limit {info.wip}</Pill>}
      {info.onLeave && <Pill tone="tone-warn">On leave soon</Pill>}
      {!info.canAssign && <Pill tone="tone-danger">Use Request Help</Pill>}
    </span>
  );
}
