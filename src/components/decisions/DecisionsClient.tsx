"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gavel, Plus, FolderKanban, Video, MessageSquare, Filter } from "lucide-react";
import { Button, Card, EmptyState, Modal, PageHeader, Pill, SearchInput, Select } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { CLASSIFICATION_LABEL, cn, fmtDate, type Decision } from "@/lib/utils";
import { RecordDecisionForm } from "./RecordDecisionForm";

export function DecisionsClient({ decisions, projects, openNew, defaultProject }: { decisions: Decision[]; projects: { id: string; name: string }[]; openNew: boolean; defaultProject?: string | null }) {
  const { departments } = useSession();
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [project, setProject] = React.useState(defaultProject || "");
  const [dept, setDept] = React.useState("");
  const [by, setBy] = React.useState("");
  const [showNew, setShowNew] = React.useState(openNew);
  const [showFilters, setShowFilters] = React.useState(!!defaultProject);

  const projectName = React.useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const deptName = React.useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const list = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return decisions.filter((d) => {
      if (project && d.project_id !== project) return false;
      if (dept && d.department_id !== dept) return false;
      if (by && d.decided_by !== by) return false;
      if (needle && !(d.title.toLowerCase().includes(needle) || d.decision.toLowerCase().includes(needle) || (d.reason || "").toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [decisions, q, project, dept, by]);

  const filtersActive = !!(project || dept || by);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Decision Register"
        title="Decisions"
        subtitle="What was decided, by whom, and why — searchable for as long as the company exists."
        actions={<Button variant="primary" onClick={() => setShowNew(true)}><Plus size={15} /> Record decision</Button>}
      />

      <div className="flex items-center gap-2 mb-[var(--s3)]">
        <SearchInput className="flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search decisions, reasons…" />
        <Button variant={filtersActive ? "primary" : "secondary"} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}><Filter size={14} /> <span className="hidden sm:inline">Filters</span></Button>
      </div>
      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-[var(--s3)] anim-fade-in">
          <Select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
          <PersonPicker value={by} onChange={setBy} placeholder="Decided by anyone" />
        </div>
      )}

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Gavel size={18} />}
            title={decisions.length === 0 ? "No decisions recorded yet" : "No decisions match"}
            hint={decisions.length === 0 ? "Every meaningful decision deserves a record: what, why and who. Record the first one." : "Try a different search or clear the filters."}
            action={decisions.length === 0 ? <Button variant="primary" onClick={() => setShowNew(true)}><Plus size={15} /> Record decision</Button> : filtersActive ? <Button variant="secondary" onClick={() => { setProject(""); setDept(""); setBy(""); }}>Clear filters</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s3)] stagger">
          {list.map((d) => (
            <Card key={d.id} hover className="px-[var(--s4)] py-[var(--s3)] flex flex-col">
              <div className="flex items-center gap-1.5 flex-wrap">
                {d.classification !== "internal" && <Pill tone={d.classification === "public" ? "tone-success" : "tone-danger"}>{CLASSIFICATION_LABEL[d.classification]}</Pill>}
                {d.meeting_id && <Link href={`/meetings/${d.meeting_id}`} className="pill tone-info hover:underline"><Video size={10} /> From meeting</Link>}
                {d.message_id && d.channel_id && <Link href={`/chat/${d.channel_id}?m=${d.message_id}`} className="pill tone-violet hover:underline"><MessageSquare size={10} /> From chat</Link>}
                {d.department_id && <span className="text-[11px] text-muted ml-auto truncate max-w-[140px]">{deptName.get(d.department_id)}</span>}
              </div>
              <Link href={`/decisions/${d.id}`} className="block font-medium mt-2 leading-snug hover:underline">{d.title}</Link>
              <p className="text-sm text-[var(--fg-2)] mt-1.5 truncate-2">{d.decision}</p>
              <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-3 pt-3 border-t text-xs text-muted">
                <PersonChip id={d.decided_by} size={18} />
                <span className="num">{fmtDate(d.decided_at)}</span>
                {d.project_id && projectName.get(d.project_id) && (
                  <Link href={`/projects/${d.project_id}`} className={cn("inline-flex items-center gap-1 hover:underline truncate max-w-[180px] ml-auto")}><FolderKanban size={12} /> {projectName.get(d.project_id)}</Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showNew} onClose={() => { setShowNew(false); if (openNew) router.replace("/decisions"); }} title="Record a decision" width={640}>
        <RecordDecisionForm defaults={{ project_id: defaultProject }} onDone={(id) => { setShowNew(false); router.push(`/decisions/${id}`); }} onCancel={() => setShowNew(false)} />
      </Modal>
    </div>
  );
}
