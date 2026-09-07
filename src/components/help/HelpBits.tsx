"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Building2, Check, Clock, MessageSquare } from "lucide-react";
import { Pill } from "@/components/ui";
import { Blink } from "@/components/providers/ActivityProvider";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip, PriorityPill } from "@/components/tasks/TaskBits";
import { ago, cn, relDate } from "@/lib/utils";
import { fmtRemaining, HELP_FLOW, HELP_STATUS_DOT, HELP_STATUS_LABEL, HELP_STATUS_TONE, isOverSla, slaRemaining, type HelpRequest, type HelpStatus } from "./lib";

/** Ticks once a minute so countdowns stay fresh without re-rendering constantly. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function HelpStatusPill({ status, size }: { status: HelpStatus; size?: "lg" }) {
  return <Pill tone={HELP_STATUS_TONE[status]} size={size}>{HELP_STATUS_LABEL[status]}</Pill>;
}

/** SLA countdown for unacknowledged requests; shows "acknowledged in Xm" once picked up. */
export function SlaCountdown({ r, now, className }: { r: Pick<HelpRequest, "status" | "ack_due_at" | "acknowledged_at" | "created_at">; now: number; className?: string }) {
  if (r.status !== "new") {
    if (!r.acknowledged_at) return null;
    const mins = Math.max(1, Math.round((new Date(r.acknowledged_at).getTime() - new Date(r.created_at).getTime()) / 60_000));
    return <span className={cn("inline-flex items-center gap-1 text-[11px] text-muted num", className)}><Check size={11} /> acknowledged in {mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`}</span>;
  }
  const rem = slaRemaining(r.ack_due_at, now);
  if (rem == null) return <span className={cn("inline-flex items-center gap-1 text-[11px] text-muted", className)}><Clock size={11} /> escalated</span>;
  const over = rem < 0;
  const soon = !over && rem < 60 * 60_000;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] num", over ? "text-danger font-medium" : soon ? "text-warn" : "text-muted", className)} title="Time left to acknowledge (SLA)">
      {over ? <AlertTriangle size={11} /> : <Clock size={11} />} {fmtRemaining(rem)}
    </span>
  );
}

/** Horizontal status stepper: new → accepted → working → completed, with declined / waiting as side states. */
export function StatusStepper({ status, className }: { status: HelpStatus; className?: string }) {
  const idx = status === "waiting" ? 2 : status === "declined" ? -1 : HELP_FLOW.indexOf(status);
  return (
    <div className={cn("flex items-center gap-0 w-full", className)}>
      {HELP_FLOW.map((s, i) => {
        const done = idx >= i;
        const current = idx === i && status !== "completed";
        const label = s === "working" && status === "waiting" ? "Waiting on requester" : HELP_STATUS_LABEL[s];
        return (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center min-w-0 flex-1">
              <span className={cn("w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-semibold ring-2 ring-[var(--bg-elev)] transition-colors", done ? "text-white" : "sunken text-muted")} style={done ? { background: status === "waiting" && i === 2 ? HELP_STATUS_DOT.waiting : HELP_STATUS_DOT[s] } : undefined}>
                {done && !current ? <Check size={12} /> : i + 1}
              </span>
              <span className={cn("text-[10px] mt-1 text-center leading-tight truncate max-w-full", done ? "text-2 font-medium" : "text-muted")}>{label}</span>
            </div>
            {i < HELP_FLOW.length - 1 && <span className={cn("h-px flex-1 -mt-4 min-w-3", idx > i ? "bg-[var(--brand-2)]" : "bg-[var(--line)]")} />}
          </React.Fragment>
        );
      })}
      {status === "declined" && <Pill tone="tone-muted" className="ml-3 shrink-0">Declined</Pill>}
    </div>
  );
}

export type HelpRow = Pick<HelpRequest, "id" | "title" | "status" | "priority" | "department_id" | "requester_id" | "owner_id" | "created_at" | "ack_due_at" | "acknowledged_at" | "deadline" | "channel_id" | "service_id">;

/** Compact list row used by My requests, the queue and the department portal. */
export function HelpRequestRow({ r, now, serviceName, showRequester = true, showDepartment = true, right, selected, onSelect, className }: { r: HelpRow; now: number; serviceName?: string | null; showRequester?: boolean; showDepartment?: boolean; right?: React.ReactNode; selected?: boolean; onSelect?: (v: boolean) => void; className?: string }) {
  const { departments } = useSession();
  const dept = departments.find((d) => d.id === r.department_id);
  const over = isOverSla(r, now);
  return (
    <div className={cn("flex items-start gap-3 px-[var(--s3)] py-2.5 row-hover", over && "bg-[var(--danger-bg)]", className)} style={over ? { boxShadow: "inset 3px 0 0 var(--danger)" } : undefined}>
      {onSelect && <input type="checkbox" className="accent-[var(--brand)] mt-1.5" checked={!!selected} onChange={(e) => onSelect(e.target.checked)} aria-label="Select" />}
      <div className="min-w-0 flex-1">
        <Link href={`/help/${r.id}`} className="flex items-center gap-1.5 min-w-0 hover:underline">
          <span className="text-sm font-medium truncate">{r.title}</span>
          <Blink zone={`help:${r.id}`} />
        </Link>
        <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[11px] text-muted mt-0.5">
          {showDepartment && dept && <span className="inline-flex items-center gap-1"><Building2 size={11} /> {dept.name}</span>}
          {serviceName && <span>· {serviceName}</span>}
          {showRequester && <span className="inline-flex items-center gap-1">· from <PersonChip id={r.requester_id} size={14} /></span>}
          <span>· {ago(r.created_at)}</span>
          {r.deadline && <span className="num">· needed {relDate(r.deadline)}</span>}
          <SlaCountdown r={r} now={now} />
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
        <PriorityPill priority={r.priority} />
        <HelpStatusPill status={r.status} />
        {r.owner_id ? <PersonChip id={r.owner_id} showName={false} size={22} /> : <span className="text-[11px] text-muted hidden sm:inline">unowned</span>}
        {r.channel_id && r.status !== "new" && (
          <Link href={`/chat/${r.channel_id}`} className="btn btn-ghost btn-xs btn-icon" title="Open conversation" aria-label="Open conversation"><MessageSquare size={14} /></Link>
        )}
        {right}
      </div>
    </div>
  );
}
