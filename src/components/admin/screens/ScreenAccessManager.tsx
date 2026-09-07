"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Building2, Check, Crown, Eye, FlaskConical, Home, Info, LayoutGrid, Layers, Save, Search, ShieldCheck, User, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, Field, Input, Pill, Select, Spinner, Tabs, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, isAdminRole, ROLE_LABEL, type RoleLevel } from "@/lib/utils";
import { Note, PersonLine, Switch } from "../AdminBits";
import { hasPerm } from "../perms";
import { HOME_CARD_KEYS, HOME_CARD_LABEL, parseNavLayout, previewScreens, QUICK_ACTION_OPTIONS, ROLE_LEVELS, SCREEN_GROUP_LABEL, SCREEN_GROUPS, endOfDayIso, type EffectiveScreen, type NavLayout, type NavLayoutRow, type ScreenRow, type ScreenRuleRow, type SystemRoleRow } from "../people/lib";

type Scope = "default" | "department" | "role" | "user";
const SCOPE_LABEL: Record<Scope, string> = { default: "Company default", department: "Department", role: "System role", user: "Individual" };
const SCOPE_ICON: Record<Scope, React.ReactNode> = { default: <Building2 size={13} />, department: <Layers size={13} />, role: <ShieldCheck size={13} />, user: <User size={13} /> };

export type ScreenData = { screens: ScreenRow[]; rules: ScreenRuleRow[]; systemRoles: SystemRoleRow[]; navLayouts: NavLayoutRow[] };

/** Screen Access Manager — who sees which screens, with precedence, preview-as, test access and the screen designer. */
export function ScreenAccessManager({ initial, orgId, perms }: { initial: ScreenData; orgId: string; perms: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments, people } = useSession();
  const canEdit = isAdminRole(profile.role) || hasPerm(perms, "features.manage", "security.manage");
  const [rules, setRules] = React.useState(initial.rules);
  const [layouts, setLayouts] = React.useState(initial.navLayouts);
  const [nowMs] = React.useState(() => Date.now());
  const [view, setView] = React.useState<"access" | "designer">("access");
  const [scope, setScope] = React.useState<Scope>("default");
  const [scopeId, setScopeId] = React.useState("");
  const [expiry, setExpiry] = React.useState("");
  const [saving, setSaving] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    const sb = createClient();
    const [{ data: r }, { data: n }] = await Promise.all([sb.from("screen_rules").select("*"), sb.from("nav_layouts").select("*")]);
    setRules(r || []);
    setLayouts(n || []);
  }, []);

  const effectiveScopeId = scope === "default" ? null : scopeId || null;
  const scopeReady = scope === "default" || !!scopeId;
  const ruleFor = (key: string) => rules.find((r) => r.scope === scope && (r.scope_id || null) === effectiveScopeId && r.screen_key === key && (!r.expires_at || new Date(r.expires_at).getTime() > nowMs));

  async function setRule(key: string, v: "inherit" | "allow" | "deny") {
    if (!scopeReady || !canEdit) return;
    setSaving(key);
    const sb = createClient();
    const existing = rules.find((r) => r.scope === scope && (r.scope_id || null) === effectiveScopeId && r.screen_key === key);
    let error: { message: string } | null = null;
    if (v === "inherit") { if (existing) ({ error } = await sb.from("screen_rules").delete().eq("id", existing.id)); }
    else if (existing) ({ error } = await sb.from("screen_rules").update({ allowed: v === "allow", expires_at: endOfDayIso(expiry), set_by: profile.id }).eq("id", existing.id));
    else ({ error } = await sb.from("screen_rules").insert({ org_id: orgId, scope, scope_id: effectiveScopeId, screen_key: key, allowed: v === "allow", expires_at: endOfDayIso(expiry), set_by: profile.id }));
    setSaving(null);
    if (error) { toast.push(error.message, "danger"); return; }
    await reload();
    router.refresh();
  }

  const scopeLabel = scope === "default" ? "the whole company" : scope === "department" ? departments.find((d) => d.id === scopeId)?.name || "a department" : scope === "role" ? initial.systemRoles.find((r) => r.id === scopeId)?.name || "a role" : people.find((p) => p.id === scopeId)?.full_name || "a person";

  return (
    <div className="space-y-[var(--s4)]">
      <Note tone="info" icon={<Info size={14} />}>
        <span className="font-medium">Precedence:</span> Individual override → Role rule → System role → Department rule → Department default → Company default → System default. A rule higher in the chain wins; “Inherit” means the next level decides. The shell navigation and the route guard both use <span className="font-mono">effective_screens</span>, so hiding a menu item always hides the page too.
        {!canEdit && <span className="block mt-1">Read-only — needs Feature flags or Security permissions.</span>}
      </Note>

      <Tabs<"access" | "designer"> tabs={[{ key: "access", label: <span className="inline-flex items-center gap-1.5"><LayoutGrid size={13} /> Access matrix</span> }, { key: "designer", label: <span className="inline-flex items-center gap-1.5"><Home size={13} /> Screen designer</span> }]} value={view} onChange={setView} />

      <Card>
        <CardHeader title="Scope" subtitle="Rules are written for exactly this scope. Switch scope to see what is set at each level." />
        <div className="px-[var(--s4)] pb-[var(--s4)] flex flex-wrap items-end gap-2">
          <div className="flex gap-1 rounded-[var(--radius-sm)] border p-0.5">
            {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => <button key={s} type="button" onClick={() => { setScope(s); setScopeId(""); }} className={cn("inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--radius-sm)] text-xs transition-colors", scope === s ? "tone-brand font-medium" : "text-muted hover:text-[var(--fg)]")}>{SCOPE_ICON[s]}{SCOPE_LABEL[s]}</button>)}
          </div>
          {scope === "department" && <DepartmentPicker value={scopeId} onChange={setScopeId} placeholder="Choose a department…" className="!w-auto min-w-[200px]" />}
          {scope === "role" && <Select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className="!w-auto min-w-[200px]"><option value="">Choose a system role…</option>{initial.systemRoles.map((r) => <option key={r.id} value={r.id}>{r.name} · {ROLE_LABEL[r.base_level]}</option>)}</Select>}
          {scope === "user" && <PersonPicker value={scopeId} onChange={setScopeId} placeholder="Choose a person…" className="!w-auto min-w-[220px]" />}
          {view === "access" && <Field label="Expiry for new rules (optional)"><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="!h-9 !text-xs" /></Field>}
        </div>
      </Card>

      {view === "access" ? (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-[var(--s4)] items-start">
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2">Screens for {scopeLabel}</span>} subtitle={scopeReady ? "ON / OFF write a rule at this scope; Inherit removes it." : "Pick a scope target first."} />
            <div className="border-t">
              {SCREEN_GROUPS.map((g) => {
                const list = initial.screens.filter((s) => s.grp === g);
                if (!list.length) return null;
                return (
                  <div key={g} className="px-[var(--s4)] py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-1">{SCREEN_GROUP_LABEL[g] || g}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {list.map((s) => {
                        const r = ruleFor(s.key);
                        const v = r ? (r.allowed ? "allow" : "deny") : "inherit";
                        return (
                          <div key={s.key} className={cn("flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5", saving === s.key && "animate-pulse")}>
                            <span className="min-w-0 flex-1">
                              <span className="text-sm inline-flex items-center gap-1.5">{s.label}{s.admin_only && <Crown size={11} className="text-muted" />}</span>
                              <span className="block text-[10px] text-muted truncate">{s.path} · default {ROLE_LABEL[s.default_min_level]}+{s.external_ok ? " · guests ok" : ""}{r?.expires_at ? ` · rule until ${r.expires_at.slice(0, 10)}` : ""}</span>
                            </span>
                            <span className="inline-flex rounded-full border overflow-hidden text-[10px] shrink-0">
                              {(["inherit", "allow", "deny"] as const).map((o) => <button key={o} type="button" disabled={!canEdit || !scopeReady} onClick={() => setRule(s.key, o)} className={cn("px-2 h-6 transition-colors disabled:opacity-50", v === o ? (o === "allow" ? "tone-success" : o === "deny" ? "tone-danger" : "tone-neutral font-medium") : "text-muted hover:bg-[var(--neutral-bg)]")}>{o === "inherit" ? "Inherit" : o === "allow" ? "ON" : "OFF"}</button>)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <div className="space-y-[var(--s4)]">
            <PreviewAs data={{ ...initial, rules }} nowMs={nowMs} />
            <TestAccess screens={initial.screens} />
          </div>
        </div>
      ) : (
        <ScreenDesigner data={{ ...initial, rules }} layouts={layouts} scope={scope} scopeId={effectiveScopeId} scopeReady={scopeReady} scopeLabel={scopeLabel} orgId={orgId} canEdit={canEdit} nowMs={nowMs} onSaved={reload} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------- Preview as */
function PreviewAs({ data, nowMs }: { data: ScreenData; nowMs: number }) {
  const { departments } = useSession();
  const [mode, setMode] = React.useState<"user" | "role" | "department">("user");
  const [id, setId] = React.useState("");
  const [level, setLevel] = React.useState<RoleLevel>("employee");
  const [loaded, setLoaded] = React.useState<{ key: string; rows: EffectiveScreen[] } | null>(null);
  const key = `${mode}:${id}:${level}`;

  React.useEffect(() => {
    if (mode !== "user" || !id) return;
    let alive = true;
    createClient().rpc("effective_screens", { p_user: id }).then(({ data: rows }) => { if (alive) setLoaded({ key, rows: (rows || []) as EffectiveScreen[] }); });
    return () => { alive = false; };
  }, [mode, id, key]);

  let rows: EffectiveScreen[] | null = null;
  if (mode === "user") rows = loaded && loaded.key === key ? loaded.rows : null;
  else if (mode === "role" && id) { const r = data.systemRoles.find((x) => x.id === id); rows = r ? previewScreens({ screens: data.screens, rules: data.rules, level: r.base_level, roleIds: [r.id], roles: [r], nowMs }) : null; }
  else if (mode === "department" && id) rows = previewScreens({ screens: data.screens, rules: data.rules, level, roleIds: [], roles: [], departmentId: id, department: departments.find((d) => d.id === id) || null, nowMs });

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Eye size={15} className="text-[var(--brand-2)]" /> Preview as</span>} subtitle="A person is computed by the database; a role or department is simulated with the same precedence." />
      <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2">
        <div className="flex gap-1">{(["user", "role", "department"] as const).map((m) => <button key={m} type="button" onClick={() => { setMode(m); setId(""); }} className={cn("flex-1 h-8 rounded-[var(--radius-sm)] text-xs border transition-colors", mode === m ? "tone-brand border-transparent font-medium" : "border-[var(--line)] text-muted")}>{m === "user" ? "Person" : m === "role" ? "Role" : "Department"}</button>)}</div>
        {mode === "user" && <PersonPicker value={id} onChange={setId} placeholder="Choose a person…" />}
        {mode === "role" && <Select value={id} onChange={(e) => setId(e.target.value)}><option value="">Choose a role…</option>{data.systemRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}
        {mode === "department" && <div className="grid grid-cols-2 gap-2"><DepartmentPicker value={id} onChange={setId} placeholder="Department…" /><Select value={level} onChange={(e) => setLevel(e.target.value as RoleLevel)}>{ROLE_LEVELS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></div>}
        {id && !rows && mode === "user" && <div className="flex justify-center py-4"><Spinner /></div>}
        {rows && (
          <div className="space-y-2">
            <div className="text-[11px] text-muted">Navigation ({rows.filter((r) => r.allowed).length} of {rows.length})</div>
            <ul className="rounded-[var(--radius-sm)] border divide-y max-h-[360px] overflow-y-auto">
              {rows.map((r) => <li key={r.key} className={cn("flex items-center gap-2 px-2.5 py-1.5 text-sm", !r.allowed && "opacity-50")}><span className={cn("w-1.5 h-1.5 rounded-full shrink-0", r.allowed ? "bg-[var(--success)]" : "bg-[var(--line-strong)]")} /><span className="flex-1 truncate">{r.label}</span><span className="text-[10px] text-muted truncate max-w-[150px]">{r.source}</span></li>)}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------- Test access */
function TestAccess({ screens }: { screens: ScreenRow[] }) {
  const [user, setUser] = React.useState("");
  const [screen, setScreen] = React.useState(screens[0]?.key || "");
  const [result, setResult] = React.useState<{ key: string; row: EffectiveScreen | null } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const key = `${user}:${screen}`;
  async function test() {
    if (!user || !screen) return;
    setBusy(true);
    const { data } = await createClient().rpc("effective_screens", { p_user: user });
    setBusy(false);
    setResult({ key, row: ((data || []) as EffectiveScreen[]).find((r) => r.key === screen) || null });
  }
  const shown = result && result.key === key ? result.row : null;
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><FlaskConical size={15} className="text-[var(--violet)]" /> Test access</span>} subtitle="Can this person open this screen, and why?" />
      <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2">
        <PersonPicker value={user} onChange={setUser} placeholder="Person…" />
        <div className="flex gap-2"><Select value={screen} onChange={(e) => setScreen(e.target.value)}>{screens.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select><Button variant="primary" loading={busy} disabled={!user} onClick={test}><Search size={14} /> Test</Button></div>
        {shown && <div className={cn("rounded-[var(--radius-sm)] border p-3 text-sm flex items-start gap-2", shown.allowed ? "tone-success" : "tone-danger")}><span className="mt-0.5">{shown.allowed ? <Check size={14} /> : <Zap size={14} />}</span><div><div className="font-medium flex items-center gap-2"><PersonLine id={user} size={16} showName={false} />{shown.allowed ? "Allowed" : "Blocked"} · {shown.label}</div><div className="text-xs mt-0.5">Source: {shown.source}</div></div></div>}
        {result && result.key === key && !shown && <Note tone="warn">The person is frozen or the screen is not in their catalogue.</Note>}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------- Screen designer */
function ScreenDesigner({ data, layouts, scope, scopeId, scopeReady, scopeLabel, orgId, canEdit, nowMs, onSaved }: { data: ScreenData; layouts: NavLayoutRow[]; scope: Scope; scopeId: string | null; scopeReady: boolean; scopeLabel: string; orgId: string; canEdit: boolean; nowMs: number; onSaved: () => Promise<void> }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments, people } = useSession();
  const existing = layouts.find((l) => l.scope === scope && (l.scope_id || null) === scopeId) || null;
  const layoutKey = `${scope}:${scopeId || ""}:${existing?.updated_at || ""}`;
  const [seeded, setSeeded] = React.useState("");
  const [layout, setLayout] = React.useState<NavLayout>(() => parseNavLayout(existing));
  const [busy, setBusy] = React.useState(false);
  if (seeded !== layoutKey) { setSeeded(layoutKey); setLayout(parseNavLayout(existing)); }

  // The candidate nav is what this scope may see (simulated with the same precedence).
  const allowed = React.useMemo(() => {
    if (scope === "user" && scopeId) { const p = people.find((x) => x.id === scopeId); return previewScreens({ screens: data.screens, rules: data.rules, level: p?.role || "employee", roleIds: [], roles: [], departmentId: p?.department_id || null, department: departments.find((d) => d.id === p?.department_id) || null, userId: scopeId, nowMs }).filter((s) => s.allowed); }
    if (scope === "role" && scopeId) { const r = data.systemRoles.find((x) => x.id === scopeId); return r ? previewScreens({ screens: data.screens, rules: data.rules, level: r.base_level, roleIds: [r.id], roles: [r], nowMs }).filter((s) => s.allowed) : []; }
    if (scope === "department" && scopeId) return previewScreens({ screens: data.screens, rules: data.rules, level: "employee", roleIds: [], roles: [], departmentId: scopeId, department: departments.find((d) => d.id === scopeId) || null, nowMs }).filter((s) => s.allowed);
    return previewScreens({ screens: data.screens, rules: data.rules, level: "employee", roleIds: [], roles: [], nowMs }).filter((s) => s.allowed);
  }, [scope, scopeId, data, departments, people, nowMs]);

  const ordered = React.useMemo(() => {
    const keys = layout.nav.filter((k) => allowed.some((a) => a.key === k));
    const rest = allowed.map((a) => a.key).filter((k) => !keys.includes(k));
    return [...keys, ...rest];
  }, [layout.nav, allowed]);
  const hidden = new Set(layout.home_cards.filter((c) => c.hidden).map((c) => c.key));

  function move(key: string, dir: -1 | 1) {
    const i = ordered.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    const next = ordered.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    setLayout((l) => ({ ...l, nav: next }));
  }
  function toggleCard(key: string) {
    setLayout((l) => ({ ...l, home_cards: HOME_CARD_KEYS.map((k) => ({ key: k, hidden: k === key ? !hidden.has(k) : hidden.has(k) })) }));
  }
  function toggleQuick(key: string) {
    setLayout((l) => ({ ...l, quick_actions: l.quick_actions.includes(key) ? l.quick_actions.filter((k) => k !== key) : [...l.quick_actions, key] }));
  }
  async function save() {
    if (!scopeReady || !canEdit) return;
    setBusy(true);
    const sb = createClient();
    const payload = { nav: ordered, home_cards: HOME_CARD_KEYS.map((k) => ({ key: k, hidden: hidden.has(k) })), quick_actions: layout.quick_actions, updated_by: profile.id, updated_at: new Date().toISOString() };
    const { error } = existing ? await sb.from("nav_layouts").update(payload).eq("id", existing.id) : await sb.from("nav_layouts").insert({ org_id: orgId, scope, scope_id: scopeId, ...payload });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`Layout saved for ${scopeLabel}`, "success");
    await onSaved();
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-[var(--s4)] items-start">
      <div className="space-y-[var(--s4)]">
        <Card>
          <CardHeader title={`Navigation order · ${scopeLabel}`} subtitle="Only screens this scope can see are listed. Order is stored in nav_layouts and resolved user → role → department → default." action={canEdit && <Button size="sm" variant="primary" loading={busy} disabled={!scopeReady} onClick={save}><Save size={14} /> Save layout</Button>} />
          <ul className="divide-y border-t">
            {ordered.map((k, i) => { const s = data.screens.find((x) => x.key === k); return (
              <li key={k} className="flex items-center gap-2 px-[var(--s4)] py-1.5 text-sm"><span className="num text-[11px] text-muted w-5">{i + 1}</span><span className="flex-1 truncate">{s?.label || k}</span><span className="text-[10px] text-muted">{SCREEN_GROUP_LABEL[s?.grp || ""] || s?.grp}</span><Button size="xs" variant="ghost" icon disabled={!canEdit || i === 0} onClick={() => move(k, -1)} aria-label="Up"><ArrowUp size={12} /></Button><Button size="xs" variant="ghost" icon disabled={!canEdit || i === ordered.length - 1} onClick={() => move(k, 1)} aria-label="Down"><ArrowDown size={12} /></Button></li>
            ); })}
          </ul>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--s4)]">
          <Card>
            <CardHeader title="Home cards" subtitle="Hide cards that do not apply to this scope." />
            <div className="px-[var(--s4)] pb-[var(--s4)] space-y-1.5">{HOME_CARD_KEYS.map((k) => <div key={k} className="flex items-center justify-between gap-2 text-sm"><span>{HOME_CARD_LABEL[k]}</span><Switch size="sm" on={!hidden.has(k)} onChange={() => toggleCard(k)} disabled={!canEdit} /></div>)}</div>
          </Card>
          <Card>
            <CardHeader title="Quick actions" subtitle="Shown on Home and in the command palette." />
            <div className="px-[var(--s4)] pb-[var(--s4)] flex flex-wrap gap-1.5">{QUICK_ACTION_OPTIONS.map((q) => <button key={q.key} type="button" disabled={!canEdit} onClick={() => toggleQuick(q.key)} className={cn("pill pill-lg", layout.quick_actions.includes(q.key) ? "tone-brand" : "tone-neutral")}>{q.label}</button>)}</div>
          </Card>
        </div>
      </div>
      <Card className="p-3">
        <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><Eye size={12} /> Live preview</div>
        <div className="rounded-[var(--radius-sm)] border overflow-hidden">
          <div className="flex">
            <div className="w-[104px] shrink-0 sunken p-2 space-y-0.5">
              {ordered.slice(0, 14).map((k) => <div key={k} className="text-[10px] px-1.5 py-1 rounded-[var(--radius-sm)] bg-[var(--bg-elev)] truncate">{data.screens.find((s) => s.key === k)?.label || k}</div>)}
              {ordered.length > 14 && <div className="text-[9px] text-muted px-1.5">+{ordered.length - 14} more</div>}
            </div>
            <div className="flex-1 p-2 space-y-1.5 min-w-0">
              <div className="flex flex-wrap gap-1">{layout.quick_actions.map((q) => <span key={q} className="pill tone-brand text-[9px]">{QUICK_ACTION_OPTIONS.find((x) => x.key === q)?.label || q}</span>)}</div>
              {HOME_CARD_KEYS.filter((k) => !hidden.has(k)).map((k) => <div key={k} className="rounded-[var(--radius-sm)] border px-2 py-1.5 text-[10px]"><div className="font-medium">{HOME_CARD_LABEL[k]}</div><div className="h-1.5 mt-1 rounded-full sunken w-3/4" /></div>)}
            </div>
          </div>
        </div>
        <div className="text-[11px] text-muted mt-2 flex items-center gap-1"><Pill tone="tone-neutral">{ordered.length} screens</Pill><Pill tone="tone-neutral">{HOME_CARD_KEYS.length - hidden.size} cards</Pill>{existing && <span>· saved {existing.updated_at.slice(0, 10)}</span>}</div>
      </Card>
    </div>
  );
}
