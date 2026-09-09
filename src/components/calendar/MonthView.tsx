"use client";

import * as React from "react";
import { format, isSameDay, isSameMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { itemsForDay, monthGrid, timeLabel, type CalItem } from "./calendarUtils";
import { EventChip, KindDot } from "./EventChip";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthView({ cursor, items, today, selected, onSelect, onOpen }: { cursor: Date; items: CalItem[]; today: Date; selected: Date | null; onSelect: (d: Date) => void; onOpen: (i: CalItem) => void }) {
  const days = monthGrid(cursor);
  const selectedItems = selected ? itemsForDay(items, selected) : [];

  /*
    The day's detail panel sits under a six-row month grid, so picking a date near the top of the
    month put its events below the fold and people reported that clicking a date "did nothing".
    Bring the panel into view whenever the selection changes. `block: "nearest"` means an already
    visible panel does not jump.
  */
  const detailRef = React.useRef<HTMLDivElement>(null);
  const selectedKey = selected ? selected.toDateString() : null;
  React.useEffect(() => {
    if (!selectedKey) return;
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedKey]);

  return (
    <div>
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-[var(--bg-sunken)]">
          {DOW.map((d) => (
            <div key={d} className="text-center text-[11px] font-medium text-muted py-1.5">{d.slice(0, 1)}<span className="hidden sm:inline">{d.slice(1)}</span></div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            const dayItems = itemsForDay(items, day);
            const inMonth = isSameMonth(day, cursor);
            const isToday = isSameDay(day, today);
            const isSel = selected ? isSameDay(day, selected) : false;
            const shown = dayItems.slice(0, 3);
            const rest = dayItems.length - shown.length;
            return (
              <div
                key={day.toISOString()}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(day)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(day)}
                className={cn(
                  "min-h-[52px] sm:min-h-[104px] p-1 sm:p-1.5 border-b border-r cursor-pointer transition-colors hover:bg-[var(--neutral-bg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-2)] ring-inset",
                  (idx + 1) % 7 === 0 && "border-r-0",
                  idx >= 35 && "border-b-0",
                  !inMonth && "bg-[color-mix(in_oklab,var(--bg-sunken)_60%,transparent)]",
                  isSel && "bg-[color-mix(in_oklab,var(--brand)_8%,transparent)]"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded-full text-xs num", isToday ? "bg-[var(--brand)] text-[var(--brand-fg)] font-semibold" : !inMonth ? "text-muted opacity-50" : "text-[var(--fg-2)]")}>{format(day, "d")}</span>
                  {dayItems.length > 0 && <span className="hidden sm:inline text-[10px] text-muted num">{dayItems.length}</span>}
                </div>
                {/* desktop: chips */}
                <div className="hidden sm:flex flex-col gap-0.5 mt-1">
                  {shown.map((i) => (
                    <EventChip key={i.id} item={i} onClick={(it) => onOpen(it)} />
                  ))}
                  {rest > 0 && <span className="text-[10px] text-muted px-1">+{rest} more</span>}
                </div>
                {/* mobile: dots */}
                <div className="flex sm:hidden flex-wrap gap-[3px] mt-1.5 justify-center">
                  {dayItems.slice(0, 4).map((i) => (
                    <KindDot key={i.id} kind={i.kind} size={5} />
                  ))}
                  {dayItems.length > 4 && <span className="text-[9px] text-muted leading-none">+{dayItems.length - 4}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div ref={detailRef} className="card mt-[var(--s3)] anim-fade-up scroll-mt-[var(--topbar-h)]">
          <div className="flex items-center justify-between px-[var(--s4)] pt-[var(--s3)] pb-[var(--s2)]">
            <div className="h3">{format(selected, "EEEE, d MMMM")}</div>
            <span className="text-xs text-muted num">{selectedItems.length} item{selectedItems.length === 1 ? "" : "s"}</span>
          </div>
          <div className="px-[var(--s3)] pb-[var(--s3)] space-y-1">
            {selectedItems.length === 0 && <div className="text-sm text-muted px-2 py-2">Nothing on this day.</div>}
            {selectedItems.map((i) => (
              <button key={i.id} onClick={() => onOpen(i)} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] row-hover text-left">
                <KindDot kind={i.kind} size={8} />
                <span className="text-xs text-muted num w-[84px] shrink-0">{timeLabel(i)}</span>
                <span className="text-sm truncate flex-1">{i.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
