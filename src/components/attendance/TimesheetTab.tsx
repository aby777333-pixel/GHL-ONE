"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Lightbulb, Play, Plus, Square, Trash2, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Skeleton, Stat, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";
import { addDays, dayLabel, fmtHours, fmtMinutes, istDay, istDayRange, istTime, type TimeEntry } from "./attendanceUtils";

type TaskLite = { id: string; title: string; project?: { name: string } | null };
type Suggestions = {
  meetings: { meeting_id: string; title: string; started_at: string; minutes: number }[];
  tasks: { task_id: string; title: string; estimated_hours: number | null }[];
  logged: number;
};

export function TimesheetTab({ tasks }: { tasks: TaskLite[] }) {
  const { profile } = useSession();
  const toast = useToast();
  const today = istDay();
  const [day, setDay] = React.useState(today);
  const [entries, setEntries] = React.useState<TimeEntry[] | null>(null);
  const [sugg, setSugg] = React.useState<Suggestions | null>(null);
  const [running, setRunning] = React.useState<TimeEntry | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [busy, setBusy] = React.useState<string | null>(null);
  const [manualOpen, setManualOpen] = React.useState(false);
  const [focusTask, setFocusTask] = React.useState("");
  const [focusNote, setFocusNote] = React.useState("");
  const [version, setVersion] = React.useState(0);

  const taskTitle = React.useCallback((id: string | null) => tasks.find((t) => t.id === id)?.title, [tasks]);

  React.useEffect(() => {
    let alive = true;
    const t = setTimeout(() => { setEntries(null); setSugg(null); }, 0);
    const { from, to } = istDayRange(day);
    const supabase = createClient();
    Promise.all([
      supabase.from("time_entries").select("*").eq("user_id", profile.id).gte("started_at", from).lte("started_at", to).order("started_at"),
      supabase.rpc("timesheet_suggestions", { p_day: day }),
      supabase.from("time_entries").select("*").eq("user_id", profile.id).is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]).then(([e, s, r]) => {
      if (!alive) return;
      if (e.error) toast.push(e.error.message, "danger");
      setEntries((e.data || []) as TimeEntry[]);
      setSugg((s.data as Suggestions | null) || { meetings: [], tasks: [], logged: 0 });
      setRunning((r.data as TimeEntry | null) || null);
    });
    return () => { alive = false; clearTimeout(t); };
  }, [day, profile.id, version, toast]);

  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [running]);

  async function startFocus() {
    setBusy("focus");
    const { error } = await createClient().rpc("start_focus", { p_task: (focusTask || null) as unknown as string, p_note: focusNote.trim() || undefined });
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push("Focus session started — your presence shows Focus time", "success");
    setFocusNote("");
    setNow(Date.now());
    setVersion((v) => v + 1);
  }
  async function stopFocus() {
    setBusy("stop");
    const { data, error } = await createClient().rpc("stop_focus");
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    const d = data as { stopped: boolean; minutes?: number } | null;
    toast.push(d?.stopped ? `Logged ${fmtMinutes(d.minutes)}` : "No session was running", d?.stopped ? "success" : "info");
    setVersion((v) => v + 1);
  }
  async function addSuggestion(kind: "meeting" | "task", s: Suggestions["meetings"][number] | Suggestions["tasks"][number]) {
    const key = kind === "meeting" ? (s as Suggestions["meetings"][number]).meeting_id : (s as Suggestions["tasks"][number]).task_id;
    setBusy(key);
    const minutes = kind === "meeting" ? Math.round((s as Suggestions["meetings"][number]).minutes) : Math.max(15, Math.round(((s as Suggestions["tasks"][number]).estimated_hours || 0.5) * 60));
    const started = kind === "meeting" ? (s as Suggestions["meetings"][number]).started_at : `${day}T09:30:00+05:30`;
    const { error } = await createClient().from("time_entries").insert({
      org_id: profile.org_id!, user_id: profile.id,
      meeting_id: kind === "meeting" ? key : null, task_id: kind === "task" ? key : null,
      source: "suggested", started_at: started, ended_at: new Date(new Date(started).getTime() + minutes * 60000).toISOString(), minutes, confirmed: true,
    });
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push("Added to your timesheet", "success");
    setVersion((v) => v + 1);
  }
  async function remove(e: TimeEntry) {
    if (!window.confirm("Remove this entry?")) return;
    setBusy(e.id);
    const { error } = await createClient().from("time_entries").delete().eq("id", e.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    setVersion((v) => v + 1);
  }

  const total = (entries || []).reduce((a, e) => a + (e.minutes || 0), 0);
  const runningMin = running ? Math.max(0, (now - new Date(running.started_at).getTime()) / 60000) : 0;
  const sourceTone: Record<string, string> = { focus: "tone-violet", manual: "tone-neutral", meeting: "tone-info", suggested: "tone-success" };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-[var(--s3)] items-start">
      <div className="space-y-[var(--s3)] min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 card p-0.5">
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day"><ChevronLeft size={15} /></button>
            <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="input h-8 text-sm w-[150px] border-0 bg-transparent" aria-label="Day" />
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDay(addDays(day, 1))} disabled={day >= today} aria-label="Next day"><ChevronRight size={15} /></button>
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setDay(today)} disabled={day === today}>Today</button>
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setManualOpen(true)}><Plus size={14} /> Add entry</Button>
        </div>

        <div className="grid grid-cols-3 gap-[var(--s2)]">
          <Stat label="Logged" value={entries ? fmtHours(total) : "…"} sub={`hours · ${dayLabel(day)}`} />
          <Stat label="Entries" value={entries ? entries.length : "…"} sub="on this day" />
          <Stat label="Focus" value={entries ? fmtHours(entries.filter((e) => e.source === "focus").reduce((a, e) => a + (e.minutes || 0), 0)) : "…"} sub="hours in sessions" tone="text-violet" />
        </div>

        <Card>
          <CardHeader title="Entries" subtitle="Focus sessions, meetings and manual time — yours to edit" />
          {!entries ? (
            <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8 w-2/3" /></div>
          ) : entries.length === 0 ? (
            <EmptyState title="No time logged" hint="Start a focus session or accept a suggestion on the right." className="py-[var(--s4)]" />
          ) : (
            <div className="divide-y border-t">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-[var(--s4)] py-2 row-hover">
                  <span className="text-xs num text-muted w-[92px] shrink-0">{istTime(e.started_at)} – {e.ended_at ? istTime(e.ended_at) : "…"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{e.task_id ? <Link href={`/tasks/${e.task_id}`} className="hover:underline">{taskTitle(e.task_id) || "Task"}</Link> : e.meeting_id ? <Link href={`/meetings/${e.meeting_id}`} className="hover:underline inline-flex items-center gap-1"><Video size={12} /> Meeting</Link> : e.note || "Untitled entry"}</div>
                    {e.note && e.task_id && <div className="text-[11px] text-muted truncate">{e.note}</div>}
                  </div>
                  <Pill tone={sourceTone[e.source] || "tone-neutral"} className="capitalize hidden sm:inline-flex">{e.source}</Pill>
                  <span className="text-sm num w-14 text-right">{e.ended_at ? fmtMinutes(e.minutes) : <span className="text-violet">live</span>}</span>
                  <button className="btn btn-ghost btn-xs btn-icon" onClick={() => remove(e)} disabled={busy === e.id || !e.ended_at} aria-label="Remove"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-[var(--s3)] min-w-0">
        <Card className={cn(running && "border-[var(--violet)]")}>
          <CardHeader title="Focus session" subtitle={running ? `Running · ${fmtMinutes(runningMin)}` : "Tell colleagues you are heads-down"} />
          <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2">
            {running ? (
              <>
                <div className="text-sm">{running.task_id ? <Link href={`/tasks/${running.task_id}`} className="font-medium hover:underline">{taskTitle(running.task_id) || "Task"}</Link> : <span className="font-medium">{running.note || "Focus"}</span>}<div className="text-[11px] text-muted num">since {istTime(running.started_at)}</div></div>
                <Button variant="primary" onClick={stopFocus} loading={busy === "stop"} className="w-full"><Square size={14} /> Stop & log {fmtMinutes(runningMin)}</Button>
              </>
            ) : (
              <>
                <Field label="Task">
                  <Select value={focusTask} onChange={(e) => setFocusTask(e.target.value)}>
                    <option value="">No specific task</option>
                    {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}{t.project?.name ? ` — ${t.project.name}` : ""}</option>)}
                  </Select>
                </Field>
                <Input value={focusNote} onChange={(e) => setFocusNote(e.target.value)} placeholder="What are you focusing on?" />
                <Button variant="primary" onClick={startFocus} loading={busy === "focus"} className="w-full"><Play size={14} /> Start focus</Button>
                <div className="text-[11px] text-muted">Voluntary. Time lands on the task&apos;s actual hours when you stop.</div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Lightbulb size={15} className="text-muted" /> Suggestions</span>} subtitle="Meetings attended and tasks completed without logged time" />
          <div className="px-[var(--s3)] pb-[var(--s3)]">
            {!sugg ? (
              <div className="space-y-2"><Skeleton className="h-7" /><Skeleton className="h-7 w-3/4" /></div>
            ) : sugg.meetings.length + sugg.tasks.length === 0 ? (
              <div className="text-sm text-muted px-1">Nothing to suggest for this day.</div>
            ) : (
              <div className="space-y-1">
                {sugg.meetings.map((m) => (
                  <div key={m.meeting_id} className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] row-hover text-sm">
                    <Video size={13} className="text-info shrink-0" />
                    <span className="truncate flex-1">{m.title}</span>
                    <span className="text-[11px] text-muted num">{fmtMinutes(m.minutes)}</span>
                    <Button size="xs" variant="secondary" loading={busy === m.meeting_id} onClick={() => addSuggestion("meeting", m)}><Plus size={11} /> Add</Button>
                  </div>
                ))}
                {sugg.tasks.map((t) => (
                  <div key={t.task_id} className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] row-hover text-sm">
                    <span className="w-2 h-2 rounded-full bg-[var(--success)] shrink-0" />
                    <span className="truncate flex-1">{t.title}</span>
                    <span className="text-[11px] text-muted num">{t.estimated_hours ? `${t.estimated_hours}h est.` : "—"}</span>
                    <Button size="xs" variant="secondary" loading={busy === t.task_id} onClick={() => addSuggestion("task", t)}><Plus size={11} /> Add</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <ManualEntryModal open={manualOpen} day={day} tasks={tasks} onClose={() => setManualOpen(false)} onDone={() => { setManualOpen(false); setVersion((v) => v + 1); }} />
    </div>
  );
}

function ManualEntryModal({ open, day, tasks, onClose, onDone }: { open: boolean; day: string; tasks: TaskLite[]; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Add a time entry" width={460}>
      {open && <ManualEntryForm day={day} tasks={tasks} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}
function ManualEntryForm({ day, tasks, onClose, onDone }: { day: string; tasks: TaskLite[]; onClose: () => void; onDone: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [task, setTask] = React.useState("");
  const [start, setStart] = React.useState("10:00");
  const [minutes, setMinutes] = React.useState("60");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const mins = Number(minutes);
    if (!mins || mins < 1) return toast.push("Enter the minutes spent", "danger");
    if (!task && !note.trim()) return toast.push("Pick a task or describe the work", "danger");
    setBusy(true);
    const started = `${day}T${start}:00+05:30`;
    const { error } = await createClient().from("time_entries").insert({ org_id: profile.org_id!, user_id: profile.id, task_id: task || null, source: "manual", started_at: started, ended_at: new Date(new Date(started).getTime() + mins * 60000).toISOString(), minutes: Math.round(mins), note: note.trim() || null, confirmed: true });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Entry added", "success");
    onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Task">
        <Select value={task} onChange={(e) => setTask(e.target.value)}>
          <option value="">No specific task</option>
          {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}{t.project?.name ? ` — ${t.project.name}` : ""}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start (IST)"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
        <Field label="Minutes"><Input type="number" min={1} max={960} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} required /></Field>
      </div>
      <Field label="What did you work on?"><Textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 56 }} /></Field>
      <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Add {fmtMinutes(Number(minutes) || 0)}</Button></div>
    </form>
  );
}
