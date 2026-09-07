"use client";

import Link from "next/link";
import { Stat } from "@/components/ui";
import { cn, healthScore } from "@/lib/utils";

export type Pulse = {
  tasks?: { open?: number; done_7d?: number; created_7d?: number; overdue?: number; critical?: number; blocked?: number; waiting_mgmt?: number; waiting_dept?: number };
  projects?: { active?: number; at_risk?: number; delayed?: number; total?: number };
  approvals?: { pending?: number; stale?: number };
  milestones_14d?: number;
  meetings_today?: number;
  avg_delay_days?: number;
  people?: { active?: number; overloaded?: number };
  error?: string;
};

export type DeptHealth = { department_id: string; name: string; color: string; slug: string; people: number; open_tasks: number; overdue: number; blocked: number; critical: number; projects: number; at_risk: number; pending_approvals: number };

export function deptScore(d: DeptHealth) {
  return healthScore([
    { weight: 3, bad: d.overdue, total: Math.max(d.open_tasks, 1) },
    { weight: 2, bad: d.blocked, total: Math.max(d.open_tasks, 1) },
    { weight: 2, bad: d.at_risk, total: Math.max(d.projects, 1) },
    { weight: 1, bad: d.pending_approvals, total: Math.max(d.open_tasks, 3) },
  ]);
}

export function scoreTone(s: number) {
  return s >= 80 ? "var(--success)" : s >= 60 ? "var(--warn)" : "var(--danger)";
}

/** Company Health Score with supporting indicators. */
export function computeHealth(p: Pulse, depts: DeptHealth[]) {
  const t = p.tasks || {};
  const pr = p.projects || {};
  const a = p.approvals || {};
  const open = Math.max(t.open ?? 0, 1);
  const byslug = (s: string) => depts.find((d) => d.slug === s);
  const dScore = (s: string) => { const d = byslug(s); return d ? deptScore(d) : 100; };
  const indicators = [
    { key: "projects", label: "Projects", score: healthScore([{ weight: 1, bad: (pr.at_risk ?? 0) + (pr.delayed ?? 0), total: Math.max(pr.total ?? 0, 1) }]) },
    { key: "delivery", label: "Delivery", score: healthScore([{ weight: 2, bad: t.overdue ?? 0, total: open }, { weight: 1, bad: t.blocked ?? 0, total: open }]) },
    { key: "sales", label: "Sales", score: dScore("sales") },
    { key: "support", label: "Support", score: dScore("support") },
    { key: "operations", label: "Operations", score: Math.round((dScore("operations") + dScore("technology")) / 2) },
    { key: "people", label: "People", score: healthScore([{ weight: 1, bad: p.people?.overloaded ?? 0, total: Math.max(p.people?.active ?? 0, 1) }]) },
    { key: "approvals", label: "Approvals", score: healthScore([{ weight: 1, bad: a.stale ?? 0, total: Math.max(a.pending ?? 0, 1) }]) },
    { key: "compliance", label: "Compliance", score: dScore("legal") },
  ];
  const score = Math.round(indicators.reduce((s, i) => s + i.score, 0) / indicators.length);
  const worst = [...indicators].sort((x, y) => x.score - y.score)[0];
  const headline = score >= 80 ? "Operating smoothly." : score >= 60 ? `Attention needed: ${worst.label.toLowerCase()} is the weakest area.` : `Action required: ${worst.label.toLowerCase()} is under pressure.`;
  return { score, indicators, headline };
}

export function HealthRing({ value, size = 80, stroke = 8, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(value);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.7,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-semibold num" style={{ fontSize: size * 0.28 }}>{value}</span>
        {label && <span className="text-[10px] text-muted">{label}</span>}
      </div>
    </div>
  );
}

export function PulseStrip({ pulse }: { pulse: Pulse }) {
  const t = pulse.tasks || {};
  const pr = pulse.projects || {};
  const a = pulse.approvals || {};
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-[var(--s2)] min-w-0">
      <Stat label="Active projects" value={pr.active ?? 0} sub={`${(pr.at_risk ?? 0) + (pr.delayed ?? 0)} at risk / delayed`} tone={(pr.at_risk ?? 0) + (pr.delayed ?? 0) > 0 ? "text-warn" : undefined} />
      <Stat label="Overdue tasks" value={t.overdue ?? 0} sub={`of ${t.open ?? 0} open`} tone={(t.overdue ?? 0) > 0 ? "text-danger" : undefined} />
      <Stat label="Blocked" value={t.blocked ?? 0} sub={`${t.waiting_dept ?? 0} waiting on others`} tone={(t.blocked ?? 0) > 0 ? "text-danger" : undefined} />
      <Stat label="Waiting on mgmt" value={t.waiting_mgmt ?? 0} sub="tasks & approvals" tone={(t.waiting_mgmt ?? 0) > 0 ? "text-warn" : undefined} />
      <Stat label="Pending approvals" value={a.pending ?? 0} sub={`${a.stale ?? 0} older than 48h`} tone={(a.stale ?? 0) > 0 ? "text-warn" : undefined} />
      <Stat label="Done this week" value={t.done_7d ?? 0} sub={`${t.created_7d ?? 0} created`} tone="text-success" />
    </div>
  );
}

export function DepartmentHealthGrid({ rows, compact }: { rows: DeptHealth[]; compact?: boolean }) {
  const list = compact ? rows.filter((d) => d.people > 0 || d.open_tasks > 0 || d.projects > 0) : rows;
  if (list.length === 0) return <div className="text-sm text-muted py-4 text-center">No department activity yet.</div>;
  return (
    <div className={cn("grid gap-[var(--s2)]", compact ? "grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
      {list.map((d) => {
        const s = deptScore(d);
        return (
          <Link key={d.department_id} href={`/departments/${d.slug}`} className="card card-hover p-3 flex items-center gap-3 min-w-0">
            <HealthRing value={s} size={44} stroke={5} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} /><span className="text-sm font-medium truncate">{d.name}</span></div>
              <div className="text-[11px] text-muted truncate">{d.people} people · {d.open_tasks} open{d.overdue ? ` · ${d.overdue} overdue` : ""}{d.blocked ? ` · ${d.blocked} blocked` : ""}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
