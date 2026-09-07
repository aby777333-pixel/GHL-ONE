"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isToday, isPast, isTomorrow, differenceInCalendarDays } from "date-fns";
import { AtSign, CheckSquare, FolderKanban, Hourglass, ListChecks, Plus, Sun, Video, Zap } from "lucide-react";
import { Button, Card, CardHeader, EmptyState, Modal, PageHeader, Pill, Progress, Tabs, Avatar } from "@/components/ui";
import { TaskRow, PersonChip, type TaskRowData } from "@/components/tasks/TaskBits";
import { QuickTaskForm } from "@/components/tasks/QuickTaskForm";
import { useSession, usePerson } from "@/components/providers/SessionProvider";
import { ago, fmtDate, fmtTime, greeting, humanize, isManagerPlus, isAdminRole, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, relDate, cn } from "@/lib/utils";
import { BriefCard } from "@/components/ai/BriefCard";

type T = TaskRowData & { owner_id: string | null; delegated_by: string | null; created_at: string; updated_at: string };
type Approval = { id: string; title: string; type: string; priority: string; due_date: string | null; created_at: string; requested_by: string | null; project_id: string | null };
type Mention = { id: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null; actor_id: string | null };
type Proj = { id: string; name: string; status: string; due_date: string | null; progress: number; department_id: string | null; owner_id: string | null };
type Meeting = { id: string; title: string; starts_at: string; ends_at: string | null; project_id: string | null };

type TabKey = "today" | "next" | "urgent" | "waiting" | "approvals" | "mentions" | "projects";

export function MyWorkView({ userId, tasks, waitingOnMe, approvals, mentions, projects, meetings }: { userId: string; tasks: T[]; waitingOnMe: TaskRowData[]; approvals: Approval[]; mentions: Mention[]; projects: Proj[]; meetings: Meeting[] }) {
  const { profile } = useSession();
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>("today");
  const [newOpen, setNewOpen] = React.useState(false);

  const assigned = tasks.filter((t) => t.assignee_id === userId);
  const today = assigned.filter((t) => t.due_date && (isToday(new Date(t.due_date)) || isPast(new Date(t.due_date))) && t.status !== "waiting" && t.status !== "blocked");
  const overdue = today.filter((t) => t.due_date && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date)));
  const next = assigned.filter((t) => !today.includes(t) && t.status !== "waiting" && t.status !== "blocked").sort((a, b) => (a.due_date || "9").localeCompare(b.due_date || "9"));
  const urgent = assigned.filter((t) => t.priority === "critical" || t.priority === "urgent");
  const waitingMine = tasks.filter((t) => (t.status === "waiting" || t.status === "blocked") && (t.assignee_id === userId || t.owner_id === userId));
  const delegated = tasks.filter((t) => t.delegated_by === userId && t.assignee_id !== userId);
  const meetingsToday = meetings.filter((m) => isToday(new Date(m.starts_at)));
  const unreadMentions = mentions.filter((m) => !m.read_at);

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "today", label: "Today", count: today.length },
    { key: "next", label: "Next", count: next.length },
    { key: "urgent", label: "Urgent", count: urgent.length },
    { key: "waiting", label: "Waiting", count: waitingMine.length + waitingOnMe.length },
    { key: "approvals", label: "Approvals", count: approvals.length },
    { key: "mentions", label: "Mentions", count: unreadMentions.length },
    { key: "projects", label: "Projects", count: projects.length },
  ];

  const brief = buildBrief({ today: today.length, overdue: overdue.length, approvals: approvals.length, waitingOnMe: waitingOnMe.length, meetingsToday: meetingsToday.length, mentions: unreadMentions.length, dueSoon: next.filter((t) => t.due_date && differenceInCalendarDays(new Date(t.due_date), new Date()) <= 2).length });

  return (
    <div className="page">
      <PageHeader
        eyebrow={fmtDate(new Date())}
        title={greeting(profile.full_name)}
        subtitle={brief}
        actions={
          <Button variant="primary" onClick={() => setNewOpen(true)}>
            <Plus size={15} /> New task
          </Button>
        }
      />

      {/* Focus strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-[var(--s4)] stagger">
        <Focus icon={<Sun size={15} />} label="Due today" value={today.length} tone={overdue.length ? "text-danger" : undefined} sub={overdue.length ? `${overdue.length} overdue` : "on track"} onClick={() => setTab("today")} />
        <Focus icon={<Zap size={15} />} label="Urgent" value={urgent.length} tone={urgent.length ? "text-orange" : undefined} onClick={() => setTab("urgent")} />
        <Focus icon={<Hourglass size={15} />} label="Waiting on you" value={waitingOnMe.length} tone={waitingOnMe.length ? "text-warn" : undefined} onClick={() => setTab("waiting")} />
        <Focus icon={<CheckSquare size={15} />} label="To approve" value={approvals.length} tone={approvals.length ? "text-violet" : undefined} onClick={() => setTab("approvals")} />
        <Focus icon={<AtSign size={15} />} label="Mentions" value={unreadMentions.length} onClick={() => setTab("mentions")} />
        <Focus icon={<Video size={15} />} label="Meetings today" value={meetingsToday.length} onClick={() => router.push("/calendar")} />
      </div>

      <BriefCard variant={isAdminRole(profile.role) ? "executive" : isManagerPlus(profile.role) ? "manager" : "employee"} collapsible className="mb-[var(--s4)]" />

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-3" />

      <div className="anim-fade-in" key={tab}>
        {tab === "today" && (
          <Section>
            {today.length === 0 ? (
              <EmptyState icon={<Sun size={18} />} title="Nothing due today" hint="Your next items are under Next. Enjoy the focus time." />
            ) : (
              <List>
                {[...overdue, ...today.filter((t) => !overdue.includes(t))].map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </List>
            )}
            {meetingsToday.length > 0 && (
              <Card className="mt-3">
                <CardHeader title="Today's meetings" />
                <div className="px-2 pb-2">
                  {meetingsToday.map((m) => (
                    <Link key={m.id} href={`/meetings/${m.id}`} className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
                      <span className="num text-xs text-muted w-12">{fmtTime(m.starts_at)}</span>
                      <span className="text-sm flex-1 truncate">{m.title}</span>
                      <Video size={14} className="text-muted" />
                    </Link>
                  ))}
                </div>
              </Card>
            )}
          </Section>
        )}

        {tab === "next" && (
          <Section>
            {next.length === 0 ? (
              <EmptyState icon={<ListChecks size={18} />} title="No upcoming work" hint="When something is assigned to you it appears here, ordered by deadline." />
            ) : (
              <List>
                {groupByDue(next).map((g) => (
                  <React.Fragment key={g.label}>
                    <div className="eyebrow px-3 pt-3 pb-1">{g.label}</div>
                    {g.items.map((t) => <TaskRow key={t.id} task={t} />)}
                  </React.Fragment>
                ))}
              </List>
            )}
          </Section>
        )}

        {tab === "urgent" && (
          <Section>
            {urgent.length === 0 ? <EmptyState icon={<Zap size={18} />} title="No urgent requests" hint="Critical and urgent tasks assigned to you show here." /> : <List>{urgent.map((t) => <TaskRow key={t.id} task={t} />)}</List>}
          </Section>
        )}

        {tab === "waiting" && (
          <div className="grid lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader title="Waiting on you" subtitle="Others cannot move until you act" />
              {waitingOnMe.length === 0 ? <EmptyState title="Nobody is waiting on you" className="py-8" /> : <div className="px-2 pb-2">{waitingOnMe.map((t) => <TaskRow key={t.id} task={t} />)}</div>}
            </Card>
            <Card>
              <CardHeader title="You are waiting on" subtitle="Your work that is blocked or waiting on someone" />
              {waitingMine.length === 0 ? <EmptyState title="Nothing is blocking you" className="py-8" /> : <div className="px-2 pb-2">{waitingMine.map((t) => <TaskRow key={t.id} task={t} />)}</div>}
            </Card>
            {delegated.length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader title="Delegated by you" subtitle="Work you handed to others — still your responsibility" />
                <div className="px-2 pb-2">{delegated.map((t) => <TaskRow key={t.id} task={t} />)}</div>
              </Card>
            )}
          </div>
        )}

        {tab === "approvals" && (
          <Section>
            {approvals.length === 0 ? (
              <EmptyState icon={<CheckSquare size={18} />} title="No approvals waiting for you" />
            ) : (
              <List>
                {approvals.map((a) => (
                  <Link key={a.id} href={`/approvals/${a.id}`} className="flex items-center gap-3 px-3 py-2.5 row-hover rounded-[var(--radius-sm)]">
                    <CheckSquare size={16} className="text-violet shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{a.title}</div>
                      <div className="text-[11px] text-muted flex items-center gap-2 mt-0.5">
                        <Pill tone="tone-violet">{humanize(a.type)}</Pill>
                        <span>requested {ago(a.created_at)}</span>
                        <PersonChip id={a.requested_by} size={16} />
                      </div>
                    </div>
                    {a.due_date && <span className="text-xs text-muted num">{relDate(a.due_date)}</span>}
                  </Link>
                ))}
              </List>
            )}
          </Section>
        )}

        {tab === "mentions" && (
          <Section>
            {mentions.length === 0 ? (
              <EmptyState icon={<AtSign size={18} />} title="No mentions" hint="When someone @mentions you in chat it shows here." />
            ) : (
              <List>
                {mentions.map((m) => (
                  <MentionRow key={m.id} m={m} />
                ))}
              </List>
            )}
          </Section>
        )}

        {tab === "projects" && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
            {projects.length === 0 && <EmptyState icon={<FolderKanban size={18} />} title="You are not on any project yet" className="sm:col-span-2 lg:col-span-3" />}
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="card card-hover p-[var(--s3)] block">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium truncate">{p.name}</div>
                  <Pill tone={PROJECT_STATUS_TONE[p.status as keyof typeof PROJECT_STATUS_TONE]}>{PROJECT_STATUS_LABEL[p.status as keyof typeof PROJECT_STATUS_LABEL]}</Pill>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Progress value={p.progress} className="flex-1" />
                  <span className="text-xs num text-muted">{p.progress}%</span>
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] text-muted">
                  <PersonChip id={p.owner_id} size={16} />
                  {p.due_date && <span className="num">Due {relDate(p.due_date)}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New task">
        <QuickTaskForm defaults={{ assignee_id: userId }} onCreated={(id) => { setNewOpen(false); router.push(`/tasks/${id}`); }} onCancel={() => setNewOpen(false)} />
      </Modal>
    </div>
  );
}

function Focus({ icon, label, value, tone, sub, onClick }: { icon: React.ReactNode; label: string; value: number; tone?: string; sub?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="card card-hover text-left px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-muted text-[11px] font-medium">{icon}<span className="truncate">{label}</span></div>
      <div className={cn("text-[1.45rem] font-semibold num leading-tight mt-0.5", tone)}>{value}</div>
      {sub && <div className="text-[11px] text-muted truncate">{sub}</div>}
    </button>
  );
}
function Section({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
function List({ children }: { children: React.ReactNode }) {
  return <div className="card p-1.5">{children}</div>;
}
function MentionRow({ m }: { m: Mention }) {
  const actor = usePerson(m.actor_id);
  return (
    <Link href={m.link || "/inbox"} className={cn("flex items-start gap-3 px-3 py-2.5 row-hover rounded-[var(--radius-sm)]", !m.read_at && "bg-[color-mix(in_oklab,var(--brand)_7%,transparent)]")}>
      <Avatar name={actor?.full_name} src={actor?.avatar_url} size={28} />
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate">{m.title}</div>
        {m.body && <div className="text-xs text-muted truncate-2">{m.body}</div>}
      </div>
      <span className="text-[11px] text-muted whitespace-nowrap">{ago(m.created_at)}</span>
    </Link>
  );
}

function groupByDue<T extends { due_date: string | null }>(items: T[]) {
  const groups: { label: string; items: T[] }[] = [];
  const push = (label: string, t: T) => {
    let g = groups.find((x) => x.label === label);
    if (!g) { g = { label, items: [] }; groups.push(g); }
    g.items.push(t);
  };
  for (const t of items) {
    if (!t.due_date) { push("No deadline", t); continue; }
    const d = new Date(t.due_date);
    if (isTomorrow(d)) push("Tomorrow", t);
    else if (differenceInCalendarDays(d, new Date()) < 7) push("This week", t);
    else if (differenceInCalendarDays(d, new Date()) < 14) push("Next week", t);
    else push("Later", t);
  }
  return groups;
}

/** Phase-1 rule-based morning brief; Phase 2 replaces with AI. */
export function buildBrief(n: { today: number; overdue: number; approvals: number; waitingOnMe: number; meetingsToday: number; mentions: number; dueSoon: number }) {
  const parts: string[] = [];
  if (n.today) parts.push(`${n.today} task${n.today > 1 ? "s" : ""} need${n.today > 1 ? "" : "s"} your attention today${n.overdue ? ` (${n.overdue} overdue)` : ""}`);
  if (n.dueSoon) parts.push(`${n.dueSoon} deadline${n.dueSoon > 1 ? "s are" : " is"} approaching`);
  if (n.approvals) parts.push(`${n.approvals} approval${n.approvals > 1 ? "s are" : " is"} waiting for you`);
  if (n.waitingOnMe) parts.push(`${n.waitingOnMe} item${n.waitingOnMe > 1 ? "s are" : " is"} blocked waiting for your input`);
  if (n.meetingsToday) parts.push(`${n.meetingsToday} meeting${n.meetingsToday > 1 ? "s" : ""} today`);
  if (n.mentions) parts.push(`${n.mentions} unread mention${n.mentions > 1 ? "s" : ""}`);
  if (!parts.length) return "Your plate is clear. Pick something from Next or help a teammate.";
  return parts.join(" · ") + ".";
}
