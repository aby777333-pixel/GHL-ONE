"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy, Inbox, MessagesSquare, Plus, Save, Settings, ShieldCheck, Trash2, UserPlus, Webhook, FileText, Wand2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, Textarea, useToast } from "@/components/ui";
import { PersonPicker, DepartmentPicker } from "@/components/pickers";
import { ROLE_LABEL, cn, type RoleLevel } from "@/lib/utils";
import { CHANNEL_LABEL, errText, type ConnectSettings, type InboxMemberRow, type InboxRow, type InboxRuleRow, type TemplateRow } from "./lib";

type Tab = "inboxes" | "templates" | "settings" | "permissions";
const LEVELS: RoleLevel[] = ["super_admin", "director", "executive", "department_head", "manager", "team_lead", "employee", "intern", "consultant", "vendor", "guest"];
const CONNECT_PERMS = ["connect.use", "connect.send", "connect.call", "connect.approve", "connect.manage", "connect.view_all"];

export function ConnectAdmin() {
  const { profile, departments, people } = useSession();
  const toast = useToast();
  const [tab, setTab] = React.useState<Tab>("inboxes");
  const [inboxes, setInboxes] = React.useState<InboxRow[]>([]);
  const [members, setMembers] = React.useState<InboxMemberRow[]>([]);
  const [rules, setRules] = React.useState<InboxRuleRow[]>([]);
  const [templates, setTemplates] = React.useState<TemplateRow[]>([]);
  const [settings, setSettings] = React.useState<ConnectSettings | null>(null);
  const [roleDefaults, setRoleDefaults] = React.useState<{ level: RoleLevel; permissions: string[] }[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const refresh = () => setTick((t) => t + 1);

  React.useEffect(() => {
    let alive = true;
    const supabase = createClient();
    Promise.all([
      supabase.from("inboxes").select("*").order("name"),
      supabase.from("inbox_members").select("*"),
      supabase.from("inbox_rules").select("*").order("sort_order"),
      supabase.from("comm_templates").select("*").order("scope").order("name"),
      supabase.rpc("connect_settings"),
      supabase.from("role_defaults").select("level,permissions"),
    ]).then(([i, m, r, t, s, rd]) => {
      if (!alive) return;
      setInboxes(i.data || []);
      setMembers(m.data || []);
      setRules(r.data || []);
      setTemplates(t.data || []);
      setSettings((s.data as unknown as ConnectSettings) || null);
      setRoleDefaults((rd.data || []) as { level: RoleLevel; permissions: string[] }[]);
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const current = inboxes.find((i) => i.id === selected) || null;

  return (
    <div className="page">
      <PageHeader eyebrow="GHL Connect" title="Connect admin" subtitle="Shared inboxes, who works them, routing rules, templates and company-wide sending policy." actions={<Link href="/connect" className="btn btn-secondary btn-sm"><MessagesSquare size={14} /> Inbox</Link>} />
      <Tabs<Tab> tabs={[{ key: "inboxes", label: "Inboxes", count: inboxes.length }, { key: "templates", label: "Templates", count: templates.length }, { key: "settings", label: "Settings" }, { key: "permissions", label: "Permissions" }]} value={tab} onChange={setTab} className="mb-[var(--s3)]" />

      {tab === "inboxes" && (
        <div className="grid lg:grid-cols-[300px_1fr] gap-[var(--s3)] items-start">
          <Card>
            <CardHeader title="Inboxes" action={<Button size="xs" variant="primary" onClick={() => setSelected("new")}><Plus size={12} /> New</Button>} />
            <div className="divide-y">
              {inboxes.map((i) => (
                <button key={i.id} className={cn("w-full text-left px-[var(--s4)] py-2.5 row-hover flex items-center gap-2", selected === i.id && "bg-[var(--neutral-bg)]")} onClick={() => setSelected(i.id)}>
                  <span className="w-7 h-7 rounded-full sunken flex items-center justify-center text-muted"><Inbox size={13} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm truncate">{i.name}{!i.active && <span className="pill tone-neutral ml-1">off</span>}</span>
                    <span className="block text-[11px] text-muted truncate">{CHANNEL_LABEL[i.kind] || i.kind}{i.address ? ` · ${i.address}` : ""} · {members.filter((m) => m.inbox_id === i.id).length} members</span>
                  </span>
                </button>
              ))}
              {inboxes.length === 0 && <div className="px-4 py-6 text-sm text-muted text-center">No inboxes yet.</div>}
            </div>
          </Card>
          <div className="space-y-[var(--s3)] min-w-0">
            {selected === "new" || current ? (
              <InboxEditor key={selected} inbox={selected === "new" ? null : current} onSaved={(id) => { setSelected(id); refresh(); }} onDeleted={() => { setSelected(null); refresh(); }} />
            ) : (
              <Card><EmptyState icon={<Inbox size={18} />} title="Pick an inbox" hint="Or create a new shared inbox for a team." /></Card>
            )}
            {current && (
              <>
                <Card>
                  <CardHeader title="Inbound webhooks" subtitle="Point your email or messaging bridge at these URLs. Resend / Gmail / Outlook / Twilio / Exotel / WhatsApp Cloud adapters are integration-ready stubs — they only need to POST the normalised payload." />
                  <div className="px-[var(--s4)] pb-[var(--s3)] space-y-2">
                    <CopyRow icon={<Webhook size={13} />} label="Email" value={`${origin}/api/hooks/email/${current.webhook_token}`} />
                    <CopyRow icon={<Webhook size={13} />} label="Message / call" value={`${origin}/api/hooks/message/${current.webhook_token}`} />
                    <p className="text-[11px] text-muted">Email payload: <code className="kbd">from, from_name, subject, text, html, message_id, in_reply_to, to[], cc[]</code> · Message payload: <code className="kbd">from, name, text, external_id</code>. Outbound email goes through Resend when <code className="kbd">RESEND_API_KEY</code> is set.</p>
                  </div>
                </Card>
                <MembersCard inbox={current} members={members.filter((m) => m.inbox_id === current.id)} onChanged={refresh} />
                <RulesCard inbox={current} rules={rules.filter((r) => r.inbox_id === current.id)} onChanged={refresh} />
              </>
            )}
          </div>
        </div>
      )}

      {tab === "templates" && <TemplatesTab templates={templates} onChanged={refresh} />}

      {tab === "settings" && settings && <SettingsTab settings={settings} onSaved={(s) => { setSettings(s); toast.push("Settings saved", "success"); }} />}

      {tab === "permissions" && (
        <Card>
          <CardHeader title="Who has Connect access" subtitle="Read-only summary of role defaults and department defaults. Change them in Admin → Roles / Organization Control; individual overrides and expiry live there too." />
          <div className="overflow-x-auto px-[var(--s4)] pb-[var(--s3)]">
            <table className="w-full text-xs min-w-[640px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted border-b">
                <tr><th className="py-2 pr-3 font-medium">Role level</th>{CONNECT_PERMS.map((p) => <th key={p} className="py-2 px-2 font-medium">{p.replace("connect.", "")}</th>)}</tr>
              </thead>
              <tbody>
                {LEVELS.map((l) => {
                  const perms = roleDefaults.find((r) => r.level === l)?.permissions || [];
                  return (
                    <tr key={l} className="border-b last:border-0">
                      <td className="py-1.5 pr-3">{ROLE_LABEL[l]}</td>
                      {CONNECT_PERMS.map((p) => <td key={p} className="py-1.5 px-2">{perms.includes(p) ? <Check size={13} className="text-success" /> : <span className="text-muted">—</span>}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-4 eyebrow">Department defaults</div>
            <div className="mt-2 grid sm:grid-cols-2 gap-2">
              {departments.map((d) => {
                const dp = (d as unknown as { default_permissions?: string[] }).default_permissions || [];
                const has = dp.filter((p) => p.startsWith("connect."));
                const memberCount = people.filter((p) => p.department_id === d.id).length;
                return (
                  <div key={d.id} className="rounded-[var(--radius-sm)] border px-3 py-2">
                    <div className="flex items-center justify-between"><span className="text-sm">{d.name}</span><span className="text-[11px] text-muted">{memberCount} people</span></div>
                    <div className="text-[11px] text-muted mt-0.5">{has.length ? has.map((p) => p.replace("connect.", "")).join(", ") : "No department-level Connect defaults (role defaults apply)"}</div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted mt-3 inline-flex items-center gap-1"><ShieldCheck size={11} /> Probation and interns need supervisor approval before anything leaves the company (see Settings). Viewing as {profile.full_name}.</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function CopyRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const toast = useToast();
  const [ok, setOk] = React.useState(false);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-muted shrink-0">{icon}</span>
      <span className="text-xs w-24 shrink-0">{label}</span>
      <code className="text-[11px] truncate flex-1 sunken rounded px-2 py-1">{value}</code>
      <Button size="xs" icon onClick={async () => { try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); } catch { toast.push("Copy failed — select the text instead", "danger"); } }} aria-label="Copy">{ok ? <Check size={12} /> : <Copy size={12} />}</Button>
    </div>
  );
}

/* ------------------------------------------------------------ inbox form */
function InboxEditor({ inbox, onSaved, onDeleted }: { inbox: InboxRow | null; onSaved: (id: string) => void; onDeleted: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [f, setF] = React.useState({
    name: inbox?.name || "",
    kind: inbox?.kind || "email",
    address: inbox?.address || "",
    department_id: inbox?.department_id || "",
    visibility: inbox?.visibility || "members",
    assignment: inbox?.assignment || "claim",
    sla_first_reply_minutes: String(inbox?.sla_first_reply_minutes ?? 120),
    sla_resolve_hours: String(inbox?.sla_resolve_hours ?? 48),
    provider: inbox?.provider || "manual",
    signature: inbox?.signature || "",
    active: inbox?.active ?? true,
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return toast.push("Name is required", "danger");
    setBusy(true);
    const row = { name: f.name.trim(), kind: f.kind, address: f.address.trim() || null, department_id: f.department_id || null, visibility: f.visibility, assignment: f.assignment, sla_first_reply_minutes: Number(f.sla_first_reply_minutes) || 120, sla_resolve_hours: Number(f.sla_resolve_hours) || 48, provider: f.provider || null, signature: f.signature.trim() || null, active: f.active };
    const supabase = createClient();
    const { data, error } = inbox ? await supabase.from("inboxes").update(row).eq("id", inbox.id).select("id").single() : await supabase.from("inboxes").insert({ ...row, org_id: profile.org_id!, created_by: profile.id }).select("id").single();
    setBusy(false);
    if (error || !data) return toast.push(errText(error), "danger");
    toast.push(inbox ? "Inbox saved" : "Inbox created — add members next", "success");
    onSaved(data.id);
  }
  async function remove() {
    if (!inbox || !confirm(`Delete "${inbox.name}"? Conversations keep their history but lose the inbox link.`)) return;
    const { error } = await createClient().from("inboxes").delete().eq("id", inbox.id);
    if (error) return toast.push(errText(error), "danger");
    onDeleted();
  }

  return (
    <Card>
      <CardHeader title={inbox ? inbox.name : "New inbox"} subtitle={inbox ? "Shared inbox settings" : "A shared address a team works together"} action={inbox && <Button size="xs" variant="ghost" onClick={remove} className="text-danger"><Trash2 size={12} /> Delete</Button>} />
      <form onSubmit={save} className="px-[var(--s4)] pb-[var(--s4)] grid sm:grid-cols-2 gap-3">
        <Field label="Name"><Input value={f.name} onChange={set("name")} placeholder="Sales inbox" required /></Field>
        <Field label="Kind">
          <Select value={f.kind} onChange={set("kind")}>
            <option value="email">Email</option><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="chat">Chat</option>
          </Select>
        </Field>
        <Field label={f.kind === "email" ? "Address (From)" : "Number"}><Input value={f.address} onChange={set("address")} placeholder={f.kind === "email" ? "sales@ghl.example" : "+91…"} /></Field>
        <Field label="Department"><DepartmentPicker value={f.department_id} onChange={(v) => setF((x) => ({ ...x, department_id: v }))} /></Field>
        <Field label="Visibility" hint="Who can see conversations in this inbox">
          <Select value={f.visibility} onChange={set("visibility")}>
            <option value="members">Members only</option><option value="department">Whole department</option><option value="company">Whole company</option>
          </Select>
        </Field>
        <Field label="Assignment">
          <Select value={f.assignment} onChange={set("assignment")}>
            <option value="claim">Agents claim</option><option value="round_robin">Round robin (available agents under their cap)</option><option value="manual">Supervisor assigns</option>
          </Select>
        </Field>
        <Field label="First-reply SLA (minutes)"><Input type="number" min={5} value={f.sla_first_reply_minutes} onChange={set("sla_first_reply_minutes")} /></Field>
        <Field label="Resolve SLA (hours)"><Input type="number" min={1} value={f.sla_resolve_hours} onChange={set("sla_resolve_hours")} /></Field>
        <Field label="Provider" hint="Which bridge posts to the webhooks">
          <Select value={f.provider} onChange={set("provider")}>
            {["manual", "resend", "gmail", "outlook", "twilio", "exotel", "whatsapp_cloud"].map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Active">
          <label className="inline-flex items-center gap-2 h-9 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF((x) => ({ ...x, active: e.target.checked }))} className="accent-[var(--brand)]" /> Accepting inbound and outbound</label>
        </Field>
        <Field label="Inbox signature (fallback)" className="sm:col-span-2"><Textarea value={f.signature} onChange={set("signature")} style={{ minHeight: 60 }} placeholder="Warm regards,&#10;GHL India Ventures — Sales" /></Field>
        <div className="sm:col-span-2 flex justify-end"><Button type="submit" variant="primary" loading={busy}><Save size={14} /> {inbox ? "Save" : "Create inbox"}</Button></div>
      </form>
    </Card>
  );
}

/* --------------------------------------------------------------- members */
function MembersCard({ inbox, members, onChanged }: { inbox: InboxRow; members: InboxMemberRow[]; onChanged: () => void }) {
  const { people, profile } = useSession();
  const toast = useToast();
  const [user, setUser] = React.useState("");
  const [role, setRole] = React.useState<"agent" | "supervisor">("agent");
  async function add() {
    if (!user) return;
    const { error } = await createClient().from("inbox_members").upsert({ inbox_id: inbox.id, user_id: user, role, added_by: profile.id });
    if (error) return toast.push(errText(error), "danger");
    setUser("");
    onChanged();
  }
  async function setMemberRole(uid: string, r: string) {
    const { error } = await createClient().from("inbox_members").update({ role: r }).eq("inbox_id", inbox.id).eq("user_id", uid);
    if (error) return toast.push(errText(error), "danger");
    onChanged();
  }
  async function remove(uid: string) {
    const { error } = await createClient().from("inbox_members").delete().eq("inbox_id", inbox.id).eq("user_id", uid);
    if (error) return toast.push(errText(error), "danger");
    onChanged();
  }
  return (
    <Card>
      <CardHeader title="Members" subtitle="Agents work the queue; supervisors approve outbound messages, reassign and see the dashboard." />
      <div className="px-[var(--s4)] pb-[var(--s3)] space-y-2">
        <div className="flex flex-wrap gap-2 items-end">
          <Field label="Add person" className="flex-1 min-w-[200px]"><PersonPicker value={user} onChange={setUser} placeholder="Pick a colleague" /></Field>
          <Field label="Role"><Select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="!w-auto"><option value="agent">Agent</option><option value="supervisor">Supervisor</option></Select></Field>
          <Button variant="primary" onClick={add} disabled={!user}><UserPlus size={14} /> Add</Button>
        </div>
        <div className="divide-y">
          {members.map((m) => {
            const p = people.find((x) => x.id === m.user_id);
            return (
              <div key={m.user_id} className="flex items-center gap-2 py-2">
                <Avatar name={p?.full_name} src={p?.avatar_url} size={24} />
                <span className="text-sm flex-1 truncate">{p?.full_name || m.user_id}<span className="text-muted text-xs"> {p?.designation ? `· ${p.designation}` : ""}</span></span>
                <Select value={m.role} onChange={(e) => setMemberRole(m.user_id, e.target.value)} className="!w-auto !h-7 text-xs"><option value="agent">Agent</option><option value="supervisor">Supervisor</option></Select>
                <Button size="xs" icon variant="ghost" onClick={() => remove(m.user_id)} aria-label="Remove"><Trash2 size={12} /></Button>
              </div>
            );
          })}
          {members.length === 0 && <div className="text-xs text-muted py-3">No members yet — nobody will be notified of new mail until you add agents.</div>}
        </div>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------- rules */
type RuleDraft = { name: string; from_contains: string; subject_contains: string; body_contains: string; contact_kind: string; vip: string; assign_to: string; department_id: string; priority: string; tags: string; status: string; set_vip: string; notify_user: string; enabled: boolean };
function draftFromRule(r?: InboxRuleRow | null): RuleDraft {
  const c = (r?.conditions || {}) as Record<string, unknown>;
  const a = (r?.actions || {}) as Record<string, unknown>;
  const s = (v: unknown) => (v == null ? "" : String(v));
  return { name: r?.name || "", from_contains: s(c.from_contains), subject_contains: s(c.subject_contains), body_contains: s(c.body_contains), contact_kind: s(c.contact_kind), vip: c.vip == null ? "" : String(c.vip), assign_to: s(a.assign_to), department_id: s(a.department_id), priority: s(a.priority), tags: Array.isArray(a.tags) ? (a.tags as string[]).join(", ") : "", status: s(a.status), set_vip: a.vip == null ? "" : String(a.vip), notify_user: s(a.notify_user), enabled: r?.enabled ?? true };
}

function RulesCard({ inbox, rules, onChanged }: { inbox: InboxRow; rules: InboxRuleRow[]; onChanged: () => void }) {
  const { people } = useSession();
  const toast = useToast();
  const [editing, setEditing] = React.useState<InboxRuleRow | "new" | null>(null);
  async function toggle(r: InboxRuleRow) {
    const { error } = await createClient().from("inbox_rules").update({ enabled: !r.enabled }).eq("id", r.id);
    if (error) return toast.push(errText(error), "danger");
    onChanged();
  }
  async function remove(r: InboxRuleRow) {
    const { error } = await createClient().from("inbox_rules").delete().eq("id", r.id);
    if (error) return toast.push(errText(error), "danger");
    onChanged();
  }
  const describe = (r: InboxRuleRow) => {
    const c = (r.conditions || {}) as Record<string, unknown>;
    const a = (r.actions || {}) as Record<string, unknown>;
    const when = Object.entries(c).map(([k, v]) => `${k.replace(/_/g, " ")} "${String(v)}"`).join(" and ") || "every new conversation";
    const then = Object.entries(a).map(([k, v]) => (k === "assign_to" || k === "notify_user" ? `${k.replace(/_/g, " ")} ${people.find((p) => p.id === v)?.full_name || "?"}` : `${k.replace(/_/g, " ")} ${Array.isArray(v) ? v.join(", ") : String(v)}`)).join(", ") || "nothing";
    return `When ${when} → ${then}`;
  };
  return (
    <Card>
      <CardHeader title="Routing rules" subtitle="Applied in order when a new conversation arrives in this inbox." action={<Button size="xs" variant="primary" onClick={() => setEditing("new")}><Plus size={12} /> Rule</Button>} />
      <div className="px-[var(--s4)] pb-[var(--s3)] divide-y">
        {rules.map((r) => (
          <div key={r.id} className="py-2 flex items-start gap-2">
            <input type="checkbox" checked={r.enabled} onChange={() => toggle(r)} className="accent-[var(--brand)] mt-1" title="Enabled" />
            <div className="min-w-0 flex-1">
              <div className="text-sm">{r.name}</div>
              <div className="text-[11px] text-muted">{describe(r)}</div>
            </div>
            <Button size="xs" variant="ghost" onClick={() => setEditing(r)}><Wand2 size={12} /></Button>
            <Button size="xs" variant="ghost" icon onClick={() => remove(r)} aria-label="Delete"><Trash2 size={12} /></Button>
          </div>
        ))}
        {rules.length === 0 && <div className="text-xs text-muted py-3">No rules. Example: subject contains “invoice” → assign to Finance and tag billing.</div>}
      </div>
      {editing && <RuleModal inbox={inbox} rule={editing === "new" ? null : editing} order={rules.length} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </Card>
  );
}

function RuleModal({ inbox, rule, order, onClose, onSaved }: { inbox: InboxRow; rule: InboxRuleRow | null; order: number; onClose: () => void; onSaved: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [d, setD] = React.useState<RuleDraft>(() => draftFromRule(rule));
  const set = (k: keyof RuleDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((x) => ({ ...x, [k]: e.target.value }));
  const [busy, setBusy] = React.useState(false);
  async function save() {
    if (!d.name.trim()) return toast.push("Give the rule a name", "danger");
    const conditions: Record<string, unknown> = {};
    if (d.from_contains) conditions.from_contains = d.from_contains;
    if (d.subject_contains) conditions.subject_contains = d.subject_contains;
    if (d.body_contains) conditions.body_contains = d.body_contains;
    if (d.contact_kind) conditions.contact_kind = d.contact_kind;
    if (d.vip) conditions.vip = d.vip === "true";
    const actions: Record<string, unknown> = {};
    if (d.assign_to) actions.assign_to = d.assign_to;
    if (d.department_id) actions.department_id = d.department_id;
    if (d.priority) actions.priority = d.priority;
    if (d.tags.trim()) actions.tags = d.tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (d.status) actions.status = d.status;
    if (d.set_vip) actions.vip = d.set_vip === "true";
    if (d.notify_user) actions.notify_user = d.notify_user;
    setBusy(true);
    const supabase = createClient();
    const row = { name: d.name.trim(), conditions: conditions as never, actions: actions as never, enabled: d.enabled };
    const { error } = rule ? await supabase.from("inbox_rules").update(row).eq("id", rule.id) : await supabase.from("inbox_rules").insert({ ...row, inbox_id: inbox.id, sort_order: order, created_by: profile.id });
    setBusy(false);
    if (error) return toast.push(errText(error), "danger");
    onSaved();
  }
  return (
    <Modal open onClose={onClose} title={rule ? "Edit rule" : "New routing rule"} width={620} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}><Save size={14} /> Save rule</Button></>}>
      <div className="space-y-3">
        <Field label="Name"><Input value={d.name} onChange={set("name")} placeholder="e.g. Invoices to Finance" /></Field>
        <div className="eyebrow">When (all that are filled must match)</div>
        <div className="grid sm:grid-cols-2 gap-2">
          <Field label="From contains"><Input value={d.from_contains} onChange={set("from_contains")} placeholder="@bigclient.com" /></Field>
          <Field label="Subject contains"><Input value={d.subject_contains} onChange={set("subject_contains")} placeholder="invoice" /></Field>
          <Field label="Body contains"><Input value={d.body_contains} onChange={set("body_contains")} /></Field>
          <Field label="Contact type"><Select value={d.contact_kind} onChange={set("contact_kind")}><option value="">Any</option>{["customer", "lead", "investor_contact", "vendor", "partner", "candidate", "other"].map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}</Select></Field>
          <Field label="VIP"><Select value={d.vip} onChange={set("vip")}><option value="">Any</option><option value="true">VIP only</option><option value="false">Non-VIP only</option></Select></Field>
        </div>
        <div className="eyebrow">Then</div>
        <div className="grid sm:grid-cols-2 gap-2">
          <Field label="Assign to"><PersonPicker value={d.assign_to} onChange={(v) => setD((x) => ({ ...x, assign_to: v }))} placeholder="Leave as is" /></Field>
          <Field label="Move to department"><DepartmentPicker value={d.department_id} onChange={(v) => setD((x) => ({ ...x, department_id: v }))} placeholder="Leave as is" /></Field>
          <Field label="Priority"><Select value={d.priority} onChange={set("priority")}><option value="">Leave as is</option>{["critical", "urgent", "high", "normal", "low"].map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
          <Field label="Status"><Select value={d.status} onChange={set("status")}><option value="">Leave as is</option><option value="open">Open</option><option value="pending">Pending</option><option value="spam">Spam</option></Select></Field>
          <Field label="Add tags" hint="Comma separated"><Input value={d.tags} onChange={set("tags")} /></Field>
          <Field label="Mark VIP"><Select value={d.set_vip} onChange={set("set_vip")}><option value="">Leave as is</option><option value="true">Yes</option><option value="false">No</option></Select></Field>
          <Field label="Notify"><PersonPicker value={d.notify_user} onChange={(v) => setD((x) => ({ ...x, notify_user: v }))} placeholder="Nobody" /></Field>
          <Field label="Enabled"><label className="inline-flex items-center gap-2 h-9 text-sm"><input type="checkbox" checked={d.enabled} onChange={(e) => setD((x) => ({ ...x, enabled: e.target.checked }))} className="accent-[var(--brand)]" /> Active</label></Field>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------- templates */
function TemplatesTab({ templates, onChanged }: { templates: TemplateRow[]; onChanged: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [editing, setEditing] = React.useState<TemplateRow | "new" | null>(null);
  async function approve(t: TemplateRow) {
    const { error } = await createClient().from("comm_templates").update({ approved: !t.approved, approved_by: t.approved ? null : profile.id }).eq("id", t.id);
    if (error) return toast.push(errText(error), "danger");
    onChanged();
  }
  async function remove(t: TemplateRow) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    const { error } = await createClient().from("comm_templates").delete().eq("id", t.id);
    if (error) return toast.push(errText(error), "danger");
    onChanged();
  }
  const groups: { scope: string; label: string }[] = [{ scope: "company", label: "Company" }, { scope: "department", label: "Department" }, { scope: "personal", label: "Personal" }];
  return (
    <div className="space-y-[var(--s3)]">
      <div className="flex justify-end"><Button variant="primary" size="sm" onClick={() => setEditing("new")}><Plus size={14} /> New template</Button></div>
      {groups.map((g) => {
        const list = templates.filter((t) => t.scope === g.scope);
        return (
          <Card key={g.scope}>
            <CardHeader title={`${g.label} templates`} subtitle={g.scope === "company" ? "Approved wording everyone can use — the safe place for anything about pricing or commitments." : g.scope === "department" ? "Shared within a department; leads can edit." : "Your own drafts and scripts."} />
            <div className="divide-y">
              {list.length === 0 && <div className="px-[var(--s4)] py-4 text-xs text-muted">None yet.</div>}
              {list.map((t) => (
                <div key={t.id} className="px-[var(--s4)] py-2.5 flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full sunken flex items-center justify-center text-muted shrink-0"><FileText size={13} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm flex items-center gap-1.5 flex-wrap">{t.name}<span className="pill tone-neutral">{t.kind.replace(/_/g, " ")}</span>{t.category && <span className="pill tone-neutral">{t.category}</span>}{t.approved ? <span className="pill tone-success">approved</span> : <span className="pill tone-warn">draft</span>}<span className="text-[11px] text-muted">used {t.usage_count}×</span></div>
                    <div className="text-xs text-muted line-clamp-2 whitespace-pre-wrap">{t.subject ? `${t.subject} — ` : ""}{t.body}</div>
                  </div>
                  <Button size="xs" variant={t.approved ? "secondary" : "success"} onClick={() => approve(t)} title={t.approved ? "Revoke approval" : "Approve for use"}>{t.approved ? "Unapprove" : <><Check size={12} /> Approve</>}</Button>
                  <Button size="xs" variant="ghost" onClick={() => setEditing(t)}><Wand2 size={12} /></Button>
                  <Button size="xs" variant="ghost" icon onClick={() => remove(t)} aria-label="Delete"><Trash2 size={12} /></Button>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
      {editing && <TemplateModal template={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </div>
  );
}

export function TemplateModal({ template, onClose, onSaved }: { template: TemplateRow | null; onClose: () => void; onSaved: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [f, setF] = React.useState({ name: template?.name || "", kind: template?.kind || "email", category: template?.category || "", subject: template?.subject || "", body: template?.body || "", scope: template?.scope || "personal", department_id: template?.department_id || profile.department_id || "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const [busy, setBusy] = React.useState(false);
  async function save() {
    if (!f.name.trim() || !f.body.trim()) return toast.push("Name and body are required", "danger");
    setBusy(true);
    const row = { name: f.name.trim(), kind: f.kind, category: f.category.trim() || null, subject: f.subject.trim() || null, body: f.body, scope: f.scope, department_id: f.scope === "department" ? f.department_id || null : null, updated_at: new Date().toISOString() };
    const supabase = createClient();
    const { error } = template ? await supabase.from("comm_templates").update(row).eq("id", template.id) : await supabase.from("comm_templates").insert({ ...row, org_id: profile.org_id!, owner_id: profile.id, approved: f.scope === "personal" });
    setBusy(false);
    if (error) return toast.push(errText(error), "danger");
    onSaved();
  }
  return (
    <Modal open onClose={onClose} title={template ? "Edit template" : "New template"} width={640} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}><Save size={14} /> Save</Button></>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Name"><Input value={f.name} onChange={set("name")} /></Field>
        <Field label="Kind"><Select value={f.kind} onChange={set("kind")}>{["email", "whatsapp", "sms", "call_script", "note"].map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}</Select></Field>
        <Field label="Category"><Input value={f.category} onChange={set("category")} placeholder="sales / support / billing" /></Field>
        <Field label="Scope"><Select value={f.scope} onChange={set("scope")}><option value="personal">Personal</option><option value="department">Department</option><option value="company">Company</option></Select></Field>
        {f.scope === "department" && <Field label="Department" className="sm:col-span-2"><DepartmentPicker value={f.department_id} onChange={(v) => setF((x) => ({ ...x, department_id: v }))} /></Field>}
        {f.kind === "email" && <Field label="Subject" className="sm:col-span-2"><Input value={f.subject} onChange={set("subject")} placeholder="Re: {{subject}}" /></Field>}
        <Field label="Body" hint="Variables: {{contact_name}} {{first_name}} {{my_name}} {{subject}} {{company}} — anything else stays as a placeholder for the agent to fill." className="sm:col-span-2"><Textarea value={f.body} onChange={set("body")} style={{ minHeight: 160 }} /></Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------- settings */
function SettingsTab({ settings, onSaved }: { settings: ConnectSettings; onSaved: (s: ConnectSettings) => void }) {
  const toast = useToast();
  const [f, setF] = React.useState({
    approval_statuses: (settings.approval_statuses || []).join(", "),
    approval_roles: (settings.approval_roles || []).join(", "),
    blocked_domains: (settings.blocked_domains || []).join(", "),
    unclaimed_alert_minutes: String(settings.unclaimed_alert_minutes ?? 30),
    max_open_per_agent: String(settings.max_open_per_agent ?? 25),
    callback_reminder_minutes: String(settings.callback_reminder_minutes ?? 15),
    quiet_from: settings.quiet_hours?.from || "21:00",
    quiet_to: settings.quiet_hours?.to || "08:00",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const [busy, setBusy] = React.useState(false);
  const list = (s: string) => s.split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const patch = { approval_statuses: list(f.approval_statuses), approval_roles: list(f.approval_roles), blocked_domains: list(f.blocked_domains), unclaimed_alert_minutes: Number(f.unclaimed_alert_minutes) || 30, max_open_per_agent: Number(f.max_open_per_agent) || 25, callback_reminder_minutes: Number(f.callback_reminder_minutes) || 15, quiet_hours: { from: f.quiet_from, to: f.quiet_to } };
    const { data, error } = await createClient().rpc("set_connect_settings", { p_patch: patch as never });
    setBusy(false);
    if (error) return toast.push(errText(error), "danger");
    onSaved(data as unknown as ConnectSettings);
  }
  return (
    <Card>
      <CardHeader title="Sending policy" subtitle="Company-wide rules that the database enforces on every outbound message." />
      <form onSubmit={save} className="px-[var(--s4)] pb-[var(--s4)] grid sm:grid-cols-2 gap-3">
        <Field label="Statuses that need approval" hint="profiles.status values, comma separated (probation, intern, contract…)"><Input value={f.approval_statuses} onChange={set("approval_statuses")} /></Field>
        <Field label="Roles that need approval" hint="role levels, comma separated (intern, consultant…)"><Input value={f.approval_roles} onChange={set("approval_roles")} /></Field>
        <Field label="Blocked domains" hint="Emails to these domains are refused" className="sm:col-span-2"><Input value={f.blocked_domains} onChange={set("blocked_domains")} placeholder="competitor.com, example.org" /></Field>
        <Field label="Unclaimed alert (minutes)" hint="Supervisors are told when nobody claims a conversation"><Input type="number" min={5} value={f.unclaimed_alert_minutes} onChange={set("unclaimed_alert_minutes")} /></Field>
        <Field label="Max open per agent" hint="Claim and round-robin stop at this cap"><Input type="number" min={1} value={f.max_open_per_agent} onChange={set("max_open_per_agent")} /></Field>
        <Field label="Callback reminder (minutes before)"><Input type="number" min={0} value={f.callback_reminder_minutes} onChange={set("callback_reminder_minutes")} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Quiet hours from"><Input type="time" value={f.quiet_from} onChange={set("quiet_from")} /></Field>
          <Field label="to"><Input type="time" value={f.quiet_to} onChange={set("quiet_to")} /></Field>
        </div>
        <div className="sm:col-span-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted inline-flex items-center gap-1"><Settings size={11} /> Changes are audited.</span>
          <Button type="submit" variant="primary" loading={busy}><Save size={14} /> Save settings</Button>
        </div>
      </form>
    </Card>
  );
}
