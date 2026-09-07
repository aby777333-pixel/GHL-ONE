"use client";

import * as React from "react";
import { Hand } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui";
import { usePerson } from "@/components/providers/SessionProvider";
import { ago, cn } from "@/lib/utils";
import { jsonObj, num, str } from "@/components/intel/lib";

export type BallInfo = { with: string | null; withId: string | null; state: string; since: string | null; blockedBy: number };

export async function fetchBall(type: string, id: string): Promise<BallInfo | null> {
  const { data, error } = await createClient().rpc("who_has_ball", { p_type: type, p_id: id });
  if (error || !data) return null;
  const o = jsonObj(data);
  return { with: typeof o.with === "string" ? o.with : null, withId: typeof o.with_id === "string" ? o.with_id : null, state: str(o.state), since: typeof o.since === "string" ? o.since : null, blockedBy: num(o.blocked_by) };
}

/** "With: Priya · Waiting — approval · since 2d" — who currently holds the ball for a task / request / help request / approval / project. */
export function WhoHasBall({ type, id, size = "lg", className, refreshKey }: { type: "task" | "request" | "help_request" | "approval" | "project"; id: string; size?: "sm" | "lg"; className?: string; refreshKey?: string | number }) {
  const [info, setInfo] = React.useState<{ key: string; ball: BallInfo | null } | null>(null);
  const key = `${type}:${id}:${refreshKey ?? ""}`;
  React.useEffect(() => {
    let alive = true;
    fetchBall(type, id).then((ball) => { if (alive) setInfo({ key, ball }); });
    return () => { alive = false; };
  }, [type, id, key]);
  const ball = info?.key === key ? info.ball : null;
  const person = usePerson(ball?.withId);
  if (!ball || (!ball.with && !ball.state)) return null;
  const state = ball.state.replace(/_/g, " ");
  return (
    <span className={cn("pill tone-neutral max-w-full", size === "lg" && "pill-lg", className)} title="Who has the ball right now">
      <Hand size={11} className="shrink-0" />
      {ball.withId ? <Avatar name={person?.full_name || ball.with} src={person?.avatar_url} size={14} /> : null}
      <span className="truncate">With: {ball.with || "nobody"}{state ? ` · ${state}` : ""}{ball.since ? ` · since ${ago(ball.since)}` : ""}{ball.blockedBy ? ` · ${ball.blockedBy} blocked` : ""}</span>
    </span>
  );
}
