"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, CalendarClock, Check, GripVertical, Link2, Plus, ShieldCheck, Sparkles, Trash2, Wand2, X } from "lucide-react";
import type { Json } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Field, Input, Pill, Select, Textarea, useToast } from "@/components/ui";
import { PersonPicker, DepartmentPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip, StatusPill, DueLabel } from "@/components/tasks/TaskBits";
import { parseDelegation, type DelegationProposal, type DelegationStep } from "@/components/projects/parseDelegation";
import { ago, cn, fmtDate, relDate, type Task } from "@/lib/utils";

export type RecentDelegation = Pick<Task, "id" | "title" | "status" | "priority" | "due_date" | "assignee_id" | "approver_id" | "department_id" | "project_id" | "created_at"> & { project: { id: string; name: string } | null };

const EXAMPLES = [
  "Create the investor presentation for Project X and coordinate with content and design. I need the final version Friday.",
  "Assign the Mauritius investor presentation to Design. Ask Content to proofread it first. Final version Thursday evening. I approve before release.",
  "Ask Sales to send the revised proposal to the client tomorrow morning, then have Finance raise the invoice by EOD Wednesday.",
];

function toLocalInput(d: Date | null) {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DelegateComposer({ projects, recent }: { projects: { id: string; name: string }[]; recent: RecentDelegation[] }) {
  const { profile, people, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [proposal, setProposal] = React.useState<DelegationProposal | null>(null);
  const [projectId, setProjectId] = React.useState("");
  const [approver, setApprover] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [steps, setSteps] = React.useState<DelegationStep[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string[] | null>(null);

  function analyse() {
    if (!text.trim()) return;
    const p = parseDelegation(text, {
      people: people.map((x) => ({ id: x.id, full_name: x.full_name, department_id: x.department_id })),
      departments: departments.map((d) => ({ id: d.id, name: d.name, slug: d.slug, head_id: d.head_id })),
      projects,
    });
    setProposal(p);
    setProjectId(p.project_id || "");
    setApprover(p.approver_needed ? profile.id : "");
    setSummary(p.summary);
    setSteps(p.steps);
    setResult(null);
  }

  const setStep = (i: number, patch: Partial<DelegationStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeStep = (i: number) => setSteps((s) => s.filter((_, j) => j !== i).map((x, j, arr) => ({ ...x, final: j === arr.length - 1 })));
  const addStep = () => setSteps((s) => [...s.map((x) => ({ ...x, final: false })), { title: "", department_id: null, assignee_id: null, due_date: null, depends_on_previous: true, final: true, source: "" }]);
  const moveStep = (i: number, dir: -1 | 1) => setSteps((s) => {
    const j = i + dir;
    if (j < 0 || j >= s.length) return s;
    const n = [...s];
    [n[i], n[j]] = [n[j]!, n[i]!];
    return n.map((x, k) => ({ ...x, final: k === n.length - 1 }));
  });

  async function confirm() {
    const valid = steps.filter((s) => s.title.trim());
    if (!valid.length) return toast.push("Add at least one step", "danger");
    setBusy(true);
    const payload = valid.map((s, i) => ({
      title: s.title.trim(),
      description: summary || null,
      department_id: s.department_id || null,
      assignee_id: s.assignee_id || null,
      due_date: s.due_date ? s.due_date.toISOString() : null,
      depends_on_previous: i > 0 && s.depends_on_previous,
      final: i === valid.length - 1,
      priority: "normal",
    }));
    const { data, error } = await createClient().rpc("create_delegation", {
      p_project: (projectId || null) as unknown as string,
      p_summary: summary || text.trim(),
      p_approver: (approver || null) as unknown as string,
      steps: payload as unknown as Json,
    });
    setBusy(false);
    if (error || !data) return toast.push(error?.message || "Could not create workflow", "danger");
    toast.push(`Workflow created · ${data.length} task${data.length > 1 ? "s" : ""}`, "success");
    setResult(data);
    router.refresh();
  }

  const finalStep = steps[steps.length - 1];
  const contributors = steps.slice(0, -1).map((s) => s.assignee_id).filter(Boolean) as string[];

  return (
    <div className="space-y-[var(--s4)]">
      {/* Composer */}
      <Card className="p-[var(--s4)]">
        <div className="flex items-center gap-2 mb-2"><Wand2 size={16} className="text-[var(--brand-2)]" /><span className="h3">Describe what you need</span></div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) analyse(); }} placeholder="e.g. Ask Content to draft the Q4 newsletter, then Design to lay it out. I need it by Friday evening. I approve before it goes out." style={{ minHeight: 110, fontSize: "0.95rem" }} />
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-xs text-muted">Try:</span>
          {EXAMPLES.map((ex, i) => (
            <button key={i} className="text-xs px-2 py-1 rounded-full tone-neutral hover:bg-[var(--line)] text-left max-w-full truncate" style={{ maxWidth: 320 }} onClick={() => setText(ex)} title={ex}>{ex.length > 60 ? ex.slice(0, 58) + "…" : ex}</button>
          ))}
          <Button variant="primary" className="ml-auto" onClick={analyse} disabled={!text.trim()}><Sparkles size={15} /> Build workflow</Button>
        </div>
        <div className="text-[11px] text-muted mt-2">Understands people by name, departments (content, design, tech, sales, finance…), projects, deadlines (Friday evening, tomorrow, in 3 days, 12 Sep), ordering (first, then, after) and “I approve”.</div>
      </Card>

      {/* Result chain */}
      {result && (
        <Card className="p-[var(--s4)] border-[var(--success)] anim-pop">
          <div className="flex items-center gap-2 mb-2 text-[var(--success)]"><Check size={16} /><span className="h3 text-[var(--fg)]">Workflow created</span></div>
          <Chain delegatedBy={profile.id} responsible={finalStep?.assignee_id || null} contributors={contributors} approver={approver || null} deadline={finalStep?.due_date || null} />
          <div className="flex flex-wrap gap-2 mt-3">
            <Link href={`/tasks/${result[0]}`} className="btn btn-primary btn-sm">Open first task <ArrowRight size={14} /></Link>
            {projectId && <Link href={`/projects/${projectId}?tab=tasks`} className="btn btn-secondary btn-sm">Open project</Link>}
            <Button size="sm" variant="ghost" onClick={() => { setText(""); setProposal(null); setSteps([]); setResult(null); }}>Delegate something else</Button>
          </div>
        </Card>
      )}

      {/* Proposal */}
      {proposal && !result && (
        <div className="space-y-3 anim-fade-up">
          <Card className="p-[var(--s4)] space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="h3">Proposed workflow</span>
              <span className="text-xs text-muted">{steps.length} step{steps.length !== 1 ? "s" : ""}{proposal.deadline ? ` · deadline ${relDate(proposal.deadline)} ${fmtDate(proposal.deadline, true)}` : " · no deadline detected"}</span>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Project" hint={proposal.project_name && !proposal.project_id ? `Mentioned “${proposal.project_name}” — not found, pick one or leave empty` : undefined}>
                <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
              </Field>
              <Field label="Approver (final step)" hint={proposal.approver_needed ? "You asked to approve before release" : "Optional"}>
                <PersonPicker value={approver} onChange={setApprover} placeholder="No approval" />
              </Field>
              <Field label="Summary"><Input value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
            </div>
            <Chain delegatedBy={profile.id} responsible={finalStep?.assignee_id || null} contributors={contributors} approver={approver || null} deadline={finalStep?.due_date || null} />
          </Card>

          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="card p-3 sm:p-[var(--s3)] relative">
                {i > 0 && s.depends_on_previous && <div className="absolute -top-2 left-6 text-muted bg-[var(--bg)] rounded-full"><ArrowDown size={14} /></div>}
                <div className="flex items-start gap-2">
                  <div className="flex flex-col items-center gap-0.5 pt-1 text-muted">
                    <span className="w-6 h-6 rounded-full tone-brand text-[11px] font-semibold flex items-center justify-center">{i + 1}</span>
                    <button onClick={() => moveStep(i, -1)} className="hover:text-[var(--fg)] disabled:opacity-30" disabled={i === 0} aria-label="Move up"><GripVertical size={12} /></button>
                  </div>
                  <div className="flex-1 min-w-0 grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_170px_190px]">
                    <div className="space-y-1">
                      <Input value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} placeholder="Step title" className="font-medium" />
                      {s.source && <div className="text-[11px] text-muted truncate">“{s.source}”</div>}
                    </div>
                    <DepartmentPicker value={s.department_id} onChange={(v) => { const d = departments.find((x) => x.id === v); setStep(i, { department_id: v || null, assignee_id: s.assignee_id || d?.head_id || null }); }} placeholder="Department" />
                    <PersonPicker value={s.assignee_id} onChange={(v) => setStep(i, { assignee_id: v || null })} placeholder="Assignee" />
                    <Input type="datetime-local" value={toLocalInput(s.due_date)} onChange={(e) => setStep(i, { due_date: e.target.value ? new Date(e.target.value) : null })} />
                  </div>
                  <button onClick={() => removeStep(i)} className="text-muted hover:text-[var(--danger)] pt-2" aria-label="Remove step"><Trash2 size={14} /></button>
                </div>
                <div className="flex items-center gap-3 mt-2 pl-8 flex-wrap text-xs">
                  {i > 0 && (
                    <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={s.depends_on_previous} onChange={(e) => setStep(i, { depends_on_previous: e.target.checked })} className="accent-[var(--brand)]" /> Waits for step {i}</label>
                  )}
                  {i === steps.length - 1 && <Pill tone="tone-violet"><ShieldCheck size={10} /> Final step{approver ? " · needs approval" : ""}</Pill>}
                  {s.due_date && <span className="inline-flex items-center gap-1 text-muted num"><CalendarClock size={12} /> {relDate(s.due_date)} {fmtDate(s.due_date, true)}</span>}
                </div>
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={addStep}><Plus size={14} /> Add step</Button>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setProposal(null)}><X size={14} /> Discard</Button>
            <Button variant="primary" size="lg" onClick={confirm} loading={busy}><Check size={16} /> Confirm & create workflow</Button>
          </div>
        </div>
      )}

      {/* Recent delegations */}
      <section>
        <div className="flex items-center gap-2 mb-2"><Link2 size={14} className="text-muted" /><span className="h3">Recent delegations</span></div>
        {recent.length === 0 ? (
          <Card><EmptyState icon={<Wand2 size={18} />} title="Nothing delegated yet" hint="Workflows you create here show up below, grouped by request, so you can follow each chain to completion." /></Card>
        ) : (
          <div className="space-y-3">
            {groupByMinute(recent).map((g) => (
              <Card key={g.key} className="overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b sunken text-xs">
                  <span className="font-medium">{g.items[0]!.project?.name || "No project"}</span>
                  <span className="text-muted">· {g.items.length} step{g.items.length > 1 ? "s" : ""} · {ago(g.items[0]!.created_at)}</span>
                  <span className="ml-auto pill tone-neutral num">{g.items.filter((t) => t.status === "done").length}/{g.items.length} done</span>
                </div>
                <ol className="divide-y">
                  {[...g.items].reverse().map((t, i) => (
                    <li key={t.id}>
                      <Link href={`/tasks/${t.id}`} className="flex items-center gap-3 px-3 py-2 row-hover">
                        <span className="w-5 h-5 rounded-full sunken text-[10px] font-semibold flex items-center justify-center num shrink-0">{i + 1}</span>
                        <span className={cn("text-sm truncate flex-1", t.status === "done" && "line-through text-muted")}>{t.title}</span>
                        <StatusPill status={t.status} />
                        <DueLabel due={t.due_date} status={t.status} className="hidden sm:inline-flex" />
                        <PersonChip id={t.assignee_id} showName={false} size={22} />
                      </Link>
                    </li>
                  ))}
                </ol>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function groupByMinute(items: RecentDelegation[]) {
  const m = new Map<string, RecentDelegation[]>();
  for (const t of items) {
    const key = `${t.project_id || "none"}:${t.created_at.slice(0, 16)}`;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(t);
  }
  return [...m.entries()].map(([key, items]) => ({ key, items }));
}

function Item({ label, children, highlight }: { label: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-0.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] min-w-0", highlight && "bg-[var(--info-bg)]")}>
      <span className="eyebrow">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

function Chain({ delegatedBy, responsible, contributors, approver, deadline }: { delegatedBy: string; responsible: string | null; contributors: string[]; approver: string | null; deadline: Date | null }) {
  const uniq = [...new Set(contributors)];
  return (
    <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
      <div className="flex items-center gap-1.5 min-w-max text-xs">
        <Item label="Delegated by"><PersonChip id={delegatedBy} /></Item>
        <ArrowRight size={14} className="text-muted shrink-0" />
        <Item label="Responsible" highlight>{responsible ? <PersonChip id={responsible} /> : <span className="text-muted">Pick in last step</span>}</Item>
        <ArrowRight size={14} className="text-muted shrink-0" />
        <Item label="Contributors">{uniq.length ? <span className="flex items-center gap-1.5">{uniq.map((id) => <PersonChip key={id} id={id} showName={uniq.length < 3} />)}</span> : <span className="text-muted">None</span>}</Item>
        <ArrowRight size={14} className="text-muted shrink-0" />
        <Item label="Approver">{approver ? <PersonChip id={approver} /> : <span className="text-muted">Not required</span>}</Item>
        <ArrowRight size={14} className="text-muted shrink-0" />
        <Item label="Deadline">{deadline ? <span className="num font-medium">{relDate(deadline)} · {fmtDate(deadline, true)}</span> : <span className="text-muted">None</span>}</Item>
      </div>
    </div>
  );
}
