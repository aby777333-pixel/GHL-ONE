"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronRight, Link2, Pencil, Building2, Users, Target, Flag } from "lucide-react";
import { Pill, Progress } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, relDate, STATUS_LABEL as TASK_STATUS_LABEL, STATUS_TONE as TASK_STATUS_TONE } from "@/lib/utils";
import { LEVEL_LABEL, LEVEL_TONE, STATUS_LABEL, STATUS_TONE, goalProgress, progressTone, type Goal, type GoalTaskLink } from "./lib";

const LEVEL_ICON: Record<string, React.ReactNode> = { company: <Flag size={14} />, department: <Building2 size={14} />, team: <Users size={14} />, employee: <Target size={14} /> };

export function GoalCard({ goal, links, childCount, expanded, onToggle, onEdit, canEdit, compact, teamName, className }: { goal: Goal; links: GoalTaskLink[]; childCount?: number; expanded?: boolean; onToggle?: () => void; onEdit?: () => void; canEdit?: boolean; compact?: boolean; teamName?: string | null; className?: string }) {
  const { departments } = useSession();
  const [showTasks, setShowTasks] = React.useState(false);
  const pct = goalProgress(goal, links);
  const tone = progressTone(pct, goal);
  const dept = departments.find((d) => d.id === goal.department_id);
  const overdue = !!goal.due_on && goal.status === "active" && new Date(goal.due_on) < new Date();
  const tasks = links.filter((l) => l.task);
  const doneTasks = tasks.filter((l) => l.task!.status === "done").length;

  return (
    <div className={cn("card p-[var(--s3)] min-w-0", goal.status === "dropped" && "opacity-70", className)}>
      <div className="flex items-start gap-2.5">
        {onToggle ? (
          <button onClick={onToggle} className={cn("w-7 h-7 rounded-[8px] inline-flex items-center justify-center shrink-0 mt-0.5", LEVEL_TONE[goal.level])} aria-label={expanded ? "Collapse" : "Expand"} title={childCount ? `${childCount} sub-goal${childCount === 1 ? "" : "s"}` : LEVEL_LABEL[goal.level]}>
            {childCount ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : LEVEL_ICON[goal.level]}
          </button>
        ) : (
          <span className={cn("w-7 h-7 rounded-[8px] inline-flex items-center justify-center shrink-0 mt-0.5", LEVEL_TONE[goal.level])}>{LEVEL_ICON[goal.level]}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className={cn("font-medium leading-snug", goal.status === "done" && "text-muted", goal.status === "dropped" && "line-through text-muted")}>{goal.title}</div>
              {!compact && goal.description && <div className="text-xs text-2 mt-0.5 truncate-2 leading-relaxed">{goal.description}</div>}
            </div>
            {canEdit && onEdit && <button onClick={onEdit} className="btn btn-ghost btn-xs btn-icon shrink-0" aria-label="Edit goal"><Pencil size={12} /></button>}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            <Pill tone={LEVEL_TONE[goal.level]}>{LEVEL_LABEL[goal.level]}</Pill>
            {goal.status !== "active" && <Pill tone={STATUS_TONE[goal.status]}>{STATUS_LABEL[goal.status]}</Pill>}
            {goal.period && <Pill tone="tone-neutral">{goal.period}</Pill>}
            {dept && goal.level !== "company" && <span className="pill tone-neutral"><span className="w-1.5 h-1.5 rounded-full" style={{ background: dept.color }} />{dept.name}</span>}
            {teamName && goal.level === "team" && <Pill tone="tone-neutral">{teamName}</Pill>}
            {childCount ? <span className="text-[11px] text-muted num">{childCount} sub-goal{childCount === 1 ? "" : "s"}</span> : null}
          </div>
          <div className="flex items-center gap-2 mt-2.5">
            <Progress value={pct} className="flex-1" height={5} tone={tone} />
            <span className="text-xs num font-medium w-9 text-right">{pct}%</span>
          </div>
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-2 text-[11px] text-muted">
            <PersonChip id={goal.owner_id} size={16} />
            {goal.due_on && <span className={cn("inline-flex items-center gap-1 num", overdue ? "text-danger" : "")}><CalendarDays size={11} /> {overdue ? "was due" : "due"} {relDate(goal.due_on)}</span>}
            {tasks.length > 0 && (
              <button onClick={() => setShowTasks((s) => !s)} className="inline-flex items-center gap-1 hover:text-[var(--fg)] num"><Link2 size={11} /> {doneTasks}/{tasks.length} tasks {showTasks ? "▴" : "▾"}</button>
            )}
            {goal.progress > 0 && tasks.length > 0 && goal.status === "active" && <span title="Progress is set manually, not derived from tasks">manual</span>}
          </div>
          {showTasks && tasks.length > 0 && (
            <ul className="mt-2 border-t pt-2 space-y-1">
              {tasks.map((l) => (
                <li key={l.task_id} className="flex items-center gap-2 text-xs min-w-0">
                  <Pill tone={TASK_STATUS_TONE[l.task!.status]}>{TASK_STATUS_LABEL[l.task!.status]}</Pill>
                  <Link href={`/tasks/${l.task_id}`} className={cn("truncate hover:underline flex-1", l.task!.status === "done" && "line-through text-muted")}>{l.task!.title}</Link>
                  <PersonChip id={l.task!.assignee_id} size={14} showName={false} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
