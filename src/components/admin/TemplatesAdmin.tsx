"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X, ArrowUp, ArrowDown, FolderKanban, ListChecks, Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Textarea, useToast } from "@/components/ui";
import { PriorityPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, PRIORITY_LABEL, PRIORITY_TONE, slugify, type TaskPriority, type Tables } from "@/lib/utils";
import type { Json } from "@/lib/database.types";

type PT = Tables<"project_templates">;
type TT = Tables<"task_templates">;
type TplTask = { title: string; description?: string; priority: TaskPriority; due_offset_days: number | null; depends_on_previous: boolean; estimated_hours?: number | null };
type TplMilestone = { title: string; offset_pct: number | null };
const PRIORITIES: TaskPriority[] = ["critical", "urgent", "high", "normal", "low"];

function asArray(j: Json): Record<string, Json | undefined>[] {
  return Array.isArray(j) ? (j.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<string, Json | undefined>[]) : [];
}
function readTasks(j: Json): TplTask[] {
  return asArray(j).map((t) => ({
    title: String(t.title ?? ""), description: t.description ? String(t.description) : undefined,
    priority: (PRIORITIES.includes(t.priority as TaskPriority) ? t.priority : "normal") as TaskPriority,
    due_offset_days: typeof t.due_offset_days === "number" ? t.due_offset_days : t.due_offset_days != null ? Number(t.due_offset_days) : null,
    depends_on_previous: !!t.depends_on_previous, estimated_hours: typeof t.estimated_hours === "number" ? t.estimated_hours : null,
  }));
}
function readMilestones(j: Json): TplMilestone[] {
  return asArray(j).map((m) => ({ title: String(m.title ?? ""), offset_pct: typeof m.offset_pct === "number" ? m.offset_pct : m.offset_pct != null ? Number(m.offset_pct) : null }));
}
function readStrings(j: Json): string[] {
  return Array.isArray(j) ? j.map((x) => (typeof x === "string" ? x : x && typeof x === "object" && !Array.isArray(x) && "title" in x ? String(x.title) : "")).filter(Boolean) : [];
}

export function TemplatesAdmin({ projectTemplates, taskTemplates }: { projectTemplates: PT[]; taskTemplates: TT[] }) {
  const router = useRouter();
  const toast = useToast();
  const { departments } = useSession();
  const [editPT, setEditPT] = React.useState<PT | "new" | null>(null);
  const [editTT, setEditTT] = React.useState<TT | "new" | null>(null);

  async function removePT(t: PT) {
    const { error } = await createClient().from("project_templates").delete().eq("id", t.id);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Template deleted", "success"); router.refresh();
  }
  async function removeTT(t: TT) {
    const { error } = await createClient().from("task_templates").delete().eq("id", t.id);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Template deleted", "success"); router.refresh();
  }
  const deptName = (slug: string | null) => departments.find((d) => d.slug === slug)?.name || slug || "Any department";

  return (
    <div className="space-y-[var(--s4)]">
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><FolderKanban size={16} /> Project templates</span>} subtitle="Task chains and milestones instantiated by “New project from template”." action={<Button size="sm" variant="primary" onClick={() => setEditPT("new")}><Plus size={14} /> New</Button>} />
        {projectTemplates.length === 0 ? (
          <EmptyState title="No project templates" className="py-[var(--s4)]" />
        ) : (
          <div className="divide-y border-t">
            {projectTemplates.map((t) => {
              const tasks = readTasks(t.tasks);
              const ms = readMilestones(t.milestones);
              return (
                <div key={t.id} className="flex items-center gap-3 px-[var(--s4)] py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{t.name} <span className="text-[11px] text-muted font-mono font-normal">{t.key}</span></div>
                    <div className="text-[11px] text-muted truncate">{deptName(t.department_slug)} · {tasks.length} tasks · {ms.length} milestones{t.description ? ` · ${t.description}` : ""}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditPT(t)}><Pencil size={13} /> Edit</Button>
                  <Button size="sm" variant="ghost" icon className="text-danger" onClick={() => removePT(t)} aria-label="Delete"><Trash2 size={13} /></Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><ListChecks size={16} /> Task templates</span>} subtitle="Checklists and defaults for recurring kinds of work." action={<Button size="sm" variant="primary" onClick={() => setEditTT("new")}><Plus size={14} /> New</Button>} />
        {taskTemplates.length === 0 ? (
          <EmptyState title="No task templates" className="py-[var(--s4)]" />
        ) : (
          <div className="divide-y border-t">
            {taskTemplates.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-[var(--s4)] py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{t.name}</div>
                  <div className="text-[11px] text-muted truncate">{deptName(t.department_slug)} · {readStrings(t.checklist).length} checklist items{t.estimated_hours ? ` · ${t.estimated_hours}h` : ""}{t.description ? ` · ${t.description}` : ""}</div>
                </div>
                <Pill tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Pill>
                <Button size="sm" variant="ghost" onClick={() => setEditTT(t)}><Pencil size={13} /> Edit</Button>
                <Button size="sm" variant="ghost" icon className="text-danger" onClick={() => removeTT(t)} aria-label="Delete"><Trash2 size={13} /></Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ProjectTemplateModal tpl={editPT} onClose={() => setEditPT(null)} />
      <TaskTemplateModal tpl={editTT} onClose={() => setEditTT(null)} />
    </div>
  );
}

function DeptSlugSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { departments } = useSession();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Any department</option>
      {departments.map((d) => <option key={d.id} value={d.slug}>{d.name}</option>)}
    </Select>
  );
}

function ProjectTemplateModal({ tpl, onClose }: { tpl: PT | "new" | null; onClose: () => void }) {
  if (!tpl) return null;
  return <ProjectTemplateForm key={tpl === "new" ? "new" : tpl.id} tpl={tpl} onClose={onClose} />;
}

function ProjectTemplateForm({ tpl, onClose }: { tpl: PT | "new"; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const t = tpl !== "new" ? tpl : null;
  const [name, setName] = React.useState(t?.name || "");
  const [keyInput, setKeyInput] = React.useState(t?.key || "");
  const [keyTouched, setKeyTouched] = React.useState(!!t);
  const key = keyTouched ? keyInput : slugify(name).replace(/-/g, "_");
  const [description, setDescription] = React.useState(t?.description || "");
  const [dept, setDept] = React.useState(t?.department_slug || "");
  const [tasks, setTasks] = React.useState<TplTask[]>(() => (t ? readTasks(t.tasks) : [{ title: "", priority: "normal", due_offset_days: 3, depends_on_previous: false }]));
  const [ms, setMs] = React.useState<TplMilestone[]>(() => (t ? readMilestones(t.milestones) : []));
  const [busy, setBusy] = React.useState(false);

  const move = (i: number, dir: -1 | 1) => setTasks((s) => { const n = [...s]; const j = i + dir; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const cleanTasks = tasks.filter((x) => x.title.trim()).map((x) => ({ title: x.title.trim(), ...(x.description ? { description: x.description } : {}), priority: x.priority, ...(x.due_offset_days != null ? { due_offset_days: x.due_offset_days } : {}), ...(x.depends_on_previous ? { depends_on_previous: true } : {}), ...(x.estimated_hours ? { estimated_hours: x.estimated_hours } : {}) }));
    const cleanMs = ms.filter((x) => x.title.trim()).map((x) => ({ title: x.title.trim(), ...(x.offset_pct != null ? { offset_pct: x.offset_pct } : {}) }));
    const payload = { name: name.trim(), key: key.trim() || slugify(name).replace(/-/g, "_"), description: description.trim() || null, department_slug: dept || null, tasks: cleanTasks as Json, milestones: cleanMs as Json };
    const supabase = createClient();
    const { error } = t ? await supabase.from("project_templates").update(payload).eq("id", t.id) : await supabase.from("project_templates").insert({ ...payload, org_id: profile.org_id });
    setBusy(false);
    if (error) { toast.push(error.message.includes("duplicate") ? "A template with this key already exists" : error.message, "danger"); return; }
    toast.push(t ? "Template saved" : "Template created", "success");
    onClose(); router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={t ? `Edit template: ${t.name}` : "New project template"} width={760}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
          <Field label="Key" hint="Stable identifier used by automation"><Input value={key} onChange={(e) => { setKeyInput(e.target.value); setKeyTouched(true); }} className="font-mono" required /></Field>
          <Field label="Department"><DeptSlugSelect value={dept} onChange={setDept} /></Field>
          <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5"><span className="label !mb-0">Tasks <span className="text-muted font-normal">(in order)</span></span><Button type="button" size="xs" onClick={() => setTasks((s) => [...s, { title: "", priority: "normal", due_offset_days: (s[s.length - 1]?.due_offset_days ?? 0) + 3, depends_on_previous: true }])}><Plus size={12} /> Task</Button></div>
          <div className="space-y-1.5">
            {tasks.map((x, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[24px_1fr_120px_84px_auto_auto] gap-1.5 items-center card p-1.5">
                <span className="hidden sm:inline text-[11px] text-muted num text-center">{i + 1}</span>
                <Input value={x.title} onChange={(e) => setTasks((s) => s.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} placeholder="Task title" className="!h-8 !text-xs" />
                <span className="flex items-center gap-1 sm:hidden"><button type="button" className="btn btn-ghost btn-xs btn-icon" onClick={() => move(i, -1)}><ArrowUp size={12} /></button><button type="button" className="btn btn-ghost btn-xs btn-icon" onClick={() => move(i, 1)}><ArrowDown size={12} /></button><button type="button" className="btn btn-ghost btn-xs btn-icon text-danger" onClick={() => setTasks((s) => s.filter((_, j) => j !== i))}><X size={12} /></button></span>
                <PriorityPicker value={x.priority} onChange={(p) => setTasks((s) => s.map((y, j) => (j === i ? { ...y, priority: p } : y)))} className="!h-8 !text-xs" />
                <span className="relative"><Input type="number" value={x.due_offset_days ?? ""} onChange={(e) => setTasks((s) => s.map((y, j) => (j === i ? { ...y, due_offset_days: e.target.value === "" ? null : parseInt(e.target.value, 10) } : y)))} placeholder="days" className="!h-8 !text-xs !pr-7" /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted">d</span></span>
                <label className="inline-flex items-center gap-1 text-[11px] whitespace-nowrap"><input type="checkbox" checked={x.depends_on_previous} onChange={(e) => setTasks((s) => s.map((y, j) => (j === i ? { ...y, depends_on_previous: e.target.checked } : y)))} className="accent-[var(--brand)]" /> after prev</label>
                <span className="hidden sm:flex items-center"><button type="button" className="btn btn-ghost btn-xs btn-icon" onClick={() => move(i, -1)} aria-label="Up"><ArrowUp size={12} /></button><button type="button" className="btn btn-ghost btn-xs btn-icon" onClick={() => move(i, 1)} aria-label="Down"><ArrowDown size={12} /></button><button type="button" className="btn btn-ghost btn-xs btn-icon text-danger" onClick={() => setTasks((s) => s.filter((_, j) => j !== i))} aria-label="Remove"><X size={12} /></button></span>
              </div>
            ))}
            {tasks.length === 0 && <div className="text-xs text-muted">No tasks — add at least one.</div>}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5"><span className="label !mb-0 inline-flex items-center gap-1"><Flag size={12} /> Milestones <span className="text-muted font-normal">(% of project timeline)</span></span><Button type="button" size="xs" onClick={() => setMs((s) => [...s, { title: "", offset_pct: 50 }])}><Plus size={12} /> Milestone</Button></div>
          <div className="space-y-1.5">
            {ms.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_84px_auto] gap-1.5 items-center card p-1.5">
                <Input value={m.title} onChange={(e) => setMs((s) => s.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} placeholder="Milestone" className="!h-8 !text-xs" />
                <span className="relative"><Input type="number" min={0} max={100} value={m.offset_pct ?? ""} onChange={(e) => setMs((s) => s.map((y, j) => (j === i ? { ...y, offset_pct: e.target.value === "" ? null : parseInt(e.target.value, 10) } : y)))} className="!h-8 !text-xs !pr-6" /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted">%</span></span>
                <button type="button" className="btn btn-ghost btn-xs btn-icon text-danger" onClick={() => setMs((s) => s.filter((_, j) => j !== i))} aria-label="Remove"><X size={12} /></button>
              </div>
            ))}
            {ms.length === 0 && <div className="text-xs text-muted">Optional.</div>}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}><Check size={15} /> {t ? "Save template" : "Create template"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function TaskTemplateModal({ tpl, onClose }: { tpl: TT | "new" | null; onClose: () => void }) {
  if (!tpl) return null;
  return <TaskTemplateForm key={tpl === "new" ? "new" : tpl.id} tpl={tpl} onClose={onClose} />;
}

function TaskTemplateForm({ tpl, onClose }: { tpl: TT | "new"; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const t = tpl !== "new" ? tpl : null;
  const [name, setName] = React.useState(t?.name || "");
  const [description, setDescription] = React.useState(t?.description || "");
  const [dept, setDept] = React.useState(t?.department_slug || "");
  const [priority, setPriority] = React.useState<TaskPriority>(t?.priority || "normal");
  const [hours, setHours] = React.useState(t?.estimated_hours != null ? String(t.estimated_hours) : "");
  const [checklist, setChecklist] = React.useState(() => (t ? readStrings(t.checklist).join("\n") : ""));
  const [subtasks, setSubtasks] = React.useState(() => (t ? readStrings(t.subtasks).join("\n") : ""));
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    const payload = { name: name.trim(), description: description.trim() || null, department_slug: dept || null, priority, estimated_hours: hours ? Number(hours) : null, checklist: lines(checklist) as Json, subtasks: lines(subtasks).map((title) => ({ title })) as Json };
    const supabase = createClient();
    const { error } = t ? await supabase.from("task_templates").update(payload).eq("id", t.id) : await supabase.from("task_templates").insert({ ...payload, org_id: profile.org_id });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(t ? "Template saved" : "Template created", "success");
    onClose(); router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={t ? `Edit: ${t.name}` : "New task template"} width={560}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" className="sm:col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
          <Field label="Description" className="sm:col-span-2"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Department"><DeptSlugSelect value={dept} onChange={setDept} /></Field>
          <Field label="Priority"><PriorityPicker value={priority} onChange={setPriority} /></Field>
          <Field label="Estimated hours"><Input type="number" step="0.5" min={0} value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        </div>
        <Field label="Checklist" hint="One item per line"><Textarea value={checklist} onChange={(e) => setChecklist(e.target.value)} className={cn("font-mono text-[13px]")} placeholder={"Reproduce\nRoot cause\nFix\nTest"} /></Field>
        <Field label="Subtasks" hint="One title per line (optional)"><Textarea value={subtasks} onChange={(e) => setSubtasks(e.target.value)} className="font-mono text-[13px]" style={{ minHeight: 60 }} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}><Check size={15} /> {t ? "Save" : "Create"}</Button>
        </div>
      </form>
    </Modal>
  );
}
