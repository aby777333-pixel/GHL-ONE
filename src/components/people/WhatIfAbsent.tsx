"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ShieldAlert, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, Input, Pill, Skeleton } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { cn, fmtDate, relDate } from "@/lib/utils";
import { addDaysLocal, bool, jsonArr, jsonObj, localDay, num, str, strArr } from "@/components/intel/lib";

export type WhatIf = {
  person: string; forbidden: boolean;
  responsibilities: { name: string; critical: boolean; backup: string | null; backupId: string | null; backupAway: boolean }[];
  tasksDue: { id: string; title: string; due: string | null; priority: string }[];
  blockedOthers: { id: string; title: string; assignee: string }[];
  dependencies: number; meetings: { id: string; title: string; at: string }[]; approvals: number; leaves: number; help: number; reports: number; onDuty: string[]; projects: { id: string; name: string }[]; commitments: number;
  delegation: { to: string; kinds: string[] } | null; suggestedBackup: { id: string; name: string } | null;
};

export function parseWhatIf(j: Parameters<typeof jsonObj>[0]): WhatIf {
  const o = jsonObj(j);
  const d = jsonObj(o.delegation); const sb = jsonObj(o.suggested_backup);
  return {
    person: str(o.person), forbidden: str(o.error) === "forbidden",
    responsibilities: jsonArr(o.responsibilities).map((r) => ({ name: str(r.name), critical: bool(r.critical), backup: typeof r.backup === "string" ? r.backup : null, backupId: typeof r.backup_id === "string" ? r.backup_id : null, backupAway: bool(r.backup_away) })),
    tasksDue: jsonArr(o.tasks_due).map((t) => ({ id: str(t.id), title: str(t.title), due: typeof t.due === "string" ? t.due : null, priority: str(t.priority) })),
    blockedOthers: jsonArr(o.blocked_others).map((t) => ({ id: str(t.id), title: str(t.title), assignee: str(t.assignee) })),
    dependencies: num(o.dependencies), meetings: jsonArr(o.meetings_organized).map((m) => ({ id: str(m.id), title: str(m.title), at: str(m.at) })),
    approvals: num(o.approvals_pending), leaves: num(o.leaves_to_approve), help: num(o.help_requests_owned), reports: num(o.direct_reports), onDuty: strArr(o.on_duty),
    projects: jsonArr(o.projects_owned).map((p) => ({ id: str(p.id), name: str(p.name) })), commitments: num(o.commitments_due),
    delegation: str(d.to) ? { to: str(d.to), kinds: strArr(d.kinds) } : null, suggestedBackup: str(sb.id) ? { id: str(sb.id), name: str(sb.name) } : null,
  };
}

/** "What breaks if this person is away from X to Y?" — responsibilities without backup, deadlines, people blocked, approvals, meetings, suggested backup. */
export function WhatIfAbsent({ userId, from: initialFrom, to: initialTo, title = "What if they are away?", fixedRange, compact }: { userId: string; from?: string; to?: string; title?: string; fixedRange?: boolean; compact?: boolean }) {
  const [from, setFrom] = React.useState(() => initialFrom || localDay());
  const [to, setTo] = React.useState(() => initialTo || addDaysLocal(initialFrom || localDay(), 4));
  const [data, setData] = React.useState<{ key: string; w: WhatIf } | null>(null);
  const key = `${userId}:${from}:${to}`;
  React.useEffect(() => {
    if (!from || !to) return;
    let alive = true;
    createClient().rpc("what_if_absent", { p_user: userId, p_from: from, p_to: to }).then(({ data: j }) => { if (alive) setData({ key, w: parseWhatIf(j) }); });
    return () => { alive = false; };
  }, [userId, from, to, key]);
  const w = data?.key === key ? data.w : null;
  const noBackup = w ? w.responsibilities.filter((r) => !r.backupId || r.backupAway) : [];
  const risk = w ? (noBackup.some((r) => r.critical) || w.blockedOthers.length > 2 || w.onDuty.length > 0 ? "high" : noBackup.length || w.tasksDue.length > 2 || w.approvals > 0 ? "medium" : "low") : null;

  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><UserX size={15} /> {title}</span>}
        subtitle={w && !w.forbidden ? <span className="inline-flex items-center gap-1.5">Risk <Pill tone={risk === "high" ? "tone-danger" : risk === "medium" ? "tone-warn" : "tone-success"} className="capitalize">{risk}</Pill> for {fmtDate(from)} → {fmtDate(to)}</span> : "Responsibilities, deadlines, approvals and people who would be blocked"}
        action={!fixedRange ? <span className="flex items-center gap-1"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!h-8 !text-xs !w-auto" /><span className="text-muted text-xs">→</span><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="!h-8 !text-xs !w-auto" /></span> : undefined}
      />
      <div className="px-[var(--s4)] pb-[var(--s4)]">
        {!w ? <div className="space-y-2"><Skeleton /><Skeleton /><Skeleton /></div> : w.forbidden ? <div className="text-sm text-muted">Only the person, their manager and leadership can see this.</div> : (
          <div className="space-y-3 text-sm">
            {noBackup.length > 0 ? (
              <div>
                <div className="eyebrow text-danger mb-1 inline-flex items-center gap-1"><ShieldAlert size={12} /> Responsibilities without cover</div>
                <ul className="space-y-1">{noBackup.map((r) => <li key={r.name} className="flex items-center gap-2 flex-wrap"><span className={cn(r.critical && "font-medium")}>{r.name}</span>{r.critical && <Pill tone="tone-danger">Critical</Pill>}{r.backupId ? <span className="text-xs text-warn">backup {r.backup} is also away</span> : <span className="text-xs text-muted">no backup</span>}</li>)}</ul>
              </div>
            ) : w.responsibilities.length > 0 ? <div className="text-xs text-success inline-flex items-center gap-1"><CheckCircle2 size={12} /> All {w.responsibilities.length} responsibilities have a backup who is available.</div> : null}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Tasks due" value={w.tasksDue.length} warn={w.tasksDue.length > 2} />
              <Stat label="People blocked" value={w.blockedOthers.length} warn={w.blockedOthers.length > 0} />
              <Stat label="Approvals pending" value={w.approvals + w.leaves} warn={w.approvals + w.leaves > 0} />
              <Stat label="Help requests" value={w.help} warn={w.help > 0} />
            </div>

            {!compact && w.tasksDue.length > 0 && (
              <div><div className="eyebrow mb-1">Deadlines in the window</div><ul className="space-y-0.5">{w.tasksDue.slice(0, 6).map((t) => <li key={t.id} className="flex items-center gap-2"><Link href={`/tasks/${t.id}`} className="truncate hover:underline flex-1 min-w-0">{t.title}</Link>{t.due && <span className="text-[11px] text-muted num">{relDate(t.due)}</span>}</li>)}{w.tasksDue.length > 6 && <li className="text-xs text-muted">+{w.tasksDue.length - 6} more</li>}</ul></div>
            )}
            {!compact && w.blockedOthers.length > 0 && (
              <div><div className="eyebrow mb-1">Others waiting on them</div><ul className="space-y-0.5">{w.blockedOthers.slice(0, 5).map((t) => <li key={t.id} className="flex items-center gap-2"><Link href={`/tasks/${t.id}`} className="truncate hover:underline flex-1 min-w-0">{t.title}</Link><span className="text-[11px] text-muted">{t.assignee}</span></li>)}</ul></div>
            )}
            {(w.meetings.length > 0 || w.onDuty.length > 0 || w.projects.length > 0 || w.reports > 0 || w.commitments > 0 || w.dependencies > 0) && (
              <div className="text-xs text-muted flex flex-wrap gap-x-3 gap-y-1">
                {w.meetings.length > 0 && <span>{w.meetings.length} meeting{w.meetings.length > 1 ? "s" : ""} they organise</span>}
                {w.onDuty.length > 0 && <span className="text-warn">On duty for {w.onDuty.join(", ")}</span>}
                {w.projects.length > 0 && <span>{w.projects.length} project{w.projects.length > 1 ? "s" : ""} owned</span>}
                {w.reports > 0 && <span>{w.reports} direct report{w.reports > 1 ? "s" : ""}</span>}
                {w.commitments > 0 && <span>{w.commitments} promise{w.commitments > 1 ? "s" : ""} due</span>}
                {w.dependencies > 0 && <span>{w.dependencies} dependent task{w.dependencies > 1 ? "s" : ""}</span>}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t text-xs">
              {w.delegation ? <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} className="text-success" /> Delegation active → {w.delegation.to} ({w.delegation.kinds.join(", ")})</span> : <span className="inline-flex items-center gap-1 text-warn"><AlertTriangle size={12} /> No delegation set up</span>}
              {w.suggestedBackup && <span className="inline-flex items-center gap-1">· Suggested backup <PersonChip id={w.suggestedBackup.id} size={14} /></span>}
              <Link href={`/people/${userId}#delegation`} className="ml-auto"><Button size="xs" variant="secondary">Set up delegation</Button></Link>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return <div className="rounded-[var(--radius-sm)] sunken px-2.5 py-1.5"><div className="text-[10px] uppercase tracking-wide text-muted">{label}</div><div className={cn("text-lg num font-semibold leading-tight", warn && value > 0 && "text-warn")}>{value}</div></div>;
}
