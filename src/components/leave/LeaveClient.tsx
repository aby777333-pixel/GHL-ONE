"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Palmtree, Plus, X, Users, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, PageHeader, Pill, Tabs, Textarea, useToast } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink, useSeen } from "@/components/providers/ActivityProvider";
import { APPROVAL_STATUS_LABEL, APPROVAL_STATUS_TONE, cn, fmtDate, isAdminRole, isLeadPlus, isManagerPlus } from "@/lib/utils";
import { addDays, dayLabel, istDay } from "@/components/attendance/attendanceUtils";
import { ApplyLeaveModal } from "./ApplyLeaveModal";
import { fmtDays, timelineFor, type Balance, type HandoverTask, type Holiday, type LeaveRow, type LeaveType } from "./leaveUtils";

export type LeaveData = {
  balances: Balance[];
  types: LeaveType[];
  mine: LeaveRow[];
  team: LeaveRow[];
  holidays: Holiday[];
  tasks: HandoverTask[];
  canApproveLeave: boolean;
  canHr: boolean;
};

type TabKey = "mine" | "team";

export function LeaveClient({ data, initialTab }: { data: LeaveData; initialTab?: string }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  useSeen("nav:/leave");
  const today = istDay();
  const iAmManagerOf = data.team.some((l) => l.manager_id === profile.id);
  const manager = isManagerPlus(profile.role) || data.canApproveLeave || iAmManagerOf;
  const hr = isAdminRole(profile.role) || data.canHr || data.canApproveLeave;
  const showTeam = manager || hr || isLeadPlus(profile.role);
  const [tab, setTab] = React.useState<TabKey>(initialTab === "team" && showTeam ? "team" : "mine");
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [noteFor, setNoteFor] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");

  const typeOf = (l: LeaveRow) => data.types.find((t) => t.id === l.leave_type_id);
  const typeName = (l: LeaveRow) => typeOf(l)?.name || l.kind.replace(/_/g, " ");
  const range = (l: LeaveRow) => `${fmtDate(l.starts_on)}${l.ends_on !== l.starts_on ? ` → ${fmtDate(l.ends_on)}` : ""}${l.half_day ? " · half day" : ""}`;

  /** Manager step vs HR step for a pending request. */
  const stage = (l: LeaveRow): "manager" | "hr" | null => {
    if (l.status !== "pending") return null;
    if (l.manager_decision !== "approved") return "manager";
    return typeOf(l)?.requires_hr ? "hr" : null;
  };
  const canDecide = (l: LeaveRow) => {
    const s = stage(l);
    if (!s || l.user_id === profile.id) return false;
    if (s === "manager") return isManagerPlus(profile.role) || l.manager_id === profile.id || data.canApproveLeave;
    return hr;
  };

  async function decide(l: LeaveRow, decision: "approved" | "rejected", decisionNote?: string) {
    const s = stage(l);
    if (!s) return;
    setBusy(l.id);
    const patch = s === "manager" ? { manager_decision: decision, decision_note: decisionNote || null } : { hr_decision: decision, decision_note: decisionNote || null };
    const { error } = await createClient().from("leaves").update(patch).eq("id", l.id);
    setBusy(null);
    setNoteFor(null);
    setNote("");
    if (error) return toast.push(error.message, "danger");
    toast.push(decision === "approved" ? (s === "manager" && typeOf(l)?.requires_hr ? "Approved — now with HR" : "Leave approved") : "Leave declined", decision === "approved" ? "success" : "info");
    router.refresh();
  }
  async function cancel(l: LeaveRow) {
    if (!window.confirm("Withdraw this request?")) return;
    setBusy(l.id);
    const { error } = await createClient().from("leaves").update({ status: "rejected", decision_note: "Withdrawn by employee" }).eq("id", l.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push("Request withdrawn", "info");
    router.refresh();
  }

  const pendingTeam = data.team.filter((l) => l.status === "pending" && l.user_id !== profile.id).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const actionable = pendingTeam.filter(canDecide);
  const decidedTeam = data.team.filter((l) => l.status !== "pending" && l.user_id !== profile.id).sort((a, b) => b.starts_on.localeCompare(a.starts_on)).slice(0, 15);
  const upcomingHolidays = data.holidays.filter((h) => h.starts_at.slice(0, 10) >= today).slice(0, 8);
  const pastHolidays = data.holidays.filter((h) => h.starts_at.slice(0, 10) < today).length;

  const tabs: { key: TabKey; label: React.ReactNode; count?: number }[] = [
    { key: "mine", label: "My requests", count: data.mine.filter((l) => l.status === "pending").length || undefined },
    ...(showTeam ? [{ key: "team" as const, label: <span className="inline-flex items-center gap-1.5">Team requests <Blink zone="nav:/leave" /></span>, count: actionable.length || undefined }] : []),
  ];

  return (
    <div className="page">
      <PageHeader eyebrow="Workforce" title="Leave" subtitle="Balances, requests and who is away — with handover built in." actions={<Button variant="primary" onClick={() => setApplyOpen(true)}><Plus size={15} /> Apply for leave</Button>} />

      {/* Balances */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-[var(--s2)] mb-[var(--s4)] stagger">
        {data.balances.map((b) => {
          const unlimited = b.remaining == null;
          const pct = unlimited || !Number(b.allocated) ? 0 : Math.min(100, (Number(b.used) / Number(b.allocated)) * 100);
          return (
            <div key={b.leave_type_id} className="card px-[var(--s3)] py-[var(--s3)] min-w-0 relative overflow-hidden">
              <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: b.color }} />
              <div className="flex items-center justify-between gap-1"><div className="eyebrow truncate">{b.name}</div><span className="pill tone-neutral text-[10px]">{b.code}</span></div>
              <div className="text-[1.4rem] font-semibold num leading-tight mt-1">{unlimited ? "∞" : fmtDays(b.remaining)}</div>
              <div className="text-[11px] text-muted truncate">{unlimited ? `${fmtDays(b.used)} used` : `${fmtDays(b.used)} used of ${fmtDays(b.allocated)}`}{Number(b.pending) > 0 ? ` · ${fmtDays(b.pending)} pending` : ""}</div>
              {!unlimited && <div className="h-1 rounded-full sunken mt-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: b.color }} /></div>}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-[var(--s3)] items-start">
        <div className="min-w-0 space-y-[var(--s3)]">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />

          {tab === "mine" && (
            <Card>
              <CardHeader title="My requests" subtitle={data.mine.length ? `${data.mine.length} request${data.mine.length === 1 ? "" : "s"} this year` : undefined} />
              {data.mine.length === 0 ? (
                <EmptyState icon={<Palmtree size={18} />} title="No leave requests yet" hint="Apply above — your manager is notified instantly and you will see each step here." action={<Button size="sm" variant="primary" onClick={() => setApplyOpen(true)}><Plus size={14} /> Apply for leave</Button>} />
              ) : (
                <div className="divide-y border-t">
                  {data.mine.map((l) => (
                    <div key={l.id} className="px-[var(--s4)] py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: typeOf(l)?.color || "var(--line-strong)" }} />
                        <span className="text-sm font-medium">{typeName(l)}</span>
                        <span className="text-sm num text-2">{range(l)}</span>
                        <span className="text-xs text-muted num">{fmtDays(l.days)}d</span>
                        <Pill tone={APPROVAL_STATUS_TONE[l.status]}>{APPROVAL_STATUS_LABEL[l.status]}</Pill>
                        {l.status === "pending" && <Button size="xs" variant="ghost" className="ml-auto" loading={busy === l.id} onClick={() => cancel(l)}>Withdraw</Button>}
                      </div>
                      {l.note && <div className="text-xs text-muted mt-1">{l.note}</div>}
                      <Timeline leave={l} requiresHr={!!typeOf(l)?.requires_hr} />
                      {l.handover && (l.handover as { backup_user_id?: string }).backup_user_id && (
                        <div className="text-[11px] text-muted mt-1.5 inline-flex items-center gap-1.5"><Users size={11} /> Backup: <PersonChip id={(l.handover as { backup_user_id: string }).backup_user_id} size={14} /> · {((l.handover as { items?: unknown[] }).items || []).length} task(s) handed over{(l.handover as { restored_at?: string }).restored_at ? " · returned" : ""}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {tab === "team" && showTeam && (
            <>
              <Card>
                <CardHeader title="Awaiting a decision" subtitle={actionable.length ? `${actionable.length} for you` : pendingTeam.length ? `${pendingTeam.length} pending elsewhere` : "Nothing pending"} />
                {pendingTeam.length === 0 ? (
                  <EmptyState title="No pending requests" className="py-[var(--s4)]" />
                ) : (
                  <div className="divide-y border-t">
                    {pendingTeam.map((l) => {
                      const s = stage(l);
                      const mine = canDecide(l);
                      return (
                        <div key={l.id} className={cn("px-[var(--s4)] py-3", !mine && "opacity-70")}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <PersonChip id={l.user_id} size={22} />
                            <Blink zone={`user:${l.user_id}`} />
                            <span className="text-sm">{typeName(l)}</span>
                            <span className="text-sm num text-2">{range(l)}</span>
                            <span className="text-xs text-muted num">{fmtDays(l.days)}d</span>
                            <Pill tone={s === "hr" ? "tone-violet" : "tone-warn"}>{s === "hr" ? "With HR" : "Manager step"}</Pill>
                            {mine && (
                              <span className="flex items-center gap-1 ml-auto">
                                <Button size="xs" variant="success" loading={busy === l.id} onClick={() => decide(l, "approved")}><Check size={12} /> Approve</Button>
                                <Button size="xs" variant="ghost" disabled={busy === l.id} onClick={() => { setNoteFor(noteFor === l.id ? null : l.id); setNote(""); }}><X size={12} /> Decline</Button>
                              </span>
                            )}
                          </div>
                          {l.note && <div className="text-xs text-muted mt-1">“{l.note}”</div>}
                          {noteFor === l.id && (
                            <div className="mt-2 flex items-end gap-2">
                              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tell them why (optional)" style={{ minHeight: 44 }} className="flex-1" />
                              <Button size="sm" variant="danger" loading={busy === l.id} onClick={() => decide(l, "rejected", note.trim() || undefined)}>Decline</Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
              <Card>
                <CardHeader title="Recently decided" />
                {decidedTeam.length === 0 ? <EmptyState title="Nothing yet" className="py-[var(--s4)]" /> : (
                  <div className="px-[var(--s3)] pb-[var(--s3)] space-y-1">
                    {decidedTeam.map((l) => (
                      <div key={l.id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm flex-wrap rounded-[var(--radius-sm)] row-hover">
                        <PersonChip id={l.user_id} size={20} />
                        <span className="text-muted">{typeName(l)}</span>
                        <span className="num">{range(l)}</span>
                        <Pill tone={APPROVAL_STATUS_TONE[l.status]}>{APPROVAL_STATUS_LABEL[l.status]}</Pill>
                        {l.decision_note && <span className="text-xs text-muted truncate w-full sm:w-auto sm:flex-1">{l.decision_note}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>

        <div className="space-y-[var(--s3)] min-w-0">
          <TeamStrip leaves={data.team.filter((l) => l.status === "approved")} today={today} typeColor={(l) => typeOf(l)?.color || "var(--warn)"} />
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Sparkles size={15} className="text-muted" /> Holidays</span>} subtitle={upcomingHolidays.length ? `${upcomingHolidays.length} coming up` : pastHolidays ? "None left this year" : "No holidays published yet"} />
            {upcomingHolidays.length > 0 && (
              <ul className="px-[var(--s4)] pb-[var(--s4)] space-y-1.5">
                {upcomingHolidays.map((h) => (
                  <li key={h.id} className="flex items-center gap-2 text-sm">
                    <span className="w-[54px] shrink-0 text-xs num text-muted">{dayLabel(h.starts_at.slice(0, 10), { day: "numeric", month: "short" })}</span>
                    <span className="truncate flex-1">{h.title}</span>
                    <span className="text-[11px] text-muted">{dayLabel(h.starts_at.slice(0, 10), { weekday: "short" })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ApplyLeaveModal open={applyOpen} onClose={() => setApplyOpen(false)} types={data.types} balances={data.balances} tasks={data.tasks} onDone={() => { setApplyOpen(false); router.refresh(); }} />
    </div>
  );
}

function Timeline({ leave, requiresHr }: { leave: LeaveRow; requiresHr: boolean }) {
  const steps = timelineFor(leave, requiresHr);
  return (
    <ol className="flex items-center gap-1 mt-2 flex-wrap">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1">
          <span className={cn("inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5", s.state === "done" ? "tone-success" : s.state === "current" ? "tone-warn" : s.state === "rejected" ? "tone-danger" : "tone-muted")} title={s.note || (s.at ? fmtDate(s.at, true) : undefined)}>
            {s.state === "done" ? <Check size={10} /> : s.state === "rejected" ? <X size={10} /> : s.state === "current" ? <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> : null}
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="w-3 h-px bg-[var(--line-strong)]" />}
        </li>
      ))}
      {steps.some((s) => s.state === "rejected" && s.note) && <li className="text-[11px] text-muted w-full">{steps.find((s) => s.note)?.note}</li>}
    </ol>
  );
}

/** Three-week strip of approved leave across the team. */
function TeamStrip({ leaves, today, typeColor }: { leaves: LeaveRow[]; today: string; typeColor: (l: LeaveRow) => string }) {
  const { people } = useSession();
  const days = React.useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(today, i)), [today]);
  const end = days[20];
  const rows = React.useMemo(() => {
    const m = new Map<string, LeaveRow[]>();
    for (const l of leaves) {
      if (l.ends_on < today || l.starts_on > end) continue;
      if (!m.has(l.user_id)) m.set(l.user_id, []);
      m.get(l.user_id)!.push(l);
    }
    return [...m.entries()].map(([uid, ls]) => ({ uid, ls, person: people.find((p) => p.id === uid) })).sort((a, b) => (a.person?.full_name || "").localeCompare(b.person?.full_name || ""));
  }, [leaves, today, end, people]);

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><CalendarDays size={15} className="text-muted" /> Who&apos;s away</span>} subtitle={rows.length ? `Next 3 weeks · ${rows.length} ${rows.length === 1 ? "person" : "people"}` : "Nobody is away in the next 3 weeks"} />
      {rows.length > 0 && (
        <div className="overflow-x-auto px-[var(--s3)] pb-[var(--s3)]">
          <div className="min-w-[520px]">
            <div className="grid" style={{ gridTemplateColumns: "120px repeat(21, minmax(0, 1fr))" }}>
              <div />
              {days.map((d) => <div key={d} className={cn("text-center text-[9px] num text-muted", d === today && "text-[var(--brand-2)] font-semibold")}>{Number(d.slice(-2))}</div>)}
              {rows.map((r) => (
                <React.Fragment key={r.uid}>
                  <div className="flex items-center gap-1.5 pr-2 py-0.5 min-w-0"><Avatar name={r.person?.full_name} src={r.person?.avatar_url} size={16} /><span className="text-[11px] truncate">{r.person?.full_name?.split(" ")[0] || "—"}</span></div>
                  {days.map((d) => {
                    const l = r.ls.find((x) => d >= x.starts_on && d <= x.ends_on);
                    return <div key={d} className="py-0.5 px-px"><div className="h-4 rounded-sm" style={{ background: l ? typeColor(l) : "var(--bg-sunken)", opacity: l ? (l.half_day ? 0.5 : 0.9) : 1 }} title={l ? `${r.person?.full_name}: ${fmtDate(l.starts_on)} – ${fmtDate(l.ends_on)}` : undefined} /></div>;
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
