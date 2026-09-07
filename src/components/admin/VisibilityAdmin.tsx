"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, EyeOff, Search, Route, UserSearch, X, Lock, Check, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Pill, SearchInput, Select, Spinner, Tabs, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, humanize, isManagerPlus, CLASSIFICATION_LABEL, ROLE_LABEL, type Classification, type RoleLevel } from "@/lib/utils";
import { Note, ResourceTypePill } from "./AdminBits";
import { hasPerm } from "./perms";
import { resourceHref } from "./resourceLabels";

type ResourceType = "project" | "file" | "channel";
type Resource = { id: string; name: string; meta?: string };
type Reason = { path: string; kind: string; granted_by?: string };
type WhoRow = { user_id: string; name: string; reasons: Reason[] };
type Explain = { user: string; reasons: Reason[]; has_access: boolean };
type ViewAs = { user: string; role: RoleLevel; department: string | null; projects: { id: string; name: string; classification: string }[]; channels: { id: string; name: string; visibility: string }[]; files_visible: number; tasks_visible: number; is_manager: boolean; admin_perms: string[] };

const REASON_TONE: Record<string, string> = { role: "tone-brand", admin: "tone-violet", grant: "tone-warn", owner: "tone-success", member: "tone-info", classification: "tone-neutral", visibility: "tone-neutral" };
const CLASS_TONE: Record<string, string> = { public: "tone-success", internal: "tone-neutral", confidential: "tone-warn", highly_confidential: "tone-danger", board_only: "tone-danger" };
const VIS_TONE: Record<string, string> = { company_open: "tone-success", department_open: "tone-info", invite_only: "tone-neutral", private: "tone-warn", confidential: "tone-danger", executive_only: "tone-danger" };

export function VisibilityAdmin({ perms, isPrimary }: { perms: string[]; isPrimary: boolean }) {
  const { profile } = useSession();
  const canViewAs = isPrimary || hasPerm(perms, "security.manage");
  const canWho = isManagerPlus(profile.role) || hasPerm(perms, "security.manage");
  const [tool, setTool] = React.useState<"who" | "explain" | "viewas">("who");
  return (
    <div className="space-y-[var(--s3)]">
      <Tabs
        tabs={[
          { key: "who" as const, label: <span className="inline-flex items-center gap-1.5"><Eye size={14} /> Who can see this</span> },
          { key: "explain" as const, label: <span className="inline-flex items-center gap-1.5"><Route size={14} /> Explain access</span> },
          { key: "viewas" as const, label: <span className="inline-flex items-center gap-1.5"><UserSearch size={14} /> View as</span> },
        ]}
        value={tool}
        onChange={setTool}
      />
      {tool === "who" && <WhoCanSee enabled={canWho} />}
      {tool === "explain" && <ExplainAccess />}
      {tool === "viewas" && <ViewAsTool enabled={canViewAs} />}
    </div>
  );
}

/* --------------------------------------------------------- Resource picker */
function ResourcePicker({ type, onType, value, onChange }: { type: ResourceType; onType: (t: ResourceType) => void; value: Resource | null; onChange: (r: Resource | null) => void }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<{ type: ResourceType; list: Resource[] } | null>(null);
  const loading = !state || state.type !== type;

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const sb = createClient();
      let list: Resource[] = [];
      if (type === "project") {
        const { data } = await sb.from("projects").select("id,name,classification,status").eq("archived", false).order("name").limit(500);
        list = (data || []).map((p) => ({ id: p.id, name: p.name, meta: `${CLASSIFICATION_LABEL[p.classification]} · ${humanize(p.status)}` }));
      } else if (type === "file") {
        const { data } = await sb.from("files").select("id,name,classification,folder").order("updated_at", { ascending: false }).limit(500);
        list = (data || []).map((f) => ({ id: f.id, name: f.name, meta: `${CLASSIFICATION_LABEL[f.classification]} · ${f.folder || "/"}` }));
      } else {
        const { data } = await sb.from("channels").select("id,name,visibility,type").neq("type", "dm").eq("archived", false).order("name").limit(500);
        list = (data || []).map((c) => ({ id: c.id, name: `#${c.name}`, meta: `${humanize(c.visibility)} · ${humanize(c.type)}` }));
      }
      if (alive) setState({ type, list });
    })();
    return () => { alive = false; };
  }, [type]);

  const needle = q.trim().toLowerCase();
  const results = (state?.list || []).filter((r) => !needle || r.name.toLowerCase().includes(needle) || (r.meta || "").toLowerCase().includes(needle)).slice(0, 40);

  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 items-start">
      <Select value={type} onChange={(e) => { onType(e.target.value as ResourceType); onChange(null); setQ(""); }}>
        <option value="project">Project</option>
        <option value="file">File</option>
        <option value="channel">Channel</option>
      </Select>
      <div className="relative min-w-0">
        {value ? (
          <div className="input flex items-center gap-2 !h-auto min-h-[40px] py-1.5">
            <ResourceTypePill type={type} /><span className="truncate text-sm flex-1">{value.name}</span>{value.meta && <span className="text-[11px] text-muted hidden sm:inline truncate">{value.meta}</span>}
            <button type="button" onClick={() => onChange(null)} className="text-muted hover:text-[var(--fg)]" aria-label="Clear"><X size={14} /></button>
          </div>
        ) : (
          <>
            <SearchInput value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder={`Search ${type}s…`} />
            {open && (
              <div className="absolute z-30 left-0 right-0 top-full mt-1 card p-1 max-h-[280px] overflow-y-auto anim-pop" style={{ boxShadow: "var(--shadow-lg)" }}>
                {loading ? <div className="flex justify-center py-4"><Spinner /></div> : results.length === 0 ? <div className="text-xs text-muted px-3 py-3">No {type}s match.</div> : results.map((r) => (
                  <button key={r.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(r); setOpen(false); }} className="w-full text-left px-2.5 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--neutral-bg)] flex items-center gap-2 min-w-0">
                    <span className="text-sm truncate flex-1">{r.name}</span>{r.meta && <span className="text-[11px] text-muted truncate max-w-[45%]">{r.meta}</span>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReasonChips({ reasons }: { reasons: Reason[] }) {
  if (!reasons?.length) return <span className="text-xs text-muted">No path</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {reasons.map((r, i) => <Pill key={i} tone={REASON_TONE[r.kind] || "tone-neutral"}>{r.path}{r.granted_by ? ` · by ${r.granted_by}` : ""}</Pill>)}
    </span>
  );
}

/* ------------------------------------------------------------ Who can see */
function WhoCanSee({ enabled }: { enabled: boolean }) {
  const toast = useToast();
  const { people } = useSession();
  const [type, setType] = React.useState<ResourceType>("project");
  const [res, setRes] = React.useState<Resource | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [rows, setRows] = React.useState<{ key: string; list: WhoRow[] } | null>(null);
  const key = res ? `${type}:${res.id}` : "";

  async function run() {
    if (!res) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("who_can_see", { p_type: type, p_id: res.id });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setRows({ key, list: ((data || []) as WhoRow[]).sort((a, b) => a.name.localeCompare(b.name)) });
  }

  const byKind = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows?.list || []) for (const x of r.reasons) m.set(x.kind, (m.get(x.kind) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <Card>
      <CardHeader title="Who can see this" subtitle="Every person who can open a project, file or channel — and the path that lets them." />
      <div className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
        {!enabled && <Note tone="warn" icon={<Lock size={14} />}>This tool is for managers and security admins.</Note>}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
          <div className="flex-1 min-w-0"><ResourcePicker type={type} onType={setType} value={res} onChange={setRes} /></div>
          <Button variant="primary" onClick={run} disabled={!res || !enabled} loading={busy}><Search size={14} /> Check</Button>
        </div>
        {rows && rows.key === key && (
          <div className="border-t pt-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-medium">{rows.list.length} {rows.list.length === 1 ? "person" : "people"} can see</span> <ResourceTypePill type={type} /> <span className="text-sm">{res?.name}</span>
              {resourceHref(type, res?.id || null) && <Link href={resourceHref(type, res!.id)!} className="text-xs link">Open →</Link>}
              <span className="flex-1" />
              {byKind.map(([k, n]) => <Pill key={k} tone={REASON_TONE[k] || "tone-neutral"}>{humanize(k)} · {n}</Pill>)}
            </div>
            {rows.list.length === 0 ? <EmptyState icon={<EyeOff size={18} />} title="Nobody can see this" hint="Only the system can reach it. Check the owner and classification." className="py-6" /> : (
              <div className="divide-y">
                {rows.list.map((r) => {
                  const p = people.find((x) => x.id === r.user_id);
                  return (
                    <div key={r.user_id} className="py-2 flex flex-col sm:flex-row sm:items-center gap-2">
                      <Link href={`/people/${r.user_id}`} className="inline-flex items-center gap-2 sm:w-[240px] shrink-0 min-w-0"><Avatar name={r.name} src={p?.avatar_url} size={24} /><span className="text-sm truncate">{r.name}</span>{p && <span className="text-[11px] text-muted truncate hidden lg:inline">{ROLE_LABEL[p.role]}</span>}</Link>
                      <ReasonChips reasons={r.reasons} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------- Explain access */
function ExplainAccess() {
  const toast = useToast();
  const [user, setUser] = React.useState("");
  const [type, setType] = React.useState<ResourceType>("project");
  const [res, setRes] = React.useState<Resource | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [out, setOut] = React.useState<{ key: string; data: Explain } | null>(null);
  const key = `${user}|${type}:${res?.id || ""}`;

  async function run() {
    if (!user || !res) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("explain_access", { p_user: user, p_type: type, p_id: res.id });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setOut({ key, data: data as unknown as Explain });
  }

  return (
    <Card>
      <CardHeader title="Explain access" subtitle="Why can (or can't) this person see this? Read the permission path in plain words." />
      <div className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_auto] gap-2 items-end">
          <Field label="Person"><PersonPicker value={user} onChange={setUser} placeholder="Choose a person…" /></Field>
          <Field label="Resource"><ResourcePicker type={type} onType={setType} value={res} onChange={setRes} /></Field>
          <Button variant="primary" onClick={run} disabled={!user || !res} loading={busy}><Route size={14} /> Explain</Button>
        </div>
        {out && out.key === key && (
          <div className="border-t pt-3 space-y-3">
            <Note tone={out.data.has_access ? "success" : "danger"} icon={out.data.has_access ? <Check size={14} /> : <EyeOff size={14} />}>
              <span className="font-medium">{out.data.user}</span> {out.data.has_access ? "can see" : "cannot see"} <span className="font-medium">{res?.name}</span>{out.data.has_access ? ` through ${out.data.reasons.length} path${out.data.reasons.length === 1 ? "" : "s"}.` : ". No role, membership, classification or grant gives them a way in — they can request access from the resource itself."}
            </Note>
            {out.data.reasons.length > 0 && (
              <ol className="space-y-1.5">
                {out.data.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm"><span className="w-5 h-5 rounded-full sunken text-[11px] num flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span><span className="min-w-0"><Pill tone={REASON_TONE[r.kind] || "tone-neutral"} className="mr-1.5">{humanize(r.kind)}</Pill>{r.path}{r.granted_by && <span className="text-muted"> · granted by {r.granted_by}</span>}</span></li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- View as */
function ViewAsTool({ enabled }: { enabled: boolean }) {
  const toast = useToast();
  const { people } = useSession();
  const [user, setUser] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [out, setOut] = React.useState<{ user: string; data: ViewAs } | null>(null);
  const person = people.find((p) => p.id === user);

  async function run() {
    if (!user) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("view_as", { p_user: user });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setOut({ user, data: data as unknown as ViewAs });
  }

  const d = out?.user === user ? out.data : null;
  return (
    <Card>
      <CardHeader title="View as" subtitle="What would this person see? A read-only simulation of their permissions." />
      <div className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
        <Note tone="info" icon={<Info size={14} />}>Simulation — you are not impersonating this user; nothing is opened on their behalf and this check is logged in the audit trail.</Note>
        {!enabled && <Note tone="warn" icon={<Lock size={14} />}>View-as is limited to the primary admin and security admins.</Note>}
        <div className="grid grid-cols-1 sm:grid-cols-[320px_auto] gap-2 items-end">
          <Field label="Person"><PersonPicker value={user} onChange={setUser} placeholder="Choose a person…" /></Field>
          <Button variant="primary" onClick={run} disabled={!user || !enabled} loading={busy}><UserSearch size={14} /> Simulate</Button>
        </div>
        {d && (
          <div className="border-t pt-3 space-y-[var(--s3)]">
            <div className="flex flex-wrap items-center gap-2">
              <Avatar name={d.user} src={person?.avatar_url} size={32} />
              <div className="min-w-0"><div className="text-sm font-medium">{d.user}</div><div className="text-[11px] text-muted">{d.department || "No department"}</div></div>
              <Pill tone="tone-brand">{ROLE_LABEL[d.role] || d.role}</Pill>
              {d.is_manager && <Pill tone="tone-info">Manager-level</Pill>}
              {d.admin_perms.map((n) => <Pill key={n} tone="tone-violet">{n}</Pill>)}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--s2)]">
              <div className="card px-3 py-2.5"><div className="text-[11px] text-muted">Projects</div><div className="text-xl font-semibold num">{d.projects.length}</div></div>
              <div className="card px-3 py-2.5"><div className="text-[11px] text-muted">Channels</div><div className="text-xl font-semibold num">{d.channels.length}</div></div>
              <div className="card px-3 py-2.5"><div className="text-[11px] text-muted">Files visible</div><div className="text-xl font-semibold num">{d.files_visible}</div></div>
              <div className="card px-3 py-2.5"><div className="text-[11px] text-muted">Open tasks visible</div><div className="text-xl font-semibold num">{d.tasks_visible}</div></div>
            </div>
            <div className="grid lg:grid-cols-2 gap-[var(--s3)]">
              <div>
                <div className="eyebrow mb-1.5">Projects they can open</div>
                {d.projects.length === 0 ? <div className="text-xs text-muted">None.</div> : (
                  <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                    {d.projects.map((p) => <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-2 py-1 px-1 rounded-[var(--radius-sm)] row-hover"><span className="text-sm truncate flex-1">{p.name}</span><Pill tone={CLASS_TONE[p.classification] || "tone-neutral"}>{CLASSIFICATION_LABEL[p.classification as Classification] || humanize(p.classification)}</Pill></Link>)}
                  </div>
                )}
              </div>
              <div>
                <div className="eyebrow mb-1.5">Channels they can open</div>
                {d.channels.length === 0 ? <div className="text-xs text-muted">None.</div> : (
                  <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                    {d.channels.map((c) => <Link key={c.id} href={`/chat/${c.id}`} className={cn("flex items-center gap-2 py-1 px-1 rounded-[var(--radius-sm)] row-hover")}><span className="text-sm truncate flex-1">#{c.name}</span><Pill tone={VIS_TONE[c.visibility] || "tone-neutral"}>{humanize(c.visibility)}</Pill></Link>)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
