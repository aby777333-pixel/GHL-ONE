"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, ArrowRightLeft, Check, CheckCircle2, ChevronRight, Copy, CornerDownRight, GitBranch, History, Link2, ListTree, MessageSquare, MoreHorizontal,
  Paperclip, Plus, Repeat, Send, ShieldCheck, Trash2, UserCog, Users, Video, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Field, Input, Menu, MenuItem, Modal, Pill, Select, Textarea, useToast } from "@/components/ui";
import { PersonPicker, PriorityPicker, ProjectPicker, DepartmentPicker, StatusPicker } from "@/components/pickers";
import { useDepartment, useSession } from "@/components/providers/SessionProvider";
import { PersonChip, StatusPill, TaskRow } from "@/components/tasks/TaskBits";
import { AttachmentList, AttachmentUploader, type FileWithVersions } from "@/components/tasks/AttachmentUploader";
import { HandoffPanel, type HandoffRow } from "@/components/tasks/HandoffPanel";
import { HandoffModal } from "@/components/tasks/HandoffModal";
import { RecurrenceControl, describeRecurrence, parseRecurrence } from "@/components/tasks/RecurrenceControl";
import type { TaskLite } from "@/components/tasks/TaskListView";
import { humaniseHistory } from "@/components/projects/humanise";
import { BuddyQuickActions } from "@/components/ai/BuddyQuickActions";
import { stagesFor, stageOf, withStage } from "@/components/departments/stages";
import { AckBar, AssigneeLoadPill, DefinitionOfDone, fetchLoad, ReopenModal } from "@/components/tasks/TaskGovernance";
import { WhoHasBall } from "@/components/mywork/WhoHasBall";
import {
  ago, cn, fmtDate, isManagerPlus, relDate, APPROVAL_STATUS_LABEL, APPROVAL_STATUS_TONE, APPROVAL_TYPES, STATUS_LABEL, STATUS_TONE, WAITING_LABEL, humanize,
  type ApprovalType, type Task, type Tables, type TaskStatus, type WaitingOn,
} from "@/lib/utils";

export type TaskDetailData = {
  task: Task;
  project: { id: string; name: string; department_id: string | null } | null;
  parent: { id: string; title: string } | null;
  subtasks: TaskLite[];
  checklist: Tables<"task_checklist">[];
  comments: (Tables<"task_comments"> & { author: { id: string; full_name: string; avatar_url: string | null } | null })[];
  history: Tables<"task_history">[];
  collaborators: string[];
  blockedBy: { id: string; title: string; status: TaskStatus; assignee_id: string | null }[];
  blocks: { id: string; title: string; status: TaskStatus; assignee_id: string | null }[];
  approvals: { id: string; title: string; status: Tables<"approvals">["status"]; approver_id: string | null; created_at: string; type: ApprovalType }[];
  files: FileWithVersions[];
  sourceMessage: { id: string; channel_id: string; body: string } | null;
  sourceMeeting: { id: string; title: string } | null;
  handoffs: HandoffRow[];
};

const WAITING_OPTIONS: WaitingOn[] = ["none", "employee", "manager", "client", "vendor", "approval", "blocked"];

function Section({ title, icon, action, children, count }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; count?: number }) {
  return (
    <section className="card">
      <div className="flex items-center gap-2 px-[var(--s4)] pt-[var(--s3)] pb-[var(--s2)]">
        <span className="text-muted">{icon}</span>
        <span className="h3">{title}</span>
        {typeof count === "number" && count > 0 && <span className="pill tone-neutral">{count}</span>}
        <span className="ml-auto">{action}</span>
      </div>
      <div className="px-[var(--s4)] pb-[var(--s3)]">{children}</div>
    </section>
  );
}

function SideField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

function renderMentions(body: string) {
  const parts = body.split(/(\[@[^\]]+\])/g);
  return parts.map((p, i) => (p.startsWith("[@") ? <span key={i} className="font-medium text-[var(--brand-2)]">@{p.slice(2, -1)}</span> : <React.Fragment key={i}>{p}</React.Fragment>));
}

export function TaskDetail({ data }: { data: TaskDetailData }) {
  const { profile, people } = useSession();
  const router = useRouter();
  const toast = useToast();
  const supabase = React.useMemo(() => createClient(), []);
  const [task, setTask] = React.useState<Task>(data.task);
  // Editable field drafts
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [title, setTitle] = React.useState(task.title);
  const [desc, setDesc] = React.useState(task.description || "");
  const [waitNote, setWaitNote] = React.useState(task.waiting_note || "");
  // When the server sends a fresh task (after router.refresh), adopt it — but keep drafts the user is still editing.
  const [synced, setSynced] = React.useState(data.task);
  if (synced !== data.task) {
    setSynced(data.task);
    setTask(data.task);
    if (title === synced.title) setTitle(data.task.title);
    if (desc === (synced.description || "")) setDesc(data.task.description || "");
    if (waitNote === (synced.waiting_note || "")) setWaitNote(data.task.waiting_note || "");
  }
  const dept = useDepartment(task.department_id);
  const stages = stagesFor(dept?.slug);
  const canDelete = isManagerPlus(profile.role) || task.created_by === profile.id;
  const done = task.status === "done";

  // ------------------------------------------------------------ mutations
  async function update(patch: Partial<Task>, msg?: string) {
    setTask((t) => ({ ...t, ...patch }));
    const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
    if (error) {
      toast.push(error.message, "danger");
      setTask(data.task);
      return false;
    }
    if (msg) toast.push(msg, "success");
    router.refresh();
    return true;
  }

  // Title
  async function saveTitle() {
    setEditingTitle(false);
    const v = title.trim();
    if (!v || v === task.title) return setTitle(task.title);
    await update({ title: v }, "Title updated");
  }

  // Waiting on
  async function setWaiting(w: WaitingOn) {
    const patch: Partial<Task> = { waiting_on: w };
    if (w === "none") {
      patch.waiting_on_user_id = null;
      patch.waiting_note = null;
      if (task.status === "waiting" || task.status === "blocked") patch.status = "in_progress";
    } else {
      patch.status = w === "blocked" ? "blocked" : "waiting";
    }
    await update(patch, w === "none" ? "Back to work" : `Now ${WAITING_LABEL[w].toLowerCase()}`);
  }
  // Reopening a done task asks for a reason (counts as a revision).
  const [reopenTo, setReopenTo] = React.useState<TaskStatus | null>(null);
  async function setStatus(s: TaskStatus, reopenReason?: string) {
    if (task.status === "done" && s !== "done" && !reopenReason) { setReopenTo(s); return; }
    const patch: Partial<Task> = { status: s };
    if (reopenReason) patch.reopen_reason = reopenReason;
    if (s !== "waiting" && s !== "blocked" && task.waiting_on !== "none") {
      patch.waiting_on = "none";
      patch.waiting_on_user_id = null;
      patch.waiting_note = null;
    }
    if (s === "blocked" && task.waiting_on === "none") patch.waiting_on = "blocked";
    if (s === "waiting" && task.waiting_on === "none") patch.waiting_on = "employee";
    await update(patch, `Moved to ${STATUS_LABEL[s]}`);
  }

  // Tags
  const [tagInput, setTagInput] = React.useState("");
  async function addTag() {
    const v = tagInput.trim().toLowerCase();
    setTagInput("");
    if (!v || task.tags.includes(v)) return;
    await update({ tags: [...task.tags, v] });
  }
  const removeTag = (t: string) => update({ tags: task.tags.filter((x) => x !== t) });

  // Subtasks
  const [subTitle, setSubTitle] = React.useState("");
  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    const v = subTitle.trim();
    if (!v) return;
    setSubTitle("");
    const { error } = await supabase.from("tasks").insert({
      org_id: profile.org_id!, title: v, parent_id: task.id, project_id: task.project_id, department_id: task.department_id,
      owner_id: profile.id, assignee_id: task.assignee_id, created_by: profile.id, status: "todo", priority: task.priority, due_date: task.due_date,
    });
    if (error) return toast.push(error.message, "danger");
    toast.push("Subtask added", "success");
    router.refresh();
  }

  // Checklist
  const [checkLabel, setCheckLabel] = React.useState("");
  async function addCheck(e: React.FormEvent) {
    e.preventDefault();
    const v = checkLabel.trim();
    if (!v) return;
    setCheckLabel("");
    const { error } = await supabase.from("task_checklist").insert({ task_id: task.id, label: v, position: data.checklist.length });
    if (error) return toast.push(error.message, "danger");
    router.refresh();
  }
  async function toggleCheck(c: Tables<"task_checklist">) {
    const { error } = await supabase.from("task_checklist").update({ done: !c.done }).eq("id", c.id);
    if (error) return toast.push(error.message, "danger");
    router.refresh();
  }
  async function deleteCheck(id: string) {
    const { error } = await supabase.from("task_checklist").delete().eq("id", id);
    if (error) return toast.push(error.message, "danger");
    router.refresh();
  }

  // Dependencies
  const [depQuery, setDepQuery] = React.useState("");
  const [depResults, setDepResults] = React.useState<{ id: string; title: string; status: TaskStatus; assignee_id: string | null }[]>([]);
  const visibleDepResults = depQuery.trim().length >= 2 ? depResults : [];
  React.useEffect(() => {
    if (depQuery.trim().length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      let q = supabase.from("tasks").select("id,title,status,assignee_id").ilike("title", `%${depQuery.trim()}%`).neq("id", task.id).is("parent_id", null).limit(8);
      if (task.project_id) q = q.eq("project_id", task.project_id);
      const { data: rows } = await q;
      if (alive) setDepResults((rows || []).filter((r) => !data.blockedBy.some((b) => b.id === r.id) && !data.blocks.some((b) => b.id === r.id)));
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [depQuery, supabase, task.id, task.project_id, data.blockedBy, data.blocks]);
  async function addDependency(dep: { id: string; title: string; status: TaskStatus; assignee_id: string | null }) {
    setDepQuery("");
    setDepResults([]);
    const { error } = await supabase.from("task_dependencies").insert({ task_id: task.id, depends_on_id: dep.id });
    if (error) return toast.push(error.message, "danger");
    if (dep.status !== "done" && (task.status === "todo" || task.status === "backlog")) {
      await update({ status: "waiting", waiting_on: "employee", waiting_on_user_id: dep.assignee_id, waiting_note: `Waiting on: ${dep.title}` });
    }
    toast.push("Dependency added", "success");
    router.refresh();
  }
  async function removeDependency(depId: string, direction: "blockedBy" | "blocks") {
    const q = direction === "blockedBy"
      ? supabase.from("task_dependencies").delete().eq("task_id", task.id).eq("depends_on_id", depId)
      : supabase.from("task_dependencies").delete().eq("task_id", depId).eq("depends_on_id", task.id);
    const { error } = await q;
    if (error) return toast.push(error.message, "danger");
    toast.push("Dependency removed", "success");
    router.refresh();
  }

  // Collaborators
  async function addCollaborator(id: string) {
    if (!id || data.collaborators.includes(id)) return;
    const { error } = await supabase.from("task_collaborators").insert({ task_id: task.id, user_id: id });
    if (error) return toast.push(error.message, "danger");
    toast.push("Contributor added", "success");
    router.refresh();
  }
  async function removeCollaborator(id: string) {
    const { error } = await supabase.from("task_collaborators").delete().eq("task_id", task.id).eq("user_id", id);
    if (error) return toast.push(error.message, "danger");
    router.refresh();
  }

  // Comments with @mention autocomplete
  const [comment, setComment] = React.useState("");
  const [mentionQ, setMentionQ] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const commentRef = React.useRef<HTMLTextAreaElement>(null);
  const mentionMatches = React.useMemo(() => (mentionQ === null ? [] : people.filter((p) => p.full_name.toLowerCase().includes(mentionQ.toLowerCase())).slice(0, 6)), [mentionQ, people]);
  function onCommentChange(v: string) {
    setComment(v);
    const caret = commentRef.current?.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const m = before.match(/(?:^|\s)@([\w ]{0,24})$/);
    setMentionQ(m ? m[1]! : null);
  }
  function pickMention(name: string) {
    const caret = commentRef.current?.selectionStart ?? comment.length;
    const before = comment.slice(0, caret).replace(/@([\w ]{0,24})$/, `[@${name}] `);
    setComment(before + comment.slice(caret));
    setMentionQ(null);
    commentRef.current?.focus();
  }
  async function sendComment(e: React.FormEvent) {
    e.preventDefault();
    const v = comment.trim();
    if (!v) return;
    setSending(true);
    const { error } = await supabase.from("task_comments").insert({ task_id: task.id, author_id: profile.id, body: v });
    setSending(false);
    if (error) return toast.push(error.message, "danger");
    setComment("");
    router.refresh();
  }

  // Modals: approval / reassign / delegate
  const [approvalOpen, setApprovalOpen] = React.useState(false);
  const [apType, setApType] = React.useState<ApprovalType>("other");
  const [apTitle, setApTitle] = React.useState(task.title);
  const [apApprover, setApApprover] = React.useState(task.approver_id || "");
  const [apNote, setApNote] = React.useState("");
  const [apBusy, setApBusy] = React.useState(false);
  async function requestApproval(e: React.FormEvent) {
    e.preventDefault();
    if (!apApprover) return toast.push("Choose an approver", "danger");
    setApBusy(true);
    const { error } = await supabase.from("approvals").insert({
      org_id: profile.org_id!, type: apType, title: apTitle.trim() || task.title, description: apNote || task.description, requested_by: profile.id,
      approver_id: apApprover, task_id: task.id, project_id: task.project_id, priority: task.priority, due_date: task.due_date,
    });
    setApBusy(false);
    if (error) return toast.push(error.message, "danger");
    setApprovalOpen(false);
    await update({ waiting_on: "approval", status: "waiting", requires_approval: true, approver_id: apApprover, waiting_on_user_id: apApprover, waiting_note: "Awaiting approval" }, "Approval requested");
  }

  const [handoffOpen, setHandoffOpen] = React.useState(false);
  const recurrence = parseRecurrence(task.recurrence);
  const pendingHandoff = data.handoffs.some((h) => h.status === "pending");

  const [personModal, setPersonModal] = React.useState<null | "reassign" | "delegate">(null);
  const [pick, setPick] = React.useState("");
  /** Assignment rules: check `can_assign` (via assignment_warnings) before writing so the trigger never surprises the user. */
  async function pickAssignee(v: string | null, extra: Partial<Task> = {}, msg = "Assignee updated") {
    if (v && v !== profile.id) {
      const info = await fetchLoad(v, task.due_date);
      if (info && !info.canAssign) { toast.push(`You cannot assign work to ${people.find((p) => p.id === v)?.full_name || "this person"} directly — use Request Help so their manager can route it.`, "danger"); return false; }
    }
    return update({ assignee_id: v || null, ...extra }, msg);
  }
  async function confirmPerson() {
    if (!pick) return;
    const ok = personModal === "reassign" ? await pickAssignee(pick, {}, "Task reassigned") : await pickAssignee(pick, { delegated_by: profile.id }, "Task delegated");
    if (!ok) return;
    setPersonModal(null);
    setPick("");
  }

  async function duplicate() {
    const { data: row, error } = await supabase.from("tasks").insert({
      org_id: profile.org_id!, title: `Copy of ${task.title}`, description: task.description, project_id: task.project_id, department_id: task.department_id,
      owner_id: task.owner_id, assignee_id: task.assignee_id, approver_id: task.approver_id, priority: task.priority, due_date: task.due_date, start_date: task.start_date,
      estimated_hours: task.estimated_hours, tags: task.tags, requires_approval: task.requires_approval, created_by: profile.id, status: "todo",
    }).select("id").single();
    if (error || !row) return toast.push(error?.message || "Could not duplicate", "danger");
    toast.push("Task duplicated", "success");
    router.push(`/tasks/${row.id}`);
  }
  async function remove() {
    if (!confirm(`Delete “${task.title}”? Subtasks and comments will be removed too.`)) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) return toast.push(error.message, "danger");
    toast.push("Task deleted", "success");
    router.push(task.project_id ? `/projects/${task.project_id}?tab=tasks` : "/tasks");
    router.refresh();
  }

  const stage = stages ? stageOf(task.tags, stages) : null;
  const checklistDone = data.checklist.filter((c) => c.done).length;

  return (
    <div className="page space-y-[var(--s4)] anim-fade-up">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-muted flex-wrap">
        <Link href="/tasks" className="hover:underline">Tasks</Link>
        {data.project && (<><ChevronRight size={12} /><Link href={`/projects/${data.project.id}`} className="hover:underline truncate max-w-[200px]">{data.project.name}</Link></>)}
        {data.parent && (<><ChevronRight size={12} /><Link href={`/tasks/${data.parent.id}`} className="hover:underline truncate max-w-[200px]">{data.parent.title}</Link></>)}
      </div>

      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          className={cn("mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors", done ? "bg-[var(--success)] border-[var(--success)] text-white" : "border-[var(--line-strong)] hover:border-[var(--success)]")}
          onClick={() => setStatus(done ? "todo" : "done")}
          aria-label={done ? "Reopen" : "Mark done"}
          title={done ? "Reopen" : "Mark done"}
        >
          {done && <Check size={14} />}
        </button>
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitle(task.title); setEditingTitle(false); } }} style={{ height: 46, fontSize: "1.35rem", fontWeight: 600, letterSpacing: "-0.02em" }} />
          ) : (
            <h1 className={cn("h1 cursor-text break-words", done && "line-through text-muted")} onClick={() => setEditingTitle(true)} title="Click to edit">{task.title}</h1>
          )}
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            <StatusPill status={task.status} size="lg" />
            {task.waiting_on !== "none" && <Pill tone={task.waiting_on === "blocked" ? "tone-danger" : "tone-warn"} size="lg">{WAITING_LABEL[task.waiting_on]}</Pill>}
            {task.requires_approval && <Pill tone="tone-violet" size="lg"><ShieldCheck size={11} /> Needs approval</Pill>}
            {stage && <Pill tone="tone-info" size="lg">Stage · {stage}</Pill>}
            {recurrence && <Pill tone="tone-info" size="lg" className="cursor-help"><Repeat size={11} /> Recurring · {describeRecurrence(recurrence)}</Pill>}
            {pendingHandoff && <a href="#handoff" className="pill pill-lg tone-warn"><ArrowRightLeft size={11} /> Handoff pending</a>}
            {!done && <WhoHasBall type="task" id={task.id} refreshKey={task.updated_at} />}
            <span className="text-xs text-muted">Created {ago(task.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <BuddyQuickActions scope={{ taskId: task.id, projectId: task.project_id || undefined, path: `/tasks/${task.id}` }} />
          {!done && <Button variant="success" size="sm" onClick={() => setStatus("done")} className="hidden sm:inline-flex"><CheckCircle2 size={14} /> Mark done</Button>}
          {!done && !pendingHandoff && <Button variant="secondary" size="sm" onClick={() => setHandoffOpen(true)} className="hidden md:inline-flex" title="Hand off to another department"><ArrowRightLeft size={14} /> Hand off</Button>}
          <Menu
            width={240}
            trigger={<Button variant="secondary" size="sm" icon aria-label="More actions"><MoreHorizontal size={16} /></Button>}
          >
            {!done && <MenuItem icon={<CheckCircle2 size={14} />} onClick={() => setStatus("done")}>Mark done</MenuItem>}
            {!done && <MenuItem icon={<ArrowRightLeft size={14} />} onClick={() => setHandoffOpen(true)}>Hand off to department</MenuItem>}
            <MenuItem icon={<ShieldCheck size={14} />} onClick={() => { setApTitle(task.title); setApApprover(task.approver_id || ""); setApprovalOpen(true); }}>Request approval</MenuItem>
            <MenuItem icon={<UserCog size={14} />} onClick={() => { setPick(task.assignee_id || ""); setPersonModal("reassign"); }}>Reassign</MenuItem>
            <MenuItem icon={<Send size={14} />} onClick={() => { setPick(""); setPersonModal("delegate"); }}>Delegate</MenuItem>
            <MenuItem icon={<Copy size={14} />} onClick={duplicate}>Duplicate</MenuItem>
            {canDelete && <MenuItem icon={<Trash2 size={14} />} onClick={remove} danger>Delete</MenuItem>}
          </Menu>
        </div>
      </div>

      {/* Responsibility chain */}
      <div className="card px-[var(--s4)] py-[var(--s3)] overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 min-w-max text-xs">
          <ChainItem label="Delegated by" value={task.delegated_by ? <PersonChip id={task.delegated_by} /> : <span className="text-muted">—</span>} />
          <ArrowRight size={14} className="text-muted shrink-0" />
          <ChainItem label="Responsible" value={<PersonChip id={task.assignee_id} />} highlight />
          <ArrowRight size={14} className="text-muted shrink-0" />
          <ChainItem label="Contributors" value={data.collaborators.length ? <span className="flex items-center gap-2">{data.collaborators.map((id) => <PersonChip key={id} id={id} showName={data.collaborators.length < 3} />)}</span> : <span className="text-muted">None</span>} />
          <ArrowRight size={14} className="text-muted shrink-0" />
          <ChainItem label="Approver" value={task.approver_id ? <PersonChip id={task.approver_id} /> : <span className="text-muted">Not required</span>} />
          <ArrowRight size={14} className="text-muted shrink-0" />
          <ChainItem label="Deadline" value={task.due_date ? <span className={cn("num font-medium", new Date(task.due_date) < new Date() && !done ? "text-danger" : "")}>{relDate(task.due_date)} · {fmtDate(task.due_date, true)}</span> : <span className="text-muted">No deadline</span>} />
        </div>
      </div>

      {/* Delegation receipt */}
      <AckBar task={task} onChanged={() => router.refresh()} />

      <div className="grid gap-[var(--s4)] lg:grid-cols-[minmax(0,1fr)_336px] items-start">
        {/* Main column */}
        <div className="space-y-[var(--s4)] min-w-0">
          <section className="card px-[var(--s4)] py-[var(--s3)]">
            <div className="label">Description</div>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => { if ((desc || "") !== (task.description || "")) update({ description: desc || null }, "Description saved"); }} placeholder="Context, expectations, links… (autosaves)" style={{ minHeight: 110 }} />
          </section>

          {/* Definition of done + quality gates */}
          <DefinitionOfDone task={task} onChanged={() => router.refresh()} />

          {/* Subtasks */}
          <Section title="Subtasks" icon={<ListTree size={15} />} count={data.subtasks.length}>
            {data.subtasks.length > 0 && (
              <div className="divide-y -mx-1 mb-2">
                {data.subtasks.map((s) => <TaskRow key={s.id} task={s} showProject={false} />)}
              </div>
            )}
            <form onSubmit={addSubtask} className="flex items-center gap-2">
              <CornerDownRight size={14} className="text-muted shrink-0" />
              <Input value={subTitle} onChange={(e) => setSubTitle(e.target.value)} placeholder="Add a subtask and press Enter" className="h-9" />
              <Button type="submit" size="sm" variant="secondary" disabled={!subTitle.trim()}><Plus size={14} /></Button>
            </form>
          </Section>

          {/* Checklist */}
          <Section title="Checklist" icon={<Check size={15} />} action={data.checklist.length ? <span className="text-xs text-muted num">{checklistDone}/{data.checklist.length}</span> : undefined}>
            {data.checklist.length > 0 && (
              <ul className="mb-2 space-y-0.5">
                {data.checklist.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 group px-1 py-1 rounded-[var(--radius-sm)] row-hover">
                    <button onClick={() => toggleCheck(c)} className={cn("w-4.5 h-4.5 rounded border flex items-center justify-center shrink-0 transition-colors", c.done ? "bg-[var(--success)] border-[var(--success)] text-white" : "border-[var(--line-strong)]")} aria-label="Toggle">
                      {c.done && <Check size={12} />}
                    </button>
                    <span className={cn("text-sm flex-1 min-w-0 truncate", c.done && "line-through text-muted")}>{c.label}</span>
                    <button onClick={() => deleteCheck(c.id)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-[var(--danger)]" aria-label="Remove"><X size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={addCheck} className="flex items-center gap-2">
              <Input value={checkLabel} onChange={(e) => setCheckLabel(e.target.value)} placeholder="Add a checklist item" className="h-9" />
              <Button type="submit" size="sm" variant="secondary" disabled={!checkLabel.trim()}><Plus size={14} /></Button>
            </form>
          </Section>

          {/* Dependencies */}
          <Section title="Dependencies" icon={<GitBranch size={15} />} count={data.blockedBy.length + data.blocks.length}>
            <div className="grid sm:grid-cols-2 gap-3">
              <DepList title="Blocked by" items={data.blockedBy} onRemove={(id) => removeDependency(id, "blockedBy")} empty="Nothing blocks this task" />
              <DepList title="Blocks" items={data.blocks} onRemove={(id) => removeDependency(id, "blocks")} empty="No task waits on this one" />
            </div>
            <div className="relative mt-3">
              <Input value={depQuery} onChange={(e) => setDepQuery(e.target.value)} placeholder={task.project_id ? "Search a task in this project to depend on…" : "Search a task to depend on…"} className="h-9" />
              {visibleDepResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full card p-1 anim-pop" style={{ boxShadow: "var(--shadow-lg)" }}>
                  {visibleDepResults.map((r) => (
                    <button key={r.id} onClick={() => addDependency(r)} className="w-full text-left flex items-center gap-2 px-2 h-9 rounded-[var(--radius-sm)] hover:bg-[var(--neutral-bg)] text-sm">
                      <span className="truncate flex-1">{r.title}</span>
                      <StatusPill status={r.status} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* Attachments */}
          <Section title="Attachments" icon={<Paperclip size={15} />} count={data.files.length}>
            <AttachmentList files={data.files} emptyHint="Attach briefs, drafts or final files. Everyone on the task sees the latest version." />
            <AttachmentUploader taskId={task.id} compact className="mt-3" />
          </Section>

          {/* Handoffs */}
          <HandoffPanel handoffs={data.handoffs} attachmentCount={data.files.length} />

          {/* Conversation */}
          <Section title="Task conversation" icon={<MessageSquare size={15} />} count={data.comments.length}>
            {data.comments.length === 0 ? (
              <div className="text-sm text-muted py-2">No comments yet. Keep the discussion attached to the task so decisions are never lost in chat.</div>
            ) : (
              <ul className="space-y-3 mb-3">
                {data.comments.map((c) => (
                  <li key={c.id} className="flex gap-2.5">
                    <Avatar name={c.author?.full_name} src={c.author?.avatar_url} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium truncate">{c.author?.full_name || "Someone"}</span>
                        <span className="text-[11px] text-muted shrink-0">{ago(c.created_at)}</span>
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words mt-0.5">{renderMentions(c.body)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={sendComment} className="relative">
              <Textarea ref={commentRef} value={comment} onChange={(e) => onCommentChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendComment(e); if (e.key === "Escape") setMentionQ(null); }} placeholder="Write a comment… use @ to mention someone. Ctrl+Enter to send." style={{ minHeight: 72 }} />
              {mentionMatches.length > 0 && (
                <div className="absolute left-0 bottom-full mb-1 card p-1 w-64 anim-pop z-20" style={{ boxShadow: "var(--shadow-lg)" }}>
                  {mentionMatches.map((p) => (
                    <button type="button" key={p.id} onClick={() => pickMention(p.full_name)} className="w-full flex items-center gap-2 px-2 h-9 rounded-[var(--radius-sm)] hover:bg-[var(--neutral-bg)] text-sm text-left">
                      <Avatar name={p.full_name} src={p.avatar_url} size={22} />
                      <span className="truncate">{p.full_name}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex justify-end mt-2">
                <Button type="submit" size="sm" variant="primary" loading={sending} disabled={!comment.trim()}><Send size={14} /> Comment</Button>
              </div>
            </form>
          </Section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-[var(--s3)] min-w-0">
          <div className="card px-[var(--s4)] py-[var(--s3)] space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <SideField label="Status"><StatusPicker value={task.status} onChange={setStatus} /></SideField>
              <SideField label="Priority"><PriorityPicker value={task.priority} onChange={(p) => update({ priority: p }, "Priority updated")} /></SideField>
            </div>
            <div className={cn("rounded-[var(--radius-sm)] p-3 space-y-2 border", task.waiting_on !== "none" ? "border-[var(--warn)] bg-[var(--warn-bg)]" : "sunken border-transparent")}>
              <div className="label mb-0">Waiting on</div>
              <Select value={task.waiting_on} onChange={(e) => setWaiting(e.target.value as WaitingOn)}>
                {WAITING_OPTIONS.map((w) => <option key={w} value={w}>{WAITING_LABEL[w]}</option>)}
              </Select>
              {task.waiting_on !== "none" && (
                <>
                  <PersonPicker value={task.waiting_on_user_id} onChange={(v) => update({ waiting_on_user_id: v || null }, v ? "They will be notified" : undefined)} placeholder="Who are you waiting for?" />
                  <Input value={waitNote} onChange={(e) => setWaitNote(e.target.value)} onBlur={() => { if (waitNote !== (task.waiting_note || "")) update({ waiting_note: waitNote || null }); }} placeholder="What exactly are you waiting for?" />
                </>
              )}
            </div>
            <SideField label="Responsible (assignee)"><PersonPicker value={task.assignee_id} onChange={(v) => pickAssignee(v || null)} /><div className="mt-1"><AssigneeLoadPill assignee={task.assignee_id} due={task.due_date} /></div></SideField>
            <SideField label="Accountable (owner)"><PersonPicker value={task.owner_id} onChange={(v) => update({ owner_id: v || null }, "Owner updated")} placeholder="No owner" /></SideField>
            {task.delegated_by && (
              <div className="text-xs inline-flex items-center gap-1.5 pill tone-neutral pill-lg"><Send size={11} /> Delegated by <PersonChip id={task.delegated_by} size={16} /></div>
            )}
            <SideField label="Approver"><PersonPicker value={task.approver_id} onChange={(v) => update({ approver_id: v || null, requires_approval: !!v }, "Approver updated")} placeholder="No approval needed" /></SideField>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={task.requires_approval} onChange={(e) => update({ requires_approval: e.target.checked })} className="accent-[var(--brand)]" />
              Requires approval before completion
            </label>
            <div className="grid grid-cols-2 gap-3">
              <SideField label="Start"><Input type="date" value={task.start_date || ""} onChange={(e) => update({ start_date: e.target.value || null })} /></SideField>
              <SideField label="Due"><Input type="datetime-local" value={task.due_date ? toLocalInput(task.due_date) : ""} onChange={(e) => update({ due_date: e.target.value ? new Date(e.target.value).toISOString() : null }, "Deadline updated")} /></SideField>
              <SideField label="Estimated h"><Input type="number" step="0.5" min={0} value={task.estimated_hours ?? ""} onChange={(e) => update({ estimated_hours: e.target.value === "" ? null : Number(e.target.value) })} /></SideField>
              <SideField label="Actual h"><Input type="number" step="0.5" min={0} value={task.actual_hours ?? ""} onChange={(e) => update({ actual_hours: e.target.value === "" ? null : Number(e.target.value) })} /></SideField>
            </div>
            <RecurrenceControl value={recurrence} done={done} onChange={(r) => update({ recurrence: r }, r ? `Repeats: ${describeRecurrence(r).toLowerCase()}` : "Repeat turned off")} />
            <SideField label="Project"><ProjectPicker value={task.project_id} onChange={(v) => update({ project_id: v || null }, "Project updated")} /></SideField>
            <SideField label="Department"><DepartmentPicker value={task.department_id} onChange={(v) => update({ department_id: v || null }, "Department updated")} /></SideField>
            {stages && (
              <SideField label={`${dept?.name} stage`}>
                <Select value={stage || ""} onChange={(e) => update({ tags: withStage(task.tags, stages, e.target.value || null) }, "Stage updated")}>
                  <option value="">No stage</option>
                  {stages.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </SideField>
            )}
            <SideField label="Tags">
              <div className="flex flex-wrap gap-1 mb-1.5">
                {task.tags.map((t) => (
                  <span key={t} className="pill tone-neutral">{t}<button onClick={() => removeTag(t)} aria-label={`Remove ${t}`} className="ml-0.5 hover:text-[var(--danger)]"><X size={10} /></button></span>
                ))}
              </div>
              <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }} onBlur={addTag} placeholder="Add tag, press Enter" className="h-9" />
            </SideField>
          </div>

          {/* Contributors */}
          <div className="card px-[var(--s4)] py-[var(--s3)]">
            <div className="flex items-center gap-2 mb-2"><Users size={14} className="text-muted" /><span className="h3">Contributors</span></div>
            {data.collaborators.length > 0 && (
              <ul className="space-y-1 mb-2">
                {data.collaborators.map((id) => (
                  <li key={id} className="flex items-center gap-2 group"><PersonChip id={id} size={22} className="flex-1" /><button onClick={() => removeCollaborator(id)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-[var(--danger)]" aria-label="Remove"><X size={13} /></button></li>
                ))}
              </ul>
            )}
            <PersonPicker value="" onChange={addCollaborator} placeholder="+ Add contributor" />
          </div>

          {/* Related */}
          <div className="card px-[var(--s4)] py-[var(--s3)]">
            <div className="flex items-center gap-2 mb-2"><Link2 size={14} className="text-muted" /><span className="h3">Related</span></div>
            <ul className="space-y-1.5 text-sm">
              {data.project && <li><Link href={`/projects/${data.project.id}`} className="link inline-flex items-center gap-1.5"><GitBranch size={13} /> {data.project.name}</Link></li>}
              {data.sourceMessage && (
                <li>
                  <Link href={`/chat/${data.sourceMessage.channel_id}?m=${data.sourceMessage.id}`} className="link inline-flex items-center gap-1.5"><MessageSquare size={13} /> From chat message</Link>
                  <div className="text-xs text-muted truncate-2 mt-0.5">“{data.sourceMessage.body}”</div>
                </li>
              )}
              {data.sourceMeeting && <li><Link href={`/meetings/${data.sourceMeeting.id}`} className="link inline-flex items-center gap-1.5"><Video size={13} /> {data.sourceMeeting.title}</Link></li>}
              {data.approvals.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <Link href={`/approvals/${a.id}`} className="link inline-flex items-center gap-1.5 min-w-0"><ShieldCheck size={13} /><span className="truncate">{a.title}</span></Link>
                  <Pill tone={APPROVAL_STATUS_TONE[a.status]}>{APPROVAL_STATUS_LABEL[a.status]}</Pill>
                </li>
              ))}
              {!data.project && !data.sourceMessage && !data.sourceMeeting && data.approvals.length === 0 && <li className="text-xs text-muted">Nothing linked yet. Approvals, source messages and meetings show up here.</li>}
            </ul>
          </div>

          {/* History */}
          <div className="card px-[var(--s4)] py-[var(--s3)]">
            <div className="flex items-center gap-2 mb-2"><History size={14} className="text-muted" /><span className="h3">History</span></div>
            {data.history.length === 0 ? <div className="text-xs text-muted">No changes recorded yet.</div> : (
              <ol className="relative border-l ml-2 space-y-3">
                {data.history.map((h) => {
                  const actor = people.find((p) => p.id === h.actor_id);
                  return (
                    <li key={h.id} className="pl-4 relative">
                      <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[var(--line-strong)]" />
                      <div className="text-xs"><span className="font-medium">{actor?.full_name.split(" ")[0] || "Someone"}</span> {humaniseHistory(h, people)}</div>
                      <div className="text-[11px] text-muted">{ago(h.created_at)}</div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </aside>
      </div>

      {/* Modals */}
      <Modal open={approvalOpen} onClose={() => setApprovalOpen(false)} title="Request approval">
        <form onSubmit={requestApproval} className="space-y-3">
          <Field label="What needs approval?"><Input value={apTitle} onChange={(e) => setApTitle(e.target.value)} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={apType} onChange={(e) => setApType(e.target.value as ApprovalType)}>
                {APPROVAL_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
              </Select>
            </Field>
            <Field label="Approver"><PersonPicker value={apApprover} onChange={setApApprover} placeholder="Choose approver" allowEmpty={false} /></Field>
          </div>
          <Field label="Note for the approver"><Textarea value={apNote} onChange={(e) => setApNote(e.target.value)} placeholder="What should they look at? Any deadline?" style={{ minHeight: 72 }} /></Field>
          <div className="text-xs text-muted">The task will wait on approval until it is decided. Approving it automatically resumes the task.</div>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setApprovalOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={apBusy}>Send request</Button></div>
        </form>
      </Modal>

      <HandoffModal open={handoffOpen} onClose={() => setHandoffOpen(false)} task={task} attachmentCount={data.files.length} />

      <ReopenModal open={reopenTo !== null} onClose={() => setReopenTo(null)} onConfirm={async (reason) => { const to = reopenTo || "todo"; setReopenTo(null); await setStatus(to, reason); }} />

      <Modal open={personModal !== null} onClose={() => setPersonModal(null)} title={personModal === "reassign" ? "Reassign task" : "Delegate task"} width={440}>
        <div className="space-y-3">
          <Field label={personModal === "reassign" ? "New responsible person" : "Delegate to"}><PersonPicker value={pick} onChange={setPick} placeholder="Choose a person" allowEmpty={false} /></Field>
          <div className="text-xs text-muted">{personModal === "reassign" ? "The previous assignee stays in the history. The new person is notified immediately." : "You will be recorded as the delegator and notified when the task is done."}</div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setPersonModal(null)}>Cancel</Button><Button variant="primary" onClick={confirmPerson} disabled={!pick}>{personModal === "reassign" ? "Reassign" : "Delegate"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}

function ChainItem({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-0.5 px-2.5 py-1.5 rounded-[var(--radius-sm)]", highlight && "bg-[var(--info-bg)]")}>
      <span className="eyebrow">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function DepList({ title, items, onRemove, empty }: { title: string; items: { id: string; title: string; status: TaskStatus }[]; onRemove: (id: string) => void; empty: string }) {
  return (
    <div>
      <div className="eyebrow mb-1">{title}</div>
      {items.length === 0 ? <div className="text-xs text-muted">{empty}</div> : (
        <ul className="space-y-1">
          {items.map((d) => (
            <li key={d.id} className="flex items-center gap-2 group text-sm">
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", d.status === "done" ? "bg-[var(--success)]" : "bg-[var(--warn)]")} />
              <Link href={`/tasks/${d.id}`} className="truncate flex-1 hover:underline">{d.title}</Link>
              <span className={cn("pill", STATUS_TONE[d.status])}>{STATUS_LABEL[d.status]}</span>
              <button onClick={() => onRemove(d.id)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-[var(--danger)]" aria-label="Remove"><X size={13} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
