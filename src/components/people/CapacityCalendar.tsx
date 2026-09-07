"use client";

import * as React from "react";
import { CalendarRange } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { CAPACITY_COLOR, CAPACITY_TONE, jsonArr, num, str } from "@/components/intel/lib";

export type CapacityDay = { day: string; tasksDue: number; urgent: number; meetingHours: number; label: string };

export async function fetchCapacity(userId: string, days = 7): Promise<CapacityDay[]> {
  const { data } = await createClient().rpc("capacity_calendar", { p_user: userId, p_days: days });
  return jsonArr(data).map((d) => ({ day: str(d.day), tasksDue: num(d.tasks_due), urgent: num(d.urgent), meetingHours: num(d.meeting_hours), label: str(d.label, "light") }));
}

/** Seven-day capacity strip: light / balanced / heavy / critical per day (`capacity_calendar`). */
export function CapacityStrip({ userId, days = 7, className }: { userId: string; days?: number; className?: string }) {
  const [data, setData] = React.useState<{ key: string; rows: CapacityDay[] } | null>(null);
  const key = `${userId}:${days}`;
  React.useEffect(() => {
    let alive = true;
    fetchCapacity(userId, days).then((rows) => { if (alive) setData({ key, rows }); });
    return () => { alive = false; };
  }, [userId, days, key]);
  const rows = data?.key === key ? data.rows : null;
  if (!rows) return <Skeleton className={cn("h-12", className)} />;
  if (rows.length === 0) return <div className={cn("text-xs text-muted", className)}>Capacity is visible to the person, their manager and leadership.</div>;
  return (
    <div className={cn("grid gap-1", className)} style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
      {rows.map((d) => {
        const date = new Date(d.day + "T00:00:00");
        return (
          <div key={d.day} className="rounded-[var(--radius-sm)] border px-1 py-1.5 text-center min-w-0" title={`${d.tasksDue} task${d.tasksDue === 1 ? "" : "s"} due${d.urgent ? ` (${d.urgent} urgent)` : ""} · ${d.meetingHours}h meetings`}>
            <div className="text-[10px] text-muted uppercase tracking-wide">{date.toLocaleDateString("en-IN", { weekday: "short" })}</div>
            <div className="text-xs num font-medium">{date.getDate()}</div>
            <div className="h-1.5 rounded-full mt-1" style={{ background: CAPACITY_COLOR[d.label] || "var(--neutral)" }} />
            <div className={cn("pill mt-1 w-full justify-center capitalize !px-1 !h-[18px] !text-[10px]", CAPACITY_TONE[d.label] || "tone-neutral")}>{d.label}</div>
            <div className="text-[10px] text-muted mt-0.5 num truncate">{d.tasksDue}t · {d.meetingHours}h</div>
          </div>
        );
      })}
    </div>
  );
}

export function CapacityCalendar({ userId, title = "Capacity", subtitle = "Next 7 days — tasks due and meeting hours" }: { userId: string; title?: string; subtitle?: string }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={<CalendarRange size={15} className="text-muted" />} />
      <div className="px-[var(--s4)] pb-[var(--s4)]"><CapacityStrip userId={userId} /></div>
    </Card>
  );
}
