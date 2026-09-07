"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Archive, FolderKanban, LayoutGrid, Plus, Table2 } from "lucide-react";
import { Button, EmptyState, Pill, Progress, SearchInput, Select } from "@/components/ui";
import { PersonPicker, DepartmentPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { ProjectCard, projectAtRisk, projectProgress, type ProjectSummary } from "@/components/projects/ProjectCard";
import { cn, PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, relDate } from "@/lib/utils";

type Initial = { view: "cards" | "table"; status?: string; department?: string; owner?: string; q?: string; archived?: boolean };

export function ProjectsList({ projects, initial }: { projects: ProjectSummary[]; initial: Initial }) {
  const { departments } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = React.useState<"cards" | "table">(initial.view);
  const [status, setStatus] = React.useState(initial.status || "");
  const [department, setDepartment] = React.useState(initial.department || "");
  const [owner, setOwner] = React.useState(initial.owner || "");
  const [q, setQ] = React.useState(initial.q || "");

  React.useEffect(() => {
    const p = new URLSearchParams();
    if (view !== "cards") p.set("view", view);
    if (status) p.set("status", status);
    if (department) p.set("department", department);
    if (owner) p.set("owner", owner);
    if (q) p.set("q", q);
    if (initial.archived) p.set("archived", "1");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [view, status, department, owner, q, initial.archived, pathname, router]);

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    return projects.filter((p) => {
      if (status === "risk" ? !projectAtRisk(p) : status && p.status !== status) return false;
      if (department && p.department_id !== department) return false;
      if (owner && p.owner_id !== owner) return false;
      if (qq && !p.name.toLowerCase().includes(qq) && !(p.client_name || "").toLowerCase().includes(qq) && !(p.tags || []).some((t) => t.toLowerCase().includes(qq))) return false;
      return true;
    });
  }, [projects, status, department, owner, q]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" className="flex-1 min-w-[160px] max-w-sm" />
        <div className="w-[140px]">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Any status</option>
            <option value="risk">At risk</option>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
          </Select>
        </div>
        <div className="w-[170px] hidden sm:block"><DepartmentPicker value={department} onChange={setDepartment} placeholder="Any department" /></div>
        <div className="w-[170px] hidden md:block"><PersonPicker value={owner} onChange={setOwner} placeholder="Any owner" /></div>
        <div className="inline-flex rounded-[var(--radius-sm)] border overflow-hidden ml-auto">
          <button className={cn("btn btn-sm rounded-none border-0", view === "cards" ? "btn-primary" : "btn-ghost")} onClick={() => setView("cards")} aria-label="Cards"><LayoutGrid size={14} /></button>
          <button className={cn("btn btn-sm rounded-none border-0", view === "table" ? "btn-primary" : "btn-ghost")} onClick={() => setView("table")} aria-label="Table"><Table2 size={14} /></button>
        </div>
        <Link href={initial.archived ? "/projects" : "/projects?archived=1"} className="btn btn-ghost btn-sm" title={initial.archived ? "Show active projects" : "Show archived projects"}><Archive size={14} /><span className="hidden sm:inline">{initial.archived ? "Active" : "Archived"}</span></Link>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FolderKanban size={18} />}
            title={projects.length === 0 ? (initial.archived ? "No archived projects" : "No projects yet") : "No projects match"}
            hint={projects.length === 0 ? "Start from a template — website, investor deck, campaign, recruitment — and the tasks, dependencies and milestones are created for you." : "Try another status, department or search term."}
            action={projects.length === 0 && !initial.archived ? <Link href="/projects/new" className="btn btn-primary btn-sm"><Plus size={14} /> New project</Link> : <Button size="sm" onClick={() => { setStatus(""); setDepartment(""); setOwner(""); setQ(""); }}>Clear filters</Button>}
          />
        </div>
      ) : view === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 stagger">
          {filtered.map((p) => <ProjectCard key={p.id} p={p} />)}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b">
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Department</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium w-[160px]">Progress</th>
                <th className="px-3 py-2 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const dept = departments.find((d) => d.id === p.department_id);
                const risk = projectAtRisk(p);
                const overdue = !!p.due_date && new Date(p.due_date) < new Date() && p.status !== "completed" && p.status !== "cancelled";
                return (
                  <tr key={p.id} className="border-b last:border-b-0 row-hover cursor-pointer" onClick={() => router.push(`/projects/${p.id}`)}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dept?.color || "var(--line-strong)" }} />
                        <Link href={`/projects/${p.id}`} className="font-medium truncate hover:underline" onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                        {risk && <AlertTriangle size={14} className="text-[var(--warn)] shrink-0" />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><Pill tone={PROJECT_STATUS_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Pill></td>
                    <td className="px-3 py-2.5 text-muted">{dept?.name || "—"}</td>
                    <td className="px-3 py-2.5"><PersonChip id={p.owner_id} size={20} /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2"><Progress value={projectProgress(p)} tone={risk ? "var(--warn)" : "var(--brand)"} className="flex-1" /><span className="text-xs num text-muted w-9 text-right">{projectProgress(p)}%</span></div>
                    </td>
                    <td className={cn("px-3 py-2.5 num text-xs", overdue ? "text-danger" : "text-muted")}>{p.due_date ? relDate(p.due_date) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
