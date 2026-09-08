"use client";

/**
 * The strip an entity page shows: "Huddle in progress · 3 people · Join" when something is live for this
 * project / task / channel / department / help request / incident / meeting — otherwise a Collaborate button.
 *
 * Additive by design: drop it into an existing top-actions cluster next to `<BuddyQuickActions/>`.
 */

import * as React from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ROOM_KIND_LABEL, type CollabAction, type CollabContext, type RoomKind } from "@/lib/live/types";
import { CollaborateButton, EXTRA_ACTIONS } from "./CollaborateButton";

type LiveNow = { id: string; title: string; kind: RoomKind; people: number };

type LiveCol = "incident_id" | "meeting_id" | "help_request_id" | "task_id" | "channel_id" | "project_id" | "department_id" | "team_id";

/** Which `live_rooms` column this context maps to (first match wins — most specific first). */
function columnFor(ctx: CollabContext): [LiveCol, string] | null {
  if (ctx.incidentId) return ["incident_id", ctx.incidentId];
  if (ctx.meetingId) return ["meeting_id", ctx.meetingId];
  if (ctx.helpId) return ["help_request_id", ctx.helpId];
  if (ctx.taskId) return ["task_id", ctx.taskId];
  if (ctx.channelId) return ["channel_id", ctx.channelId];
  if (ctx.projectId) return ["project_id", ctx.projectId];
  if (ctx.departmentId) return ["department_id", ctx.departmentId];
  if (ctx.teamId) return ["team_id", ctx.teamId];
  return null;
}

export function EntityLive({
  ctx,
  compact,
  size = "sm",
  include,
  exclude,
  label,
  className,
}: {
  ctx: CollabContext;
  compact?: boolean;
  size?: "xs" | "sm";
  include?: (keyof typeof EXTRA_ACTIONS)[];
  exclude?: CollabAction[];
  label?: string;
  className?: string;
}) {
  const [live, setLive] = React.useState<LiveNow | null>(null);
  const col = columnFor(ctx);
  const key = col ? `${col[0]}:${col[1]}` : "";

  React.useEffect(() => {
    if (!col) return;
    let alive = true;
    const load = async () => {
      const sb = createClient();
      const { data } = await sb
        .from("live_rooms")
        .select("id,title,kind,status")
        .eq(col[0], col[1])
        .eq("status", "live")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      if (!data) {
        setLive(null);
        return;
      }
      const { count } = await sb
        .from("live_participants")
        .select("user_id", { count: "exact", head: true })
        .eq("room_id", data.id)
        .is("left_at", null);
      if (!alive) return;
      setLive({ id: data.id, title: data.title, kind: data.kind as RoomKind, people: count || 0 });
    };
    void load();
    const id = setInterval(load, 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (live) {
    const kind = ROOM_KIND_LABEL[live.kind] || "Room";
    return (
      <Link
        href={`/live/${live.id}`}
        className={cn(
          "inline-flex items-center gap-2 rounded-full pl-2 pr-1 h-8 border text-xs min-w-0 max-w-full",
          "border-[var(--success)] bg-[color-mix(in_oklab,var(--success)_12%,var(--bg-elev))]",
          className
        )}
        title={`${kind} in progress — join`}
      >
        <span className="blink-dot shrink-0" style={{ width: 7, height: 7, ["--blink" as string]: "var(--success)" }} />
        <span className="truncate font-medium">
          {compact ? kind : `${kind} in progress`}
          {live.people > 0 && <span className="text-muted font-normal"> · {live.people} {live.people === 1 ? "person" : "people"}</span>}
        </span>
        <span className="btn btn-success btn-xs shrink-0">Join</span>
      </Link>
    );
  }

  return <CollaborateButton ctx={ctx} size={size} compact={compact} include={include} exclude={exclude} label={label} className={className} />;
}

/** Prominent variant for war rooms / incidents — same data, louder. */
export function EntityLiveBanner({ ctx, hint }: { ctx: CollabContext; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      <span className="inline-flex items-center gap-1.5 text-xs text-muted shrink-0">
        <Radio size={13} className="text-[var(--brand-2)]" /> {hint || "Get everyone in one place"}
      </span>
      <EntityLive ctx={ctx} include={["war_room"]} label="Collaborate" />
    </div>
  );
}
