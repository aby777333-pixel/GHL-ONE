"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Pill, Skeleton } from "@/components/ui";
import { cn, fmtDate } from "@/lib/utils";
import { WhatIfAbsent } from "@/components/people/WhatIfAbsent";
import { bool, jsonArr, jsonObj, num, str, strArr } from "@/components/intel/lib";

type Collisions = { days: { day: string; alsoAway: string[]; sameTeam: number; coverage: string }[]; maxSameDay: number; backupAway: boolean };

/** "What breaks if approved?" — coverage collisions (`leave_collisions`, 0019) + the person's what-if analysis. Shown inside the leave approval row. */
export function LeaveImpact({ leaveId, userId, from, to }: { leaveId: string; userId: string; from: string; to: string }) {
  const [c, setC] = React.useState<{ key: string; data: Collisions | null } | null>(null);
  React.useEffect(() => {
    let alive = true;
    createClient().rpc("leave_collisions", { p_leave: leaveId }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { setC({ key: leaveId, data: null }); return; }
      const o = jsonObj(data);
      setC({ key: leaveId, data: { days: jsonArr(o.days).map((d) => ({ day: str(d.day), alsoAway: strArr(d.also_away), sameTeam: num(d.same_team), coverage: str(d.coverage) })), maxSameDay: num(o.max_leave_same_day, 1), backupAway: bool(o.backup_away) } });
    });
    return () => { alive = false; };
  }, [leaveId]);
  const data = c?.key === leaveId ? c.data : undefined;
  const risky = data ? data.days.filter((d) => d.alsoAway.length >= data.maxSameDay || d.coverage === "high" || d.coverage === "critical") : [];

  return (
    <div className="mt-3 space-y-3 anim-fade-in">
      <div className="rounded-[var(--radius-sm)] border px-3 py-2 text-sm">
        <div className="flex items-center gap-2 flex-wrap mb-1"><Users size={14} className="text-muted" /><span className="font-medium">Coverage</span>{data && (risky.length === 0 && !data.backupAway ? <Pill tone="tone-success"><CheckCircle2 size={10} /> No collisions</Pill> : <Pill tone="tone-warn"><AlertTriangle size={10} /> {risky.length ? `${risky.length} day${risky.length > 1 ? "s" : ""} thin` : ""}{risky.length && data.backupAway ? " · " : ""}{data.backupAway ? "backup also away" : ""}</Pill>)}</div>
        {data === undefined ? <Skeleton /> : data === null ? <div className="text-xs text-muted">Coverage details are not available for this request.</div> : (
          <div className="flex flex-wrap gap-1.5">
            {data.days.map((d) => {
              const thin = d.alsoAway.length >= data.maxSameDay || d.coverage === "high" || d.coverage === "critical";
              return <span key={d.day} className={cn("pill", thin ? "tone-warn" : "tone-neutral")} title={d.alsoAway.length ? `Also away: ${d.alsoAway.join(", ")}` : "Nobody else from the department is away"}>{fmtDate(d.day)}{d.alsoAway.length ? ` · +${d.alsoAway.length} away` : ""}{d.coverage && d.coverage !== "ok" && d.coverage !== "low" ? ` · ${d.coverage}` : ""}</span>;
            })}
            {data.days.some((d) => d.alsoAway.length > 0) && <div className="w-full text-[11px] text-muted">Also away: {[...new Set(data.days.flatMap((d) => d.alsoAway))].join(", ")} · department limit {data.maxSameDay} per day</div>}
          </div>
        )}
      </div>
      <WhatIfAbsent userId={userId} from={from} to={to} fixedRange compact title="What breaks if approved?" />
    </div>
  );
}
