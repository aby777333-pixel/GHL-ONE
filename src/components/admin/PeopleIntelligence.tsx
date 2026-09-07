"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Info, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, EmptyState, PageHeader, Pill, Skeleton, Stat } from "@/components/ui";
import { Blink, useSeen } from "@/components/providers/ActivityProvider";
import { cn, fmtDate } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { fmtHours } from "@/components/attendance/attendanceUtils";
import { jsonArray, jsonObj, num, str } from "./people/lib";

const DAYS = [30, 60, 90] as const;

function Explain({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-muted flex items-start gap-1.5 px-[var(--s4)] pb-[var(--s3)]"><Info size={12} className="shrink-0 mt-0.5" /> <span>{children}</span></div>;
}

function PersonCell({ id, name, sub }: { id: string; name: string; sub?: React.ReactNode }) {
  return (
    <span className="min-w-0">
      <Link href={`/people/${id}`} className="inline-flex items-center gap-1.5 hover:underline">{name}<Blink zone={`user:${id}`} /></Link>
      {sub && <span className="block text-[11px] text-muted">{sub}</span>}
    </span>
  );
}

function Table({ head, rows, minWidth = 520 }: { head: { label: string; right?: boolean }[]; rows: React.ReactNode[][]; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="text-[11px] text-muted uppercase tracking-wide">
          <tr className="border-t border-b">{head.map((h, i) => <th key={i} className={cn("font-medium py-1.5", i === 0 ? "text-left px-[var(--s4)]" : h.right ? "text-right px-2 num" : "text-left px-2")}>{h.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => <tr key={i} className="row-hover">{r.map((c, j) => <td key={j} className={cn("py-1.5", j === 0 ? "px-[var(--s4)]" : head[j]?.right ? "px-2 text-right num" : "px-2")}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function PeopleIntelligence({ initial, initialDays }: { initial: Json | null; initialDays: number }) {
  useSeen("nav:/admin");
  const [days, setDays] = React.useState(initialDays);
  const [loaded, setLoaded] = React.useState<{ days: number; data: Json | null }>({ days: initialDays, data: initial });
  const loading = loaded.days !== days;

  React.useEffect(() => {
    if (days === loaded.days) return;
    let alive = true;
    createClient().rpc("people_intelligence", { p_days: days }).then(({ data }) => { if (alive) setLoaded({ days, data: data ?? null }); });
    return () => { alive = false; };
  }, [days, loaded.days]);

  const d = jsonObj(loaded.data);
  const forbidden = !loaded.data || !!d.error;
  const att = jsonObj(d.attendance);
  const departments = jsonArray(d.departments).map(jsonObj);
  const keyPerson = jsonArray(d.key_person_risk).map(jsonObj);
  const overload = jsonArray(d.overload).map(jsonObj);
  const attention = jsonArray(d.attention).map(jsonObj);
  const probation = jsonArray(d.probation).map(jsonObj);
  const leavePressure = jsonArray(d.leave_pressure).map(jsonObj);
  const access = jsonObj(d.access);
  const byKind = jsonObj(access.by_kind);
  const exportsList = jsonArray(access.exports).map(jsonObj);
  const denied = jsonArray(access.denied).map(jsonObj);
  const sensitive = jsonArray(access.sensitive).map(jsonObj);

  return (
    <div className="page page-wide">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-xs text-muted hover:underline mb-[var(--s2)]"><ArrowLeft size={12} /> Administration</Link>
      <PageHeader
        eyebrow="Owner view"
        title="People Intelligence"
        subtitle="Aggregated operational signals to help you look after people and continuity. Not a scoreboard."
        actions={
          <span className="inline-flex items-center gap-1 card p-0.5">
            {DAYS.map((n) => <button key={n} type="button" onClick={() => setDays(n)} className={cn("btn btn-sm", days === n ? "btn-secondary" : "btn-ghost")}>{n} days</button>)}
          </span>
        }
      />

      {loading ? (
        <Card className="p-[var(--s4)] space-y-2"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24" /><Skeleton className="h-24" /></Card>
      ) : forbidden ? (
        <Card><EmptyState icon={<ShieldCheck size={18} />} title="Owner only" hint="People Intelligence is available to the primary admin, super admins and HR managers. Every view of it is recorded in the access log." /></Card>
      ) : (
        <div className="space-y-[var(--s3)]">
          <div className="rounded-[var(--radius-sm)] border border-[var(--success)] tone-success px-3 py-2 text-sm flex items-start gap-2">
            <ShieldCheck size={15} className="shrink-0 mt-0.5" />
            <span>{str(d.explain) || "Aggregated operational signals only. No device telemetry, no inferred traits, no ranking."} <span className="text-muted">Window: {fmtDate(str(d.from))} – {fmtDate(str(d.to))}. This view is logged.</span></span>
          </div>

          {/* Attendance overview */}
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-[var(--s2)]">
              <Stat label="Avg worked / day" value={fmtHours(num(att.avg_minutes))} sub="hours, excluding breaks" />
              <Stat label="Late rate" value={`${num(att.late_rate)}%`} sub="of attendance days" />
              <Stat label="Remote rate" value={`${num(att.remote_rate)}%`} sub="of attendance days" />
              <Stat label="Avg break" value={`${num(att.avg_break)}m`} sub="per day" />
              <Stat label="Long days" value={num(att.long_days)} sub="over 10 hours worked" />
            </div>
            <div className="text-[11px] text-muted mt-1.5 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-0.5" /> Why: company-wide attendance shape. What it is not: a target — long days and lates are prompts to check on load and commute, not a grade.</div>
          </div>

          {/* Departments */}
          <Card>
            <CardHeader title="Departments" subtitle="Headcount, hours, lates, open work, help SLAs, leave, exceptions, continuity gaps and how evenly work is spread" />
            {departments.length === 0 ? <div className="px-[var(--s4)] pb-[var(--s4)] text-xs text-muted">No departments.</div> : (
              <Table
                minWidth={900}
                head={[{ label: "Department" }, { label: "People", right: true }, { label: "Avg hrs", right: true }, { label: "Late %", right: true }, { label: "Open tasks", right: true }, { label: "Overdue", right: true }, { label: "Help > SLA", right: true }, { label: "Leave days", right: true }, { label: "Exceptions", right: true }, { label: "No backup", right: true }, { label: "Workload spread" }]}
                rows={departments.map((x) => {
                  const w = jsonObj(x.workload_spread);
                  return [
                    <span key="n" className="inline-flex items-center gap-1.5">{str(x.name)}<Blink zone={`dept:${str(x.id)}`} /></span>,
                    num(x.headcount), x.avg_minutes == null ? "—" : fmtHours(num(x.avg_minutes)), `${num(x.late_rate)}%`, num(x.open_tasks),
                    <span key="o" className={num(x.overdue) ? "text-warn" : undefined}>{num(x.overdue)}</span>,
                    <span key="h" className={num(x.help_over_sla) ? "text-warn" : undefined}>{num(x.help_over_sla)}</span>,
                    num(x.leave_days), num(x.exceptions),
                    <span key="b" className={num(x.no_backup) ? "text-danger" : undefined}>{num(x.no_backup)}</span>,
                    <span key="w" className="text-muted text-xs num">{w.min == null ? "—" : `${num(w.min)} – ${num(w.max)} open (avg ${num(w.avg)})`}</span>,
                  ];
                })}
              />
            )}
            <Explain>Why: where load, service and continuity need attention. What it is not: a league table — departments differ in kind of work, so compare a department with itself over time.</Explain>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-[var(--s3)] items-start">
            <Card>
              <CardHeader title="Key-person risk" subtitle="Critical responsibilities without a backup, or many people waiting on one person" />
              {keyPerson.length === 0 ? <div className="px-[var(--s4)] pb-[var(--s3)] text-xs text-muted">No single points of failure detected.</div> : (
                <Table head={[{ label: "Person" }, { label: "Critical resp.", right: true }, { label: "No backup", right: true }, { label: "Waiting on", right: true }]} rows={keyPerson.map((x) => [
                  <PersonCell key="p" id={str(x.user_id)} name={str(x.name)} sub={str(x.department)} />, num(x.critical_responsibilities),
                  <span key="nb" className={num(x.no_backup) ? "text-danger" : undefined}>{num(x.no_backup)}</span>, num(x.waiting_on),
                ])} />
              )}
              <Explain>Why: continuity — name a backup in the Responsibilities register. What it is not: a judgement of the person; it usually means they are trusted with a lot.</Explain>
            </Card>

            <Card>
              <CardHeader title="Heavy load" subtitle="Many open or urgent tasks, or repeated long days" />
              {overload.length === 0 ? <div className="px-[var(--s4)] pb-[var(--s3)] text-xs text-muted">Nobody is over the load thresholds.</div> : (
                <Table head={[{ label: "Person" }, { label: "Open", right: true }, { label: "Urgent", right: true }, { label: "Avg hrs", right: true }, { label: "Long days", right: true }]} rows={overload.map((x) => [
                  <PersonCell key="p" id={str(x.user_id)} name={str(x.name)} />, num(x.open), num(x.urgent), x.avg_minutes == null ? "—" : fmtHours(num(x.avg_minutes)), num(x.long_days),
                ])} />
              )}
              <Explain>Why: a prompt to rebalance work or check in. What it is not: a productivity measure — open tasks and hours say nothing about quality or effort.</Explain>
            </Card>

            <Card>
              <CardHeader title="Attendance patterns" subtitle="People with 4 or more exceptions in the window" />
              {attention.length === 0 ? <div className="px-[var(--s4)] pb-[var(--s3)] text-xs text-muted">No repeated exceptions.</div> : (
                <Table head={[{ label: "Person" }, { label: "Late", right: true }, { label: "Early", right: true }, { label: "No check-out", right: true }, { label: "Short", right: true }, { label: "Break", right: true }, { label: "Absent", right: true }, { label: "Total", right: true }]} rows={attention.map((x) => [
                  <PersonCell key="p" id={str(x.user_id)} name={str(x.full_name)} />, num(x.late), num(x.early_leave), num(x.missing_checkout), num(x.short_day), num(x.excess_break), num(x.absent), <span key="t" className="font-semibold">{num(x.total)}</span>,
                ])} />
              )}
              <Explain>Why: a conversation prompt — commute, health, family or a missing shift assignment are common causes. What it is not: a disciplinary list. The person sees the same data in their Privacy Center.</Explain>
            </Card>

            <Card>
              <CardHeader title="Probation ending" subtitle="Within the next 30 days" />
              {probation.length === 0 ? <div className="px-[var(--s4)] pb-[var(--s3)] text-xs text-muted">No probation periods ending soon.</div> : (
                <ul className="divide-y border-t">
                  {probation.map((x) => <li key={str(x.user_id)} className="flex items-center justify-between gap-2 px-[var(--s4)] py-1.5 text-sm"><PersonCell id={str(x.user_id)} name={str(x.name)} /><span className="text-xs text-muted num">{fmtDate(str(x.ends))}</span></li>)}
                </ul>
              )}
              <Explain>Why: schedule the review in People Ops before the date. What it is not: an outcome — reviews are recorded separately with the manager.</Explain>
            </Card>

            <Card>
              <CardHeader title="Leave pressure" subtitle="Large unused leave balances this year (15+ days)" />
              {leavePressure.length === 0 ? <div className="px-[var(--s4)] pb-[var(--s3)] text-xs text-muted">Balances look healthy.</div> : (
                <ul className="divide-y border-t">
                  {leavePressure.map((x) => <li key={str(x.user_id)} className="flex items-center justify-between gap-2 px-[var(--s4)] py-1.5 text-sm"><PersonCell id={str(x.user_id)} name={str(x.name)} /><span className="pill tone-neutral num">{num(x.balance)} days</span></li>)}
                </ul>
              )}
              <Explain>Why: people who never take leave burn out, and balances become a liability. What it is not: pressure to take leave on a date — a nudge for managers to plan.</Explain>
            </Card>

            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-2"><Eye size={15} className="text-muted" /> Access summary</span>} subtitle="Who exported, printed or shared; denied attempts; sensitive record views" />
              <div className="px-[var(--s4)] pb-[var(--s3)] flex flex-wrap gap-1.5">
                {Object.entries(byKind).map(([k, v]) => <Pill key={k} tone={k === "denied" ? "tone-danger" : k === "export" || k === "download" || k === "share" ? "tone-warn" : "tone-neutral"}>{k} <span className="num font-semibold ml-1">{num(v)}</span></Pill>)}
                {Object.keys(byKind).length === 0 && <span className="text-xs text-muted">No access events in the window.</span>}
              </div>
              {(exportsList.length > 0 || denied.length > 0 || sensitive.length > 0) && (
                <ul className="divide-y border-t max-h-72 overflow-y-auto">
                  {sensitive.slice(0, 15).map((x, i) => <li key={`s${i}`} className="flex items-center gap-2 px-[var(--s4)] py-1.5 text-sm"><Pill tone="tone-violet">sensitive</Pill><PersonCell id={str(x.user_id)} name={str(x.user)} /><span className="text-xs text-muted truncate flex-1">{str(x.entity_type)}</span><span className="text-[11px] text-muted num">{fmtDate(str(x.at), true)}</span></li>)}
                  {exportsList.slice(0, 15).map((x, i) => <li key={`e${i}`} className="flex items-center gap-2 px-[var(--s4)] py-1.5 text-sm"><Pill tone="tone-warn">{str(x.kind)}</Pill><PersonCell id={str(x.user_id)} name={str(x.user)} /><span className="text-xs text-muted truncate flex-1">{str(x.entity_type) || str(x.path)}</span><span className="text-[11px] text-muted num">{fmtDate(str(x.at), true)}</span></li>)}
                  {denied.slice(0, 15).map((x, i) => <li key={`d${i}`} className="flex items-center gap-2 px-[var(--s4)] py-1.5 text-sm"><Pill tone="tone-danger">denied</Pill><PersonCell id={str(x.user_id)} name={str(x.user)} /><span className="text-xs text-muted truncate flex-1">{str(x.path)}</span><span className="text-[11px] text-muted num">{fmtDate(str(x.at), true)}</span></li>)}
                </ul>
              )}
              <Explain>Why: data leaving the system and repeated denials are security signals. What it is not: browsing history — only explicit view/export events on governed records are logged, and every person can see their own log. Full detail: <Link href="/admin?tab=access-log" className="link">Access log</Link>.</Explain>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
