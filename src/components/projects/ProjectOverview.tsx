"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Compass, Diamond, Gavel, HelpCircle, Hourglass, Lock, Target, UserRound } from "lucide-react";
import { Pill, Stat } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip, TaskRow } from "@/components/tasks/TaskBits";
import type { ProjectRoomData } from "@/components/projects/ProjectRoom";
import { ProjectAITeaser } from "@/components/ai/ProjectSummary";
import { cn, relDate, PROJECT_STATUS_LABEL, WAITING_LABEL, APPROVAL_STATUS_LABEL } from "@/lib/utils";

type Stats = { total: number; done: number; open: number; overdue: number; blocked: number; waiting: number; progress: number };

function Ring({ value, size = 96, stroke = 9, tone }: { value: number; size?: number; stroke?: number; tone: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .6s ease" }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="num" style={{ fontSize: size * 0.22, fontWeight: 600, fill: "var(--fg)" }}>{value}%</text>
    </svg>
  );
}

export function ProjectOverview({ data, stats, onGo }: { data: ProjectRoomData; stats: Stats; onGo: (tab: string) => void }) {
  const { people } = useSession();
  const { project } = data;
  const [now] = React.useState(() => Date.now());
  const top = data.tasks.filter((t) => !t.parent_id && t.status !== "cancelled");
  const late = top.filter((t) => t.status !== "done" && t.due_date && new Date(t.due_date).getTime() < now).sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
  const stuck = top.filter((t) => t.status === "blocked" || t.status === "waiting");
  const upcoming = data.milestones.filter((m) => !m.completed_at).sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999")).slice(0, 4);
  const lateMilestones = data.milestones.filter((m) => !m.completed_at && m.due_date && new Date(m.due_date).getTime() < now);
  const pending = data.approvals.filter((a) => a.status === "pending");

  // Bottleneck = person with most overdue + waiting-on tasks
  const score = new Map<string, number>();
  for (const t of late) if (t.assignee_id) score.set(t.assignee_id, (score.get(t.assignee_id) || 0) + 2);
  for (const t of stuck) {
    const who = t.waiting_on_user_id || t.assignee_id;
    if (who) score.set(who, (score.get(who) || 0) + 1);
  }
  const bottleneck = [...score.entries()].sort((a, b) => b[1] - a[1])[0];
  const bottleneckPerson = bottleneck ? people.find((p) => p.id === bottleneck[0]) : null;

  // Why: group stuck tasks by reason
  const reasons = new Map<string, number>();
  for (const t of stuck) reasons.set(WAITING_LABEL[t.waiting_on], (reasons.get(WAITING_LABEL[t.waiting_on]) || 0) + 1);

  const healthy = late.length === 0 && stats.blocked === 0 && lateMilestones.length === 0;
  const ringTone = stats.progress === 100 ? "var(--success)" : healthy ? "var(--brand)" : "var(--warn)";
  const objectives = (project.objectives || "").split("\n").map((s) => s.trim()).filter(Boolean);

  const nextDecision = pending[0]
    ? { label: `Approve “${pending[0].title}”`, sub: `Waiting on ${people.find((p) => p.id === pending[0]!.approver_id)?.full_name || "approver"} · ${APPROVAL_STATUS_LABEL[pending[0].status]}`, href: `/approvals/${pending[0].id}` }
    : stats.blocked > 0
      ? { label: `Unblock ${stats.blocked} blocked task${stats.blocked > 1 ? "s" : ""}`, sub: bottleneckPerson ? `Start with ${bottleneckPerson.full_name.split(" ")[0]}` : "Review the blocked list", tab: "tasks" }
      : upcoming[0]
        ? { label: `Milestone: ${upcoming[0].title}`, sub: upcoming[0].due_date ? `Due ${relDate(upcoming[0].due_date)}` : "No date set", tab: "milestones" }
        : { label: "No decision pending", sub: "Keep shipping — the project is on track.", tab: "tasks" };

  return (
    <div className="grid gap-[var(--s4)] lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <div className="space-y-[var(--s4)] min-w-0">
        {/* Executive panel */}
        <section className="card p-[var(--s4)]">
          <div className="flex items-center gap-2 mb-3"><Compass size={15} className="text-muted" /><span className="h3">Executive summary</span>{!healthy && <Pill tone="tone-warn"><AlertTriangle size={10} /> Needs attention</Pill>}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ExecItem icon={<Target size={14} />} title="Where are we">
              <div className="text-sm">{PROJECT_STATUS_LABEL[project.status]} · <span className="num">{stats.progress}%</span> complete ({stats.done}/{stats.total} tasks)</div>
              <div className="text-xs text-muted mt-0.5">{project.due_date ? `Due ${relDate(project.due_date)}` : "No due date set"}{upcoming[0] ? ` · next milestone “${upcoming[0].title}”${upcoming[0].due_date ? ` ${relDate(upcoming[0].due_date)}` : ""}` : ""}</div>
            </ExecItem>
            <ExecItem icon={<AlertTriangle size={14} />} title="What's late" tone={late.length || lateMilestones.length ? "text-danger" : undefined}>
              {late.length === 0 && lateMilestones.length === 0 ? <div className="text-sm">Nothing is late.</div> : (
                <ul className="text-sm space-y-0.5">
                  {lateMilestones.slice(0, 2).map((m) => <li key={m.id} className="truncate"><Diamond size={10} className="inline mr-1 text-[var(--accent)]" fill="currentColor" />{m.title} · {relDate(m.due_date)}</li>)}
                  {late.slice(0, 3).map((t) => <li key={t.id} className="truncate"><Link href={`/tasks/${t.id}`} className="hover:underline">{t.title}</Link> <span className="text-xs text-muted">· {relDate(t.due_date)}{t.assignee_id ? ` · ${people.find((p) => p.id === t.assignee_id)?.full_name.split(" ")[0] || ""}` : ""}</span></li>)}
                  {late.length > 3 && <li className="text-xs text-muted">+{late.length - 3} more overdue</li>}
                </ul>
              )}
            </ExecItem>
            <ExecItem icon={<HelpCircle size={14} />} title="Why">
              {stuck.length === 0 ? <div className="text-sm">No blockers reported. {late.length ? "Late items are simply behind schedule." : ""}</div> : (
                <ul className="text-sm space-y-0.5">
                  {[...reasons.entries()].map(([r, n]) => <li key={r}>{n} × {r.toLowerCase()}</li>)}
                  {stuck.filter((t) => t.waiting_note).slice(0, 2).map((t) => <li key={t.id} className="text-xs text-muted truncate">“{t.waiting_note}”</li>)}
                </ul>
              )}
            </ExecItem>
            <ExecItem icon={<UserRound size={14} />} title="Who owns it">
              <div className="flex items-center gap-2 text-sm"><span className="text-muted text-xs">Owner</span><PersonChip id={project.owner_id} /></div>
              {bottleneckPerson && <div className="flex items-center gap-2 text-sm mt-1"><span className="text-muted text-xs">Bottleneck</span><PersonChip id={bottleneckPerson.id} /><span className="text-xs text-muted num">{bottleneck![1]} pts</span></div>}
            </ExecItem>
            <ExecItem icon={<Gavel size={14} />} title="Next decision" className="sm:col-span-2">
              {nextDecision.href ? (
                <Link href={nextDecision.href} className="text-sm link inline-flex items-center gap-1">{nextDecision.label} <ArrowRight size={13} /></Link>
              ) : (
                <button className="text-sm link inline-flex items-center gap-1" onClick={() => onGo(nextDecision.tab!)}>{nextDecision.label} <ArrowRight size={13} /></button>
              )}
              <div className="text-xs text-muted mt-0.5">{nextDecision.sub}</div>
            </ExecItem>
          </div>
        </section>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Open" value={stats.open} onClick={() => onGo("tasks")} />
          <Stat label="Overdue" value={stats.overdue} tone={stats.overdue ? "text-danger" : undefined} icon={<AlertTriangle size={14} />} onClick={() => onGo("tasks")} />
          <Stat label="Blocked" value={stats.blocked} tone={stats.blocked ? "text-danger" : undefined} icon={<Lock size={14} />} onClick={() => onGo("tasks")} />
          <Stat label="Waiting" value={stats.waiting} tone={stats.waiting ? "text-warn" : undefined} icon={<Hourglass size={14} />} onClick={() => onGo("tasks")} />
        </div>

        {/* Stuck / late tasks */}
        {(stuck.length > 0 || late.length > 0) && (
          <section className="card">
            <div className="px-[var(--s4)] pt-[var(--s3)] pb-[var(--s2)] h3">Needs attention</div>
            <div className="p-1 divide-y">
              {[...new Map([...late, ...stuck].map((t) => [t.id, t])).values()].slice(0, 8).map((t) => <TaskRow key={t.id} task={t} showProject={false} />)}
            </div>
          </section>
        )}
      </div>

      <aside className="space-y-[var(--s3)] min-w-0">
        <ProjectAITeaser projectId={project.id} onOpen={() => onGo("ai")} />
        <section className="card p-[var(--s4)] flex items-center gap-4">
          <Ring value={stats.progress} tone={ringTone} />
          <div className="min-w-0">
            <div className="h3">Progress</div>
            <div className="text-xs text-muted mt-0.5">{stats.done} done · {stats.open} open</div>
            <div className={cn("text-xs mt-1.5 font-medium", healthy ? "text-success" : "text-warn")}>{healthy ? "Healthy" : `${late.length} late · ${stats.blocked} blocked`}</div>
          </div>
        </section>

        <section className="card p-[var(--s4)]">
          <div className="flex items-center gap-2 mb-2"><Target size={14} className="text-muted" /><span className="h3">Objectives</span></div>
          {objectives.length === 0 ? <div className="text-xs text-muted">No objectives yet. Add them via Edit so everyone knows what success looks like.</div> : (
            <ul className="space-y-1.5">
              {objectives.map((o, i) => <li key={i} className="flex gap-2 text-sm"><span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-2)] mt-2 shrink-0" /><span>{o.replace(/^[-*•]\s*/, "")}</span></li>)}
            </ul>
          )}
        </section>

        <section className="card p-[var(--s4)]">
          <div className="flex items-center justify-between mb-2"><span className="flex items-center gap-2"><Diamond size={14} className="text-muted" /><span className="h3">Upcoming milestones</span></span><button className="text-xs link" onClick={() => onGo("milestones")}>All</button></div>
          {upcoming.length === 0 ? <div className="text-xs text-muted">No open milestones.</div> : (
            <ul className="space-y-1.5">
              {upcoming.map((m) => {
                const lateM = m.due_date && new Date(m.due_date).getTime() < now;
                return <li key={m.id} className="flex items-center gap-2 text-sm"><Diamond size={12} className={lateM ? "text-[var(--danger)]" : "text-[var(--accent)]"} fill="currentColor" /><span className="truncate flex-1">{m.title}</span><span className={cn("text-xs num", lateM ? "text-danger" : "text-muted")}>{m.due_date ? relDate(m.due_date) : "—"}</span></li>;
              })}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function ExecItem({ icon, title, children, tone, className }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: string; className?: string }) {
  return (
    <div className={cn("rounded-[var(--radius-sm)] sunken p-3 min-w-0", className)}>
      <div className={cn("eyebrow flex items-center gap-1.5 mb-1", tone)}>{icon}{title}</div>
      {children}
    </div>
  );
}
