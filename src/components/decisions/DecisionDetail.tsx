"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FolderKanban, Video, MessageSquare, Pencil, ListPlus, Lightbulb, HelpCircle } from "lucide-react";
import { Avatar, Button, Card, CardHeader, Modal, Pill } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { QuickTaskForm } from "@/components/tasks/QuickTaskForm";
import { useSession } from "@/components/providers/SessionProvider";
import { CLASSIFICATION_LABEL, fmtDate, isAdminRole, type Decision } from "@/lib/utils";
import { RecordDecisionForm } from "./RecordDecisionForm";

export function DecisionDetail({ decision: d, project, meeting, followUpTasks }: { decision: Decision; project: { id: string; name: string } | null; meeting: { id: string; title: string; starts_at: string } | null; followUpTasks: { id: string; title: string; status: string }[] }) {
  const { profile, people, departments } = useSession();
  const router = useRouter();
  const [edit, setEdit] = React.useState(false);
  const [task, setTask] = React.useState(false);
  const canEdit = d.decided_by === profile.id || isAdminRole(profile.role);
  const participants = d.participants.map((id) => people.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const dept = departments.find((x) => x.id === d.department_id);

  return (
    <div className="page page-narrow">
      <Link href="/decisions" className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]"><ArrowLeft size={14} /> Decisions</Link>

      <Card className="px-[var(--s4)] py-[var(--s4)] mb-[var(--s3)]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Pill tone={d.classification === "internal" ? "tone-neutral" : d.classification === "public" ? "tone-success" : "tone-danger"}>{CLASSIFICATION_LABEL[d.classification]}</Pill>
          {dept && <Pill tone="tone-neutral"><span className="w-1.5 h-1.5 rounded-full" style={{ background: dept.color }} /> {dept.name}</Pill>}
          {d.meeting_id && <Link href={`/meetings/${d.meeting_id}`} className="pill tone-info hover:underline"><Video size={10} /> From meeting</Link>}
          {d.message_id && d.channel_id && <Link href={`/chat/${d.channel_id}?m=${d.message_id}`} className="pill tone-violet hover:underline"><MessageSquare size={10} /> From chat</Link>}
          {canEdit && <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setEdit(true)}><Pencil size={12} /> Edit</Button>}
        </div>
        <h1 className="h1 mt-3">{d.title}</h1>
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">Decided by <PersonChip id={d.decided_by} size={18} /></span>
          <span className="num">{fmtDate(d.decided_at, true)}</span>
          {project && <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-1 hover:underline"><FolderKanban size={12} /> {project.name}</Link>}
        </div>

        <section className="mt-5">
          <div className="eyebrow mb-1.5 inline-flex items-center gap-1.5"><Lightbulb size={12} /> Decision</div>
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{d.decision}</div>
        </section>
        <section className="mt-5">
          <div className="eyebrow mb-1.5 inline-flex items-center gap-1.5"><HelpCircle size={12} /> Reason</div>
          {d.reason ? <div className="text-sm leading-relaxed text-[var(--fg-2)] whitespace-pre-wrap">{d.reason}</div> : <div className="text-sm text-muted italic">No reasoning recorded.</div>}
        </section>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--s3)]">
        <Card>
          <CardHeader title="Participants" subtitle={participants.length ? `${participants.length} people were part of this` : "No participants recorded"} />
          <div className="px-[var(--s4)] pb-[var(--s4)] flex flex-wrap gap-2">
            {participants.map((p) => (
              <Link key={p.id} href={`/people/${p.id}`} className="inline-flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 text-sm hover:bg-[var(--neutral-bg)]">
                <Avatar name={p.full_name} src={p.avatar_url} size={22} /> {p.full_name}
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Supporting links" />
          <div className="px-[var(--s3)] pb-[var(--s3)] space-y-1">
            {meeting && (
              <Link href={`/meetings/${meeting.id}`} className="flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] row-hover">
                <Video size={16} className="text-muted shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{meeting.title}</span>
                  <span className="block text-[11px] text-muted num">{fmtDate(meeting.starts_at, true)}</span>
                </span>
              </Link>
            )}
            {d.message_id && d.channel_id && (
              <Link href={`/chat/${d.channel_id}?m=${d.message_id}`} className="flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] row-hover">
                <MessageSquare size={16} className="text-muted shrink-0" />
                <span className="text-sm">Open the conversation</span>
              </Link>
            )}
            {project && (
              <Link href={`/projects/${project.id}`} className="flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] row-hover">
                <FolderKanban size={16} className="text-muted shrink-0" />
                <span className="text-sm truncate">{project.name}</span>
              </Link>
            )}
            {!meeting && !d.message_id && !project && <div className="text-sm text-muted px-2.5 py-2">No linked meeting, conversation or project.</div>}
          </div>
        </Card>
      </div>

      <Card className="mt-[var(--s3)]">
        <CardHeader title="Follow-up" subtitle={d.follow_up || "No follow-up action recorded"} action={<Button size="sm" variant="primary" onClick={() => setTask(true)}><ListPlus size={14} /> Create follow-up task</Button>} />
        {followUpTasks.length > 0 && (
          <div className="px-[var(--s3)] pb-[var(--s3)] space-y-1">
            {followUpTasks.map((t) => (
              <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-sm)] row-hover text-sm">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.status === "done" ? "var(--success)" : "var(--line-strong)" }} />
                <span className="truncate">{t.title}</span>
                <span className="ml-auto text-[11px] text-muted">{t.status.replace(/_/g, " ")}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Modal open={task} onClose={() => setTask(false)} title="Create follow-up task" width={600}>
        <QuickTaskForm defaults={{ title: d.follow_up || d.title, description: `Follow-up from decision: ${d.title}\n\n${d.decision}`, project_id: d.project_id, department_id: d.department_id, source_meeting_id: d.meeting_id }} onCreated={(id) => { setTask(false); router.push(`/tasks/${id}`); }} onCancel={() => setTask(false)} />
      </Modal>
      <Modal open={edit} onClose={() => setEdit(false)} title="Edit decision" width={640}>
        <RecordDecisionForm existing={d} onDone={() => setEdit(false)} onCancel={() => setEdit(false)} />
      </Modal>
    </div>
  );
}
