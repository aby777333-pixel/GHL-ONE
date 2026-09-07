"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Eye, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { cn } from "@/lib/utils";
import { ATT_STATUS_LABEL, CORRECTABLE_STATUSES, addDays, dayLabel, fmtMinutes } from "@/components/attendance/attendanceUtils";
import { EXCEPTION_KINDS, EXCEPTION_LABEL, EXCEPTION_TONE, type ExceptionRow, type PatternRow } from "./lib";

type Target = { user_id: string; full_name: string; day: string; kind: string };

/** Inline correction: reuses the audited `correct_attendance` RPC (same as the attendance Corrections tab). */
function CorrectModal({ target, onClose, onDone }: { target: Target | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [status, setStatus] = React.useState<string>("present");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || !note.trim()) return toast.push("A reason is required — the employee sees it", "danger");
    setBusy(true);
    const { error } = await createClient().rpc("correct_attendance", { p_user: target.user_id, p_day: target.day, p_status: status, p_note: note.trim() });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push(`Marked ${dayLabel(target.day)} as ${ATT_STATUS_LABEL[status]} for ${target.full_name}`, "success");
    setNote("");
    onDone();
    onClose();
  }
  return (
    <Modal open={!!target} onClose={onClose} title={target ? `Correct ${dayLabel(target.day)} · ${target.full_name}` : ""} width={480}>
      {target && (
        <form onSubmit={submit} className="space-y-3">
          <div className="text-xs text-muted">Flagged as <Pill tone={EXCEPTION_TONE[target.kind]}>{EXCEPTION_LABEL[target.kind] || target.kind}</Pill>. Every correction is audited and shown to the employee with your note.</div>
          <Field label="Day should be">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {CORRECTABLE_STATUSES.map((s) => <option key={s} value={s}>{ATT_STATUS_LABEL[s]}</option>)}
            </Select>
          </Field>
          <Field label="Reason" hint="Shown to the employee"><Textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 64 }} placeholder="e.g. Confirmed on site by team lead; forgot to clock in" required autoFocus /></Field>
          <div className="flex items-center justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}><ShieldCheck size={14} /> Apply correction</Button></div>
        </form>
      )}
    </Modal>
  );
}

export function ExceptionsTab({ today, canCorrect }: { today: string; canCorrect: boolean }) {
  const toast = useToast();
  const { departments } = useSession();
  const [from, setFrom] = React.useState(addDays(today, -7));
  const [to, setTo] = React.useState(today);
  const [dept, setDept] = React.useState("");
  const [kind, setKind] = React.useState("");
  const [tick, setTick] = React.useState(0);
  const [loaded, setLoaded] = React.useState<{ key: string; rows: ExceptionRow[]; patterns: PatternRow[] } | null>(null);
  const [target, setTarget] = React.useState<Target | null>(null);
  const key = JSON.stringify([from, to, dept, tick]);
  const loading = !loaded || loaded.key !== key;

  React.useEffect(() => {
    if (!from || !to || from > to) return;
    let alive = true;
    const supabase = createClient();
    const args = { p_from: from, p_to: to, p_department: dept || undefined };
    Promise.all([supabase.rpc("attendance_exceptions", args), supabase.rpc("attendance_patterns", args)]).then(([ex, pat]) => {
      if (!alive) return;
      if (ex.error) toast.push(ex.error.message, "danger");
      setLoaded({ key, rows: (ex.data || []) as ExceptionRow[], patterns: ((pat.data || []) as PatternRow[]).filter((p) => p.total >= 3) });
    });
    return () => { alive = false; };
  }, [from, to, dept, key, toast]);

  const rows = (loaded?.rows || []).filter((r) => !kind || r.kind === kind);
  const byDay = React.useMemo(() => {
    const m = new Map<string, ExceptionRow[]>();
    for (const r of rows) { if (!m.has(r.day)) m.set(r.day, []); m.get(r.day)!.push(r); }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);
  const counts = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of loaded?.rows || []) c[r.kind] = (c[r.kind] || 0) + 1;
    return c;
  }, [loaded]);
  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name || "—";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-[var(--s3)] items-start">
      <div className="space-y-[var(--s3)] min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-8 text-sm w-auto" aria-label="From" />
          <span className="text-xs text-muted">to</span>
          <Input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-8 text-sm w-auto" aria-label="To" />
          <DepartmentPicker value={dept} onChange={setDept} placeholder="All departments" className="h-8 text-sm w-auto min-w-[160px]" />
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="h-8 text-sm w-auto">
            <option value="">All kinds</option>
            {EXCEPTION_KINDS.map((k) => <option key={k} value={k}>{EXCEPTION_LABEL[k]}</option>)}
          </Select>
          <div className="flex gap-1 ml-auto">
            <button className="btn btn-ghost btn-xs" onClick={() => { setFrom(addDays(today, -7)); setTo(today); }}>7 days</button>
            <button className="btn btn-ghost btn-xs" onClick={() => { setFrom(addDays(today, -30)); setTo(today); }}>30 days</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EXCEPTION_KINDS.map((k) => (
            <button key={k} type="button" onClick={() => setKind(kind === k ? "" : k)} className={cn("pill cursor-pointer", EXCEPTION_TONE[k], kind && kind !== k && "opacity-50")}>{EXCEPTION_LABEL[k]} <span className="num font-semibold ml-1">{counts[k] || 0}</span></button>
          ))}
        </div>

        {loading ? (
          <Card className="p-[var(--s4)] space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8 w-2/3" /></Card>
        ) : byDay.length === 0 ? (
          <Card><EmptyState icon={<AlertTriangle size={18} />} title="No exceptions" hint="Nothing to flag in this range. Late, early leave, missing check-out, short day, excess break and absent days would appear here." /></Card>
        ) : (
          byDay.map(([day, list]) => (
            <Card key={day}>
              <CardHeader title={dayLabel(day, { weekday: "long", day: "numeric", month: "long" })} subtitle={`${list.length} exception${list.length === 1 ? "" : "s"}`} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-[11px] text-muted uppercase tracking-wide">
                    <tr className="border-t border-b">
                      <th className="text-left font-medium px-[var(--s4)] py-1.5">Person</th>
                      <th className="text-left font-medium px-2 py-1.5">Department</th>
                      <th className="text-left font-medium px-2 py-1.5">Kind</th>
                      <th className="text-left font-medium px-2 py-1.5">Detail</th>
                      <th className="text-right font-medium px-2 py-1.5 num">Minutes</th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {list.map((r, i) => (
                      <tr key={`${r.user_id}-${r.kind}-${i}`} className="row-hover">
                        <td className="px-[var(--s4)] py-1.5"><Link href={`/people/${r.user_id}`} className="inline-flex items-center gap-1.5 hover:underline">{r.full_name}<Blink zone={`user:${r.user_id}`} /></Link></td>
                        <td className="px-2 py-1.5 text-muted">{deptName(r.department_id)}</td>
                        <td className="px-2 py-1.5"><Pill tone={EXCEPTION_TONE[r.kind] || "tone-neutral"}>{EXCEPTION_LABEL[r.kind] || r.kind}</Pill></td>
                        <td className="px-2 py-1.5 text-muted">{r.detail}</td>
                        <td className="px-2 py-1.5 num text-right">{r.minutes != null ? fmtMinutes(r.minutes) : "—"}</td>
                        <td className="px-2 py-1.5 text-right">{canCorrect && <button className="btn btn-ghost btn-xs" onClick={() => setTarget({ user_id: r.user_id, full_name: r.full_name, day: r.day, kind: r.kind })}>Correct</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))
        )}
        <div className="text-[11px] text-muted">Thresholds (grace, early leave, short day, break limit) come from the Settings tab. Corrections go through the audited correction flow and are always shown to the employee.</div>
      </div>

      {/* Patterns */}
      <Card className="min-w-0">
        <CardHeader title="Patterns" subtitle="People with 3 or more exceptions in this range" />
        {loading ? (
          <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2"><Skeleton className="h-6" /><Skeleton className="h-6 w-2/3" /></div>
        ) : (loaded?.patterns.length || 0) === 0 ? (
          <div className="px-[var(--s4)] pb-[var(--s4)] text-xs text-muted">No repeated exceptions. Good sign.</div>
        ) : (
          <ul className="divide-y border-t">
            {loaded!.patterns.map((p) => (
              <li key={p.user_id} className="px-[var(--s4)] py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/people/${p.user_id}`} className="text-sm font-medium truncate hover:underline inline-flex items-center gap-1.5">{p.full_name}<Blink zone={`user:${p.user_id}`} /></Link>
                  <span className="pill tone-neutral num">{p.total}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {p.late > 0 && <span className={cn("pill", EXCEPTION_TONE.late)}>{p.late} late</span>}
                  {p.early_leave > 0 && <span className={cn("pill", EXCEPTION_TONE.early_leave)}>{p.early_leave} early</span>}
                  {p.missing_checkout > 0 && <span className={cn("pill", EXCEPTION_TONE.missing_checkout)}>{p.missing_checkout} no check-out</span>}
                  {p.short_day > 0 && <span className={cn("pill", EXCEPTION_TONE.short_day)}>{p.short_day} short</span>}
                  {p.excess_break > 0 && <span className={cn("pill", EXCEPTION_TONE.excess_break)}>{p.excess_break} break</span>}
                  {p.absent > 0 && <span className={cn("pill", EXCEPTION_TONE.absent)}>{p.absent} absent</span>}
                </div>
                <div className="text-[11px] text-muted mt-0.5">{deptName(p.department_id)}</div>
              </li>
            ))}
          </ul>
        )}
        <div className="px-[var(--s4)] py-[var(--s3)] border-t text-[11px] text-muted flex items-start gap-1.5"><Eye size={12} className="shrink-0 mt-0.5" /> Each person sees exactly the same exceptions about themselves in their Privacy Center and attendance page. Talk to people before drawing conclusions — this is a prompt, not a verdict.</div>
      </Card>

      <CorrectModal target={target} onClose={() => setTarget(null)} onDone={() => setTick((t) => t + 1)} />
    </div>
  );
}
