"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart3, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, EmptyState, Input, Skeleton, Stat, useToast } from "@/components/ui";
import { DepartmentPicker } from "@/components/pickers";
import { Blink } from "@/components/providers/ActivityProvider";
import { cn } from "@/lib/utils";
import { addDays, dayLabel, downloadText, fmtHours, fmtMinutes, isoWeekday, toCsv } from "@/components/attendance/attendanceUtils";
import { asSummary, type SummaryData } from "./lib";

const SERIES: { key: "present" | "late" | "remote" | "leave" | "absent"; label: string; color: string }[] = [
  { key: "present", label: "Present", color: "var(--success)" },
  { key: "late", label: "Late", color: "var(--warn)" },
  { key: "remote", label: "Remote", color: "var(--info)" },
  { key: "leave", label: "Leave", color: "var(--orange)" },
  { key: "absent", label: "Absent", color: "var(--danger)" },
];

export function SummaryTab({ today }: { today: string }) {
  const toast = useToast();
  const [from, setFrom] = React.useState(addDays(today, -13));
  const [to, setTo] = React.useState(today);
  const [dept, setDept] = React.useState("");
  const [loaded, setLoaded] = React.useState<{ key: string; data: SummaryData | null } | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const key = JSON.stringify([from, to, dept]);
  const loading = !loaded || loaded.key !== key;
  const data = loaded?.data || null;

  React.useEffect(() => {
    if (!from || !to || from > to) return;
    let alive = true;
    createClient().rpc("attendance_summary", { p_from: from, p_to: to, p_department: dept || undefined }).then(({ data: j, error }) => {
      if (!alive) return;
      if (error) toast.push(error.message, "danger");
      setLoaded({ key: JSON.stringify([from, to, dept]), data: asSummary(j) });
    });
    return () => { alive = false; };
  }, [from, to, dept, toast]);

  const days = React.useMemo(() => data?.days || [], [data]);
  const maxDay = Math.max(1, ...days.map((d) => d.present + d.leave + d.absent));
  const totals = React.useMemo(() => days.reduce((a, d) => ({ present: a.present + d.present, late: a.late + d.late, remote: a.remote + d.remote, leave: a.leave + d.leave, absent: a.absent + d.absent }), { present: 0, late: 0, remote: 0, leave: 0, absent: 0 }), [days]);
  const avgMinutes = days.length ? Math.round(days.reduce((a, d) => a + (d.avg_minutes || 0), 0) / Math.max(1, days.filter((d) => d.avg_minutes).length)) : 0;

  async function exportCsv() {
    if (!data) return;
    setExporting(true);
    // Exports are logged (visible to the exporter in their own access log and mirrored to security events).
    await createClient().rpc("log_access_event", { p_kind: "export", p_type: "attendance_summary", p_path: "/workforce", p_details: { from, to, department: dept || null } });
    const csv = toCsv([
      ["Day", "Present", "Late", "Remote", "Leave", "Absent", "Avg hours"],
      ...data.days.map((d) => [d.day, d.present, d.late, d.remote, d.leave, d.absent, d.avg_minutes ? fmtHours(d.avg_minutes) : ""]),
      [],
      ["Department", "Headcount", "Present days", "Late", "Avg hours", "Exceptions"],
      ...data.departments.map((d) => [d.name, d.headcount, d.present_days, d.late, d.avg_minutes ? fmtHours(d.avg_minutes) : "", d.exceptions]),
    ]);
    downloadText(`attendance-summary-${from}-to-${to}.csv`, csv);
    setExporting(false);
    toast.push("Exported — this export is recorded in the access log", "info");
  }

  return (
    <div className="space-y-[var(--s3)]">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-8 text-sm w-auto" aria-label="From" />
        <span className="text-xs text-muted">to</span>
        <Input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-8 text-sm w-auto" aria-label="To" />
        <DepartmentPicker value={dept} onChange={setDept} placeholder="All departments" className="h-8 text-sm w-auto min-w-[160px]" />
        <div className="flex gap-1">
          <button className="btn btn-ghost btn-xs" onClick={() => { setFrom(addDays(today, -13)); setTo(today); }}>2 weeks</button>
          <button className="btn btn-ghost btn-xs" onClick={() => { setFrom(addDays(today, -29)); setTo(today); }}>30 days</button>
        </div>
        <button className="btn btn-secondary btn-sm ml-auto" onClick={exportCsv} disabled={!data || exporting}><Download size={14} /> Export CSV</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-[var(--s2)]">
        <Stat label="Present days" value={loading ? "…" : totals.present} tone="text-success" />
        <Stat label="Late" value={loading ? "…" : totals.late} tone={totals.late ? "text-warn" : undefined} />
        <Stat label="Remote days" value={loading ? "…" : totals.remote} tone="text-info" />
        <Stat label="Leave days" value={loading ? "…" : totals.leave} />
        <Stat label="Absent" value={loading ? "…" : totals.absent} tone={totals.absent ? "text-danger" : undefined} />
        <Stat label="Avg hours / day" value={loading ? "…" : fmtHours(avgMinutes)} sub="worked, excluding breaks" />
      </div>

      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><BarChart3 size={15} className="text-muted" /> Per day</span>} subtitle="Stacked: present, leave, absent. Late and remote are subsets of present." />
        <div className="px-[var(--s4)] pb-[var(--s4)]">
          {loading ? (
            <Skeleton className="h-40" />
          ) : days.length === 0 ? (
            <EmptyState title="No attendance days in this range" className="py-4" />
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1 h-44 min-w-[560px]">
                {days.map((d) => {
                  const h = (n: number) => `${(n / maxDay) * 100}%`;
                  const weekend = isoWeekday(d.day) >= 6;
                  return (
                    <div key={d.day} className="flex-1 min-w-[18px] flex flex-col justify-end h-full group" title={`${dayLabel(d.day)} · ${d.present} present (${d.late} late, ${d.remote} remote) · ${d.leave} leave · ${d.absent} absent · avg ${fmtMinutes(d.avg_minutes)}`}>
                      <div className="w-full flex flex-col-reverse rounded-t-[3px] overflow-hidden" style={{ height: h(d.present + d.leave + d.absent) }}>
                        <div style={{ height: `${(d.present / Math.max(1, d.present + d.leave + d.absent)) * 100}%`, background: "var(--success)" }} className="w-full relative">
                          {d.late > 0 && <div className="absolute left-0 right-0 bottom-0" style={{ height: `${(d.late / Math.max(1, d.present)) * 100}%`, background: "var(--warn)", opacity: 0.85 }} />}
                        </div>
                        <div style={{ height: `${(d.leave / Math.max(1, d.present + d.leave + d.absent)) * 100}%`, background: "var(--orange)" }} className="w-full" />
                        <div style={{ height: `${(d.absent / Math.max(1, d.present + d.leave + d.absent)) * 100}%`, background: "var(--danger)" }} className="w-full" />
                      </div>
                      <div className={cn("text-[10px] text-center num mt-1", weekend ? "text-muted" : "text-2")}>{d.day.slice(-2)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-muted">
                {SERIES.map((s) => <span key={s.key} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Per department" subtitle="Present days, lates, average worked hours and exception count in the range" />
        {loading ? (
          <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2"><Skeleton className="h-6" /><Skeleton className="h-6 w-2/3" /></div>
        ) : (data?.departments.length || 0) === 0 ? (
          <div className="px-[var(--s4)] pb-[var(--s4)] text-xs text-muted">No departments in scope.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-[11px] text-muted uppercase tracking-wide">
                <tr className="border-t border-b">
                  <th className="text-left font-medium px-[var(--s4)] py-1.5">Department</th>
                  <th className="text-right font-medium px-2 py-1.5 num">Headcount</th>
                  <th className="text-right font-medium px-2 py-1.5 num">Present days</th>
                  <th className="text-right font-medium px-2 py-1.5 num">Late</th>
                  <th className="text-right font-medium px-2 py-1.5 num">Avg hours</th>
                  <th className="text-right font-medium px-2 py-1.5 num">Exceptions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data!.departments.map((d) => (
                  <tr key={d.department_id} className="row-hover">
                    <td className="px-[var(--s4)] py-1.5"><span className="inline-flex items-center gap-1.5">{d.name}<Blink zone={`dept:${d.department_id}`} /></span></td>
                    <td className="px-2 py-1.5 num text-right">{d.headcount}</td>
                    <td className="px-2 py-1.5 num text-right">{d.present_days}</td>
                    <td className={cn("px-2 py-1.5 num text-right", d.late && "text-warn")}>{d.late}</td>
                    <td className="px-2 py-1.5 num text-right">{d.avg_minutes ? fmtHours(d.avg_minutes) : "—"}</td>
                    <td className="px-2 py-1.5 num text-right"><Link href={`/workforce?tab=exceptions`} className={cn("hover:underline", d.exceptions && "text-warn")}>{d.exceptions}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="text-[11px] text-muted">Aggregates only. Per-person detail lives on the Exceptions tab and on each person’s own attendance page, which they can see too.</div>
    </div>
  );
}
