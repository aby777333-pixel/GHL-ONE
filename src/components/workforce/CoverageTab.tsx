"use client";

import * as React from "react";
import { CalendarRange, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Skeleton, useToast } from "@/components/ui";
import { DepartmentPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { cn } from "@/lib/utils";
import { addDays, dayLabel, hhmm, isoWeekday } from "@/components/attendance/attendanceUtils";
import { RISK_LABEL, RISK_TONE, WEEKDAY_SHORT, type CoverageRequirement, type ForecastRow } from "./lib";

const RISK_BG: Record<string, string> = { ok: "var(--success)", thin: "var(--warn)", uncovered: "var(--danger)", weekend: "var(--line-strong)" };

/* ---------------------------------------------------------- forecast */
function Forecast({ today, dept }: { today: string; dept: string }) {
  const toast = useToast();
  const [start, setStart] = React.useState(today);
  const [loaded, setLoaded] = React.useState<{ key: string; rows: ForecastRow[] } | null>(null);
  const [picked, setPicked] = React.useState<ForecastRow | null>(null);
  const end = addDays(start, 13);
  const key = `${start}|${dept}`;
  const loading = !loaded || loaded.key !== key;

  React.useEffect(() => {
    let alive = true;
    createClient().rpc("coverage_forecast", { p_from: start, p_to: addDays(start, 13), p_department: dept || undefined }).then(({ data, error }) => {
      if (!alive) return;
      if (error) toast.push(error.message, "danger");
      setLoaded({ key: `${start}|${dept}`, rows: (data || []) as ForecastRow[] });
    });
    return () => { alive = false; };
  }, [start, dept, toast]);

  const days = React.useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(start, i)), [start]);
  const depts = React.useMemo(() => {
    const m = new Map<string, { id: string; name: string; cells: Map<string, ForecastRow> }>();
    for (const r of loaded?.rows || []) {
      if (!m.has(r.department_id)) m.set(r.department_id, { id: r.department_id, name: r.name, cells: new Map() });
      m.get(r.department_id)!.cells.set(r.day, r);
    }
    return [...m.values()];
  }, [loaded]);
  const risky = (loaded?.rows || []).filter((r) => r.risk === "uncovered" || r.risk === "thin");

  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><CalendarRange size={15} className="text-muted" /> 14-day coverage forecast</span>}
        subtitle="Expected people minus approved/pending leave vs the minimum. Tap a cell to see who is away."
        action={<span className="inline-flex items-center gap-1"><button className="btn btn-ghost btn-xs" onClick={() => setStart(addDays(start, -14))}>Prev</button><button className="btn btn-ghost btn-xs" onClick={() => setStart(today)} disabled={start === today}>Today</button><button className="btn btn-ghost btn-xs" onClick={() => setStart(addDays(start, 14))}>Next</button></span>}
      />
      <div className="px-[var(--s4)] pb-[var(--s3)]">
        {loading ? (
          <Skeleton className="h-40" />
        ) : depts.length === 0 ? (
          <EmptyState title="No departments in scope" className="py-4" />
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs min-w-[720px] w-full">
              <thead>
                <tr>
                  <th className="text-left font-medium text-muted pb-1 pr-2 sticky left-0 bg-[var(--bg-elev)]">Department</th>
                  {days.map((d) => <th key={d} className={cn("font-medium pb-1 px-0.5 text-center num", d === today && "text-[var(--brand-2)]")}>{WEEKDAY_SHORT[isoWeekday(d) - 1]}<br /><span className="text-muted">{d.slice(-2)}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {depts.map((dp) => (
                  <tr key={dp.id}>
                    <td className="pr-2 py-0.5 whitespace-nowrap sticky left-0 bg-[var(--bg-elev)]"><span className="inline-flex items-center gap-1.5">{dp.name}<Blink zone={`dept:${dp.id}`} /></span></td>
                    {days.map((d) => {
                      const c = dp.cells.get(d);
                      const risk = c?.risk || "weekend";
                      return (
                        <td key={d} className="px-0.5 py-0.5">
                          <button
                            type="button"
                            onClick={() => c && setPicked(picked === c ? null : c)}
                            title={c ? `${dayLabel(d)} · ${RISK_LABEL[risk]} · ${c.expected - c.on_leave} of ${c.expected} expected (min ${c.required})${c.absentees.length ? ` · away: ${c.absentees.join(", ")}` : ""}` : dayLabel(d)}
                            className={cn("w-full h-8 rounded-[4px] border num text-[11px] transition-transform hover:scale-[1.06]", picked === c && c && "ring-2 ring-[var(--fg)]")}
                            style={{ background: `color-mix(in oklab, ${RISK_BG[risk]} ${risk === "weekend" ? 18 : 34}%, var(--bg-elev))`, borderColor: RISK_BG[risk] }}
                          >
                            {c && risk !== "weekend" ? c.expected - c.on_leave : ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-muted">
          {(["ok", "thin", "uncovered", "weekend"] as const).map((r) => <span key={r} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: RISK_BG[r] }} />{RISK_LABEL[r]}</span>)}
          <span className="ml-auto">{start === end ? start : `${dayLabel(start)} – ${dayLabel(end)}`}</span>
        </div>
        {picked && (
          <div className="mt-3 rounded-[var(--radius-sm)] border sunken p-3 anim-pop text-sm">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-medium">{picked.name} · {dayLabel(picked.day, { weekday: "long", day: "numeric", month: "long" })}</span>
              <Pill tone={RISK_TONE[picked.risk] || "tone-neutral"}>{RISK_LABEL[picked.risk] || picked.risk}</Pill>
            </div>
            <div className="text-xs text-muted mt-1">{picked.expected - picked.on_leave} of {picked.expected} expected · minimum {picked.required} · {picked.on_leave} away</div>
            {picked.absentees.length > 0 ? <div className="text-xs mt-1">Away: {picked.absentees.join(", ")}</div> : <div className="text-xs mt-1 text-muted">Nobody on leave.</div>}
          </div>
        )}
        {risky.length > 0 && !picked && (
          <div className="mt-3 text-xs text-muted">{risky.filter((r) => r.risk === "uncovered").length} uncovered and {risky.filter((r) => r.risk === "thin").length} thin day{risky.length === 1 ? "" : "s"} in this window. Leave approvals show these collisions automatically.</div>
        )}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------- requirements */
type Draft = { id?: string; department_id: string; label: string; days: number[]; from_time: string; to_time: string; min_people: number; max_leave_same_day: number | null };
const EMPTY: Draft = { department_id: "", label: "Business hours", days: [1, 2, 3, 4, 5], from_time: "09:30", to_time: "18:30", min_people: 1, max_leave_same_day: 1 };

function RequirementModal({ draft, onClose, onSaved }: { draft: Draft | null; onClose: () => void; onSaved: (row: CoverageRequirement) => void }) {
  return (
    <Modal open={!!draft} onClose={onClose} title={draft?.id ? "Edit coverage requirement" : "New coverage requirement"} width={520}>
      {draft && <RequirementForm key={draft.id || "new"} draft={draft} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function RequirementForm({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: (row: CoverageRequirement) => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [d, setD] = React.useState<Draft>(draft);
  const [busy, setBusy] = React.useState(false);
  const toggleDay = (n: number) => setD((s) => ({ ...s, days: s.days.includes(n) ? s.days.filter((x) => x !== n) : [...s.days, n].sort() }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d.department_id) return toast.push("Pick a department", "danger");
    if (!d.days.length) return toast.push("Pick at least one day", "danger");
    setBusy(true);
    const supabase = createClient();
    const payload = { department_id: d.department_id, label: d.label.trim() || null, days: d.days, from_time: d.from_time, to_time: d.to_time, min_people: Math.max(0, d.min_people), max_leave_same_day: d.max_leave_same_day };
    const q = d.id
      ? supabase.from("coverage_requirements").update(payload).eq("id", d.id).select("*").single()
      : supabase.from("coverage_requirements").insert({ ...payload, org_id: profile.org_id! }).select("*").single();
    const { data, error } = await q;
    setBusy(false);
    if (error || !data) return toast.push(error?.message || "Could not save", "danger");
    toast.push("Coverage requirement saved", "success");
    onSaved(data as CoverageRequirement);
    onClose();
  }

  return (
      <form onSubmit={save} className="space-y-3">
        <Field label="Department"><DepartmentPicker value={d.department_id} onChange={(v) => setD((s) => ({ ...s, department_id: v }))} placeholder="Choose a department" allowEmpty /></Field>
        <Field label="Label"><Input value={d.label} onChange={(e) => setD((s) => ({ ...s, label: e.target.value }))} placeholder="Business hours" /></Field>
        <div>
          <div className="label">Days</div>
          <div className="flex flex-wrap gap-1">{WEEKDAY_SHORT.map((w, i) => <button key={w} type="button" onClick={() => toggleDay(i + 1)} className={cn("pill cursor-pointer", d.days.includes(i + 1) ? "tone-brand" : "tone-neutral")}>{w}</button>)}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><Input type="time" value={d.from_time} onChange={(e) => setD((s) => ({ ...s, from_time: e.target.value }))} required /></Field>
          <Field label="To"><Input type="time" value={d.to_time} onChange={(e) => setD((s) => ({ ...s, to_time: e.target.value }))} required /></Field>
          <Field label="Minimum people available"><Input type="number" min={0} value={d.min_people} onChange={(e) => setD((s) => ({ ...s, min_people: Number(e.target.value) }))} required /></Field>
          <Field label="Max on leave the same day" hint="Blank = no limit"><Input type="number" min={0} value={d.max_leave_same_day ?? ""} onChange={(e) => setD((s) => ({ ...s, max_leave_same_day: e.target.value === "" ? null : Number(e.target.value) }))} /></Field>
        </div>
        <div className="flex items-center justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div>
      </form>
  );
}

export function CoverageTab({ today, initialRequirements, canEdit }: { today: string; initialRequirements: CoverageRequirement[]; canEdit: boolean }) {
  const { departments } = useSession();
  const toast = useToast();
  const [dept, setDept] = React.useState("");
  const [rows, setRows] = React.useState<CoverageRequirement[]>(initialRequirements);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name || "—";

  async function remove(r: CoverageRequirement) {
    if (!confirm(`Remove "${r.label || "requirement"}" for ${deptName(r.department_id)}?`)) return;
    const { error } = await createClient().from("coverage_requirements").delete().eq("id", r.id);
    if (error) return toast.push(error.message, "danger");
    setRows((l) => l.filter((x) => x.id !== r.id));
  }
  const visible = dept ? rows.filter((r) => r.department_id === dept) : rows;

  return (
    <div className="space-y-[var(--s3)]">
      <div className="flex flex-wrap items-center gap-2">
        <DepartmentPicker value={dept} onChange={setDept} placeholder="All departments" className="h-8 text-sm w-auto min-w-[160px]" />
        {canEdit && <Button size="sm" variant="primary" className="ml-auto" onClick={() => setDraft({ ...EMPTY, department_id: dept })}><Plus size={14} /> Requirement</Button>}
      </div>
      <Forecast today={today} dept={dept} />

      <Card>
        <CardHeader title="Coverage requirements" subtitle="Minimum people available per department during a window. Drives the live shortfall, the forecast and leave collision warnings." />
        {visible.length === 0 ? (
          <div className="px-[var(--s4)] pb-[var(--s4)] text-xs text-muted">No requirements yet{canEdit ? " — add one to start tracking coverage." : "."}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-[11px] text-muted uppercase tracking-wide">
                <tr className="border-t border-b">
                  <th className="text-left font-medium px-[var(--s4)] py-1.5">Department</th>
                  <th className="text-left font-medium px-2 py-1.5">Label</th>
                  <th className="text-left font-medium px-2 py-1.5">Days</th>
                  <th className="text-left font-medium px-2 py-1.5 num">Window</th>
                  <th className="text-right font-medium px-2 py-1.5 num">Min people</th>
                  <th className="text-right font-medium px-2 py-1.5 num">Max leave / day</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((r) => (
                  <tr key={r.id} className="row-hover">
                    <td className="px-[var(--s4)] py-1.5"><span className="inline-flex items-center gap-1.5">{deptName(r.department_id)}<Blink zone={`dept:${r.department_id}`} /></span></td>
                    <td className="px-2 py-1.5 text-muted">{r.label || "—"}</td>
                    <td className="px-2 py-1.5"><span className="flex flex-wrap gap-0.5">{r.days.slice().sort().map((d) => <span key={d} className="pill tone-neutral">{WEEKDAY_SHORT[d - 1]}</span>)}</span></td>
                    <td className="px-2 py-1.5 num">{hhmm(r.from_time)} – {hhmm(r.to_time)}</td>
                    <td className="px-2 py-1.5 num text-right">{r.min_people}</td>
                    <td className="px-2 py-1.5 num text-right">{r.max_leave_same_day ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      {canEdit && (
                        <>
                          <button className="btn btn-ghost btn-xs btn-icon" aria-label="Edit" onClick={() => setDraft({ id: r.id, department_id: r.department_id, label: r.label || "", days: r.days, from_time: hhmm(r.from_time), to_time: hhmm(r.to_time), min_people: r.min_people, max_leave_same_day: r.max_leave_same_day })}><Pencil size={13} /></button>
                          <button className="btn btn-ghost btn-xs btn-icon text-danger" aria-label="Remove" onClick={() => remove(r)}><Trash2 size={13} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <RequirementModal draft={draft} onClose={() => setDraft(null)} onSaved={(row) => setRows((l) => (l.some((x) => x.id === row.id) ? l.map((x) => (x.id === row.id ? row : x)) : [...l, row]))} />
    </div>
  );
}
