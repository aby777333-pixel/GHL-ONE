"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Siren, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Info, ScrollText, RefreshCw, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Spinner, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, fmtDate, humanize, PRIORITIES, PRIORITY_LABEL, PRIORITY_TONE, type Tables, type TaskPriority } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { Toggle } from "@/components/automations/AutomationBits";
import { NOTIFICATION_KINDS } from "@/components/automations/model";

type Rule = Tables<"escalation_rules">;
type Kind = Rule["kind"];

const TARGETS: { key: string; label: string; hint: string }[] = [
  { key: "assignee", label: "Assignee", hint: "The person doing the work" },
  { key: "owner", label: "Owner", hint: "Accountable owner of the task" },
  { key: "delegator", label: "Delegator", hint: "Whoever delegated it" },
  { key: "approver", label: "Approver", hint: "If the task has one" },
  { key: "manager", label: "Manager", hint: "Assignee's manager" },
  { key: "department_head", label: "Department head", hint: "Of the task's department" },
  { key: "executives", label: "Executives", hint: "Super admins, directors, executives" },
];

export function hoursLabel(h: number) {
  if (h < 0) return `${-h}h before due`;
  if (h === 0) return "at due time";
  return `${h}h after due`;
}
function hoursTone(h: number) {
  if (h < 0) return "tone-info";
  if (h === 0) return "tone-warn";
  if (h >= 48) return "tone-danger";
  return "tone-orange";
}

type LogRow = { id: number; summary: string | null; created_at: string; task_id: string | null; new_value: Json | null };

export function EscalationAdmin({ rules }: { rules: Rule[] }) {
  const router = useRouter();
  const toast = useToast();
  const [edit, setEdit] = React.useState<Rule | "new" | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const sorted = React.useMemo(() => [...rules].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)), [rules]);

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const next = [...sorted];
    [next[i], next[j]] = [next[j], next[i]];
    setBusy(next[j].id);
    const sb = createClient();
    // seeded rules may share a position — rewrite every position to its new index so the order is unambiguous
    const results = await Promise.all(next.map((r, idx) => (r.position === idx ? Promise.resolve({ error: null }) : sb.from("escalation_rules").update({ position: idx }).eq("id", r.id))));
    setBusy(null);
    const err = results.find((r) => r.error)?.error;
    if (err) { toast.push(err.message, "danger"); return; }
    router.refresh();
  }
  async function toggle(r: Rule, enabled: boolean) {
    setBusy(r.id);
    const { error } = await createClient().from("escalation_rules").update({ enabled }).eq("id", r.id);
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    router.refresh();
  }
  async function remove(r: Rule) {
    if (!confirm(`Delete “${r.name}”?`)) return;
    setBusy(r.id);
    const { error } = await createClient().from("escalation_rules").delete().eq("id", r.id);
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Rule deleted", "success");
    router.refresh();
  }

  return (
    <div className="space-y-[var(--s4)]">
      <Card>
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><Siren size={16} /> Escalation ladder</span>}
          subtitle="Checked every 15 minutes against every open task with a due date. Each rule fires once per task."
          action={<Button size="sm" variant="primary" onClick={() => setEdit("new")}><Plus size={14} /> Add rule</Button>}
        />
        {sorted.length === 0 ? (
          <EmptyState icon={<Siren size={18} />} title="No escalation rules" hint="Add a reminder before the deadline and a couple of overdue steps that climb the org chart." action={<Button variant="primary" onClick={() => setEdit("new")}><Plus size={14} /> Add rule</Button>} />
        ) : (
          <div className="divide-y">
            {sorted.map((r, i) => (
              <div key={r.id} className={cn("flex items-start gap-3 px-[var(--s3)] sm:px-[var(--s4)] py-2.5", !r.enabled && "opacity-60", busy === r.id && "opacity-50")}>
                <div className="flex flex-col shrink-0 -my-1">
                  <Button variant="ghost" size="xs" icon onClick={() => move(i, -1)} disabled={i === 0 || !!busy} aria-label="Move up"><ArrowUp size={13} /></Button>
                  <Button variant="ghost" size="xs" icon onClick={() => move(i, 1)} disabled={i >= sorted.length - 1 || !!busy} aria-label="Move down"><ArrowDown size={13} /></Button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{r.name}</span>
                    <Pill tone={hoursTone(r.hours_after_due)}>{hoursLabel(r.hours_after_due)}</Pill>
                    {r.priority ? <Pill tone={PRIORITY_TONE[r.priority]}>{PRIORITY_LABEL[r.priority]} only</Pill> : <Pill tone="tone-muted">any priority</Pill>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5 text-[11px]">
                    <span className="text-muted">Notify</span>
                    {r.notify.map((t) => <span key={t} className="pill tone-neutral">{humanize(t)}</span>)}
                    <span className="text-muted">·</span>
                    <span className="pill tone-muted">{humanize(r.kind)}</span>
                    {r.respect_quiet_hours ? <span className="text-muted">· respects quiet hours</span> : <span className="text-warn">· ignores quiet hours</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Toggle on={r.enabled} onChange={(v) => toggle(r, v)} size="sm" disabled={!!busy} />
                  <Button variant="ghost" size="sm" icon onClick={() => setEdit(r)} aria-label="Edit"><Pencil size={14} /></Button>
                  <Button variant="ghost" size="sm" icon onClick={() => remove(r)} aria-label="Delete" className="text-danger"><Trash2 size={14} /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="px-[var(--s4)] pb-[var(--s3)] pt-2 text-[11px] text-muted space-y-1">
          <div className="flex items-start gap-2"><Info size={13} className="shrink-0 mt-0.5" /><span>Rules run top to bottom every 15 minutes. Negative hours are reminders before the deadline; they only fire while the task is not yet due. Critical tasks ignore quiet hours; critical and urgent overdue alerts are delivered as <em>critical</em> notifications.</span></div>
          <div className="flex items-start gap-2"><Workflow size={13} className="shrink-0 mt-0.5" /><span>Need something richer — e.g. “critical Support ticket → open an IT escalation task”? Build it in <Link href="/automations" className="link">Automations</Link>.</span></div>
        </div>
      </Card>

      <RecentEscalations />

      {edit && <RuleEditor rule={edit === "new" ? null : edit} nextPosition={sorted.length} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RuleEditor({ rule, nextPosition, onClose }: { rule: Rule | null; nextPosition: number; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [name, setName] = React.useState(rule?.name || "");
  const [priority, setPriority] = React.useState<string>(rule?.priority || "");
  const [when, setWhen] = React.useState<"before" | "at" | "after">(rule ? (rule.hours_after_due < 0 ? "before" : rule.hours_after_due === 0 ? "at" : "after") : "after");
  const [hours, setHours] = React.useState<number>(rule ? Math.abs(rule.hours_after_due) || 24 : 24);
  const [notify, setNotify] = React.useState<string[]>(rule?.notify || ["assignee"]);
  const [kind, setKind] = React.useState<Kind>(rule?.kind || "deadline");
  const [quiet, setQuiet] = React.useState(rule?.respect_quiet_hours ?? true);
  const [enabled, setEnabled] = React.useState(rule?.enabled ?? true);
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.push("Name the rule", "danger"); return; }
    if (notify.length === 0) { toast.push("Choose at least one person to notify", "danger"); return; }
    const h = when === "at" ? 0 : when === "before" ? -Math.abs(hours || 0) : Math.abs(hours || 0);
    if (when !== "at" && h === 0) { toast.push("Hours must be greater than zero", "danger"); return; }
    setBusy(true);
    const sb = createClient();
    const payload = { name: name.trim(), priority: (priority || null) as TaskPriority | null, hours_after_due: h, notify, kind, respect_quiet_hours: quiet, enabled };
    const { error } = rule
      ? await sb.from("escalation_rules").update(payload).eq("id", rule.id)
      : await sb.from("escalation_rules").insert({ ...payload, org_id: profile.org_id!, position: nextPosition });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(rule ? "Rule updated" : "Rule added", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={rule ? "Edit escalation rule" : "New escalation rule"} width={560} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}>{rule ? "Save" : "Add rule"}</Button></>}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Overdue 24h: notify manager & owner" required /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Applies to">
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Any priority</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]} only</option>)}
            </Select>
          </Field>
          <Field label="Timing">
            <Select value={when} onChange={(e) => setWhen(e.target.value as typeof when)}>
              <option value="before">Before due (reminder)</option>
              <option value="at">At due time</option>
              <option value="after">After due (overdue)</option>
            </Select>
          </Field>
          <Field label="Hours"><Input type="number" min={1} value={when === "at" ? 0 : hours} disabled={when === "at"} onChange={(e) => setHours(Math.max(0, parseInt(e.target.value, 10) || 0))} /></Field>
        </div>
        <div>
          <span className="label">Notify</span>
          <div className="flex flex-wrap gap-1.5">
            {TARGETS.map((t) => {
              const on = notify.includes(t.key);
              return <button type="button" key={t.key} title={t.hint} onClick={() => setNotify((s) => (on ? s.filter((x) => x !== t.key) : [...s, t.key]))} className={cn("pill pill-lg", on ? "tone-brand" : "tone-neutral")}>{t.label}</button>;
            })}
          </div>
        </div>
        <Field label="Notification kind" hint="Critical / urgent overdue alerts are always delivered as critical.">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {NOTIFICATION_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Toggle on={quiet} onChange={setQuiet} label="Respect quiet hours" hint="Hold until the recipient's quiet hours end (critical tasks break through)." />
          <Toggle on={enabled} onChange={setEnabled} label="Enabled" />
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function RecentEscalations() {
  const [tick, setTick] = React.useState(0);
  const [data, setData] = React.useState<{ tick: number; rows: LogRow[] } | null>(null);
  const loading = !data || data.tick !== tick;
  React.useEffect(() => {
    let alive = true;
    createClient()
      .from("audit_logs")
      .select("id,summary,created_at,task_id,new_value")
      .eq("action", "escalation.sent")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data: rows }) => alive && setData({ tick, rows: (rows || []) as LogRow[] }));
    return () => { alive = false; };
  }, [tick]);
  const rows = data?.rows || [];
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><ScrollText size={16} /> Recent escalations</span>} subtitle="The last 20 alerts the ladder sent." action={<Button variant="ghost" size="sm" icon onClick={() => setTick((t) => t + 1)} aria-label="Refresh"><RefreshCw size={14} className={cn(loading && "animate-spin")} /></Button>} />
      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-[var(--s5)]"><Spinner /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Siren size={18} />} title="Nothing escalated yet" hint="When a task slips past a rule's threshold, the alert is logged here." />
      ) : (
        <div className="divide-y">
          {rows.map((r) => {
            const nv = r.new_value && typeof r.new_value === "object" && !Array.isArray(r.new_value) ? (r.new_value as Record<string, Json | undefined>) : {};
            const targets = Array.isArray(nv.targets) ? nv.targets.length : 0;
            return (
              <div key={r.id} className="flex items-center gap-3 px-[var(--s3)] sm:px-[var(--s4)] py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{r.task_id ? <Link href={`/tasks/${r.task_id}`} className="hover:underline">{r.summary || "Escalation"}</Link> : r.summary || "Escalation"}</span>
                  <span className="block text-[11px] text-muted">{targets ? `${targets} recipient${targets === 1 ? "" : "s"}` : ""}</span>
                </span>
                <span className="text-[11px] text-muted num shrink-0" title={fmtDate(r.created_at, true)}>{ago(r.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
