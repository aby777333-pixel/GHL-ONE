"use client";

import { format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { itemsForDay, timeLabel, weekDays, type CalItem } from "./calendarUtils";
import { EventChip, KindDot } from "./EventChip";

export function WeekView({ cursor, items, today, onOpen }: { cursor: Date; items: CalItem[]; today: Date; onOpen: (i: CalItem) => void }) {
  const days = weekDays(cursor);
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-7">
        {days.map((day, idx) => {
          const dayItems = itemsForDay(items, day);
          const allDay = dayItems.filter((i) => i.all_day);
          const timed = dayItems.filter((i) => !i.all_day);
          const isToday = isSameDay(day, today);
          return (
            <div key={day.toISOString()} className={cn("min-w-0 border-b md:border-b-0 md:border-r last:border-r-0 last:border-b-0", isToday && "bg-[color-mix(in_oklab,var(--brand)_5%,transparent)]")}>
              <div className={cn("flex md:flex-col items-center md:items-start gap-2 md:gap-0 px-3 py-2 border-b bg-[var(--bg-sunken)]", idx === 0 && "md:rounded-tl-[var(--radius)]")}>
                <span className="text-[11px] uppercase tracking-wide text-muted">{format(day, "EEE")}</span>
                <span className={cn("inline-flex items-center justify-center w-7 h-7 rounded-full text-sm num", isToday ? "bg-[var(--brand)] text-[var(--brand-fg)] font-semibold" : "")}>{format(day, "d")}</span>
                {dayItems.length > 0 && <span className="md:hidden ml-auto text-[11px] text-muted num">{dayItems.length}</span>}
              </div>
              {allDay.length > 0 && (
                <div className="px-2 pt-2 flex flex-col gap-0.5 border-b pb-2">
                  {allDay.map((i) => (
                    <EventChip key={i.id} item={i} onClick={onOpen} showTime={false} />
                  ))}
                </div>
              )}
              <div className="px-2 py-2 space-y-1 min-h-[48px] md:min-h-[200px]">
                {dayItems.length === 0 && <div className="text-[11px] text-muted px-1">—</div>}
                {timed.map((i) => (
                  <button key={i.id} onClick={() => onOpen(i)} className="w-full text-left flex items-start gap-2 px-1.5 py-1 rounded-[6px] row-hover">
                    <KindDot kind={i.kind} size={7} />
                    <span className="min-w-0 flex-1 -mt-0.5">
                      <span className="block text-[11px] text-muted num leading-tight">{timeLabel(i)}</span>
                      <span className="block text-xs leading-snug truncate-2">{i.title}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
