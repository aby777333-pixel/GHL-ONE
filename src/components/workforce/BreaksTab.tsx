"use client";

import * as React from "react";
import { Coffee, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, Field, Input, Modal, Pill, Select, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { Switch } from "@/components/admin/AdminBits";
import { Blink } from "@/components/providers/ActivityProvider";
import { cn, slugify } from "@/lib/utils";
import type { BreakPolicy, BreakType, ShiftLite } from "./lib";

/* ------------------------------------------------------------ types */
type TypeDraft = { id?: string; key: string; name: string; max_minutes: number; paid: boolean; requires_note: boolean; active: boolean; sort_order: number; color: string };
const EMPTY_TYPE: TypeDraft = { key: "", name: "", max_minutes: 15, paid: true, requires_note: false, active: true, sort_order: 10, color: "#f59e0b" };

function TypeForm({ draft, onClose, onSaved }: { draft: TypeDraft; onClose: () => void; onSaved: (row: BreakType) => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [d, setD] = React.useState(draft);
  const [busy, setBusy] = React.useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d.name.trim()) return toast.push("Give the break type a name", "danger");
    setBusy(true);
    const supabase = createClient();
    const payload = { key: d.key.trim() || slugify(d.name), name: d.name.trim(), max_minutes: Math.max(1, d.max_minutes), paid: d.paid, requires_note: d.requires_note, active: d.active, sort_order: d.sort_order, color: d.color };
    const { data, error } = d.id
      ? await supabase.from("break_types").update(payload).eq("id", d.id).select("*").single()
      : await supabase.from("break_types").insert({ ...payload, org_id: profile.org_id! }).select("*").single();
    setBusy(false);
    if (error || !data) return toast.push(error?.message || "Could not save", "danger");
    toast.push("Break type saved", "success");
    onSaved(data as BreakType);
    onClose();
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name"><Input value={d.name} onChange={(e) => setD((s) => ({ ...s, name: e.target.value }))} placeholder="Lunch" required autoFocus /></Field>
        <Field label="Key" hint="Stable identifier; leave blank to derive from the name"><Input value={d.key} onChange={(e) => setD((s) => ({ ...s, key: e.target.value }))} placeholder="lunch" disabled={!!d.id} /></Field>
        <Field label="Max minutes"><Input type="number" min={1} value={d.max_minutes} onChange={(e) => setD((s) => ({ ...s, max_minutes: Number(e.target.value) }))} required /></Field>
        <Field label="Sort order"><Input type="number" value={d.sort_order} onChange={(e) => setD((s) => ({ ...s, sort_order: Number(e.target.value) }))} /></Field>
      </div>
      <div className="space-y-2">
        <Switch on={d.paid} onChange={(v) => setD((s) => ({ ...s, paid: v }))} label="Paid" hint="Counts as working time for payroll" />
        <Switch on={d.requires_note} onChange={(v) => setD((s) => ({ ...s, requires_note: v }))} label="Requires a short note" hint="e.g. errands out of office" />
        <Switch on={d.active} onChange={(v) => setD((s) => ({ ...s, active: v }))} label="Active" hint="Inactive types are hidden from the break picker" />
      </div>
      <div className="flex items-center justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div>
    </form>
  );
}

/* ---------------------------------------------------------- policies */
type PolicyDraft = { id?: string; department_id: string; shift_id: string; max_total_minutes: number; max_count: number; min_available: number; block_when_uncovered: boolean; note: string };
const EMPTY_POLICY: PolicyDraft = { department_id: "", shift_id: "", max_total_minutes: 75, max_count: 4, min_available: 1, block_when_uncovered: false, note: "" };

function PolicyForm({ draft, shifts, onClose, onSaved }: { draft: PolicyDraft; shifts: ShiftLite[]; onClose: () => void; onSaved: (row: BreakPolicy) => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [d, setD] = React.useState(draft);
  const [busy, setBusy] = React.useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = createClient();
    const payload = { department_id: d.department_id || null, shift_id: d.shift_id || null, max_total_minutes: Math.max(0, d.max_total_minutes), max_count: Math.max(0, d.max_count), min_available: Math.max(0, d.min_available), block_when_uncovered: d.block_when_uncovered, note: d.note.trim() || null };
    const { data, error } = d.id
      ? await supabase.from("break_policies").update(payload).eq("id", d.id).select("*").single()
      : await supabase.from("break_policies").insert({ ...payload, org_id: profile.org_id! }).select("*").single();
    setBusy(false);
    if (error || !data) return toast.push(error?.message?.includes("unique") ? "A policy for that department / shift already exists — edit it instead." : error?.message || "Could not save", "danger");
    toast.push("Break policy saved", "success");
    onSaved(data as BreakPolicy);
    onClose();
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Department" hint="Blank = company default"><DepartmentPicker value={d.department_id} onChange={(v) => setD((s) => ({ ...s, department_id: v }))} placeholder="Company default" /></Field>
        <Field label="Shift" hint="Blank = all shifts">
          <Select value={d.shift_id} onChange={(e) => setD((s) => ({ ...s, shift_id: e.target.value }))}>
            <option value="">All shifts</option>
            {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Max total minutes / day"><Input type="number" min={0} value={d.max_total_minutes} onChange={(e) => setD((s) => ({ ...s, max_total_minutes: Number(e.target.value) }))} required /></Field>
        <Field label="Max breaks / day"><Input type="number" min={0} value={d.max_count} onChange={(e) => setD((s) => ({ ...s, max_count: Number(e.target.value) }))} required /></Field>
        <Field label="Minimum people who must stay available" className="sm:col-span-2"><Input type="number" min={0} value={d.min_available} onChange={(e) => setD((s) => ({ ...s, min_available: Number(e.target.value) }))} required /></Field>
      </div>
      <Switch on={d.block_when_uncovered} onChange={(v) => setD((s) => ({ ...s, block_when_uncovered: v }))} label="Block the break when the department would be uncovered" hint="Off = warn the person and notify the on-duty lead; on = the break cannot start" />
      <Field label="Note"><Textarea value={d.note} onChange={(e) => setD((s) => ({ ...s, note: e.target.value }))} style={{ minHeight: 48 }} placeholder="Shown to admins only" /></Field>
      <div className="flex items-center justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div>
    </form>
  );
}

/* --------------------------------------------------------------- tab */
export function BreaksTab({ initialTypes, initialPolicies, shifts, canEdit }: { initialTypes: BreakType[]; initialPolicies: BreakPolicy[]; shifts: ShiftLite[]; canEdit: boolean }) {
  const { departments } = useSession();
  const toast = useToast();
  const [types, setTypes] = React.useState(initialTypes);
  const [policies, setPolicies] = React.useState(initialPolicies);
  const [typeDraft, setTypeDraft] = React.useState<TypeDraft | null>(null);
  const [policyDraft, setPolicyDraft] = React.useState<PolicyDraft | null>(null);
  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name || "—" : "Company default");
  const shiftName = (id: string | null) => (id ? shifts.find((s) => s.id === id)?.name || "—" : "All shifts");

  async function toggleActive(t: BreakType) {
    const { error } = await createClient().from("break_types").update({ active: !t.active }).eq("id", t.id);
    if (error) return toast.push(error.message, "danger");
    setTypes((l) => l.map((x) => (x.id === t.id ? { ...x, active: !t.active } : x)));
  }
  async function removePolicy(p: BreakPolicy) {
    if (!p.department_id && !p.shift_id) return toast.push("The company default policy cannot be removed — edit it instead", "danger");
    if (!confirm(`Remove the policy for ${deptName(p.department_id)} / ${shiftName(p.shift_id)}?`)) return;
    const { error } = await createClient().from("break_policies").delete().eq("id", p.id);
    if (error) return toast.push(error.message, "danger");
    setPolicies((l) => l.filter((x) => x.id !== p.id));
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-[var(--s3)] items-start">
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><Coffee size={15} className="text-muted" /> Break types</span>} subtitle="What people pick when they start a break. The limit drives the “break time is up” nudge." action={canEdit && <Button size="sm" onClick={() => setTypeDraft({ ...EMPTY_TYPE, sort_order: (types.at(-1)?.sort_order || 0) + 1 })}><Plus size={14} /> Type</Button>} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="text-[11px] text-muted uppercase tracking-wide">
              <tr className="border-t border-b">
                <th className="text-left font-medium px-[var(--s4)] py-1.5">Name</th>
                <th className="text-right font-medium px-2 py-1.5 num">Max</th>
                <th className="text-left font-medium px-2 py-1.5">Paid</th>
                <th className="text-left font-medium px-2 py-1.5">Note</th>
                <th className="text-left font-medium px-2 py-1.5">Active</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {types.map((t) => (
                <tr key={t.id} className={cn("row-hover", !t.active && "opacity-60")}>
                  <td className="px-[var(--s4)] py-1.5"><span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />{t.name}<span className="text-[11px] text-muted">{t.key}</span></span></td>
                  <td className="px-2 py-1.5 num text-right">{t.max_minutes}m</td>
                  <td className="px-2 py-1.5">{t.paid ? <Pill tone="tone-success">Paid</Pill> : <Pill tone="tone-neutral">Unpaid</Pill>}</td>
                  <td className="px-2 py-1.5 text-muted">{t.requires_note ? "Required" : "—"}</td>
                  <td className="px-2 py-1.5">{canEdit ? <Switch size="sm" on={t.active} onChange={() => toggleActive(t)} /> : <Pill tone={t.active ? "tone-success" : "tone-muted"}>{t.active ? "Yes" : "No"}</Pill>}</td>
                  <td className="px-2 py-1.5 text-right">{canEdit && <button className="btn btn-ghost btn-xs btn-icon" aria-label="Edit" onClick={() => setTypeDraft({ id: t.id, key: t.key, name: t.name, max_minutes: t.max_minutes, paid: t.paid, requires_note: t.requires_note, active: t.active, sort_order: t.sort_order, color: t.color })}><Pencil size={13} /></button>}</td>
                </tr>
              ))}
              {types.length === 0 && <tr><td colSpan={6} className="px-[var(--s4)] py-3 text-xs text-muted">No break types yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-muted" /> Break policies</span>} subtitle="Limits per department or shift. The most specific policy wins; the company default applies otherwise." action={canEdit && <Button size="sm" onClick={() => setPolicyDraft(EMPTY_POLICY)}><Plus size={14} /> Policy</Button>} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="text-[11px] text-muted uppercase tracking-wide">
              <tr className="border-t border-b">
                <th className="text-left font-medium px-[var(--s4)] py-1.5">Scope</th>
                <th className="text-right font-medium px-2 py-1.5 num">Total / day</th>
                <th className="text-right font-medium px-2 py-1.5 num">Count</th>
                <th className="text-right font-medium px-2 py-1.5 num">Min available</th>
                <th className="text-left font-medium px-2 py-1.5">Uncovered</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {policies.map((p) => (
                <tr key={p.id} className="row-hover">
                  <td className="px-[var(--s4)] py-1.5"><span className="inline-flex items-center gap-1.5">{deptName(p.department_id)}{p.department_id && <Blink zone={`dept:${p.department_id}`} />}</span><span className="block text-[11px] text-muted">{shiftName(p.shift_id)}{p.note ? ` · ${p.note}` : ""}</span></td>
                  <td className="px-2 py-1.5 num text-right">{p.max_total_minutes}m</td>
                  <td className="px-2 py-1.5 num text-right">{p.max_count}</td>
                  <td className="px-2 py-1.5 num text-right">{p.min_available}</td>
                  <td className="px-2 py-1.5">{p.block_when_uncovered ? <Pill tone="tone-danger">Block</Pill> : <Pill tone="tone-warn">Warn</Pill>}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {canEdit && (
                      <>
                        <button className="btn btn-ghost btn-xs btn-icon" aria-label="Edit" onClick={() => setPolicyDraft({ id: p.id, department_id: p.department_id || "", shift_id: p.shift_id || "", max_total_minutes: p.max_total_minutes, max_count: p.max_count, min_available: p.min_available, block_when_uncovered: p.block_when_uncovered, note: p.note || "" })}><Pencil size={13} /></button>
                        {(p.department_id || p.shift_id) && <button className="btn btn-ghost btn-xs btn-icon text-danger" aria-label="Remove" onClick={() => removePolicy(p)}><Trash2 size={13} /></button>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {policies.length === 0 && <tr><td colSpan={6} className="px-[var(--s4)] py-3 text-xs text-muted">No policies yet — the built-in defaults apply (75 minutes, 4 breaks, 1 person available).</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-[var(--s4)] py-[var(--s3)] border-t text-[11px] text-muted">Breaks are always self-reported. Over-limit breaks nudge the person first, then the manager; nothing is measured from the device.</div>
      </Card>

      <Modal open={!!typeDraft} onClose={() => setTypeDraft(null)} title={typeDraft?.id ? "Edit break type" : "New break type"} width={520}>
        {typeDraft && <TypeForm key={typeDraft.id || "new"} draft={typeDraft} onClose={() => setTypeDraft(null)} onSaved={(row) => setTypes((l) => (l.some((x) => x.id === row.id) ? l.map((x) => (x.id === row.id ? row : x)) : [...l, row].sort((a, b) => a.sort_order - b.sort_order)))} />}
      </Modal>
      <Modal open={!!policyDraft} onClose={() => setPolicyDraft(null)} title={policyDraft?.id ? "Edit break policy" : "New break policy"} width={560}>
        {policyDraft && <PolicyForm key={policyDraft.id || "new"} draft={policyDraft} shifts={shifts} onClose={() => setPolicyDraft(null)} onSaved={(row) => setPolicies((l) => (l.some((x) => x.id === row.id) ? l.map((x) => (x.id === row.id ? row : x)) : [...l, row]))} />}
      </Modal>
    </div>
  );
}
