"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Target, ListTree, LayoutList, X } from "lucide-react";
import { Button, Card, CardHeader, EmptyState, PageHeader, Progress, Select, Stat } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { cn, isAdminRole, isLeadPlus, isManagerPlus } from "@/lib/utils";
import { GOAL_LEVELS, LEVEL_LABEL, LEVEL_RANK, goalProgress, progressTone, type Goal, type GoalLevel, type GoalTaskLink } from "./lib";
import { GoalCard } from "./GoalCard";
import { GoalEditor } from "./GoalEditor";

export type GoalsData = {
  goals: Goal[];
  links: GoalTaskLink[];
  teams: { id: string; name: string; department_id: string }[];
  isHr: boolean;
  openNew: boolean;
  openGoal: string;
  initialFilter: { period: string; level: string; department: string; scope: "all" | "mine" | "team" };
};

type Editor = { mode: "new"; level?: GoalLevel; parent?: string } | { mode: "edit"; goal: Goal } | null;

export function GoalsClient({ data }: { data: GoalsData }) {
  const { profile, departments, people } = useSession();
  const router = useRouter();
  useSeen("nav:/goals");
  const [goals, setGoals] = React.useState<Goal[]>(data.goals);
  const [links, setLinks] = React.useState<GoalTaskLink[]>(data.links);
  const [period, setPeriod] = React.useState(data.initialFilter.period);
  const [level, setLevel] = React.useState(data.initialFilter.level);
  const [dept, setDept] = React.useState(data.initialFilter.department);
  const [scope, setScope] = React.useState<"all" | "mine" | "team">(data.initialFilter.scope);
  const [view, setView] = React.useState<"tree" | "list">("tree");
  const [showClosed, setShowClosed] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set(data.goals.filter((g) => g.level !== "employee").map((g) => g.id)));
  const [editor, setEditor] = React.useState<Editor>(() => (data.openNew ? { mode: "new" } : data.openGoal ? (() => { const g = data.goals.find((x) => x.id === data.openGoal); return g ? { mode: "edit", goal: g } : null; })() : null));

  const linksByGoal = React.useMemo(() => {
    const m = new Map<string, GoalTaskLink[]>();
    for (const l of links) { if (!m.has(l.goal_id)) m.set(l.goal_id, []); m.get(l.goal_id)!.push(l); }
    return m;
  }, [links]);

  const periods = React.useMemo(() => [...new Set(goals.map((g) => g.period).filter((p): p is string => !!p))].sort().reverse(), [goals]);
  const deptOf = React.useCallback((g: Goal) => g.department_id || people.find((p) => p.id === g.owner_id)?.department_id || null, [people]);

  const filtered = React.useMemo(() => goals.filter((g) => {
    if (!showClosed && g.status !== "active") return false;
    if (period && g.period !== period) return false;
    if (level && g.level !== level) return false;
    if (dept && g.level !== "company" && deptOf(g) !== dept) return false;
    if (scope === "mine" && g.owner_id !== profile.id) return false;
    if (scope === "team") {
      // "My team" is the team's work, not a second copy of "Mine". An individual goal assigned to
      // me alone already appears under Mine; repeating it here made the team filter meaningless.
      // A team/department/company goal I happen to own is still team work, so it stays.
      if (g.level === "employee" && g.owner_id === profile.id) return false;
      if (!(deptOf(g) === profile.department_id || g.owner_id === profile.id || g.level === "company")) return false;
    }
    return true;
  }), [goals, showClosed, period, level, dept, scope, deptOf, profile.id, profile.department_id]);

  const filteredIds = React.useMemo(() => new Set(filtered.map((g) => g.id)), [filtered]);
  const childrenOf = React.useMemo(() => {
    const m = new Map<string, Goal[]>();
    for (const g of filtered) {
      const key = g.parent_id && filteredIds.has(g.parent_id) ? g.parent_id : "root";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(g);
    }
    for (const arr of m.values()) arr.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.title.localeCompare(b.title));
    return m;
  }, [filtered, filteredIds]);

  const mine = goals.filter((g) => g.owner_id === profile.id && g.status === "active");
  const canEdit = (g: Goal) => g.owner_id === profile.id || g.created_by === profile.id || data.isHr || (g.level === "company" && isAdminRole(profile.role)) || ((g.level === "department" || g.level === "team") && isLeadPlus(profile.role)) || (g.level === "employee" && isManagerPlus(profile.role));

  const stats = React.useMemo(() => {
    const active = filtered.filter((g) => g.status === "active");
    const avg = active.length ? Math.round(active.reduce((a, g) => a + goalProgress(g, linksByGoal.get(g.id) || []), 0) / active.length) : 0;
    const atRisk = active.filter((g) => g.due_on && new Date(g.due_on) < new Date() && goalProgress(g, linksByGoal.get(g.id) || []) < 100).length;
    return { total: active.length, avg, atRisk, company: active.filter((g) => g.level === "company").length };
  }, [filtered, linksByGoal]);

  function onSaved(g: Goal, gl: GoalTaskLink[]) {
    setGoals((s) => (s.some((x) => x.id === g.id) ? s.map((x) => (x.id === g.id ? g : x)) : [g, ...s]));
    setLinks((s) => [...s.filter((l) => l.goal_id !== g.id), ...gl]);
    setExpanded((s) => new Set(s).add(g.id));
    setEditor(null);
    if (data.openNew || data.openGoal) router.replace("/goals");
    router.refresh();
  }
  function onDeleted(id: string) {
    setGoals((s) => s.filter((g) => g.id !== id).map((g) => (g.parent_id === id ? { ...g, parent_id: null } : g)));
    setLinks((s) => s.filter((l) => l.goal_id !== id));
    setEditor(null);
    router.refresh();
  }
  function toggle(id: string) { setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }

  function renderTree(parent: string, depth: number): React.ReactNode {
    const list = childrenOf.get(parent) || [];
    return list.map((g) => {
      const kids = childrenOf.get(g.id) || [];
      const open = expanded.has(g.id);
      return (
        <div key={g.id} className={cn(depth > 0 && "pl-4 sm:pl-6 border-l ml-3.5")}>
          <GoalCard goal={g} links={linksByGoal.get(g.id) || []} childCount={kids.length} expanded={open} onToggle={() => toggle(g.id)} canEdit={canEdit(g)} onEdit={() => setEditor({ mode: "edit", goal: g })} teamName={data.teams.find((t) => t.id === g.team_id)?.name} className="mb-2" />
          {open && kids.length > 0 && <div>{renderTree(g.id, depth + 1)}</div>}
          {open && g.level !== "employee" && (
            <div className="mb-2 pl-4 sm:pl-6 ml-3.5 border-l">
              <button onClick={() => setEditor({ mode: "new", level: nextLevel(g.level), parent: g.id })} className="text-[11px] text-muted hover:text-[var(--fg)] inline-flex items-center gap-1 py-1"><Plus size={11} /> Add {LEVEL_LABEL[nextLevel(g.level)].toLowerCase()} goal under this</button>
            </div>
          )}
        </div>
      );
    });
  }

  const hasFilters = !!(period || level || dept || scope !== "all");

  return (
    <div className="page">
      <PageHeader eyebrow="Growth" title="Goals" subtitle="Company → department → team → you. Every goal links to the work that moves it." actions={<Button variant="primary" onClick={() => setEditor({ mode: "new" })}><Plus size={15} /> New goal</Button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--s3)] mb-[var(--s4)]">
        <Stat label="Active goals" value={stats.total} sub={hasFilters ? "in this view" : "across the company"} />
        <Stat label="Average progress" value={`${stats.avg}%`} sub="of active goals" tone={stats.avg >= 70 ? "text-success" : undefined} />
        <Stat label="Past due" value={stats.atRisk} sub="not yet achieved" tone={stats.atRisk ? "text-danger" : undefined} />
        <Stat label="My goals" value={mine.length} sub="that I own" onClick={() => setScope(scope === "mine" ? "all" : "mine")} />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-[var(--s3)] sm:items-center">
        <div className="inline-flex rounded-[var(--radius-sm)] border overflow-hidden">
          {(["all", "mine", "team"] as const).map((s) => (
            <button key={s} className={cn("btn btn-sm rounded-none border-0", scope === s ? "btn-primary" : "btn-ghost")} onClick={() => setScope(s)}>{s === "all" ? "Everything" : s === "mine" ? "Mine" : "My team"}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 sm:flex gap-2 flex-1">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="sm:w-[140px]" style={{ height: 32 }}>
            <option value="">All periods</option>
            {periods.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          <Select value={level} onChange={(e) => setLevel(e.target.value)} className="sm:w-[150px]" style={{ height: 32 }}>
            <option value="">All levels</option>
            {GOAL_LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
          </Select>
          <Select value={dept} onChange={(e) => setDept(e.target.value)} className="sm:w-[180px]" style={{ height: 32 }}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          {hasFilters && <button className="text-xs text-muted hover:underline inline-flex items-center gap-1 col-span-3" onClick={() => { setPeriod(""); setLevel(""); setDept(""); setScope("all"); }}><X size={12} /> Clear</button>}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <label className="text-xs inline-flex items-center gap-1.5 cursor-pointer text-muted"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="accent-[var(--brand)]" /> Show achieved & dropped</label>
          <div className="inline-flex rounded-[var(--radius-sm)] border overflow-hidden">
            <button className={cn("btn btn-sm rounded-none border-0", view === "tree" ? "btn-primary" : "btn-ghost")} aria-pressed={view === "tree"} onClick={() => setView("tree")} title="Tree"><ListTree size={14} /></button>
            <button className={cn("btn btn-sm rounded-none border-0", view === "list" ? "btn-primary" : "btn-ghost")} aria-pressed={view === "list"} onClick={() => setView("list")} title="List"><LayoutList size={14} /></button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[var(--s4)] items-start">
        <div className="min-w-0">
          {filtered.length === 0 ? (
            <Card>
              <EmptyState icon={<Target size={18} />} title={goals.length ? "No goals match these filters" : "No goals yet"} hint={goals.length ? "Widen the filters or create a goal." : "Start with one company goal, then let departments and people link theirs underneath."} action={<Button variant="primary" onClick={() => setEditor({ mode: "new" })}><Plus size={15} /> New goal</Button>} />
            </Card>
          ) : view === "tree" ? (
            <div className="stagger">{renderTree("root", 0)}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 stagger">
              {filtered.slice().sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]).map((g) => (
                <GoalCard key={g.id} goal={g} links={linksByGoal.get(g.id) || []} canEdit={canEdit(g)} onEdit={() => setEditor({ mode: "edit", goal: g })} teamName={data.teams.find((t) => t.id === g.team_id)?.name} compact />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-[var(--s4)] min-w-0">
          <Card>
            <CardHeader title="My goals" subtitle={mine.length ? `${mine.length} active` : "Nothing owned by you yet"} action={<button className="text-xs link" onClick={() => setEditor({ mode: "new", level: "employee" })}>+ Add</button>} />
            {mine.length === 0 ? (
              <div className="px-[var(--s4)] pb-[var(--s4)] text-sm text-muted">Set a goal for this quarter and link the tasks that move it — progress takes care of itself.</div>
            ) : (
              <ul className="px-[var(--s3)] pb-[var(--s3)] space-y-1">
                {mine.map((g) => {
                  const pct = goalProgress(g, linksByGoal.get(g.id) || []);
                  return (
                    <li key={g.id}>
                      <button onClick={() => setEditor({ mode: "edit", goal: g })} className="w-full text-left px-2 py-1.5 rounded-[var(--radius-sm)] row-hover">
                        <div className="text-sm truncate">{g.title}</div>
                        <div className="flex items-center gap-2 mt-1"><Progress value={pct} height={4} tone={progressTone(pct, g)} /><span className="text-[11px] num text-muted w-8 text-right">{pct}%</span></div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="How it rolls up" />
            <ul className="px-[var(--s4)] pb-[var(--s4)] text-xs text-2 space-y-1.5 list-disc pl-8">
              <li><span className="font-medium">Company</span> goals are set by administrators.</li>
              <li><span className="font-medium">Department</span> and <span className="font-medium">team</span> goals by leads and above, linked to a company goal.</li>
              <li><span className="font-medium">Individual</span> goals by you or your manager. Link tasks and progress is derived from what is done.</li>
            </ul>
          </Card>
        </div>
      </div>

      {editor && (
        <GoalEditor
          goal={editor.mode === "edit" ? editor.goal : undefined}
          goals={goals}
          links={editor.mode === "edit" ? linksByGoal.get(editor.goal.id) || [] : []}
          teams={data.teams}
          isHr={data.isHr}
          defaultLevel={editor.mode === "new" ? editor.level : undefined}
          defaultParent={editor.mode === "new" ? editor.parent : undefined}
          onClose={() => { setEditor(null); if (data.openNew || data.openGoal) router.replace("/goals"); }}
          onSaved={onSaved}
          onDeleted={editor.mode === "edit" && canEdit(editor.goal) ? onDeleted : undefined}
        />
      )}
    </div>
  );
}

function nextLevel(l: string): GoalLevel {
  return l === "company" ? "department" : l === "department" ? "team" : "employee";
}
