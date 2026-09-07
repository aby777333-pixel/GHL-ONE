"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ListChecks, Plus, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pill, Select, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, ProjectPicker } from "@/components/pickers";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { ago, cn, type Tables } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { jsonArr, str, useTouchModule } from "@/components/intel/lib";

export type RetroRow = Tables<"retrospectives"> & { project: { id: string; name: string } | null; team: { id: string; name: string } | null };
type Action = { text: string; owner_id?: string | null; done?: boolean };
const SCOPES = ["team", "project", "department", "company"] as const;

/** Retrospectives: what worked / what failed / what we change / actions. Per team, project, department or company. */
export function Retros({ rows, teams }: { rows: RetroRow[]; teams: { id: string; name: string }[] }) {
  const router = useRouter();
  const { departments } = useSession();
  useTouchModule("retros");
  useSeen("nav:/retros");
  const [create, setCreate] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <div className="page">
      <PageHeader eyebrow="Learning" title="Retrospectives" subtitle="Look back honestly, decide what changes, and give each change an owner." actions={<Button variant="primary" onClick={() => setCreate(true)}><Plus size={15} /> New retro</Button>} />
      {rows.length === 0 ? <Card><EmptyState icon={<RotateCcw size={18} />} title="No retrospectives yet" hint="Run one after a project, a launch, a quarter — or a bad week." action={<Button size="sm" variant="primary" onClick={() => setCreate(true)}><Plus size={14} /> New retro</Button>} /></Card> : (
        <Card className="divide-y">
          {rows.map((r) => {
            const actions = jsonArr(r.actions).map((a): Action => ({ text: str(a.text), owner_id: typeof a.owner_id === "string" ? a.owner_id : null, done: a.done === true }));
            const done = actions.filter((a) => a.done).length;
            const expanded = open === r.id;
            const scopeLabel = r.scope === "project" ? r.project?.name : r.scope === "team" ? r.team?.name : r.scope === "department" ? departments.find((d) => d.id === r.department_id)?.name : "Company";
            return (
              <div key={r.id} className="px-[var(--s4)] py-3">
                <button type="button" className="w-full text-left flex items-center gap-3" onClick={() => setOpen(expanded ? null : r.id)}>
                  <span className="w-8 h-8 rounded-full tone-violet inline-flex items-center justify-center shrink-0"><RotateCcw size={14} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium">{r.period || "Retrospective"}</span><Pill tone="tone-neutral" className="capitalize">{r.scope}</Pill>{scopeLabel && <span className="text-xs text-muted">{scopeLabel}</span>}{actions.length > 0 && <Pill tone={done === actions.length ? "tone-success" : "tone-warn"}><ListChecks size={10} /> {done}/{actions.length} actions</Pill>}</div>
                    <div className="text-[11px] text-muted mt-0.5 inline-flex items-center gap-1.5">{r.created_by && <PersonChip id={r.created_by} size={12} />} · {ago(r.created_at)}</div>
                  </div>
                  <ChevronRight size={14} className={cn("text-muted transition-transform", expanded && "rotate-90")} />
                </button>
                {expanded && (
                  <div className="mt-3 pl-11 grid md:grid-cols-3 gap-3 text-sm">
                    <Block title="What worked" text={r.worked} tone="text-success" />
                    <Block title="What failed" text={r.failed} tone="text-danger" />
                    <Block title="What we change" text={r.changes} tone="text-info" />
                    {actions.length > 0 && <div className="md:col-span-3"><div className="eyebrow mb-1">Actions</div><ul className="space-y-1">{actions.map((a, i) => <li key={i} className={cn("flex items-center gap-2", a.done && "line-through text-muted")}><span className="flex-1">{a.text}</span>{a.owner_id && <PersonChip id={a.owner_id} size={14} />}</li>)}</ul></div>}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
      <Modal open={create} onClose={() => setCreate(false)} title="New retrospective" width={680}><RetroForm teams={teams} onDone={() => { setCreate(false); router.refresh(); }} onCancel={() => setCreate(false)} /></Modal>
    </div>
  );
}

function Block({ title, text, tone }: { title: string; text: string | null; tone: string }) {
  return <div><div className={cn("eyebrow mb-1", tone)}>{title}</div><div className="whitespace-pre-wrap text-2">{text || "—"}</div></div>;
}

function RetroForm({ teams, onDone, onCancel }: { teams: { id: string; name: string }[]; onDone: () => void; onCancel: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [scope, setScope] = React.useState<(typeof SCOPES)[number]>("team");
  const [teamId, setTeamId] = React.useState(profile.team_id || "");
  const [projectId, setProjectId] = React.useState("");
  const [deptId, setDeptId] = React.useState(profile.department_id || "");
  const [period, setPeriod] = React.useState("");
  const [worked, setWorked] = React.useState("");
  const [failed, setFailed] = React.useState("");
  const [changes, setChanges] = React.useState("");
  const [actions, setActions] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const acts = actions.split("\n").map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: false }));
    const { error } = await createClient().from("retrospectives").insert({ org_id: profile.org_id!, scope, team_id: scope === "team" ? teamId || null : null, project_id: scope === "project" ? projectId || null : null, department_id: scope === "department" ? deptId || null : null, period: period.trim() || null, worked: worked.trim() || null, failed: failed.trim() || null, changes: changes.trim() || null, actions: acts as unknown as Json, created_by: profile.id });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Retrospective saved", "success"); onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Field label="Scope"><Select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>{SCOPES.map((s) => <option key={s} value={s} className="capitalize">{s[0].toUpperCase() + s.slice(1)}</option>)}</Select></Field>
        {scope === "team" && <Field label="Team"><Select value={teamId} onChange={(e) => setTeamId(e.target.value)}><option value="">Pick a team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>}
        {scope === "project" && <Field label="Project"><ProjectPicker value={projectId} onChange={setProjectId} /></Field>}
        {scope === "department" && <Field label="Department"><DepartmentPicker value={deptId} onChange={setDeptId} /></Field>}
        <Field label="Period / title"><Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Q3 2026 · Launch retro" /></Field>
      </div>
      <div className="grid md:grid-cols-3 gap-2">
        <Field label="What worked"><Textarea value={worked} onChange={(e) => setWorked(e.target.value)} style={{ minHeight: 90 }} /></Field>
        <Field label="What failed"><Textarea value={failed} onChange={(e) => setFailed(e.target.value)} style={{ minHeight: 90 }} /></Field>
        <Field label="What we change"><Textarea value={changes} onChange={(e) => setChanges(e.target.value)} style={{ minHeight: 90 }} /></Field>
      </div>
      <Field label="Actions" hint="One per line. Turn the important ones into tasks afterwards."><Textarea value={actions} onChange={(e) => setActions(e.target.value)} style={{ minHeight: 60 }} placeholder={"Write the SOP for handovers\nAdd a QA gate before release"} /></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div>
    </form>
  );
}
