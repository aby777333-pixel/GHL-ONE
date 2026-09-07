"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, Building2, Check, ClipboardList, LifeBuoy, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, humanize, isAdminRole, isManagerPlus, type Tables } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { Metric, Note, PersonLine } from "../AdminBits";
import { hasPerm } from "../perms";
import { DECISION_LEVELS, jsonArray, jsonObj, str, type ResponsibilityRow } from "./lib";

type Raci = { responsible: string[]; accountable: string | null; consulted: string[]; informed: string[] };
type KnowledgeLite = { id: string; title: string };
type WhoOwnsRow = { kind: string; id: string; name: string; owner_id: string | null; owner_name: string | null; backup_id: string | null; backup_name: string | null; department: string | null; critical: boolean };

function parseRaci(j: Json | null): Raci {
  const o = jsonObj(j);
  const ids = (v: Json | undefined) => jsonArray(v).filter((x): x is string => typeof x === "string");
  return { responsible: ids(o.responsible), accountable: typeof o.accountable === "string" ? o.accountable : null, consulted: ids(o.consulted), informed: ids(o.informed) };
}

/** Responsibilities register (`/admin?tab=responsibilities`): who owns what, backups, successors, decision rights, RACI, continuity gaps. */
export function Responsibilities({ rows, knowledge, teams, perms }: { rows: ResponsibilityRow[]; knowledge: KnowledgeLite[]; teams: Pick<Tables<"teams">, "id" | "name" | "department_id">[]; perms: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments } = useSession();
  const canEdit = isManagerPlus(profile.role) || isAdminRole(profile.role) || hasPerm(perms, "hr.manage", "people.manage");
  const [q, setQ] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [editing, setEditing] = React.useState<ResponsibilityRow | "new" | null>(null);
  const [who, setWho] = React.useState("");
  const [whoRows, setWhoRows] = React.useState<{ key: string; rows: WhoOwnsRow[] } | null>(null);

  React.useEffect(() => {
    const needle = who.trim();
    if (needle.length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc("who_owns", { p_q: needle });
      if (alive) setWhoRows({ key: needle, rows: (data || []) as WhoOwnsRow[] });
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [who]);

  const needle = q.trim().toLowerCase();
  const list = rows.filter((r) => (!dept || r.department_id === dept) && (!needle || r.name.toLowerCase().includes(needle) || (r.description || "").toLowerCase().includes(needle) || r.tags.some((t) => t.toLowerCase().includes(needle))));
  const gaps = rows.filter((r) => (r.critical || r.requires_backup) && (!r.backup_id || r.backup_id === r.owner_id));
  const unowned = rows.filter((r) => !r.owner_id);
  const byDept = new Map<string, ResponsibilityRow[]>();
  for (const r of list) { const k = r.department_id || "none"; if (!byDept.has(k)) byDept.set(k, []); byDept.get(k)!.push(r); }
  const whoShown = whoRows && whoRows.key === who.trim() ? whoRows.rows : null;

  async function remove(r: ResponsibilityRow) {
    if (!confirm(`Delete “${r.name}” from the register?`)) return;
    const { error } = await createClient().from("responsibilities").delete().eq("id", r.id);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Removed", "success"); router.refresh();
  }

  return (
    <div className="space-y-[var(--s4)]">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--s2)]">
        <Metric label="Responsibilities" value={rows.length} icon={<ClipboardList size={13} />} />
        <Metric label="Critical" value={rows.filter((r) => r.critical).length} icon={<AlertTriangle size={13} />} />
        <Metric label="Continuity gaps" value={gaps.length} tone={gaps.length ? "text-danger" : undefined} sub="critical without backup" icon={<LifeBuoy size={13} />} />
        <Metric label="Unowned" value={unowned.length} tone={unowned.length ? "text-warn" : undefined} />
      </div>

      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><Search size={15} className="text-[var(--brand-2)]" /> Who owns…?</span>} subtitle="Searches responsibilities, projects, departments and services — with the owner and their backup." />
        <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2">
          <Input value={who} onChange={(e) => setWho(e.target.value)} placeholder="e.g. deployments, brand assets, expense approvals…" />
          {who.trim().length >= 2 && (!whoShown ? <div className="flex justify-center py-3"><Spinner /></div> : whoShown.length === 0 ? <div className="text-xs text-muted">Nothing matches — add it to the register below.</div> : (
            <ul className="divide-y rounded-[var(--radius-sm)] border">
              {whoShown.map((w) => <li key={`${w.kind}:${w.id}`} className="px-3 py-2 flex flex-wrap items-center gap-2 text-sm"><Pill tone={w.kind === "responsibility" ? "tone-brand" : "tone-neutral"}>{humanize(w.kind)}</Pill><span className="font-medium truncate">{w.name}</span>{w.critical && <Pill tone="tone-danger">Critical</Pill>}<span className="text-xs text-muted">{w.department || ""}</span><span className="ml-auto inline-flex items-center gap-3 text-xs"><span className="inline-flex items-center gap-1">Owner: {w.owner_id ? <PersonLine id={w.owner_id} name={w.owner_name} size={16} className="!gap-1" /> : <span className="text-danger">nobody</span>}</span>{w.backup_id && <span className="inline-flex items-center gap-1">Backup: <PersonLine id={w.backup_id} name={w.backup_name} size={16} className="!gap-1" /></span>}</span></li>)}
            </ul>
          ))}
        </div>
      </Card>

      {gaps.length > 0 && <Note tone="danger" icon={<AlertTriangle size={14} />}><span className="font-medium">Continuity gaps:</span> {gaps.map((g) => g.name).join(", ")} — critical responsibilities with no backup (or the owner as their own backup). Assign a backup so leave and exits never stall them.</Note>}

      <Card>
        <CardHeader title="Register" subtitle="Owner, backup, successor, escalation owner, SOP, decision level and RACI for every recurring responsibility." action={canEdit && <Button size="sm" variant="primary" onClick={() => setEditing("new")}><Plus size={14} /> Add</Button>} />
        <div className="px-[var(--s4)] pb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="input pl-8 !h-9 !text-sm w-full" /></div>
          <DepartmentPicker value={dept} onChange={setDept} placeholder="All departments" className="!w-auto !h-9 !text-sm" />
        </div>
        {list.length === 0 ? <EmptyState icon={<ClipboardList size={18} />} title="Nothing in the register" hint="Add the recurring responsibilities of each department so “who owns this?” always has an answer." className="py-[var(--s4)]" /> : (
          <div className="border-t divide-y">
            {[...byDept.entries()].sort((a, b) => (departments.find((d) => d.id === a[0])?.position ?? 99) - (departments.find((d) => d.id === b[0])?.position ?? 99)).map(([deptId, items]) => {
              const d = departments.find((x) => x.id === deptId);
              return (
                <div key={deptId} className="px-[var(--s4)] py-3">
                  <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: d?.color || "var(--line-strong)" }} /><Building2 size={12} /> {d?.name || "Company-wide"} <span className="pill tone-neutral ml-1">{items.length}</span></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {items.map((r) => {
                      const gap = (r.critical || r.requires_backup) && (!r.backup_id || r.backup_id === r.owner_id);
                      return (
                        <div key={r.id} className={cn("rounded-[var(--radius-sm)] border p-2.5 space-y-1.5", gap && "border-[var(--danger)]")}>
                          <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{r.name}</div>{r.description && <div className="text-[11px] text-muted truncate-2">{r.description}</div>}</div>{canEdit && <span className="inline-flex shrink-0"><Button size="xs" variant="ghost" icon onClick={() => setEditing(r)} aria-label="Edit"><Pencil size={12} /></Button><Button size="xs" variant="ghost" icon className="text-danger" onClick={() => remove(r)} aria-label="Delete"><Trash2 size={12} /></Button></span>}</div>
                          <div className="flex flex-wrap gap-1">{r.critical && <Pill tone="tone-danger">Critical</Pill>}{r.decision_level && <Pill tone="tone-violet">{DECISION_LEVELS.find((l) => l.key === r.decision_level)?.label || humanize(r.decision_level)}</Pill>}{r.sop_knowledge_id && <Link href={`/wiki/knowledge/${r.sop_knowledge_id}`} className="pill tone-info"><BookOpen size={10} className="mr-1" />SOP</Link>}{r.tags.map((t) => <Pill key={t} tone="tone-neutral">{t}</Pill>)}</div>
                          <div className="text-xs space-y-0.5">
                            <div className="flex items-center gap-1">Owner: {r.owner_id ? <PersonLine id={r.owner_id} size={14} className="!gap-1" /> : <span className="text-warn">unassigned</span>}</div>
                            <div className="flex items-center gap-1">Backup: {r.backup_id ? <PersonLine id={r.backup_id} size={14} className="!gap-1" /> : <span className={gap ? "text-danger" : "text-muted"}>none</span>}{r.successor_id && <span className="text-muted ml-2 inline-flex items-center gap-1">Successor: <PersonLine id={r.successor_id} size={14} className="!gap-1" /></span>}</div>
                            {r.escalation_owner_id && <div className="flex items-center gap-1 text-muted">Escalates to: <PersonLine id={r.escalation_owner_id} size={14} className="!gap-1" /></div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {editing && <ResponsibilityEditor row={editing === "new" ? null : editing} knowledge={knowledge} teams={teams} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------ Editor */
function ResponsibilityEditor({ row, knowledge, teams, onClose }: { row: ResponsibilityRow | null; knowledge: KnowledgeLite[]; teams: Pick<Tables<"teams">, "id" | "name" | "department_id">[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [name, setName] = React.useState(row?.name || "");
  const [description, setDescription] = React.useState(row?.description || "");
  const [departmentId, setDepartmentId] = React.useState(row?.department_id || profile.department_id || "");
  const [teamId, setTeamId] = React.useState(row?.team_id || "");
  const [owner, setOwner] = React.useState(row?.owner_id || "");
  const [backup, setBackup] = React.useState(row?.backup_id || "");
  const [successor, setSuccessor] = React.useState(row?.successor_id || "");
  const [escalation, setEscalation] = React.useState(row?.escalation_owner_id || "");
  const [sop, setSop] = React.useState(row?.sop_knowledge_id || "");
  const [level, setLevel] = React.useState(row?.decision_level || "");
  const [critical, setCritical] = React.useState(row?.critical || false);
  const [requiresBackup, setRequiresBackup] = React.useState(row?.requires_backup || false);
  const [tags, setTags] = React.useState(row?.tags.join(", ") || "");
  const [raci, setRaci] = React.useState<Raci>(() => parseRaci(row?.raci ?? null));
  const [busy, setBusy] = React.useState(false);
  const addTo = (k: "responsible" | "consulted" | "informed", id: string) => { if (!id) return; setRaci((r) => (r[k].includes(id) ? r : { ...r, [k]: [...r[k], id] })); };
  const dropFrom = (k: "responsible" | "consulted" | "informed", id: string) => setRaci((r) => ({ ...r, [k]: r[k].filter((x) => x !== id) }));

  async function save() {
    if (!profile.org_id || !name.trim()) return;
    setBusy(true);
    const payload = { name: name.trim(), description: description.trim() || null, department_id: departmentId || null, team_id: teamId || null, owner_id: owner || null, backup_id: backup || null, successor_id: successor || null, escalation_owner_id: escalation || null, sop_knowledge_id: sop || null, decision_level: level || null, critical, requires_backup: requiresBackup, tags: tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean), raci: raci as unknown as Json };
    const { error } = row ? await createClient().from("responsibilities").update(payload).eq("id", row.id) : await createClient().from("responsibilities").insert({ org_id: profile.org_id, created_by: profile.id, ...payload });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(row ? "Responsibility updated" : "Added to the register", "success");
    onClose(); router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={row ? `Edit · ${row.name}` : "New responsibility"} width={720} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!name.trim()} onClick={save}><Check size={14} /> Save</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" className="sm:col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website & app deployment" autoFocus /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Department"><DepartmentPicker value={departmentId} onChange={(v) => { setDepartmentId(v); setTeamId(""); }} placeholder="Company-wide" /></Field>
          <Field label="Team"><Select value={teamId} onChange={(e) => setTeamId(e.target.value)}><option value="">No team</option>{teams.filter((t) => !departmentId || t.department_id === departmentId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Owner"><PersonPicker value={owner} onChange={setOwner} placeholder="Who owns it" /></Field>
          <Field label="Backup" hint="Steps in during leave or absence."><PersonPicker value={backup} onChange={setBackup} placeholder="None" /></Field>
          <Field label="Successor" hint="Planned next owner."><PersonPicker value={successor} onChange={setSuccessor} placeholder="None" /></Field>
          <Field label="Escalation owner"><PersonPicker value={escalation} onChange={setEscalation} placeholder="None" /></Field>
          <Field label="SOP (approved knowledge)"><Select value={sop} onChange={(e) => setSop(e.target.value)}><option value="">None</option>{knowledge.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}</Select></Field>
          <Field label="Decision level"><Select value={level} onChange={(e) => setLevel(e.target.value)}><option value="">Not set</option>{DECISION_LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</Select></Field>
          <Field label="Tags" hint="Comma separated — searched by “Who owns…?”" className="sm:col-span-2"><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="deploy, production, rollback" /></Field>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} className="accent-[var(--brand)]" /> Critical to operations</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={requiresBackup} onChange={(e) => setRequiresBackup(e.target.checked)} className="accent-[var(--brand)]" /> Requires a backup</label>
        </div>
        <div className="sunken rounded-[var(--radius-sm)] p-3 space-y-2">
          <div className="eyebrow">RACI</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Accountable (one person)"><PersonPicker value={raci.accountable || ""} onChange={(v) => setRaci((r) => ({ ...r, accountable: v || null }))} placeholder={owner ? "Defaults to owner" : "None"} /></Field>
            {(["responsible", "consulted", "informed"] as const).map((k) => (
              <div key={k}><span className="label capitalize">{k}</span><PersonPicker value="" onChange={(v) => addTo(k, v)} placeholder={`+ Add ${k}`} /><div className="flex flex-wrap gap-1 mt-1">{raci[k].map((id) => <span key={id} className="pill tone-neutral"><PersonLine id={id} size={12} className="!gap-1" /><button type="button" onClick={() => dropFrom(k, id)} className="ml-1 hover:text-[var(--danger)]">×</button></span>)}</div></div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function responsibilityLabel(r: ResponsibilityRow) {
  return `${r.name}${r.critical ? " (critical)" : ""} · owner ${str(r.owner_id, "unassigned")}`;
}
