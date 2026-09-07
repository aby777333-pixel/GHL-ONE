"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Flag, Gauge, Hourglass, Layers, Video } from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader, Pill, Tabs, Avatar, Progress } from "@/components/ui";
import { TaskRow, PersonChip, PersonName, type TaskRowData } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, fmtTime, humanize, relDate, PRIORITY_TONE, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, type ProjectStatus, type TaskPriority } from "@/lib/utils";
import { computeHealth, DepartmentHealthGrid, HealthRing, PulseStrip, scoreTone, type DeptHealth, type Pulse } from "./CommandBits";
import { loadLevel, type WorkloadRow } from "@/components/home/HomeManager";
import { pulseBrief } from "@/components/home/HomeExecutive";

type T = TaskRowData & { department_id: string | null };
type Proj = { id: string; name: string; status: string; due_date: string | null; progress: number; department_id: string | null; owner_id: string | null; priority: string; classification: string };
type Appr = { id: string; title: string; type: string; created_at: string; approver_id: string | null; requested_by: string | null; priority: string; project_id: string | null; due_date: string | null };
type Milestone = { id: string; title: string; due_date: string | null; project_id: string; completed_at: string | null; project: { name: string } | null };
type Meeting = { id: string; title: string; starts_at: string; ends_at: string | null; project_id: string | null; organizer_id: string | null };
type Dec = { id: string; title: string; decided_at: string; decided_by: string | null; project_id: string | null };
type Risk = { id: string; title: string; severity: string; project_id: string | null; owner_id: string | null; mitigation: string | null; project: { name: string } | null };
type Act = { id: number; action: string; entity_type: string; entity_id: string | null; summary: string | null; actor_id: string | null; created_at: string; project_id: string | null; task_id: string | null };
type Ann = { id: string; title: string; published_at: string; mandatory: boolean };
type Dep = { task_id: string; depends_on_id: string };

type TabKey = "overview" | "projects" | "workload" | "bottlenecks" | "approvals" | "activity";

export function CommandCenter(props: { initialTab?: string; pulse: Pulse; departments: DeptHealth[]; workload: WorkloadRow[]; critical: T[]; waiting: T[]; overdue: T[]; projects: Proj[]; approvals: Appr[]; milestones: Milestone[]; meetings: Meeting[]; decisions: Dec[]; risks: Risk[]; activity: Act[]; announcements: Ann[]; deps: Dep[] }) {
  const { pulse, departments, workload, critical, waiting, overdue, projects, approvals, milestones, meetings, decisions, risks, activity, deps } = props;
  const { people, departments: deptList } = useSession();
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>((props.initialTab as TabKey) || "overview");
  const health = computeHealth(pulse, departments);
  const bottlenecks = detectBottlenecks({ approvals, waiting, overdue, deps, workload, people, departments: deptList });
  const delayed = projects.filter((p) => p.status === "delayed" || p.status === "at_risk" || (p.due_date && new Date(p.due_date) < new Date()));
  const waitingMgmt = waiting.filter((t) => t.waiting_on === "manager" || t.waiting_on === "approval");
  const waitingOthers = waiting.filter((t) => t.waiting_on !== "manager" && t.waiting_on !== "approval");

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "projects", label: "Projects", count: projects.length },
    { key: "workload", label: "Workload", count: workload.length },
    { key: "bottlenecks", label: "Bottlenecks & risks", count: bottlenecks.length + risks.length },
    { key: "approvals", label: "Approvals", count: approvals.length },
    { key: "activity", label: "Activity" },
  ];

  return (
    <div className="page page-wide">
      <PageHeader eyebrow="Management" title={<span className="inline-flex items-center gap-2"><Gauge size={22} className="text-[var(--brand-2)]" /> Command Center</span>} subtitle={pulseBrief(pulse)} />

      <div className="grid lg:grid-cols-[auto_1fr] gap-[var(--s3)] mb-[var(--s3)] items-stretch">
        <Card className="p-[var(--s4)] flex items-center gap-[var(--s4)]">
          <HealthRing value={health.score} size={104} />
          <div className="min-w-0">
            <div className="eyebrow">Company health score</div>
            <div className="text-xs text-muted mt-1 mb-2 max-w-[260px]">{health.headline}</div>
            <div className="grid grid-cols-4 gap-x-3 gap-y-1">
              {health.indicators.map((i) => (
                <div key={i.key} className="min-w-0">
                  <div className="text-[10px] text-muted truncate">{i.label}</div>
                  <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: scoreTone(i.score) }} /><span className="text-xs num font-medium">{i.score}</span></div>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <PulseStrip pulse={pulse} />
      </div>

      <Tabs tabs={tabs} value={tab} onChange={(t) => { setTab(t); router.replace(`/command?tab=${t}`); }} className="mb-3" />

      {tab === "overview" && (
        <div className="grid lg:grid-cols-3 gap-[var(--s3)] stagger" key="ov">
          <div className="lg:col-span-2 space-y-[var(--s3)]">
            <Card>
              <CardHeader title="Department health" subtitle="Drill down: company → department → project → team → employee → task" action={<Link href="/departments" className="text-xs text-muted hover:text-[var(--fg)]">All departments →</Link>} />
              <div className="px-[var(--s3)] pb-[var(--s3)]"><DepartmentHealthGrid rows={departments} compact /></div>
            </Card>
            <div className="grid md:grid-cols-2 gap-[var(--s3)]">
              <ListCard title="Today's priorities" subtitle="Critical & urgent across the company" href="/tasks?priority=critical" items={critical} icon={<Flag size={14} />} />
              <ListCard title="Delayed & at-risk projects" href="/projects?status=at_risk" empty="No delayed projects" render={delayed.map((p) => <ProjectLine key={p.id} p={p} />)} />
              <ListCard title="Waiting on management" subtitle="Decisions only you can unblock" href="/tasks?waiting=manager" items={waitingMgmt} icon={<Hourglass size={14} />} />
              <ListCard title="Waiting on other departments" href="/tasks?waiting=employee" items={waitingOthers.slice(0, 8)} icon={<Layers size={14} />} />
            </div>
            <Card>
              <CardHeader title="Bottlenecks detected" subtitle="Patterns that will hurt if ignored" action={<button className="text-xs text-muted hover:text-[var(--fg)]" onClick={() => setTab("bottlenecks")}>Details →</button>} />
              {bottlenecks.length === 0 ? <EmptyState title="No bottlenecks detected" hint="We watch for approvers with piles, people everyone waits on, and departments repeatedly waiting on each other." className="py-6" /> : (
                <div className="px-2 pb-2">{bottlenecks.slice(0, 4).map((b) => <BottleneckLine key={b.key} b={b} />)}</div>
              )}
            </Card>
          </div>
          <div className="space-y-[var(--s3)]">
            <Card>
              <CardHeader title="Upcoming milestones" subtitle="Next 14 days" />
              {milestones.length === 0 ? <EmptyState title="No milestones due" className="py-6" /> : (
                <div className="px-2 pb-2">
                  {milestones.map((m) => (
                    <Link key={m.id} href={`/projects/${m.project_id}?tab=milestones`} className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
                      <span className="w-2 h-2 rotate-45 bg-[var(--violet)] shrink-0" />
                      <div className="min-w-0 flex-1"><div className="text-sm truncate">{m.title}</div><div className="text-[11px] text-muted truncate">{m.project?.name}</div></div>
                      <span className="text-xs num text-muted">{relDate(m.due_date)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Meetings today" />
              {meetings.length === 0 ? <EmptyState title="No meetings today" className="py-6" /> : (
                <div className="px-2 pb-2">
                  {meetings.map((m) => (
                    <Link key={m.id} href={`/meetings/${m.id}`} className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
                      <span className="text-xs num text-muted w-11">{fmtTime(m.starts_at)}</span><span className="text-sm truncate flex-1">{m.title}</span><Video size={14} className="text-muted" />
                    </Link>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Recent decisions" action={<Link href="/decisions" className="text-xs text-muted hover:text-[var(--fg)]">Register →</Link>} />
              {decisions.length === 0 ? <EmptyState title="No decisions recorded" className="py-6" /> : (
                <div className="px-2 pb-2">
                  {decisions.map((d) => (
                    <Link key={d.id} href={`/decisions/${d.id}`} className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
                      <div className="min-w-0 flex-1"><div className="text-sm truncate">{d.title}</div><div className="text-[11px] text-muted flex items-center gap-1"><PersonChip id={d.decided_by} size={14} /> · {ago(d.decided_at)}</div></div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Company pulse" subtitle="Outcomes, not surveillance" />
              <div className="px-[var(--s4)] pb-[var(--s3)] grid grid-cols-2 gap-y-2 text-sm">
                <PulseLine label="Tasks completed (7d)" value={pulse.tasks?.done_7d ?? 0} />
                <PulseLine label="Tasks created (7d)" value={pulse.tasks?.created_7d ?? 0} />
                <PulseLine label="Projects progressing" value={pulse.projects?.active ?? 0} />
                <PulseLine label="Projects at risk" value={(pulse.projects?.at_risk ?? 0) + (pulse.projects?.delayed ?? 0)} tone="text-warn" />
                <PulseLine label="Average delay" value={`${pulse.avg_delay_days ?? 0}d`} />
                <PulseLine label="Cross-dept waits" value={pulse.tasks?.waiting_dept ?? 0} />
                <PulseLine label="People active" value={pulse.people?.active ?? 0} />
                <PulseLine label="Overloaded" value={pulse.people?.overloaded ?? 0} tone="text-danger" />
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "projects" && (
        <div className="space-y-[var(--s3)]" key="pr">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead><tr className="text-left text-[11px] text-muted border-b"><th className="px-4 py-2 font-medium">Project</th><th className="px-3 py-2 font-medium">Department</th><th className="px-3 py-2 font-medium">Owner</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium w-40">Progress</th><th className="px-3 py-2 font-medium">Due</th></tr></thead>
                <tbody>
                  {projects.map((p) => {
                    const late = p.due_date && new Date(p.due_date) < new Date();
                    const dept = deptList.find((d) => d.id === p.department_id);
                    return (
                      <tr key={p.id} className="border-b last:border-0 row-hover cursor-pointer" onClick={() => router.push(`/projects/${p.id}`)}>
                        <td className="px-4 py-2.5 font-medium">{p.name}</td>
                        <td className="px-3 py-2.5 text-muted"><span className="inline-flex items-center gap-1.5">{dept && <span className="w-2 h-2 rounded-full" style={{ background: dept.color }} />}{dept?.name || "—"}</span></td>
                        <td className="px-3 py-2.5"><PersonChip id={p.owner_id} size={18} /></td>
                        <td className="px-3 py-2.5"><Pill tone={PROJECT_STATUS_TONE[p.status as ProjectStatus]}>{PROJECT_STATUS_LABEL[p.status as ProjectStatus]}</Pill></td>
                        <td className="px-3 py-2.5"><div className="flex items-center gap-2"><Progress value={p.progress} className="flex-1" height={5} /><span className="text-xs num text-muted w-8">{p.progress}%</span></div></td>
                        <td className={cn("px-3 py-2.5 num text-xs", late && "text-danger")}>{p.due_date ? relDate(p.due_date) : "—"}</td>
                      </tr>
                    );
                  })}
                  {projects.length === 0 && <tr><td colSpan={6}><EmptyState title="No active projects" /></td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === "workload" && (
        <div className="grid lg:grid-cols-3 gap-[var(--s3)]" key="wl">
          <Card className="lg:col-span-2">
            <CardHeader title="Employee workload" subtitle="Overloaded · Busy · Available · Underutilised · On leave" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead><tr className="text-left text-[11px] text-muted border-b"><th className="px-4 py-2 font-medium">Person</th><th className="px-3 py-2 font-medium">Load</th><th className="px-3 py-2 font-medium num">Open</th><th className="px-3 py-2 font-medium num">Urgent</th><th className="px-3 py-2 font-medium num">Overdue</th><th className="px-3 py-2 font-medium num">Blocked</th><th className="px-3 py-2 font-medium num">Due 7d</th><th className="px-3 py-2 font-medium num">Est. h</th></tr></thead>
                <tbody>
                  {workload.slice().sort((a, b) => b.open_tasks + b.urgent * 2 + b.overdue * 2 - (a.open_tasks + a.urgent * 2 + a.overdue * 2)).map((w) => {
                    const lv = loadLevel(w);
                    const dept = deptList.find((d) => d.id === w.department_id);
                    return (
                      <tr key={w.user_id} className="border-b last:border-0 row-hover cursor-pointer" onClick={() => router.push(`/people/${w.user_id}`)}>
                        <td className="px-4 py-2"><div className="flex items-center gap-2"><Avatar name={w.full_name} src={w.avatar_url} size={26} presence={w.presence} /><div className="min-w-0"><div className="truncate">{w.full_name}</div><div className="text-[11px] text-muted truncate">{w.designation || dept?.name || ""}</div></div></div></td>
                        <td className="px-3 py-2"><Pill tone={lv.tone}>{lv.label}</Pill></td>
                        <td className="px-3 py-2 num">{w.open_tasks}</td>
                        <td className={cn("px-3 py-2 num", w.urgent > 0 && "text-orange")}>{w.urgent}</td>
                        <td className={cn("px-3 py-2 num", w.overdue > 0 && "text-danger")}>{w.overdue}</td>
                        <td className={cn("px-3 py-2 num", w.blocked > 0 && "text-danger")}>{w.blocked}</td>
                        <td className="px-3 py-2 num">{w.due_week}</td>
                        <td className="px-3 py-2 num text-muted">{Number(w.est_hours || 0).toFixed(0)}</td>
                      </tr>
                    );
                  })}
                  {workload.length === 0 && <tr><td colSpan={8}><EmptyState title="No active people" /></td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardHeader title="Department workload" />
            <div className="px-[var(--s3)] pb-[var(--s3)] space-y-2">
              {departments.filter((d) => d.people > 0 || d.open_tasks > 0).map((d) => (
                <Link key={d.department_id} href={`/departments/${d.slug}`} className="block">
                  <div className="flex items-center justify-between text-sm"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: d.color }} />{d.name}</span><span className="text-xs text-muted num">{d.open_tasks} open · {d.people} people</span></div>
                  <Progress value={d.people ? Math.min(100, (d.open_tasks / (d.people * 8)) * 100) : 0} tone={d.color} className="mt-1" height={5} />
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "bottlenecks" && (
        <div className="grid lg:grid-cols-2 gap-[var(--s3)]" key="bn">
          <Card>
            <CardHeader title="Bottlenecks" subtitle="Detected from waiting-on data, approvals and dependencies" />
            {bottlenecks.length === 0 ? <EmptyState icon={<AlertTriangle size={18} />} title="No bottlenecks detected" className="py-8" /> : <div className="px-2 pb-2">{bottlenecks.map((b) => <BottleneckLine key={b.key} b={b} />)}</div>}
          </Card>
          <div className="space-y-[var(--s3)]">
            <Card>
              <CardHeader title="Open project risks" />
              {risks.length === 0 ? <EmptyState title="No open risks" className="py-6" /> : (
                <div className="px-2 pb-2">
                  {risks.map((r) => (
                    <Link key={r.id} href={`/projects/${r.project_id}?tab=risks`} className="flex items-start gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
                      <Pill tone={PRIORITY_TONE[r.severity as TaskPriority]}>{humanize(r.severity)}</Pill>
                      <div className="min-w-0 flex-1"><div className="text-sm">{r.title}</div><div className="text-[11px] text-muted">{r.project?.name}{r.mitigation ? ` · ${r.mitigation}` : ""}</div></div>
                      <PersonChip id={r.owner_id} size={18} showName={false} />
                    </Link>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Blocked & waiting tasks" subtitle={`${waiting.length} items`} />
              <div className="px-2 pb-2 max-h-[480px] overflow-y-auto">{waiting.slice(0, 40).map((t) => <TaskRow key={t.id} task={t} />)}</div>
            </Card>
          </div>
        </div>
      )}

      {tab === "approvals" && (
        <Card key="ap">
          <CardHeader title="All pending approvals" subtitle="Where decisions are stuck" action={<Link href="/approvals?tab=all" className="text-xs text-muted hover:text-[var(--fg)]">Approval Center →</Link>} />
          {approvals.length === 0 ? <EmptyState title="Nothing pending" className="py-8" /> : (
            <div className="px-2 pb-2">
              {groupBy(approvals, (a) => a.approver_id || "none").map(([approver, list]) => (
                <div key={approver} className="mb-2">
                  <div className="flex items-center gap-2 px-3 pt-2 pb-1"><PersonChip id={approver === "none" ? null : approver} size={18} /><span className="pill tone-neutral">{list.length}</span></div>
                  {list.map((a) => (
                    <Link key={a.id} href={`/approvals/${a.id}`} className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
                      <Pill tone="tone-violet">{humanize(a.type)}</Pill>
                      <div className="min-w-0 flex-1 text-sm truncate">{a.title}</div>
                      <span className={cn("text-[11px] num", Date.now() - new Date(a.created_at).getTime() > 48 * 3600e3 ? "text-danger" : "text-muted")}>{ago(a.created_at)}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "activity" && (
        <Card key="ac">
          <CardHeader title="Recent activity" subtitle="Company-wide audit trail" action={<Link href="/admin?tab=audit" className="text-xs text-muted hover:text-[var(--fg)]">Full audit log →</Link>} />
          {activity.length === 0 ? <EmptyState title="No activity yet" className="py-8" /> : (
            <div className="px-2 pb-2">
              {activity.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)]">
                  <PersonChip id={a.actor_id} size={22} showName={false} />
                  <div className="min-w-0 flex-1 text-sm"><PersonName id={a.actor_id} /> <span className="text-muted">{humanize(a.action.split(".")[1] || a.action)} {a.entity_type}</span> <Link href={activityLink(a)} className="link">{a.summary}</Link></div>
                  <span className="text-[11px] text-muted whitespace-nowrap">{ago(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function activityLink(a: Act) {
  if (a.entity_type === "task" && a.entity_id) return `/tasks/${a.entity_id}`;
  if (a.entity_type === "project" && a.entity_id) return `/projects/${a.entity_id}`;
  if (a.entity_type === "approval" && a.entity_id) return `/approvals/${a.entity_id}`;
  if (a.entity_type === "decision" && a.entity_id) return `/decisions/${a.entity_id}`;
  if (a.entity_type === "file" && a.entity_id) return `/files/${a.entity_id}`;
  if (a.entity_type === "profile" && a.entity_id) return `/people/${a.entity_id}`;
  return "#";
}

function PulseLine({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return <div className="flex items-center justify-between gap-2 border-b border-dashed py-1"><span className="text-xs text-muted">{label}</span><span className={cn("num font-medium", tone)}>{value}</span></div>;
}

function ListCard({ title, subtitle, href, items, icon, render, empty }: { title: string; subtitle?: string; href: string; items?: T[]; icon?: React.ReactNode; render?: React.ReactNode[]; empty?: string }) {
  const body = render ?? (items || []).slice(0, 8).map((t) => <TaskRow key={t.id} task={t} />);
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-1.5">{icon}{title}</span>} subtitle={subtitle} action={<Link href={href} className="text-xs text-muted hover:text-[var(--fg)]">All →</Link>} />
      {body.length === 0 ? <EmptyState title={empty || "Nothing here"} className="py-6" /> : <div className="px-2 pb-2">{body}</div>}
    </Card>
  );
}

function ProjectLine({ p }: { p: Proj }) {
  const late = p.due_date && new Date(p.due_date) < new Date();
  return (
    <Link href={`/projects/${p.id}`} className="flex items-center gap-3 px-3 py-2 row-hover rounded-[var(--radius-sm)]">
      <div className="min-w-0 flex-1"><div className="text-sm truncate">{p.name}</div><div className="text-[11px] text-muted flex items-center gap-2"><Pill tone={PROJECT_STATUS_TONE[p.status as ProjectStatus]}>{PROJECT_STATUS_LABEL[p.status as ProjectStatus]}</Pill>{p.due_date && <span className={late ? "text-danger" : ""}>{late ? "late" : "due"} {relDate(p.due_date)}</span>}</div></div>
      <span className="text-xs num text-muted">{p.progress}%</span>
      <PersonChip id={p.owner_id} size={18} showName={false} />
    </Link>
  );
}

export type Bottleneck = { key: string; severity: "high" | "medium"; title: string; detail: string; href: string; personId?: string | null };

function BottleneckLine({ b }: { b: Bottleneck }) {
  return (
    <Link href={b.href} className="flex items-start gap-3 px-3 py-2.5 row-hover rounded-[var(--radius-sm)]">
      <span className={cn("mt-1 w-2 h-2 rounded-full shrink-0", b.severity === "high" ? "bg-[var(--danger)]" : "bg-[var(--warn)]")} />
      <div className="min-w-0 flex-1">
        <div className="text-sm flex items-center gap-2">{b.personId && <PersonChip id={b.personId} size={18} showName={false} />}<span className="truncate">{b.title}</span></div>
        <div className="text-[11px] text-muted">{b.detail}</div>
      </div>
    </Link>
  );
}

/** Rule-based bottleneck detection (Phase 2 adds AI on top). */
export function detectBottlenecks(ctx: { approvals: Appr[]; waiting: T[]; overdue: T[]; deps: Dep[]; workload: WorkloadRow[]; people: { id: string; full_name: string; department_id: string | null }[]; departments: { id: string; name: string; slug: string }[] }): Bottleneck[] {
  const out: Bottleneck[] = [];
  const name = (id?: string | null) => ctx.people.find((p) => p.id === id)?.full_name || "Unassigned";
  const deptOf = (id?: string | null) => ctx.people.find((p) => p.id === id)?.department_id || null;
  const deptName = (id?: string | null) => ctx.departments.find((d) => d.id === id)?.name || "Unknown dept";

  // 1. Approver piles
  for (const [approver, list] of groupBy(ctx.approvals, (a) => a.approver_id || "none")) {
    if (approver === "none" || list.length < 3) continue;
    const stale = list.filter((a) => Date.now() - new Date(a.created_at).getTime() > 48 * 3600e3).length;
    out.push({ key: "appr-" + approver, severity: list.length >= 6 || stale >= 3 ? "high" : "medium", title: `${list.length} approvals waiting for ${name(approver)}`, detail: stale ? `${stale} older than 48 hours` : "Consider delegating approvals", href: "/approvals?tab=all", personId: approver });
  }
  // 2. People everyone waits on
  for (const [uid, list] of groupBy(ctx.waiting.filter((t) => t.waiting_on_user_id), (t) => t.waiting_on_user_id!)) {
    if (list.length < 3) continue;
    out.push({ key: "wait-" + uid, severity: list.length >= 5 ? "high" : "medium", title: `${list.length} tasks waiting on ${name(uid)}`, detail: list.slice(0, 3).map((t) => t.title).join(" · "), href: `/people/${uid}`, personId: uid });
  }
  // 3. Department repeatedly waiting on another department
  const pairs = new Map<string, T[]>();
  for (const t of ctx.waiting) {
    if (!t.waiting_on_user_id || !t.department_id) continue;
    const other = deptOf(t.waiting_on_user_id);
    if (!other || other === t.department_id) continue;
    const k = t.department_id + "→" + other;
    pairs.set(k, [...(pairs.get(k) || []), t]);
  }
  for (const [k, list] of pairs) {
    if (list.length < 2) continue;
    const [a, b] = k.split("→");
    out.push({ key: "pair-" + k, severity: list.length >= 4 ? "high" : "medium", title: `${deptName(a)} repeatedly waiting on ${deptName(b)}`, detail: `${list.length} handoffs stuck`, href: `/departments/${ctx.departments.find((d) => d.id === b)?.slug || ""}` });
  }
  // 4. Overdue tasks that block others
  const blocking = new Map<string, number>();
  for (const d of ctx.deps) blocking.set(d.depends_on_id, (blocking.get(d.depends_on_id) || 0) + 1);
  for (const t of ctx.overdue) {
    const n = blocking.get(t.id) || 0;
    if (n >= 1) out.push({ key: "dep-" + t.id, severity: n >= 2 ? "high" : "medium", title: `Overdue "${t.title}" blocks ${n} other task${n > 1 ? "s" : ""}`, detail: `${name(t.assignee_id)} · ${t.project?.name || "No project"}`, href: `/tasks/${t.id}`, personId: t.assignee_id });
  }
  // 5. Overloaded people
  for (const w of ctx.workload) {
    const lv = loadLevel(w);
    if (lv.label === "Overloaded") out.push({ key: "load-" + w.user_id, severity: w.overdue >= 3 ? "high" : "medium", title: `${w.full_name} is overloaded`, detail: `${w.open_tasks} open · ${w.urgent} urgent · ${w.overdue} overdue`, href: `/people/${w.user_id}`, personId: w.user_id });
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}

function groupBy<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const it of items) m.set(key(it), [...(m.get(key(it)) || []), it]);
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
}

