"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Card, CardHeader, EmptyState, Pill, Select, Skeleton, Stat, useToast } from "@/components/ui";
import { DepartmentPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { cn } from "@/lib/utils";
import { ATT_STATUS_LABEL, ATT_STATUS_TONE, MODE_LABEL, addDays, dayLabel, downloadText, fmtMinutes, istDay, istTime, toCsv, type BoardRow } from "./attendanceUtils";

type Derived = Omit<BoardRow, "mode"> & { status: string; missing: boolean; mode: string | null };

function derive(r: BoardRow, day: string, today: string): Derived {
  const status = r.att_status === "absent" && day === today && !r.first_in ? "not_yet" : r.att_status;
  const missing = !!r.first_in && !r.last_out && day < today;
  const mode = r.presence === "remote" ? "remote" : r.presence === "field" ? "field" : r.first_in ? "office" : null;
  return { ...r, status, missing, mode };
}

const STATUS_FILTERS = ["all", "present", "late", "remote", "field", "half_day", "leave", "absent", "not_yet"] as const;

export function TeamBoard({ initialRows, initialDay }: { initialRows: BoardRow[]; initialDay: string }) {
  const { departments } = useSession();
  const toast = useToast();
  const today = istDay();
  const [day, setDay] = React.useState(initialDay);
  const [rows, setRows] = React.useState<BoardRow[] | null>(initialRows);
  const [dept, setDept] = React.useState("");
  const [status, setStatus] = React.useState<(typeof STATUS_FILTERS)[number]>("all");

  React.useEffect(() => {
    if (day === initialDay) return;
    let alive = true;
    const t = setTimeout(() => setRows(null), 0);
    createClient().rpc("attendance_board", { p_day: day }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { toast.push(error.message, "danger"); setRows([]); return; }
      setRows((data || []) as BoardRow[]);
    });
    return () => { alive = false; clearTimeout(t); };
  }, [day, initialDay, toast]);

  // Keep today's board live: any attendance event in the org (RLS-filtered) refreshes the day.
  React.useEffect(() => {
    if (day !== today) return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase.channel("attendance-board").on("postgres_changes", { event: "INSERT", schema: "public", table: "attendance_events" }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => supabase.rpc("attendance_board", { p_day: day }).then(({ data }) => data && setRows(data as BoardRow[])), 800);
    }).subscribe();
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch); };
  }, [day, today]);

  const derived = React.useMemo(() => (rows || []).map((r) => derive(r, day, today)), [rows, day, today]);
  const filtered = derived.filter((r) => (!dept || r.department_id === dept) && (status === "all" || r.status === status));
  const groups = React.useMemo(() => {
    const m = new Map<string, Derived[]>();
    for (const r of filtered) {
      const k = r.department_id || "none";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m.entries()].map(([k, list]) => ({ id: k, name: departments.find((d) => d.id === k)?.name || "No department", color: departments.find((d) => d.id === k)?.color, list })).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered, departments]);

  const scope = dept ? derived.filter((r) => r.department_id === dept) : derived;
  const count = (s: string | string[]) => scope.filter((r) => (Array.isArray(s) ? s.includes(r.status) : r.status === s)).length;
  const inNow = scope.filter((r) => r.presence !== "offline" && r.first_in && !r.last_out).length;

  function exportCsv() {
    const csv = toCsv([
      ["Date", "Name", "Designation", "Department", "Status", "First in (IST)", "Last out (IST)", "Hours", "Mode", "Late", "Missing checkout", "Shift", "On leave"],
      ...filtered.map((r) => [day, r.full_name, r.designation, departments.find((d) => d.id === r.department_id)?.name || "", ATT_STATUS_LABEL[r.status] || r.status, r.first_in ? istTime(r.first_in) : "", r.last_out ? istTime(r.last_out) : "", (r.minutes_worked / 60).toFixed(2), r.mode ? MODE_LABEL[r.mode] : "", r.late ? "yes" : "", r.missing ? "yes" : "", r.shift_name, r.on_leave ? r.leave_kind || "yes" : ""]),
    ]);
    downloadText(`attendance-${day}${dept ? "-" + (departments.find((d) => d.id === dept)?.slug || "dept") : ""}.csv`, csv);
  }

  return (
    <div className="space-y-[var(--s3)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 card p-0.5">
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day"><ChevronLeft size={15} /></button>
          <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="input h-8 text-sm w-[150px] border-0 bg-transparent" aria-label="Day" />
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDay(addDays(day, 1))} disabled={day >= today} aria-label="Next day"><ChevronRight size={15} /></button>
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setDay(today)} disabled={day === today}>Today</button>
        <DepartmentPicker value={dept} onChange={setDept} placeholder="All departments" className="h-8 text-sm w-auto min-w-[160px]" />
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-8 text-sm w-auto">
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : ATT_STATUS_LABEL[s]}</option>)}
        </Select>
        <button className="btn btn-secondary btn-sm ml-auto" onClick={exportCsv} disabled={!filtered.length}><Download size={14} /> Export CSV</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-[var(--s2)]">
        <Stat label="People" value={rows ? scope.length : "…"} sub={dayLabel(day)} />
        <Stat label={day === today ? "In right now" : "Worked"} value={rows ? (day === today ? inNow : scope.filter((r) => r.first_in).length) : "…"} tone="text-success" />
        <Stat label="Remote / field" value={rows ? count(["remote", "field", "travel", "training"]) : "…"} tone="text-info" />
        <Stat label="Late" value={rows ? count("late") : "…"} tone={count("late") ? "text-warn" : undefined} />
        <Stat label="On leave" value={rows ? count("leave") : "…"} />
        <Stat label={day === today ? "Not yet in" : "Absent"} value={rows ? count(day === today ? "not_yet" : "absent") : "…"} tone={day !== today && count("absent") ? "text-danger" : undefined} />
      </div>

      {!rows ? (
        <Card className="p-[var(--s4)] space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8 w-2/3" /></Card>
      ) : groups.length === 0 ? (
        <Card><EmptyState title="Nobody matches" hint="Try another day, department or status." /></Card>
      ) : (
        groups.map((g) => (
          <Card key={g.id}>
            <CardHeader title={<span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: g.color || "var(--line-strong)" }} />{g.name}</span>} subtitle={`${g.list.filter((r) => r.first_in).length}/${g.list.length} checked in`} />
            <div className="overflow-x-auto">
              {/*
                Every department renders its own table. With automatic layout each one sized its
                columns to its own contents, so the repeated headers stepped left and right down the
                page and no two sections lined up. Fixed layout plus one shared column template makes
                every section land on the same grid; only the Person column takes the slack.
              */}
              <table className="w-full text-sm min-w-[820px] table-fixed">
                {/* The fixed widths sum to 644px, so at the 820px minimum the Person column still
                    has 176px to itself and only grows from there. The wrapper scrolls sideways
                    below that rather than letting any column collapse. */}
                <colgroup>
                  <col />
                  <col className="w-[132px]" />
                  <col className="w-[88px]" />
                  <col className="w-[100px]" />
                  <col className="w-[80px]" />
                  <col className="w-[100px]" />
                  <col className="w-[100px]" />
                  <col className="w-[44px]" />
                </colgroup>
                <thead className="text-[11px] text-muted uppercase tracking-wide">
                  <tr className="border-t border-b">
                    <th className="text-left font-medium px-[var(--s4)] py-1.5">Person</th>
                    <th className="text-left font-medium px-2 py-1.5">Status</th>
                    <th className="text-left font-medium px-2 py-1.5 num">First in</th>
                    <th className="text-left font-medium px-2 py-1.5 num">Last out</th>
                    <th className="text-right font-medium px-2 py-1.5 num">Hours</th>
                    <th className="text-left font-medium px-2 py-1.5">Mode</th>
                    <th className="text-left font-medium px-2 py-1.5">Shift</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {g.list.map((r) => (
                    <tr key={r.user_id} className="row-hover">
                      <td className="px-[var(--s4)] py-1.5">
                        <Link href={`/people/${r.user_id}`} className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={r.full_name} src={r.avatar_url} size={26} presence={r.presence} />
                          <span className="min-w-0"><span className="flex items-center gap-1.5"><span className="truncate">{r.full_name}</span><Blink zone={`user:${r.user_id}`} /></span><span className="block text-[11px] text-muted truncate">{r.designation || "—"}{r.status_text ? ` · ${r.status_text}` : ""}</span></span>
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 overflow-hidden"><Pill tone={ATT_STATUS_TONE[r.status] || "tone-neutral"} className="max-w-full truncate">{ATT_STATUS_LABEL[r.status] || r.status}{r.status === "leave" && r.leave_kind ? ` · ${r.leave_kind.replace(/_/g, " ")}` : ""}</Pill></td>
                      <td className={cn("px-2 py-1.5 num", r.late && "text-warn")}>{r.first_in ? istTime(r.first_in) : "—"}</td>
                      <td className="px-2 py-1.5 num">{r.last_out ? istTime(r.last_out) : r.first_in ? (day === today ? <span className="text-success">in</span> : <span className="text-warn inline-flex items-center gap-1"><AlertTriangle size={12} /> missing</span>) : "—"}</td>
                      <td className="px-2 py-1.5 num text-right">{r.minutes_worked ? fmtMinutes(r.minutes_worked) : "—"}</td>
                      <td className="px-2 py-1.5 text-muted truncate">{r.mode ? MODE_LABEL[r.mode] : "—"}</td>
                      <td className="px-2 py-1.5 text-muted truncate">{r.shift_name || "—"}</td>
                      <td className="px-2 py-1.5 text-right">{r.in_meeting && <span className="pill tone-violet" title="In a meeting now"><Video size={10} /></span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}
      <div className="text-[11px] text-muted">Everyone on this board can see the same data about themselves on their own attendance page. Location appears only on check-ins where the person chose to share it.</div>
    </div>
  );
}
