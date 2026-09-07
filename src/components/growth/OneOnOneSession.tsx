"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, CheckCircle2, SkipForward, Repeat, Video, ListPlus, Sparkles, Target, Lock, Trash2, Save, ExternalLink, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Modal, Pill, Progress, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { cn, fmtDate, fmtTime, relDate, STATUS_LABEL as TASK_STATUS_LABEL, STATUS_TONE as TASK_STATUS_TONE, type TaskStatus } from "@/lib/utils";
import { goalProgress, type Goal, type GoalTaskLink } from "@/components/goals/lib";
import { loadGoals } from "@/components/goals/GoalMini";
import { RECURRENCE_DAYS, RECURRENCE_LABEL, addDays, asActions, asAgenda, isoDaysAgo, type ActionItem, type AgendaItem, type OneOnOneRow } from "./lib";

type TaskLite = { id: string; title: string; status: TaskStatus; due_date: string | null; completed_at: string | null; waiting_on: string; project: { name: string } | null };
type Prep = { goals: Goal[]; links: GoalTaskLink[]; done: TaskLite[]; blockers: TaskLite[]; previous: (ActionItem & { from: string })[] };

export function OneOnOneSession({ session, history, onClose, onUpdated, onScheduled }: { session: OneOnOneRow; history: OneOnOneRow[]; onClose: () => void; onUpdated: (row: OneOnOneRow) => void; onScheduled?: (row: OneOnOneRow) => void }) {
  const { profile, people } = useSession();
  const router = useRouter();
  const toast = useToast();
  const iAmManager = session.manager_id === profile.id;
  const other = iAmManager ? session.employee_id : session.manager_id;
  const employee = people.find((p) => p.id === session.employee_id);
  const [agenda, setAgenda] = React.useState<AgendaItem[]>(() => asAgenda(session.agenda));
  const [actions, setActions] = React.useState<ActionItem[]>(() => asActions(session.action_items));
  const [notes, setNotes] = React.useState(session.notes || "");
  const [notesDirty, setNotesDirty] = React.useState(false);
  const [newAgenda, setNewAgenda] = React.useState("");
  const [newAction, setNewAction] = React.useState("");
  const [newActionOwner, setNewActionOwner] = React.useState(session.employee_id);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [prep, setPrep] = React.useState<Prep | null>(null);
  const [showPrep, setShowPrep] = React.useState(iAmManager);
  const [now] = React.useState(() => Date.now());

  // "Prepare me" — built from data the viewer can already see. No AI.
  React.useEffect(() => {
    if (!showPrep) return;
    let alive = true;
    (async () => {
      const supabase = createClient();
      const [{ goals, links }, { data: done }, { data: blockers }] = await Promise.all([
        loadGoals([session.employee_id]),
        supabase.from("tasks").select("id,title,status,due_date,completed_at,waiting_on,project:projects!tasks_project_id_fkey(name)").eq("assignee_id", session.employee_id).eq("status", "done").gte("completed_at", isoDaysAgo(30)).order("completed_at", { ascending: false }).limit(12),
        supabase.from("tasks").select("id,title,status,due_date,completed_at,waiting_on,project:projects!tasks_project_id_fkey(name)").eq("assignee_id", session.employee_id).in("status", ["blocked", "waiting"]).order("due_date", { ascending: true, nullsFirst: false }).limit(10),
      ]);
      const previous = history
        .filter((h) => h.scheduled_at < session.scheduled_at)
        .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))
        .flatMap((h) => asActions(h.action_items).filter((a) => !a.done).map((a) => ({ ...a, from: h.scheduled_at })))
        .slice(0, 8);
      if (alive) setPrep({ goals, links, done: (done || []) as unknown as TaskLite[], blockers: (blockers || []) as unknown as TaskLite[], previous });
    })();
    return () => { alive = false; };
  }, [showPrep, session.employee_id, session.scheduled_at, history]);

  async function persist(patch: Partial<OneOnOneRow>, label?: string) {
    setBusy(label || "save");
    const { data, error } = await createClient().from("one_on_ones").update(patch).eq("id", session.id).select("*").single();
    setBusy(null);
    if (error || !data) { toast.push(error?.message || "Could not save", "danger"); return null; }
    onUpdated(data);
    return data;
  }

  async function saveAgenda(next: AgendaItem[]) {
    setAgenda(next);
    await persist({ agenda: next as unknown as OneOnOneRow["agenda"] }, "agenda");
  }
  async function saveActions(next: ActionItem[]) {
    setActions(next);
    await persist({ action_items: next as unknown as OneOnOneRow["action_items"] }, "actions");
  }
  async function addAgenda(e: React.FormEvent) {
    e.preventDefault();
    const t = newAgenda.trim();
    if (!t) return;
    setNewAgenda("");
    await saveAgenda([...agenda, { text: t, by: profile.id, done: false }]);
  }
  async function addAction(e: React.FormEvent) {
    e.preventDefault();
    const t = newAction.trim();
    if (!t) return;
    setNewAction("");
    await saveActions([...actions, { text: t, owner_id: newActionOwner || null, done: false }]);
  }
  async function saveNotes() {
    const r = await persist({ notes: notes.trim() || null }, "notes");
    if (r) { setNotesDirty(false); toast.push("Notes saved — visible to both of you.", "success"); }
  }
  async function createTask(i: number) {
    const a = actions[i];
    setBusy(`task-${i}`);
    const { data, error } = await createClient().from("tasks").insert({ org_id: profile.org_id!, title: a.text, description: `From the 1-on-1 on ${fmtDate(session.scheduled_at)} between ${people.find((p) => p.id === session.manager_id)?.full_name || "manager"} and ${employee?.full_name || "report"}.`, assignee_id: a.owner_id || session.employee_id, owner_id: profile.id, created_by: profile.id, delegated_by: a.owner_id && a.owner_id !== profile.id ? profile.id : null, status: "todo", priority: "normal", department_id: profile.department_id, tags: ["1-on-1"] }).select("id").single();
    if (error || !data) { setBusy(null); toast.push(error?.message || "Could not create task", "danger"); return; }
    await saveActions(actions.map((x, j) => (j === i ? { ...x, task_id: data.id } : x)));
    toast.push("Task created", "success");
  }
  async function setStatus(status: "done" | "skipped" | "scheduled") {
    const r = await persist({ status }, "status");
    if (!r) return;
    if (status === "done" && session.recurrence && RECURRENCE_DAYS[session.recurrence] && !history.some((h) => h.status === "scheduled" && h.scheduled_at > session.scheduled_at)) {
      const nextAt = addDays(session.scheduled_at, RECURRENCE_DAYS[session.recurrence]);
      const carry = actions.filter((a) => !a.done);
      const { data: next, error } = await createClient().from("one_on_ones").insert({ org_id: session.org_id, manager_id: session.manager_id, employee_id: session.employee_id, scheduled_at: nextAt, recurrence: session.recurrence, agenda: carry.length ? (carry.map((a) => ({ text: `Follow up: ${a.text}`, by: profile.id, done: false })) as unknown as OneOnOneRow["agenda"]) : [] }).select("*").single();
      if (!error && next) { onScheduled?.(next); toast.push(`Done. Next one scheduled for ${relDate(nextAt)} ${fmtTime(nextAt)}.`, "success"); }
      else toast.push("Marked done.", "success");
    } else toast.push(status === "done" ? "Marked done." : status === "skipped" ? "Marked skipped." : "Re-opened.", status === "skipped" ? "info" : "success");
    router.refresh();
  }
  async function remove() {
    if (!window.confirm("Delete this 1-on-1? Agenda, notes and actions will be lost.")) return;
    setBusy("delete");
    const { error } = await createClient().from("one_on_ones").delete().eq("id", session.id);
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Deleted", "info");
    onClose();
    router.refresh();
  }

  const isPast = new Date(session.scheduled_at).getTime() < now;
  const agendaDone = agenda.filter((a) => a.done).length;

  return (
    <Modal open onClose={onClose} width={720} side title={
      <span className="inline-flex items-center gap-2 min-w-0">
        <PersonChip id={other} size={22} className="text-sm font-medium" />
        <span className="text-xs text-muted font-normal num">{relDate(session.scheduled_at)} · {fmtTime(session.scheduled_at)}</span>
      </span>
    } footer={
      <>
        <Button variant="ghost" size="sm" className="mr-auto text-danger" onClick={remove} loading={busy === "delete"}><Trash2 size={13} /> Delete</Button>
        {session.status === "scheduled" ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => setStatus("skipped")} loading={busy === "status"}><SkipForward size={13} /> Skipped</Button>
            <Button variant="success" size="sm" onClick={() => setStatus("done")} loading={busy === "status"}><CheckCircle2 size={13} /> Mark done</Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setStatus("scheduled")} loading={busy === "status"}><RotateCcw size={13} /> Re-open</Button>
        )}
      </>
    }>
      <div className="space-y-[var(--s4)]">
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          {session.status === "done" ? <Pill tone="tone-success"><CheckCircle2 size={10} /> Done</Pill> : session.status === "skipped" ? <Pill tone="tone-muted"><SkipForward size={10} /> Skipped</Pill> : <Pill tone={isPast ? "tone-warn" : "tone-info"}>{isPast ? "Waiting to be marked" : "Scheduled"}</Pill>}
          {session.recurrence && <Pill tone="tone-neutral"><Repeat size={10} /> {RECURRENCE_LABEL[session.recurrence]}</Pill>}
          {session.meeting_id && <Link href={`/meetings/${session.meeting_id}`} className="pill tone-neutral hover:bg-[var(--line)]"><Video size={10} /> Meeting <ExternalLink size={9} /></Link>}
          <span className="text-muted inline-flex items-center gap-1 ml-auto"><Lock size={11} /> Private to {iAmManager ? employee?.full_name.split(" ")[0] || "your report" : "your manager"}, you and HR</span>
        </div>

        {/* Prepare me */}
        <section className="card overflow-hidden">
          <button onClick={() => setShowPrep((s) => !s)} className="w-full flex items-center gap-2 px-[var(--s3)] py-2.5 text-left">
            <span className="w-7 h-7 rounded-[8px] tone-violet inline-flex items-center justify-center"><Sparkles size={14} /></span>
            <span className="text-sm font-medium flex-1">Prepare me</span>
            <span className="text-[11px] text-muted">{showPrep ? "Hide" : `Goals, wins, blockers and open actions for ${employee?.full_name.split(" ")[0] || "the report"}`}</span>
          </button>
          {showPrep && (
            <div className="border-t px-[var(--s3)] py-[var(--s3)] sunken">
              {!prep ? (
                <div className="space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4" /><Skeleton className="h-4 w-3/4" /></div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-[var(--s3)] text-sm">
                  <PrepBlock title="Goals" icon={<Target size={12} />} empty="No active goals — a good thing to set together.">
                    {prep.goals.map((g) => {
                      const pct = goalProgress(g, prep.links.filter((l) => l.goal_id === g.id));
                      return <li key={g.id} className="min-w-0"><Link href={`/goals?goal=${g.id}`} className="hover:underline block truncate text-xs">{g.title}</Link><div className="flex items-center gap-2 mt-0.5"><Progress value={pct} height={3} /><span className="text-[10px] num text-muted w-7 text-right">{pct}%</span></div></li>;
                    })}
                  </PrepBlock>
                  <PrepBlock title="Completed in the last 30 days" icon={<CheckCircle2 size={12} />} empty="Nothing marked done in the last 30 days.">
                    {prep.done.map((t) => <li key={t.id} className="text-xs min-w-0 flex items-center gap-1.5"><Link href={`/tasks/${t.id}`} className="truncate hover:underline">{t.title}</Link>{t.project && <span className="text-muted truncate">· {t.project.name}</span>}</li>)}
                  </PrepBlock>
                  <PrepBlock title="Blocked or waiting" icon={<Lock size={12} />} empty="No blockers right now." tone="danger">
                    {prep.blockers.map((t) => <li key={t.id} className="text-xs min-w-0 flex items-center gap-1.5"><Pill tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Pill><Link href={`/tasks/${t.id}`} className="truncate hover:underline">{t.title}</Link></li>)}
                  </PrepBlock>
                  <PrepBlock title="Open actions from earlier 1-on-1s" icon={<ListPlus size={12} />} empty="No open actions carried over.">
                    {prep.previous.map((a, i) => (
                      <li key={i} className="text-xs min-w-0 flex items-center gap-1.5">
                        <span className="truncate flex-1">{a.text}</span>
                        <span className="text-muted num shrink-0">{fmtDate(a.from)}</span>
                        <button className="link shrink-0" onClick={() => saveAgenda([...agenda, { text: `Follow up: ${a.text}`, by: profile.id, done: false }])}>+ agenda</button>
                      </li>
                    ))}
                  </PrepBlock>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Agenda */}
        <section>
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="h3">Agenda</div>
            <span className="text-[11px] text-muted num">{agendaDone}/{agenda.length} covered · either of you can add</span>
          </div>
          <ul className="space-y-1">
            {agenda.map((a, i) => (
              <li key={i} className="flex items-start gap-2.5 px-2.5 py-2 rounded-[var(--radius-sm)] border">
                <input type="checkbox" checked={a.done} onChange={() => saveAgenda(agenda.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} className="mt-0.5 accent-[var(--brand)]" />
                <span className={cn("text-sm flex-1 min-w-0", a.done && "line-through text-muted")}>{a.text}</span>
                <PersonChip id={a.by} size={16} showName={false} className="shrink-0" />
                <button className="text-muted hover:text-danger shrink-0" onClick={() => saveAgenda(agenda.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={12} /></button>
              </li>
            ))}
          </ul>
          <form onSubmit={addAgenda} className="flex items-center gap-2 mt-2">
            <Input value={newAgenda} onChange={(e) => setNewAgenda(e.target.value)} placeholder="Add something to talk about…" className="flex-1" style={{ height: 34 }} />
            <Button type="submit" size="sm" variant="secondary" disabled={!newAgenda.trim()} loading={busy === "agenda"}><Plus size={13} /> Add</Button>
          </form>
        </section>

        {/* Notes */}
        <section>
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="h3">Notes</div>
            <span className="text-[11px] text-muted">Shared between the two of you</span>
          </div>
          <Textarea value={notes} onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }} placeholder="What was discussed, decisions, how things are going…" style={{ minHeight: 120 }} />
          <div className="flex justify-end mt-2">
            <Button size="sm" variant={notesDirty ? "primary" : "ghost"} disabled={!notesDirty} loading={busy === "notes"} onClick={saveNotes}><Save size={13} /> {notesDirty ? "Save notes" : "Saved"}</Button>
          </div>
        </section>

        {/* Actions */}
        <section>
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="h3">Action items</div>
            <span className="text-[11px] text-muted">Turn any of them into a real task</span>
          </div>
          <ul className="space-y-1">
            {actions.map((a, i) => (
              <li key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-sm)] border min-w-0">
                <input type="checkbox" checked={a.done} onChange={() => saveActions(actions.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} className="accent-[var(--success)]" />
                <span className={cn("text-sm flex-1 min-w-0 truncate", a.done && "line-through text-muted")}>{a.text}</span>
                <PersonChip id={a.owner_id} size={16} showName={false} className="shrink-0" />
                {a.task_id ? (
                  <Link href={`/tasks/${a.task_id}`} className="pill tone-info hover:underline shrink-0">task <ExternalLink size={9} /></Link>
                ) : !a.done ? (
                  <Button size="xs" variant="ghost" onClick={() => createTask(i)} loading={busy === `task-${i}`}><ListPlus size={12} /> <span className="hidden sm:inline">Create task</span></Button>
                ) : null}
                <button className="text-muted hover:text-danger shrink-0" onClick={() => saveActions(actions.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={12} /></button>
              </li>
            ))}
          </ul>
          <form onSubmit={addAction} className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
            <Input value={newAction} onChange={(e) => setNewAction(e.target.value)} placeholder="Who will do what by when…" className="flex-1" style={{ height: 34 }} />
            <Select value={newActionOwner} onChange={(e) => setNewActionOwner(e.target.value)} className="sm:w-[170px]" style={{ height: 34 }}>
              <option value={session.employee_id}>{people.find((p) => p.id === session.employee_id)?.full_name.split(" ")[0] || "Report"}</option>
              <option value={session.manager_id}>{people.find((p) => p.id === session.manager_id)?.full_name.split(" ")[0] || "Manager"}</option>
            </Select>
            <Button type="submit" size="sm" variant="secondary" disabled={!newAction.trim()} loading={busy === "actions"}><Plus size={13} /> Add</Button>
          </form>
        </section>
      </div>
    </Modal>
  );
}

function PrepBlock({ title, icon, empty, tone, children }: { title: string; icon: React.ReactNode; empty: string; tone?: "danger"; children: React.ReactNode[] }) {
  const list = React.Children.toArray(children);
  return (
    <div className="card p-3 min-w-0">
      <div className={cn("eyebrow inline-flex items-center gap-1.5 mb-1.5", tone === "danger" && list.length > 0 && "text-danger")}>{icon} {title}{list.length > 0 && <span className="num">· {list.length}</span>}</div>
      {list.length === 0 ? <div className="text-xs text-muted">{empty}</div> : <ul className="space-y-1.5">{list}</ul>}
    </div>
  );
}
