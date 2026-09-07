"use client";

import * as React from "react";
import { Link2, Search, Trash2, X, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Modal, Pill, Select, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { cn, isAdminRole, isLeadPlus, isManagerPlus, STATUS_LABEL as TASK_STATUS_LABEL, STATUS_TONE as TASK_STATUS_TONE, type TaskStatus } from "@/lib/utils";
import { GOAL_LEVELS, GOAL_STATUSES, LEVEL_LABEL, LEVEL_RANK, STATUS_LABEL, suggestPeriods, type Goal, type GoalLevel, type GoalTaskLink } from "./lib";

type TaskLite = { id: string; title: string; status: TaskStatus; assignee_id: string | null; due_date: string | null };
type Team = { id: string; name: string; department_id: string };

export function GoalEditor({ goal, goals, links, teams, isHr, defaultLevel, defaultParent, defaultOwner, onClose, onSaved, onDeleted }: { goal?: Goal; goals: Goal[]; links: GoalTaskLink[]; teams: Team[]; isHr: boolean; defaultLevel?: GoalLevel; defaultParent?: string; defaultOwner?: string; onClose: () => void; onSaved: (g: Goal, links: GoalTaskLink[]) => void; onDeleted?: (id: string) => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const canCompany = isAdminRole(profile.role) || isHr;
  const canDeptTeam = isLeadPlus(profile.role) || isHr;
  const canPickOwner = isManagerPlus(profile.role) || isLeadPlus(profile.role) || isHr;
  const allowedLevels = GOAL_LEVELS.filter((l) => (l === "company" ? canCompany : l === "employee" ? true : canDeptTeam));

  const [level, setLevel] = React.useState<GoalLevel>((goal?.level as GoalLevel) || defaultLevel || (allowedLevels.includes("team") && !allowedLevels.includes("company") ? "employee" : allowedLevels[allowedLevels.length - 1]));
  const [title, setTitle] = React.useState(goal?.title || "");
  const [description, setDescription] = React.useState(goal?.description || "");
  const [parentId, setParentId] = React.useState(goal?.parent_id || defaultParent || "");
  const [ownerId, setOwnerId] = React.useState(goal?.owner_id || defaultOwner || profile.id);
  const [departmentId, setDepartmentId] = React.useState(goal?.department_id || profile.department_id || "");
  const [teamId, setTeamId] = React.useState(goal?.team_id || profile.team_id || "");
  const [period, setPeriod] = React.useState(goal?.period || suggestPeriods()[0]);
  const [dueOn, setDueOn] = React.useState(goal?.due_on || "");
  const [status, setStatus] = React.useState(goal?.status || "active");
  const [manual, setManual] = React.useState(!!goal && goal.progress > 0);
  const [progress, setProgress] = React.useState(goal?.progress || 0);
  const [selected, setSelected] = React.useState<TaskLite[]>(() => links.filter((l) => l.task).map((l) => l.task!));
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<TaskLite[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const parents = React.useMemo(() => goals.filter((g) => g.id !== goal?.id && LEVEL_RANK[g.level] < LEVEL_RANK[level] && g.status === "active"), [goals, goal?.id, level]);
  const periods = React.useMemo(() => { const s = suggestPeriods(); return period && !s.includes(period) ? [period, ...s] : s; }, [period]);

  // Task search — my open tasks by default, or anything visible matching the query.
  React.useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      let query = supabase.from("tasks").select("id,title,status,assignee_id,due_date").not("status", "in", "(done,cancelled)").is("parent_id", null).order("updated_at", { ascending: false }).limit(15);
      const term = q.trim();
      if (term) query = query.ilike("title", `%${term.replace(/[%_]/g, "")}%`);
      else query = query.or(`assignee_id.eq.${ownerId || profile.id},owner_id.eq.${profile.id}`);
      const { data } = await query;
      if (alive) { setResults((data || []) as TaskLite[]); setSearching(false); }
    }, term(q));
    return () => { alive = false; clearTimeout(t); };
  }, [q, ownerId, profile.id]);

  function toggleTask(t: TaskLite) {
    setSelected((s) => (s.some((x) => x.id === t.id) ? s.filter((x) => x.id !== t.id) : [...s, t]));
  }

  async function save(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.push("Give the goal a title.", "danger"); return; }
    setLoading(true);
    const supabase = createClient();
    const payload = {
      level,
      title: title.trim(),
      description: description.trim() || null,
      parent_id: parentId || null,
      owner_id: level === "employee" ? ownerId || profile.id : ownerId || profile.id,
      department_id: level === "company" ? null : departmentId || null,
      team_id: level === "team" ? teamId || null : null,
      period: period.trim() || null,
      due_on: dueOn || null,
      status,
      progress: manual ? Math.max(0, Math.min(100, Math.round(progress))) : 0,
    };
    let row: Goal | null = null;
    if (goal) {
      const { data, error } = await supabase.from("goals").update(payload).eq("id", goal.id).select("*").single();
      if (error || !data) { setLoading(false); toast.push(error?.message || "Could not save", "danger"); return; }
      row = data;
    } else {
      const { data, error } = await supabase.from("goals").insert({ ...payload, org_id: profile.org_id!, created_by: profile.id }).select("*").single();
      if (error || !data) { setLoading(false); toast.push(error?.message || "Could not create goal", "danger"); return; }
      row = data;
    }
    // Sync linked tasks.
    const before = new Set(links.map((l) => l.task_id));
    const after = new Set(selected.map((t) => t.id));
    const toAdd = [...after].filter((id) => !before.has(id));
    const toRemove = [...before].filter((id) => !after.has(id));
    if (toAdd.length) {
      const { error } = await supabase.from("goal_tasks").insert(toAdd.map((task_id) => ({ goal_id: row!.id, task_id })));
      if (error) { setLoading(false); toast.push(`Goal saved, but tasks could not be linked: ${error.message}`, "danger"); onSaved(row, links); return; }
    }
    if (toRemove.length) {
      const { error } = await supabase.from("goal_tasks").delete().eq("goal_id", row.id).in("task_id", toRemove);
      if (error) { setLoading(false); toast.push(`Goal saved, but a task could not be unlinked: ${error.message}`, "danger"); }
    }
    setLoading(false);
    toast.push(goal ? "Goal saved" : "Goal created", "success");
    onSaved(row, selected.map((t) => ({ goal_id: row!.id, task_id: t.id, task: t })));
  }

  async function remove() {
    if (!goal) return;
    setLoading(true);
    const { error } = await createClient().from("goals").delete().eq("id", goal.id);
    setLoading(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Goal deleted", "info");
    onDeleted?.(goal.id);
  }

  const derived = selected.length ? Math.round((selected.filter((t) => t.status === "done").length / selected.length) * 100) : 0;

  return (
    <Modal open onClose={onClose} title={goal ? "Edit goal" : "New goal"} width={680} side footer={
      <>
        {goal && onDeleted && (confirmDelete ? (
          <span className="mr-auto flex items-center gap-2 text-xs"><span className="text-danger">Delete this goal?</span><Button size="sm" variant="danger" loading={loading} onClick={remove}>Yes, delete</Button><Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>No</Button></span>
        ) : (
          <Button size="sm" variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> Delete</Button>
        ))}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={loading} onClick={save}><Check size={14} /> {goal ? "Save" : "Create goal"}</Button>
      </>
    }>
      <form onSubmit={save} className="space-y-[var(--s3)]">
        <div>
          <span className="label">Level</span>
          <div className="flex flex-wrap gap-1.5">
            {GOAL_LEVELS.map((l) => {
              const ok = allowedLevels.includes(l);
              return (
                <button type="button" key={l} disabled={!ok} onClick={() => { setLevel(l); if (LEVEL_RANK[l] <= LEVEL_RANK[goals.find((g) => g.id === parentId)?.level || "employee"]) setParentId(""); }} className={cn("pill pill-lg border transition-colors", level === l ? "tone-brand border-transparent" : ok ? "tone-neutral border-[var(--line)] hover:bg-[var(--line)]" : "tone-muted border-transparent opacity-50 cursor-not-allowed")} title={!ok ? (l === "company" ? "Company goals are set by administrators" : "Department and team goals are set by leads and above") : undefined}>
                  {LEVEL_LABEL[l]}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Goal"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={level === "company" ? "e.g. Reach ₹5 Cr ARR by March" : level === "employee" ? "e.g. Ship the new onboarding flow" : "e.g. Cut client response time to under 2 hours"} required /></Field>
        <Field label="Why it matters / key results" hint="Optional. What does done look like?"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 72 }} /></Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Contributes to" hint={parents.length ? "Link upward so the tree rolls up." : "No higher-level goal to link to yet."}>
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={parents.length === 0}>
              <option value="">— none —</option>
              {parents.map((p) => <option key={p.id} value={p.id}>{LEVEL_LABEL[p.level]} · {p.title}</option>)}
            </Select>
          </Field>
          <Field label="Owner">
            {canPickOwner ? <PersonPicker value={ownerId} onChange={setOwnerId} allowEmpty={false} /> : <div className="input flex items-center"><PersonChip id={profile.id} size={18} /></div>}
          </Field>
          {level !== "company" && (
            <Field label="Department"><DepartmentPicker value={departmentId} onChange={(v) => { setDepartmentId(v); setTeamId(""); }} /></Field>
          )}
          {level === "team" && (
            <Field label="Team">
              <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">— pick a team —</option>
                {teams.filter((t) => !departmentId || t.department_id === departmentId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Period">
            <Input list="goal-periods" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Q4 2026" />
            <datalist id="goal-periods">{periods.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Due"><Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></Field>
          {goal && (
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>{GOAL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
            </Field>
          )}
        </div>

        <div className="card p-[var(--s3)] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Progress</div>
              <div className="text-[11px] text-muted">{manual ? "Set by hand." : selected.length ? `Derived from linked tasks: ${derived}% done.` : "Link tasks below and progress is derived automatically — or set it by hand."}</div>
            </div>
            <label className="text-xs inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} className="accent-[var(--brand)]" /> Manual</label>
          </div>
          {manual && (
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={100} value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="flex-1 accent-[var(--brand)]" />
              <Input type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="w-20" />
              <span className="text-xs text-muted">%</span>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="label !mb-0 inline-flex items-center gap-1"><Link2 size={12} /> Linked tasks <span className="text-muted font-normal">· {selected.length}</span></span>
          </div>
          {selected.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 mb-2">
              {selected.map((t) => (
                <li key={t.id} className="pill pill-lg tone-neutral max-w-full">
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", t.status === "done" ? "bg-[var(--success)]" : "bg-[var(--line-strong)]")} />
                  <span className="truncate">{t.title}</span>
                  <button type="button" onClick={() => toggleTask(t)} aria-label="Unlink"><X size={11} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks to link (yours and your team's)…" />
          </div>
          <div className="border rounded-[var(--radius-sm)] mt-2 max-h-[200px] overflow-y-auto divide-y">
            {searching && results.length === 0 && <div className="text-xs text-muted p-3">Searching…</div>}
            {!searching && results.length === 0 && <div className="text-xs text-muted p-3">{q.trim() ? "No open tasks match." : "No open tasks yet."}</div>}
            {results.map((t) => {
              const on = selected.some((x) => x.id === t.id);
              return (
                <label key={t.id} className={cn("flex items-center gap-2.5 px-3 py-2 cursor-pointer row-hover text-sm", on && "bg-[var(--neutral-bg)]")}>
                  <input type="checkbox" checked={on} onChange={() => toggleTask(t)} className="accent-[var(--brand)]" />
                  <span className="truncate flex-1">{t.title}</span>
                  <Pill tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Pill>
                  <PersonChip id={t.assignee_id} size={16} showName={false} />
                </label>
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}

function term(q: string) {
  return q.trim() ? 300 : 0;
}
