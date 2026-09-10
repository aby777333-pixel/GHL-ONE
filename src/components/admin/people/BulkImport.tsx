"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRightLeft, Check, ClipboardCopy, FileSpreadsheet, Play, Search, ShieldCheck, ShieldOff, Upload, UserCog, Users, UserX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, ROLE_LABEL } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { Note, PersonLine } from "../AdminBits";
import { csvEscape, endOfDayIso, IMPORT_COLUMNS, jsonArray, jsonObj, num, parseCsv, ROLE_LEVELS, str, todayIso, type ImportRow, type StructurePerson, type SystemRoleRow } from "./lib";

type Validated = ImportRow & { line: number; problems: string[] };
type ImportResult = { created: number; skipped: number; errors: { row: Record<string, string>; error: string }[] };

const TEMPLATE_ROWS: ImportRow[] = [
  { full_name: "Priya Raman", email: "priya@ghlindia.com", designation: "Sales Executive", department: "sales", role: "employee", manager_email: "manager@ghlindia.com", phone: "+91 98xxxxxxx" },
  { full_name: "Arun Kumar", email: "arun@ghlindia.com", designation: "Support Executive", department: "support", role: "employee", manager_email: "manager@ghlindia.com", phone: "" },
];

/** CSV import of people (→ `import_people`) plus bulk role / department / manager actions with impact preview. */
export function BulkImport({ people, systemRoles }: { people: StructurePerson[]; systemRoles?: SystemRoleRow[] }) {
  const [loaded, setLoaded] = React.useState<SystemRoleRow[] | null>(null);
  React.useEffect(() => {
    if (systemRoles) return;
    let alive = true;
    createClient().from("system_roles").select("*").order("is_system", { ascending: false }).order("name").then(({ data }) => { if (alive) setLoaded(data || []); });
    return () => { alive = false; };
  }, [systemRoles]);
  const roles = systemRoles || loaded;
  return (
    <div className="space-y-[var(--s4)]">
      <CsvImport />
      {roles ? <BulkActions people={people} systemRoles={roles} /> : <Card><div className="flex justify-center py-6"><Spinner /></div></Card>}
    </div>
  );
}

/* ---------------------------------------------------------------- CSV */
function CsvImport() {
  const router = useRouter();
  const toast = useToast();
  const { departments, people } = useSession();
  const [text, setText] = React.useState("");
  const [rows, setRows] = React.useState<Validated[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const template = [IMPORT_COLUMNS.join(","), ...TEMPLATE_ROWS.map((r) => IMPORT_COLUMNS.map((c) => csvEscape(r[c])).join(","))].join("\n");

  async function copyTemplate() {
    try { await navigator.clipboard.writeText(template); toast.push("Template copied — paste it into a spreadsheet or editor", "success"); } catch { toast.push("Clipboard blocked — select the template text and copy it", "info"); }
  }

  function onFile(f: File | null) {
    if (!f) return;
    f.text().then((t) => { setText(t); parse(t); });
  }

  function parse(src = text) {
    const cells = parseCsv(src);
    if (cells.length === 0) { setRows([]); return; }
    const header = cells[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const idx = (k: string) => header.indexOf(k);
    const hasHeader = idx("email") >= 0;
    const body = hasHeader ? cells.slice(1) : cells;
    const emails = new Set<string>();
    const out: Validated[] = body.map((r, i) => {
      const get = (k: (typeof IMPORT_COLUMNS)[number], fallback: number) => (hasHeader ? (idx(k) >= 0 ? r[idx(k)] : "") : r[fallback]) || "";
      const row: ImportRow = { full_name: get("full_name", 0).trim(), email: get("email", 1).trim().toLowerCase(), designation: get("designation", 2).trim(), department: get("department", 3).trim(), role: get("role", 4).trim().toLowerCase(), manager_email: get("manager_email", 5).trim().toLowerCase(), phone: get("phone", 6).trim() };
      const problems: string[] = [];
      if (!row.full_name) problems.push("missing name");
      if (!row.email || !/.+@.+\..+/.test(row.email)) problems.push("missing or invalid email");
      if (row.email) { if (emails.has(row.email)) problems.push("duplicate in file"); emails.add(row.email); }
      if (row.email && people.some((p) => p.email.toLowerCase() === row.email)) problems.push("already a member");
      if (row.department && !departments.some((d) => d.slug === row.department.toLowerCase() || d.name.toLowerCase() === row.department.toLowerCase())) problems.push(`unknown department “${row.department}”`);
      if (row.role && !(ROLE_LEVELS as string[]).includes(row.role)) problems.push(`unknown role “${row.role}”`);
      if (row.manager_email && !people.some((p) => p.email.toLowerCase() === row.manager_email)) problems.push(`unknown manager “${row.manager_email}”`);
      return { ...row, line: i + (hasHeader ? 2 : 1), problems };
    });
    setRows(out);
    setResult(null);
  }

  async function run() {
    if (!rows) return;
    const ok = rows.filter((r) => !r.problems.some((p) => p.startsWith("missing") || p.startsWith("duplicate") || p === "already a member"));
    if (!ok.length) return;
    setBusy(true);
    const payload: Json = ok.map((r) => ({ full_name: r.full_name, email: r.email, designation: r.designation || null, department: r.department || null, role: r.role || null, manager_email: r.manager_email || null, phone: r.phone || null }));
    const { data, error } = await createClient().rpc("import_people", { p_rows: payload });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    const o = jsonObj(data);
    const res: ImportResult = { created: num(o.created), skipped: num(o.skipped), errors: jsonArray(o.errors).map((e) => { const eo = jsonObj(e); const ro = jsonObj(eo.row); return { row: Object.fromEntries(Object.entries(ro).map(([k, v]) => [k, str(v)])), error: str(eo.error) }; }) };
    setResult(res);
    toast.push(`${res.created} invite${res.created === 1 ? "" : "s"} created${res.skipped ? ` · ${res.skipped} skipped` : ""}`, res.created ? "success" : "info");
    router.refresh();
  }

  const good = (rows || []).filter((r) => r.problems.length === 0).length;
  const blocking = (rows || []).filter((r) => r.problems.some((p) => p.startsWith("missing") || p.startsWith("duplicate") || p === "already a member")).length;

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><FileSpreadsheet size={16} className="text-[var(--brand-2)]" /> Bulk import</span>} subtitle="Paste or upload a CSV. Rows become invites; each person activates on first sign-in with the right department, role and manager." action={<Button size="sm" variant="secondary" onClick={copyTemplate}><ClipboardCopy size={14} /> Copy template</Button>} />
      <div className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
        <div className="sunken rounded-[var(--radius-sm)] p-2.5 text-[11px] font-mono overflow-x-auto whitespace-pre">{template}</div>
        <div className="text-[11px] text-muted">Columns: {IMPORT_COLUMNS.map((c) => <span key={c} className="font-mono mr-1.5">{c}</span>)}· department = slug or name · role = {ROLE_LEVELS.filter((r) => r !== "super_admin").join(" | ")} · phone is kept in the invite note.</div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-start">
          <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="full_name,email,designation,department,role,manager_email,phone…" className="font-mono !text-xs" />
          <div className="flex lg:flex-col gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={14} /> Upload CSV</Button>
            <Button variant="primary" onClick={() => parse()} disabled={!text.trim()}><Search size={14} /> Preview</Button>
          </div>
        </div>

        {rows && rows.length === 0 && <EmptyState title="No rows found" hint="Check that the file has a header line and at least one data row." className="py-4" />}
        {rows && rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Pill tone="tone-success">{good} ready</Pill>
              {rows.length - good - blocking > 0 && <Pill tone="tone-warn">{rows.length - good - blocking} with warnings (imported without the unknown value)</Pill>}
              {blocking > 0 && <Pill tone="tone-danger">{blocking} skipped</Pill>}
              <span className="ml-auto"><Button size="sm" variant="primary" loading={busy} disabled={rows.length - blocking === 0} onClick={run}><Play size={13} /> Import {rows.length - blocking} people</Button></span>
            </div>
            <div className="overflow-x-auto border rounded-[var(--radius-sm)]">
              <table className="w-full text-xs min-w-[900px]">
                <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted"><th className="px-2 py-1.5 font-medium">#</th>{IMPORT_COLUMNS.map((c) => <th key={c} className="px-2 py-1.5 font-medium">{c.replace(/_/g, " ")}</th>)}<th className="px-2 py-1.5 font-medium">Check</th></tr></thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    const block = r.problems.some((p) => p.startsWith("missing") || p.startsWith("duplicate") || p === "already a member");
                    return (
                      <tr key={r.line} className={cn(block ? "opacity-60" : r.problems.length ? "bg-[var(--warn-bg)]/40" : undefined)}>
                        <td className="px-2 py-1.5 num text-muted">{r.line}</td>
                        {IMPORT_COLUMNS.map((c) => <td key={c} className="px-2 py-1.5 whitespace-nowrap">{r[c] || <span className="text-muted">—</span>}</td>)}
                        <td className="px-2 py-1.5">{r.problems.length === 0 ? <span className="inline-flex items-center gap-1 text-success"><Check size={12} /> OK</span> : <span className={cn("inline-flex items-start gap-1", block ? "text-danger" : "text-warn")}><AlertTriangle size={12} className="mt-0.5 shrink-0" />{r.problems.join("; ")}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {result && (
          <Note tone={result.created ? "success" : "warn"} icon={<Check size={14} />}>
            <span className="font-medium">{result.created} created · {result.skipped} skipped.</span>
            {result.errors.length > 0 && <ul className="mt-1 space-y-0.5">{result.errors.map((e, i) => <li key={i}><span className="font-mono">{e.row.email || e.row.full_name || `row ${i + 1}`}</span> — {e.error}</li>)}</ul>}
          </Note>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------- Bulk actions */
type Action = "role" | "revoke" | "department" | "manager" | "deactivate";

/** The actions that take authority or access away. They get a typed confirmation, not just a preview. */
const DESTRUCTIVE: Action[] = ["revoke", "deactivate"];

function BulkActions({ people, systemRoles }: { people: StructurePerson[]; systemRoles: SystemRoleRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments } = useSession();
  const [q, setQ] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [action, setAction] = React.useState<Action>("role");
  const [roleId, setRoleId] = React.useState(systemRoles[0]?.id || "");
  const [acting, setActing] = React.useState(false);
  const [expires, setExpires] = React.useState("");
  const [toDept, setToDept] = React.useState("");
  const [toManager, setToManager] = React.useState("");
  const [effective, setEffective] = React.useState(() => todayIso());
  const [reason, setReason] = React.useState("");
  const [confirmText, setConfirmText] = React.useState("");
  const [holders, setHolders] = React.useState<Set<string> | null>(null);
  const [preview, setPreview] = React.useState<{ rows: { id: string; name: string; impact: Record<string, Json | undefined> }[] } | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const needle = q.trim().toLowerCase();
  const list = people.filter((p) => p.is_active && (!dept || p.department_id === dept) && (!needle || p.full_name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle) || (p.designation || "").toLowerCase().includes(needle)));
  /*
    You cannot give yourself a security role, take one off yourself, or deactivate your own
    account — the database refuses all three, and a single refusal would fail the whole batch with
    a message about the wrong thing. Filter yourself out here and say so, rather than letting an
    admin who ticked "select visible" wonder why nothing applied.
  */
  const chosenRaw = people.filter((p) => selected.has(p.id));
  const excludesSelf = (["role", "revoke", "deactivate"] as Action[]).includes(action) && selected.has(profile.id);
  const chosen = excludesSelf ? chosenRaw.filter((p) => p.id !== profile.id) : chosenRaw;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allVisible = list.length > 0 && list.every((p) => selected.has(p.id));

  const ready =
    chosen.length > 0 &&
    (action === "role" || action === "revoke" ? !!roleId
      : action === "department" ? !!toDept
      : action === "manager" ? !!toManager
      : true);
  // A destructive batch needs the word typed out, not just a second click on a familiar dialog.
  const confirmed = !DESTRUCTIVE.includes(action) || confirmText.trim().toUpperCase() === "CONFIRM";

  async function openPreview() {
    if (!ready) return;
    setLoadingPreview(true);
    setConfirmText("");
    const sb = createClient();

    // Revoking needs a different question: of the people ticked, who actually holds this role?
    // Revoking from somebody who never had it is a no-op, and saying so up front stops the count
    // in the confirmation from overstating what is about to happen.
    if (action === "revoke") {
      const { data } = await sb
        .from("user_roles")
        .select("user_id")
        .eq("system_role_id", roleId)
        .in("user_id", chosen.map((p) => p.id));
      setHolders(new Set((data || []).map((r) => r.user_id)));
      setLoadingPreview(false);
      setPreview({ rows: chosen.slice(0, 60).map((p) => ({ id: p.id, name: p.full_name, impact: {} })) });
      return;
    }

    // Everything else asks the database what the change would disturb. For deactivation that is
    // exactly the right question — reports left without a manager, approvals left unanswered.
    const rows = await Promise.all(chosen.slice(0, 40).map(async (p) => {
      const { data } = await sb.rpc("change_impact", { p_user: p.id, p_new_manager: action === "manager" ? toManager : undefined, p_new_department: action === "department" ? toDept : undefined });
      return { id: p.id, name: p.full_name, impact: jsonObj(data) };
    }));
    setLoadingPreview(false);
    setPreview({ rows });
  }

  async function apply() {
    if (!ready || !profile.org_id) return;
    setBusy(true);
    const sb = createClient();
    let okCount = 0;
    const errs: string[] = [];
    if (action === "role") {
      const { error } = await sb.from("user_roles").upsert(chosen.map((p) => ({ user_id: p.id, system_role_id: roleId, acting, expires_at: endOfDayIso(expires), granted_by: profile.id, reason: reason.trim() || null })), { onConflict: "user_id,system_role_id" });
      if (error) errs.push(error.message); else okCount = chosen.length;
    } else if (action === "revoke") {
      /* One person at a time. The last-Super-Admin guard refuses the final holder of
         company_super_admin, and a single statement would fail the whole batch without saying
         which person caused it. */
      for (const p of chosen) {
        const { error } = await sb.from("user_roles").delete().eq("user_id", p.id).eq("system_role_id", roleId);
        if (error) errs.push(`${p.full_name}: ${error.message}`); else okCount++;
      }
    } else if (action === "deactivate") {
      for (const p of chosen) {
        const { error } = await sb.from("profiles").update({ is_active: false }).eq("id", p.id);
        if (error) errs.push(`${p.full_name}: ${error.message}`); else okCount++;
      }
    } else if (action === "department") {
      const { error } = await sb.from("employee_transfers").insert(chosen.filter((p) => p.department_id !== toDept).map((p) => ({ org_id: profile.org_id!, user_id: p.id, from_department_id: p.department_id, to_department_id: toDept, from_manager_id: p.manager_id, to_manager_id: toManager || null, effective_on: effective, reason: reason.trim() || null, requested_by: profile.id })));
      if (error) errs.push(error.message); else okCount = chosen.filter((p) => p.department_id !== toDept).length;
    } else {
      for (const p of chosen) {
        if (p.id === toManager) continue;
        const { error } = await sb.rpc("change_manager", { p_user: p.id, p_new_manager: toManager, p_kind: "primary", p_reason: reason.trim() || undefined });
        if (error) errs.push(`${p.full_name}: ${error.message}`); else okCount++;
      }
    }
    setBusy(false);
    setPreview(null);
    if (errs.length) toast.push(`${okCount} applied · ${errs.length} failed — ${errs[0]}`, "danger");
    else toast.push(
      action === "role" ? `${okCount} people now hold ${systemRoles.find((r) => r.id === roleId)?.name}`
      : action === "revoke" ? `${systemRoles.find((r) => r.id === roleId)?.name} removed from ${okCount} ${okCount === 1 ? "person" : "people"}`
      : action === "deactivate" ? `${okCount} account${okCount === 1 ? "" : "s"} deactivated. Their work and history stay; they can be reactivated from People.`
      : action === "department" ? `${okCount} transfer proposal${okCount === 1 ? "" : "s"} created — apply them in Transfers & roles`
      : `${okCount} reporting line${okCount === 1 ? "" : "s"} changed`, "success");
    setConfirmText("");
    setHolders(null);
    setSelected(new Set());
    router.refresh();
  }

  const selectedRole = systemRoles.find((r) => r.id === roleId);

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Users size={16} className="text-[var(--violet)]" /> Bulk actions <span className="pill tone-neutral">{selected.size} selected</span></span>} subtitle="Select people, choose an action, preview the impact, then apply. Department moves become transfer proposals; manager changes apply immediately with history." />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-[var(--s3)] px-[var(--s4)] pb-[var(--s4)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="relative flex-1 min-w-[160px]"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter people…" className="input pl-8 !h-9 !text-sm w-full" /></div>
            <DepartmentPicker value={dept} onChange={setDept} placeholder="All departments" className="!w-auto !h-9 !text-sm" />
            <Button size="sm" variant="ghost" onClick={() => setSelected((s) => { const n = new Set(s); if (allVisible) list.forEach((p) => n.delete(p.id)); else list.forEach((p) => n.add(p.id)); return n; })}>{allVisible ? "Clear visible" : "Select visible"}</Button>
          </div>
          <div className="border rounded-[var(--radius-sm)] max-h-[420px] overflow-y-auto divide-y">
            {list.length === 0 ? <EmptyState title="No people match" className="py-6" /> : list.map((p) => (
              <label key={p.id} className={cn("flex items-center gap-2.5 px-3 py-1.5 cursor-pointer row-hover", selected.has(p.id) && "bg-[var(--brand-bg)]/30")}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="accent-[var(--brand)]" />
                <Avatar name={p.full_name} src={p.avatar_url} size={24} />
                <span className="min-w-0 flex-1"><span className="block text-sm truncate">{p.full_name}</span><span className="block text-[11px] text-muted truncate">{p.designation || p.email} · {departments.find((d) => d.id === p.department_id)?.name || "No department"}</span></span>
                <Pill tone="tone-neutral">{ROLE_LABEL[p.role]}</Pill>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1">
            {([
              ["role", "Give role", <ShieldCheck key="r" size={13} />],
              ["revoke", "Take role", <ShieldOff key="v" size={13} />],
              ["department", "Department", <ArrowRightLeft key="d" size={13} />],
              ["manager", "Manager", <UserCog key="m" size={13} />],
              ["deactivate", "Deactivate", <UserX key="x" size={13} />],
            ] as [Action, string, React.ReactNode][]).map(([k, label, icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => { setAction(k); setConfirmText(""); }}
                className={cn(
                  "inline-flex items-center justify-center gap-1 h-8 px-1 rounded-[var(--radius-sm)] text-xs border transition-colors",
                  action === k && DESTRUCTIVE.includes(k) ? "tone-danger border-transparent font-medium"
                    : action === k ? "tone-brand border-transparent font-medium"
                    : "border-[var(--line)] text-muted hover:text-[var(--fg)]"
                )}
              >
                {icon}{label}
              </button>
            ))}
          </div>
          {excludesSelf && (
            <Note tone="info">You are in the selection. You cannot change your own security roles or deactivate your own account, so you are left out of this action — {chosen.length} {chosen.length === 1 ? "person" : "people"} will be affected.</Note>
          )}
          {action === "role" && (
            <>
              <Field label="System role"><Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>{systemRoles.map((r) => <option key={r.id} value={r.id}>{r.name} · {ROLE_LABEL[r.base_level]}</option>)}</Select></Field>
              {selectedRole && <div className="flex flex-wrap gap-1">{selectedRole.permissions.map((p) => <Pill key={p} tone="tone-neutral">{p}</Pill>)}</div>}
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs inline-flex items-center gap-1.5 h-10"><input type="checkbox" checked={acting} onChange={(e) => setActing(e.target.checked)} className="accent-[var(--brand)]" /> Acting</label>
                <Field label="Expires"><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
              </div>
            </>
          )}
          {action === "department" && (
            <>
              <Field label="To department"><DepartmentPicker value={toDept} onChange={setToDept} placeholder="Choose…" /></Field>
              <Field label="New manager (optional)"><PersonPicker value={toManager} onChange={setToManager} placeholder="Keep current" departmentId={toDept || undefined} /></Field>
              <Field label="Effective on"><Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} /></Field>
            </>
          )}
          {action === "revoke" && (
            <>
              <Field label="Role to remove"><Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>{systemRoles.map((r) => <option key={r.id} value={r.id}>{r.name} · {ROLE_LABEL[r.base_level]}</option>)}</Select></Field>
              {selectedRole && <div className="flex flex-wrap gap-1">{selectedRole.permissions.map((x) => <Pill key={x} tone="tone-neutral">{x}</Pill>)}</div>}
              <Note tone="warn">Removing a role does not remove the person&apos;s access outright — they may still hold the same permissions through their department, their level or another role. Check &ldquo;Why?&rdquo; on someone in Access Control if you need certainty.</Note>
            </>
          )}
          {action === "manager" && <Field label="New manager"><PersonPicker value={toManager} onChange={setToManager} placeholder="Choose…" /></Field>}
          {action === "deactivate" && (
            <Note tone="danger">Deactivating signs people out and removes them from the directory, rooms and assignment lists. Their work, messages and history stay exactly where they are, and the account can be reactivated from People. A company&apos;s last Super Admin cannot be deactivated.</Note>
          )}
          <Field label="Reason" hint="Shared with the people affected and written to history."><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action === "role" ? "e.g. Q4 review panel" : "e.g. Team restructure"} /></Field>
          <Button variant="primary" className="w-full" disabled={!ready} loading={loadingPreview} onClick={openPreview}><Search size={14} /> Preview impact for {chosen.length}</Button>
        </div>
      </div>

      <Modal open={!!preview} onClose={() => { setPreview(null); setConfirmText(""); }} title={DESTRUCTIVE.includes(action) ? "Confirm this change" : "Impact preview"} width={720}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setPreview(null); setConfirmText(""); }}>Cancel</Button>
            <Button
              variant={DESTRUCTIVE.includes(action) ? "danger" : "primary"}
              loading={busy}
              disabled={!confirmed}
              onClick={apply}
            >
              <Play size={14} /> {action === "revoke" ? `Remove from ${chosen.length}` : action === "deactivate" ? `Deactivate ${chosen.length}` : `Apply to ${chosen.length}`}
            </Button>
          </>
        }>
        {preview && (
          <div className="space-y-3">
            <Note tone={DESTRUCTIVE.includes(action) ? "danger" : "info"}>
              {action === "role" ? `Grants “${selectedRole?.name}” to ${chosen.length} people${expires ? ` until ${expires}` : ""}${acting ? " as acting authority" : ""}. Permissions and screens follow immediately; every grant is written to config history and can be undone.`
                : action === "revoke" ? `Removes “${selectedRole?.name}” from ${holders ? holders.size : chosen.length} of the ${chosen.length} selected — the rest do not hold it, and are left alone. Every removal is written to config history.`
                : action === "deactivate" ? `Deactivates ${chosen.length} account${chosen.length === 1 ? "" : "s"}. Anything below that a person is the only owner of will be left without one — read the table before confirming.`
                : action === "department" ? `Creates ${chosen.length} transfer proposal${chosen.length === 1 ? "" : "s"} to ${departments.find((d) => d.id === toDept)?.name}. Applying a transfer swaps department rooms, revokes department-scoped grants and starts the transfer workflow.`
                : `Changes the primary manager of ${chosen.length} people. Pending approvals they raised move to the new manager; everyone is notified; history is kept.`}
            </Note>
            {action === "revoke" ? (
              /* No impact query for a revoke — the honest preview is simply who holds it and who does not. */
              <div className="border rounded-[var(--radius-sm)] divide-y max-h-[320px] overflow-y-auto">
                {preview.rows.map((r) => {
                  const has = holders?.has(r.id) ?? true;
                  return (
                    <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      <PersonLine id={r.id} size={18} />
                      <span className={cn("ml-auto", has ? "text-danger" : "text-muted")}>
                        {has ? "loses this role" : "does not hold it — no change"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
            <div className="overflow-x-auto border rounded-[var(--radius-sm)]">
              <table className="w-full text-xs min-w-[640px]">
                <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted"><th className="px-2 py-1.5 font-medium">Person</th><th className="px-2 py-1.5 font-medium">Reports</th><th className="px-2 py-1.5 font-medium">Pending approvals</th><th className="px-2 py-1.5 font-medium">Rooms</th><th className="px-2 py-1.5 font-medium">Projects</th><th className="px-2 py-1.5 font-medium">Responsibilities</th></tr></thead>
                <tbody className="divide-y">
                  {preview.rows.map((r) => {
                    const im = r.impact;
                    if (im.error) return <tr key={r.id}><td className="px-2 py-1.5"><PersonLine id={r.id} size={18} /></td><td colSpan={5} className="px-2 py-1.5 text-danger">No permission to preview this person</td></tr>;
                    return (
                      <tr key={r.id}>
                        <td className="px-2 py-1.5"><PersonLine id={r.id} size={18} /></td>
                        <td className="px-2 py-1.5 num">{num(im.direct_reports)}</td>
                        <td className="px-2 py-1.5 num">{num(im.pending_approvals_as_approver)} · {num(im.pending_leaves_as_manager)} leaves</td>
                        <td className="px-2 py-1.5">{jsonArray(im.department_rooms_to_leave).length ? `leave ${jsonArray(im.department_rooms_to_leave).length}` : "—"}{jsonArray(im.department_rooms_to_join).length ? ` · join ${jsonArray(im.department_rooms_to_join).length}` : ""}</td>
                        <td className="px-2 py-1.5 num">{jsonArray(im.projects).length}</td>
                        <td className="px-2 py-1.5">{jsonArray(im.responsibilities).length ? jsonArray(im.responsibilities).map((x) => str(jsonObj(x).name)).join(", ") : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
            {action !== "revoke" && chosen.length > 40 && <div className="text-[11px] text-muted">Showing the first 40 of {chosen.length}.</div>}
            {DESTRUCTIVE.includes(action) && (
              <Field label="Type CONFIRM to continue" hint="Typed out in full, so a batch this size is never one stray click.">
                <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="CONFIRM" autoFocus />
              </Field>
            )}
          </div>
        )}
      </Modal>
      {selected.size > 0 && <div className="px-[var(--s4)] pb-3 -mt-2 flex flex-wrap gap-1">{chosen.slice(0, 12).map((p) => <span key={p.id} className="pill tone-neutral">{p.full_name}<button type="button" onClick={() => toggle(p.id)} className="ml-1 hover:text-[var(--danger)]" aria-label="Remove"><X size={10} /></button></span>)}{chosen.length > 12 && <span className="pill tone-muted">+{chosen.length - 12}</span>}</div>}
    </Card>
  );
}

