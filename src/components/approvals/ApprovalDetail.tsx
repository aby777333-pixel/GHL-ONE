"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileText, FolderKanban, ListChecks, IndianRupee, CalendarClock, History } from "lucide-react";
import { Avatar, Card, CardHeader, Pill } from "@/components/ui";
import { PersonChip, PriorityPill, StatusPill } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, fmtDate, type Approval, type Task, type TaskStatus, type Tables } from "@/lib/utils";
import { ApprovalActions } from "./ApprovalActions";
import { ApprovalStatusPill, ApprovalTypePill, WaitingSince, fmtAmount, EVENT_ACTION_LABEL, EVENT_ACTION_TONE } from "./ApprovalBits";

type Event = Tables<"approval_events">;
type LinkedTask = Pick<Task, "id" | "title" | "status" | "priority" | "due_date" | "assignee_id">;
type LinkedProject = { id: string; name: string; status: string };
type LinkedFile = { id: string; name: string; folder: string; current_version: number };

export function ApprovalDetail({ approval: a, events, task, project, file }: { approval: Approval; events: Event[]; task: LinkedTask | null; project: LinkedProject | null; file: LinkedFile | null }) {
  const { people } = useSession();
  const [now] = React.useState(() => Date.now());
  const person = (id?: string | null) => people.find((p) => p.id === id);
  const requester = person(a.requested_by);
  const approver = person(a.approver_id);
  const delegator = person(a.delegated_from);

  const noteText = (e: Event) => {
    if (e.action === "delegated" && e.note?.startsWith("to ")) {
      const p = person(e.note.slice(3).trim());
      return p ? `to ${p.full_name}` : e.note;
    }
    return e.note;
  };

  return (
    <div className="page page-narrow">
      <Link href="/approvals" className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]"><ArrowLeft size={14} /> Approvals</Link>

      <Card className="px-[var(--s4)] py-[var(--s4)] mb-[var(--s3)]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <ApprovalTypePill type={a.type} />
          <PriorityPill priority={a.priority} />
          <ApprovalStatusPill status={a.status} size="lg" />
          <WaitingSince since={a.created_at} status={a.status} className="ml-auto" />
        </div>
        <h1 className="h1 mt-3">{a.title}</h1>
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2 text-xs text-muted">
          <span>Requested {fmtDate(a.created_at, true)}</span>
          {a.due_date && <span className={cn("inline-flex items-center gap-1 num", a.status === "pending" && Date.parse(a.due_date) < now && "text-danger")}><CalendarClock size={12} /> Needed by {fmtDate(a.due_date, true)}</span>}
          {a.amount !== null && <span className="inline-flex items-center gap-1 num font-medium text-[var(--fg-2)]"><IndianRupee size={12} /> {fmtAmount(a.amount).slice(1)}</span>}
          {a.decided_at && <span>Decided {fmtDate(a.decided_at, true)}</span>}
        </div>

        {a.description ? (
          <div className="mt-4 text-sm whitespace-pre-wrap leading-relaxed">{a.description}</div>
        ) : (
          <div className="mt-4 text-sm text-muted italic">No details were provided.</div>
        )}

        {a.decision_note && a.status !== "pending" && (
          <div className={cn("mt-4 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm", a.status === "approved" ? "tone-success" : a.status === "rejected" ? "tone-danger" : "tone-orange")}>
            <div className="eyebrow mb-1" style={{ color: "inherit" }}>Decision note</div>
            <div className="whitespace-pre-wrap">{a.decision_note}</div>
          </div>
        )}

        <ApprovalActions approval={a} size="md" className="mt-5" />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--s3)] mb-[var(--s3)]">
        <Card>
          <CardHeader title="Approval chain" />
          <div className="px-[var(--s4)] pb-[var(--s4)]">
            <div className="flex items-center gap-2 flex-wrap">
              <ChainNode label="Requester" name={requester?.full_name} avatar={requester?.avatar_url} />
              <ArrowRight size={14} className="text-muted shrink-0" />
              {delegator && (
                <>
                  <ChainNode label="Delegated by" name={delegator.full_name} avatar={delegator.avatar_url} muted />
                  <ArrowRight size={14} className="text-muted shrink-0" />
                </>
              )}
              <ChainNode label="Approver" name={approver?.full_name} avatar={approver?.avatar_url} highlight={a.status === "pending"} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Linked" subtitle={!task && !project && !file ? "Nothing linked" : undefined} />
          <div className="px-[var(--s3)] pb-[var(--s3)] space-y-1">
            {project && (
              <Link href={`/projects/${project.id}`} className="flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] row-hover">
                <FolderKanban size={16} className="text-muted shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{project.name}</span>
                  <span className="block text-[11px] text-muted">Project · {project.status.replace(/_/g, " ")}</span>
                </span>
              </Link>
            )}
            {task && (
              <Link href={`/tasks/${task.id}`} className="flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] row-hover">
                <ListChecks size={16} className="text-muted shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{task.title}</span>
                  <span className="flex items-center gap-1.5 mt-0.5"><StatusPill status={task.status as TaskStatus} /><PersonChip id={task.assignee_id} size={16} /></span>
                </span>
              </Link>
            )}
            {file && (
              <Link href={`/files/${file.id}`} className="flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] row-hover">
                <FileText size={16} className="text-muted shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{file.name}</span>
                  <span className="block text-[11px] text-muted">{file.folder} · v{file.current_version}</span>
                </span>
              </Link>
            )}
            {!task && !project && !file && <div className="text-sm text-muted px-2.5 py-2">This request stands on its own.</div>}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><History size={15} /> History</span>} subtitle="Every step is recorded automatically." />
        <div className="px-[var(--s4)] pb-[var(--s4)]">
          {events.length === 0 ? (
            <div className="text-sm text-muted">No events yet.</div>
          ) : (
            <ol className="relative border-l ml-3 space-y-4">
              {events.map((e) => {
                const actor = person(e.actor_id);
                return (
                  <li key={e.id} className="pl-5 relative">
                    <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[var(--bg-elev)] border-2 border-[var(--brand-2)]" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Pill tone={EVENT_ACTION_TONE[e.action] || "tone-neutral"}>{EVENT_ACTION_LABEL[e.action] || e.action.replace(/_/g, " ")}</Pill>
                      {actor ? (
                        <span className="inline-flex items-center gap-1.5 text-sm"><Avatar name={actor.full_name} src={actor.avatar_url} size={18} /> {actor.full_name}</span>
                      ) : (
                        <span className="text-sm text-muted">System</span>
                      )}
                      <span className="text-xs text-muted num" title={fmtDate(e.created_at, true)}>{ago(e.created_at)}</span>
                    </div>
                    {noteText(e) && <div className="text-sm text-[var(--fg-2)] mt-1 whitespace-pre-wrap">{noteText(e)}</div>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
}

function ChainNode({ label, name, avatar, highlight, muted }: { label: string; name?: string | null; avatar?: string | null; highlight?: boolean; muted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5 min-w-0", highlight && "border-[var(--brand-2)] bg-[color-mix(in_oklab,var(--brand)_7%,transparent)]", muted && "opacity-70")}>
      <Avatar name={name} src={avatar} size={24} />
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-wide text-muted leading-none">{label}</span>
        <span className="block text-sm truncate max-w-[140px]">{name || "—"}</span>
      </span>
    </span>
  );
}
