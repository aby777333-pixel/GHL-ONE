"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Check, CheckSquare, ChevronRight, ExternalLink, GitBranch, LayoutTemplate, ListChecks, PlayCircle, Plus, SkipForward, Trash2, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Progress, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { ago, cn, fmtDate, humanize, isManagerPlus, relDate } from "@/lib/utils";
import { Note, PersonLine } from "../AdminBits";
import { hasPerm } from "../perms";
import { parseSteps, RUN_STATUS_TONE, STEP_OWNER_FIXED, STEP_STATUS_LABEL, STEP_STATUS_TONE, stepKeyFromTitle, stepsToJson, WORKFLOW_KINDS, type HrPerson, type TemplateStep, type WorkflowRun, type WorkflowStep, type WorkflowTemplate } from "./lib";

type RunProgress = { done: number; total: number };

/**
 * Workflow runs (onboarding, offboarding, transfer…) with a run detail, start dialog and the template editor.
 * `initialRun` deep-links `/admin?tab=workflows&run=<id>`.
 */
export function WorkflowsView({ runs, templates, people, perms, initialRun, showTemplates }: { runs: WorkflowRun[]; templates: WorkflowTemplate[]; people: HrPerson[]; perms: string[]; initialRun?: string | null; showTemplates: boolean }) {
  const { profile } = useSession();
  const router = useRouter();
  const canStart = isManagerPlus(profile.role) || hasPerm(perms, "hr.manage", "people.manage");
  const canEditTemplates = showTemplates && (hasPerm(perms, "hr.manage", "people.manage", "automations.manage"));
  const [status, setStatus] = React.useState<"running" | "completed" | "all">("running");
  const [kind, setKind] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(initialRun || null);
  const [starting, setStarting] = React.useState(false);
  const [editing, setEditing] = React.useState<WorkflowTemplate | "new" | null>(null);
  const [progress, setProgress] = React.useState<Record<string, RunProgress>>({});

  // Progress per run (done+skipped / total) — one query, RLS-scoped.
  React.useEffect(() => {
    let alive = true;
    const ids = runs.map((r) => r.id);
    if (!ids.length) return;
    createClient().from("workflow_steps").select("run_id,status").in("run_id", ids).then(({ data }) => {
      if (!alive || !data) return;
      const m: Record<string, RunProgress> = {};
      for (const s of data) {
        const p: RunProgress = (m[s.run_id] ||= { done: 0, total: 0 });
        p.total += 1;
        if (s.status === "done" || s.status === "skipped") p.done += 1;
      }
      setProgress(m);
    });
    return () => { alive = false; };
  }, [runs]);

  const list = runs.filter((r) => (status === "all" || r.status === status) && (!kind || r.kind === kind));
  const kinds = [...new Set(runs.map((r) => r.kind))];
  const current = open ? runs.find((r) => r.id === open) || null : null;

  function openRun(id: string | null) {
    setOpen(id);
    const url = id ? `/admin?tab=workflows&run=${id}` : "/admin?tab=workflows";
    if (typeof window !== "undefined" && window.location.pathname === "/admin") window.history.replaceState(window.history.state, "", url);
  }

  return (
    <div className="space-y-[var(--s4)]">
      <Card>
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><Workflow size={16} className="text-[var(--brand)]" /> Workflow runs</span>}
          subtitle="SOPs that execute: each step becomes a task for the right owner; finishing the task releases the next steps."
          action={canStart ? <Button variant="primary" size="sm" onClick={() => setStarting(true)}><PlayCircle size={14} /> <span className="hidden sm:inline">Start workflow</span></Button> : undefined}
        />
        <div className="px-[var(--s4)] pb-3 flex flex-wrap items-center gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="!w-auto">
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="all">All</option>
          </Select>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="!w-auto">
            <option value="">All kinds</option>
            {kinds.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}
          </Select>
          <span className="text-xs text-muted num ml-auto">{list.length}</span>
        </div>
        {list.length === 0 ? (
          <EmptyState icon={<Workflow size={18} />} title="No workflow runs" hint={status === "running" ? "Nothing is in progress. Onboarding starts automatically when an account is activated." : "Nothing here yet."} className="py-[var(--s4)]" action={canStart ? <Button size="sm" variant="primary" onClick={() => setStarting(true)}><PlayCircle size={14} /> Start workflow</Button> : undefined} />
        ) : (
          <div className="divide-y border-t">
            {list.map((r) => {
              const p = progress[r.id];
              const pct = p && p.total ? Math.round((p.done / p.total) * 100) : r.status === "completed" ? 100 : 0;
              return (
                <button key={r.id} type="button" onClick={() => openRun(r.id)} className="w-full text-left flex items-center gap-3 px-[var(--s4)] py-2.5 row-hover">
                  <span className="w-8 h-8 rounded-full sunken inline-flex items-center justify-center text-muted shrink-0"><GitBranch size={14} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate inline-flex items-center gap-1.5"><span className="capitalize">{humanize(r.kind)}</span> · {r.subject_label}{r.subject_user_id && <Blink zone={`user:${r.subject_user_id}`} />}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={pct} className="max-w-[180px]" height={4} tone={r.status === "completed" ? "var(--success)" : "var(--brand)"} />
                      <span className="text-[11px] text-muted num">{p ? `${p.done}/${p.total} steps` : `${pct}%`}</span>
                      <span className="text-[11px] text-muted">· started {ago(r.started_at)}{r.started_by ? <> by <PersonChip id={r.started_by} size={12} /></> : null}</span>
                    </div>
                  </div>
                  <Pill tone={RUN_STATUS_TONE[r.status] || "tone-neutral"}>{humanize(r.status)}</Pill>
                  <ChevronRight size={14} className="text-muted shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {showTemplates && (
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><LayoutTemplate size={16} className="text-muted" /> Templates</span>}
            subtitle="The step lists behind each workflow. Owners resolve at start time (on-duty person, head, manager…)."
            action={canEditTemplates ? <Button size="sm" onClick={() => setEditing("new")}><Plus size={14} /> New template</Button> : undefined}
          />
          <div className="divide-y border-t">
            {templates.length === 0 && <EmptyState title="No templates" className="py-[var(--s4)]" />}
            {templates.map((t) => {
              const steps = parseSteps(t.steps);
              return (
                <div key={t.id} className="flex items-center gap-3 px-[var(--s4)] py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{t.name} <span className="text-muted font-normal text-xs">· {t.key}</span></div>
                    <div className="text-[11px] text-muted truncate">{steps.length} step{steps.length === 1 ? "" : "s"} · {humanize(t.kind)}{t.description ? ` · ${t.description}` : ""}</div>
                  </div>
                  {!t.active && <Pill tone="tone-muted">Inactive</Pill>}
                  {canEditTemplates && <Button size="sm" variant="ghost" onClick={() => setEditing(t)}><ListChecks size={13} /> Edit steps</Button>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {current && <RunDetail key={current.id} run={current} people={people} perms={perms} onClose={() => openRun(null)} />}
      <StartWorkflowModal open={starting} templates={templates} people={people} onClose={() => setStarting(false)} onStarted={(id) => { setStarting(false); router.refresh(); openRun(id); }} />
      {editing && <TemplateEditor key={editing === "new" ? "new" : editing.id} template={editing === "new" ? null : editing} people={people} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------- Run detail */
function RunDetail({ run, people, perms, onClose }: { run: WorkflowRun; people: HrPerson[]; perms: string[]; onClose: () => void }) {
  const { profile, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [steps, setSteps] = React.useState<WorkflowStep[] | null>(null);
  const [skipping, setSkipping] = React.useState<WorkflowStep | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [now] = React.useState(() => Date.now());
  const canManage = isManagerPlus(profile.role) || hasPerm(perms, "hr.manage");

  const load = React.useCallback(async () => {
    const { data } = await createClient().from("workflow_steps").select("*").eq("run_id", run.id).order("position");
    setSteps(data || []);
  }, [run.id]);

  React.useEffect(() => {
    let alive = true;
    createClient().from("workflow_steps").select("*").eq("run_id", run.id).order("position").then(({ data }) => { if (alive) setSteps(data || []); });
    const ch = createClient().channel(`wf-${run.id}`).on("postgres_changes", { event: "*", schema: "public", table: "workflow_steps", filter: `run_id=eq.${run.id}` }, () => { void load(); }).subscribe();
    return () => { alive = false; createClient().removeChannel(ch); };
  }, [run.id, load]);

  async function skip() {
    if (!skipping) return;
    setBusy(skipping.id);
    const { error } = await createClient().rpc("skip_workflow_step", { p_step: skipping.id, p_reason: reason.trim() || undefined });
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`Skipped: ${skipping.title}`, "success");
    setSkipping(null);
    setReason("");
    await load();
    router.refresh();
  }

  /** Nudge = a comment on the step's task that mentions the owner; the comment trigger delivers the notification. */
  async function nudge(s: WorkflowStep) {
    if (!s.task_id) { toast.push("This step has no task yet — it is waiting on earlier steps.", "info"); return; }
    const owner = people.find((p) => p.id === s.owner_id);
    if (!owner) { toast.push("This step has no owner to nudge.", "info"); return; }
    setBusy(s.id);
    const body = `[@${owner.full_name}] Gentle reminder from ${profile.full_name}: “${s.title}” for ${run.subject_label} is ${s.due_date && new Date(s.due_date).getTime() < now ? "overdue" : `due ${relDate(s.due_date)}`}. Please complete the task to release the next steps.`;
    const { error } = await createClient().from("task_comments").insert({ task_id: s.task_id, author_id: profile.id, body });
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`${owner.full_name.split(" ")[0]} has been nudged`, "success");
  }

  const done = steps ? steps.filter((s) => s.status === "done" || s.status === "skipped").length : 0;
  const ctx = run.context && typeof run.context === "object" && !Array.isArray(run.context) ? (run.context as Record<string, unknown>) : {};
  const ctxEntries = Object.entries(ctx).filter(([, v]) => v != null && typeof v !== "object");

  return (
    <Modal open onClose={onClose} side width={620} title={<span className="inline-flex items-center gap-2 capitalize"><GitBranch size={16} className="text-[var(--brand)]" /> {humanize(run.kind)} · {run.subject_label}</span>}>
      <div className="space-y-[var(--s4)]">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Pill tone={RUN_STATUS_TONE[run.status] || "tone-neutral"}>{humanize(run.status)}</Pill>
          <span>Started {fmtDate(run.started_at, true)}</span>
          {run.started_by && <span className="inline-flex items-center gap-1">by <PersonChip id={run.started_by} size={14} /></span>}
          {run.completed_at && <span>· completed {fmtDate(run.completed_at, true)}</span>}
          {run.subject_user_id && <Link href={`/people/${run.subject_user_id}`} className="link inline-flex items-center gap-1 ml-auto">Profile <ExternalLink size={11} /></Link>}
        </div>
        {steps && steps.length > 0 && (
          <div className="flex items-center gap-2">
            <Progress value={Math.round((done / steps.length) * 100)} height={6} tone={run.status === "completed" ? "var(--success)" : "var(--brand)"} />
            <span className="text-xs text-muted num shrink-0">{done}/{steps.length}</span>
          </div>
        )}
        {ctxEntries.length > 0 && (
          <div className="flex flex-wrap gap-1.5">{ctxEntries.map(([k, v]) => <Pill key={k} tone="tone-neutral"><span className="text-muted">{humanize(k)}:</span> {String(v)}</Pill>)}</div>
        )}

        {!steps ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : steps.length === 0 ? (
          <EmptyState title="No steps" hint="The template had no steps when this run started." />
        ) : (
          <ol className="space-y-2">
            {steps.map((s, i) => {
              const dept = departments.find((d) => d.id === s.department_id);
              const overdue = s.due_date && (s.status === "ready" || s.status === "in_progress") && new Date(s.due_date).getTime() < now;
              const closed = s.status === "done" || s.status === "skipped";
              return (
                <li key={s.id} className={cn("card p-3", closed && "opacity-75")} style={overdue ? { borderColor: "var(--danger)" } : undefined}>
                  <div className="flex items-start gap-3">
                    <span className={cn("w-6 h-6 rounded-full inline-flex items-center justify-center text-[11px] font-semibold shrink-0", s.status === "done" ? "bg-[var(--success)] text-white" : s.status === "skipped" ? "sunken text-muted line-through" : s.status === "pending" ? "sunken text-muted" : "bg-[var(--brand)] text-white")}>{s.status === "done" ? <Check size={12} /> : i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{s.title}</div>
                      {s.description && <div className="text-xs text-muted mt-0.5 whitespace-pre-wrap">{s.description}</div>}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted mt-1.5">
                        <span className="inline-flex items-center gap-1">Owner <PersonLine id={s.owner_id} size={14} /></span>
                        {dept && <span>· {dept.name}</span>}
                        {s.due_date && <span className={cn("num", overdue && "text-danger font-medium")}>· due {relDate(s.due_date)}</span>}
                        {s.depends_on.length > 0 && s.status === "pending" && <span>· after {s.depends_on.map((k) => steps.find((x) => x.key === k)?.title || k).join(", ")}</span>}
                        {s.completed_at && <span>· {fmtDate(s.completed_at, true)}</span>}
                      </div>
                    </div>
                    <Pill tone={STEP_STATUS_TONE[s.status] || "tone-neutral"} className="shrink-0">{STEP_STATUS_LABEL[s.status] || humanize(s.status)}</Pill>
                  </div>
                  {!closed && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-9">
                      {s.task_id && <Link href={`/tasks/${s.task_id}`} className="btn btn-secondary btn-xs"><CheckSquare size={12} /> Open task</Link>}
                      {s.task_id && s.owner_id && s.owner_id !== profile.id && <Button size="xs" variant="ghost" loading={busy === s.id} onClick={() => nudge(s)}><BellRing size={12} /> Nudge owner</Button>}
                      {(canManage || s.owner_id === profile.id) && <Button size="xs" variant="ghost" onClick={() => { setSkipping(s); setReason(""); }}><SkipForward size={12} /> Skip</Button>}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <Modal open={!!skipping} onClose={() => setSkipping(null)} title={skipping ? `Skip “${skipping.title}”` : "Skip step"} width={440}>
          <div className="space-y-3">
            <p className="text-sm text-muted">The linked task is cancelled and any steps waiting on this one are released. The reason is kept with the run.</p>
            <Field label="Reason"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this step not needed?" autoFocus /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSkipping(null)}>Cancel</Button>
              <Button variant="primary" loading={!!busy} onClick={skip}><SkipForward size={14} /> Skip step</Button>
            </div>
          </div>
        </Modal>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------ Start workflow */
export function StartWorkflowModal({ open, templates, people, defaultKey, defaultSubject, onClose, onStarted }: { open: boolean; templates: WorkflowTemplate[]; people: HrPerson[]; defaultKey?: string; defaultSubject?: string; onClose: () => void; onStarted?: (runId: string) => void }) {
  const router = useRouter();
  const toast = useToast();
  const active = templates.filter((t) => t.active);
  const [key, setKey] = React.useState(defaultKey && active.some((t) => t.key === defaultKey) ? defaultKey : active[0]?.key || "");
  const [subject, setSubject] = React.useState(defaultSubject || "");
  const [label, setLabel] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const tpl = active.find((t) => t.key === key);
  const steps = tpl ? parseSteps(tpl.steps) : [];
  const subjectPerson = people.find((p) => p.id === subject);

  async function start() {
    if (!key || !subject) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("start_workflow", { p_template_key: key, p_subject: subject, p_context: notes.trim() ? { notes: notes.trim(), manual: true } : { manual: true }, p_label: label.trim() || undefined });
    setBusy(false);
    if (error || !data) { toast.push(error?.message || "Could not start the workflow", "danger"); return; }
    toast.push(`${tpl?.name || "Workflow"} started${subjectPerson ? ` for ${subjectPerson.full_name}` : ""}`, "success");
    if (onStarted) onStarted(data); else { onClose(); router.refresh(); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Start a workflow" width={560} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!key || !subject} onClick={start}><PlayCircle size={15} /> Start</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Workflow">
            <Select value={key} onChange={(e) => setKey(e.target.value)}>
              {active.length === 0 && <option value="">No active templates</option>}
              {active.map((t) => <option key={t.id} value={t.key}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Person">
            <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">Choose a person…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.designation ? ` — ${p.designation}` : ""}{p.is_active ? "" : " (inactive)"}</option>)}
            </Select>
          </Field>
          <Field label="Label" hint="Defaults to the person's name." className="sm:col-span-2"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={subjectPerson?.full_name || "Optional"} /></Field>
          <Field label="Context notes" className="sm:col-span-2"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the step owners should know." /></Field>
        </div>
        {tpl && (
          <div className="sunken rounded-[var(--radius-sm)] p-3">
            <div className="eyebrow mb-1.5">{steps.length} step{steps.length === 1 ? "" : "s"}</div>
            <ol className="text-xs space-y-1">
              {steps.map((s, i) => (
                <li key={s.key} className="flex items-start gap-2"><span className="num text-muted w-4 shrink-0">{i + 1}.</span><span className="min-w-0"><span className="font-medium">{s.title}</span> <span className="text-muted">· {ownerLabel(s.owner, people)} · {s.due_days}d{s.depends_on.length ? ` · after ${s.depends_on.join(", ")}` : ""}</span></span></li>
              ))}
            </ol>
          </div>
        )}
        <Note tone="info">Steps without dependencies become tasks right away, assigned to the resolved owner. Everyone involved is notified by the task itself.</Note>
      </div>
    </Modal>
  );
}

function ownerLabel(owner: string, people: HrPerson[]) {
  const fixed = STEP_OWNER_FIXED.find((o) => o.key === owner);
  if (fixed) return fixed.label;
  if (owner.startsWith("user:")) return people.find((p) => p.id === owner.slice(5))?.full_name || "Specific person";
  if (owner.startsWith("department:")) return `Department: ${owner.slice(11)}`;
  return owner;
}

/* ------------------------------------------------------ Template editor */
function TemplateEditor({ template, people, onClose }: { template: WorkflowTemplate | null; people: HrPerson[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments } = useSession();
  const [name, setName] = React.useState(template?.name || "");
  const [key, setKey] = React.useState(template?.key || "");
  const [kind, setKind] = React.useState(template?.kind || "custom");
  const [description, setDescription] = React.useState(template?.description || "");
  const [active, setActive] = React.useState(template?.active ?? true);
  const [steps, setSteps] = React.useState<TemplateStep[]>(() => (template ? parseSteps(template.steps) : []));
  const [busy, setBusy] = React.useState(false);

  const update = (i: number, patch: Partial<TemplateStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const remove = (i: number) => setSteps((s) => { const removed = s[i]; return s.filter((_, j) => j !== i).map((x) => ({ ...x, depends_on: x.depends_on.filter((k) => k !== removed.key) })); });
  const move = (i: number, dir: -1 | 1) => setSteps((s) => { const j = i + dir; if (j < 0 || j >= s.length) return s; const n = [...s]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const add = () => setSteps((s) => [...s, { key: stepKeyFromTitle(`step ${s.length + 1}`, s.map((x) => x.key)), title: "", description: "", owner: "hr", depends_on: [], due_days: 3 }]);

  async function save() {
    if (!name.trim() || !key.trim()) { toast.push("Name and key are required", "danger"); return; }
    if (steps.some((s) => !s.title.trim())) { toast.push("Every step needs a title", "danger"); return; }
    if (!profile.org_id) return;
    setBusy(true);
    const supabase = createClient();
    const payload = { name: name.trim(), key: key.trim(), kind, description: description.trim() || null, active, steps: stepsToJson(steps) };
    const { error } = template
      ? await supabase.from("workflow_templates").update(payload).eq("id", template.id)
      : await supabase.from("workflow_templates").insert({ ...payload, org_id: profile.org_id, created_by: profile.id });
    setBusy(false);
    if (error) { toast.push(error.message.includes("duplicate") ? "A template with this key already exists" : error.message, "danger"); return; }
    toast.push(template ? "Template saved" : "Template created", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} side width={680} title={template ? `Edit template · ${template.name}` : "New workflow template"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}><Check size={15} /> Save template</Button></>}>
      <div className="space-y-[var(--s4)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name"><Input value={name} onChange={(e) => { setName(e.target.value); if (!template && !key) setKey(stepKeyFromTitle(e.target.value, [])); }} placeholder="e.g. Contractor onboarding" /></Field>
          <Field label="Key" hint="Used by start_workflow(); keep it stable."><Input value={key} onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_"))} disabled={!!template} /></Field>
          <Field label="Kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>{WORKFLOW_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</Select>
          </Field>
          <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[var(--brand)]" /> Active</label>
          <Field label="Description" className="sm:col-span-2"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When is this used?" /></Field>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="eyebrow">Steps · {steps.length}</div>
            <Button size="sm" onClick={add}><Plus size={13} /> Add step</Button>
          </div>
          {steps.length === 0 && <div className="text-xs text-muted border border-dashed rounded-[var(--radius-sm)] p-4 text-center">No steps yet. Add the first one.</div>}
          <ol className="space-y-2">
            {steps.map((s, i) => {
              const earlier = steps.slice(0, i).filter((x) => x.key);
              return (
                <li key={i} className="card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="num text-xs text-muted w-5">{i + 1}.</span>
                    <Input value={s.title} onChange={(e) => { const title = e.target.value; update(i, { title, ...(template ? {} : { key: stepKeyFromTitle(title, steps.filter((_, j) => j !== i).map((x) => x.key)) }) }); }} placeholder="Step title" className="flex-1" />
                    <Button size="xs" variant="ghost" icon onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</Button>
                    <Button size="xs" variant="ghost" icon onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Move down">↓</Button>
                    <Button size="xs" variant="ghost" icon className="text-danger" onClick={() => remove(i)} aria-label="Remove step"><Trash2 size={13} /></Button>
                  </div>
                  <Textarea rows={2} value={s.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="What exactly should the owner do?" />
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_110px] gap-2">
                    <Field label="Owner">
                      <Select value={s.owner} onChange={(e) => update(i, { owner: e.target.value })}>
                        <optgroup label="Roles">{STEP_OWNER_FIXED.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</optgroup>
                        <optgroup label="Departments">{departments.map((d) => <option key={d.id} value={`department:${d.slug}`}>{d.name}</option>)}</optgroup>
                        <optgroup label="Specific person">{people.filter((p) => p.is_active).map((p) => <option key={p.id} value={`user:${p.id}`}>{p.full_name}</option>)}</optgroup>
                      </Select>
                    </Field>
                    <Field label="Due (days)"><Input type="number" min={0} value={s.due_days} onChange={(e) => update(i, { due_days: Math.max(0, Number(e.target.value) || 0) })} /></Field>
                    <Field label="Key"><Input value={s.key} onChange={(e) => update(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_") })} className="!text-xs" /></Field>
                  </div>
                  {earlier.length > 0 && (
                    <div>
                      <span className="label">Starts after</span>
                      <div className="flex flex-wrap gap-1.5">
                        {earlier.map((e) => {
                          const on = s.depends_on.includes(e.key);
                          return (
                            <button key={e.key} type="button" onClick={() => update(i, { depends_on: on ? s.depends_on.filter((k) => k !== e.key) : [...s.depends_on, e.key] })} className={cn("pill cursor-pointer", on ? "tone-brand" : "tone-neutral hover:bg-[var(--line)]")}>{on && <Check size={10} />} {e.title || e.key}</button>
                          );
                        })}
                      </div>
                      {s.depends_on.length === 0 && <span className="block text-[11px] text-muted mt-1">No dependencies — becomes a task the moment the workflow starts.</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <Note tone="neutral">Owner keys resolve when a run starts: “HR”, “IT” and “Admin” go to the department’s on-duty person or head; “manager” and “department head” follow the person’s record. If nothing resolves, the primary admin gets the step.</Note>
      </div>
    </Modal>
  );
}
