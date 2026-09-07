"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, ArrowRightLeft, ChevronRight, ExternalLink, FolderKanban, Lock, MessageSquare, Pencil, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, EmptyState, Field, Modal, Stat, Tabs, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { TaskListView, type TaskLite } from "@/components/tasks/TaskListView";
import { AttachmentList, AttachmentUploader, type FileWithVersions } from "@/components/tasks/AttachmentUploader";
import { HandoffActions, readPackage, type HandoffRow } from "@/components/tasks/HandoffPanel";
import { ProjectCard, type ProjectSummary } from "@/components/projects/ProjectCard";
import { DepartmentHealth, departmentScore, HealthRing, scoreTone } from "@/components/departments/DepartmentCard";
import { stagesFor, stageTag } from "@/components/departments/stages";
import { DepartmentChannels, DepartmentOpenRequests, DepartmentServices, DepartmentStatusPanel } from "@/components/departments/DepartmentPortal";
import type { HelpRow } from "@/components/help/HelpBits";
import type { Service } from "@/components/help/lib";
import { cn, fmtDate, isAdminRole, isLeadPlus, isManagerPlus, relDate, ROLE_LABEL, STATUS_LABEL, TASK_STATUSES, type Channel, type Department, type Tables } from "@/lib/utils";

type Member = Pick<Tables<"profiles">, "id" | "full_name" | "avatar_url" | "designation" | "role" | "presence" | "email" | "manager_id">;
type Workload = { user_id: string; open_tasks: number; urgent: number; overdue: number; blocked: number; waiting: number; due_week: number; on_leave: boolean; est_hours: number };
export type IncomingHandoff = HandoffRow & { task: { id: string; title: string } | null };

export type DepartmentWorkspaceData = {
  department: Department;
  health: DepartmentHealth | null;
  members: Member[];
  tasks: TaskLite[];
  projects: ProjectSummary[];
  channelId: string | null;
  files: FileWithVersions[];
  workload: Workload[];
  handoffs: IncomingHandoff[];
  services: Service[];
  requests: HelpRow[];
  openChannels: Pick<Channel, "id" | "name" | "description" | "purpose" | "visibility" | "type" | "last_message_at">[];
  initialTab: string;
};

const TABS = ["overview", "tasks", "projects", "people", "channel", "files"] as const;
type Tab = (typeof TABS)[number];

export function DepartmentWorkspace({ data }: { data: DepartmentWorkspaceData }) {
  const { profile } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { department: d } = data;
  const [tab, setTab] = React.useState<Tab>((TABS as readonly string[]).includes(data.initialTab) ? (data.initialTab as Tab) : "overview");
  const [editOpen, setEditOpen] = React.useState(false);
  const [head, setHead] = React.useState(d.head_id || "");
  const [desc, setDesc] = React.useState(d.description || "");
  const [busy, setBusy] = React.useState(false);
  const admin = isAdminRole(profile.role);
  const inDept = profile.department_id === d.id;
  const canRunDept = admin || isManagerPlus(profile.role) || d.head_id === profile.id || d.on_duty_user_id === profile.id || (inDept && isLeadPlus(profile.role));
  const score = data.health ? departmentScore(data.health) : 100;
  const stages = stagesFor(d.slug);

  function go(t: Tab) {
    setTab(t);
    router.replace(t === "overview" ? pathname : `${pathname}?tab=${t}`, { scroll: false });
  }
  async function saveDept(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from("departments").update({ head_id: head || null, description: desc || null }).eq("id", d.id);
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Department updated", "success");
    setEditOpen(false);
    router.refresh();
  }

  const open = data.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const activeProjects = data.projects.filter((p) => p.status !== "completed" && p.status !== "cancelled");

  // Stage pipeline counts
  const pipeline = stages
    ? stages.map((s) => ({ label: s, count: open.filter((t) => (t.tags || []).map((x) => x.toLowerCase()).includes(stageTag(s))).length }))
    : TASK_STATUSES.filter((s) => s !== "cancelled").map((s) => ({ label: STATUS_LABEL[s], count: data.tasks.filter((t) => t.status === s).length }));

  return (
    <div className="page space-y-[var(--s4)] anim-fade-up">
      <div className="flex items-center gap-1.5 text-xs text-muted"><Link href="/departments" className="hover:underline">Departments</Link><ChevronRight size={12} /><span>{d.name}</span></div>

      {/* Header */}
      <div className="card" style={{ padding: "var(--s4)", borderTop: `3px solid ${d.color}` }}>
        <div className="flex flex-wrap items-start gap-4">
          <span className="w-12 h-12 rounded-[var(--radius)] flex items-center justify-center text-white text-lg font-semibold shrink-0" style={{ background: d.color }}>{d.name.slice(0, 1)}</span>
          <div className="min-w-0 flex-1">
            <h1 className="h1">{d.name}</h1>
            <p className="text-sm text-2 mt-1 max-w-2xl">{d.description || "No description yet."}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap text-xs">
              <span className="inline-flex items-center gap-1.5"><span className="text-muted">Head</span>{d.head_id ? <PersonChip id={d.head_id} /> : <span className="text-muted">Not assigned</span>}</span>
              <span className="text-muted">· {data.members.length} people · {open.length} open tasks · {activeProjects.length} active projects</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <HealthRing score={score} size={64} stroke={7} />
            {admin && <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}><Pencil size={14} /> Edit</Button>}
          </div>
        </div>
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={go}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "tasks", label: "Tasks", count: open.length },
          { key: "projects", label: "Projects", count: activeProjects.length },
          { key: "people", label: "People", count: data.members.length },
          { key: "channel", label: "Channel" },
          { key: "files", label: "Files", count: data.files.length },
        ]}
        className="-mx-[var(--s4)] px-[var(--s4)] lg:-mx-[var(--s5)] lg:px-[var(--s5)] sticky top-[var(--topbar-h)] z-20 glass"
      />

      <div className="anim-fade-in" key={tab}>
        {tab === "overview" && (
          <div className="space-y-[var(--s4)]">
            <DepartmentStatusPanel d={d} canEdit={canRunDept} />

            {/* Workflow strip */}
            <Card className="p-[var(--s4)]">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div><div className="h3">{stages ? `${d.name} workflow` : "Task pipeline"}</div><div className="text-xs text-muted">{stages ? "Tasks move through these stages. Set the stage on any task from its detail page." : "Open tasks by status."}</div></div>
                <span className="text-xs text-muted num">{open.length} open</span>
              </div>
              <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
                <div className="flex items-stretch gap-1.5 min-w-max">
                  {pipeline.map((s, i) => (
                    <button key={s.label} onClick={() => go("tasks")} className={cn("relative flex flex-col items-center justify-center min-w-[92px] px-3 py-2 rounded-[var(--radius-sm)] border text-center transition-colors hover:border-[var(--line-strong)]", s.count > 0 ? "bg-[var(--bg-elev)]" : "sunken")}>
                      <span className="text-lg font-semibold num leading-none" style={{ color: s.count > 0 ? d.color : "var(--fg-muted)" }}>{s.count}</span>
                      <span className="text-[10px] text-muted mt-1 whitespace-nowrap">{i + 1}. {s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {data.handoffs.length > 0 && <IncomingHandoffs handoffs={data.handoffs} />}

            <DepartmentServices d={d} services={data.services} canManage={admin || (inDept && isLeadPlus(profile.role))} />

            <div className="grid gap-[var(--s4)] lg:grid-cols-[1.618fr_1fr]">
              <DepartmentOpenRequests d={d} requests={data.requests} canWork={inDept || isManagerPlus(profile.role)} />
              <DepartmentChannels d={d} channels={data.openChannels} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="People" value={data.members.length} icon={<Users size={14} />} onClick={() => go("people")} />
              <Stat label="Open tasks" value={open.length} onClick={() => go("tasks")} />
              <Stat label="Overdue" value={data.health?.overdue ?? 0} tone={data.health?.overdue ? "text-danger" : undefined} icon={<AlertTriangle size={14} />} onClick={() => go("tasks")} />
              <Stat label="Blocked" value={data.health?.blocked ?? 0} tone={data.health?.blocked ? "text-danger" : undefined} icon={<Lock size={14} />} onClick={() => go("tasks")} />
            </div>

            <div className="grid gap-[var(--s4)] lg:grid-cols-2">
              <Card className="p-[var(--s4)]">
                <div className="flex items-center justify-between mb-2"><span className="h3">Members</span><button className="text-xs link" onClick={() => go("people")}>All</button></div>
                {data.members.length === 0 ? <div className="text-xs text-muted">Nobody is in this department yet.</div> : (
                  <ul className="space-y-1.5">
                    {data.members.slice(0, 8).map((m) => (
                      <li key={m.id}><Link href={`/people/${m.id}`} className="flex items-center gap-2.5 px-1 py-1 rounded-[var(--radius-sm)] row-hover"><Avatar name={m.full_name} src={m.avatar_url} size={26} presence={m.presence} /><span className="min-w-0"><span className="text-sm block truncate">{m.full_name}</span><span className="text-[11px] text-muted block truncate">{m.designation || ROLE_LABEL[m.role]}</span></span></Link></li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card className="p-[var(--s4)]">
                <div className="flex items-center justify-between mb-2"><span className="h3">Active projects</span><button className="text-xs link" onClick={() => go("projects")}>All</button></div>
                {activeProjects.length === 0 ? <div className="text-xs text-muted">No active projects in this department.</div> : (
                  <ul className="space-y-1.5">
                    {activeProjects.slice(0, 6).map((p) => (
                      <li key={p.id}><Link href={`/projects/${p.id}`} className="flex items-center gap-2 px-1 py-1 rounded-[var(--radius-sm)] row-hover text-sm"><FolderKanban size={14} className="text-muted shrink-0" /><span className="truncate flex-1">{p.name}</span><span className="text-[11px] text-muted num">{p.total_tasks ? Math.round((p.done_tasks / p.total_tasks) * 100) : 0}%</span></Link></li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}

        {tab === "tasks" && (
          <TaskListView tasks={data.tasks} defaults={{ department_id: d.id }} emptyHint={`No tasks in ${d.name} yet. Create one and it appears in the ${stages ? "workflow" : "pipeline"} above.`} />
        )}

        {tab === "projects" && (
          data.projects.length === 0 ? <Card><EmptyState icon={<FolderKanban size={18} />} title="No projects" hint="Projects assigned to this department will appear here." action={<Link href="/projects/new" className="btn btn-primary btn-sm">New project</Link>} /></Card>
            : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 stagger">{data.projects.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
        )}

        {tab === "people" && <PeoplePanel members={data.members} workload={data.workload} tasks={data.tasks} canSeeAll={isLeadPlus(profile.role)} />}

        {tab === "channel" && (
          data.channelId ? (
            <Link href={`/chat/${data.channelId}`} className="card card-hover p-[var(--s4)] flex items-center gap-3">
              <span className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center text-white" style={{ background: d.color }}><MessageSquare size={18} /></span>
              <div className="min-w-0 flex-1"><div className="font-medium">Open #{d.slug}</div><div className="text-xs text-muted">The department channel — announcements, questions and quick coordination.</div></div>
              <ExternalLink size={16} className="text-muted" />
            </Link>
          ) : <Card><EmptyState icon={<MessageSquare size={18} />} title="No department channel" hint="An admin can create one from Chat → New channel and link it to this department." /></Card>
        )}

        {tab === "files" && (
          <div className="space-y-3">
            <AttachmentUploader departmentId={d.id} />
            <div className="card px-3 py-1"><AttachmentList files={data.files} emptyHint="Templates, guidelines and shared references for the department live here." /></div>
          </div>
        )}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${d.name}`} width={480}>
        <form onSubmit={saveDept} className="space-y-3">
          <Field label="Department head"><PersonPicker value={head} onChange={setHead} placeholder="No head" /></Field>
          <Field label="Description"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} style={{ minHeight: 80 }} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div>
        </form>
      </Modal>
    </div>
  );
}

/** Pending handoffs addressed to this department. Leads+ (or the named receiver) accept or decline inline. */
function IncomingHandoffs({ handoffs }: { handoffs: IncomingHandoff[] }) {
  const { departments } = useSession();
  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name : undefined) || "Another department";
  return (
    <Card className="p-[var(--s4)]" style={{ borderColor: "var(--warn)" }}>
      <div className="flex items-center gap-2 mb-2">
        <ArrowRightLeft size={15} className="text-warn" />
        <span className="h3">Incoming handoffs</span>
        <span className="pill tone-warn">{handoffs.length} awaiting acceptance</span>
      </div>
      <div className="text-xs text-muted mb-3">Work other departments are passing to this team. Accepting assigns the task and starts the clock; declining sends it back with your note.</div>
      <ul className="divide-y">
        {handoffs.map((h) => {
          const pkg = readPackage(h.package);
          return (
            <li key={h.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/tasks/${h.task_id}#handoff`} className="text-sm font-medium hover:underline block truncate">{h.task?.title || "Task"}</Link>
                  <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap mt-0.5 text-[11px] text-muted">
                    <span>From <span className="font-medium text-2">{deptName(h.from_department_id)}</span></span>
                    {h.from_user_id && <span className="inline-flex items-center gap-1">· <PersonChip id={h.from_user_id} size={14} /></span>}
                    {h.to_user_id && <span className="inline-flex items-center gap-1">· for <PersonChip id={h.to_user_id} size={14} /></span>}
                    {pkg.deadline && <span className="num">· due {relDate(pkg.deadline)} {fmtDate(pkg.deadline, true).split(", ")[1]}</span>}
                  </div>
                  {pkg.brief && <div className="text-xs text-2 truncate-2 mt-1">{pkg.brief}</div>}
                </div>
                <div className="shrink-0"><HandoffActions handoff={h} compact /></div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function PeoplePanel({ members, workload, tasks, canSeeAll }: { members: Member[]; workload: Workload[]; tasks: TaskLite[]; canSeeAll: boolean }) {
  const wl = new Map(workload.map((w) => [w.user_id, w]));
  if (members.length === 0) return <Card><EmptyState icon={<Users size={18} />} title="No members" hint="People are assigned to departments from their profile or by an admin." /></Card>;
  return (
    <div className="space-y-2">
      {!canSeeAll && <div className="text-xs text-muted">Workload details are visible to team leads and above; you can see your own.</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 stagger">
        {members.map((m) => {
          const w = wl.get(m.id);
          const fallbackOpen = tasks.filter((t) => t.assignee_id === m.id && t.status !== "done" && t.status !== "cancelled").length;
          const openN = w?.open_tasks ?? fallbackOpen;
          const load = Math.min(100, Math.round((openN / 12) * 100));
          return (
            <Link key={m.id} href={`/people/${m.id}`} className="card card-hover p-3 flex items-center gap-3">
              <Avatar name={m.full_name} src={m.avatar_url} size={40} presence={m.presence} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{m.full_name}{w?.on_leave ? <span className="ml-1.5 pill tone-muted">On leave</span> : null}</div>
                <div className="text-[11px] text-muted truncate">{m.designation || ROLE_LABEL[m.role]}</div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <div className="flex-1 h-1.5 rounded-full sunken overflow-hidden"><div className="h-full rounded-full" style={{ width: `${load}%`, background: scoreTone(100 - load) }} /></div>
                  <span className="text-[11px] text-muted num whitespace-nowrap">{openN} open</span>
                </div>
                {w && (w.overdue > 0 || w.blocked > 0 || w.urgent > 0) && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {w.overdue > 0 && <span className="pill tone-danger num">{w.overdue} overdue</span>}
                    {w.blocked > 0 && <span className="pill tone-danger num">{w.blocked} blocked</span>}
                    {w.urgent > 0 && <span className="pill tone-orange num">{w.urgent} urgent</span>}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
