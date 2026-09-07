"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart3, MessagesSquare, ShieldOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, EmptyState, PageHeader, Select, Skeleton, Stat } from "@/components/ui";
import { cn } from "@/lib/utils";
import { AssigneeAvatar } from "./ConnectBits";
import { CHANNEL_LABEL, humanizeKey, type ConnectDashboardData, type InboxLite } from "./lib";

function mins(n: number | null | undefined) {
  if (n == null) return "—";
  if (n < 60) return `${n}m`;
  const h = Math.floor(n / 60);
  return h < 48 ? `${h}h ${n % 60}m` : `${Math.round(h / 24)}d`;
}

/** Manager view of `connect_dashboard(p_inbox, p_days)`. Counts and timings only — no rankings or scores. */
export function ConnectDashboard({ inboxes }: { inboxes: InboxLite[] }) {
  const [inbox, setInbox] = React.useState("");
  const [days, setDays] = React.useState(7);
  const [data, setData] = React.useState<ConnectDashboardData | null | undefined>(undefined);

  React.useEffect(() => {
    let alive = true;
    createClient().rpc("connect_dashboard", { p_inbox: inbox || undefined, p_days: days }).then(({ data }) => alive && setData((data as unknown as ConnectDashboardData) || null));
    return () => {
      alive = false;
    };
  }, [inbox, days]);

  const filters = (
    <div className="flex items-center gap-2">
      <Select value={inbox} onChange={(e) => setInbox(e.target.value)} className="!w-auto" aria-label="Inbox">
        <option value="">All inboxes</option>
        {inboxes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </Select>
      <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="!w-auto" aria-label="Period">
        <option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option>
      </Select>
      <Link href="/connect" className="btn btn-secondary btn-sm"><MessagesSquare size={14} /> Inbox</Link>
    </div>
  );

  if (data === undefined) {
    return (
      <div className="page">
        <PageHeader eyebrow="GHL Connect" title="Dashboard" actions={filters} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-[var(--s3)]">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      </div>
    );
  }
  if (!data || data.error) {
    return (
      <div className="page page-narrow">
        <PageHeader eyebrow="GHL Connect" title="Dashboard" />
        <Card><EmptyState icon={<ShieldOff size={20} />} title="The dashboard is for supervisors and managers" hint="Ask your manager to add you as an inbox supervisor if you need it." /></Card>
      </div>
    );
  }

  const channelMax = Math.max(1, ...Object.values(data.by_channel));
  const dispMax = Math.max(1, ...Object.values(data.dispositions));

  return (
    <div className="page">
      <PageHeader eyebrow="GHL Connect" title="Dashboard" subtitle="How the shared inboxes are doing right now, and over the period." actions={filters} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[var(--s3)] stagger">
        <Stat label="Open" value={data.open} sub={`${data.pending} pending · ${data.snoozed} snoozed`} />
        <Stat label="Unassigned" value={data.unassigned} tone={data.unassigned > 0 ? "text-warn" : undefined} sub="waiting for someone to claim" />
        <Stat label="SLA breached" value={data.breached} tone={data.breached > 0 ? "text-danger" : undefined} sub="open or pending, past first-reply SLA" />
        <Stat label="VIP waiting" value={data.vip_waiting} tone={data.vip_waiting > 0 ? "text-warn" : undefined} sub="unread from VIP contacts" />
        <Stat label="Oldest waiting" value={mins(data.oldest_waiting_minutes)} sub="unread, still unanswered" />
        <Stat label={`New · ${days}d`} value={data.new_in_period} sub={`${data.resolved_in_period} resolved`} />
        <Stat label="Avg first reply" value={mins(data.avg_first_reply_minutes)} sub={`over ${days} days`} />
        <Stat label="Promises overdue" value={data.promises_overdue} tone={data.promises_overdue > 0 ? "text-danger" : undefined} sub="to contacts, company-wide" />
      </div>

      <div className="grid md:grid-cols-2 gap-[var(--s3)] mt-[var(--s3)]">
        <Card>
          <CardHeader title="By channel" subtitle={`New conversations, last ${days} days`} />
          <Bars rows={Object.entries(data.by_channel).map(([k, v]) => [CHANNEL_LABEL[k] || k, v])} max={channelMax} />
        </Card>
        <Card>
          <CardHeader title="Outcomes" subtitle={`Resolved, last ${days} days`} />
          <Bars rows={Object.entries(data.dispositions).map(([k, v]) => [humanizeKey(k), v])} max={dispMax} />
        </Card>
      </div>

      <Card className="mt-[var(--s3)]">
        <CardHeader title="Agents" subtitle="Workload and activity — a picture of where help is needed, not a league table" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted border-y">
              <tr><th className="px-4 py-2 font-medium">Agent</th><th className="px-3 py-2 font-medium num">Open</th><th className="px-3 py-2 font-medium num">Resolved</th><th className="px-3 py-2 font-medium num">Replies</th><th className="px-3 py-2 font-medium num">Calls</th><th className="px-3 py-2 font-medium num">Breached</th><th className="px-3 py-2 font-medium num">Overdue follow-ups</th><th className="px-3 py-2 font-medium num">Overdue callbacks</th></tr>
            </thead>
            <tbody>
              {data.agents.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-muted text-sm">No inbox members yet. Add agents in Connect admin.</td></tr>}
              {data.agents.map((a) => (
                <tr key={a.user_id} className="border-b last:border-0">
                  <td className="px-4 py-2"><span className="inline-flex items-center gap-2"><AssigneeAvatar id={a.user_id} size={22} /> <Link href={`/people/${a.user_id}`} className="hover:underline">{a.name}</Link> <span className="text-[11px] text-muted">{a.presence}</span></span></td>
                  <td className="px-3 py-2 num">{a.open}</td>
                  <td className="px-3 py-2 num">{a.resolved}</td>
                  <td className="px-3 py-2 num">{a.replies}</td>
                  <td className="px-3 py-2 num">{a.calls}</td>
                  <td className={cn("px-3 py-2 num", a.breached > 0 && "text-danger")}>{a.breached}</td>
                  <td className={cn("px-3 py-2 num", a.overdue_follow_ups > 0 && "text-warn")}>{a.overdue_follow_ups}</td>
                  <td className={cn("px-3 py-2 num", a.overdue_callbacks > 0 && "text-warn")}>{a.overdue_callbacks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-[var(--s3)]">
        <CardHeader title="Inboxes" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted border-y">
              <tr><th className="px-4 py-2 font-medium">Inbox</th><th className="px-3 py-2 font-medium">Kind</th><th className="px-3 py-2 font-medium num">Open</th><th className="px-3 py-2 font-medium num">Unassigned</th><th className="px-3 py-2 font-medium num">Breached</th><th className="px-3 py-2 font-medium num">Members</th><th className="px-3 py-2 font-medium">Provider</th></tr>
            </thead>
            <tbody>
              {data.inboxes.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="px-4 py-2"><Link href={`/connect?inbox=${i.id}`} className="hover:underline">{i.name}</Link></td>
                  <td className="px-3 py-2 text-xs">{CHANNEL_LABEL[i.kind] || i.kind}</td>
                  <td className="px-3 py-2 num">{i.open}</td>
                  <td className={cn("px-3 py-2 num", i.unassigned > 0 && "text-warn")}>{i.unassigned}</td>
                  <td className={cn("px-3 py-2 num", i.breached > 0 && "text-danger")}>{i.breached}</td>
                  <td className="px-3 py-2 num">{i.members}</td>
                  <td className="px-3 py-2 text-xs text-muted">{i.provider || "manual"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-[11px] text-muted mt-3 inline-flex items-center gap-1"><BarChart3 size={11} /> Numbers come from `connect_dashboard` and respect what you are allowed to see.</p>
    </div>
  );
}

function Bars({ rows, max }: { rows: [string, number][]; max: number }) {
  if (rows.length === 0) return <div className="px-[var(--s4)] pb-[var(--s3)] text-sm text-muted">Nothing in this period.</div>;
  return (
    <div className="px-[var(--s4)] pb-[var(--s3)] space-y-2">
      {rows.sort((a, b) => b[1] - a[1]).map(([label, n]) => (
        <div key={label} className="grid grid-cols-[110px_1fr_40px] items-center gap-2 text-xs">
          <span className="truncate">{label}</span>
          <div className="h-2 rounded-full sunken overflow-hidden"><div className="h-full rounded-full bg-[var(--brand-2)]" style={{ width: `${Math.round((n / max) * 100)}%` }} /></div>
          <span className="num text-right">{n}</span>
        </div>
      ))}
    </div>
  );
}
