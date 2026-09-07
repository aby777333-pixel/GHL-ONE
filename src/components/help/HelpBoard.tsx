"use client";

import * as React from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import { Blink } from "@/components/providers/ActivityProvider";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip, PriorityPill } from "@/components/tasks/TaskBits";
import { ago, cn } from "@/lib/utils";
import { SlaCountdown, type HelpRow } from "./HelpBits";
import { HELP_STATUSES, HELP_STATUS_DOT, HELP_STATUS_LABEL, isOverSla, type HelpStatus } from "./lib";

/** Kanban of help requests by status, native drag & drop. Dropping calls `onMove`. */
export function HelpBoard({ rows, now, onMove, canMove }: { rows: HelpRow[]; now: number; onMove: (id: string, status: HelpStatus) => void; canMove: boolean }) {
  const { departments } = useSession();
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<HelpStatus | null>(null);

  const byStatus = React.useMemo(() => {
    const m = new Map<HelpStatus, HelpRow[]>();
    for (const s of HELP_STATUSES) m.set(s, []);
    for (const r of rows) m.get(r.status)?.push(r);
    return m;
  }, [rows]);

  function drop(status: HelpStatus) {
    if (dragging) {
      const r = rows.find((x) => x.id === dragging);
      if (r && r.status !== status) onMove(dragging, status);
    }
    setDragging(null);
    setOverCol(null);
  }

  return (
    <div className="overflow-x-auto -mx-[var(--s4)] px-[var(--s4)] pb-2">
      <div className="flex gap-3 min-w-max">
        {HELP_STATUSES.map((s) => {
          const list = byStatus.get(s) || [];
          return (
            <div
              key={s}
              className={cn("w-[264px] shrink-0 rounded-[var(--radius)] sunken flex flex-col max-h-[calc(100dvh-280px)] min-h-[200px] transition-colors", overCol === s && dragging && "ring-2 ring-[var(--brand-2)]")}
              onDragOver={(e) => { if (!canMove) return; e.preventDefault(); if (overCol !== s) setOverCol(s); }}
              onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOverCol(null); }}
              onDrop={(e) => { e.preventDefault(); drop(s); }}
            >
              <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
                <span className="w-2 h-2 rounded-full" style={{ background: HELP_STATUS_DOT[s] }} />
                <span className="text-sm font-medium">{HELP_STATUS_LABEL[s]}</span>
                <span className="ml-auto text-xs text-muted num">{list.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                {list.length === 0 && <div className="text-[11px] text-muted text-center py-6 border border-dashed rounded-[var(--radius-sm)]">{canMove ? "Drop requests here" : "Nothing here"}</div>}
                {list.map((r) => {
                  const dept = departments.find((d) => d.id === r.department_id);
                  const over = isOverSla(r, now);
                  return (
                    <div
                      key={r.id}
                      draggable={canMove}
                      onDragStart={(e) => { setDragging(r.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", r.id); }}
                      onDragEnd={() => { setDragging(null); setOverCol(null); }}
                      className={cn("card card-hover p-2.5 select-none", canMove && "cursor-grab active:cursor-grabbing", dragging === r.id && "opacity-50")}
                      style={over ? { borderColor: "var(--danger)" } : undefined}
                    >
                      <div className="flex items-start gap-1.5">
                        {canMove && <GripVertical size={13} className="text-muted mt-0.5 shrink-0 hidden sm:block" />}
                        <Link href={`/help/${r.id}`} className="text-sm leading-snug flex-1 min-w-0 hover:underline" draggable={false}>
                          {r.title} <Blink zone={`help:${r.id}`} />
                        </Link>
                      </div>
                      <div className="text-[11px] text-muted truncate mt-1">{dept?.name || "Department"} · {ago(r.created_at)}</div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        <PriorityPill priority={r.priority} />
                        <SlaCountdown r={r} now={now} />
                        <span className="ml-auto"><PersonChip id={r.owner_id} showName={false} size={20} /></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
