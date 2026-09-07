"use client";

import * as React from "react";
import Link from "next/link";
import { addDays, differenceInCalendarDays, format, isSameMonth, isToday, isWeekend, startOfDay } from "date-fns";
import { CalendarRange, Diamond } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { usePerson } from "@/components/providers/SessionProvider";
import { cn, type TaskStatus } from "@/lib/utils";

export type GanttTask = { id: string; title: string; start_date: string | null; due_date: string | null; status: TaskStatus; assignee_id: string | null };
export type GanttMilestone = { id: string; title: string; due_date: string | null; completed_at: string | null };

const BAR: Record<TaskStatus, string> = {
  backlog: "var(--line-strong)", todo: "var(--neutral)", in_progress: "var(--info)", in_review: "var(--violet)",
  waiting: "var(--warn)", blocked: "var(--danger)", done: "var(--success)", cancelled: "var(--fg-muted)",
};

const DAY_W = 28;
const LABEL_W = 176;

function Row({ t, rangeStart, days }: { t: GanttTask; rangeStart: Date; days: number }) {
  const person = usePerson(t.assignee_id);
  const due = t.due_date ? startOfDay(new Date(t.due_date)) : null;
  const start = t.start_date ? startOfDay(new Date(t.start_date)) : due ? addDays(due, -2) : null;
  if (!start && !due) return null;
  const s = Math.max(0, differenceInCalendarDays(start || due!, rangeStart));
  const e = Math.min(days, differenceInCalendarDays(due || start!, rangeStart) + 1);
  const overdue = due && due < startOfDay(new Date()) && t.status !== "done" && t.status !== "cancelled";
  return (
    <div className="flex items-stretch border-b last:border-b-0 h-9">
      <div className="sticky left-0 z-10 bg-[var(--bg-elev)] border-r px-2 flex items-center gap-2 shrink-0" style={{ width: LABEL_W }}>
        <Link href={`/tasks/${t.id}`} className={cn("text-xs truncate hover:underline", t.status === "done" && "line-through text-muted")}>{t.title}</Link>
      </div>
      <div className="relative" style={{ width: days * DAY_W }}>
        <div
          className="absolute top-1.5 h-6 rounded-[6px] flex items-center px-2 text-[11px] text-white overflow-hidden whitespace-nowrap shadow-sm"
          style={{ left: s * DAY_W, width: Math.max(DAY_W - 4, (e - s) * DAY_W - 4), background: BAR[t.status], outline: overdue ? "2px solid var(--danger)" : undefined, outlineOffset: 1 }}
          title={`${t.title}${person ? ` · ${person.full_name}` : ""}`}
        >
          {person && <span className="truncate opacity-90">{person.full_name.split(" ")[0]}</span>}
        </div>
      </div>
    </div>
  );
}

/** Simple horizontal Gantt built with a CSS day grid. Bars = tasks with dates; diamonds = milestones. */
export function Gantt({ tasks, milestones = [], projectStart, projectDue, className }: { tasks: GanttTask[]; milestones?: GanttMilestone[]; projectStart?: string | null; projectDue?: string | null; className?: string }) {
  const dated = tasks.filter((t) => t.start_date || t.due_date);
  const points: Date[] = [startOfDay(new Date())];
  for (const t of dated) {
    if (t.start_date) points.push(startOfDay(new Date(t.start_date)));
    if (t.due_date) points.push(startOfDay(new Date(t.due_date)));
  }
  for (const m of milestones) if (m.due_date) points.push(startOfDay(new Date(m.due_date)));
  if (projectStart) points.push(startOfDay(new Date(projectStart)));
  if (projectDue) points.push(startOfDay(new Date(projectDue)));

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const min = addDays(new Date(Math.min(...points.map((d) => d.getTime()))), -3);
  const max = addDays(new Date(Math.max(...points.map((d) => d.getTime()))), 4);
  const days = Math.max(14, differenceInCalendarDays(max, min));
  const dayList = Array.from({ length: days }, (_, i) => addDays(min, i));
  const todayIdx = differenceInCalendarDays(startOfDay(new Date()), min);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, todayIdx * DAY_W - el.clientWidth / 3);
  }, [todayIdx]);

  if (!dated.length && !milestones.some((m) => m.due_date)) {
    return <EmptyState icon={<CalendarRange size={18} />} title="Nothing on the timeline yet" hint="Add start and due dates to tasks, or create milestones, and they will appear here as bars and diamonds." />;
  }

  // Month header segments
  const months: { label: string; span: number }[] = [];
  dayList.forEach((d, i) => {
    const last = months[months.length - 1];
    if (last && i > 0 && isSameMonth(d, dayList[i - 1]!)) last.span++;
    else months.push({ label: format(d, "MMM yyyy"), span: 1 });
  });

  return (
    <div ref={scrollRef} className={cn("card overflow-x-auto overflow-y-hidden", className)}>
      <div style={{ minWidth: LABEL_W + days * DAY_W }}>
        {/* Header */}
        <div className="flex sticky top-0 z-20 bg-[var(--bg-elev)]">
          <div className="sticky left-0 z-30 bg-[var(--bg-elev)] border-r border-b shrink-0 flex items-end px-2 pb-1 text-[11px] text-muted" style={{ width: LABEL_W }}>Task</div>
          <div style={{ width: days * DAY_W }}>
            <div className="flex border-b">
              {months.map((m, i) => (
                <div key={i} className="text-[11px] font-medium px-2 py-1 border-r last:border-r-0 truncate" style={{ width: m.span * DAY_W }}>{m.label}</div>
              ))}
            </div>
            <div className="flex border-b">
              {dayList.map((d, i) => (
                <div key={i} className={cn("text-[10px] text-center py-0.5 num", isWeekend(d) ? "sunken text-muted" : "text-muted", isToday(d) && "text-[var(--brand-2)] font-semibold")} style={{ width: DAY_W }}>{format(d, "d")}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative">
          {/* Today line */}
          <div className="absolute top-0 bottom-0 w-px bg-[var(--brand-2)] z-[5] pointer-events-none" style={{ left: LABEL_W + todayIdx * DAY_W + DAY_W / 2 }} />
          {/* Weekend shading */}
          <div className="absolute inset-y-0 flex pointer-events-none" style={{ left: LABEL_W }}>
            {dayList.map((d, i) => <div key={i} className={cn(isWeekend(d) && "sunken opacity-60")} style={{ width: DAY_W }} />)}
          </div>

          {milestones.filter((m) => m.due_date).length > 0 && (
            <div className="flex items-stretch border-b h-9 relative">
              <div className="sticky left-0 z-10 bg-[var(--bg-elev)] border-r px-2 flex items-center text-xs font-medium shrink-0" style={{ width: LABEL_W }}>Milestones</div>
              <div className="relative" style={{ width: days * DAY_W }}>
                {milestones.filter((m) => m.due_date).map((m) => {
                  const idx = differenceInCalendarDays(startOfDay(new Date(m.due_date!)), min);
                  return (
                    <span key={m.id} className={cn("absolute top-2 flex items-center gap-1", m.completed_at ? "text-[var(--success)]" : "text-[var(--accent)]")} style={{ left: idx * DAY_W + DAY_W / 2 - 8 }} title={m.title}>
                      <Diamond size={16} fill="currentColor" />
                      <span className="text-[10px] whitespace-nowrap text-[var(--fg-2)]">{m.title}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {dated.map((t) => <Row key={t.id} t={t} rangeStart={min} days={days} />)}
        </div>
      </div>
    </div>
  );
}
