"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Columns3, LayoutList, ListChecks, Plus, SlidersHorizontal, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, EmptyState, Modal, SearchInput, Select, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { TaskRow } from "@/components/tasks/TaskBits";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { QuickTaskForm, type QuickTaskDefaults } from "@/components/tasks/QuickTaskForm";
import { cn, PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, TASK_STATUSES, type Task, type TaskStatus } from "@/lib/utils";

export type TaskLite = Pick<Task, "id" | "title" | "status" | "priority" | "due_date" | "start_date" | "assignee_id" | "owner_id" | "waiting_on" | "waiting_on_user_id" | "project_id" | "department_id" | "tags" | "created_at" | "parent_id" | "milestone_id"> & {
  project?: { id: string; name: string } | null;
  subtask_count?: number;
  done_count?: number;
};

export type TaskFilters = { status?: string; priority?: string; assignee?: string; project?: string; q?: string };
export type ExtraView<T extends TaskLite = TaskLite> = { key: string; label: string; icon: React.ReactNode; render: (tasks: T[]) => React.ReactNode };
type Grouping = "none" | "status" | "project" | "assignee";

const OPEN_STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "in_review", "waiting", "blocked"];

/** Filterable task list with list / kanban views and grouping. Shared by /tasks, project rooms and departments. */
export function TaskListView<T extends TaskLite>({ tasks, projects, defaults, showProject = true, initialFilters, initialView = "list", syncUrl, extraViews, hideNew, emptyHint, className }: {
  tasks: T[];
  projects?: { id: string; name: string }[];
  defaults?: QuickTaskDefaults;
  showProject?: boolean;
  initialFilters?: TaskFilters;
  initialView?: string;
  syncUrl?: boolean;
  extraViews?: ExtraView<T>[];
  hideNew?: boolean;
  emptyHint?: string;
  className?: string;
}) {
  const { people } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [filters, setFilters] = React.useState<TaskFilters>(initialFilters || {});
  const [view, setView] = React.useState<string>(initialView);
  const [grouping, setGrouping] = React.useState<Grouping>("none");
  const [showFilters, setShowFilters] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const [overrides, setOverrides] = React.useState<Record<string, Partial<T>>>({});
  // Fresh server data supersedes optimistic overrides (adjust state during render, no effect needed).
  const [seenTasks, setSeenTasks] = React.useState(tasks);
  if (seenTasks !== tasks) {
    setSeenTasks(tasks);
    setOverrides({});
  }

  const projectList = React.useMemo(() => {
    if (projects) return projects;
    const m = new Map<string, string>();
    for (const t of tasks) if (t.project) m.set(t.project.id, t.project.name);
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, tasks]);

  // Keep the URL in sync so views are shareable (only when the host page asks for it).
  React.useEffect(() => {
    if (!syncUrl) return;
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    if (view !== "list") p.set("view", view);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filters, view, syncUrl, pathname, router]);

  const merged = React.useMemo(() => tasks.map((t) => (overrides[t.id] ? { ...t, ...overrides[t.id] } : t)), [tasks, overrides]);

  const filtered = React.useMemo(() => {
    const q = filters.q?.trim().toLowerCase();
    return merged.filter((t) => {
      if (filters.status === "open" ? !OPEN_STATUSES.includes(t.status) : filters.status && t.status !== filters.status) return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.assignee === "unassigned" ? !!t.assignee_id : filters.assignee && t.assignee_id !== filters.assignee) return false;
      if (filters.project && t.project_id !== filters.project) return false;
      if (q && !t.title.toLowerCase().includes(q) && !(t.tags || []).some((g) => g.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [merged, filters]);

  const groups = React.useMemo(() => {
    if (grouping === "none") return [{ key: "all", label: "", items: filtered }];
    const m = new Map<string, { label: string; items: T[]; order: number }>();
    for (const t of filtered) {
      let key = "";
      let label = "";
      let order = 0;
      if (grouping === "status") {
        key = t.status; label = STATUS_LABEL[t.status]; order = TASK_STATUSES.indexOf(t.status);
      } else if (grouping === "project") {
        key = t.project_id || "none"; label = t.project?.name || "No project"; order = t.project ? 0 : 1;
      } else {
        key = t.assignee_id || "none"; label = people.find((p) => p.id === t.assignee_id)?.full_name || "Unassigned"; order = t.assignee_id ? 0 : 1;
      }
      if (!m.has(key)) m.set(key, { label, items: [], order });
      m.get(key)!.items.push(t);
    }
    return [...m.entries()].sort((a, b) => a[1].order - b[1].order || a[1].label.localeCompare(b[1].label)).map(([key, g]) => ({ key, label: g.label, items: g.items }));
  }, [filtered, grouping, people]);

  async function move(taskId: string, status: TaskStatus) {
    const t = merged.find((x) => x.id === taskId);
    if (!t) return;
    const leavingWait = (t.status === "waiting" || t.status === "blocked") && status !== "waiting" && status !== "blocked";
    /*
      Same rule as TaskDetail.update(): RLS refuses an UPDATE by matching zero rows, not by
      raising, so `error` alone cannot tell a refusal from a success. `.select("id")` makes the
      database report what it actually changed, and the card is only moved once it has.
    */
    const supabase = createClient();
    const { data: changed, error } = await supabase
      .from("tasks")
      .update({ status, ...(leavingWait ? { waiting_on: "none", waiting_on_user_id: null, waiting_note: null } : {}) })
      .eq("id", taskId)
      .select("id");
    if (error) {
      toast.push(error.message, "danger");
      return;
    }
    if (!changed || changed.length === 0) {
      toast.push("You are not authorized to change the status of this task.", "danger");
      return;
    }
    setOverrides((o) => ({ ...o, [taskId]: { ...(o[taskId] || {}), status, ...(leavingWait ? { waiting_on: "none", waiting_on_user_id: null } : {}) } as Partial<T> }));
    toast.push(`Moved to ${STATUS_LABEL[status]}`, "success");
    router.refresh();
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const extra = extraViews?.find((v) => v.key === view);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput value={filters.q || ""} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Search tasks…" className="flex-1 min-w-[160px] max-w-sm" />
        <Button size="sm" variant={showFilters || activeFilterCount ? "primary" : "secondary"} onClick={() => setShowFilters((s) => !s)}>
          <SlidersHorizontal size={14} /> Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}
        </Button>
        <div className="inline-flex rounded-[var(--radius-sm)] border overflow-hidden">
          <button className={cn("btn btn-sm rounded-none border-0", view === "list" ? "btn-primary" : "btn-ghost")} onClick={() => setView("list")} aria-label="List view"><LayoutList size={14} /><span className="hidden sm:inline">List</span></button>
          <button className={cn("btn btn-sm rounded-none border-0", view === "board" ? "btn-primary" : "btn-ghost")} onClick={() => setView("board")} aria-label="Board view"><Columns3 size={14} /><span className="hidden sm:inline">Board</span></button>
          {extraViews?.map((v) => (
            <button key={v.key} className={cn("btn btn-sm rounded-none border-0", view === v.key ? "btn-primary" : "btn-ghost")} onClick={() => setView(v.key)} aria-label={v.label}>{v.icon}<span className="hidden sm:inline">{v.label}</span></button>
          ))}
        </div>
        {view === "list" && (
          <div className="w-[150px]">
            <Select value={grouping} onChange={(e) => setGrouping(e.target.value as Grouping)} style={{ height: 28, fontSize: "0.75rem" }} aria-label="Group by">
              <option value="none">No grouping</option>
              <option value="status">Group by status</option>
              {showProject && <option value="project">Group by project</option>}
              <option value="assignee">Group by assignee</option>
            </Select>
          </div>
        )}
        {!hideNew && (
          <Button size="sm" variant="primary" className="ml-auto" onClick={() => setNewOpen(true)}>
            <Plus size={14} /> New task
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="card p-3 grid grid-cols-2 md:grid-cols-4 gap-2 anim-fade-up">
          <Select value={filters.status || ""} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} aria-label="Status">
            <option value="">Any status</option>
            <option value="open">Open (not done)</option>
            {TASK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
          <Select value={filters.priority || ""} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} aria-label="Priority">
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </Select>
          <div className="relative">
            <PersonPicker value={filters.assignee === "unassigned" ? "" : filters.assignee} onChange={(v) => setFilters((f) => ({ ...f, assignee: v }))} placeholder="Anyone" aria-label="Assignee" />
          </div>
          {showProject ? (
            <Select value={filters.project || ""} onChange={(e) => setFilters((f) => ({ ...f, project: e.target.value }))} aria-label="Project">
              <option value="">Any project</option>
              {projectList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          ) : <div />}
          <div className="col-span-2 md:col-span-4 flex items-center gap-2 text-xs text-muted">
            <button className="link" onClick={() => setFilters((f) => ({ ...f, assignee: f.assignee === "unassigned" ? "" : "unassigned" }))}>{filters.assignee === "unassigned" ? "Showing unassigned only" : "Only unassigned"}</button>
            <span>·</span>
            <span className="num">{filtered.length} of {tasks.length}</span>
            {activeFilterCount > 0 && (
              <button className="ml-auto btn btn-xs btn-ghost" onClick={() => setFilters({})}><X size={12} /> Clear</button>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ListChecks size={18} />}
            title={tasks.length === 0 ? "No tasks yet" : "Nothing matches these filters"}
            hint={tasks.length === 0 ? emptyHint || "Create a task, or press C anywhere to capture one quickly." : "Try clearing a filter or searching for a different word."}
            action={tasks.length === 0 && !hideNew ? <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}><Plus size={14} /> New task</Button> : activeFilterCount ? <Button size="sm" onClick={() => setFilters({})}>Clear filters</Button> : undefined}
          />
        </div>
      ) : extra ? (
        extra.render(filtered)
      ) : view === "board" ? (
        <TaskBoard tasks={filtered} onMove={move} showProject={showProject} />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="card overflow-hidden">
              {g.label && (
                <div className="flex items-center gap-2 px-3 py-2 border-b sunken">
                  <span className="text-xs font-medium">{g.label}</span>
                  <span className="text-[11px] text-muted num">{g.items.length}</span>
                </div>
              )}
              <div className="p-1 divide-y divide-[var(--line)]">
                {g.items.map((t) => <TaskRow key={t.id} task={t} showProject={showProject} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New task">
        <QuickTaskForm defaults={defaults} onCreated={() => setNewOpen(false)} onCancel={() => setNewOpen(false)} />
      </Modal>
    </div>
  );
}
