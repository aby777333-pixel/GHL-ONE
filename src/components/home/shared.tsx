"use client";

import Link from "next/link";
import { isToday, isPast, differenceInCalendarDays } from "date-fns";
import { CheckSquare, Megaphone, MessageSquare, Video, ArrowRight } from "lucide-react";
import { Card, CardHeader, EmptyState, Pill, Progress } from "@/components/ui";
import { TaskRow, PersonChip, type TaskRowData } from "@/components/tasks/TaskBits";
import { ago, fmtTime, humanize, relDate, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, type ProjectStatus } from "@/lib/utils";
import { buildBrief } from "./MyWorkView";

export type Personal = {
  tasks: TaskRowData[];
  approvals: { id: string; title: string; type: string; created_at: string; requested_by: string | null; priority: string }[];
  meetings: { id: string; title: string; starts_at: string; ends_at: string | null; project_id: string | null }[];
  announcements: { id: string; title: string; body: string; kind: string; mandatory: boolean; pinned: boolean; published_at: string; author_id: string | null }[];
  unreadTotal: number;
  waitingOnMe: TaskRowData[];
  projects: { id: string; name: string; status: string; due_date: string | null; progress: number; owner_id: string | null }[];
};

export function personalBrief(p: Personal) {
  const today = p.tasks.filter((t) => t.due_date && (isToday(new Date(t.due_date)) || isPast(new Date(t.due_date))));
  const overdue = today.filter((t) => t.due_date && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date)));
  const dueSoon = p.tasks.filter((t) => t.due_date && !today.includes(t) && differenceInCalendarDays(new Date(t.due_date), new Date()) <= 2);
  return buildBrief({ today: today.length, overdue: overdue.length, approvals: p.approvals.length, waitingOnMe: p.waitingOnMe.length, meetingsToday: p.meetings.filter((m) => isToday(new Date(m.starts_at))).length, mentions: 0, dueSoon: dueSoon.length });
}

export function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-xs text-muted hover:text-[var(--fg)] inline-flex items-center gap-1">
      {children} <ArrowRight size={12} />
    </Link>
  );
}

export function TodayCard({ p }: { p: Personal }) {
  const list = p.tasks.filter((t) => t.due_date && (isToday(new Date(t.due_date)) || isPast(new Date(t.due_date)))).slice(0, 6);
  const rest = p.tasks.filter((t) => !list.includes(t)).slice(0, Math.max(0, 6 - list.length));
  return (
    <Card>
      <CardHeader title="Today's work" subtitle={list.length ? `${list.length} due today or overdue` : "Nothing due today — showing what's next"} action={<SectionLink href="/my-work">My Work</SectionLink>} />
      {list.length + rest.length === 0 ? (
        <EmptyState title="Your plate is clear" className="py-8" />
      ) : (
        <div className="px-2 pb-2">
          {list.map((t) => <TaskRow key={t.id} task={t} />)}
          {rest.map((t) => <TaskRow key={t.id} task={t} />)}
        </div>
      )}
    </Card>
  );
}

export function ApprovalsCard({ items, title = "Approvals waiting for you" }: { items: Personal["approvals"]; title?: string }) {
  return (
    <Card>
      <CardHeader title={title} action={<SectionLink href="/approvals">Approval Center</SectionLink>} />
      {items.length === 0 ? (
        <EmptyState title="Nothing to approve" className="py-6" />
      ) : (
        <div className="px-2 pb-2">
          {items.map((a) => (
            <Link key={a.id} href={`/approvals/${a.id}`} className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
              <CheckSquare size={15} className="text-violet shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{a.title}</div>
                <div className="text-[11px] text-muted flex items-center gap-2"><Pill tone="tone-violet">{humanize(a.type)}</Pill><PersonChip id={a.requested_by} size={14} /> · {ago(a.created_at)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

export function MeetingsCard({ items }: { items: Personal["meetings"] }) {
  return (
    <Card>
      <CardHeader title="Meetings" subtitle="Next 7 days" action={<SectionLink href="/calendar">Calendar</SectionLink>} />
      {items.length === 0 ? (
        <EmptyState title="No meetings scheduled" className="py-6" />
      ) : (
        <div className="px-2 pb-2">
          {items.map((m) => (
            <Link key={m.id} href={`/meetings/${m.id}`} className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
              <div className="w-14 shrink-0">
                <div className="text-[11px] text-muted">{relDate(m.starts_at)}</div>
                <div className="text-xs num font-medium">{fmtTime(m.starts_at)}</div>
              </div>
              <div className="text-sm truncate flex-1">{m.title}</div>
              <Video size={14} className="text-muted" />
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

export function MessagesCard({ unread }: { unread: number }) {
  return (
    <Link href="/chat" className="card card-hover p-[var(--s3)] flex items-center gap-3">
      <span className="w-10 h-10 rounded-full tone-info flex items-center justify-center"><MessageSquare size={18} /></span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">Messages</div>
        <div className="text-xs text-muted">{unread ? `${unread} unread message${unread > 1 ? "s" : ""}` : "You're caught up"}</div>
      </div>
      {unread > 0 && <span className="pill tone-brand">{unread}</span>}
    </Link>
  );
}

export function AnnouncementsCard({ items }: { items: Personal["announcements"] }) {
  return (
    <Card>
      <CardHeader title="Announcements" action={<SectionLink href="/announcements">All</SectionLink>} />
      {items.length === 0 ? (
        <EmptyState title="No announcements yet" className="py-6" />
      ) : (
        <div className="px-2 pb-2">
          {items.map((a) => (
            <Link key={a.id} href={`/announcements#${a.id}`} className="flex items-start gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
              <Megaphone size={15} className="text-muted mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate flex items-center gap-2">{a.title}{a.mandatory && <Pill tone="tone-danger">Must read</Pill>}</div>
                <div className="text-xs text-muted truncate-2">{a.body}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

export function ProjectsCard({ items, title = "Projects" }: { items: Personal["projects"]; title?: string }) {
  return (
    <Card>
      <CardHeader title={title} action={<SectionLink href="/projects">All projects</SectionLink>} />
      {items.length === 0 ? (
        <EmptyState title="No projects" className="py-6" />
      ) : (
        <div className="px-2 pb-2">
          {items.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate flex items-center gap-2">{p.name}<Pill tone={PROJECT_STATUS_TONE[p.status as ProjectStatus]}>{PROJECT_STATUS_LABEL[p.status as ProjectStatus]}</Pill></div>
                <div className="flex items-center gap-2 mt-1"><Progress value={p.progress} className="flex-1 max-w-[220px]" height={4} /><span className="text-[11px] num text-muted">{p.progress}%</span>{p.due_date && <span className="text-[11px] text-muted num">· due {relDate(p.due_date)}</span>}</div>
              </div>
              <PersonChip id={p.owner_id} size={20} showName={false} />
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
