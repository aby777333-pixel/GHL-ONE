"use client";

import Link from "next/link";
import { Card, CardHeader, EmptyState, PageHeader, Pill, Avatar } from "@/components/ui";
import { TaskRow, type TaskRowData } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { fmtDate, greeting } from "@/lib/utils";
import { AnnouncementsCard, ApprovalsCard, MeetingsCard, MessagesCard, ProjectsCard, SectionLink, TodayCard, personalBrief, type Personal } from "./shared";
import { BriefCard } from "@/components/ai/BriefCard";
import { TeamTodayCard } from "@/components/attendance";
import { TeamGoalsCard } from "@/components/goals/GoalMini";

export type WorkloadRow = { user_id: string; full_name: string; avatar_url: string | null; designation: string | null; department_id: string | null; presence: string; open_tasks: number; urgent: number; overdue: number; blocked: number; waiting: number; due_week: number; on_leave: boolean; est_hours: number };

export function loadLevel(w: WorkloadRow): { label: string; tone: string; pct: number } {
  if (w.on_leave) return { label: "On leave", tone: "tone-muted", pct: 0 };
  const score = w.open_tasks + w.urgent * 2 + w.overdue * 2;
  if (score >= 16) return { label: "Overloaded", tone: "tone-danger", pct: 100 };
  if (score >= 9) return { label: "Busy", tone: "tone-warn", pct: 70 };
  if (score >= 3) return { label: "Available", tone: "tone-success", pct: 40 };
  return { label: "Underutilised", tone: "tone-info", pct: 15 };
}

export function WorkloadCard({ rows, title = "Team workload", limit = 8, departmentId }: { rows: WorkloadRow[]; title?: string; limit?: number; departmentId?: string | null }) {
  const list = (departmentId ? rows.filter((r) => r.department_id === departmentId) : rows).slice().sort((a, b) => b.open_tasks + b.urgent * 2 + b.overdue * 2 - (a.open_tasks + a.urgent * 2 + a.overdue * 2)).slice(0, limit);
  return (
    <Card>
      <CardHeader title={title} subtitle="Before assigning, check who has capacity" action={<SectionLink href="/command?tab=workload">Full workload</SectionLink>} />
      {list.length === 0 ? (
        <EmptyState title="No team members yet" className="py-6" />
      ) : (
        <div className="px-2 pb-2">
          {list.map((w) => {
            const lv = loadLevel(w);
            return (
              <Link key={w.user_id} href={`/people/${w.user_id}`} className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
                <Avatar name={w.full_name} src={w.avatar_url} size={28} presence={w.presence} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{w.full_name}</div>
                  <div className="text-[11px] text-muted truncate">{w.open_tasks} open · {w.urgent} urgent · {w.overdue} overdue{w.blocked ? ` · ${w.blocked} blocked` : ""}</div>
                </div>
                <div className="hidden sm:block w-20 h-1.5 rounded-full sunken overflow-hidden"><div className="h-full" style={{ width: `${lv.pct}%`, background: lv.tone === "tone-danger" ? "var(--danger)" : lv.tone === "tone-warn" ? "var(--warn)" : lv.tone === "tone-success" ? "var(--success)" : "var(--info)" }} /></div>
                <Pill tone={lv.tone}>{lv.label}</Pill>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function HomeManager({ personal, workload, teamTasks, projects }: { personal: Personal; workload: WorkloadRow[]; teamTasks: TaskRowData[]; projects: Personal["projects"] }) {
  const { profile } = useSession();
  const blocked = teamTasks.filter((t) => t.status === "blocked" || t.status === "waiting");
  const overdue = teamTasks.filter((t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "blocked" && t.status !== "waiting");
  return (
    <div className="page">
      <PageHeader eyebrow={fmtDate(new Date())} title={greeting(profile.full_name)} subtitle={personalBrief(personal) + ` ${blocked.length} team item${blocked.length === 1 ? "" : "s"} blocked, ${overdue.length} overdue.`} />
      <div className="grid lg:grid-cols-3 gap-[var(--s3)] stagger">
        <div className="lg:col-span-2 space-y-[var(--s3)]">
          <BriefCard variant="manager" />
          <div className="grid md:grid-cols-2 gap-[var(--s3)]">
            <Card>
              <CardHeader title="Blocked work" subtitle="Why work isn't moving" action={<SectionLink href="/tasks?status=blocked">All</SectionLink>} />
              {blocked.length === 0 ? <EmptyState title="Nothing blocked" className="py-6" /> : <div className="px-2 pb-2">{blocked.slice(0, 6).map((t) => <TaskRow key={t.id} task={t} />)}</div>}
            </Card>
            <Card>
              <CardHeader title="Missed deadlines" action={<SectionLink href="/tasks?overdue=1">All</SectionLink>} />
              {overdue.length === 0 ? <EmptyState title="No missed deadlines" className="py-6" /> : <div className="px-2 pb-2">{overdue.slice(0, 6).map((t) => <TaskRow key={t.id} task={t} />)}</div>}
            </Card>
          </div>
          <WorkloadCard rows={workload} departmentId={profile.role === "manager" || profile.role === "team_lead" || profile.role === "department_head" ? profile.department_id : null} />
          <ProjectsCard items={projects} title="Project progress" />
          <TodayCard p={personal} />
        </div>
        <div className="space-y-[var(--s3)]">
          <TeamTodayCard departmentId={profile.role === "manager" || profile.role === "team_lead" || profile.role === "department_head" ? profile.department_id : null} />
          <TeamGoalsCard />
          <ApprovalsCard items={personal.approvals} />
          <MessagesCard unread={personal.unreadTotal} />
          <MeetingsCard items={personal.meetings} />
          <AnnouncementsCard items={personal.announcements} />
        </div>
      </div>
    </div>
  );
}
