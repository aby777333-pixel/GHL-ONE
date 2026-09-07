"use client";

import * as React from "react";
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, Palmtree, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { APPROVAL_STATUS_LABEL, APPROVAL_STATUS_TONE, cn, isLeadPlus, isManagerPlus, fmtDate } from "@/lib/utils";
import { addDays, dayLabel, hhmm, istDay, weekStart, type RosterRow, type Shift, type ShiftSwap } from "./attendanceUtils";

type Person = { user_id: string; full_name: string; department_id: string | null };

export function RosterTab({ shifts, initialSwaps }: { shifts: Shift[]; initialSwaps: ShiftSwap[] }) {
  const { profile, departments, people } = useSession();
  const toast = useToast();
  const today = istDay();
  const manager = isManagerPlus(profile.role);
  const lead = isLeadPlus(profile.role);
  const [start, setStart] = React.useState(() => weekStart(today));
  const [dept, setDept] = React.useState(profile.department_id || "");
  const [rows, setRows] = React.useState<RosterRow[] | null>(null);
  const [swaps, setSwaps] = React.useState<ShiftSwap[]>(initialSwaps);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [swapOpen, setSwapOpen] = React.useState<string | null>(null); // day
  const [busy, setBusy] = React.useState<string | null>(null);
  const [version, setVersion] = React.useState(0);

  const days = React.useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const end = days[6];

  React.useEffect(() => {
    let alive = true;
    const t = setTimeout(() => setRows(null), 0);
    createClient().rpc("roster", { p_from: start, p_to: end, p_department: dept || undefined }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { toast.push(error.message, "danger"); setRows([]); return; }
      setRows((data || []) as RosterRow[]);
    });
    return () => { alive = false; clearTimeout(t); };
  }, [start, end, dept, version, toast]);

  const persons = React.useMemo<Person[]>(() => {
    const m = new Map<string, Person>();
    for (const r of rows || []) if (!m.has(r.user_id)) m.set(r.user_id, { user_id: r.user_id, full_name: r.full_name, department_id: r.department_id });
    return [...m.values()].sort((a, b) => (a.user_id === profile.id ? -1 : b.user_id === profile.id ? 1 : a.full_name.localeCompare(b.full_name)));
  }, [rows, profile.id]);
  const cell = (uid: string, day: string) => (rows || []).find((r) => r.user_id === uid && r.day === day);
  const myShiftOn = (day: string) => cell(profile.id, day);

  async function reloadSwaps() {
    const { data } = await createClient().from("shift_swaps").select("*").order("created_at", { ascending: false }).limit(60);
    setSwaps((data || []) as ShiftSwap[]);
  }

  async function decideSwap(s: ShiftSwap, status: "approved" | "rejected") {
    setBusy(s.id);
    const supabase = createClient();
    const { error } = await supabase.from("shift_swaps").update({ status, decided_by: profile.id, decided_at: new Date().toISOString() }).eq("id", s.id);
    if (!error && status === "approved" && manager && profile.org_id) {
      // Apply the swap as one-day assignments (managers only — the swap row itself is just the request).
      const inserts = [];
      if (s.to_shift_id) inserts.push({ org_id: profile.org_id, user_id: s.requester_id, shift_id: s.to_shift_id, starts_on: s.day, ends_on: s.day, note: "Shift swap", created_by: profile.id });
      if (s.with_user_id && s.from_shift_id) inserts.push({ org_id: profile.org_id, user_id: s.with_user_id, shift_id: s.from_shift_id, starts_on: s.day, ends_on: s.day, note: "Shift swap", created_by: profile.id });
      if (inserts.length) {
        const { error: e2 } = await supabase.from("shift_assignments").insert(inserts);
        if (e2) toast.push(`Approved, but the roster was not updated: ${e2.message}`, "danger");
      }
    }
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push(status === "approved" ? "Swap approved" : "Swap declined", status === "approved" ? "success" : "info");
    await reloadSwaps();
    setVersion((v) => v + 1);
  }

  const pending = swaps.filter((s) => s.status === "pending");
  const shiftName = (id: string | null) => shifts.find((s) => s.id === id)?.name || "—";

  return (
    <div className="space-y-[var(--s3)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 card p-0.5">
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week"><ChevronLeft size={15} /></button>
          <span className="text-sm num px-1 whitespace-nowrap">{dayLabel(start, { day: "numeric", month: "short" })} – {dayLabel(end, { day: "numeric", month: "short" })}</span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setStart(addDays(start, 7))} aria-label="Next week"><ChevronRight size={15} /></button>
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setStart(weekStart(today))}>This week</button>
        {lead && <DepartmentPicker value={dept} onChange={setDept} placeholder="All departments" className="h-8 text-sm w-auto min-w-[160px]" />}
        <span className="ml-auto flex items-center gap-2">
          {myShiftOn(today) || persons.some((p) => p.user_id === profile.id) ? <Button size="sm" variant="secondary" onClick={() => setSwapOpen(today)}><ArrowLeftRight size={14} /> Request swap</Button> : null}
          {manager && <Button size="sm" variant="primary" onClick={() => setAssignOpen(true)}><Plus size={14} /> Assign shift</Button>}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {shifts.filter((s) => s.active).map((s) => (
          <span key={s.id} className="pill tone-neutral" title={`${s.kind} · days ${s.days.join(",")}`}><span className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.name} <span className="num text-muted">{hhmm(s.start_time)}–{hhmm(s.end_time)}</span></span>
        ))}
      </div>

      <Card>
        {!rows ? (
          <div className="p-[var(--s4)] space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8 w-2/3" /></div>
        ) : persons.length === 0 ? (
          <EmptyState title="No shifts on the roster this week" hint={manager ? "Assign a shift to put people on the grid." : "Your department has no shift assignments yet — ask your manager."} action={manager ? <Button size="sm" variant="primary" onClick={() => setAssignOpen(true)}><Plus size={14} /> Assign shift</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-[11px] text-muted">
                <tr className="border-b">
                  <th className="text-left font-medium px-[var(--s4)] py-2 w-[200px]">Person</th>
                  {days.map((d) => <th key={d} className={cn("text-center font-medium px-1 py-2", d === today && "text-[var(--brand-2)]")}>{dayLabel(d, { weekday: "short" })}<span className="block num text-[var(--fg)]">{Number(d.slice(-2))}</span></th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {persons.map((p) => (
                  <tr key={p.user_id} className={cn("row-hover", p.user_id === profile.id && "bg-[var(--info-bg)]/40")}>
                    <td className="px-[var(--s4)] py-1.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <Avatar name={p.full_name} src={people.find((x) => x.id === p.user_id)?.avatar_url} size={24} />
                        <span className="truncate">{p.full_name}{p.user_id === profile.id ? " (you)" : ""}</span>
                        <Blink zone={`user:${p.user_id}`} />
                      </span>
                      <span className="block text-[11px] text-muted pl-8 truncate">{departments.find((d) => d.id === p.department_id)?.name || ""}</span>
                    </td>
                    {days.map((d) => {
                      const c = cell(p.user_id, d);
                      return (
                        <td key={d} className={cn("px-1 py-1.5 text-center align-middle", d === today && "bg-[var(--neutral-bg)]/60")}>
                          {c ? (
                            <button
                              type="button"
                              disabled={p.user_id !== profile.id}
                              onClick={() => setSwapOpen(d)}
                              className={cn("inline-flex flex-col items-center rounded-[var(--radius-sm)] px-1.5 py-1 min-w-[72px] text-[11px] leading-tight border", c.on_leave ? "tone-orange border-transparent" : "border-transparent", p.user_id === profile.id && "hover:border-[var(--line-strong)]")}
                              style={c.on_leave ? undefined : { background: `color-mix(in oklab, ${c.color} 16%, var(--bg-elev))`, color: "var(--fg)" }}
                              title={c.on_leave ? "On approved leave" : `${c.shift_name} · ${hhmm(c.start_time)}–${hhmm(c.end_time)}${p.user_id === profile.id ? " · click to request a swap" : ""}`}
                            >
                              {c.on_leave ? <span className="inline-flex items-center gap-1"><Palmtree size={10} /> Leave</span> : <><span className="font-medium truncate max-w-[88px]">{c.shift_name}</span><span className="num text-muted">{hhmm(c.start_time)}–{hhmm(c.end_time)}</span></>}
                            </button>
                          ) : (
                            <span className="text-muted">·</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(lead || swaps.length > 0) && (
        <Card>
          <CardHeader title={lead ? "Swap requests" : "My swap requests"} subtitle={pending.length ? `${pending.length} pending` : "Nothing pending"} />
          {swaps.length === 0 ? (
            <EmptyState title="No swap requests" className="py-[var(--s4)]" />
          ) : (
            <div className="px-[var(--s3)] pb-[var(--s3)] space-y-1">
              {swaps.slice(0, 20).map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] row-hover flex-wrap">
                  <PersonChip id={s.requester_id} size={22} />
                  <span className="text-sm num">{dayLabel(s.day)}</span>
                  <span className="text-xs text-muted">{shiftName(s.from_shift_id)} → <span className="text-[var(--fg)]">{shiftName(s.to_shift_id)}</span></span>
                  {s.with_user_id && <span className="text-xs text-muted inline-flex items-center gap-1">with <PersonChip id={s.with_user_id} size={16} /></span>}
                  <Pill tone={APPROVAL_STATUS_TONE[s.status]}>{APPROVAL_STATUS_LABEL[s.status]}</Pill>
                  {s.reason && <span className="text-xs text-muted truncate w-full sm:w-auto sm:flex-1">{s.reason}</span>}
                  {s.status === "pending" && lead && s.requester_id !== profile.id && (
                    <span className="flex items-center gap-1 ml-auto">
                      <Button size="xs" variant="success" loading={busy === s.id} onClick={() => decideSwap(s, "approved")}><Check size={12} /> Approve</Button>
                      <Button size="xs" variant="ghost" disabled={busy === s.id} onClick={() => decideSwap(s, "rejected")}><X size={12} /> Decline</Button>
                    </span>
                  )}
                  {s.status !== "pending" && s.decided_at && <span className="text-[11px] text-muted ml-auto">{fmtDate(s.decided_at)}</span>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <AssignShiftModal open={assignOpen} onClose={() => setAssignOpen(false)} shifts={shifts} defaultDept={dept} onDone={() => { setAssignOpen(false); setVersion((v) => v + 1); }} />
      <SwapModal open={!!swapOpen} day={swapOpen || today} onClose={() => setSwapOpen(null)} shifts={shifts} current={swapOpen ? myShiftOn(swapOpen) : undefined} peers={persons.filter((p) => p.user_id !== profile.id)} onDone={() => { setSwapOpen(null); reloadSwaps(); }} />
    </div>
  );
}

function AssignShiftModal({ open, onClose, shifts, defaultDept, onDone }: { open: boolean; onClose: () => void; shifts: Shift[]; defaultDept: string; onDone: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Assign a shift" width={480}>
      {open && <AssignShiftForm shifts={shifts} defaultDept={defaultDept} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}
function AssignShiftForm({ shifts, defaultDept, onClose, onDone }: { shifts: Shift[]; defaultDept: string; onClose: () => void; onDone: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [user, setUser] = React.useState("");
  const [shift, setShift] = React.useState(shifts[0]?.id || "");
  const [from, setFrom] = React.useState(() => istDay());
  const [to, setTo] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !shift || !from) return toast.push("Pick a person, a shift and a start date", "danger");
    if (to && to < from) return toast.push("End date must be after the start", "danger");
    setBusy(true);
    const { error } = await createClient().from("shift_assignments").insert({ org_id: profile.org_id!, user_id: user, shift_id: shift, starts_on: from, ends_on: to || null, note: note.trim() || null, created_by: profile.id });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Shift assigned", "success");
    onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Person"><PersonPicker value={user} onChange={setUser} departmentId={defaultDept || undefined} placeholder="Choose a person" /></Field>
      <Field label="Shift">
        <Select value={shift} onChange={(e) => setShift(e.target.value)}>
          {shifts.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name} · {hhmm(s.start_time)}–{hhmm(s.end_time)}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required /></Field>
        <Field label="Until" hint="Leave empty for ongoing"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></Field>
      <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Assign</Button></div>
    </form>
  );
}

function SwapModal({ open, day, onClose, shifts, current, peers, onDone }: { open: boolean; day: string; onClose: () => void; shifts: Shift[]; current?: RosterRow; peers: Person[]; onDone: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={<span className="inline-flex items-center gap-2"><ArrowLeftRight size={15} className="text-muted" /> Request a shift swap</span>} width={480}>
      {open && <SwapForm day={day} shifts={shifts} current={current} peers={peers} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}
function SwapForm({ day: initialDay, shifts, current, peers, onClose, onDone }: { day: string; shifts: Shift[]; current?: RosterRow; peers: Person[]; onClose: () => void; onDone: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [day, setDay] = React.useState(initialDay);
  const [to, setTo] = React.useState(() => shifts.find((s) => s.id !== current?.shift_id)?.id || "");
  const [withUser, setWithUser] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!day || !to) return toast.push("Pick a day and the shift you want", "danger");
    setBusy(true);
    const { error } = await createClient().from("shift_swaps").insert({ org_id: profile.org_id!, requester_id: profile.id, with_user_id: withUser || null, day, from_shift_id: current?.shift_id || null, to_shift_id: to, reason: reason.trim() || null });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Swap requested — your lead will review it", "success");
    onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Day"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} required /></Field>
      <div className="text-xs text-muted">Current: <span className="text-[var(--fg)] font-medium">{current ? `${current.shift_name} · ${hhmm(current.start_time)}–${hhmm(current.end_time)}` : "no shift on this day"}</span></div>
      <Field label="Swap to">
        <Select value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Choose a shift</option>
          {shifts.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name} · {hhmm(s.start_time)}–{hhmm(s.end_time)}</option>)}
        </Select>
      </Field>
      <Field label="Swap with" hint="Optional — a colleague who takes your current shift">
        <Select value={withUser} onChange={(e) => setWithUser(e.target.value)}>
          <option value="">Nobody in particular</option>
          {peers.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
        </Select>
      </Field>
      <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 56 }} placeholder="Why the swap helps" /></Field>
      <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Request swap</Button></div>
    </form>
  );
}
