"use client";

import * as React from "react";
import { AlertTriangle, CalendarDays, Check, Palmtree, Send, Users, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Modal, Pill, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { PriorityPill } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, fmtDate, fmtTime, relDate, type TaskPriority } from "@/lib/utils";
import { istDay } from "@/components/attendance/attendanceUtils";
import { fmtDays, kindForType, leaveDays, type Balance, type HandoverTask, type Impact, type LeaveType } from "./leaveUtils";

export function ApplyLeaveModal({ open, onClose, types, balances, tasks, onDone }: { open: boolean; onClose: () => void; types: LeaveType[]; balances: Balance[]; tasks: HandoverTask[]; onDone: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={<span className="inline-flex items-center gap-2"><Palmtree size={15} className="text-muted" /> Apply for leave</span>} width={760}>
      {open && <ApplyLeaveForm types={types} balances={balances} tasks={tasks} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function ApplyLeaveForm({ types, balances, tasks, onClose, onDone }: { types: LeaveType[]; balances: Balance[]; tasks: HandoverTask[]; onClose: () => void; onDone: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const today = istDay();
  const [typeId, setTypeId] = React.useState(types[0]?.id || "");
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(today);
  const [half, setHalf] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [backup, setBackup] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [impact, setImpact] = React.useState<Impact | null | "loading">(null);
  const [busy, setBusy] = React.useState(false);

  const type = types.find((t) => t.id === typeId);
  const bal = balances.find((b) => b.leave_type_id === typeId);
  const endDate = half ? from : to;
  const days = leaveDays(from, endDate, half);
  const over = bal && bal.remaining != null && days > Number(bal.remaining);
  const valid = !!from && !!endDate && endDate >= from;

  React.useEffect(() => {
    if (!valid) return;
    let alive = true;
    const t = setTimeout(() => {
      setImpact("loading");
      createClient().rpc("leave_impact", { p_user: profile.id, p_from: from, p_to: endDate }).then(({ data }) => alive && setImpact((data as Impact | null) || null));
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [from, endDate, valid, profile.id]);

  const dueInRange = React.useMemo(() => tasks.filter((t) => t.due_date && t.due_date.slice(0, 10) >= from && t.due_date.slice(0, 10) <= endDate), [tasks, from, endDate]);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!type) return toast.push("Choose a leave type", "danger");
    if (!valid) return toast.push("End date must be on or after the start", "danger");
    if (selected.size > 0 && !backup) return toast.push("Choose a backup person to hand tasks to", "danger");
    setBusy(true);
    const supabase = createClient();
    const { data: leave, error } = await supabase
      .from("leaves")
      .insert({ org_id: profile.org_id!, user_id: profile.id, starts_on: from, ends_on: endDate, kind: kindForType(type.code, half), leave_type_id: type.id, half_day: half, days, note: reason.trim() || null })
      .select("id")
      .single();
    if (error || !leave) { setBusy(false); return toast.push(error?.message || "Could not submit", "danger"); }
    if (backup) {
      const { error: e2 } = await supabase.rpc("prepare_handover", { p_leave: leave.id, p_backup: backup, p_notes: notes.trim() || undefined, p_task_ids: [...selected] });
      if (e2) toast.push(`Leave submitted, but the handover failed: ${e2.message}`, "danger");
    }
    setBusy(false);
    toast.push(type.requires_hr ? "Sent to your manager, then HR" : "Sent to your manager", "success");
    onDone();
  }

  const im = impact !== "loading" ? impact : null;

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px] gap-[var(--s4)]">
      <div className="space-y-3 min-w-0">
        <Field label="Leave type">
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => {
              const b = balances.find((x) => x.leave_type_id === t.id);
              return <option key={t.id} value={t.id}>{t.name}{b ? ` · ${b.remaining == null ? "no cap" : `${fmtDays(b.remaining)} left`}` : ""}{t.requires_hr ? " · needs HR" : ""}</option>;
            })}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} required /></Field>
          <Field label="To"><Input type="date" value={half ? from : to} min={from} disabled={half} onChange={(e) => setTo(e.target.value)} required /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} className="accent-[var(--brand)]" /> Half day</label>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <Pill tone="tone-neutral" size="lg"><CalendarDays size={11} /> {fmtDays(days)} working day{days === 1 ? "" : "s"}</Pill>
          {bal && bal.remaining != null && <Pill tone={over ? "tone-danger" : "tone-success"} size="lg">{fmtDays(bal.remaining)} of {fmtDays(bal.allocated)} left{Number(bal.pending) > 0 ? ` · ${fmtDays(bal.pending)} pending` : ""}</Pill>}
          {over && <span className="text-danger inline-flex items-center gap-1"><AlertTriangle size={12} /> Exceeds your balance — HR may convert the excess to unpaid leave.</span>}
        </div>
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 56 }} placeholder="A short reason helps your manager decide quickly" /></Field>

        <div className="rounded-[var(--radius-sm)] border p-3 space-y-3">
          <div className="text-sm font-medium inline-flex items-center gap-2"><Users size={14} className="text-muted" /> Handover</div>
          <Field label="Backup person" hint="They are notified and receive the tasks you pick below; tasks return to you when the leave ends."><PersonPicker value={backup} onChange={setBackup} placeholder="Nobody — I will manage" /></Field>
          <Field label="Handover notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 48 }} placeholder="Where things stand, who to call, what can wait" /></Field>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="label !mb-0">Tasks to hand over {selected.size ? <span className="pill tone-brand ml-1">{selected.size}</span> : null}</span>
              {dueInRange.length > 0 && <button type="button" className="text-xs link" onClick={() => setSelected(new Set(dueInRange.map((t) => t.id)))}>Select all due during leave ({dueInRange.length})</button>}
            </div>
            {tasks.length === 0 ? (
              <div className="text-xs text-muted">You have no open tasks.</div>
            ) : (
              <div className="max-h-44 overflow-y-auto rounded-[var(--radius-sm)] border divide-y">
                {[...dueInRange, ...tasks.filter((t) => !dueInRange.includes(t))].map((t) => (
                  <label key={t.id} className={cn("flex items-center gap-2 px-2 py-1.5 text-sm row-hover cursor-pointer", selected.has(t.id) && "bg-[var(--info-bg)]")}>
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="accent-[var(--brand)]" />
                    <span className="truncate flex-1">{t.title}</span>
                    <PriorityPill priority={t.priority as TaskPriority} iconOnly />
                    {t.due_date && <span className={cn("text-[11px] num", dueInRange.includes(t) ? "text-warn" : "text-muted")}>{relDate(t.due_date)}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!valid}><Send size={14} /> Submit request</Button>
        </div>
      </div>

      {/* Impact preview */}
      <aside className="min-w-0 md:border-l md:pl-[var(--s4)] space-y-3">
        <div className="eyebrow">While you are away</div>
        {!valid ? (
          <div className="text-xs text-muted">Pick your dates to preview the impact.</div>
        ) : impact === "loading" || !im ? (
          <div className="space-y-2"><Skeleton className="h-5" /><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-1/2" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Tasks due" value={im.tasks.length} warn={im.tasks.length > 0} />
              <Mini label="Critical" value={im.critical} danger={im.critical > 0} />
              <Mini label="Waiting on you" value={im.waiting_on_user} warn={im.waiting_on_user > 0} />
              <Mini label="Approvals" value={im.approvals} warn={im.approvals > 0} />
            </div>
            {im.tasks.length > 0 && (
              <div>
                <div className="text-[11px] text-muted mb-1">Deadlines in the period</div>
                <ul className="space-y-1">
                  {im.tasks.slice(0, 5).map((t) => <li key={t.id} className="text-xs flex items-center gap-1.5"><span className="truncate flex-1">{t.title}</span><span className="num text-muted shrink-0">{t.due_date ? fmtDate(t.due_date) : ""}</span></li>)}
                  {im.tasks.length > 5 && <li className="text-[11px] text-muted">+{im.tasks.length - 5} more</li>}
                </ul>
              </div>
            )}
            {im.meetings.length > 0 && (
              <div>
                <div className="text-[11px] text-muted mb-1 inline-flex items-center gap-1"><Video size={11} /> Meetings you will miss</div>
                <ul className="space-y-1">{im.meetings.slice(0, 4).map((m) => <li key={m.id} className="text-xs flex items-center gap-1.5"><span className="truncate flex-1">{m.title}</span><span className="num text-muted shrink-0">{relDate(m.starts_at)} {fmtTime(m.starts_at)}</span></li>)}</ul>
              </div>
            )}
            <div>
              <div className="text-[11px] text-muted mb-1">Team coverage</div>
              {im.team_on_leave.length === 0 ? (
                <div className="text-xs inline-flex items-center gap-1 text-success"><Check size={12} /> Nobody else in your department is off then.</div>
              ) : (
                <ul className="space-y-1">{im.team_on_leave.map((p, i) => <li key={i} className="text-xs flex items-center gap-1.5 text-warn"><AlertTriangle size={11} className="shrink-0" /><span className="truncate flex-1 text-[var(--fg)]">{p.name}</span><span className="num text-muted shrink-0">{fmtDate(p.from)}{p.to !== p.from ? ` – ${fmtDate(p.to)}` : ""}</span></li>)}</ul>
              )}
            </div>
            <div className="text-[11px] text-muted">Your manager sees this same preview before deciding.</div>
          </>
        )}
      </aside>
    </form>
  );
}

function Mini({ label, value, warn, danger }: { label: string; value: number; warn?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-[var(--radius-sm)] sunken px-2.5 py-2 min-w-0">
      <div className={cn("text-lg font-semibold num leading-tight", danger ? "text-danger" : warn ? "text-warn" : "")}>{value}</div>
      <div className="text-[11px] text-muted truncate">{label}</div>
    </div>
  );
}
