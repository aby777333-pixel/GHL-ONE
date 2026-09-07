"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRightLeft, Check, ChevronDown, ChevronRight, Crown, GitBranch, LifeBuoy, Move, Network, Search, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Pill, Select, Skeleton, Spinner, Tabs, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { cn, humanize, isAdminRole, isManagerPlus, ROLE_LABEL, ROLE_RANK, type Tables } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { PRESENCE_LABEL, PRESENCE_TONE } from "@/components/people/types";
import { Metric, Note, PersonLine } from "../AdminBits";
import { hasPerm } from "../perms";
import { EmployeeWizard } from "./EmployeeWizard";
import { EMPLOYEE_STATUS_LABEL, EMPLOYEE_STATUS_TONE, jsonArray, jsonObj, num, str, todayIso, type StructurePerson } from "./lib";

type Node = { p: StructurePerson; children: Node[] };
const SPAN_LIMIT = 8;

function buildTree(people: StructurePerson[]): { roots: Node[]; byId: Map<string, Node> } {
  const byId = new Map<string, Node>();
  for (const p of people) byId.set(p.id, { p, children: [] });
  const roots: Node[] = [];
  for (const n of byId.values()) {
    const m = n.p.manager_id ? byId.get(n.p.manager_id) : undefined;
    if (m && m !== n) m.children.push(n); else roots.push(n);
  }
  const sortNodes = (l: Node[]) => { l.sort((a, b) => ROLE_RANK[a.p.role] - ROLE_RANK[b.p.role] || a.p.full_name.localeCompare(b.p.full_name)); l.forEach((c) => sortNodes(c.children)); };
  sortNodes(roots);
  return { roots, byId };
}
function descendants(n: Node): number { return n.children.reduce((a, c) => a + 1 + descendants(c), 0); }
function isDescendant(byId: Map<string, Node>, ancestor: string, id: string): boolean {
  const n = byId.get(ancestor);
  if (!n) return false;
  return n.children.some((c) => c.p.id === id || isDescendant(byId, c.p.id, id));
}

/** Reporting tree & org chart editor (`/admin?tab=structure`). */
export function ReportingTree({ people: initialPeople, teams, perms }: { people: StructurePerson[]; teams: Tables<"teams">[]; perms: string[] }) {
  const router = useRouter();
  const { profile, departments } = useSession();
  const admin = isAdminRole(profile.role);
  const canCreate = admin || hasPerm(perms, "hr.manage", "people.manage");
  const [view, setView] = React.useState<"tree" | "mine">("tree");
  const [q, setQ] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [wizard, setWizard] = React.useState(false);
  const [move, setMove] = React.useState<{ person: StructurePerson; manager?: StructurePerson | null } | null>(null);
  const [transfer, setTransfer] = React.useState<StructurePerson | null>(null);
  const [setLead, setSetLead] = React.useState<Tables<"teams"> | null>(null);
  const [dragging, setDragging] = React.useState<string | null>(null);

  const active = React.useMemo(() => initialPeople.filter((p) => p.is_active), [initialPeople]);
  const { roots, byId } = React.useMemo(() => buildTree(active), [active]);
  const orphans = active.filter((p) => !p.manager_id && !p.is_external && p.role !== "super_admin" && p.role !== "director");
  const wide = active.filter((p) => (byId.get(p.id)?.children.length || 0) > SPAN_LIMIT);
  const teamsNoLead = teams.filter((t) => !t.lead_id);
  const needle = q.trim().toLowerCase();
  const matches = (p: StructurePerson) => (!dept || p.department_id === dept) && (!needle || p.full_name.toLowerCase().includes(needle) || (p.designation || "").toLowerCase().includes(needle));

  function onDrop(target: StructurePerson, id: string) {
    setDragging(null);
    const person = byId.get(id)?.p;
    if (!person || person.id === target.id || person.manager_id === target.id) return;
    if (isDescendant(byId, person.id, target.id)) return;
    setMove({ person, manager: target });
  }

  return (
    <div className="space-y-[var(--s4)]">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--s2)]">
        <Metric label="Active people" value={active.length} icon={<Users size={13} />} />
        <Metric label="Without manager" value={orphans.length} tone={orphans.length ? "text-danger" : undefined} icon={<AlertTriangle size={13} />} sub="excl. directors & externals" />
        <Metric label={`Span > ${SPAN_LIMIT}`} value={wide.length} tone={wide.length ? "text-warn" : undefined} icon={<GitBranch size={13} />} sub="managers with too many reports" />
        <Metric label="Teams without lead" value={teamsNoLead.length} tone={teamsNoLead.length ? "text-warn" : undefined} icon={<Crown size={13} />} />
      </div>

      <Tabs<"tree" | "mine"> tabs={[{ key: "tree", label: <span className="inline-flex items-center gap-1.5"><Network size={13} /> Reporting tree</span> }, { key: "mine", label: <span className="inline-flex items-center gap-1.5"><Users size={13} /> My team</span> }]} value={view} onChange={setView} />

      {view === "mine" ? <MyTeam /> : (
        <>
          {(orphans.length > 0 || wide.length > 0 || teamsNoLead.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--s3)]">
              {orphans.length > 0 && <Card className="p-3"><div className="eyebrow mb-1.5 text-danger">No manager</div><div className="flex flex-wrap gap-1.5">{orphans.map((p) => <button key={p.id} type="button" onClick={() => setMove({ person: p })} className="pill tone-danger">{p.full_name} · fix</button>)}</div></Card>}
              {wide.length > 0 && <Card className="p-3"><div className="eyebrow mb-1.5 text-warn">Span of control</div><div className="flex flex-wrap gap-1.5">{wide.map((p) => <span key={p.id} className="pill tone-warn">{p.full_name} · {byId.get(p.id)?.children.length} reports</span>)}</div><div className="text-[11px] text-muted mt-1">Consider a team lead or splitting the team.</div></Card>}
              {teamsNoLead.length > 0 && <Card className="p-3"><div className="eyebrow mb-1.5 text-warn">Teams without a lead</div><div className="flex flex-wrap gap-1.5">{teamsNoLead.map((t) => <button key={t.id} type="button" onClick={() => setSetLead(t)} className="pill tone-warn">{t.name} · set lead</button>)}</div></Card>}
            </div>
          )}

          <Card>
            <CardHeader title="Reporting tree" subtitle="Drag a person onto their new manager, or use Move. Every change previews its impact first and keeps history." action={<Button size="sm" variant="primary" onClick={() => setWizard(true)}><UserPlus size={14} /> {canCreate ? "Add employee" : "Request employee"}</Button>} />
            <div className="px-[var(--s4)] pb-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person…" className="input pl-8 !h-9 !text-sm w-full" /></div>
              <DepartmentPicker value={dept} onChange={setDept} placeholder="All departments" className="!w-auto !h-9 !text-sm" />
            </div>
            <div className="border-t px-[var(--s3)] py-[var(--s3)] overflow-x-auto">
              {roots.length === 0 ? <EmptyState title="No people yet" className="py-6" /> : (
                <ul className="space-y-1 min-w-max">
                  {roots.map((n) => <TreeNode key={n.p.id} node={n} depth={0} matches={matches} highlight={!!needle || !!dept} teams={teams} departments={departments} dragging={dragging} onDragStart={setDragging} onDrop={onDrop} onMove={(p) => setMove({ person: p })} onTransfer={setTransfer} />)}
                </ul>
              )}
            </div>
          </Card>
        </>
      )}

      <EmployeeWizard open={wizard} onClose={() => setWizard(false)} canCreate={canCreate} teams={teams.map((t) => ({ id: t.id, name: t.name, department_id: t.department_id }))} />
      {move && <MoveModal person={move.person} initialManager={move.manager?.id || ""} byId={byId} onClose={() => setMove(null)} onDone={() => { setMove(null); router.refresh(); }} />}
      {transfer && <TransferProposalModal person={transfer} teams={teams} onClose={() => setTransfer(null)} />}
      {setLead && <SetLeadModal team={setLead} people={active} onClose={() => setSetLead(null)} />}
    </div>
  );
}

function TreeNode({ node, depth, matches, highlight, teams, departments, dragging, onDragStart, onDrop, onMove, onTransfer }: { node: Node; depth: number; matches: (p: StructurePerson) => boolean; highlight: boolean; teams: Tables<"teams">[]; departments: Tables<"departments">[]; dragging: string | null; onDragStart: (id: string | null) => void; onDrop: (target: StructurePerson, id: string) => void; onMove: (p: StructurePerson) => void; onTransfer: (p: StructurePerson) => void }) {
  const [open, setOpen] = React.useState(depth < 2);
  const [over, setOver] = React.useState(false);
  const p = node.p;
  const dept = departments.find((d) => d.id === p.department_id);
  const team = teams.find((t) => t.id === p.team_id);
  const count = descendants(node);
  const dim = highlight && !matches(p);
  const span = node.children.length > SPAN_LIMIT;
  return (
    <li>
      <div
        className={cn("flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5 w-fit min-w-[300px] transition-colors", over && dragging && dragging !== p.id ? "border-[var(--brand)] bg-[var(--brand-bg)]/40" : "border-[var(--line)]", dim && "opacity-40", dragging === p.id && "opacity-50")}
        style={{ marginLeft: depth * 24, borderLeftColor: dept?.color, borderLeftWidth: 3 }}
        draggable
        onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; onDragStart(p.id); }}
        onDragEnd={() => onDragStart(null)}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(p, e.dataTransfer.getData("text/plain")); }}
      >
        <button type="button" onClick={() => setOpen((o) => !o)} className={cn("btn btn-ghost btn-xs shrink-0 w-6", node.children.length === 0 && "invisible")} aria-label={open ? "Collapse" : "Expand"}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
        <Avatar name={p.full_name} src={p.avatar_url} size={28} presence={p.presence} />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate inline-flex items-center gap-1.5"><Link href={`/people/${p.id}`} className="hover:underline">{p.full_name}</Link><Blink zone={`user:${p.id}`} />{p.frozen && <Pill tone="tone-danger">Frozen</Pill>}{p.status !== "active" && <Pill tone={EMPLOYEE_STATUS_TONE[p.status]}>{EMPLOYEE_STATUS_LABEL[p.status] || p.status}</Pill>}</div>
          <div className="text-[11px] text-muted truncate">{p.designation || ROLE_LABEL[p.role]}{dept ? ` · ${dept.name}` : ""}{team ? ` · ${team.name}` : ""}</div>
        </div>
        {count > 0 && <span className={cn("pill ml-1", span ? "tone-warn" : "tone-neutral")} title={span ? `${node.children.length} direct reports — above the span limit` : `${node.children.length} direct · ${count} total`}>{node.children.length}{count !== node.children.length ? ` / ${count}` : ""}</span>}
        {!p.manager_id && p.role !== "super_admin" && p.role !== "director" && !p.is_external && <Pill tone="tone-danger">No manager</Pill>}
        <span className="ml-auto inline-flex gap-0.5">
          <Button size="xs" variant="ghost" onClick={() => onMove(p)} title="Move to another manager"><Move size={12} /></Button>
          <Button size="xs" variant="ghost" onClick={() => onTransfer(p)} title="Transfer department"><ArrowRightLeft size={12} /></Button>
          <Link href={`/admin?tab=hr&view=people&user=${p.id}`} className="btn btn-ghost btn-xs" title="Employee Command Center"><Crown size={12} /></Link>
        </span>
      </div>
      {open && node.children.length > 0 && <ul className="space-y-1 mt-1">{node.children.map((c) => <TreeNode key={c.p.id} node={c} depth={depth + 1} matches={matches} highlight={highlight} teams={teams} departments={departments} dragging={dragging} onDragStart={onDragStart} onDrop={onDrop} onMove={onMove} onTransfer={onTransfer} />)}</ul>}
    </li>
  );
}

/* ------------------------------------------------------------- Move */
function MoveModal({ person, initialManager, byId, onClose, onDone }: { person: StructurePerson; initialManager: string; byId: Map<string, Node>; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [manager, setManager] = React.useState(initialManager);
  const [reason, setReason] = React.useState("");
  const [impact, setImpact] = React.useState<{ key: string; data: Record<string, Json | undefined> } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const loop = !!manager && (manager === person.id || isDescendant(byId, person.id, manager));

  React.useEffect(() => {
    if (!manager || loop) return;
    let alive = true;
    createClient().rpc("change_impact", { p_user: person.id, p_new_manager: manager }).then(({ data }) => { if (alive) setImpact({ key: manager, data: jsonObj(data) }); });
    return () => { alive = false; };
  }, [manager, person.id, loop]);

  async function apply() {
    setBusy(true);
    const { error } = await createClient().rpc("change_manager", { p_user: person.id, p_new_manager: manager, p_kind: "primary", p_reason: reason.trim() || undefined });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`${person.full_name} now reports to the new manager`, "success");
    onDone();
  }
  const im = impact && impact.key === manager ? impact.data : null;
  return (
    <Modal open onClose={onClose} title={`Move ${person.full_name}`} width={560} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!manager || loop || manager === person.manager_id} onClick={apply}><Check size={14} /> Change manager</Button></>}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm"><PersonLine id={person.id} name={person.full_name} size={28} sub={person.designation} /><span className="text-muted mx-1">reports to</span><span className="flex-1"><PersonPicker value={manager} onChange={setManager} placeholder="Choose a manager…" /></span></div>
        {loop && <Note tone="danger">That would create a reporting loop — a person cannot report to themselves or to one of their own reports.</Note>}
        <Field label="Reason" hint="Shared with both people and kept in manager history."><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Team restructure — Sales North" /></Field>
        {manager && !loop && (
          <div className="sunken rounded-[var(--radius-sm)] p-3 text-xs space-y-1">
            <div className="eyebrow mb-1">Impact</div>
            {!im ? <div className="flex items-center gap-2"><Spinner className="!w-4 !h-4" /> Computing…</div> : im.error ? <span className="text-danger">You are not allowed to move this person.</span> : (
              <>
                <div>Pending approvals raised by {person.full_name.split(" ")[0]} move to <b>{str(im.new_manager, "the new manager")}</b>.</div>
                <div>Their own direct reports (<b className="num">{num(im.direct_reports)}</b>) stay with them · pending approvals they hold: <b className="num">{num(im.pending_approvals_as_approver)}</b> · pending leaves: <b className="num">{num(im.pending_leaves_as_manager)}</b>.</div>
                {jsonArray(im.responsibilities).length > 0 && <div>Responsibilities owned: {jsonArray(im.responsibilities).map((r) => str(jsonObj(r).name)).join(", ")}.</div>}
                <div>Active delegations affected: <b className="num">{num(im.approval_routes_affected)}</b>. Department and rooms are unchanged.</div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------- Transfer */
function TransferProposalModal({ person, teams, onClose }: { person: StructurePerson; teams: Tables<"teams">[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments } = useSession();
  const [toDept, setToDept] = React.useState("");
  const [toTeam, setToTeam] = React.useState("");
  const [toManager, setToManager] = React.useState("");
  const [effective, setEffective] = React.useState(() => todayIso());
  const [reason, setReason] = React.useState("");
  const [impact, setImpact] = React.useState<{ key: string; data: Record<string, Json | undefined> } | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!toDept) return;
    let alive = true;
    createClient().rpc("change_impact", { p_user: person.id, p_new_department: toDept, p_new_manager: toManager || undefined }).then(({ data }) => { if (alive) setImpact({ key: `${toDept}:${toManager}`, data: jsonObj(data) }); });
    return () => { alive = false; };
  }, [toDept, toManager, person.id]);

  async function submit() {
    if (!profile.org_id || !toDept) return;
    setBusy(true);
    const { error } = await createClient().from("employee_transfers").insert({ org_id: profile.org_id, user_id: person.id, from_department_id: person.department_id, to_department_id: toDept, from_manager_id: person.manager_id, to_manager_id: toManager || null, to_team_id: toTeam || null, effective_on: effective, reason: reason.trim() || null, requested_by: profile.id });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Transfer proposed — apply it from People Ops → Transfers & roles", "success");
    onClose(); router.refresh();
  }
  const im = impact && impact.key === `${toDept}:${toManager}` ? impact.data : null;
  return (
    <Modal open onClose={onClose} title={`Transfer ${person.full_name}`} width={560} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!toDept || toDept === person.department_id} onClick={submit}><ArrowRightLeft size={14} /> Propose transfer</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="To department"><DepartmentPicker value={toDept} onChange={(v) => { setToDept(v); setToTeam(""); }} placeholder="Choose…" /></Field>
          <Field label="To team"><Select value={toTeam} onChange={(e) => setToTeam(e.target.value)}><option value="">No team</option>{teams.filter((t) => !toDept || t.department_id === toDept).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="New manager" hint="Empty keeps the current manager."><PersonPicker value={toManager} onChange={setToManager} placeholder="Keep current" departmentId={toDept || undefined} /></Field>
          <Field label="Effective on"><Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} /></Field>
          <Field label="Reason" className="sm:col-span-2"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
        {toDept && (
          <div className="sunken rounded-[var(--radius-sm)] p-3 text-xs space-y-1">
            <div className="eyebrow mb-1">When applied</div>
            {!im ? <div className="flex items-center gap-2"><Spinner className="!w-4 !h-4" /> Computing…</div> : im.error ? <span className="text-danger">You are not allowed to transfer this person.</span> : (
              <>
                <div>Leaves {jsonArray(im.department_rooms_to_leave).length} room{jsonArray(im.department_rooms_to_leave).length === 1 ? "" : "s"} ({jsonArray(im.department_rooms_to_leave).map(String).join(", ") || "none"}); joins {jsonArray(im.department_rooms_to_join).map(String).join(", ") || departments.find((d) => d.id === toDept)?.name}.</div>
                <div>{num(im.department_grants_revoked)} department-scoped grant{num(im.department_grants_revoked) === 1 ? "" : "s"} revoked · stays on {jsonArray(im.projects).length} project{jsonArray(im.projects).length === 1 ? "" : "s"}.</div>
                <div>The transfer workflow starts (permission review, team intro, record update).</div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------- Set lead */
function SetLeadModal({ team, people, onClose }: { team: Tables<"teams">; people: StructurePerson[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [lead, setLead] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const members = people.filter((p) => p.team_id === team.id);
  async function save() {
    if (!lead) return;
    setBusy(true);
    const { error } = await createClient().from("teams").update({ lead_id: lead }).eq("id", team.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`${team.name} now has a lead`, "success"); onClose(); router.refresh();
  }
  return (
    <Modal open onClose={onClose} title={`Set lead · ${team.name}`} width={460} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!lead} onClick={save}><Crown size={14} /> Set lead</Button></>}>
      <div className="space-y-3">
        <Field label="Team lead" hint={members.length ? `${members.length} member${members.length === 1 ? "" : "s"} in this team` : "No members yet — anyone can lead."}><PersonPicker value={lead} onChange={setLead} placeholder="Choose…" departmentId={team.department_id} /></Field>
        {members.length > 0 && <div className="flex flex-wrap gap-1.5">{members.map((m) => <button key={m.id} type="button" onClick={() => setLead(m.id)} className={cn("pill", lead === m.id ? "tone-brand" : "tone-neutral")}>{m.full_name}</button>)}</div>}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- My team */
type Report = { id: string; full_name: string; designation: string | null; department_id: string | null; manager_id: string | null; role: StructurePerson["role"]; presence: StructurePerson["presence"]; status: string; depth: number };
type Board = { user_id: string; att_status: string; first_in: string | null; last_out: string | null; on_leave: boolean; late: boolean };

/** Manager's team view: direct + indirect reports with availability, attendance today, open work, blockers and requests. Also served at /people/team. */
export function MyTeam({ userId, standalone }: { userId?: string; standalone?: boolean } = {}) {
  const { profile, people, departments } = useSession();
  const target = userId || profile.id;
  const [data, setData] = React.useState<{ reports: Report[]; board: Board[]; tasks: { assignee_id: string | null; status: string; due_date: string | null; priority: string }[]; help: { requester_id: string; status: string }[]; leaves: { user_id: string; status: string }[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [depthFilter, setDepthFilter] = React.useState<"direct" | "all">("all");

  React.useEffect(() => {
    let alive = true;
    const sb = createClient();
    (async () => {
      const { data: reports, error: e } = await sb.rpc("reports_of", { p_user: target });
      if (!alive) return;
      if (e) { setError(e.message); return; }
      const ids = (reports || []).map((r) => r.id);
      const day = new Date().toISOString().slice(0, 10);
      const [{ data: board }, { data: tasks }, { data: help }, { data: leaves }] = await Promise.all([
        sb.rpc("attendance_board", { p_day: day }),
        ids.length ? sb.from("tasks").select("assignee_id,status,due_date,priority").in("assignee_id", ids).not("status", "in", "(done,cancelled)").limit(2000) : Promise.resolve({ data: [] }),
        ids.length ? sb.from("help_requests").select("requester_id,status").in("requester_id", ids).in("status", ["new", "accepted", "working", "waiting"]).limit(500) : Promise.resolve({ data: [] }),
        ids.length ? sb.from("leaves").select("user_id,status").in("user_id", ids).eq("status", "pending").limit(500) : Promise.resolve({ data: [] }),
      ]);
      if (!alive) return;
      setData({ reports: (reports || []) as Report[], board: (board || []) as Board[], tasks: tasks || [], help: help || [], leaves: leaves || [] });
    })();
    return () => { alive = false; };
  }, [target]);

  const body = (() => {
    if (error) return <Note tone="warn">{error}</Note>;
    if (!data) return <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>;
    const list = data.reports.filter((r) => depthFilter === "all" || r.depth === 1);
    if (list.length === 0) return <EmptyState icon={<Users size={20} />} title="No reports yet" hint="People who report to you (directly or through your managers) appear here with today's availability and work." />;
    const nowIso = new Date().toISOString();
    const rows = list.map((r) => {
      const b = data.board.find((x) => x.user_id === r.id);
      const t = data.tasks.filter((x) => x.assignee_id === r.id);
      return { r, b, open: t.length, overdue: t.filter((x) => x.due_date && x.due_date < nowIso).length, blocked: t.filter((x) => x.status === "blocked" || x.status === "waiting").length, urgent: t.filter((x) => x.priority === "critical" || x.priority === "urgent").length, help: data.help.filter((h) => h.requester_id === r.id).length, leaves: data.leaves.filter((l) => l.user_id === r.id).length };
    });
    const inNow = rows.filter((x) => x.b?.first_in && !x.b.last_out).length;
    const onLeave = rows.filter((x) => x.b?.on_leave || x.r.presence === "leave").length;
    const blocked = rows.reduce((a, x) => a + x.blocked, 0);
    const requests = rows.reduce((a, x) => a + x.help + x.leaves, 0);
    return (
      <div className="space-y-[var(--s3)]">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-[var(--s2)]">
          <Metric label="People" value={list.length} sub={depthFilter === "all" ? `${data.reports.filter((r) => r.depth === 1).length} direct` : "direct reports"} />
          <Metric label="In now" value={inNow} tone="text-success" />
          <Metric label="On leave" value={onLeave} />
          <Metric label="Blocked items" value={blocked} tone={blocked ? "text-warn" : undefined} />
          <Metric label="Open requests" value={requests} tone={requests ? "text-warn" : undefined} sub="help + leave" href="/approvals" />
        </div>
        <Card>
          <CardHeader title="Team" action={<Select value={depthFilter} onChange={(e) => setDepthFilter(e.target.value as typeof depthFilter)} className="!h-8 !text-xs !w-auto"><option value="all">Direct + indirect</option><option value="direct">Direct only</option></Select>} />
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm min-w-[820px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted"><th className="px-[var(--s4)] py-2 font-medium">Person</th><th className="px-3 py-2 font-medium">Availability</th><th className="px-3 py-2 font-medium">Today</th><th className="px-3 py-2 font-medium">Open</th><th className="px-3 py-2 font-medium">Overdue</th><th className="px-3 py-2 font-medium">Blocked</th><th className="px-3 py-2 font-medium">Requests</th><th className="px-3 py-2" /></tr></thead>
              <tbody className="divide-y">
                {rows.map(({ r, b, open, overdue, blocked: bl, urgent, help, leaves }) => {
                  const p = people.find((x) => x.id === r.id);
                  return (
                    <tr key={r.id} className="row-hover">
                      <td className="px-[var(--s4)] py-2"><div className="flex items-center gap-2.5" style={{ paddingLeft: (r.depth - 1) * 14 }}><Avatar name={r.full_name} src={p?.avatar_url} size={28} presence={r.presence} /><div className="min-w-0"><Link href={`/people/${r.id}`} className="block truncate font-medium hover:underline">{r.full_name}<Blink zone={`user:${r.id}`} className="ml-1" /></Link><div className="text-[11px] text-muted truncate">{r.designation || ROLE_LABEL[r.role]} · {departments.find((d) => d.id === r.department_id)?.name || "—"}{r.depth > 1 ? ` · via ${people.find((x) => x.id === r.manager_id)?.full_name?.split(" ")[0] || "manager"}` : ""}</div></div></div></td>
                      <td className="px-3 py-2"><Pill tone={PRESENCE_TONE[r.presence] || "tone-neutral"}>{PRESENCE_LABEL[r.presence] || humanize(r.presence)}</Pill></td>
                      <td className="px-3 py-2 text-xs">{b ? (b.on_leave ? <Pill tone="tone-warn">On leave</Pill> : b.first_in ? <span className={cn("num", b.late && "text-warn")}>{b.first_in.slice(11, 16)}{b.last_out ? ` → ${b.last_out.slice(11, 16)}` : " · in"}{b.late ? " · late" : ""}</span> : <span className="text-muted">Not yet in</span>) : <span className="text-muted">—</span>}</td>
                      <td className="px-3 py-2 num">{open}{urgent ? <span className="text-[11px] text-danger ml-1">({urgent} urgent)</span> : null}</td>
                      <td className={cn("px-3 py-2 num", overdue && "text-danger font-medium")}>{overdue}</td>
                      <td className={cn("px-3 py-2 num", bl && "text-warn font-medium")}>{bl}</td>
                      <td className="px-3 py-2 num">{help + leaves ? <span>{help ? `${help} help` : ""}{help && leaves ? " · " : ""}{leaves ? `${leaves} leave` : ""}</span> : <span className="text-muted">—</span>}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap"><Link href={`/tasks?assignee=${r.id}`} className="btn btn-ghost btn-xs">Work</Link><Link href={`/one-on-ones?new=1&with=${r.id}`} className="btn btn-ghost btn-xs"><LifeBuoy size={12} /> 1-on-1</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  })();

  if (!standalone) return body;
  return (
    <div className="page">
      <PageHeader eyebrow="People" title="My team" subtitle="Direct and indirect reports — availability, attendance today, open work, blockers and requests." actions={isManagerPlus(profile.role) ? <Link href="/admin?tab=structure" className="btn btn-secondary btn-sm"><Network size={14} /> Reporting tree</Link> : undefined} />
      {body}
    </div>
  );
}
