"use client";

import Link from "next/link";
import { AlertTriangle, CalendarDays } from "lucide-react";
import { Avatar, AvatarStack, Pill, Progress } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, CLASSIFICATION_LABEL, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, relDate, type Project } from "@/lib/utils";

export type ProjectSummary = Pick<Project, "id" | "name" | "description" | "status" | "priority" | "classification" | "department_id" | "owner_id" | "due_date" | "start_date" | "client_name" | "tags" | "archived" | "updated_at"> & {
  total_tasks: number;
  done_tasks: number;
  overdue_tasks: number;
  member_ids: string[];
};

export function projectProgress(p: { total_tasks: number; done_tasks: number }) {
  return p.total_tasks ? Math.round((p.done_tasks / p.total_tasks) * 100) : 0;
}
export function projectAtRisk(p: { status: Project["status"]; overdue_tasks: number; due_date: string | null }) {
  const overdueProject = !!p.due_date && new Date(p.due_date) < new Date() && p.status !== "completed" && p.status !== "cancelled";
  return p.status === "at_risk" || p.status === "delayed" || p.overdue_tasks > 0 || overdueProject;
}

export function ProjectCard({ p, className }: { p: ProjectSummary; className?: string }) {
  const { people, departments } = useSession();
  const dept = departments.find((d) => d.id === p.department_id);
  const owner = people.find((x) => x.id === p.owner_id);
  const members = p.member_ids.map((id) => people.find((x) => x.id === id)).filter(Boolean) as typeof people;
  const progress = projectProgress(p);
  const risk = projectAtRisk(p);
  const overdue = !!p.due_date && new Date(p.due_date) < new Date() && p.status !== "completed" && p.status !== "cancelled";

  return (
    <Link href={`/projects/${p.id}`} className={cn("card card-hover p-[var(--s4)] flex flex-col gap-3 min-w-0", className)}>
      <div className="flex items-start gap-2">
        <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ background: dept?.color || "var(--line-strong)" }} title={dept?.name} />
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-snug truncate-2">{p.name}</div>
          <div className="text-[11px] text-muted truncate mt-0.5">{dept?.name || "No department"}{p.client_name ? ` · ${p.client_name}` : ""}</div>
        </div>
        {risk && <span className="text-[var(--warn)] shrink-0" title="At risk"><AlertTriangle size={16} /></span>}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Pill tone={PROJECT_STATUS_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Pill>
        {p.classification !== "internal" && <Pill tone="tone-violet">{CLASSIFICATION_LABEL[p.classification]}</Pill>}
        {p.overdue_tasks > 0 && <Pill tone="tone-danger">{p.overdue_tasks} overdue</Pill>}
      </div>
      <div>
        <div className="flex items-center justify-between text-[11px] text-muted mb-1">
          <span>{p.done_tasks}/{p.total_tasks} tasks</span>
          <span className="num">{progress}%</span>
        </div>
        <Progress value={progress} tone={progress === 100 ? "var(--success)" : risk ? "var(--warn)" : "var(--brand)"} />
      </div>
      <div className="flex items-center gap-2 mt-auto">
        {owner ? <span className="inline-flex items-center gap-1.5 text-xs min-w-0"><Avatar name={owner.full_name} src={owner.avatar_url} size={20} /><span className="truncate">{owner.full_name.split(" ")[0]}</span></span> : <span className="text-xs text-muted">No owner</span>}
        <span className="ml-auto flex items-center gap-2">
          {members.length > 0 && <AvatarStack people={members} size={20} max={3} />}
          {p.due_date && (
            <span className={cn("inline-flex items-center gap-1 text-[11px] num", overdue ? "text-danger" : "text-muted")}>
              <CalendarDays size={12} /> {relDate(p.due_date)}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
