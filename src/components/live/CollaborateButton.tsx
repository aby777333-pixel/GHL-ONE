"use client";

/**
 * The universal COLLABORATE control.
 *
 * It never performs an action itself — it only hands a `CollabContext` and (optionally) a preselected
 * `CollabAction` to the global store via `openCollaborate()`. `CollaborateMenu` (mounted once in AppShell)
 * does the work, so the same button behaves identically on every page.
 */

import * as React from "react";
import { Video, Phone, Radio, MonitorUp, PenTool, CircleDot, CalendarPlus, FileText, Users, DoorOpen, Flame, Clapperboard, Sparkles, type LucideIcon } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { CollabAction, CollabContext } from "@/lib/live/types";
import { openCollaborate } from "./liveStore";

export type CollabActionMeta = { action: CollabAction; label: string; icon: LucideIcon; hint: string };

/** The full palette, in the order the spec lists it. */
export const COLLAB_ACTIONS: CollabActionMeta[] = [
  { action: "voice", label: "Voice call", icon: Phone, hint: "Audio only — the lightest way to talk" },
  { action: "video", label: "Video call", icon: Video, hint: "Camera on, one tap" },
  { action: "huddle", label: "Huddle", icon: Radio, hint: "Drop-in room anyone here can join" },
  { action: "screen", label: "Screen share", icon: MonitorUp, hint: "Show what you are looking at" },
  { action: "whiteboard", label: "Whiteboard", icon: PenTool, hint: "Draw it out together" },
  { action: "record", label: "Screen recording", icon: CircleDot, hint: "Record instead of meeting" },
  { action: "meeting", label: "Meeting", icon: CalendarPlus, hint: "Schedule it properly" },
  { action: "doc", label: "Live document", icon: FileText, hint: "Write together, right now" },
  { action: "group", label: "Quick group", icon: Users, hint: "Pull a few people into one room" },
];

export const EXTRA_ACTIONS: Record<"knock" | "war_room" | "video_note", CollabActionMeta> = {
  knock: { action: "knock", label: "Knock", icon: DoorOpen, hint: "Ask before you interrupt" },
  war_room: { action: "war_room", label: "War room", icon: Flame, hint: "Everyone in, now" },
  video_note: { action: "video_note", label: "Video note", icon: Clapperboard, hint: "Async 60-second update" },
};

export function CollaborateButton({
  ctx,
  size = "sm",
  variant = "secondary",
  label = "Collaborate",
  className,
  compact,
  include,
  exclude,
}: {
  ctx: CollabContext;
  size?: "xs" | "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
  label?: string;
  className?: string;
  /** Icon-only trigger (still labelled for screen readers). */
  compact?: boolean;
  /** Append extra actions (knock / war room / video note). */
  include?: (keyof typeof EXTRA_ACTIONS)[];
  /** Hide actions that make no sense here. */
  exclude?: CollabAction[];
}) {
  const list = React.useMemo(() => {
    const base = COLLAB_ACTIONS.filter((a) => !exclude?.includes(a.action));
    const extra = (include || []).map((k) => EXTRA_ACTIONS[k]).filter((a) => !exclude?.includes(a.action));
    return [...extra, ...base];
  }, [include, exclude]);

  return (
    <Menu
      width={244}
      trigger={
        <button
          type="button"
          className={cn("btn", `btn-${variant}`, size !== "md" && `btn-${size}`, compact && "btn-icon", className)}
          aria-label="Collaborate on this"
          title="Collaborate — call, huddle, share, write together"
        >
          <Sparkles size={size === "xs" ? 12 : 14} className="text-[var(--brand-2)]" />
          {!compact && <span className="hidden sm:inline">{label}</span>}
        </button>
      }
    >
      <div className="eyebrow px-2.5 pt-1.5 pb-1">GHL LIVE</div>
      {list.map((a) => (
        <MenuItem key={a.action} icon={<a.icon size={14} />} onClick={() => openCollaborate(ctx, a.action)}>
          <span className="truncate" title={a.hint}>{a.label}</span>
        </MenuItem>
      ))}
      <div className="my-1 border-t" />
      <MenuItem icon={<Sparkles size={14} className="text-[var(--brand-2)]" />} onClick={() => openCollaborate(ctx, null)}>
        More options…
      </MenuItem>
    </Menu>
  );
}
