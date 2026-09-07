"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Gauge } from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader, Pill, Button } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, fmtDate, greeting, humanize, PRIORITY_TONE, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, relDate, type ProjectStatus, type TaskPriority } from "@/lib/utils";
import { AnnouncementsCard, ApprovalsCard, MeetingsCard, MessagesCard, SectionLink, TodayCard, personalBrief, type Personal } from "./shared";
import { PulseStrip, DepartmentHealthGrid, HealthRing, computeHealth, type Pulse, type DeptHealth } from "@/components/command/CommandBits";
import { BriefCard } from "@/components/ai/BriefCard";
import { WhileYouWereAway } from "./WhileYouWereAway";

type Proj = { id: string; name: string; status: string; due_date: string | null; progress: number; department_id: string | null; owner_id: string | null; priority: string };
type Appr = { id: string; title: string; type: string; created_at: string; approver_id: string | null; requested_by: string | null; priority: string };
type Dec = { id: string; title: string; decided_at: string; decided_by: string | null; project_id: string | null };
type Risk = { id: string; title: string; severity: string; project_id: string | null; owner_id: string | null; project: { name: string } | null };

export function HomeExecutive({ personal, pulse, departments, projects, pendingApprovals, decisions, risks }: { personal: Personal; pulse: Pulse; departments: DeptHealth[]; projects: Proj[]; pendingApprovals: Appr[]; decisions: Dec[]; risks: Risk[] }) {
  const { profile } = useSession();
  const health = computeHealth(pulse, departments);
  const execBrief = pulseBrief(pulse);
  const majorProjects = projects.slice(0, 8);
  const [now] = React.useState(() => Date.now());
  const stale = pendingApprovals.filter((a) => now - new Date(a.created_at).getTime() > 48 * 3600 * 1000);

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow={fmtDate(new Date())}
        title={greeting(profile.full_name)}
        subtitle={execBrief + " " + personalBrief(personal)}
        actions={
          <Link href="/command" className="btn btn-primary"><Gauge size={15} /> Command Center</Link>
        }
      />

      <div className="grid lg:grid-cols-[auto_1fr] gap-[var(--s3)] mb-[var(--s3)] items-stretch">
        <Card className="p-[var(--s4)] flex items-center gap-[var(--s4)] min-w-0">
          <HealthRing value={health.score} size={96} />
          <div>
            <div className="eyebrow">Company health</div>
            <div className="text-2xl font-semibold num">{health.score}<span className="text-sm text-muted font-normal">/100</span></div>
            <div className="text-xs text-muted mt-1 max-w-[220px]">{health.headline}</div>
          </div>
        </Card>
        <PulseStrip pulse={pulse} />
      </div>

      <div className="grid lg:grid-cols-3 gap-[var(--s3)] stagger">
        <div className="lg:col-span-2 space-y-[var(--s3)]">
          <WhileYouWereAway />
          <BriefCard variant="executive" />
          <Card>
            <CardHeader title="Department health" action={<SectionLink href="/departments">Departments</SectionLink>} />
            <div className="px-[var(--s3)] pb-[var(--s3)]">
              <DepartmentHealthGrid rows={departments} compact />
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-[var(--s3)]">
            <Card>
              <CardHeader title="Major projects" action={<SectionLink href="/projects">All</SectionLink>} />
              {majorProjects.length === 0 ? <EmptyState title="No active projects" className="py-6" /> : (
                <div className="px-2 pb-2">
                  {majorProjects.map((p) => {
                    const late = p.due_date && new Date(p.due_date) < new Date();
                    return (
                      <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">{p.name}</div>
                          <div className="text-[11px] text-muted flex items-center gap-2 mt-0.5 flex-wrap">
                            <Pill tone={PROJECT_STATUS_TONE[p.status as ProjectStatus]}>{PROJECT_STATUS_LABEL[p.status as ProjectStatus]}</Pill>
                            {(p.priority === "critical" || p.priority === "urgent") && <Pill tone={PRIORITY_TONE[p.priority as TaskPriority]}>{humanize(p.priority)}</Pill>}
                            {p.due_date && <span className={late ? "text-danger" : ""}>{late ? "Late · " : "Due "}{relDate(p.due_date)}</span>}
                          </div>
                        </div>
                        <span className="text-xs num text-muted">{p.progress}%</span>
                        <PersonChip id={p.owner_id} size={20} showName={false} />
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Critical decisions" subtitle={stale.length ? `${stale.length} waiting over 48h` : "Pending executive approvals"} action={<SectionLink href="/approvals?tab=all">Approvals</SectionLink>} />
              {pendingApprovals.length === 0 ? <EmptyState title="No pending approvals" className="py-6" /> : (
                <div className="px-2 pb-2">
                  {pendingApprovals.map((a) => (
                    <Link key={a.id} href={`/approvals/${a.id}`} className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{a.title}</div>
                        <div className="text-[11px] text-muted flex items-center gap-2 mt-0.5"><Pill tone="tone-violet">{humanize(a.type)}</Pill><span>for</span><PersonChip id={a.approver_id} size={14} /></div>
                      </div>
                      <span className={"text-[11px] num " + (stale.includes(a) ? "text-danger" : "text-muted")}>{ago(a.created_at)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-[var(--s3)]">
            <Card>
              <CardHeader title="Risks & blockers" action={<SectionLink href="/command?tab=risks">Details</SectionLink>} />
              {risks.length === 0 && !pulse.tasks?.blocked ? <EmptyState title="No open risks" className="py-6" /> : (
                <div className="px-2 pb-2">
                  {(pulse.tasks?.blocked || 0) > 0 && (
                    <Link href="/tasks?status=blocked" className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
                      <AlertTriangle size={15} className="text-danger" /><span className="text-sm flex-1">{pulse.tasks?.blocked} blocked task{(pulse.tasks?.blocked || 0) > 1 ? "s" : ""} across the company</span>
                    </Link>
                  )}
                  {risks.map((r) => (
                    <Link key={r.id} href={`/projects/${r.project_id}?tab=risks`} className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
                      <Pill tone={PRIORITY_TONE[r.severity as TaskPriority]}>{humanize(r.severity)}</Pill>
                      <div className="min-w-0 flex-1"><div className="text-sm truncate">{r.title}</div><div className="text-[11px] text-muted truncate">{r.project?.name}</div></div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Recent decisions" action={<SectionLink href="/decisions">Register</SectionLink>} />
              {decisions.length === 0 ? <EmptyState title="No decisions recorded yet" hint="Record decisions from chat or meetings so they never disappear." className="py-6" /> : (
                <div className="px-2 pb-2">
                  {decisions.map((d) => (
                    <Link key={d.id} href={`/decisions/${d.id}`} className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
                      <div className="min-w-0 flex-1"><div className="text-sm truncate">{d.title}</div><div className="text-[11px] text-muted flex items-center gap-1"><PersonChip id={d.decided_by} size={14} /> · {ago(d.decided_at)}</div></div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
          <TodayCard p={personal} />
        </div>
        <div className="space-y-[var(--s3)]">
          <ApprovalsCard items={personal.approvals} />
          <MessagesCard unread={personal.unreadTotal} />
          <MeetingsCard items={personal.meetings} />
          <AnnouncementsCard items={personal.announcements} />
          <Link href="/announcements?new=1" className="block"><Button variant="secondary" className="w-full">Publish an announcement</Button></Link>
        </div>
      </div>
    </div>
  );
}

export function pulseBrief(p: Pulse) {
  const t = p.tasks || {};
  const pr = p.projects || {};
  const a = p.approvals || {};
  const parts: string[] = [];
  parts.push(`${pr.active ?? 0} active project${(pr.active ?? 0) === 1 ? "" : "s"}${pr.at_risk || pr.delayed ? ` (${(pr.at_risk ?? 0) + (pr.delayed ?? 0)} at risk or delayed)` : ""}`);
  if (t.overdue) parts.push(`${t.overdue} overdue task${t.overdue > 1 ? "s" : ""}`);
  if (t.blocked) parts.push(`${t.blocked} blocked`);
  if (t.waiting_mgmt) parts.push(`${t.waiting_mgmt} waiting on management`);
  if (a.pending) parts.push(`${a.pending} approval${a.pending > 1 ? "s" : ""} pending${a.stale ? ` (${a.stale} stale)` : ""}`);
  return parts.join(" · ") + ".";
}
