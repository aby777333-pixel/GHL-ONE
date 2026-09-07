"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, MapPin, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, EmptyState, Pill, Skeleton, Stat, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";
import { WhatIsRecorded } from "@/components/people/PrivacyCenter";
import { ClockCard } from "./ClockWidget";
import { MyExceptions } from "./MyExceptions";
import { ATT_STATUS_COLOR, ATT_STATUS_LABEL, ATT_STATUS_TONE, MODE_LABEL, dayLabel, fmtHours, fmtMinutes, isoWeekday, istDay, istTime, monthBounds, type AttendanceDay } from "./attendanceUtils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function avgTime(days: AttendanceDay[]) {
  const ins = days.filter((d) => d.first_in).map((d) => {
    const [h, m] = istTime(d.first_in).split(":").map(Number);
    return h * 60 + m;
  });
  if (!ins.length) return "—";
  const avg = Math.round(ins.reduce((a, b) => a + b, 0) / ins.length);
  return `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`;
}

export function MyAttendance({ initialDays, initialMonth }: { initialDays: AttendanceDay[]; initialMonth: string }) {
  const toast = useToast();
  const { profile } = useSession();
  const today = istDay();
  const [month, setMonth] = React.useState(initialMonth); // YYYY-MM
  const [days, setDays] = React.useState<AttendanceDay[] | null>(initialDays);
  const [selected, setSelected] = React.useState<string | null>(null);

  const [y, m] = month.split("-").map(Number);
  const bounds = React.useMemo(() => monthBounds(y, m - 1), [y, m]);

  React.useEffect(() => {
    if (month === initialMonth) return;
    let alive = true;
    const t = setTimeout(() => setDays(null), 0);
    createClient().rpc("my_attendance", { p_from: bounds.from, p_to: bounds.to }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { toast.push(error.message, "danger"); setDays([]); return; }
      setDays((data || []) as AttendanceDay[]);
    });
    return () => { alive = false; clearTimeout(t); };
  }, [month, initialMonth, bounds.from, bounds.to, toast]);

  const byDay = React.useMemo(() => new Map((days || []).map((d) => [d.day, d])), [days]);
  const worked = (days || []).filter((d) => !["leave", "absent"].includes(d.status));
  const late = (days || []).filter((d) => d.late).length;
  const totalMin = worked.reduce((a, d) => a + (d.minutes_worked || 0), 0);
  const missing = (days || []).filter((d) => d.missing_checkout && d.day !== today).length;

  function shift(n: number) {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    setSelected(null);
  }
  const monthLabel = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 1)));
  const lead = isoWeekday(bounds.from) - 1;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: bounds.days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const list = (days || []).slice().sort((a, b) => b.day.localeCompare(a.day));
  const sel = selected ? byDay.get(selected) : undefined;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-[var(--s3)] items-start">
      <div className="space-y-[var(--s3)] min-w-0">
        <ClockCard />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--s2)]">
          <Stat label="Days worked" value={days ? worked.length : "…"} sub={monthLabel} />
          <Stat label="Hours" value={days ? fmtHours(totalMin) : "…"} sub={worked.length ? `avg ${fmtHours(totalMin / worked.length)}h / day` : "—"} />
          <Stat label="Late arrivals" value={days ? late : "…"} tone={late ? "text-warn" : undefined} sub="after grace period" />
          <Stat label="Average in-time" value={days ? avgTime(worked) : "…"} sub={missing ? `${missing} missing checkout${missing === 1 ? "" : "s"}` : "IST"} tone={missing ? "text-warn" : undefined} />
        </div>

        <Card>
          <CardHeader
            title={monthLabel}
            subtitle="Tap a day for details"
            action={
              <span className="inline-flex items-center gap-1">
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={15} /></button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setMonth(today.slice(0, 7)); setSelected(null); }}>Today</button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => shift(1)} disabled={month >= today.slice(0, 7)} aria-label="Next month"><ChevronRight size={15} /></button>
              </span>
            }
          />
          <div className="px-[var(--s3)] pb-[var(--s3)]">
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted mb-1">{WEEKDAYS.map((w) => <div key={w}>{w}</div>)}</div>
            {!days ? (
              <Skeleton className="h-48" />
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (!day) return <div key={`e${i}`} />;
                  const d = byDay.get(day);
                  const weekend = isoWeekday(day) >= 6;
                  const future = day > today;
                  const color = d ? ATT_STATUS_COLOR[d.status] || "var(--line-strong)" : undefined;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setSelected(day === selected ? null : day)}
                      className={cn("relative aspect-square min-h-[34px] rounded-[var(--radius-sm)] border text-xs num flex items-center justify-center transition-transform hover:scale-[1.04]", day === today && "ring-2 ring-[var(--brand-2)]", selected === day && "border-[var(--fg)]", future && "opacity-40", weekend && !d && "sunken text-muted")}
                      style={color ? { background: `color-mix(in oklab, ${color} ${d?.status === "absent" ? 22 : 30}%, var(--bg-elev))`, borderColor: color } : undefined}
                      title={d ? `${dayLabel(day)} · ${ATT_STATUS_LABEL[d.status] || d.status} · ${fmtMinutes(d.minutes_worked)}` : dayLabel(day)}
                    >
                      {Number(day.slice(-2))}
                      {d?.late && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: "var(--warn)" }} />}
                      {d?.missing_checkout && day !== today && <AlertTriangle size={9} className="absolute bottom-0.5 right-0.5 text-warn" />}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[11px] text-muted">
              {["present", "late", "remote", "field", "half_day", "leave", "absent"].map((s) => (
                <span key={s} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: ATT_STATUS_COLOR[s] }} />{ATT_STATUS_LABEL[s]}</span>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Days" subtitle={days ? `${list.length} recorded day${list.length === 1 ? "" : "s"} · only days with a clock-in, leave or correction appear` : undefined} />
          {!days ? (
            <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          ) : list.length === 0 ? (
            <EmptyState title="Nothing recorded this month" hint="Clock in from the top bar and your day will appear here." className="py-[var(--s4)]" />
          ) : (
            <div className="divide-y border-t">
              {list.map((d) => (
                <button key={d.day} type="button" onClick={() => setSelected(d.day === selected ? null : d.day)} className={cn("w-full text-left flex items-center gap-3 px-[var(--s4)] py-2 row-hover", selected === d.day && "bg-[var(--neutral-bg)]")}>
                  <div className="w-[88px] shrink-0"><div className="text-sm num">{dayLabel(d.day, { day: "numeric", month: "short" })}</div><div className="text-[11px] text-muted">{dayLabel(d.day, { weekday: "long" })}</div></div>
                  <Pill tone={ATT_STATUS_TONE[d.status] || "tone-neutral"}>{ATT_STATUS_LABEL[d.status] || d.status}</Pill>
                  <span className="text-xs num text-muted hidden sm:inline">{istTime(d.first_in)} → {d.last_out ? istTime(d.last_out) : d.day === today ? "…" : "—"}</span>
                  <span className="text-xs num ml-auto">{fmtMinutes(d.minutes_worked)}</span>
                  {d.mode && <Pill tone="tone-neutral" className="hidden sm:inline-flex">{MODE_LABEL[d.mode] || d.mode}</Pill>}
                  {d.missing_checkout && d.day !== today && <AlertTriangle size={13} className="text-warn" />}
                  {d.corrected_by && <ShieldCheck size={13} className="text-info" />}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-[var(--s3)] min-w-0">
        <Card>
          <CardHeader title={selected ? dayLabel(selected, { weekday: "long", day: "numeric", month: "long" }) : "Day detail"} subtitle={selected ? undefined : "Select a day on the calendar"} />
          <div className="px-[var(--s4)] pb-[var(--s4)] text-sm">
            {!selected ? (
              <div className="text-muted text-xs">Each day shows exactly what was recorded: first in, last out, break time and the resulting status. Corrections made by a manager are marked and carry a note.</div>
            ) : !sel ? (
              <div className="text-muted">{selected > today ? "In the future." : isoWeekday(selected) >= 6 ? "Weekend — nothing recorded." : "No clock-in recorded. If you worked that day, request a correction from the Corrections tab."}</div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap"><Pill tone={ATT_STATUS_TONE[sel.status] || "tone-neutral"} size="lg">{ATT_STATUS_LABEL[sel.status] || sel.status}</Pill>{sel.mode && <Pill tone="tone-neutral">{MODE_LABEL[sel.mode] || sel.mode}</Pill>}{sel.late && <Pill tone="tone-warn">Late</Pill>}</div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-muted">First in</dt><dd className="num">{istTime(sel.first_in)}</dd>
                  <dt className="text-muted">Last out</dt><dd className="num">{sel.last_out ? istTime(sel.last_out) : sel.day === today ? "Still in" : "Missing"}</dd>
                  <dt className="text-muted">Worked</dt><dd className="num">{fmtMinutes(sel.minutes_worked)}</dd>
                  <dt className="text-muted">Breaks</dt><dd className="num">{fmtMinutes(sel.minutes_break)}</dd>
                </dl>
                {sel.missing_checkout && sel.day !== today && <div className="flex items-start gap-2 text-xs rounded-[var(--radius-sm)] p-2 tone-warn"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> No clock-out was recorded. Hours are counted up to the last event only — request a correction if this is wrong.</div>}
                {sel.corrected_by && <div className="text-xs rounded-[var(--radius-sm)] p-2 tone-info"><ShieldCheck size={12} className="inline mr-1" /> Corrected by a manager{sel.correction_note ? `: ${sel.correction_note}` : "."}</div>}
              </div>
            )}
          </div>
        </Card>

        <MyExceptions from={bounds.from} to={bounds.to > today ? today : bounds.to} />

        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-muted" /> What is recorded about me</span>} subtitle="Plain language, no surprises" />
          <div className="px-[var(--s4)] pb-[var(--s4)]">
            <WhatIsRecorded compact />
            <div className="text-[11px] text-muted mt-3 flex items-start gap-1.5"><MapPin size={12} className="shrink-0 mt-0.5" /> Location is stored only on check-ins where you ticked “share my location”, and appears as a pin on that event.</div>
            <Link href={`/people/${profile.id}#privacy`} className="btn btn-secondary btn-sm mt-3">Open my Privacy Center</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
