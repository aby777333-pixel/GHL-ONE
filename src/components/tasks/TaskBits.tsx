"use client";

import Link from "next/link";
import { AlertTriangle, Clock, Flag, Hourglass, Lock } from "lucide-react";
import { Avatar, Pill } from "@/components/ui";
import { usePerson } from "@/components/providers/SessionProvider";
import { cn, dueTone, relDate, STATUS_LABEL, STATUS_TONE, PRIORITY_LABEL, PRIORITY_TONE, WAITING_LABEL, type Task, type TaskPriority, type TaskStatus, type WaitingOn } from "@/lib/utils";

export function StatusPill({ status, size }: { status: TaskStatus; size?: "lg" }) {
  return <Pill tone={STATUS_TONE[status]} size={size}>{STATUS_LABEL[status]}</Pill>;
}

export function PriorityPill({ priority, size, iconOnly }: { priority: TaskPriority; size?: "lg"; iconOnly?: boolean }) {
  if (priority === "normal" || priority === "low") {
    return iconOnly ? null : <Pill tone={PRIORITY_TONE[priority]} size={size}>{PRIORITY_LABEL[priority]}</Pill>;
  }
  return (
    <Pill tone={PRIORITY_TONE[priority]} size={size}>
      <Flag size={10} />
      {!iconOnly && PRIORITY_LABEL[priority]}
    </Pill>
  );
}

export function WaitingPill({ waiting, userId, size }: { waiting: WaitingOn; userId?: string | null; size?: "lg" }) {
  const person = usePerson(userId);
  if (waiting === "none") return null;
  return (
    <Pill tone={waiting === "blocked" ? "tone-danger" : "tone-warn"} size={size}>
      {waiting === "blocked" ? <Lock size={10} /> : <Hourglass size={10} />}
      {person ? `Waiting on ${person.full_name.split(" ")[0]}` : WAITING_LABEL[waiting]}
    </Pill>
  );
}

export function DueLabel({ due, status, className }: { due?: string | null; status?: TaskStatus | null; className?: string }) {
  if (!due) return null;
  const overdue = dueTone(due, status) === "text-danger";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs num", dueTone(due, status), className)}>
      {overdue ? <AlertTriangle size={12} /> : <Clock size={12} />}
      {relDate(due)}
    </span>
  );
}

export function PersonChip({ id, size = 20, showName = true, className }: { id?: string | null; size?: number; showName?: boolean; className?: string }) {
  const p = usePerson(id);
  if (!p) return showName ? <span className={cn("text-xs text-muted", className)}>Unassigned</span> : null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <Avatar name={p.full_name} src={p.avatar_url} size={size} />
      {showName && <span className="truncate">{p.full_name}</span>}
    </span>
  );
}

export function PersonName({ id, fallback = "Someone", className }: { id?: string | null; fallback?: string; className?: string }) {
  const p = usePerson(id);
  return <span className={cn("font-medium", className)}>{p?.full_name || fallback}</span>;
}

export type TaskRowData = Pick<Task, "id" | "title" | "status" | "priority" | "due_date" | "assignee_id" | "waiting_on" | "waiting_on_user_id" | "project_id"> & {
  project?: { id: string; name: string } | null;
  subtask_count?: number;
  done_count?: number;
};

/** Compact list row used by My Work, project rooms, department pages and search. */
export function TaskRow({ task, showProject = true, onClick, right, className }: { task: TaskRowData; showProject?: boolean; onClick?: () => void; right?: React.ReactNode; className?: string }) {
  const done = task.status === "done" || task.status === "cancelled";
  const content = (
    <div className={cn("flex items-center gap-3 px-3 py-2.5 row-hover rounded-[var(--radius-sm)]", className)}>
      <span className={cn("w-2 h-2 rounded-full shrink-0", task.status === "done" ? "bg-[var(--success)]" : task.status === "blocked" ? "bg-[var(--danger)]" : task.status === "waiting" ? "bg-[var(--warn)]" : task.status === "in_progress" ? "bg-[var(--info)]" : "bg-[var(--line-strong)]")} />
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm truncate", done && "line-through text-muted")}>{task.title}</div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {showProject && task.project && <span className="text-[11px] text-muted truncate max-w-[160px]">{task.project.name}</span>}
          <StatusPill status={task.status} />
          <PriorityPill priority={task.priority} />
          <WaitingPill waiting={task.waiting_on} userId={task.waiting_on_user_id} />
          {typeof task.subtask_count === "number" && task.subtask_count > 0 && (
            <span className="text-[11px] text-muted num">{task.done_count ?? 0}/{task.subtask_count}</span>
          )}
        </div>
      </div>
      <DueLabel due={task.due_date} status={task.status} className="hidden sm:inline-flex" />
      <PersonChip id={task.assignee_id} showName={false} size={24} />
      {right}
    </div>
  );
  if (onClick) return <button className="w-full text-left" onClick={onClick}>{content}</button>;
  return <Link href={`/tasks/${task.id}`} className="block">{content}</Link>;
}
