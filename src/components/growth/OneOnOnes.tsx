"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Users, MessagesSquare, Clock, CheckCircle2, SkipForward, Repeat, Video, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Pill, Select, Tabs, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { cn, fmtDate, fmtTime, relDate, type Profile } from "@/lib/utils";
import { RECURRENCE_LABEL, asActions, asAgenda, fromLocalInput, toLocalInput, type OneOnOneRow } from "./lib";
import { OneOnOneSession } from "./OneOnOneSession";

type Report = Pick<Profile, "id" | "full_name" | "avatar_url" | "designation" | "presence" | "department_id">;
export type OneOnOnesData = { sessions: OneOnOneRow[]; reports: Report[]; openId: string; openNew: boolean; withId: string };

type TabKey = "upcoming" | "past" | "team";

export function OneOnOnes({ data }: { data: OneOnOnesData }) {
  const { profile } = useSession();
  const router = useRouter();
  useSeen("nav:/one-on-ones");
  const [sessions, setSessions] = React.useState<OneOnOneRow[]>(data.sessions);
  const [openId, setOpenId] = React.useState<string | null>(data.openId || null);
  const [schedule, setSchedule] = React.useState<{ employeeId: string } | null>(data.openNew ? { employeeId: data.withId } : null);
  const isManager = data.reports.length > 0;
  const [tab, setTab] = React.useState<TabKey>(isManager && !data.openId ? "team" : "upcoming");
  const [now] = React.useState(() => Date.now());

  const upcoming = sessions.filter((s) => s.status === "scheduled" && new Date(s.scheduled_at).getTime() >= now - 3 * 3600_000).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const past = sessions.filter((s) => !upcoming.includes(s)).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const open = openId ? sessions.find((s) => s.id === openId) || null : null;

  function select(id: string | null) {
    setOpenId(id);
    router.replace(id ? `/one-on-ones?id=${id}` : "/one-on-ones", { scroll: false });
  }
  function onUpdated(row: OneOnOneRow) {
    setSessions((s) => (s.some((x) => x.id === row.id) ? s.map((x) => (x.id === row.id ? row : x)) : [row, ...s]));
  }

  const tabs: { key: TabKey; label: React.ReactNode; count?: number }[] = [
    ...(isManager ? [{ key: "team" as const, label: "My team", count: data.reports.length }] : []),
    { key: "upcoming", label: "Upcoming", count: upcoming.length || undefined },
    { key: "past", label: "Past", count: past.length || undefined },
  ];

  return (
    <div className="page">
      <PageHeader eyebrow="Growth" title="1-on-1s" subtitle="A regular, private conversation between you and your manager. Shared agenda, notes both of you can see, actions that become tasks." actions={isManager ? <Button variant="primary" onClick={() => setSchedule({ employeeId: data.reports[0]?.id || "" })}><CalendarPlus size={15} /> Schedule</Button> : undefined} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-[var(--s3)]" />

      {tab === "team" && isManager && (
        <Card>
          <CardHeader title="Direct reports" subtitle="When you last met and what is next" action={<Users size={15} className="text-muted" />} />
          <div className="divide-y border-t">
            {data.reports.map((r) => {
              const theirs = sessions.filter((s) => s.employee_id === r.id && s.manager_id === profile.id);
              const next = theirs.filter((s) => s.status === "scheduled" && new Date(s.scheduled_at).getTime() >= now - 3 * 3600_000).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
              const last = theirs.filter((s) => s.status === "done").sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))[0];
              const stale = !next && (!last || now - new Date(last.scheduled_at).getTime() > 21 * 86400_000);
              return (
                <div key={r.id} className="flex items-center gap-3 px-[var(--s4)] py-3">
                  <Link href={`/people/${r.id}`}><Avatar name={r.full_name} src={r.avatar_url} size={36} presence={r.presence} /></Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/people/${r.id}`} className="text-sm font-medium truncate hover:underline block">{r.full_name}</Link>
                    <div className="text-[11px] text-muted truncate">{r.designation || "—"}</div>
                    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1 text-[11px]">
                      <span className={cn("inline-flex items-center gap-1 num", stale ? "text-warn" : "text-muted")}><Clock size={11} /> Last: {last ? fmtDate(last.scheduled_at) : "never"}</span>
                      {next ? (
                        <button onClick={() => select(next.id)} className="inline-flex items-center gap-1 num text-[var(--brand)] hover:underline"><CalendarPlus size={11} /> Next: {relDate(next.scheduled_at)} {fmtTime(next.scheduled_at)}{next.recurrence ? ` · ${RECURRENCE_LABEL[next.recurrence].toLowerCase()}` : ""}</button>
                      ) : (
                        <span className="text-muted">Nothing scheduled</span>
                      )}
                    </div>
                  </div>
                  {stale && <Pill tone="tone-warn" className="hidden sm:inline-flex">Overdue for a chat</Pill>}
                  <Button size="sm" variant={next ? "ghost" : "secondary"} onClick={() => setSchedule({ employeeId: r.id })}><CalendarPlus size={13} /> <span className="hidden sm:inline">Schedule</span></Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {tab === "upcoming" && (
        upcoming.length === 0 ? (
          <Card><EmptyState icon={<MessagesSquare size={18} />} title="No upcoming 1-on-1s" hint={isManager ? "Schedule one with a direct report." : "Your manager schedules these. You can add agenda items any time once one exists."} action={isManager ? <Button variant="primary" onClick={() => setSchedule({ employeeId: data.reports[0]?.id || "" })}><CalendarPlus size={14} /> Schedule</Button> : undefined} /></Card>
        ) : (
          <div className="space-y-2 stagger">{upcoming.map((s) => <SessionRow key={s.id} s={s} me={profile.id} onOpen={() => select(s.id)} />)}</div>
        )
      )}
      {tab === "past" && (
        past.length === 0 ? (
          <Card><EmptyState icon={<Clock size={18} />} title="No past 1-on-1s" /></Card>
        ) : (
          <div className="space-y-2 stagger">{past.map((s) => <SessionRow key={s.id} s={s} me={profile.id} onOpen={() => select(s.id)} />)}</div>
        )
      )}

      {open && <OneOnOneSession session={open} history={sessions.filter((s) => s.manager_id === open.manager_id && s.employee_id === open.employee_id && s.id !== open.id)} onClose={() => select(null)} onUpdated={onUpdated} onScheduled={(row) => { onUpdated(row); }} />}
      {schedule && <ScheduleModal reports={data.reports} initialEmployee={schedule.employeeId} onClose={() => { setSchedule(null); if (data.openNew) router.replace("/one-on-ones"); }} onCreated={(row) => { setSchedule(null); onUpdated(row); select(row.id); router.refresh(); }} />}
    </div>
  );
}

function SessionRow({ s, me, onOpen }: { s: OneOnOneRow; me: string; onOpen: () => void }) {
  const other = s.manager_id === me ? s.employee_id : s.manager_id;
  const agenda = asAgenda(s.agenda);
  const actions = asActions(s.action_items);
  const openActions = actions.filter((a) => !a.done).length;
  return (
    <button onClick={onOpen} className="card card-hover w-full text-left px-[var(--s3)] py-[var(--s3)] flex items-center gap-3">
      <div className="w-16 shrink-0">
        <div className="text-[11px] text-muted">{relDate(s.scheduled_at)}</div>
        <div className="text-sm num font-medium">{fmtTime(s.scheduled_at)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <PersonChip id={other} size={20} className="text-sm" />
          <span className="text-xs text-muted">{s.manager_id === me ? "your report" : "your manager"}</span>
        </div>
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-muted mt-1">
          {s.recurrence && <span className="inline-flex items-center gap-1"><Repeat size={11} /> {RECURRENCE_LABEL[s.recurrence]}</span>}
          <span className="num">{agenda.length} agenda item{agenda.length === 1 ? "" : "s"}</span>
          {openActions > 0 && <span className="num">{openActions} open action{openActions === 1 ? "" : "s"}</span>}
          {s.meeting_id && <span className="inline-flex items-center gap-1"><Video size={11} /> calendar</span>}
        </div>
      </div>
      {s.status === "done" ? <Pill tone="tone-success"><CheckCircle2 size={10} /> Done</Pill> : s.status === "skipped" ? <Pill tone="tone-muted"><SkipForward size={10} /> Skipped</Pill> : <Pill tone="tone-info">Scheduled</Pill>}
      <ChevronRight size={14} className="text-muted" />
    </button>
  );
}

function ScheduleModal({ reports, initialEmployee, onClose, onCreated }: { reports: Report[]; initialEmployee: string; onClose: () => void; onCreated: (row: OneOnOneRow) => void }) {
  const { profile, people } = useSession();
  const toast = useToast();
  const [employeeId, setEmployeeId] = React.useState(initialEmployee || reports[0]?.id || "");
  const [when, setWhen] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(11, 0, 0, 0);
    return toLocalInput(d.toISOString());
  });
  const [recurrence, setRecurrence] = React.useState("");
  const [duration, setDuration] = React.useState(30);
  const [createMeeting, setCreateMeeting] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const employee = people.find((p) => p.id === employeeId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !when) return;
    setLoading(true);
    const supabase = createClient();
    const startsAt = fromLocalInput(when)!;
    let meetingId: string | null = null;
    if (createMeeting) {
      const endsAt = new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString();
      const { data: m, error: mErr } = await supabase.from("meetings").insert({ org_id: profile.org_id!, title: `1-on-1 · ${profile.full_name.split(" ")[0]} & ${employee?.full_name.split(" ")[0] || "report"}`, starts_at: startsAt, ends_at: endsAt, organizer_id: profile.id, agenda: "Private 1-on-1. Agenda, notes and actions live in GHL ONE → 1-on-1s." }).select("id").single();
      if (mErr || !m) { setLoading(false); toast.push(mErr?.message || "Could not create the meeting", "danger"); return; }
      meetingId = m.id;
      await supabase.from("meeting_participants").insert([{ meeting_id: m.id, user_id: profile.id }, { meeting_id: m.id, user_id: employeeId }]);
    }
    const { data, error } = await supabase.from("one_on_ones").insert({ org_id: profile.org_id!, manager_id: profile.id, employee_id: employeeId, scheduled_at: startsAt, recurrence: recurrence || null, meeting_id: meetingId }).select("*").single();
    setLoading(false);
    if (error || !data) { toast.push(error?.message || "Could not schedule", "danger"); return; }
    toast.push(`1-on-1 scheduled with ${employee?.full_name || "your report"}`, "success");
    onCreated(data);
  }

  return (
    <Modal open onClose={onClose} title="Schedule a 1-on-1" width={480}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="With">
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
            {reports.length === 0 && <option value="">No direct reports</option>}
            {reports.map((r) => <option key={r.id} value={r.id}>{r.full_name}{r.designation ? ` — ${r.designation}` : ""}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="When"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required /></Field>
          <Field label="Minutes"><Input type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 30)} /></Field>
        </div>
        <Field label="Repeat" hint="When you mark a recurring 1-on-1 done, the next one is scheduled automatically.">
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
            <option value="">Just once</option>
            {Object.entries(RECURRENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={createMeeting} onChange={(e) => setCreateMeeting(e.target.checked)} className="mt-1 accent-[var(--brand)]" />
          <span>Also add it to both calendars <span className="block text-[11px] text-muted">Creates a meeting so it shows in Calendar and your ICS feed.</span></span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading} disabled={!employeeId}><CalendarPlus size={14} /> Schedule</Button>
        </div>
      </form>
    </Modal>
  );
}
