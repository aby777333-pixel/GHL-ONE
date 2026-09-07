"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown, Save, Zap, Filter, ScrollText, Clock3, Info, Lock, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, Field, Input, Pill, Select, Textarea, useToast } from "@/components/ui";
import { PersonPicker, DepartmentPicker, ProjectPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { APPROVAL_TYPES, PRIORITIES, PRIORITY_LABEL, PROJECT_STATUSES, PROJECT_STATUS_LABEL, ROLE_LABEL, STATUS_LABEL, TASK_STATUSES, WAITING_LABEL, cn, humanize, isManagerPlus, type RoleLevel, type TaskStatus, type WaitingOn } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import {
  ACTION_TYPES, ENTITY_FIELDS, NOTIFICATION_KINDS, TARGETS, TRIGGERS, WEEKDAYS,
  cleanAction, cleanConfig, draftFromRow, emptyDraft, enumOptions, opsFor, recipe, splitTarget, triggerDef, triggerLabel,
  type Action, type AutomationRow, type Condition, type Draft, type Entity, type FieldDef, type TriggerConfig,
} from "./model";
import { ActionIcon, ACTION_TONE, RunLogDrawer, Toggle, VariablesHelp } from "./AutomationBits";
import { TestPanel } from "./TestPanel";

type ChannelLite = { id: string; name: string; slug: string | null; type: string };
type IntegrationLite = { id: string; name: string; provider: string; enabled: boolean };
type Props = {
  row: AutomationRow | null;
  templateKey?: string;
  channels: ChannelLite[];
  integrations: IntegrationLite[];
  projectTemplates: { key: string; name: string }[];
  projects: { id: string; name: string }[];
};

const ROLES: RoleLevel[] = ["super_admin", "director", "executive", "department_head", "manager", "team_lead", "employee", "intern", "consultant", "vendor", "guest"];

export function AutomationBuilder({ row, templateKey, channels, integrations, projectTemplates, projects }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments } = useSession();
  const manager = isManagerPlus(profile.role);

  const [draft, setDraft] = React.useState<Draft>(() => {
    if (row) return draftFromRow(row);
    const r = templateKey ? recipe(templateKey) : undefined;
    if (r) return r.build({ deptId: (slug) => departments.find((d) => d.slug === slug)?.id || null, myId: profile.id });
    return emptyDraft();
  });
  const [busy, setBusy] = React.useState(false);
  const [showLog, setShowLog] = React.useState(false);
  const [savedId, setSavedId] = React.useState<string | null>(row?.id || null);

  const def = triggerDef(draft.trigger_type);
  const entity: Entity = def.entity;
  const fields = ENTITY_FIELDS[entity];
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  function setTrigger(type: string) {
    const nextEntity = triggerDef(type).entity;
    const validKeys = new Set(ENTITY_FIELDS[nextEntity].map((f) => f.key));
    patch({
      trigger_type: type,
      trigger_config: type === "schedule" ? { every: "day", at: "09:00" } : {},
      conditions: draft.conditions.filter((c) => validKeys.has(c.field)),
    });
  }
  const setCfg = (k: string, v: string | number | undefined) => patch({ trigger_config: { ...draft.trigger_config, [k]: v === "" ? undefined : v } });

  /* conditions */
  const addCondition = () => patch({ conditions: [...draft.conditions, { field: fields[0]?.key || "title", op: "eq", value: "" }] });
  const setCondition = (i: number, c: Condition) => patch({ conditions: draft.conditions.map((x, j) => (j === i ? c : x)) });
  const removeCondition = (i: number) => patch({ conditions: draft.conditions.filter((_, j) => j !== i) });

  /* actions */
  const addAction = () => patch({ actions: [...draft.actions, { type: "notify", to: entity === "approval" ? "requester" : "assignee", kind: "action_required" }] });
  const setAction = (i: number, a: Action) => patch({ actions: draft.actions.map((x, j) => (j === i ? a : x)) });
  const removeAction = (i: number) => patch({ actions: draft.actions.filter((_, j) => j !== i) });
  const moveAction = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.actions.length) return;
    const next = [...draft.actions];
    [next[i], next[j]] = [next[j], next[i]];
    patch({ actions: next });
  };

  function validate(): string | null {
    if (!draft.name.trim()) return "Give the automation a name.";
    if (draft.actions.length === 0) return "Add at least one action.";
    for (const [i, a] of draft.actions.entries()) {
      const n = `Action ${i + 1}`;
      // "user:", "department:", "pick:", "slug:"… = a picker whose second half was never chosen
      const incomplete = (v: unknown) => typeof v === "string" && /^[a-z_]*:$/.test(v);
      if (a.type === "notify" && (!a.to || incomplete(a.to))) return `${n}: choose who to notify.`;
      if (a.type === "post_message" && (!a.channel || incomplete(a.channel))) return `${n}: choose a channel.`;
      if ((a.type === "slack" || a.type === "webhook") && !a.integration_id) return `${n}: pick an integration (Admin → Integrations).`;
      if (a.type === "create_project_from_template" && !a.template_key) return `${n}: pick a project template.`;
      if (a.type === "create_task" && (incomplete(a.assignee) || incomplete(a.department_id) || incomplete(a.project))) return `${n}: finish choosing the assignee, department or project.`;
      if (a.type === "update_task" && incomplete(a.assignee)) return `${n}: finish choosing the new assignee.`;
      if (a.type === "create_approval" && incomplete(a.approver)) return `${n}: finish choosing the approver.`;
    }
    for (const [i, c] of draft.conditions.entries()) {
      const needs = opsFor(fields.find((f) => f.key === c.field)?.kind || "text").find((o) => o.key === c.op)?.needsValue;
      if (needs && (c.value === undefined || c.value === "")) return `Condition ${i + 1} needs a value.`;
    }
    return null;
  }

  async function save() {
    const err = validate();
    if (err) { toast.push(err, "danger"); return; }
    setBusy(true);
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      enabled: draft.enabled,
      trigger_type: draft.trigger_type,
      trigger_config: cleanConfig(draft.trigger_config) as Json,
      conditions: draft.conditions.map((c) => {
        const needs = opsFor(fields.find((f) => f.key === c.field)?.kind || "text").find((o) => o.key === c.op)?.needsValue;
        return needs ? { field: c.field, op: c.op, value: c.value ?? "" } : { field: c.field, op: c.op };
      }) as Json,
      actions: draft.actions.map(cleanAction) as Json,
      scope_project_id: draft.scope_project_id || null,
      scope_department_id: draft.scope_department_id || null,
    };
    const sb = createClient();
    if (savedId) {
      const { error } = await sb.from("automations").update(payload).eq("id", savedId);
      setBusy(false);
      if (error) { toast.push(error.message, "danger"); return; }
      toast.push("Automation saved", "success");
      router.refresh();
    } else {
      if (!profile.org_id) { setBusy(false); toast.push("Your profile has no organization", "danger"); return; }
      const { data, error } = await sb.from("automations").insert({ ...payload, org_id: profile.org_id, created_by: profile.id }).select("id").single();
      setBusy(false);
      if (error || !data) { toast.push(error?.message || "Could not save", "danger"); return; }
      setSavedId(data.id);
      toast.push("Automation created", "success");
      router.replace(`/automations/${data.id}`);
    }
  }

  async function remove() {
    if (!savedId || !confirm(`Delete “${draft.name || "this automation"}”? Its run log is deleted too.`)) return;
    setBusy(true);
    const { error } = await createClient().from("automations").delete().eq("id", savedId);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Automation deleted", "success");
    router.push("/automations");
    router.refresh();
  }

  const projectsWithNone = projects;

  return (
    <div className="page">
      <div className="flex items-center gap-2 mb-[var(--s3)] text-sm">
        <Link href="/automations" className="inline-flex items-center gap-1 text-muted hover:text-[var(--fg)]"><ArrowLeft size={15} /> Automations</Link>
        <span className="text-muted">/</span>
        <span className="truncate">{savedId ? draft.name || "Untitled" : "New automation"}</span>
      </div>

      {!manager && (
        <div className="card px-4 py-2.5 mb-[var(--s3)] flex items-start gap-2 text-sm"><Lock size={15} className="shrink-0 mt-0.5 text-muted" /><span>You can view this automation. Editing requires a manager role or above.</span></div>
      )}
      {row?.last_error && (
        <div className="card px-4 py-2.5 mb-[var(--s3)] flex items-start gap-2 text-sm border-[var(--danger)]"><AlertTriangle size={15} className="shrink-0 mt-0.5 text-danger" /><span><span className="font-medium">Last run failed:</span> {row.last_error}</span></div>
      )}

      <fieldset disabled={!manager || busy} className="min-w-0 space-y-[var(--s4)]">
        {/* ------------------------------------------------------ basics */}
        <Card>
          <div className="px-[var(--s4)] py-[var(--s3)] grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-start">
            <div className="space-y-3 min-w-0">
              <Field label="Name"><Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Design approved → Marketing publishing task" required /></Field>
              <Field label="Description (optional)"><Input value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="What this rule is for, in one line" /></Field>
            </div>
            <div className="lg:pt-6"><Toggle on={draft.enabled} onChange={(v) => patch({ enabled: v })} label="Enabled" hint={draft.enabled ? "Runs whenever the trigger fires." : "Paused — nothing runs."} /></div>
          </div>
        </Card>

        {/* -------------------------------------------------------- WHEN */}
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><span className="pill tone-brand">WHEN</span> Trigger</span>} subtitle={def.hint} action={<Zap size={15} className="text-muted" />} />
          <div className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Event">
                <Select value={draft.trigger_type} onChange={(e) => setTrigger(e.target.value)}>
                  {[...new Set(TRIGGERS.map((t) => t.group))].map((g) => (
                    <optgroup key={g} label={g}>
                      {TRIGGERS.filter((t) => t.group === g).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <TriggerConfigEditor type={draft.trigger_type} cfg={draft.trigger_config} set={setCfg} />
            </div>
            {entity !== "schedule" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Only for project" hint="Leave empty for all projects."><ProjectPicker value={draft.scope_project_id} onChange={(v) => patch({ scope_project_id: v || null })} projects={projectsWithNone} placeholder="Any project" /></Field>
                <Field label="Only for department" hint="Leave empty for all departments."><DepartmentPicker value={draft.scope_department_id} onChange={(v) => patch({ scope_department_id: v || null })} placeholder="Any department" /></Field>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Default project for created tasks"><ProjectPicker value={draft.scope_project_id} onChange={(v) => patch({ scope_project_id: v || null })} projects={projectsWithNone} placeholder="No project" /></Field>
                <Field label="Default department"><DepartmentPicker value={draft.scope_department_id} onChange={(v) => patch({ scope_department_id: v || null })} placeholder="No department" /></Field>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted"><Info size={12} /> Reads as: <Pill tone="tone-brand">{entity === "schedule" ? <Clock3 size={10} /> : <Zap size={10} />} {triggerLabel(draft.trigger_type, draft.trigger_config)}</Pill></div>
          </div>
        </Card>

        {/* ---------------------------------------------------------- IF */}
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><span className="pill tone-warn">IF</span> Conditions</span>}
            subtitle={entity === "schedule" ? "Scheduled runs have no record to test — they always run." : draft.conditions.length === 0 ? "No conditions — runs for every matching event." : "All conditions must be true."}
            action={<Filter size={15} className="text-muted" />}
          />
          <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2">
            {draft.conditions.map((c, i) => (
              <ConditionRow key={i} cond={c} fields={fields} onChange={(v) => setCondition(i, v)} onRemove={() => removeCondition(i)} />
            ))}
            {entity !== "schedule" && <Button type="button" size="sm" onClick={addCondition}><Plus size={14} /> Add condition</Button>}
          </div>
        </Card>

        {/* -------------------------------------------------------- THEN */}
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><span className="pill tone-success">THEN</span> Actions</span>}
            subtitle="Run in order. Use {{variables}} in any text."
            action={<VariablesHelp entity={entity} />}
          />
          <div className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
            {draft.actions.map((a, i) => (
              <ActionRow
                key={i}
                index={i}
                total={draft.actions.length}
                action={a}
                entity={entity}
                channels={channels}
                integrations={integrations}
                projectTemplates={projectTemplates}
                projects={projects}
                onChange={(v) => setAction(i, v)}
                onRemove={() => removeAction(i)}
                onMove={(d) => moveAction(i, d)}
              />
            ))}
            <Button type="button" size="sm" onClick={addAction}><Plus size={14} /> Add action</Button>
          </div>
        </Card>
      </fieldset>

      {/* -------------------------------------------------------- footer */}
      <div className="sticky bottom-[64px] lg:bottom-3 z-30 mt-[var(--s4)]">
        <div className="card px-3 py-2 flex items-center gap-2 flex-wrap" style={{ boxShadow: "var(--shadow-lg)" }}>
          {manager && <Button variant="primary" onClick={save} loading={busy}><Save size={15} /> {savedId ? "Save changes" : "Create automation"}</Button>}
          {savedId && <Button variant="ghost" onClick={() => setShowLog(true)}><ScrollText size={15} /> Run log</Button>}
          {savedId && manager && <Button variant="ghost" className="text-danger ml-auto" onClick={remove} disabled={busy}><Trash2 size={15} /> Delete</Button>}
        </div>
      </div>

      <div className="mt-[var(--s4)]">
        <TestPanel automationId={savedId} entity={entity} actions={draft.actions} saved={!!savedId} canTest={manager} />
      </div>

      {savedId && showLog && <RunLogDrawer automationId={savedId} name={draft.name} open onClose={() => setShowLog(false)} />}
    </div>
  );
}

/* ================================================================== WHEN */
function TriggerConfigEditor({ type, cfg, set }: { type: string; cfg: TriggerConfig; set: (k: string, v: string | number | undefined) => void }) {
  const s = (k: string) => (cfg[k] == null ? "" : String(cfg[k]));
  if (type === "task.status_changed") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="From status">
          <Select value={s("from_status")} onChange={(e) => set("from_status", e.target.value)}>
            <option value="">Any</option>
            {TASK_STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
          </Select>
        </Field>
        <Field label="To status">
          <Select value={s("to_status")} onChange={(e) => set("to_status", e.target.value)}>
            <option value="">Any</option>
            {TASK_STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
          </Select>
        </Field>
      </div>
    );
  }
  if (type === "task.priority_changed") {
    return (
      <Field label="To priority">
        <Select value={s("to_priority")} onChange={(e) => set("to_priority", e.target.value)}>
          <option value="">Any</option>
          {PRIORITIES.map((x) => <option key={x} value={x}>{PRIORITY_LABEL[x]}</option>)}
        </Select>
      </Field>
    );
  }
  if (type === "approval.decided") {
    return (
      <Field label="Decision">
        <Select value={s("to_status")} onChange={(e) => set("to_status", e.target.value)}>
          <option value="">Any decision</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="changes_requested">Changes requested</option>
        </Select>
      </Field>
    );
  }
  if (type === "project.status_changed") {
    return (
      <Field label="To status">
        <Select value={s("to_status")} onChange={(e) => set("to_status", e.target.value)}>
          <option value="">Any</option>
          {PROJECT_STATUSES.map((x) => <option key={x} value={x}>{PROJECT_STATUS_LABEL[x]}</option>)}
        </Select>
      </Field>
    );
  }
  if (type === "schedule") {
    const every = s("every") || "day";
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Every">
          <Select value={every} onChange={(e) => set("every", e.target.value)}>
            <option value="hour">Hour</option>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </Select>
        </Field>
        {every !== "hour" && <Field label="At (IST)"><Input type="time" value={s("at") || "09:00"} onChange={(e) => set("at", e.target.value)} /></Field>}
        {every === "week" && (
          <Field label="Weekday" className="col-span-2">
            <Select value={s("weekday") || "1"} onChange={(e) => set("weekday", Number(e.target.value))}>
              {WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
            </Select>
          </Field>
        )}
        {every === "month" && <Field label="Day of month" hint="1–28" className="col-span-2"><Input type="number" min={1} max={28} value={s("day") || "1"} onChange={(e) => set("day", Math.max(1, Math.min(28, Number(e.target.value) || 1)))} /></Field>}
      </div>
    );
  }
  return <div className="hidden sm:block" />;
}

/* ==================================================================== IF */
function ConditionRow({ cond, fields, onChange, onRemove }: { cond: Condition; fields: FieldDef[]; onChange: (c: Condition) => void; onRemove: () => void }) {
  const fdef = fields.find((f) => f.key === cond.field) || fields[0];
  const kind = fdef?.kind || "text";
  const ops = opsFor(kind);
  const op = ops.find((o) => o.key === cond.op) || ops[0];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(150px,1fr)_minmax(130px,auto)_minmax(160px,1.4fr)_auto] gap-2 items-start sunken rounded-[var(--radius-sm)] p-2">
      <Select
        value={fdef?.key || ""}
        onChange={(e) => {
          const nf = fields.find((f) => f.key === e.target.value)!;
          const nops = opsFor(nf.kind);
          onChange({ field: nf.key, op: nops.some((o) => o.key === cond.op) ? cond.op : nops[0].key, value: "" });
        }}
      >
        {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </Select>
      <Select value={op?.key || "eq"} onChange={(e) => onChange({ ...cond, op: e.target.value, value: cond.value })}>
        {ops.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </Select>
      <div className="min-w-0">
        {op?.needsValue ? <ConditionValue kind={kind} op={op.key} value={cond.value || ""} onChange={(v) => onChange({ ...cond, value: v })} /> : <div className="text-xs text-muted h-[38px] flex items-center px-1">no value needed</div>}
        {fdef?.hint && <div className="text-[10px] text-muted mt-1">{fdef.hint}</div>}
      </div>
      <Button type="button" variant="ghost" size="sm" icon onClick={onRemove} aria-label="Remove condition" className="justify-self-end"><Trash2 size={14} /></Button>
    </div>
  );
}

function ConditionValue({ kind, op, value, onChange }: { kind: FieldDef["kind"]; op: string; value: string; onChange: (v: string) => void }) {
  const { departments } = useSession();
  const multi = op === "in" || op === "not_in";
  const options = enumOptions(kind);
  const labelFor = (k: string) => (kind === "task_status" ? STATUS_LABEL[k as TaskStatus] : kind === "priority" ? PRIORITY_LABEL[k as keyof typeof PRIORITY_LABEL] : kind === "project_status" ? PROJECT_STATUS_LABEL[k as keyof typeof PROJECT_STATUS_LABEL] : kind === "waiting_on" ? WAITING_LABEL[k as WaitingOn] : humanize(k)) || k;

  if (kind === "department_slug") {
    if (multi) {
      const picked = new Set(value.split(",").filter(Boolean));
      return (
        <div className="flex flex-wrap gap-1 py-1">
          {departments.map((d) => {
            const slug = d.slug;
            const on = picked.has(slug);
            return <button type="button" key={d.id} onClick={() => { const n = new Set(picked); if (on) n.delete(slug); else n.add(slug); onChange([...n].join(",")); }} className={cn("pill pill-lg", on ? "tone-brand" : "tone-neutral")}>{d.name}</button>;
          })}
        </div>
      );
    }
    const id = departments.find((d) => d.slug === value)?.id || "";
    return <DepartmentPicker value={id} onChange={(v) => onChange(departments.find((d) => d.id === v)?.slug || "")} placeholder="Choose department…" />;
  }
  if (kind === "person") return <PersonPicker value={value} onChange={onChange} placeholder="Choose person…" />;
  if (kind === "number") return <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" />;
  if (options) {
    if (multi) {
      const picked = new Set(value.split(",").filter(Boolean));
      return (
        <div className="flex flex-wrap gap-1 py-1">
          {options.map((o) => {
            const on = picked.has(o);
            return <button type="button" key={o} onClick={() => { const n = new Set(picked); if (on) n.delete(o); else n.add(o); onChange([...n].join(",")); }} className={cn("pill pill-lg", on ? "tone-brand" : "tone-neutral")}>{labelFor(o)}</button>;
          })}
        </div>
      );
    }
    return (
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {options.map((o) => <option key={o} value={o}>{labelFor(o)}</option>)}
      </Select>
    );
  }
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={multi ? "value1,value2" : op === "contains" ? "text to look for" : "value"} />;
}

/* ================================================================== THEN */
type ExprOpt = { key: string; label: string; needs?: "person" | "department" | "role" };

/** Picks an expression like "manager", "user:<id>", "department:<id>", "role:<role>". */
function ExprPicker({ value, onChange, options, placeholder }: { value: string | undefined; onChange: (v: string) => void; options: ExprOpt[]; placeholder?: string }) {
  const { base, arg } = splitTarget(value);
  const opt = options.find((o) => o.key === base) || options.find((o) => o.key === (value || ""));
  const needs = opt?.needs;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Select value={opt?.key ?? ""} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </Select>
      {needs === "person" && <PersonPicker value={arg} onChange={(v) => onChange(`${base}${v}`)} placeholder="Choose person…" allowEmpty />}
      {needs === "department" && <DepartmentPicker value={arg} onChange={(v) => onChange(`${base}${v}`)} placeholder="Choose department…" />}
      {needs === "role" && (
        <Select value={arg} onChange={(e) => onChange(`${base}${e.target.value}`)}>
          <option value="">Choose role…</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </Select>
      )}
    </div>
  );
}

function ActionRow({ index, total, action, entity, channels, integrations, projectTemplates, projects, onChange, onRemove, onMove }: {
  index: number; total: number; action: Action; entity: Entity;
  channels: ChannelLite[]; integrations: IntegrationLite[]; projectTemplates: { key: string; name: string }[]; projects: { id: string; name: string }[];
  onChange: (a: Action) => void; onRemove: () => void; onMove: (d: -1 | 1) => void;
}) {
  const a = action;
  const s = (k: string) => (a[k] == null ? "" : String(a[k]));
  const set = (k: string, v: string | number | boolean | undefined) => onChange({ ...a, [k]: v });
  const setType = (t: string) => onChange({ type: t, ...(t === "notify" ? { to: "assignee", kind: "action_required" } : t === "create_task" ? { assignee: "same", department_id: "same", project: "same", priority: "normal" } : t === "create_approval" ? { approver: "manager", approval_type: "other", priority: "normal" } : t === "post_message" ? { channel: "project" } : {}) });
  const meta = ACTION_TYPES.find((x) => x.key === a.type);
  const targets = TARGETS.filter((t) => !t.entities || t.entities.includes(entity));
  const isTask = entity === "task";

  return (
    <div className="rounded-[var(--radius)] border p-3 space-y-3 min-w-0">
      <div className="flex items-center gap-2">
        <span className={cn("pill shrink-0", ACTION_TONE[a.type] || "tone-neutral")}><ActionIcon type={a.type} size={11} /> {index + 1}</span>
        <Select value={a.type} onChange={(e) => setType(e.target.value)} className="flex-1 min-w-0">
          {ACTION_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </Select>
        <div className="flex items-center shrink-0">
          <Button type="button" variant="ghost" size="sm" icon onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up"><ArrowUp size={14} /></Button>
          <Button type="button" variant="ghost" size="sm" icon onClick={() => onMove(1)} disabled={index >= total - 1} aria-label="Move down"><ArrowDown size={14} /></Button>
          <Button type="button" variant="ghost" size="sm" icon onClick={onRemove} aria-label="Remove action"><Trash2 size={14} /></Button>
        </div>
      </div>
      {meta && <div className="text-[11px] text-muted -mt-1">{meta.hint}</div>}

      {a.type === "notify" && (
        <div className="space-y-3">
          <Field label="Notify"><ExprPicker value={s("to")} onChange={(v) => set("to", v)} options={targets} /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
            <Field label="Title"><Input value={s("title")} onChange={(e) => set("title", e.target.value)} placeholder="Automation: {{title}}" /></Field>
            <Field label="Kind">
              <Select value={s("kind") || "action_required"} onChange={(e) => set("kind", e.target.value)}>
                {NOTIFICATION_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Body (optional)"><Textarea rows={2} className="min-h-[60px]" value={s("body")} onChange={(e) => set("body", e.target.value)} placeholder="{{assignee_name}} · {{project_name}} · due {{due}}" /></Field>
        </div>
      )}

      {a.type === "create_task" && (
        <div className="space-y-3">
          <Field label="Title"><Input value={s("title")} onChange={(e) => set("title", e.target.value)} placeholder="Follow-up: {{title}}" /></Field>
          <Field label="Description"><Textarea rows={2} className="min-h-[60px]" value={s("description")} onChange={(e) => set("description", e.target.value)} placeholder="Source: {{link}}" /></Field>
          <Field label="Assignee">
            <ExprPicker
              value={s("assignee")}
              onChange={(v) => set("assignee", v)}
              placeholder="Unassigned"
              options={[
                { key: "same", label: isTask ? "Same as source task" : "Same as source record" },
                { key: "owner", label: isTask ? "Owner of source task" : entity === "schedule" ? "Automation owner (me)" : "Owner of source record" },
                { key: "manager", label: "Manager of the assignee" },
                { key: "user:", label: "A specific person…", needs: "person" },
                { key: "department_head:", label: "Head of a department…", needs: "department" },
              ]}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Department">
              <SameOrPick value={s("department_id")} onChange={(v) => set("department_id", v)} sameLabel={entity === "schedule" ? "Automation's default department" : "Same as source"} noneLabel="No department" render={(v, on) => <DepartmentPicker value={v} onChange={on} placeholder="Choose department…" />} />
            </Field>
            <Field label="Project">
              <SameOrPick value={s("project") || "same"} onChange={(v) => set("project", v)} sameLabel={entity === "schedule" ? "Automation's default project" : "Same as source"} noneLabel="No project" noneKey="none" render={(v, on) => <ProjectPicker value={v} onChange={on} projects={projects} placeholder="Choose project…" />} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <Select value={s("priority") || "normal"} onChange={(e) => set("priority", e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </Select>
            </Field>
            <Field label="Due in (hours)" hint="Empty = no due date"><Input type="number" min={0} value={s("due_in_hours")} onChange={(e) => set("due_in_hours", e.target.value === "" ? undefined : Number(e.target.value))} placeholder="48" /></Field>
          </div>
          {isTask && <Toggle on={!!a.depends_on_source} onChange={(v) => set("depends_on_source", v)} label="Depends on the source task" hint="New task waits until the source task is done." />}
        </div>
      )}

      {a.type === "update_task" && (
        <div className="space-y-3">
          {!isTask && <div className="text-xs text-warn inline-flex items-center gap-1"><AlertTriangle size={12} /> This action only works with task triggers.</div>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Status">
              <Select value={s("status")} onChange={(e) => set("status", e.target.value)}>
                <option value="">Keep</option>
                {TASK_STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={s("priority")} onChange={(e) => set("priority", e.target.value)}>
                <option value="">Keep</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </Select>
            </Field>
            <Field label="Waiting on">
              <Select value={s("waiting_on")} onChange={(e) => set("waiting_on", e.target.value)}>
                <option value="">Keep</option>
                {(Object.keys(WAITING_LABEL) as WaitingOn[]).map((w) => <option key={w} value={w}>{WAITING_LABEL[w]}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Waiting note"><Input value={s("waiting_note")} onChange={(e) => set("waiting_note", e.target.value)} placeholder="Waiting on {{owner_name}}" /></Field>
          <Field label="Reassign to">
            <ExprPicker value={s("assignee")} onChange={(v) => set("assignee", v)} placeholder="Keep assignee" options={[{ key: "manager", label: "Assignee's manager" }, { key: "user:", label: "A specific person…", needs: "person" }]} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Add tag"><Input value={s("add_tag")} onChange={(e) => set("add_tag", e.target.value)} placeholder="escalated" /></Field>
            <Field label="New due in (hours)"><Input type="number" min={0} value={s("due_in_hours")} onChange={(e) => set("due_in_hours", e.target.value === "" ? undefined : Number(e.target.value))} placeholder="keep" /></Field>
          </div>
        </div>
      )}

      {a.type === "post_message" && (
        <div className="space-y-3">
          <Field label="Channel"><ChannelPicker value={s("channel")} onChange={(v) => set("channel", v)} channels={channels} entity={entity} /></Field>
          <Field label="Message" hint="The record link is appended automatically."><Textarea rows={2} className="min-h-[60px]" value={s("body")} onChange={(e) => set("body", e.target.value)} placeholder="🤖 {{title}}" /></Field>
        </div>
      )}

      {a.type === "create_approval" && (
        <div className="space-y-3">
          <Field label="Approver"><ExprPicker value={s("approver") || "manager"} onChange={(v) => set("approver", v)} options={targets.filter((t) => t.key !== "executives" && t.key !== "department:" && t.key !== "role:")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Approval type">
              <Select value={s("approval_type") || "other"} onChange={(e) => set("approval_type", e.target.value)}>
                {APPROVAL_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={s("priority") || "normal"} onChange={(e) => set("priority", e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Title"><Input value={s("title")} onChange={(e) => set("title", e.target.value)} placeholder="Approve: {{title}}" /></Field>
          <Field label="Description"><Textarea rows={2} className="min-h-[60px]" value={s("description")} onChange={(e) => set("description", e.target.value)} placeholder="{{description}}" /></Field>
        </div>
      )}

      {(a.type === "slack" || a.type === "webhook") && (
        <div className="space-y-3">
          <IntegrationSelect value={s("integration_id")} onChange={(v) => set("integration_id", v)} integrations={integrations.filter((i) => i.provider === (a.type === "slack" ? "slack" : "webhook_out"))} kind={a.type} />
          {a.type === "slack" ? (
            <Field label="Message" hint="Slack mrkdwn is supported."><Textarea rows={2} className="min-h-[60px]" value={s("body")} onChange={(e) => set("body", e.target.value)} placeholder="*{{title}}* — {{project_name}} ({{link}})" /></Field>
          ) : (
            <div className="text-[11px] text-muted">Sends <code className="font-mono">{"{event, automation, entity, data, sent_at}"}</code> as JSON with an <code className="font-mono">X-GHL-Signature</code> HMAC-SHA256 header.</div>
          )}
        </div>
      )}

      {a.type === "create_project_from_template" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Template">
              <Select value={s("template_key")} onChange={(e) => set("template_key", e.target.value)}>
                <option value="">Choose template…</option>
                {projectTemplates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Project name"><Input value={s("name")} onChange={(e) => set("name", e.target.value)} placeholder="{{title}}" /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Owner" hint="Empty = automation creator"><PersonPicker value={s("owner")} onChange={(v) => set("owner", v)} placeholder="Automation creator" /></Field>
            <Field label="Due in (days)"><Input type="number" min={1} value={s("due_in_days")} onChange={(e) => set("due_in_days", e.target.value === "" ? undefined : Number(e.target.value))} placeholder="30" /></Field>
            <Field label="Department"><DepartmentPicker value={s("department_id")} onChange={(v) => set("department_id", v)} placeholder="None" /></Field>
          </div>
        </div>
      )}
    </div>
  );
}

function SameOrPick({ value, onChange, sameLabel, noneLabel, noneKey = "", render }: { value: string; onChange: (v: string) => void; sameLabel: string; noneLabel: string; noneKey?: string; render: (v: string, on: (v: string) => void) => React.ReactNode }) {
  const mode = value === "same" ? "same" : value === noneKey ? "none" : "pick";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Select value={mode} onChange={(e) => onChange(e.target.value === "same" ? "same" : e.target.value === "none" ? noneKey : "pick:")}>
        <option value="same">{sameLabel}</option>
        <option value="none">{noneLabel}</option>
        <option value="pick">Choose…</option>
      </Select>
      {mode === "pick" && render(value.startsWith("pick:") ? "" : value, onChange)}
    </div>
  );
}

function ChannelPicker({ value, onChange, channels, entity }: { value: string; onChange: (v: string) => void; channels: ChannelLite[]; entity: Entity }) {
  const { base, arg } = splitTarget(value);
  const mode = value === "project" ? "project" : base === "slug:" ? "slug" : base === "department:" ? "department" : base === "channel:" ? "channel" : "";
  const slugs = channels.filter((c) => c.slug).map((c) => c.slug!);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Select value={mode} onChange={(e) => onChange(e.target.value === "project" ? "project" : e.target.value === "slug" ? "slug:" : e.target.value === "department" ? "department:" : e.target.value === "channel" ? "channel:" : "")}>
        <option value="">Choose…</option>
        {entity !== "schedule" && <option value="project">The record&apos;s project channel</option>}
        <option value="slug">Channel by slug (#sales, #management…)</option>
        <option value="department">A department&apos;s channel…</option>
        <option value="channel">Pick a channel…</option>
      </Select>
      {mode === "slug" && (
        <>
          <Input list="ghl-channel-slugs" value={arg} onChange={(e) => onChange(`slug:${e.target.value.replace(/^#/, "")}`)} placeholder="sales" />
          <datalist id="ghl-channel-slugs">{slugs.map((s) => <option key={s} value={s} />)}</datalist>
        </>
      )}
      {mode === "department" && <DepartmentPicker value={arg} onChange={(v) => onChange(`department:${v}`)} placeholder="Choose department…" />}
      {mode === "channel" && (
        <Select value={arg} onChange={(e) => onChange(`channel:${e.target.value}`)}>
          <option value="">Choose channel…</option>
          {channels.map((c) => <option key={c.id} value={c.id}>#{c.slug || c.name} · {c.type}</option>)}
        </Select>
      )}
    </div>
  );
}

function IntegrationSelect({ value, onChange, integrations, kind }: { value: string; onChange: (v: string) => void; integrations: IntegrationLite[]; kind: string }) {
  const { profile } = useSession();
  const adminHref = "/admin?tab=integrations";
  return (
    <Field label={kind === "slack" ? "Slack integration" : "Outgoing webhook"} hint={integrations.length === 0 ? undefined : "Configured in Admin → Integrations."}>
      {integrations.length === 0 ? (
        <div className="text-sm text-muted">No {kind === "slack" ? "Slack" : "outgoing webhook"} integrations yet.{" "}{isManagerPlus(profile.role) && <Link href={adminHref} className="link">Add one in Admin → Integrations</Link>}</div>
      ) : (
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {integrations.map((i) => <option key={i.id} value={i.id}>{i.name}{i.enabled ? "" : " (disabled)"}</option>)}
        </Select>
      )}
    </Field>
  );
}
