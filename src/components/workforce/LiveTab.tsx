"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Clock, Coffee, Info, LogOut, RefreshCw, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Card, CardHeader, EmptyState, Pill, Stat } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { DeptStatusPill } from "@/components/admin/AdminBits";
import { TeamBoard } from "@/components/attendance/TeamBoard";
import { ago, cn } from "@/lib/utils";
import { dayLabel, fmtMinutes, istTime, type BoardRow } from "@/components/attendance/attendanceUtils";
import { asLive, type WorkforceLiveData } from "./lib";

/** One person line: avatar + name (to profile) + department, with an activity light. */
function PersonRow({ id, name, departmentId, children, className }: { id: string; name: string; departmentId?: string | null; children?: React.ReactNode; className?: string }) {
  const { people, departments } = useSession();
  const p = people.find((x) => x.id === id);
  const dept = departmentId ? departments.find((d) => d.id === departmentId)?.name : null;
  return (
    <li className={cn("flex items-center gap-2.5 px-[var(--s4)] py-1.5 row-hover", className)}>
      <Link href={`/people/${id}`} className="flex items-center gap-2.5 min-w-0 flex-1">
        <Avatar name={name} src={p?.avatar_url} size={26} presence={p?.presence} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm"><span className="truncate">{name}</span><Blink zone={`user:${id}`} /></span>
          {dept && <span className="block text-[11px] text-muted truncate">{dept}</span>}
        </span>
      </Link>
      {children}
    </li>
  );
}

function ListCard({ title, subtitle, icon, count, empty, children }: { title: string; subtitle?: string; icon: React.ReactNode; count: number; empty: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2">{icon} {title}</span>} subtitle={subtitle} action={<Pill tone={count ? "tone-warn" : "tone-muted"}>{count}</Pill>} />
      {count === 0 ? <div className="px-[var(--s4)] pb-[var(--s4)] text-xs text-muted">{empty}</div> : <ul className="divide-y border-t max-h-80 overflow-y-auto">{children}</ul>}
    </Card>
  );
}

export function LiveTab({ initial, board, today }: { initial: WorkforceLiveData | null; board: BoardRow[]; today: string }) {
  const { departments } = useSession();
  const [live, setLive] = React.useState<WorkforceLiveData | null>(initial);
  const [refreshedAt, setRefreshedAt] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setBusy(true);
    const { data } = await createClient().rpc("workforce_live");
    const next = asLive(data);
    if (next) setLive(next);
    setRefreshedAt(Date.now());
    setBusy(false);
  }, []);

  // 60s polling + realtime on attendance events (RLS-filtered; token set so the join is evaluated as the user).
  React.useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const bump = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { refresh(); }, 900); };
    const ch = supabase.channel(`workforce-live-${Math.random().toString(36).slice(2, 8)}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "attendance_events" }, bump);
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      ch.subscribe();
    });
    const poll = setInterval(() => { refresh(); }, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; if (timer) clearTimeout(timer); clearInterval(poll); supabase.removeChannel(ch); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);

  if (!live || live.error) {
    return <Card><EmptyState icon={<Info size={18} />} title="Workforce Live is not available" hint={live?.error === "forbidden" ? "Your role does not include the live picture. Ask your manager or HR." : "Could not load the live picture. Try again in a moment."} /></Card>;
  }

  const c = live.counts;
  const deptSlug = (id: string) => departments.find((d) => d.id === id)?.slug;

  return (
    <div className="space-y-[var(--s3)]">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-muted">{dayLabel(live.day, { weekday: "long", day: "numeric", month: "long" })} · refreshes every minute and on every check-in{refreshedAt ? ` · updated ${ago(new Date(refreshedAt))}` : ""}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => refresh()} disabled={busy}><RefreshCw size={13} className={busy ? "animate-spin" : undefined} /> Refresh</button>
      </div>

      {live.coverage_alerts.length > 0 && (
        <div className="rounded-[var(--radius-sm)] border border-[var(--danger)] tone-danger px-3 py-2 text-sm flex items-start gap-2">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>Under-covered right now: {live.coverage_alerts.map((a) => `${a.department} (${a.shortfall} short)`).join(", ")}. The on-duty person or department head has been notified.</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-[var(--s2)]">
        <Stat label="Headcount" value={c.headcount} sub="active, internal" />
        <Stat label="Present now" value={c.present} tone="text-success" sub={`${c.checked_out} already checked out`} />
        <Stat label="Remote / field" value={c.remote + c.field} tone="text-info" sub={`${c.remote} remote · ${c.field} field`} />
        <Stat label="On break" value={c.on_break} tone={c.on_break ? "text-warn" : undefined} sub={`${c.in_meeting} in meeting · ${c.focus} in focus`} />
        <Stat label="Late today" value={c.late} tone={c.late ? "text-warn" : undefined} sub="after grace period" />
        <Stat label="On leave" value={c.on_leave} sub="approved" />
        <Stat label="Not in" value={c.not_in} tone={c.not_in ? "text-danger" : undefined} sub="no check-in, no leave" />
        <Stat label="Exceptions today" value={live.exceptions_today} tone={live.exceptions_today ? "text-warn" : undefined} sub="see the Exceptions tab" />
        <Stat label="Missing check-out" value={live.missing_checkout.length} tone={live.missing_checkout.length ? "text-warn" : undefined} sub="last 3 days" />
        <Stat label="Coverage gaps" value={live.coverage_alerts.length} tone={live.coverage_alerts.length ? "text-danger" : "text-success"} sub="departments under minimum" />
      </div>

      {/* Department coverage grid */}
      <Card>
        <CardHeader title="Department coverage" subtitle="Required vs available right now. Shortfalls are highlighted; on-duty person and department status alongside." />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[var(--s2)] px-[var(--s4)] pb-[var(--s4)]">
          {live.departments.map((d) => {
            const slug = deptSlug(d.department_id);
            const inner = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color || "var(--line-strong)" }} /><span className="font-medium truncate">{d.name}</span><Blink zone={`dept:${d.department_id}`} /></span>
                  {d.status && <DeptStatusPill status={d.status} />}
                </div>
                <div className="flex items-end gap-3 mt-2">
                  <div><div className="eyebrow">Available</div><div className={cn("text-lg font-semibold num leading-tight", d.shortfall > 0 ? "text-danger" : "text-success")}>{d.available}<span className="text-xs text-muted font-normal"> / {d.required} req.</span></div></div>
                  {d.shortfall > 0 && <span className="pill tone-danger">{d.shortfall} short</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted mt-2">
                  <span>{d.remote} remote</span><span>{d.field} field</span><span>{d.on_break} on break</span><span>{d.in_meeting} in meeting</span><span>{d.on_leave} on leave</span><span className={d.not_in ? "text-danger" : undefined}>{d.not_in} not in</span>
                </div>
                <div className="text-[11px] text-muted mt-1.5">On duty: <span className="text-[var(--fg)]">{d.on_duty || "—"}</span></div>
              </>
            );
            const cls = cn("rounded-[var(--radius-sm)] border p-3 block", d.shortfall > 0 ? "tone-danger" : "sunken", slug && "card-hover");
            return slug ? <Link key={d.department_id} href={`/departments/${slug}`} className={cls}>{inner}</Link> : <div key={d.department_id} className={cls}>{inner}</div>;
          })}
          {live.departments.length === 0 && <div className="text-xs text-muted">No departments in scope.</div>}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s3)]">
        <ListCard title="Open breaks" icon={<Coffee size={15} className="text-muted" />} count={live.open_breaks.length} empty="Nobody is on a break right now." subtitle="Minutes on break vs the limit for that break type">
          {live.open_breaks.map((b) => (
            <PersonRow key={`${b.user_id}-${b.since}`} id={b.user_id} name={b.name} departmentId={b.department_id}>
              <Pill tone="tone-neutral">{b.type || "break"}</Pill>
              <span className={cn("text-xs num", b.over ? "text-danger font-semibold" : "text-muted")}>{b.minutes}m{b.max != null ? ` / ${b.max}m` : ""}</span>
              {b.over && <Pill tone="tone-danger">Over</Pill>}
            </PersonRow>
          ))}
        </ListCard>

        <ListCard title="Not clocked in" icon={<UserX size={15} className="text-muted" />} count={live.not_in.length} empty="Everyone expected today has checked in or is on approved leave." subtitle="Shift has started, no check-in, no approved leave">
          {live.not_in.map((n) => (
            <PersonRow key={n.user_id} id={n.user_id} name={n.name} departmentId={n.department_id}>
              {n.shift_start && <span className="text-[11px] text-muted num hidden sm:inline">shift {n.shift_start.slice(0, 5)}</span>}
              <span className={cn("text-xs num", n.minutes_late >= 60 ? "text-danger" : "text-warn")}>{fmtMinutes(n.minutes_late)} late</span>
            </PersonRow>
          ))}
        </ListCard>

        <ListCard title="Missing check-out" icon={<LogOut size={15} className="text-muted" />} count={live.missing_checkout.length} empty="No open days in the last 3 days." subtitle="Days that were closed automatically — correct them if needed">
          {live.missing_checkout.map((m) => (
            <PersonRow key={`${m.user_id}-${m.day}`} id={m.user_id} name={m.name}>
              <span className="text-xs text-muted num">{dayLabel(m.day)} · in {istTime(m.first_in)}</span>
              <Link href="/attendance?tab=corrections" className="btn btn-ghost btn-xs">Correct</Link>
            </PersonRow>
          ))}
        </ListCard>

        <ListCard title="Operational inactivity" icon={<Clock size={15} className="text-muted" />} count={live.inactive.length} empty="Everyone clocked in has had recent work activity." subtitle="Clocked in but no task, message, attendance or focus activity for a while">
          {live.inactive.map((i) => (
            <PersonRow key={i.user_id} id={i.user_id} name={i.name} departmentId={i.department_id}>
              <span className="text-[11px] text-muted hidden sm:inline">last: {i.last_kind || "—"}</span>
              <span className="text-xs num text-warn">{i.hours}h</span>
            </PersonRow>
          ))}
        </ListCard>
      </div>
      <div className="text-[11px] text-muted flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-0.5" /> Inactivity means no task, message, attendance or focus activity in GHL ONE — it is never device monitoring (no keystrokes, screenshots, camera or location). People in meetings, on breaks or in the field are excluded.</div>

      {/* Live status board (same component as the attendance Team board) */}
      <div>
        <div className="eyebrow mb-2">Status board</div>
        <TeamBoard initialRows={board} initialDay={today} />
      </div>
    </div>
  );
}
