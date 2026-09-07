"use client";

import Link from "next/link";
import { AlertTriangle, CheckSquare, FolderKanban, Lock, Users } from "lucide-react";
import { Avatar } from "@/components/ui";
import { usePerson } from "@/components/providers/SessionProvider";
import { cn, healthScore } from "@/lib/utils";
import { Blink } from "@/components/providers/ActivityProvider";

export type DepartmentHealth = {
  department_id: string; name: string; color: string; slug: string; people: number; open_tasks: number; overdue: number; blocked: number; critical: number;
  projects: number; at_risk: number; pending_approvals: number; head_id: string | null; description: string | null;
};

export function departmentScore(d: DepartmentHealth) {
  return healthScore([
    { weight: 3, bad: d.overdue, total: d.open_tasks },
    { weight: 2, bad: d.blocked, total: d.open_tasks },
    { weight: 1, bad: d.critical, total: d.open_tasks },
    { weight: 2, bad: d.at_risk, total: d.projects },
    { weight: 1, bad: d.pending_approvals, total: Math.max(d.pending_approvals, 5) },
  ]);
}
export function scoreTone(score: number) {
  return score >= 80 ? "var(--success)" : score >= 55 ? "var(--warn)" : "var(--danger)";
}

export function HealthRing({ score, size = 56, stroke = 6 }: { score: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-label={`Health ${score}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .6s ease" }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" style={{ fontSize: size * 0.28, fontWeight: 600, fill: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>{score}</text>
    </svg>
  );
}

export function DepartmentCard({ d }: { d: DepartmentHealth }) {
  const head = usePerson(d.head_id);
  const score = departmentScore(d);
  return (
    <Link href={`/departments/${d.slug}`} className="card card-hover p-[var(--s4)] flex flex-col gap-3 min-w-0">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center text-white font-semibold shrink-0" style={{ background: d.color }}>{d.name.slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate flex items-center gap-2"><span className="truncate">{d.name}</span><Blink zone={`dept:${d.id}`} /></div>
          <div className="text-[11px] text-muted truncate">{head ? `Head: ${head.full_name}` : "No head assigned"}</div>
        </div>
        <HealthRing score={score} />
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <Cell icon={<Users size={12} />} label="People" value={d.people} />
        <Cell icon={<CheckSquare size={12} />} label="Open" value={d.open_tasks} />
        <Cell icon={<AlertTriangle size={12} />} label="Overdue" value={d.overdue} tone={d.overdue ? "text-danger" : undefined} />
        <Cell icon={<Lock size={12} />} label="Blocked" value={d.blocked} tone={d.blocked ? "text-danger" : undefined} />
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted flex-wrap mt-auto">
        <span className="inline-flex items-center gap-1"><FolderKanban size={12} /> {d.projects} project{d.projects !== 1 ? "s" : ""}</span>
        {d.at_risk > 0 && <span className="pill tone-warn">{d.at_risk} at risk</span>}
        {d.critical > 0 && <span className="pill tone-danger">{d.critical} critical</span>}
        {d.pending_approvals > 0 && <span className="pill tone-violet">{d.pending_approvals} approvals</span>}
        {head && <span className="ml-auto"><Avatar name={head.full_name} src={head.avatar_url} size={22} presence={head.presence} /></span>}
      </div>
    </Link>
  );
}

function Cell({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] sunken py-1.5 min-w-0">
      <div className={cn("text-base font-semibold num leading-tight", tone)}>{value}</div>
      <div className="text-[10px] text-muted inline-flex items-center gap-1 truncate">{icon}{label}</div>
    </div>
  );
}
