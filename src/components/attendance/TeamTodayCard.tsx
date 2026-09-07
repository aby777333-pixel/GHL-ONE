"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Card, CardHeader, Skeleton } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { cn } from "@/lib/utils";
import { istDay, istTime, type BoardRow } from "./attendanceUtils";

/** "Team today" strip for the manager home: live counts + who is in, from `attendance_board(today)`. */
export function TeamTodayCard({ departmentId, className }: { departmentId?: string | null; className?: string }) {
  const { profile } = useSession();
  const [rows, setRows] = React.useState<BoardRow[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    const supabase = createClient();
    const load = () => supabase.rpc("attendance_board", { p_day: istDay() }).then(({ data }) => alive && setRows((data || []) as BoardRow[]));
    load();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase.channel("team-today").on("postgres_changes", { event: "INSERT", schema: "public", table: "attendance_events" }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 800);
    }).subscribe();
    return () => { alive = false; if (timer) clearTimeout(timer); supabase.removeChannel(ch); };
  }, []);

  const scope = (rows || []).filter((r) => r.user_id !== profile.id && (!departmentId || r.department_id === departmentId));
  const inNow = scope.filter((r) => r.first_in && !r.last_out);
  const remote = scope.filter((r) => ["remote", "field", "travel", "training"].includes(r.att_status));
  const late = scope.filter((r) => r.late);
  const leave = scope.filter((r) => r.on_leave || r.att_status === "leave");
  const notYet = scope.filter((r) => !r.first_in && !r.on_leave && r.att_status !== "leave");

  const stats: { label: string; value: number; tone: string }[] = [
    { label: "In now", value: inNow.length, tone: "text-success" },
    { label: "Remote / field", value: remote.length, tone: "text-info" },
    { label: "Late", value: late.length, tone: late.length ? "text-warn" : "text-muted" },
    { label: "Not yet in", value: notYet.length, tone: notYet.length ? "text-warn" : "text-muted" },
    { label: "On leave", value: leave.length, tone: "text-muted" },
  ];

  return (
    <Card className={className}>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Users size={15} className="text-muted" /> Team today <Blink zone="nav:/attendance" /></span>} subtitle={rows ? `${scope.length} people · live` : "Loading…"} action={<Link href="/attendance?tab=team" className="text-xs text-muted hover:text-[var(--fg)] inline-flex items-center gap-1">Team board <ArrowRight size={12} /></Link>} />
      <div className="px-[var(--s4)] pb-[var(--s4)]">
        {!rows ? (
          <div className="space-y-2"><Skeleton className="h-9" /><Skeleton className="h-7 w-2/3" /></div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-2">
              {stats.map((s) => (
                <div key={s.label} className="min-w-0">
                  <div className={cn("text-[1.25rem] font-semibold num leading-tight", s.tone)}>{s.value}</div>
                  <div className="text-[11px] text-muted leading-tight truncate">{s.label}</div>
                </div>
              ))}
            </div>
            {inNow.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {inNow.slice(0, 14).map((r) => (
                  <Link key={r.user_id} href={`/people/${r.user_id}`} className="inline-flex items-center gap-1.5 pill tone-neutral hover:bg-[var(--line)]" title={`${r.full_name} · in since ${istTime(r.first_in)}${r.status_text ? " · " + r.status_text : ""}`}>
                    <Avatar name={r.full_name} src={r.avatar_url} size={16} presence={r.presence} />
                    <span className="truncate max-w-[110px]">{r.full_name.split(" ")[0]}</span>
                    <Blink zone={`user:${r.user_id}`} size={5} />
                  </Link>
                ))}
                {inNow.length > 14 && <span className="pill tone-muted">+{inNow.length - 14}</span>}
              </div>
            )}
            {notYet.length > 0 && <div className="text-[11px] text-muted mt-2 truncate">Not yet in: {notYet.slice(0, 6).map((r) => r.full_name.split(" ")[0]).join(", ")}{notYet.length > 6 ? ` +${notYet.length - 6}` : ""}</div>}
          </>
        )}
      </div>
    </Card>
  );
}
