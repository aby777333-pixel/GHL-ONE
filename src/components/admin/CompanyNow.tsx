"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, ArrowLeftRight, Building2, CheckCircle2, ChevronRight, Clock, History, LifeBuoy, RefreshCw, ShieldAlert, Sparkles, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Pill, Spinner } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { ago, cn, fmtDate, fmtTime, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, type ProjectStatus } from "@/lib/utils";
import { DeptStatusPill, Metric, Section } from "./AdminBits";
import { DepartmentFocus, DepartmentSwitcher } from "./DepartmentSwitcher";

/* ------------------------------------------------------------------ Types */
export type DeptNow = { id: string; name: string; slug: string; color: string; status: string; present: number; people: number; open: number; overdue: number; blocked: number; help_open: number };
export type CompanyNowData = {
  error?: string;
  people?: { total?: number; present?: number; remote?: number; late?: number; on_leave?: number; not_checked_in?: number; in_meeting?: number; available?: number; focus?: number; missing_checkout?: number };
  work?: { active?: number; overdue?: number; blocked?: number; waiting?: number; critical?: number; done_today?: number };
  projects?: { active?: number; at_risk?: number };
  collaboration?: { help_open?: number; help_unanswered?: number; help_over_sla?: number; rooms_active?: number; groups_this_week?: number; handoffs_pending?: number; cross_dept_rooms?: number };
  approvals?: { pending?: number; mine?: number; access_requests?: number; leave_requests?: number; stale?: number };
  security?: { high_risk_requests?: number; temporary_grants?: number; events_24h?: number; external_guests?: number };
  departments?: DeptNow[];
};
export type CollabRow = { from_department_id: string; to_department_id: string; from_name: string; to_name: string; handoffs: number; help_requests: number; avg_ack_minutes: number | null; shared_rooms: number };
type Digest = {
  error?: string; since?: string; checked_in?: number; tasks_completed?: number; tasks_created?: number; requests_completed?: number; requests_new?: number;
  projects_changed?: { id: string; name: string; status: string }[]; decisions?: number; approvals_pending?: number; access_requests_pending?: number;
  critical_unresolved?: number; escalations?: number; new_groups?: number; handoffs?: number;
};

const LAST_VISIT_KEY = "ghl-admin-last-visit";
const REFRESH_MS = 60_000;

/* ------------------------------------------------------------- Component */
export function CompanyNow({ initial, initialCollab }: { initial: CompanyNowData | null; initialCollab: CollabRow[] }) {
  const [state, setState] = React.useState<{ data: CompanyNowData | null; collab: CollabRow[]; at: string | null; loading: boolean }>({ data: initial, collab: initialCollab, at: null, loading: !initial });
  const [tick, setTick] = React.useState(0);
  const [dept, setDept] = React.useState("");

  // Load / refresh. tick 0 with server data = no fetch.
  React.useEffect(() => {
    if (tick === 0 && initial) return;
    let alive = true;
    (async () => {
      const sb = createClient();
      const [{ data }, { data: collab }] = await Promise.all([sb.rpc("company_now"), sb.rpc("collaboration_map")]);
      if (!alive) return;
      setState({ data: (data as CompanyNowData | null) ?? null, collab: (collab || []) as CollabRow[], at: new Date().toISOString(), loading: false });
    })();
    return () => { alive = false; };
  }, [tick, initial]);

  // Every 60s.
  React.useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(i);
  }, []);

  // Realtime: anything that moves the picture → debounced refresh.
  React.useEffect(() => {
    const sb = createClient();
    let t: ReturnType<typeof setTimeout> | null = null;
    const poke = () => { if (t) clearTimeout(t); t = setTimeout(() => setTick((x) => x + 1), 1500); };
    let ch = sb.channel("company-now");
    for (const table of ["tasks", "help_requests", "attendance_events", "approvals", "access_requests"]) ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, poke);
    ch.subscribe();
    return () => { if (t) clearTimeout(t); sb.removeChannel(ch); };
  }, []);

  const d = state.data;
  if (state.loading && !d) return <div className="flex justify-center py-[var(--s6)]"><Spinner /></div>;
  if (!d || d.error) return <Card><EmptyState icon={<Activity size={20} />} title="Company Now is for managers and above" hint="The live picture is computed from attendance, work, requests and approvals across the company. Your role does not include company-wide reporting." /></Card>;

  const p = d.people || {};
  const w = d.work || {};
  const pr = d.projects || {};
  const c = d.collaboration || {};
  const a = d.approvals || {};
  const s = d.security || {};
  const depts = (d.departments || []).filter((x) => !dept || x.id === dept);

  return (
    <div className="space-y-[var(--s4)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DepartmentSwitcher value={dept} onChange={setDept} />
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] blink-dot" style={{ ["--blink" as string]: "var(--success)" }} /> Live</span>
          <span>· refreshes every minute{state.at ? ` · updated ${fmtTime(state.at)}` : ""}</span>
          <Button size="xs" variant="ghost" icon aria-label="Refresh now" onClick={() => setTick((t) => t + 1)}><RefreshCw size={13} className={cn(state.loading && "animate-spin")} /></Button>
        </div>
      </div>

      {dept && <DepartmentFocus departmentId={dept} />}

      {/* Every tile below is an attendance/leave/meeting cut, so the whole "People" block used to
          lead only to Attendance — testers read that as People redirecting to the wrong page.
          The section title now carries the way into the directory itself. */}
      <Section
        title={<Link href="/people" className="inline-flex items-center gap-1.5 hover:text-[var(--fg)]"><Users size={12} /> People</Link>}
        hint={`${p.total ?? 0} active employees · ${p.available ?? 0} available right now`}
        action={<Link href="/people" className="text-xs text-muted hover:text-[var(--fg)] inline-flex items-center gap-1">People directory <ChevronRight size={12} /></Link>}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-[var(--s2)]">
          <Metric label="Present" value={p.present ?? 0} tone="text-success" href="/attendance" sub="in office today" />
          <Metric label="Remote / field" value={p.remote ?? 0} href="/attendance" />
          <Metric label="Late" value={p.late ?? 0} tone={(p.late ?? 0) > 0 ? "text-warn" : undefined} href="/attendance" />
          <Metric label="On leave" value={p.on_leave ?? 0} href="/leave" />
          <Metric label="Not checked in" value={p.not_checked_in ?? 0} tone={(p.not_checked_in ?? 0) > 0 ? "text-warn" : undefined} href="/attendance" />
          <Metric label="In meetings" value={p.in_meeting ?? 0} href="/meetings" />
          <Metric label="Focus time" value={p.focus ?? 0} href="/people" sub="deep work, do not disturb" />
          <Metric label="Missed check-out" value={p.missing_checkout ?? 0} tone={(p.missing_checkout ?? 0) > 0 ? "text-warn" : undefined} href="/attendance" sub="yesterday" />
        </div>
      </Section>

      <div className="grid lg:grid-cols-2 gap-[var(--s4)]">
        <Section title={<span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} /> Work</span>} hint="Company-wide, top-level tasks">
          <div className="grid grid-cols-3 gap-[var(--s2)]">
            <Metric label="In progress" value={w.active ?? 0} href="/tasks?status=in_progress" />
            <Metric label="Overdue" value={w.overdue ?? 0} tone={(w.overdue ?? 0) > 0 ? "text-danger" : undefined} href="/tasks" />
            <Metric label="Blocked" value={w.blocked ?? 0} tone={(w.blocked ?? 0) > 0 ? "text-danger" : undefined} href="/tasks?status=blocked" />
            <Metric label="Waiting" value={w.waiting ?? 0} tone={(w.waiting ?? 0) > 0 ? "text-warn" : undefined} href="/tasks?status=waiting" />
            <Metric label="Critical / urgent" value={w.critical ?? 0} tone={(w.critical ?? 0) > 0 ? "text-[var(--orange)]" : undefined} href="/tasks?priority=critical" />
            <Metric label="Done today" value={w.done_today ?? 0} tone="text-success" href="/tasks?status=done" />
          </div>
        </Section>
        <Section title={<span className="inline-flex items-center gap-1.5"><Sparkles size={12} /> Projects & approvals</span>} hint={`${a.mine ?? 0} approval${(a.mine ?? 0) === 1 ? "" : "s"} waiting for you personally`}>
          <div className="grid grid-cols-3 gap-[var(--s2)]">
            <Metric label="Active projects" value={pr.active ?? 0} href="/projects" />
            <Metric label="At risk / delayed" value={pr.at_risk ?? 0} tone={(pr.at_risk ?? 0) > 0 ? "text-warn" : undefined} href="/projects?status=at_risk" />
            <Metric label="Pending approvals" value={a.pending ?? 0} href="/approvals?tab=all" />
            <Metric label="Stale > 48h" value={a.stale ?? 0} tone={(a.stale ?? 0) > 0 ? "text-danger" : undefined} href="/approvals?tab=all" />
            <Metric label="Access requests" value={a.access_requests ?? 0} tone={(a.access_requests ?? 0) > 0 ? "text-warn" : undefined} href="/admin?tab=access" />
            <Metric label="Leave requests" value={a.leave_requests ?? 0} href="/leave" />
          </div>
        </Section>
      </div>

      <div className="grid lg:grid-cols-2 gap-[var(--s4)]">
        <Section title={<span className="inline-flex items-center gap-1.5"><LifeBuoy size={12} /> Collaboration</span>} hint="Help desk, rooms and handoffs between departments">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-[var(--s2)]">
            <Metric label="Open requests" value={c.help_open ?? 0} href="/help" />
            <Metric label="Unanswered" value={c.help_unanswered ?? 0} tone={(c.help_unanswered ?? 0) > 0 ? "text-warn" : undefined} href="/help" />
            <Metric label="Over SLA" value={c.help_over_sla ?? 0} tone={(c.help_over_sla ?? 0) > 0 ? "text-danger" : undefined} href="/help" />
            <Metric label="Active rooms" value={c.rooms_active ?? 0} href="/chat" sub="3 days" />
            <Metric label="New groups" value={c.groups_this_week ?? 0} href="/chat" sub="this week" />
            <Metric label="Handoffs pending" value={c.handoffs_pending ?? 0} tone={(c.handoffs_pending ?? 0) > 0 ? "text-warn" : undefined} href="/tasks" />
            <Metric label="Cross-dept rooms" value={c.cross_dept_rooms ?? 0} href="/chat" />
          </div>
        </Section>
        <Section title={<span className="inline-flex items-center gap-1.5"><ShieldAlert size={12} /> Security</span>} hint="Signals that deserve a look today">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--s2)]">
            <Metric label="High-risk requests" value={s.high_risk_requests ?? 0} tone={(s.high_risk_requests ?? 0) > 0 ? "text-danger" : undefined} href="/admin?tab=access" />
            <Metric label="Temporary grants" value={s.temporary_grants ?? 0} href="/admin?tab=access" sub="active, time-boxed" />
            <Metric label="Events 24h" value={s.events_24h ?? 0} tone={(s.events_24h ?? 0) > 0 ? "text-warn" : undefined} href="/admin?tab=security" />
            <Metric label="External guests" value={s.external_guests ?? 0} href="/admin?tab=security" />
          </div>
        </Section>
      </div>

      <Section title={<span className="inline-flex items-center gap-1.5"><Building2 size={12} /> Departments</span>} hint="Heat grid — present / people, open · overdue · blocked, open requests. Click to open the portal." action={<Link href="/departments" className="text-xs text-muted hover:text-[var(--fg)]">All departments →</Link>}>
        {depts.length === 0 ? <Card><EmptyState title="No departments" className="py-6" /></Card> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[var(--s2)] stagger">
            {depts.map((x) => <DeptCard key={x.id} d={x} />)}
          </div>
        )}
      </Section>

      <div className="grid lg:grid-cols-5 gap-[var(--s4)]">
        <div className="lg:col-span-2"><SinceLastVisit /></div>
        <div className="lg:col-span-3"><CollaborationMap rows={state.collab} /></div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Department card */
function DeptCard({ d }: { d: DeptNow }) {
  const heat = d.open > 0 ? Math.min(1, (d.overdue * 2 + d.blocked) / Math.max(d.open, 1)) : 0;
  const heatTone = heat >= 0.5 ? "var(--danger)" : heat >= 0.2 ? "var(--warn)" : "var(--success)";
  return (
    <Link href={`/departments/${d.slug}`} className="card card-hover overflow-hidden min-w-0 block">
      <div className="h-1.5" style={{ background: d.color }} />
      <div className="p-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate flex-1 inline-flex items-center gap-1.5"><span className="truncate">{d.name}</span><Blink zone={`dept:${d.id}`} /></span>
          <DeptStatusPill status={d.status} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div><div className="text-base font-semibold num leading-tight">{d.present}<span className="text-muted text-xs font-normal">/{d.people}</span></div><div className="text-[10px] text-muted">present</div></div>
          <div><div className="text-base font-semibold num leading-tight">{d.open}</div><div className="text-[10px] text-muted">open</div></div>
          <div><div className={cn("text-base font-semibold num leading-tight", d.help_open > 0 && "text-warn")}>{d.help_open}</div><div className="text-[10px] text-muted">requests</div></div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: heatTone }} />
          <span className={cn(d.overdue > 0 ? "text-danger" : "text-muted")}>{d.overdue} overdue</span>
          <span className="text-muted">·</span>
          <span className={cn(d.blocked > 0 ? "text-warn" : "text-muted")}>{d.blocked} blocked</span>
        </div>
      </div>
    </Link>
  );
}

/* ------------------------------------------------- Since your last visit */
type VisitState = { status: "loading" } | { status: "first"; now: string } | { status: "ready"; since: string; digest: Digest };

function SinceLastVisit() {
  const [v, setV] = React.useState<VisitState>({ status: "loading" });

  React.useEffect(() => {
    let alive = true;
    let prev: string | null = null;
    try { prev = localStorage.getItem(LAST_VISIT_KEY); } catch { prev = null; }
    const nowIso = new Date().toISOString();
    const finish = (next: VisitState) => {
      if (!alive) return;
      setV(next);
      try { localStorage.setItem(LAST_VISIT_KEY, nowIso); } catch { /* private mode */ }
    };
    if (!prev || Number.isNaN(new Date(prev).getTime())) {
      const t = setTimeout(() => finish({ status: "first", now: nowIso }), 0);
      return () => { alive = false; clearTimeout(t); };
    }
    const since = prev;
    createClient().rpc("since_last_visit", { p_since: since }).then(({ data, error }) => {
      finish({ status: "ready", since, digest: error ? { error: error.message } : ((data as Digest | null) ?? {}) });
    });
    return () => { alive = false; };
  }, []);

  return (
    <Card className="h-full">
      <CardHeader title={<span className="inline-flex items-center gap-2"><History size={15} className="text-[var(--brand-2)]" /> Since your last visit</span>} subtitle={v.status === "ready" ? `${ago(v.since)} · ${fmtDate(v.since, true)}` : v.status === "first" ? "First visit on this device" : "Loading…"} />
      <div className="px-[var(--s4)] pb-[var(--s4)]">
        {v.status === "loading" ? <div className="flex justify-center py-6"><Spinner /></div> : v.status === "first" ? (
          <div className="text-sm text-muted">Nothing to compare yet. From now on this panel will show what changed while you were away — check-ins, completed work, new requests, escalations and decisions.</div>
        ) : v.digest.error ? (
          <div className="text-sm text-danger">{v.digest.error}</div>
        ) : (
          <DigestBody g={v.digest} />
        )}
      </div>
    </Card>
  );
}

function DigestBody({ g }: { g: Digest }) {
  const line = (label: string, n: number | undefined, tone?: string, href?: string) => (
    <div key={label} className="flex items-center justify-between gap-2 py-1 border-b border-dashed last:border-0 text-sm">
      <span className="text-muted">{href ? <Link href={href} className="hover:text-[var(--fg)]">{label}</Link> : label}</span>
      <span className={cn("num font-medium", tone, !n && "text-muted font-normal")}>{n ?? 0}</span>
    </div>
  );
  const changed = g.projects_changed || [];
  return (
    <div className="grid sm:grid-cols-2 gap-x-[var(--s4)]">
      <div>
        {line("Checked in", g.checked_in, "text-success", "/attendance")}
        {line("Tasks completed", g.tasks_completed, "text-success", "/tasks?status=done")}
        {line("Tasks created", g.tasks_created, undefined, "/tasks")}
        {line("Requests new", g.requests_new, "text-warn", "/help")}
        {line("Requests completed", g.requests_completed, "text-success", "/help")}
        {line("Decisions recorded", g.decisions, undefined, "/decisions")}
        {line("New groups / rooms", g.new_groups, undefined, "/chat")}
      </div>
      <div>
        {line("Escalations", g.escalations, (g.escalations ?? 0) > 0 ? "text-danger" : undefined)}
        {line("Handoffs", g.handoffs, undefined, "/tasks")}
        {line("Approvals pending now", g.approvals_pending, (g.approvals_pending ?? 0) > 0 ? "text-warn" : undefined, "/approvals?tab=all")}
        {line("Access requests pending", g.access_requests_pending, (g.access_requests_pending ?? 0) > 0 ? "text-warn" : undefined, "/admin?tab=access")}
        {line("Critical requests unresolved", g.critical_unresolved, (g.critical_unresolved ?? 0) > 0 ? "text-danger" : undefined, "/help")}
      </div>
      {changed.length > 0 && (
        <div className="sm:col-span-2 mt-2">
          <div className="eyebrow mb-1">Projects that changed state</div>
          <div className="flex flex-wrap gap-1.5">
            {changed.map((pj) => (
              <Link key={pj.id} href={`/projects/${pj.id}`} className="inline-flex items-center gap-1.5 pill pill-lg tone-neutral hover:opacity-90">
                <span className="truncate max-w-[180px]">{pj.name}</span>
                <Pill tone={PROJECT_STATUS_TONE[pj.status as ProjectStatus] || "tone-neutral"}>{PROJECT_STATUS_LABEL[pj.status as ProjectStatus] || pj.status}</Pill>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------ Collaboration map */
function CollaborationMap({ rows }: { rows: CollabRow[] }) {
  const { departments } = useSession();
  const color = (id: string) => departments.find((d) => d.id === id)?.color || "var(--line-strong)";
  const list = rows.filter((r) => r.handoffs > 0 || r.help_requests > 0 || r.shared_rooms > 0).slice(0, 24);
  return (
    <Card className="h-full">
      <CardHeader title={<span className="inline-flex items-center gap-2"><ArrowLeftRight size={15} className="text-[var(--violet)]" /> Collaboration map</span>} subtitle="Which departments work together — handoffs, help requests, response time, shared rooms" />
      {list.length === 0 ? <EmptyState icon={<ArrowLeftRight size={18} />} title="No cross-department traffic yet" hint="Handoffs, help requests and shared rooms between departments will draw the map." className="py-6" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-[11px] text-muted border-b">
                <th className="px-[var(--s4)] py-2 font-medium">From → To</th>
                <th className="px-3 py-2 font-medium num text-right">Handoffs</th>
                <th className="px-3 py-2 font-medium num text-right">Requests</th>
                <th className="px-3 py-2 font-medium num text-right"><span className="inline-flex items-center gap-1"><Clock size={11} /> First response</span></th>
                <th className="px-3 py-2 font-medium num text-right pr-[var(--s4)]">Shared rooms</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={`${r.from_department_id}-${r.to_department_id}`} className="border-b last:border-0 row-hover">
                  <td className="px-[var(--s4)] py-2">
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color(r.from_department_id) }} /><span className="truncate">{r.from_name}</span>
                      <span className="text-muted">→</span>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color(r.to_department_id) }} /><span className="truncate">{r.to_name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 num text-right">{r.handoffs}</td>
                  <td className="px-3 py-2 num text-right">{r.help_requests}</td>
                  <td className={cn("px-3 py-2 num text-right", r.avg_ack_minutes != null && r.avg_ack_minutes > 480 ? "text-danger" : r.avg_ack_minutes != null && r.avg_ack_minutes > 120 ? "text-warn" : "")}>{r.avg_ack_minutes != null ? fmtMinutes(r.avg_ack_minutes) : "—"}</td>
                  <td className="px-3 py-2 num text-right pr-[var(--s4)]">{r.shared_rooms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function fmtMinutes(m: number) {
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  return `${(m / 60 / 24).toFixed(1)}d`;
}
