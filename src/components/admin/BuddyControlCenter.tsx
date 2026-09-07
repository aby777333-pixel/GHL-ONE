"use client";

import * as React from "react";
import { AlertTriangle, BookOpen, Bot, Check, ClipboardList, Flag, Pencil, RefreshCw, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, Card, CardHeader, EmptyState, Input, Modal, Pill, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { ago, cn, humanize, isAdminRole, type Tables } from "@/lib/utils";
import { KnowledgeEditor, emptyKnowledge, type KnowledgeDraft } from "@/components/ai/KnowledgeEditor";
import { Note, PersonLine, Switch } from "./AdminBits";

type Assistant = Tables<"ai_assistants">;
type Owner = Tables<"ai_knowledge_owners">;
type Feedback = Tables<"ai_feedback">;
type Action = Tables<"ai_actions">;

export const ACTION_LEVELS: { level: number; label: string; hint: string }[] = [
  { level: 1, label: "Answer", hint: "Answers questions only." },
  { level: 2, label: "Suggest", hint: "Suggests actions in words; never proposes cards." },
  { level: 3, label: "Draft", hint: "Shows read-only drafts — people copy them out." },
  { level: 4, label: "Prepare", hint: "Prepares editable proposals the person confirms." },
  { level: 5, label: "Execute with confirmation", hint: "Full proposals — tasks, requests, leave, escalations — each confirmed by a human." },
  { level: 6, label: "Automatic (workflows)", hint: "Only inside approved automation workflows. Still audited." },
];
export const DATA_SCOPES: { key: string; label: string }[] = [
  { key: "tasks", label: "Tasks" }, { key: "projects", label: "Projects" }, { key: "chat", label: "Chat" }, { key: "files", label: "Files" }, { key: "wiki", label: "Wiki" }, { key: "knowledge", label: "Knowledge" },
  { key: "people", label: "People" }, { key: "attendance_self", label: "Own attendance" }, { key: "leave_self", label: "Own leave" }, { key: "help", label: "Help desk" }, { key: "decisions", label: "Decisions" }, { key: "meetings", label: "Meetings" },
];
const RATING_TONE: Record<string, string> = { helpful: "tone-success", not_helpful: "tone-neutral", incorrect: "tone-danger", outdated: "tone-warn", unsafe: "tone-danger" };
const ACTION_TONE: Record<string, string> = { proposed: "tone-neutral", confirmed: "tone-info", performed: "tone-success", dismissed: "tone-neutral", failed: "tone-danger" };

/** AI control center for Super Admin / ai.manage: assistants, permission matrix, knowledge owners, feedback queue, activity log. */
export function BuddyControlCenter() {
  const { profile, departments, people } = useSession();
  const toast = useToast();
  const [canEdit, setCanEdit] = React.useState<boolean | null>(isAdminRole(profile.role) ? true : null);
  const [assistants, setAssistants] = React.useState<Assistant[] | null>(null);
  const [owners, setOwners] = React.useState<Owner[] | null>(null);
  const [feedback, setFeedback] = React.useState<(Feedback & { excerpt?: string | null })[] | null>(null);
  const [actions, setActions] = React.useState<Action[] | null>(null);
  const [tick, setTick] = React.useState(0);
  const [editing, setEditing] = React.useState<Assistant | null>(null);
  const [addOwner, setAddOwner] = React.useState<{ dept: string; user: string } | null>(null);
  const [guidance, setGuidance] = React.useState<{ draft: KnowledgeDraft; feedbackId: string } | null>(null);
  const [showAllActions, setShowAllActions] = React.useState(false);

  React.useEffect(() => {
    if (canEdit !== null) return;
    let alive = true;
    createClient().rpc("has_admin_perm", { perm: "ai.manage" }).then(({ data }) => alive && setCanEdit(!!data));
    return () => {
      alive = false;
    };
  }, [canEdit]);

  React.useEffect(() => {
    let alive = true;
    const supabase = createClient();
    Promise.all([
      supabase.from("ai_assistants").select("*").order("position"),
      supabase.from("ai_knowledge_owners").select("*"),
      supabase.from("ai_feedback").select("*").in("rating", ["incorrect", "outdated", "unsafe"]).order("created_at", { ascending: false }).limit(100),
      supabase.from("ai_actions").select("*").order("created_at", { ascending: false }).limit(80),
    ]).then(async ([a, o, f, ac]) => {
      if (!alive) return;
      setAssistants(a.data || []);
      setOwners(o.data || []);
      setActions(ac.data || []);
      const rows = f.data || [];
      const ids = rows.map((r) => r.message_id).filter((x): x is string => !!x);
      const excerpts = new Map<string, string>();
      if (ids.length) {
        const { data: msgs } = await supabase.from("ai_messages").select("id,content").in("id", ids);
        for (const m of msgs || []) excerpts.set(m.id, m.content);
      }
      if (alive) setFeedback(rows.map((r) => ({ ...r, excerpt: r.message_id ? excerpts.get(r.message_id) ?? null : null })));
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  const reload = () => setTick((t) => t + 1);

  /* ---------- assistants */
  const saveAssistant = async (id: string, patch: Partial<Assistant>) => {
    if (!canEdit) return;
    const prev = assistants;
    setAssistants((s) => (s || []).map((a) => (a.id === id ? { ...a, ...patch } : a)));
    const { error } = await createClient().from("ai_assistants").update(patch).eq("id", id);
    if (error) {
      setAssistants(prev);
      toast.push(error.message, "danger");
    }
  };
  const toggleDept = (a: Assistant, deptId: string) => {
    const set = new Set(a.department_ids || departments.map((d) => d.id));
    if (set.has(deptId)) set.delete(deptId);
    else set.add(deptId);
    const arr = [...set];
    saveAssistant(a.id, { department_ids: arr.length === 0 || arr.length === departments.length ? null : arr });
  };
  const toggleScope = (a: Assistant, key: string) => {
    const set = new Set(a.data_scopes || []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    saveAssistant(a.id, { data_scopes: [...set] });
  };

  /* ---------- owners */
  const removeOwner = async (o: Owner) => {
    if (!canEdit) return;
    const { error } = await createClient().from("ai_knowledge_owners").delete().match({ department_id: o.department_id, user_id: o.user_id });
    if (error) return toast.push(error.message, "danger");
    setOwners((s) => (s || []).filter((x) => !(x.department_id === o.department_id && x.user_id === o.user_id)));
  };
  const insertOwner = async () => {
    if (!addOwner?.dept || !addOwner.user) return;
    const { error } = await createClient().from("ai_knowledge_owners").insert({ org_id: profile.org_id!, department_id: addOwner.dept, user_id: addOwner.user });
    if (error) return toast.push(error.message, "danger");
    setOwners((s) => [...(s || []), { org_id: profile.org_id!, department_id: addOwner.dept, user_id: addOwner.user }]);
    setAddOwner(null);
    toast.push("Knowledge owner added", "success");
  };

  /* ---------- feedback */
  const resolve = async (f: Feedback) => {
    const { error } = await createClient().from("ai_feedback").update({ resolved_at: new Date().toISOString(), resolved_by: profile.id }).eq("id", f.id);
    if (error) return toast.push(error.message, "danger");
    setFeedback((s) => (s || []).map((x) => (x.id === f.id ? { ...x, resolved_at: new Date().toISOString(), resolved_by: profile.id } : x)));
  };
  const promoteToGuidance = (f: Feedback & { excerpt?: string | null }) => {
    const base = emptyKnowledge(f.department_id || profile.department_id);
    const title = (f.note || "").split("\n")[0].replace(/^Knowledge “([^”]+)”.*$/, "$1").slice(0, 120) || "Corrected guidance";
    setGuidance({ feedbackId: f.id, draft: { ...base, title, body: [f.excerpt ? `> Previous AI answer (flagged as ${f.rating}):\n> ${f.excerpt.replace(/\n/g, "\n> ")}` : "", f.note ? `**Correction from ${personName(f.user_id)}:** ${f.note}` : "", "\n## Approved guidance\n\n"].filter(Boolean).join("\n\n"), kind: "faq", source_type: "correction", source_id: f.id } });
  };

  const personName = (id: string | null) => (id ? people.find((p) => p.id === id)?.full_name || "Former member" : "—");
  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name || "Department" : "Company");
  const openFeedback = (feedback || []).filter((f) => !f.resolved_at);
  const scopeMatrix = assistants || [];

  return (
    <div className="space-y-[var(--s4)]">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="h2 inline-flex items-center gap-2"><Bot size={18} /> GHL Buddy control center</div>
          <div className="text-sm text-muted">Assistants, what they may do and see, who approves knowledge, and what people flagged.</div>
        </div>
        <div className="inline-flex items-center gap-2">
          {canEdit === false && <Pill tone="tone-warn"><ShieldCheck size={11} /> Read-only · needs ai.manage</Pill>}
          <Button size="sm" variant="ghost" onClick={reload}><RefreshCw size={13} /> Refresh</Button>
        </div>
      </div>

      {/* Assistants */}
      <Card>
        <CardHeader title="Assistants" subtitle="Role-aware personas. Auto-selection: new joiner → department head → manager → department persona → general." />
        {!assistants ? (
          <div className="p-[var(--s4)] space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : assistants.length === 0 ? (
          <EmptyState title="No assistants seeded" hint="Run migration 0011_ai_buddy.sql to seed the ten personas." />
        ) : (
          <div className="divide-y">
            {assistants.map((a) => {
              const lvl = ACTION_LEVELS.find((l) => l.level === a.action_level);
              const allDepts = !a.department_ids;
              return (
                <div key={a.id} className={cn("px-[var(--s4)] py-3 space-y-2.5", !a.enabled && "opacity-70")}>
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{a.name}</span>
                        <Pill tone="tone-neutral" className="num">{a.key}</Pill>
                        {a.model && <Pill tone="tone-info" className="num">{a.model}</Pill>}
                        {a.daily_limit ? <Pill tone="tone-warn">{a.daily_limit}/day</Pill> : <Pill tone="tone-neutral">unlimited</Pill>}
                      </div>
                      {a.description && <div className="text-xs text-muted mt-0.5">{a.description}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="xs" variant="ghost" onClick={() => setEditing(a)} disabled={!canEdit}><Pencil size={12} /> Personality &amp; limits</Button>
                      <Switch on={a.enabled} onChange={(v) => saveAssistant(a.id, { enabled: v })} disabled={!canEdit} label={a.enabled ? "On" : "Off"} size="sm" />
                    </div>
                  </div>
                  <div className="grid gap-2 lg:grid-cols-[220px_minmax(0,1fr)] items-start">
                    <label className="block">
                      <span className="text-[11px] text-muted block mb-1">Action level</span>
                      <Select value={a.action_level} onChange={(e) => saveAssistant(a.id, { action_level: Number(e.target.value) })} disabled={!canEdit} className="!h-8 !text-xs">
                        {ACTION_LEVELS.map((l) => <option key={l.level} value={l.level}>{l.level} · {l.label}</option>)}
                      </Select>
                      {lvl && <span className="text-[10px] text-muted block mt-1">{lvl.hint}</span>}
                    </label>
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[11px] text-muted mr-1">Departments:</span>
                        <button type="button" disabled={!canEdit} onClick={() => saveAssistant(a.id, { department_ids: allDepts ? [] : null })} className={cn("pill cursor-pointer", allDepts ? "tone-violet" : "tone-neutral")}>All</button>
                        {departments.map((d) => {
                          const on = allDepts || (a.department_ids || []).includes(d.id);
                          return <button key={d.id} type="button" disabled={!canEdit} onClick={() => toggleDept(a, d.id)} className={cn("pill cursor-pointer", on && !allDepts ? "tone-info" : "tone-neutral", allDepts && "opacity-60")}>{d.name}</button>;
                        })}
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[11px] text-muted mr-1">Data scopes:</span>
                        {DATA_SCOPES.map((s) => {
                          const on = (a.data_scopes || []).includes(s.key);
                          return (
                            <label key={s.key} className={cn("pill cursor-pointer select-none", on ? "tone-success" : "tone-neutral", !canEdit && "cursor-default")}>
                              <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleScope(a, s.key)} disabled={!canEdit} />
                              {on ? <Check size={10} /> : <X size={10} />} {s.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Permission matrix + usage limits */}
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-[var(--s3)]">
        <Card>
          <CardHeader title="Permission matrix" subtitle="Read-only view: which assistant may read which data. RLS still applies on top for every request." />
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-left text-[11px] text-muted border-b">
                  <th className="px-4 py-2 font-medium">Assistant</th>
                  {DATA_SCOPES.map((s) => <th key={s.key} className="px-1.5 py-2 font-medium text-center whitespace-nowrap" title={s.label}>{s.label.split(" ")[0]}</th>)}
                </tr>
              </thead>
              <tbody>
                {scopeMatrix.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-4 py-1.5 whitespace-nowrap">{a.name}{!a.enabled && <span className="text-muted"> (off)</span>}</td>
                    {DATA_SCOPES.map((s) => {
                      const on = (a.data_scopes || []).includes(s.key);
                      return <td key={s.key} className="px-1.5 py-1.5 text-center">{on ? <Check size={13} className="inline text-success" /> : <span className="text-muted">·</span>}</td>;
                    })}
                  </tr>
                ))}
                {scopeMatrix.length === 0 && <tr><td colSpan={13} className="px-4 py-4 text-center text-muted">No assistants</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Usage limits" subtitle="Requests per person per day" />
          <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2 text-sm">
            <p className="text-muted text-xs">Limits are per assistant (edit under <em>Personality &amp; limits</em>). Empty = unlimited. Counted from <code>ai_usage</code> rows whose feature starts with <code>buddy</code>, reset at midnight IST. When someone hits the limit they see a friendly note and the human handoff buttons keep working.</p>
            <ul className="text-xs space-y-1">
              {(assistants || []).map((a) => <li key={a.id} className="flex items-center justify-between gap-2"><span className="truncate">{a.name}</span><span className="num text-muted">{a.daily_limit ? `${a.daily_limit} / day` : "unlimited"}</span></li>)}
            </ul>
            <Note tone="info" className="mt-2">Org default suggestion: 60/day for general staff, 150/day for IT and managers. Costs are estimated in the usage tables below.</Note>
          </div>
        </Card>
      </div>

      {/* Knowledge owners */}
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><BookOpen size={15} /> Knowledge owners</span>} subtitle="Who approves department knowledge and receives flagged answers. Department heads and AI admins always count as owners." action={canEdit ? <Button size="sm" variant="secondary" onClick={() => setAddOwner({ dept: departments[0]?.id || "", user: "" })}><UserPlus size={13} /> Add owner</Button> : undefined} />
        {!owners ? (
          <div className="p-[var(--s4)]"><Skeleton className="h-10 w-full" /></div>
        ) : (
          <div className="divide-y">
            {departments.map((d) => {
              const list = owners.filter((o) => o.department_id === d.id);
              return (
                <div key={d.id} className="px-[var(--s4)] py-2.5 flex items-start gap-3 flex-wrap">
                  <div className="w-44 shrink-0 flex items-center gap-2 min-w-0"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} /><span className="text-sm font-medium truncate">{d.name}</span></div>
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                    {d.head_id && <span className="pill tone-neutral" title="Department head (implicit owner)"><PersonLine id={d.head_id} size={16} className="!gap-1" /> <span className="text-[10px] text-muted">head</span></span>}
                    {list.map((o) => (
                      <span key={o.user_id} className="pill tone-info">
                        <PersonLine id={o.user_id} size={16} className="!gap-1" />
                        {canEdit && <button type="button" onClick={() => removeOwner(o)} className="ml-0.5 hover:text-[var(--danger)]" aria-label="Remove owner"><X size={10} /></button>}
                      </span>
                    ))}
                    {!list.length && !d.head_id && <span className="text-xs text-muted inline-flex items-center gap-1"><AlertTriangle size={11} /> No owner — flagged answers go to the primary admin</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Feedback queue */}
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><Flag size={15} /> Feedback queue</span>} subtitle="Answers flagged as incorrect, outdated or unsafe. Turn a correction into approved guidance so it never repeats." action={<Pill tone={openFeedback.length ? "tone-warn" : "tone-success"}>{openFeedback.length} open</Pill>} />
        {!feedback ? (
          <div className="p-[var(--s4)]"><Skeleton className="h-10 w-full" /></div>
        ) : feedback.length === 0 ? (
          <EmptyState icon={<Check size={18} />} title="Nothing flagged" hint="Flags from Helpful / Incorrect / Outdated / Unsafe buttons land here." className="py-6" />
        ) : (
          <div className="divide-y">
            {feedback.map((f) => (
              <div key={f.id} className={cn("px-[var(--s4)] py-3 flex items-start gap-3", f.resolved_at && "opacity-60")}>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <Pill tone={RATING_TONE[f.rating] || "tone-neutral"}>{humanize(f.rating)}</Pill>
                    <span className="text-muted">from</span><PersonLine id={f.user_id} size={16} className="!gap-1" />
                    <span className="text-muted">· {deptName(f.department_id)} · {ago(f.created_at)}</span>
                    {f.routed_to && <span className="text-muted inline-flex items-center gap-1">· routed to <PersonLine id={f.routed_to} size={16} className="!gap-1" /></span>}
                    {f.resolved_at && <Pill tone="tone-success"><Check size={10} /> resolved</Pill>}
                  </div>
                  {f.note && <div className="text-sm">{f.note}</div>}
                  {f.excerpt ? <div className="text-xs text-muted truncate-2 rounded-[var(--radius-sm)] sunken border px-2 py-1.5">{f.excerpt}</div> : f.message_id ? <div className="text-[11px] text-muted">Answer text is only visible to the person who asked.</div> : null}
                </div>
                {!f.resolved_at && (
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="xs" variant="secondary" onClick={() => promoteToGuidance(f)}><BookOpen size={12} /> Use as approved guidance</Button>
                    <Button size="xs" variant="ghost" onClick={() => resolve(f)}><Check size={12} /> Resolve</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Activity log */}
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><ClipboardList size={15} /> Buddy activity</span>} subtitle="Every proposal and what happened to it. The AI never executes — people confirm." action={actions && actions.length > 20 ? <Button size="xs" variant="ghost" onClick={() => setShowAllActions((s) => !s)}>{showAllActions ? "Show fewer" : `Show all ${actions.length}`}</Button> : undefined} />
        {!actions ? (
          <div className="p-[var(--s4)]"><Skeleton className="h-10 w-full" /></div>
        ) : actions.length === 0 ? (
          <EmptyState icon={<Users size={18} />} title="No activity yet" hint="Proposals appear here as soon as Buddy suggests one." className="py-6" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-[11px] text-muted border-b">
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Person</th>
                  <th className="px-3 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {(showAllActions ? actions : actions.slice(0, 20)).map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-4 py-1.5 text-xs text-muted whitespace-nowrap num">{ago(a.created_at)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap"><PersonLine id={a.user_id} size={18} /></td>
                    <td className="px-3 py-1.5 text-xs">{humanize(a.kind)}</td>
                    <td className="px-3 py-1.5 truncate max-w-[280px]">{(a.payload as { title?: string } | null)?.title || "—"}</td>
                    <td className="px-4 py-1.5 text-right"><Pill tone={ACTION_TONE[a.status] || "tone-neutral"}>{a.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit assistant modal */}
      {editing && (
        <AssistantEditor a={editing} onClose={() => setEditing(null)} onSave={async (patch) => { await saveAssistant(editing.id, patch); setEditing(null); toast.push("Saved", "success"); }} />
      )}

      {/* Add owner */}
      <Modal open={!!addOwner} onClose={() => setAddOwner(null)} title="Add knowledge owner" width={460} footer={<><Button variant="ghost" onClick={() => setAddOwner(null)}>Cancel</Button><Button variant="primary" onClick={insertOwner} disabled={!addOwner?.dept || !addOwner?.user}><UserPlus size={14} /> Add</Button></>}>
        {addOwner && (
          <div className="space-y-3">
            <label className="block"><span className="label">Department</span>
              <Select value={addOwner.dept} onChange={(e) => setAddOwner({ ...addOwner, dept: e.target.value })}>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </label>
            <label className="block"><span className="label">Person</span><PersonPicker value={addOwner.user} onChange={(v) => setAddOwner({ ...addOwner, user: v })} placeholder="Pick a person" /></label>
            <p className="text-xs text-muted">Owners approve drafts, receive incorrect/outdated/unsafe flags and can archive guidance.</p>
          </div>
        )}
      </Modal>

      {/* Use feedback as approved guidance */}
      {guidance && (
        <KnowledgeEditor
          open
          onClose={() => setGuidance(null)}
          initial={guidance.draft}
          canApprove
          onSaved={async (_id, approved) => {
            const f = feedback?.find((x) => x.id === guidance.feedbackId);
            if (f && approved) await resolve(f);
            setGuidance(null);
          }}
        />
      )}
    </div>
  );
}

function AssistantEditor({ a, onClose, onSave }: { a: Assistant; onClose: () => void; onSave: (patch: Partial<Assistant>) => Promise<void> }) {
  const [name, setName] = React.useState(a.name);
  const [description, setDescription] = React.useState(a.description || "");
  const [personality, setPersonality] = React.useState(a.personality);
  const [limit, setLimit] = React.useState(a.daily_limit ? String(a.daily_limit) : "");
  const [model, setModel] = React.useState(a.model || "");
  const [busy, setBusy] = React.useState(false);
  return (
    <Modal open onClose={onClose} title={`Edit ${a.name}`} width={640} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={async () => { setBusy(true); await onSave({ name: name.trim() || a.name, description: description.trim() || null, personality: personality.trim() || a.personality, daily_limit: limit ? Math.max(1, Number(limit)) : null, model: model.trim() || null }); setBusy(false); }}>Save</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block"><span className="label">Name</span><Input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block"><span className="label">Description</span><Input value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label className="block"><span className="label">Daily limit per person</span><Input type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Unlimited" /></label>
          <label className="block"><span className="label">Model override</span><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="default (AI_MODEL)" className="num" /></label>
        </div>
        <label className="block">
          <span className="label">Personality (appended to the system prompt)</span>
          <Textarea value={personality} onChange={(e) => setPersonality(e.target.value)} className="!min-h-[180px] text-sm" />
          <span className="block text-[11px] text-muted mt-1">Keep the non-negotiables: no guessing, permission-aware, propose-don&apos;t-execute. Describe tone and what this persona leads with.</span>
        </label>
        <Note tone="neutral" icon={<Trash2 size={13} />}>Assistants can be switched off but not deleted — auto-selection falls through to the next persona.</Note>
      </div>
    </Modal>
  );
}
