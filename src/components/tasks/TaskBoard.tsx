"use client";

import * as React from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import { PriorityPill, DueLabel, PersonChip, WaitingPill, type TaskRowData } from "@/components/tasks/TaskBits";
import { cn, TASK_STATUSES, STATUS_LABEL, type TaskStatus } from "@/lib/utils";

export const BOARD_STATUSES: TaskStatus[] = TASK_STATUSES.filter((s) => s !== "cancelled");

const DOT: Record<TaskStatus, string> = {
  backlog: "var(--line-strong)", todo: "var(--neutral)", in_progress: "var(--info)", in_review: "var(--violet)",
  waiting: "var(--warn)", blocked: "var(--danger)", done: "var(--success)", cancelled: "var(--fg-muted)",
};

export type BoardTask = TaskRowData & { tags?: string[] | null };

/** Kanban with native HTML5 drag & drop — no external deps. */
export function TaskBoard({ tasks, onMove, showProject = true, statuses = BOARD_STATUSES, className }: { tasks: BoardTask[]; onMove: (taskId: string, status: TaskStatus) => void; showProject?: boolean; statuses?: TaskStatus[]; className?: string }) {
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<TaskStatus | null>(null);

  const byStatus = React.useMemo(() => {
    const m = new Map<TaskStatus, BoardTask[]>();
    for (const s of statuses) m.set(s, []);
    for (const t of tasks) if (m.has(t.status)) m.get(t.status)!.push(t);
    return m;
  }, [tasks, statuses]);

  function drop(status: TaskStatus) {
    if (dragging) {
      const t = tasks.find((x) => x.id === dragging);
      if (t && t.status !== status) onMove(dragging, status);
    }
    setDragging(null);
    setOverCol(null);
  }

  return (
    <div className={cn("overflow-x-auto -mx-[var(--s4)] px-[var(--s4)] pb-2", className)}>
      <div className="flex gap-3 min-w-max">
        {statuses.map((s) => {
          const list = byStatus.get(s) || [];
          return (
            <div
              key={s}
              className={cn("w-[264px] shrink-0 rounded-[var(--radius)] sunken flex flex-col max-h-[calc(100dvh-260px)] min-h-[200px] transition-colors", overCol === s && dragging && "ring-2 ring-[var(--brand-2)]")}
              onDragOver={(e) => { e.preventDefault(); if (overCol !== s) setOverCol(s); }}
              onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOverCol(null); }}
              onDrop={(e) => { e.preventDefault(); drop(s); }}
            >
              <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
                <span className="w-2 h-2 rounded-full" style={{ background: DOT[s] }} />
                <span className="text-sm font-medium">{STATUS_LABEL[s]}</span>
                <span className="ml-auto text-xs text-muted num">{list.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                {list.length === 0 && <div className="text-[11px] text-muted text-center py-6 border border-dashed rounded-[var(--radius-sm)]">Drop tasks here</div>}
                {list.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => { setDragging(t.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); }}
                    onDragEnd={() => { setDragging(null); setOverCol(null); }}
                    className={cn("card card-hover p-2.5 cursor-grab active:cursor-grabbing select-none", dragging === t.id && "opacity-50")}
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical size={13} className="text-muted mt-0.5 shrink-0 hidden sm:block" />
                      <Link href={`/tasks/${t.id}`} className={cn("text-sm leading-snug flex-1 min-w-0 hover:underline", t.status === "done" && "line-through text-muted")} draggable={false}>
                        {t.title}
                      </Link>
                    </div>
                    {showProject && t.project && <div className="text-[11px] text-muted truncate mt-1 pl-0 sm:pl-[19px]">{t.project.name}</div>}
                    <div className="flex items-center gap-1.5 flex-wrap mt-2 pl-0 sm:pl-[19px]">
                      <PriorityPill priority={t.priority} />
                      <WaitingPill waiting={t.waiting_on} userId={t.waiting_on_user_id} />
                      <DueLabel due={t.due_date} status={t.status} />
                      <span className="ml-auto"><PersonChip id={t.assignee_id} showName={false} size={20} /></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
