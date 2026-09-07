"use client";

import * as React from "react";
import { PieChart, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Pill, Progress, Skeleton, useToast } from "@/components/ui";
import { DepartmentPicker, ProjectPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, fmtDate, type Tables } from "@/lib/utils";
import { localDay } from "@/components/intel/lib";

type Allocation = Tables<"allocations"> & { project: { id: string; name: string } | null };

/** Allocation editor (manager / HR): "40% on Project X until 30 Sep", "borrowed by Marketing". Feeds `assignment_warnings`. */
export function AllocationsCard({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const { profile, departments } = useSession();
  const toast = useToast();
  const [rows, setRows] = React.useState<Allocation[] | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [projectId, setProjectId] = React.useState("");
  const [deptId, setDeptId] = React.useState("");
  const [percent, setPercent] = React.useState("50");
  const [from, setFrom] = React.useState(() => localDay());
  const [to, setTo] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [today] = React.useState(() => localDay());

  React.useEffect(() => {
    let alive = true;
    createClient().from("allocations").select("*, project:projects(id,name)").eq("user_id", userId).order("starts_on", { ascending: false }).then(({ data }) => { if (alive) setRows((data || []) as Allocation[]); });
    return () => { alive = false; };
  }, [userId, tick]);

  const current = (rows || []).filter((a) => a.starts_on <= today && (!a.ends_on || a.ends_on >= today));
  const total = current.reduce((s, a) => s + a.percent, 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const pct = Number(percent);
    if (!pct || pct < 1 || pct > 100 || (!projectId && !deptId)) return toast.push("Pick a project or department and a percentage between 1 and 100", "danger");
    setBusy(true);
    const { error } = await createClient().from("allocations").insert({ user_id: userId, project_id: projectId || null, department_id: deptId || null, percent: pct, starts_on: from, ends_on: to || null, note: note.trim() || null, created_by: profile.id });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Allocation saved", "success"); setAdding(false); setNote(""); setTo(""); setTick((t) => t + 1);
  }
  async function remove(id: string) {
    const { error } = await createClient().from("allocations").delete().eq("id", id);
    if (error) return toast.push(error.message, "danger");
    setTick((t) => t + 1);
  }

  return (
    <Card>
      <CardHeader title="Allocations" subtitle={rows ? (current.length ? <span className={cn(total > 100 && "text-danger")}>{total}% allocated right now{total > 100 ? " — over-committed" : ""}</span> : "Not allocated to any project or borrowed by a department") : "Project and department time splits"} action={canEdit ? <Button size="sm" variant={adding ? "ghost" : "secondary"} onClick={() => setAdding((a) => !a)}>{adding ? "Close" : <><Plus size={13} /> Add</>}</Button> : <PieChart size={15} className="text-muted" />} />
      <div className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
        {rows && current.length > 0 && <Progress value={Math.min(100, total)} tone={total > 100 ? "var(--danger)" : total >= 80 ? "var(--warn)" : "var(--brand)"} />}
        {adding && (
          <form onSubmit={add} className="space-y-2 rounded-[var(--radius-sm)] border p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="Project"><ProjectPicker value={projectId} onChange={(v) => { setProjectId(v); if (v) setDeptId(""); }} /></Field>
              <Field label="Or borrowed by department"><DepartmentPicker value={deptId} onChange={(v) => { setDeptId(v); if (v) setProjectId(""); }} placeholder="—" /></Field>
              <Field label="Percent"><Input type="number" min={1} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} required /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required /></Field><Field label="Until"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field></div>
            </div>
            <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why, agreed with whom" /></Field>
            <div className="flex justify-end"><Button type="submit" size="sm" variant="primary" loading={busy}>Save</Button></div>
          </form>
        )}
        {!rows ? <Skeleton /> : rows.length === 0 ? <EmptyState title="No allocations" hint={canEdit ? "Add one so assignment warnings know how much of their time is already promised." : undefined} className="py-3" /> : (
          <ul className="divide-y">
            {rows.map((a) => {
              const active = current.includes(a);
              return (
                <li key={a.id} className={cn("py-2 flex items-center gap-2 text-sm", !active && "opacity-60")}>
                  <span className="num font-medium w-12">{a.percent}%</span>
                  <span className="min-w-0 flex-1 truncate">{a.project ? a.project.name : a.department_id ? `Borrowed by ${departments.find((d) => d.id === a.department_id)?.name || "department"}` : "—"}{a.note && <span className="text-xs text-muted"> · {a.note}</span>}</span>
                  <span className="text-[11px] text-muted num whitespace-nowrap">{fmtDate(a.starts_on)}{a.ends_on ? ` → ${fmtDate(a.ends_on)}` : " → open"}</span>
                  {active ? <Pill tone="tone-success">Now</Pill> : a.starts_on > today ? <Pill tone="tone-info">Upcoming</Pill> : <Pill tone="tone-muted">Ended</Pill>}
                  {canEdit && <button type="button" onClick={() => remove(a.id)} className="text-muted hover:text-[var(--danger)]" aria-label="Remove"><Trash2 size={13} /></button>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
