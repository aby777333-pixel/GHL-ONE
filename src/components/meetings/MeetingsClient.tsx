"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Video, Plus, MapPin, Link2, FolderKanban, ListChecks, CalendarDays, Radio, CheckCircle2, CalendarX2, Users } from "lucide-react";
import { Button, Card, EmptyState, PageHeader, Pill, Tabs } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, fmtDate, relDate, type Meeting } from "@/lib/utils";
import { ScheduleMeetingModal, type ScheduleDefaults } from "./ScheduleMeetingModal";
import { createClient } from "@/lib/supabase/client";
import { durationLabel, durationMinutes, meetingPhase } from "./meetingUtils";
import { openCollaborate } from "@/components/live/liveStore";

type TabKey = "upcoming" | "past" | "mine";
export type MeetingListItem = Meeting & { participant_ids: string[]; action_count: number; confirmed_count: number; live_status?: string | null };

export function MeetingsClient({ meetings, projects, openNew, defaults, initialTab }: { meetings: MeetingListItem[]; projects: { id: string; name: string }[]; openNew: boolean; defaults: ScheduleDefaults; initialTab?: string }) {
  const { profile } = useSession();
  const router = useRouter();
  /* The clock moves. Read once at mount, a meeting whose time had passed stayed under Upcoming until the
     page was reloaded; re-read every 30 seconds so it moves to Past on its own. */
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* When a host ends a GHL Live room (or a meeting is called off) the list should say so straight away,
     not on the next Join click. Re-read the page on either change. */
  React.useEffect(() => {
    const sb = createClient();
    const chan = sb.channel("meetings-list")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_rooms" }, () => router.refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "meetings" }, () => router.refresh());
    let cancelled = false;
    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) sb.realtime.setAuth(data.session.access_token);
      chan.subscribe();
    });
    return () => { cancelled = true; sb.removeChannel(chan); };
  }, [router]);
  const [tab, setTab] = React.useState<TabKey>(initialTab === "past" || initialTab === "mine" ? initialTab : "upcoming");
  const [showNew, setShowNew] = React.useState(openNew);
  const projectName = React.useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  // Upcoming = scheduled or running now. Past = ended or cancelled — a cancelled meeting is history, not
  // something to prepare for.
  const upcoming = meetings.filter((m) => { const ph = meetingPhase(m, now); return ph === "upcoming" || ph === "live"; }).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = meetings.filter((m) => { const ph = meetingPhase(m, now); return ph === "ended" || ph === "cancelled"; }).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const mine = meetings.filter((m) => m.organizer_id === profile.id || m.participant_ids.includes(profile.id)).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const list = tab === "upcoming" ? upcoming : tab === "past" ? past : mine;

  const groups = React.useMemo(() => {
    const map = new Map<string, MeetingListItem[]>();
    for (const m of list) {
      const k = relDate(m.starts_at) + (fmtDate(m.starts_at) === relDate(m.starts_at) ? "" : ` · ${fmtDate(m.starts_at)}`);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    }
    return [...map.entries()];
  }, [list]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Meetings"
        title="Meetings"
        subtitle={upcoming.length ? `${upcoming.length} upcoming` : "Agenda, notes, decisions and action items — all in one room."}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" onClick={() => openCollaborate({ title: "Instant huddle" }, "huddle")} title="Skip the calendar — talk now">
              <Radio size={15} /> Start instant huddle
            </Button>
            <Button variant="primary" onClick={() => setShowNew(true)}><Plus size={15} /> Schedule meeting</Button>
          </div>
        }
      />
      <Tabs tabs={[{ key: "upcoming", label: "Upcoming", count: upcoming.length }, { key: "past", label: "Past" }, { key: "mine", label: "Mine" }]} value={tab} onChange={setTab} className="mb-[var(--s3)]" />

      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<Video size={18} />} title={tab === "upcoming" ? "Nothing scheduled" : tab === "past" ? "No past meetings" : "You are not in any meetings"} hint={tab === "upcoming" ? "Schedule a meeting and every participant gets it on their calendar." : "Meetings you organise or attend will appear here."} action={tab !== "past" ? <Button variant="primary" onClick={() => setShowNew(true)}><Plus size={15} /> Schedule meeting</Button> : undefined} />
        </Card>
      ) : (
        <div className="space-y-[var(--s4)]">
          {groups.map(([day, items]) => (
            <section key={day}>
              <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><CalendarDays size={12} /> {day}</div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s3)] stagger">
                {items.map((m) => {
                  const mins = durationMinutes(m);
                  const phase = meetingPhase(m, now);
                  const n = m.participant_ids.length;
                  return (
                    <Card key={m.id} hover className={cn("px-[var(--s4)] py-[var(--s3)]", (phase === "ended" || phase === "cancelled") && "opacity-90")}>
                      <div className="flex items-start gap-3">
                        <div className="text-center shrink-0 w-12">
                          <div className="text-lg font-semibold num leading-none">{fmtDate(m.starts_at, true).split(", ")[1]}</div>
                          {mins ? <div className="text-[11px] text-muted mt-1">{durationLabel(mins)}</div> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <Link href={`/meetings/${m.id}`} className={cn("block font-medium leading-snug hover:underline min-w-0 flex-1", m.cancelled_at && "line-through text-muted")}>{m.title}</Link>
                            {phase === "live" && <Pill tone="tone-success" className="shrink-0">{m.live_status === "live" ? "Live now" : "In progress"}</Pill>}
                          </div>
                          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1.5 text-xs text-muted">
                            <PersonChip id={m.organizer_id} size={16} />
                            {m.project_id && projectName.get(m.project_id) && <Link href={`/projects/${m.project_id}`} className="inline-flex items-center gap-1 hover:underline truncate max-w-[160px]"><FolderKanban size={12} /> {projectName.get(m.project_id)}</Link>}
                            {m.location && <span className="inline-flex items-center gap-1 truncate max-w-[160px]"><MapPin size={12} /> {m.location}</span>}
                            {/* A live Join on a meeting that already ended — or one the organiser
                                called off — sent people into an empty room. Say what happened
                                instead of offering a door that leads nowhere. */}
                            {phase === "cancelled" ? (
                              <span className="inline-flex items-center gap-1 text-danger"><CalendarX2 size={12} /> Cancelled</span>
                            ) : phase === "ended" ? (
                              <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} /> Ended</span>
                            ) : (
                              m.meeting_link && <a href={m.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 link"><Link2 size={12} /> Join</a>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-3">
                            {/* The host already identifies the meeting and the full list is inside it, so the card
                                carries a count rather than a row of faces. */}
                            <span className="inline-flex items-center gap-1 text-xs text-muted num"><Users size={12} /> {n ? `${n} participant${n === 1 ? "" : "s"}` : "No participants"}</span>
                            {m.action_count > 0 && (
                              <span className={cn("inline-flex items-center gap-1 text-[11px] num", m.confirmed_count < m.action_count ? "text-warn" : "text-muted")}>
                                <ListChecks size={12} /> {m.confirmed_count}/{m.action_count} actions
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {showNew && <ScheduleMeetingModal open onClose={() => { setShowNew(false); if (openNew) router.replace("/meetings"); }} defaults={defaults} onCreated={(id) => router.push(`/meetings/${id}`)} />}
    </div>
  );
}
