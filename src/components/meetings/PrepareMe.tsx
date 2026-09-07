"use client";

import Link from "next/link";
import { Compass, Video, ListChecks, CheckSquare, Gavel, ArrowUpRight } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { APPROVAL_STATUS_TONE, APPROVAL_STATUS_LABEL, fmtDate, relDate, type Approval, type Decision, type Meeting } from "@/lib/utils";
import type { MeetingAction, LinkedTask } from "./ActionItems";

export type PrepareData = {
  previous: Pick<Meeting, "id" | "title" | "starts_at" | "summary" | "notes"> | null;
  previousActions: MeetingAction[];
  previousTasks: LinkedTask[];
  approvals: Pick<Approval, "id" | "title" | "status" | "created_at" | "requested_by">[];
  decisions: Pick<Decision, "id" | "title" | "decided_at" | "decided_by">[];
};

/** Side panel: what you need to know before walking into this meeting. */
export function PrepareMe({ data, hasProject }: { data: PrepareData; hasProject: boolean }) {
  const taskById = new Map(data.previousTasks.map((t) => [t.id, t]));
  const openActions = data.previousActions.filter((a) => {
    if (!a.task_id) return true;
    const t = taskById.get(a.task_id);
    return !t || (t.status !== "done" && t.status !== "cancelled");
  });

  return (
    <Card className="lg:sticky lg:top-[calc(var(--topbar-h)+var(--s3))]">
      <div className="px-[var(--s4)] pt-[var(--s3)] pb-[var(--s2)] flex items-center gap-2">
        <Compass size={15} className="text-[var(--accent)]" />
        <div className="h3">Prepare me</div>
      </div>
      <div className="px-[var(--s3)] pb-[var(--s3)] space-y-[var(--s3)]">
        <Section icon={<Video size={12} />} title="Previous meeting">
          {data.previous ? (
            <div className="px-2">
              <Link href={`/meetings/${data.previous.id}`} className="text-sm font-medium hover:underline inline-flex items-center gap-1">{data.previous.title} <ArrowUpRight size={12} className="text-muted" /></Link>
              <div className="text-[11px] text-muted num">{fmtDate(data.previous.starts_at, true)}</div>
              {data.previous.summary ? (
                <p className="text-xs text-[var(--fg-2)] mt-1.5 whitespace-pre-wrap leading-relaxed line-clamp-6">{data.previous.summary}</p>
              ) : data.previous.notes ? (
                <p className="text-xs text-[var(--fg-2)] mt-1.5 whitespace-pre-wrap leading-relaxed line-clamp-6">{data.previous.notes}</p>
              ) : (
                <p className="text-xs text-muted mt-1.5 italic">No summary was written.</p>
              )}
            </div>
          ) : (
            <Empty>{hasProject ? "This is the first meeting for this project." : "Link a project to see history."}</Empty>
          )}
        </Section>

        <Section icon={<ListChecks size={12} />} title={`Open actions from last time${openActions.length ? ` · ${openActions.length}` : ""}`}>
          {openActions.length === 0 ? (
            <Empty>{data.previous ? "Everything from last time is done." : "—"}</Empty>
          ) : (
            <ul className="space-y-0.5">
              {openActions.map((a) => (
                <li key={a.id} className="flex items-start gap-2 px-2 py-1 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--warn)] mt-1.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    {a.task_id ? <Link href={`/tasks/${a.task_id}`} className="hover:underline">{a.title}</Link> : <span>{a.title}</span>}
                    <span className="flex items-center gap-2 text-muted mt-0.5"><PersonChip id={a.owner_id} size={14} /> {a.due_date && <span className="num">{relDate(a.due_date)}</span>}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={<CheckSquare size={12} />} title={`Open approvals${data.approvals.length ? ` · ${data.approvals.length}` : ""}`}>
          {data.approvals.length === 0 ? (
            <Empty>{hasProject ? "No approvals pending on this project." : "—"}</Empty>
          ) : (
            <ul className="space-y-0.5">
              {data.approvals.map((a) => (
                <li key={a.id} className="px-2 py-1">
                  <Link href={`/approvals/${a.id}`} className="text-xs hover:underline block truncate">{a.title}</Link>
                  <span className="flex items-center gap-2 text-[11px] text-muted"><Pill tone={APPROVAL_STATUS_TONE[a.status]}>{APPROVAL_STATUS_LABEL[a.status]}</Pill> <PersonChip id={a.requested_by} size={14} /></span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={<Gavel size={12} />} title="Recent decisions">
          {data.decisions.length === 0 ? (
            <Empty>{hasProject ? "No decisions recorded for this project yet." : "—"}</Empty>
          ) : (
            <ul className="space-y-0.5">
              {data.decisions.map((d) => (
                <li key={d.id} className="px-2 py-1">
                  <Link href={`/decisions/${d.id}`} className="text-xs hover:underline block truncate">{d.title}</Link>
                  <span className="text-[11px] text-muted num">{fmtDate(d.decided_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </Card>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow px-2 mb-1 inline-flex items-center gap-1.5">{icon} {title}</div>
      {children}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-muted px-2">{children}</div>;
}
