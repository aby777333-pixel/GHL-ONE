"use client";

import * as React from "react";
import { AlertTriangle, Clock, ShieldAlert, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Pill } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";
import { jsonObj, num, strArr } from "@/components/intel/lib";

/**
 * Shown while scheduling: "You already have X h of meetings that day" (`meeting_load`) and
 * "this falls inside a protected focus window" (`in_focus_window`). Warnings only — never blocks.
 */
export function MeetingLoadWarning({ day, startsAt, departmentId, addMinutes = 0 }: { day: string; startsAt?: string | null; departmentId?: string | null; addMinutes?: number }) {
  const { profile } = useSession();
  const [state, setState] = React.useState<{ key: string; hours: number; meetings: number; focusLeft: number; inFocus: boolean } | null>(null);
  const key = `${day}|${startsAt || ""}|${departmentId || ""}`;
  React.useEffect(() => {
    if (!day) return;
    let alive = true;
    const t = setTimeout(async () => {
      const sb = createClient();
      const [{ data: load }, focus] = await Promise.all([
        sb.rpc("meeting_load", { p_user: profile.id, p_day: day }),
        startsAt && departmentId ? sb.rpc("in_focus_window", { p_department: departmentId, p_at: startsAt }) : Promise.resolve({ data: false }),
      ]);
      if (!alive) return;
      const o = jsonObj(load);
      setState({ key, hours: num(o.hours), meetings: num(o.meetings), focusLeft: num(o.focus_hours_left), inFocus: focus.data === true });
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [day, startsAt, departmentId, key, profile.id]);
  const s = state?.key === key ? state : null;
  if (!s) return null;
  const total = s.hours + addMinutes / 60;
  const heavy = total >= 4;
  if (!heavy && !s.inFocus && s.meetings === 0) return null;
  return (
    <div className="space-y-1">
      {s.meetings > 0 && (
        <div className={cn("text-xs rounded-[var(--radius-sm)] border px-2.5 py-1.5 flex items-start gap-1.5", heavy ? "tone-warn" : "text-muted")}>
          <Clock size={12} className="mt-0.5 shrink-0" />
          <span>You already have <b className="num">{s.hours}h</b> of meetings across {s.meetings} meeting{s.meetings > 1 ? "s" : ""} that day{addMinutes ? <> — this makes it <b className="num">{Math.round(total * 10) / 10}h</b></> : null}.{heavy ? " Could this be an async thread or a shorter slot?" : ""}</span>
        </div>
      )}
      {s.inFocus && <div className="text-xs rounded-[var(--radius-sm)] border px-2.5 py-1.5 flex items-start gap-1.5 tone-warn"><ShieldAlert size={12} className="mt-0.5 shrink-0" /><span>This time falls inside the department&apos;s protected focus window. Move it unless it is urgent.</span></div>}
    </div>
  );
}

/** "6 people × 1h = 6 person-hours · 2 already over 5h of meetings" — on the meeting room header. */
export function MeetingCostLine({ meetingId, className }: { meetingId: string; className?: string }) {
  const [cost, setCost] = React.useState<{ participants: number; hours: number; personHours: number; overloaded: string[] } | null>(null);
  React.useEffect(() => {
    let alive = true;
    createClient().rpc("meeting_cost", { p_meeting: meetingId }).then(({ data }) => {
      if (!alive) return;
      const o = jsonObj(data);
      setCost({ participants: num(o.participants), hours: num(o.hours), personHours: num(o.person_hours), overloaded: strArr(o.overloaded) });
    });
    return () => { alive = false; };
  }, [meetingId]);
  if (!cost || !cost.participants) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted flex-wrap", className)} title="What this meeting costs the company in people-time">
      <Users size={12} /> {cost.participants} × {cost.hours}h = <b className="num text-2">{cost.personHours} person-hours</b>
      {cost.overloaded.length > 0 && <Pill tone="tone-warn"><AlertTriangle size={10} /> {cost.overloaded.length === 1 ? `${cost.overloaded[0]} is` : `${cost.overloaded.length} people are`} over 5h of meetings that day</Pill>}
    </span>
  );
}
