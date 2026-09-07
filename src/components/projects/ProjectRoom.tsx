"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Archive, CalendarDays, ChevronRight, Pencil, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Modal, Pill, Progress, Select, Tabs, Textarea, useToast } from "@/components/ui";
import { PersonPicker, DepartmentPicker, PriorityPicker, ClassificationPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import type { TaskLite } from "@/components/tasks/TaskListView";
import type { FileWithVersions } from "@/components/tasks/AttachmentUploader";
import { ProjectOverview } from "@/components/projects/ProjectOverview";
import { ProjectTaskBoard } from "@/components/projects/ProjectTaskBoard";
import { Gantt } from "@/components/projects/Gantt";
import { TeamPanel, MilestonesPanel, ChatPanel, FilesPanel, MeetingsPanel, DecisionsPanel, ApprovalsPanel, RisksPanel, ActivityPanel } from "@/components/projects/ProjectPanels";
import { ProjectSummary } from "@/components/ai/ProjectSummary";
import { cn, isManagerPlus, relDate, CLASSIFICATION_LABEL, PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, type Project, type ProjectStatus, type Tables, type Classification, type TaskPriority } from "@/lib/utils";

export type ProjectTask = TaskLite & { waiting_note: string | null };
export type ProjectRoomData = {
  project: Project;
  members: { user_id: string; role: string; added_at: string }[];
  tasks: ProjectTask[];
  milestones: Tables<"milestones">[];
  risks: Tables<"project_risks">[];
  decisions: Tables<"decisions">[];
  approvals: Tables<"approvals">[];
  meetings: Pick<Tables<"meetings">, "id" | "title" | "starts_at" | "ends_at" | "organizer_id" | "location" | "meeting_link">[];
  files: FileWithVersions[];
  channelId: string | null;
  activity: Tables<"audit_logs">[];
  initialTab: string;
};

const TABS = ["overview", "ai", "tasks", "timeline", "team", "milestones", "chat", "files", "meetings", "decisions", "approvals", "risks", "activity"] as const;
type Tab = (typeof TABS)[number];

export function projectStats(tasks: TaskLite[]) {
  const top = tasks.filter((t) => !t.parent_id && t.status !== "cancelled");
  const now = Date.now();
  const done = top.filter((t) => t.status === "done").length;
  const open = top.length - done;
  const overdue = top.filter((t) => t.status !== "done" && t.due_date && new Date(t.due_date).getTime() < now).length;
  const blocked = top.filter((t) => t.status === "blocked").length;
  const waiting = top.filter((t) => t.status === "waiting").length;
  const progress = top.length ? Math.round((done / top.length) * 100) : 0;
  return { total: top.length, done, open, overdue, blocked, waiting, progress };
}

export function ProjectRoom({ data }: { data: ProjectRoomData }) {
  const { profile, departments } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { project } = data;
  const [tab, setTab] = React.useState<Tab>((TABS as readonly string[]).includes(data.initialTab) ? (data.initialTab as Tab) : "overview");
  const [editOpen, setEditOpen] = React.useState(false);
  const dept = departments.find((d) => d.id === project.department_id);
  const stats = projectStats(data.tasks);
  const canEdit = isManagerPlus(profile.role) || project.owner_id === profile.id || project.created_by === profile.id;
  const overdue = !!project.due_date && new Date(project.due_date) < new Date() && project.status !== "completed" && project.status !== "cancelled";

  function go(t: Tab) {
    setTab(t);
    router.replace(t === "overview" ? pathname : `${pathname}?tab=${t}`, { scroll: false });
  }

  async function setStatus(s: ProjectStatus) {
    const { error } = await createClient().from("projects").update({ status: s }).eq("id", project.id);
    if (error) return toast.push(error.message, "danger");
    toast.push(`Project marked ${PROJECT_STATUS_LABEL[s].toLowerCase()}`, "success");
    router.refresh();
  }
  async function archive() {
    if (!confirm(`Archive “${project.name}”? It will be hidden from the active list.`)) return;
    const { error } = await createClient().from("projects").update({ archived: true }).eq("id", project.id);
    if (error) return toast.push(error.message, "danger");
    toast.push("Project archived", "success");
    router.push("/projects");
    router.refresh();
  }

  const pendingApprovals = data.approvals.filter((a) => a.status === "pending").length;
  const openRisks = data.risks.filter((r) => !r.resolved_at).length;

  return (
    <div className="page space-y-[var(--s4)] anim-fade-up">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/projects" className="hover:underline">Projects</Link>
        <ChevronRight size={12} />
        <span className="truncate">{project.name}</span>
      </div>

      {/* Header */}
      <div className="card p-[var(--s4)]">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {dept && <span className="inline-flex items-center gap-1.5 text-xs text-muted"><span className="w-2 h-2 rounded-full" style={{ background: dept.color }} />{dept.name}</span>}
              {project.code && <span className="text-xs text-muted num">{project.code}</span>}
              {project.client_name && <span className="text-xs text-muted">· {project.client_name}</span>}
            </div>
            <h1 className="h1 mt-1 break-words">{project.name}</h1>
            {project.description && <p className="text-sm text-2 mt-1.5 max-w-3xl">{project.description}</p>}
            <div className="flex items-center gap-2 flex-wrap mt-3">
              {canEdit ? (
                <span className="inline-flex items-center gap-1.5">
                  <Pill tone={PROJECT_STATUS_TONE[project.status]} size="lg">{PROJECT_STATUS_LABEL[project.status]}</Pill>
                  <span className="w-[130px]">
                    <Select value={project.status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} style={{ height: 26, fontSize: "0.75rem" }} aria-label="Change project status">
                      {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
                    </Select>
                  </span>
                </span>
              ) : (
                <Pill tone={PROJECT_STATUS_TONE[project.status]} size="lg">{PROJECT_STATUS_LABEL[project.status]}</Pill>
              )}
              <Pill tone="tone-violet" size="lg">{CLASSIFICATION_LABEL[project.classification]}</Pill>
              <span className="inline-flex items-center gap-1.5 text-xs"><span className="text-muted">Owner</span><PersonChip id={project.owner_id} size={18} /></span>
              {project.due_date && <span className={cn("inline-flex items-center gap-1 text-xs num", overdue ? "text-danger font-medium" : "text-muted")}><CalendarDays size={13} /> Due {relDate(project.due_date)}</span>}
              {project.archived && <Pill tone="tone-muted" size="lg">Archived</Pill>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {canEdit && <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}><Pencil size={14} /> Edit</Button>}
            {canEdit && !project.archived && <Button size="sm" variant="ghost" onClick={archive} title="Archive"><Archive size={14} /><span className="hidden sm:inline">Archive</span></Button>}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Progress value={stats.progress} tone={stats.progress === 100 ? "var(--success)" : stats.overdue || stats.blocked ? "var(--warn)" : "var(--brand)"} className="flex-1" height={8} />
          <span className="text-xs num text-muted whitespace-nowrap">{stats.done}/{stats.total} tasks · {stats.progress}%</span>
        </div>
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={go}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "ai", label: <span className="inline-flex items-center gap-1"><Sparkles size={12} className="text-[var(--accent)]" /> AI Summary</span> },
          { key: "tasks", label: "Tasks", count: stats.open },
          { key: "timeline", label: "Timeline" },
          { key: "team", label: "Team", count: data.members.length },
          { key: "milestones", label: "Milestones", count: data.milestones.filter((m) => !m.completed_at).length },
          { key: "chat", label: "Chat" },
          { key: "files", label: "Files", count: data.files.length },
          { key: "meetings", label: "Meetings", count: data.meetings.length },
          { key: "decisions", label: "Decisions", count: data.decisions.length },
          { key: "approvals", label: "Approvals", count: pendingApprovals },
          { key: "risks", label: "Risks", count: openRisks },
          { key: "activity", label: "Activity" },
        ]}
        className="-mx-[var(--s4)] px-[var(--s4)] lg:-mx-[var(--s5)] lg:px-[var(--s5)] sticky top-[var(--topbar-h)] z-20 glass"
      />

      <div className="anim-fade-in" key={tab}>
        {tab === "overview" && <ProjectOverview data={data} stats={stats} onGo={(t) => go(t as Tab)} />}
        {tab === "ai" && <ProjectSummary projectId={project.id} />}
        {tab === "tasks" && <ProjectTaskBoard project={project} tasks={data.tasks} milestones={data.milestones} />}
        {tab === "timeline" && <Gantt tasks={data.tasks.filter((t) => !t.parent_id)} milestones={data.milestones} projectStart={project.start_date} projectDue={project.due_date} />}
        {tab === "team" && <TeamPanel project={project} members={data.members} tasks={data.tasks} />}
        {tab === "milestones" && <MilestonesPanel project={project} milestones={data.milestones} tasks={data.tasks} />}
        {tab === "chat" && <ChatPanel channelId={data.channelId} projectName={project.name} />}
        {tab === "files" && <FilesPanel project={project} files={data.files} />}
        {tab === "meetings" && <MeetingsPanel project={project} meetings={data.meetings} />}
        {tab === "decisions" && <DecisionsPanel project={project} decisions={data.decisions} memberIds={data.members.map((m) => m.user_id)} />}
        {tab === "approvals" && <ApprovalsPanel project={project} approvals={data.approvals} />}
        {tab === "risks" && <RisksPanel project={project} risks={data.risks} />}
        {tab === "activity" && <ActivityPanel activity={data.activity} />}
      </div>

      {editOpen && <EditProjectModal onClose={() => setEditOpen(false)} project={project} />}
    </div>
  );
}

/** Mounted only while open, so the form always starts from the current project values. */
function EditProjectModal({ onClose, project }: { onClose: () => void; project: Project }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = React.useState({
    name: project.name, description: project.description || "", objectives: project.objectives || "", department_id: project.department_id || "", owner_id: project.owner_id || "",
    priority: project.priority as TaskPriority, classification: project.classification as Classification, start_date: project.start_date || "", due_date: project.due_date || "",
    client_name: project.client_name || "", tags: project.tags.join(", "), code: project.code || "",
  });
  const [loading, setLoading] = React.useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await createClient().from("projects").update({
      name: f.name.trim(), description: f.description || null, objectives: f.objectives || null, department_id: f.department_id || null, owner_id: f.owner_id || null,
      priority: f.priority, classification: f.classification, start_date: f.start_date || null, due_date: f.due_date || null, client_name: f.client_name || null,
      tags: f.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean), code: f.code || null,
    }).eq("id", project.id);
    setLoading(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Project updated", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title="Edit project" width={640}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} required /></Field>
          <Field label="Code"><Input value={f.code} onChange={(e) => set("code", e.target.value)} placeholder="PRJ-01" /></Field>
        </div>
        <Field label="Description"><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} style={{ minHeight: 64 }} /></Field>
        <Field label="Objectives"><Textarea value={f.objectives} onChange={(e) => set("objectives", e.target.value)} style={{ minHeight: 64 }} placeholder="One per line" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department"><DepartmentPicker value={f.department_id} onChange={(v) => set("department_id", v)} /></Field>
          <Field label="Owner"><PersonPicker value={f.owner_id} onChange={(v) => set("owner_id", v)} placeholder="No owner" /></Field>
          <Field label="Priority"><PriorityPicker value={f.priority} onChange={(v) => set("priority", v)} /></Field>
          <Field label="Classification"><ClassificationPicker value={f.classification} onChange={(v) => set("classification", v)} /></Field>
          <Field label="Start"><Input type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} /></Field>
          <Field label="Due"><Input type="date" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} /></Field>
          <Field label="Client"><Input value={f.client_name} onChange={(e) => set("client_name", e.target.value)} /></Field>
          <Field label="Tags"><Input value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="comma separated" /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={loading}>Save changes</Button></div>
      </form>
    </Modal>
  );
}
