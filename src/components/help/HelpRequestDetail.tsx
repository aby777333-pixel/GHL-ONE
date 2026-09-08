"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, CheckSquare, ChevronRight, Clock, ExternalLink, FileText, FolderKanban, FolderPlus, ListChecks, MessageSquare, Paperclip, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, Modal, Pill, useToast } from "@/components/ui";
import { useSeen } from "@/components/providers/ActivityProvider";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip, PriorityPill } from "@/components/tasks/TaskBits";
import { getSignedUrl } from "@/components/chat/useSignedUrl";
import { ago, bytes, cn, fmtDate, relDate, type Tables } from "@/lib/utils";
import { HelpStatusPill, SlaCountdown, StatusStepper, useNow } from "./HelpBits";
import { parseFormData, parseHelpAttachments, parseSchema, slaLabel, type HelpRequest, type Service } from "./lib";
import { RequestActions, useCanWork } from "./RequestActions";
import { BuddyQuickActions } from "@/components/ai/BuddyQuickActions";
import { EntityLive } from "@/components/live/EntityLive";
import { CollaborationHistory } from "@/components/live/CollaborationHistory";

export type HelpDetailData = {
  request: HelpRequest;
  service: Service | null;
  task: { id: string; title: string; status: string } | null;
  project: { id: string; name: string; status: string } | null;
  channel: { id: string; name: string; last_message_at: string | null } | null;
  activity: Pick<Tables<"audit_logs">, "id" | "action" | "summary" | "created_at" | "actor_id" | "new_value">[];
};

export function HelpRequestDetail({ data }: { data: HelpDetailData }) {
  const { profile, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const r = data.request;
  useSeen(`help:${r.id}`);
  const canWork = useCanWork(r);
  const dept = departments.find((d) => d.id === r.department_id);
  const fields = React.useMemo(() => (data.service ? parseSchema(data.service.form_schema) : []), [data.service]);
  const form = React.useMemo(() => parseFormData(r.form_data), [r.form_data]);
  const attachments = React.useMemo(() => parseHelpAttachments(r.attachments), [r.attachments]);
  const [convert, setConvert] = React.useState<"task" | "project" | null>(null);
  const [name, setName] = React.useState(r.title);
  const [due, setDue] = React.useState(r.deadline ? r.deadline.slice(0, 10) : "");
  const [busy, setBusy] = React.useState(false);

  const labelled = fields.map((f) => ({ key: f.key, label: f.label, value: form[f.key] })).filter((x) => x.value);
  const extraKeys = Object.keys(form).filter((k) => !k.startsWith("_") && !fields.some((f) => f.key === k));
  const completionNote = form._completion_note;
  const declineReason = form._decline_reason;
  const isRequester = r.requester_id === profile.id;

  async function turnInto(kind: "task" | "project") {
    if (!name.trim()) return;
    setBusy(true);
    const supabase = createClient();
    if (kind === "task") {
      const { data: t, error } = await supabase
        .from("tasks")
        .insert({ org_id: r.org_id, title: name.trim(), description: [r.details, ...labelled.map((x) => `${x.label}: ${x.value}`)].filter(Boolean).join("\n"), department_id: r.department_id, assignee_id: r.owner_id, owner_id: profile.id, priority: r.priority, due_date: due ? new Date(`${due}T18:00:00`).toISOString() : null, created_by: profile.id, status: "todo" })
        .select("id")
        .single();
      if (error || !t) {
        setBusy(false);
        return toast.push(error?.message || "Could not create the task", "danger");
      }
      const { error: e2 } = await supabase.from("help_requests").update({ task_id: t.id }).eq("id", r.id);
      setBusy(false);
      if (e2) return toast.push(`Task created, but linking failed: ${e2.message}`, "danger");
      toast.push("Task created and linked", "success");
      setConvert(null);
      router.push(`/tasks/${t.id}`);
    } else {
      const { data: p, error } = await supabase
        .from("projects")
        .insert({ org_id: r.org_id, name: name.trim(), description: `From help request: ${r.title}${r.details ? `\n\n${r.details}` : ""}`, department_id: r.department_id, owner_id: r.owner_id || profile.id, status: "planning", priority: r.priority, due_date: due || null, created_by: profile.id })
        .select("id")
        .single();
      if (error || !p) {
        setBusy(false);
        return toast.push(error?.message || "Could not create the project", "danger");
      }
      const { error: e2 } = await supabase.from("help_requests").update({ project_id: p.id }).eq("id", r.id);
      setBusy(false);
      if (e2) return toast.push(`Project created, but linking failed: ${e2.message}`, "danger");
      toast.push("Project created and linked", "success");
      setConvert(null);
      router.push(`/projects/${p.id}`);
    }
    router.refresh();
  }

  return (
    <div className="page page-narrow space-y-[var(--s4)] anim-fade-up">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/help" className="hover:underline inline-flex items-center gap-1"><ArrowLeft size={12} /> Help Desk</Link>
        <ChevronRight size={12} />
        {dept ? <Link href={`/departments/${dept.slug}`} className="hover:underline">{dept.name}</Link> : <span>Request</span>}
      </div>

      {/* Header */}
      <Card className="p-[var(--s4)]" style={dept ? { borderTop: `3px solid ${dept.color}` } : undefined}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <HelpStatusPill status={r.status} size="lg" />
              <PriorityPill priority={r.priority} size="lg" />
              {r.escalation_level > 0 && <Pill tone="tone-danger" size="lg"><ShieldAlert size={11} /> escalated ×{r.escalation_level}</Pill>}
            </div>
            <h1 className="h1">{r.title}</h1>
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-muted mt-2">
              <span className="inline-flex items-center gap-1">From <PersonChip id={r.requester_id} size={16} /></span>
              {dept && <span className="inline-flex items-center gap-1"><Building2 size={12} /> {dept.name}</span>}
              {data.service && <span className="inline-flex items-center gap-1"><FileText size={12} /> {data.service.name}</span>}
              <span>· {ago(r.created_at)}</span>
              {r.deadline && <span className={cn("inline-flex items-center gap-1 num", new Date(r.deadline).getTime() < now && r.status !== "completed" ? "text-danger" : "")}><Clock size={12} /> needed by {relDate(r.deadline)}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <EntityLive ctx={{ helpId: r.id, projectId: r.project_id, departmentId: r.department_id, title: r.title }} size="xs" />
              <BuddyQuickActions scope={{ helpId: r.id, projectId: r.project_id || undefined, path: `/help/${r.id}` }} size="xs" />
            </div>
            <span className="text-[11px] text-muted">Owner</span>
            {r.owner_id ? <PersonChip id={r.owner_id} size={24} /> : <span className="text-xs text-muted">Not yet accepted</span>}
            <SlaCountdown r={r} now={now} />
          </div>
        </div>
        <StatusStepper status={r.status} className="mt-[var(--s4)]" />
        {(canWork || r.channel_id) && (
          <div className="flex flex-wrap items-center gap-2 mt-[var(--s4)] pt-[var(--s3)] border-t">
            <RequestActions r={r} />
            {r.channel_id && r.status !== "new" && (
              <Link href={`/chat/${r.channel_id}`} className="btn btn-secondary btn-sm"><MessageSquare size={14} /> Open conversation</Link>
            )}
            {canWork && !r.task_id && r.status !== "declined" && <Button size="sm" variant="ghost" onClick={() => { setName(r.title); setConvert("task"); }}><ListChecks size={14} /> Turn into task</Button>}
            {canWork && !r.project_id && r.status !== "declined" && <Button size="sm" variant="ghost" onClick={() => { setName(r.title); setConvert("project"); }}><FolderPlus size={14} /> Turn into project</Button>}
          </div>
        )}
        {isRequester && r.status === "new" && !canWork && (
          <div className="text-xs text-muted mt-[var(--s3)] pt-[var(--s3)] border-t inline-flex items-center gap-1.5"><Clock size={12} /> {data.service ? slaLabel(data.service.sla_ack_minutes) : "Waiting for the department to accept"}. You will be notified as soon as someone takes it.</div>
        )}
      </Card>

      <CollaborationHistory type="help" id={r.id} />

      <div className="grid gap-[var(--s4)] lg:grid-cols-[1.618fr_1fr]">
        <div className="space-y-[var(--s4)] min-w-0">
          {(completionNote || declineReason) && (
            <Card className="p-[var(--s4)]" style={{ borderColor: completionNote ? "var(--success)" : "var(--danger)" }}>
              <div className="eyebrow mb-1">{completionNote ? "Completion note" : "Declined"}</div>
              <p className="text-sm whitespace-pre-wrap">{completionNote || declineReason}</p>
            </Card>
          )}

          <Card className="p-[var(--s4)]">
            <div className="eyebrow mb-2">Request</div>
            {r.details ? <p className="text-sm whitespace-pre-wrap">{r.details}</p> : <p className="text-sm text-muted">No extra details.</p>}
            {(labelled.length > 0 || extraKeys.length > 0) && (
              <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {labelled.map((x) => (
                  <div key={x.key} className="min-w-0">
                    <dt className="text-[11px] text-muted">{x.label}</dt>
                    <dd className="text-sm whitespace-pre-wrap break-words">{x.value}</dd>
                  </div>
                ))}
                {extraKeys.map((k) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-[11px] text-muted">{k.replace(/_/g, " ")}</dt>
                    <dd className="text-sm whitespace-pre-wrap break-words">{form[k]}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          {attachments.length > 0 && (
            <Card className="p-[var(--s4)]">
              <div className="eyebrow mb-2">Attachments · {attachments.length}</div>
              <ul className="space-y-1">
                {attachments.map((a) => (
                  <AttachmentLink key={a.path} a={a} />
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-[var(--s4)] min-w-0">
          <Card className="p-[var(--s4)]">
            <div className="eyebrow mb-2">Linked</div>
            <ul className="space-y-1.5 text-sm">
              {data.channel && (
                <li><Link href={`/chat/${data.channel.id}`} className="flex items-center gap-2 link"><MessageSquare size={14} /> <span className="truncate">Conversation</span> <ExternalLink size={11} className="ml-auto text-muted" /></Link></li>
              )}
              {data.task && (
                <li><Link href={`/tasks/${data.task.id}`} className="flex items-center gap-2 link"><CheckSquare size={14} /> <span className="truncate">{data.task.title}</span> <span className="ml-auto pill tone-neutral">{data.task.status.replace(/_/g, " ")}</span></Link></li>
              )}
              {data.project && (
                <li><Link href={`/projects/${data.project.id}`} className="flex items-center gap-2 link"><FolderKanban size={14} /> <span className="truncate">{data.project.name}</span> <span className="ml-auto pill tone-neutral">{data.project.status.replace(/_/g, " ")}</span></Link></li>
              )}
              {!data.channel && !data.task && !data.project && <li className="text-xs text-muted">Nothing linked yet. A conversation opens when the request is accepted.</li>}
            </ul>
          </Card>

          <Card className="p-[var(--s4)]">
            <div className="eyebrow mb-2">Timeline</div>
            <ol className="space-y-2 text-xs">
              <TimelineItem when={r.created_at} label="Requested" who={r.requester_id} />
              {r.acknowledged_at && <TimelineItem when={r.acknowledged_at} label="Acknowledged" who={r.owner_id} />}
              {r.completed_at && <TimelineItem when={r.completed_at} label="Completed" who={r.owner_id} />}
              {data.activity.map((a) => (
                <TimelineItem key={a.id} when={a.created_at} label={a.summary || a.action.replace("help.", "").replace(/_/g, " ")} who={a.actor_id} sub={a.action} />
              ))}
            </ol>
            {data.activity.length === 0 && <div className="text-[11px] text-muted mt-2">Detailed activity is visible to managers.</div>}
          </Card>

          <Card className="p-[var(--s4)] text-xs text-muted space-y-1">
            <div>Created {fmtDate(r.created_at, true)}</div>
            <div>Last updated {fmtDate(r.updated_at, true)}</div>
            {r.ack_due_at && r.status === "new" && <div>Acknowledge by {fmtDate(r.ack_due_at, true)}</div>}
            <div>{r.visible_on_board ? "Visible on the “Who needs help” board" : "Not on the public board"}</div>
          </Card>
        </div>
      </div>

      <Modal open={!!convert} onClose={() => setConvert(null)} title={convert === "task" ? "Turn into a task" : "Turn into a project"} width={480}>
        <div className="space-y-3">
          <p className="text-sm text-muted">{convert === "task" ? "Creates a task in the department, assigned to the request owner, and links it back here." : "Creates a project owned by the request owner and links it back here."}</p>
          <Field label={convert === "task" ? "Task title" : "Project name"}><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <Field label="Due date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConvert(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => convert && turnInto(convert)}>{convert === "task" ? <ListChecks size={14} /> : <FolderPlus size={14} />} Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TimelineItem({ when, label, who, sub }: { when: string; label: string; who: string | null; sub?: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-2)] mt-1.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-2 truncate">{label}</span>
        <span className="block text-muted inline-flex items-center gap-1 flex-wrap">{fmtDate(when, true)}{who && <> · <PersonChip id={who} size={12} /></>}{sub && <span className="opacity-70">· {sub}</span>}</span>
      </span>
    </li>
  );
}

function AttachmentLink({ a }: { a: { name: string; path: string; size: number; type: string } }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  async function open() {
    setBusy(true);
    const url = await getSignedUrl(a.path);
    setBusy(false);
    if (!url) return toast.push("Could not open the attachment", "danger");
    window.open(url, "_blank", "noopener");
  }
  return (
    <li>
      <button type="button" onClick={open} disabled={busy} className="w-full flex items-center gap-2 text-sm px-2 py-1.5 rounded-[var(--radius-sm)] row-hover text-left">
        <Paperclip size={14} className="text-muted shrink-0" />
        <span className="truncate flex-1">{a.name}</span>
        <span className="text-[11px] text-muted num shrink-0">{bytes(a.size)}</span>
        <ExternalLink size={12} className="text-muted shrink-0" />
      </button>
    </li>
  );
}
