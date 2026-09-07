"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, Pill, Skeleton } from "@/components/ui";
import type { Database } from "@/lib/database.types";
import { dayLabel, fmtMinutes } from "./attendanceUtils";
import { EXCEPTION_LABEL, EXCEPTION_TONE } from "@/components/workforce/lib";

type Row = Database["public"]["Functions"]["my_attendance_exceptions"]["Returns"][number];

/**
 * The person's own attendance exceptions (`my_attendance_exceptions`) — exactly what a manager or HR would see
 * on Workforce Live, shown to the person first. Transparency, not surveillance.
 */
export function MyExceptions({ from, to, compact }: { from: string; to: string; compact?: boolean }) {
  const [loaded, setLoaded] = React.useState<{ key: string; rows: Row[] } | null>(null);
  const key = `${from}|${to}`;
  const loading = !loaded || loaded.key !== key;

  React.useEffect(() => {
    let alive = true;
    createClient().rpc("my_attendance_exceptions", { p_from: from, p_to: to }).then(({ data }) => { if (alive) setLoaded({ key: `${from}|${to}`, rows: (data || []) as Row[] }); });
    return () => { alive = false; };
  }, [from, to]);

  const rows = loaded?.rows || [];
  const body = loading ? (
    <div className="space-y-2"><Skeleton className="h-5" /><Skeleton className="h-5 w-2/3" /></div>
  ) : rows.length === 0 ? (
    <div className="text-xs text-muted">Nothing flagged in this period. Late arrivals, early leaves, missing check-outs, short days, long breaks and absences would appear here — the same list your manager sees.</div>
  ) : (
    <ul className="divide-y rounded-[var(--radius-sm)] border">
      {rows.map((r, i) => (
        <li key={`${r.day}-${r.kind}-${i}`} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
          <span className="num text-xs w-[64px] shrink-0">{dayLabel(r.day, { day: "numeric", month: "short" })}</span>
          <Pill tone={EXCEPTION_TONE[r.kind] || "tone-neutral"}>{EXCEPTION_LABEL[r.kind] || r.kind}</Pill>
          <span className="text-xs text-muted truncate flex-1">{r.detail}</span>
          {r.minutes != null && <span className="text-[11px] text-muted num shrink-0">{fmtMinutes(r.minutes)}</span>}
        </li>
      ))}
    </ul>
  );

  if (compact) return body;
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><AlertTriangle size={15} className="text-muted" /> My exceptions</span>} subtitle="What would be flagged about your attendance — you see it first" action={!loading ? <Pill tone={rows.length ? "tone-warn" : "tone-muted"}>{rows.length}</Pill> : undefined} />
      <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2">
        {body}
        <div className="text-[11px] text-muted flex items-start gap-1.5"><Eye size={12} className="shrink-0 mt-0.5" /> Wrong? <Link href="/attendance?tab=corrections" className="link">Request a correction</Link> — it becomes a tracked request with a note you can read.</div>
      </div>
    </Card>
  );
}
