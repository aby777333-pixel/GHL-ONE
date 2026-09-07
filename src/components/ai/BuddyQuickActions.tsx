"use client";

import * as React from "react";
import { LifeBuoy, Sparkles } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui";
import type { BuddyMode, BuddyScope } from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import { MODE_META } from "./buddyModes";
import { openBuddy } from "./buddyStore";
import { useAIStatus } from "./useAIStatus";

export type QuickAction = { label: string; mode: BuddyMode; message?: string };

const DEFAULT_ACTIONS: QuickAction[] = [
  { label: "What am I looking at", mode: "looking_at" },
  { label: "What next", mode: "what_next" },
  { label: "Who can help", mode: "who_can_help" },
  { label: "Why blocked", mode: "why_blocked" },
  { label: "Explain", mode: "explain_simple", message: "Explain this simply" },
  { label: "Check my work", mode: "check", message: "Check my work on this" },
  { label: "Prepare me", mode: "prepare" },
  { label: "I'm stuck", mode: "stuck" },
];

/**
 * Universal buddy buttons for entity pages (task, project, file, help request, meeting, chat).
 * One compact trigger that opens GHL Buddy with the right mode + scope. Hidden when AI is off.
 */
export function BuddyQuickActions({ scope, actions, extra, size = "sm", label = "Buddy", className }: {
  scope: BuddyScope;
  /** Replace the default list. */
  actions?: QuickAction[];
  /** Appended after the defaults (e.g. chat: Summarise / Unresolved / Tasks we agreed). */
  extra?: QuickAction[];
  size?: "xs" | "sm";
  label?: string;
  className?: string;
}) {
  const ai = useAIStatus();
  if (ai.loading || !ai.enabled) return null;
  const list = (actions || DEFAULT_ACTIONS).filter((a) => !MODE_META[a.mode].needsTask || scope.taskId);
  const run = (a: QuickAction) => openBuddy({ mode: a.mode, scope, message: a.message, send: true });
  return (
    <Menu
      width={240}
      trigger={
        <button type="button" className={cn("btn btn-secondary", size === "xs" ? "btn-xs" : "btn-sm", className)} aria-label="Ask GHL Buddy about this" title="Ask GHL Buddy about this">
          <Sparkles size={size === "xs" ? 12 : 14} className="text-[var(--accent)]" /> <span className="hidden sm:inline">{label}</span>
        </button>
      }
    >
      <div className="eyebrow px-2.5 pt-1.5 pb-1">GHL Buddy</div>
      {list.map((a) => {
        const Icon = a.mode === "stuck" ? LifeBuoy : MODE_META[a.mode].icon;
        return (
          <MenuItem key={`${a.mode}:${a.label}`} icon={<Icon size={14} className={a.mode === "stuck" ? "text-[var(--violet)]" : undefined} />} onClick={() => run(a)}>
            <span className={cn(a.mode === "stuck" && "font-semibold")}>{a.label}</span>
          </MenuItem>
        );
      })}
      {!!extra?.length && (
        <>
          <div className="my-1 border-t" />
          {extra.map((a) => {
            const Icon = MODE_META[a.mode].icon;
            return <MenuItem key={`x:${a.label}`} icon={<Icon size={14} />} onClick={() => run(a)}>{a.label}</MenuItem>;
          })}
        </>
      )}
    </Menu>
  );
}
