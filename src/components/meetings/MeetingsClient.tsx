"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Video, Plus, MapPin, Link2, FolderKanban, ListChecks, CalendarDays } from "lucide-react";
import { AvatarStack, Button, Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, fmtDate, relDate, type Meeting } from "@/lib/utils";
import { ScheduleMeetingModal, type ScheduleDefaults } from "./ScheduleMeetingModal";
import { durationLabel, durationMinutes, isPastMeeting } from "./meetingUtils";

type TabKey = "upcoming" | "past" | "mine";
export type MeetingListItem = Meeting & { participant_ids: string[]; action_count: number; confirmed_count: number };

export function MeetingsClient({ meetings, projects, openNew, defaults, initialTab }: { meetings: MeetingListItem[]; projects: { id: string; name: string }[]; openNew: boolean; defaults: ScheduleDefaults; initialTab?: string }) {
  const { profile, people } = useSession();
  const router = useRouter();
  const [now] = React.useState(() => Date.now());
  const [tab, setTab] = React.useState<TabKey>(initialTab === "past" || initialTab === "mine" ? initialTab : "upcoming");
  const [showNew, setShowNew] = React.useState(openNew);
  const projectName = React.useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const upcoming = meetings.filter((m) => !isPastMeeting(m, now)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = meetings.filter((m) => isPastMeeting(m, now)).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
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
        actions={<Button variant="primary" onClick={() => setShowNew(true)}><Plus size={15} /> Schedule meeting</Button>}
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
                  const ppl = m.participant_ids.map((id) => people.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
                  const mins = durationMinutes(m);
                  const past = isPastMeeting(m, now);
                  return (
                    <Card key={m.id} hover className={cn("px-[var(--s4)] py-[var(--s3)]", past && "opacity-90")}>
                      <div className="flex items-start gap-3">
                        <div className="text-center shrink-0 w-12">
                          <div className="text-lg font-semibold num leading-none">{fmtDate(m.starts_at, true).split(", ")[1]}</div>
                          {mins ? <div className="text-[11px] text-muted mt-1">{durationLabel(mins)}</div> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link href={`/meetings/${m.id}`} className="block font-medium leading-snug hover:underline">{m.title}</Link>
                          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1.5 text-xs text-muted">
                            <PersonChip id={m.organizer_id} size={16} />
                            {m.project_id && projectName.get(m.project_id) && <Link href={`/projects/${m.project_id}`} className="inline-flex items-center gap-1 hover:underline truncate max-w-[160px]"><FolderKanban size={12} /> {projectName.get(m.project_id)}</Link>}
                            {m.location && <span className="inline-flex items-center gap-1 truncate max-w-[160px]"><MapPin size={12} /> {m.location}</span>}
                            {m.meeting_link && <a href={m.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 link"><Link2 size={12} /> Join</a>}
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-3">
                            {ppl.length ? <AvatarStack people={ppl} size={22} max={5} /> : <span className="text-xs text-muted">No participants</span>}
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
