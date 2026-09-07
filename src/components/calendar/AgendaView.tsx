"use client";

import { addDays, format, isSameDay } from "date-fns";
import { CalendarDays } from "lucide-react";
import { EmptyState, Pill } from "@/components/ui";
import { cn, relDate } from "@/lib/utils";
import { itemsForDay, timeLabel, KIND_SINGULAR, type CalItem } from "./calendarUtils";
import { KindDot } from "./EventChip";

/** Next 30 days, grouped by day, empty days skipped. */
export function AgendaView({ items, today, onOpen, projectName }: { items: CalItem[]; today: Date; onOpen: (i: CalItem) => void; projectName: (id?: string | null) => string | undefined }) {
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i)).map((d) => ({ d, items: itemsForDay(items, d) })).filter((x) => x.items.length > 0);
  if (days.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={<CalendarDays size={18} />} title="Nothing in the next 30 days" hint="Meetings, deadlines and events matching your filters will appear here." />
      </div>
    );
  }
  return (
    <div className="space-y-[var(--s3)]">
      {days.map(({ d, items: dayItems }) => (
        <section key={d.toISOString()} className="card">
          <div className={cn("flex items-baseline gap-2 px-[var(--s4)] pt-[var(--s3)] pb-[var(--s2)]", isSameDay(d, today) && "text-[var(--brand)]")}>
            <span className="h3">{relDate(d)}</span>
            <span className="text-xs text-muted">{format(d, "EEEE, d MMM")}</span>
            <span className="ml-auto text-xs text-muted num">{dayItems.length}</span>
          </div>
          <div className="px-[var(--s3)] pb-[var(--s3)] space-y-0.5">
            {dayItems.map((i) => (
              <button key={i.id} onClick={() => onOpen(i)} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] row-hover text-left">
                <KindDot kind={i.kind} size={8} />
                <span className="text-xs text-muted num w-[84px] shrink-0">{timeLabel(i)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{i.title}</span>
                  {projectName(i.project_id) && <span className="block text-[11px] text-muted truncate">{projectName(i.project_id)}</span>}
                </span>
                <Pill tone="tone-neutral" className="hidden sm:inline-flex">{KIND_SINGULAR[i.kind]}</Pill>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
