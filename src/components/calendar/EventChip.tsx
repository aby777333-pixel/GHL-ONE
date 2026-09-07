"use client";

import { cn } from "@/lib/utils";
import { KIND_COLOR, timeLabel, type CalItem } from "./calendarUtils";

/** Compact coloured chip used in month/week cells. */
export function EventChip({ item, onClick, showTime = true, className }: { item: CalItem; onClick: (i: CalItem) => void; showTime?: boolean; className?: string }) {
  const c = KIND_COLOR[item.kind];
  return (
    <button
      type="button"
      onClick={() => onClick(item)}
      title={`${timeLabel(item)} · ${item.title}`}
      className={cn("w-full text-left rounded-[6px] px-1.5 py-[3px] text-[11px] leading-tight truncate transition-colors hover:brightness-95", className)}
      style={{ background: `color-mix(in oklab, ${c} 14%, transparent)`, borderLeft: `3px solid ${c}`, color: "var(--fg)" }}
    >
      {showTime && !item.all_day && <span className="num text-muted mr-1">{timeLabel(item).split("–")[0]}</span>}
      {item.title}
    </button>
  );
}

export function KindDot({ kind, size = 6 }: { kind: CalItem["kind"]; size?: number }) {
  return <span className="inline-block rounded-full shrink-0" style={{ width: size, height: size, background: KIND_COLOR[kind] }} />;
}
