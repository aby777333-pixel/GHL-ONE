"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Check, CheckCircle2, Clock, HandHelping, ListChecks, Plus, RefreshCw, X, AlertTriangle, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Modal, Pill, Skeleton, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { ago, cn, fmtDate, fmtTime, relDate, type Tables } from "@/lib/utils";

type Handover = Tables<"shift_handovers">;
type CriticalTask = { id: string; title: string; status: string; assignee: string | null; due: string | null };
type PendingRequest = { id: string; title: string; status: string; priority: string; owner: string | null; requester: string | null };
type NextOnShift = { id: string; name: string; shift: string };
type Prep = { critical_tasks: CriticalTask[]; pending_requests: PendingRequest[]; next_on_shift: NextOnShift[] };

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function ShiftHandover({ openId }: { openId?: string | null }) {
  const { profile, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  useSeen("nav:/attendance");
  const [rows, setRows] = React.useState<Handover[] | null>(null);
  const [preparing, setPreparing] = React.useState(false);
  const [detail, setDetail] = React.useState<string | null>(openId || null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const dept = departments.find((d) => d.id === profile.department_id);

  const load = React.useCallback(async () => {
    const { data } = await createClient().from("shift_handovers").select("*").order("created_at", { ascending: false }).limit(100);
    setRows(data || []);
  }, []);
  React.useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const pendingForMe = (rows || []).filter((h) => h.to_user_id === profile.id && !h.acknowledged_at);
  const mineOpen = (rows || []).filter((h) => h.from_user_id === profile.id && !h.acknowledged_at);
  const history = (rows || []).filter((h) => !pendingForMe.includes(h));
  const open = detail ? (rows || []).find((h) => h.id === detail) || null : null;

  async function acknowledge(h: Handover) {
    setBusy(h.id);
    const { data, error } = await createClient().from("shift_handovers").update({ acknowledged_at: new Date().toISOString() }).eq("id", h.id).select("*").single();
    setBusy(null);
    if (error || !data) { toast.push(error?.message || "Could not acknowledge", "danger"); return; }
    setRows((s) => (s || []).map((x) => (x.id === h.id ? data : x)));
    toast.push("Acknowledged — the previous shift has been told.", "success");
    router.refresh();
  }
  function show(id: string | null) {
    setDetail(id);
    router.replace(id ? `/attendance?tab=handover&id=${id}` : "/attendance?tab=handover", { scroll: false });
  }

  return (
    <div className="space-y-[var(--s4)]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="h2 inline-flex items-center gap-2"><ArrowRightLeft size={18} className="text-muted" /> Shift handover</div>
          <div className="text-xs text-muted mt-0.5">Leave the next shift a clear picture: critical tasks, open requests, what to watch. They acknowledge; nothing falls between shifts.</div>
        </div>
        <Button variant="primary" onClick={() => setPreparing(true)} disabled={!profile.department_id} title={!profile.department_id ? "You need a department to hand over from" : undefined}><Plus size={15} /> Prepare handover</Button>
      </div>

      {rows === null ? (
        <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : (
        <>
          {pendingForMe.length > 0 && (
            <Card className="border-[var(--warn)]">
              <CardHeader title={<span className="inline-flex items-center gap-2"><HandHelping size={15} className="text-warn" /> Waiting for your acknowledgement</span>} subtitle="Read it, then acknowledge so the previous shift knows you have it." />
              <div className="divide-y border-t">
                {pendingForMe.map((h) => <HandoverRow key={h.id} h={h} onOpen={() => show(h.id)} action={<Button size="sm" variant="success" loading={busy === h.id} onClick={() => acknowledge(h)}><Check size={13} /> Acknowledge</Button>} />)}
              </div>
            </Card>
          )}
          {mineOpen.length > 0 && (
            <Card>
              <CardHeader title="Sent by you, not yet acknowledged" subtitle="They will get a notification. Nudge them if the shift has started." />
              <div className="divide-y border-t">{mineOpen.map((h) => <HandoverRow key={h.id} h={h} onOpen={() => show(h.id)} />)}</div>
            </Card>
          )}
          <Card>
            <CardHeader title="History" subtitle={dept ? `Handovers in ${dept.name}${history.length ? ` · ${history.length}` : ""}` : "Handovers you can see"} />
            {history.length === 0 ? (
              <EmptyState icon={<ArrowRightLeft size={18} />} title="No handovers yet" hint="At the end of a shift, prepare one — it pre-fills critical tasks and open requests for your department." className="py-[var(--s4)]" />
            ) : (
              <div className="divide-y border-t">{history.map((h) => <HandoverRow key={h.id} h={h} onOpen={() => show(h.id)} />)}</div>
            )}
          </Card>
        </>
      )}

      {preparing && profile.department_id && <PrepareModal departmentId={profile.department_id} onClose={() => setPreparing(false)} onCreated={(h) => { setPreparing(false); setRows((s) => [h, ...(s || [])]); show(h.id); router.refresh(); }} />}
      {open && <HandoverDetail h={open} onClose={() => show(null)} onAcknowledge={open.to_user_id === profile.id && !open.acknowledged_at ? () => acknowledge(open) : undefined} busy={busy === open.id} />}
    </div>
  );
}

function HandoverRow({ h, onOpen, action }: { h: Handover; onOpen: () => void; action?: React.ReactNode }) {
  const { people } = useSession();
  const from = people.find((p) => p.id === h.from_user_id);
  const to = people.find((p) => p.id === h.to_user_id);
  const crit = asArray<CriticalTask>(h.critical_tasks).length;
  const req = asArray<PendingRequest>(h.pending_requests).length;
  return (
    <div className="flex items-center gap-3 px-[var(--s4)] py-3">
      <div className="flex -space-x-2 shrink-0">
        <span className="rounded-full ring-2 ring-[var(--bg-elev)]"><Avatar name={from?.full_name} src={from?.avatar_url} size={30} /></span>
        <span className="rounded-full ring-2 ring-[var(--bg-elev)]"><Avatar name={to?.full_name} src={to?.avatar_url} size={30} /></span>
      </div>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="text-sm flex items-center gap-1.5 min-w-0 flex-wrap"><span className="font-medium truncate">{from?.full_name || "Someone"}</span><ArrowRightLeft size={12} className="text-muted" /><span className="font-medium truncate">{to?.full_name || "Unassigned"}</span></div>
        <div className="text-[11px] text-muted flex items-center gap-x-2 gap-y-0.5 flex-wrap mt-0.5 num">
          <span>{fmtDate(h.created_at)} {fmtTime(h.created_at)}</span>
          {crit > 0 && <span className="inline-flex items-center gap-1"><AlertTriangle size={10} /> {crit} critical</span>}
          {req > 0 && <span className="inline-flex items-center gap-1"><HandHelping size={10} /> {req} request{req === 1 ? "" : "s"}</span>}
          {h.open_issues && <span className="truncate max-w-[240px]">· {h.open_issues}</span>}
        </div>
      </button>
      {h.acknowledged_at ? <Pill tone="tone-success"><CheckCircle2 size={10} /> Ack {ago(h.acknowledged_at)}</Pill> : <Pill tone="tone-warn"><Clock size={10} /> Pending</Pill>}
      {action}
      <button onClick={onOpen} className="text-muted"><ChevronRight size={14} /></button>
    </div>
  );
}

function PrepareModal({ departmentId, onClose, onCreated }: { departmentId: string; onClose: () => void; onCreated: (h: Handover) => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [prep, setPrep] = React.useState<Prep | null>(null);
  const [tasks, setTasks] = React.useState<CriticalTask[]>([]);
  const [requests, setRequests] = React.useState<PendingRequest[]>([]);
  const [openIssues, setOpenIssues] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [toUser, setToUser] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const prepare = React.useCallback(async () => {
    setRefreshing(true);
    const { data, error } = await createClient().rpc("prepare_shift_handover", { p_department: departmentId });
    setRefreshing(false);
    if (error) { toast.push(error.message, "danger"); setPrep({ critical_tasks: [], pending_requests: [], next_on_shift: [] }); return; }
    const p = (data || {}) as Partial<Prep>;
    const next: Prep = { critical_tasks: asArray<CriticalTask>(p.critical_tasks), pending_requests: asArray<PendingRequest>(p.pending_requests), next_on_shift: asArray<NextOnShift>(p.next_on_shift) };
    setPrep(next);
    setTasks(next.critical_tasks);
    setRequests(next.pending_requests);
    setToUser((cur) => cur || next.next_on_shift[0]?.id || "");
  }, [departmentId, toast]);
  React.useEffect(() => {
    const t = setTimeout(() => void prepare(), 0);
    return () => clearTimeout(t);
  }, [prepare]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!toUser) { toast.push("Pick who is taking over.", "danger"); return; }
    setLoading(true);
    const { data, error } = await createClient().from("shift_handovers").insert({ org_id: profile.org_id!, department_id: departmentId, shift_id: profile.shift_id, from_user_id: profile.id, to_user_id: toUser, open_issues: openIssues.trim() || null, critical_tasks: tasks as unknown as Handover["critical_tasks"], pending_requests: requests as unknown as Handover["pending_requests"], notes: notes.trim() || null }).select("*").single();
    setLoading(false);
    if (error || !data) { toast.push(error?.message || "Could not send the handover", "danger"); return; }
    toast.push("Handover sent — they have been notified.", "success");
    onCreated(data);
  }

  return (
    <Modal open onClose={onClose} title="Prepare handover" width={680} side footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={loading} onClick={submit} disabled={!prep || !toUser}><ArrowRightLeft size={14} /> Hand over</Button>
      </>
    }>
      <form onSubmit={submit} className="space-y-[var(--s4)]">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted">Pre-filled from your department right now. Remove anything that is not relevant.</div>
          <Button type="button" size="xs" variant="ghost" onClick={prepare} loading={refreshing}><RefreshCw size={12} /> Refresh</Button>
        </div>
        {!prep ? (
          <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : (
          <>
            <section>
              <div className="eyebrow inline-flex items-center gap-1.5 mb-1.5"><AlertTriangle size={11} /> Critical tasks · {tasks.length}</div>
              {tasks.length === 0 ? <div className="text-sm text-muted">Nothing critical, blocked or waiting. Nice shift.</div> : (
                <ul className="space-y-1">
                  {tasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm border rounded-[var(--radius-sm)] px-2.5 py-1.5 min-w-0">
                      <Link href={`/tasks/${t.id}`} className="truncate flex-1 hover:underline">{t.title}</Link>
                      <Pill tone={t.status === "blocked" ? "tone-danger" : t.status === "waiting" ? "tone-warn" : "tone-neutral"}>{t.status.replace(/_/g, " ")}</Pill>
                      {t.assignee && <span className="text-[11px] text-muted truncate max-w-[110px] hidden sm:inline">{t.assignee}</span>}
                      {t.due && <span className="text-[11px] text-muted num hidden sm:inline">{relDate(t.due)}</span>}
                      <button type="button" className="text-muted hover:text-danger" onClick={() => setTasks((s) => s.filter((x) => x.id !== t.id))} aria-label="Remove"><X size={12} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <div className="eyebrow inline-flex items-center gap-1.5 mb-1.5"><HandHelping size={11} /> Open help requests · {requests.length}</div>
              {requests.length === 0 ? <div className="text-sm text-muted">No open requests for the department.</div> : (
                <ul className="space-y-1">
                  {requests.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-sm border rounded-[var(--radius-sm)] px-2.5 py-1.5 min-w-0">
                      <Link href={`/help/${r.id}`} className="truncate flex-1 hover:underline">{r.title}</Link>
                      <Pill tone={r.priority === "critical" || r.priority === "urgent" ? "tone-danger" : "tone-neutral"}>{r.priority}</Pill>
                      <span className="text-[11px] text-muted hidden sm:inline">{r.status}{r.owner ? ` · ${r.owner}` : " · unowned"}</span>
                      <button type="button" className="text-muted hover:text-danger" onClick={() => setRequests((s) => s.filter((x) => x.id !== r.id))} aria-label="Remove"><X size={12} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <Field label="Open issues" hint="What is unresolved, who is waiting on what, anything that could bite in the next hours."><Textarea value={openIssues} onChange={(e) => setOpenIssues(e.target.value)} style={{ minHeight: 90 }} placeholder="e.g. Client X's server restart is scheduled 22:00 — watch the monitoring channel." /></Field>
            <Field label="Notes" hint="Optional. Context, tips, anything useful."><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 70 }} /></Field>
            <Field label="Handing over to" hint={prep.next_on_shift.length ? `On the next shift: ${prep.next_on_shift.map((n) => `${n.name} (${n.shift})`).join(", ")}` : "Nobody is rostered next — pick a colleague."}>
              <div className="space-y-1.5">
                {prep.next_on_shift.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {prep.next_on_shift.map((n) => (
                      <button type="button" key={n.id} onClick={() => setToUser(n.id)} className={cn("pill pill-lg border transition-colors", toUser === n.id ? "tone-brand border-transparent" : "tone-neutral border-[var(--line)] hover:bg-[var(--line)]")}><Clock size={11} /> {n.name} · {n.shift}</button>
                    ))}
                  </div>
                )}
                <PersonPicker value={toUser} onChange={setToUser} departmentId={departmentId} placeholder="Pick a colleague" />
              </div>
            </Field>
          </>
        )}
      </form>
    </Modal>
  );
}

function HandoverDetail({ h, onClose, onAcknowledge, busy }: { h: Handover; onClose: () => void; onAcknowledge?: () => void; busy: boolean }) {
  const tasks = asArray<CriticalTask>(h.critical_tasks);
  const requests = asArray<PendingRequest>(h.pending_requests);
  return (
    <Modal open onClose={onClose} width={640} side title={<span className="inline-flex items-center gap-2 text-sm"><PersonChip id={h.from_user_id} size={20} /><ArrowRightLeft size={12} className="text-muted" /><PersonChip id={h.to_user_id} size={20} /></span>} footer={
      <>
        <span className="text-[11px] text-muted mr-auto num">{fmtDate(h.created_at)} {fmtTime(h.created_at)}</span>
        {h.acknowledged_at ? <Pill tone="tone-success"><CheckCircle2 size={10} /> Acknowledged {ago(h.acknowledged_at)}</Pill> : onAcknowledge ? <Button variant="success" loading={busy} onClick={onAcknowledge}><Check size={14} /> Acknowledge</Button> : <Pill tone="tone-warn"><Clock size={10} /> Awaiting acknowledgement</Pill>}
      </>
    }>
      <div className="space-y-[var(--s4)]">
        {h.open_issues && (
          <section>
            <div className="eyebrow inline-flex items-center gap-1.5 mb-1.5"><AlertTriangle size={11} /> Open issues</div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{h.open_issues}</p>
          </section>
        )}
        <section>
          <div className="eyebrow inline-flex items-center gap-1.5 mb-1.5"><ListChecks size={11} /> Critical tasks · {tasks.length}</div>
          {tasks.length === 0 ? <div className="text-sm text-muted">None flagged.</div> : (
            <ul className="space-y-1">{tasks.map((t) => <li key={t.id} className="flex items-center gap-2 text-sm min-w-0"><Link href={`/tasks/${t.id}`} className="truncate flex-1 hover:underline">{t.title}</Link><Pill tone={t.status === "blocked" ? "tone-danger" : t.status === "waiting" ? "tone-warn" : "tone-neutral"}>{t.status.replace(/_/g, " ")}</Pill>{t.due && <span className="text-[11px] text-muted num">{relDate(t.due)}</span>}</li>)}</ul>
          )}
        </section>
        <section>
          <div className="eyebrow inline-flex items-center gap-1.5 mb-1.5"><HandHelping size={11} /> Open help requests · {requests.length}</div>
          {requests.length === 0 ? <div className="text-sm text-muted">None open.</div> : (
            <ul className="space-y-1">{requests.map((r) => <li key={r.id} className="flex items-center gap-2 text-sm min-w-0"><Link href={`/help/${r.id}`} className="truncate flex-1 hover:underline">{r.title}</Link><Pill tone={r.priority === "critical" || r.priority === "urgent" ? "tone-danger" : "tone-neutral"}>{r.priority}</Pill><span className="text-[11px] text-muted">{r.status}</span></li>)}</ul>
          )}
        </section>
        {h.notes && (
          <section>
            <div className="eyebrow mb-1.5">Notes</div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed text-2">{h.notes}</p>
          </section>
        )}
      </div>
    </Modal>
  );
}
