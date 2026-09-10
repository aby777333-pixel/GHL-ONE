"use client";

/**
 * ACCESS CONTROL STUDIO (§36, §120–125).
 *
 * The one screen where authority is administered: pick a company, then a role, a person or a
 * permission, and see — and change — exactly what it means. Every answer on this screen comes from
 * the database, so the studio can never show a picture the product does not actually enforce.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Building2, ClipboardCheck, Copy, KeyRound, Plus, Search, ShieldAlert, ShieldCheck, Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, PageHeader, Pill, SearchInput, Select, Spinner, Tabs, useToast } from "@/components/ui";
import { cn, fmtDate, ROLE_LABEL, type RoleLevel } from "@/lib/utils";
import { RoleMatrix, type RoleRow } from "./RoleMatrix";
import { PersonAccess } from "./PersonAccess";
import { NewRoleModal } from "./NewRoleModal";
import { AuditLog } from "./AuditLog";
import { AccessRoles } from "@/components/people/PeopleBits";
import { useSecurityRoles } from "@/components/people/useSecurityRoles";
import { useSession } from "@/components/providers/SessionProvider";
import { ADMIN_TEMPLATES, byGroup, RISK_LABEL, RISK_TONE, type PermissionRow, type ReviewBoard } from "./lib";

/**
 * What the viewer may actually change here.
 *
 * §15: being an administrator is not one capability. Creating a role, editing one, deleting one,
 * assigning one to a person and writing an individual override are five separate permissions, and
 * somebody may hold `access_control.view` and none of them. The studio disables what the viewer
 * cannot do and says why, rather than offering a Save that the database will refuse — a refusal
 * with no explanation reads as a bug instead of as the rule it is.
 *
 * These flags are a courtesy to the person using the screen. They are NOT the control: every write
 * below goes through RLS, which asks the same question again in Postgres.
 */
export type AccessCaps = { create: boolean; edit: boolean; remove: boolean; assign: boolean; manage: boolean };

type Company = { id: string; name: string; tenant_code: string | null; status: string };
type Person = { id: string; full_name: string; role: string; designation: string | null; department_id: string | null; is_active: boolean };
type Tab = "roles" | "people" | "permissions" | "companies" | "review" | "audit";

export function AccessStudio({
  isOwner, can, companies, catalogue, initialTab,
}: {
  isOwner: boolean;
  can: AccessCaps;
  companies: Company[];
  catalogue: PermissionRow[];
  initialTab?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>(
    (["roles", "people", "permissions", "companies", "review", "audit"] as const).includes(initialTab as Tab) ? (initialTab as Tab) : "roles"
  );

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="Platform"
        title={<span className="inline-flex items-center gap-2"><KeyRound size={22} className="text-[var(--brand-2)]" /> Access Control</span>}
        subtitle="Who can see what, who can do what, where they can do it, and for how long. Everything here is enforced in the database — hiding a control is never the control."
        actions={isOwner ? <Pill tone="tone-violet" size="lg"><ShieldCheck size={12} /> Platform owner</Pill> : undefined}
      />

      <Tabs
        tabs={[
          { key: "roles", label: "Roles" },
          { key: "people", label: "People" },
          { key: "permissions", label: "Permissions" },
          ...(isOwner ? [{ key: "companies" as Tab, label: "Company limits" }] : []),
          { key: "review", label: "Access review" },
          { key: "audit", label: "Audit log" },
        ]}
        value={tab}
        onChange={(t) => { setTab(t); router.replace(`/platform/access?tab=${t}`); }}
        className="mb-[var(--s3)]"
      />

      {!can.create && !can.edit && !can.remove && !can.assign && !can.manage && (
        <Card className="mb-[var(--s3)]">
          <div className="flex items-start gap-2.5 px-[var(--s4)] py-[var(--s3)]">
            <ShieldAlert size={15} className="mt-0.5 shrink-0 text-[var(--warn)]" />
            <p className="text-sm text-muted">
              You can review access here but not change it. Creating, editing and assigning roles are
              separate permissions from reading this screen — ask whoever administers security for
              <code className="mx-1">roles.edit</code> or <code className="mx-1">roles.assign</code> if you need them.
            </p>
          </div>
        </Card>
      )}

      {tab === "roles" && <RolesTab catalogue={catalogue} can={can} />}
      {tab === "people" && <PeopleTab catalogue={catalogue} can={can} />}
      {tab === "permissions" && <PermissionsTab catalogue={catalogue} />}
      {tab === "companies" && isOwner && <CompaniesTab companies={companies} catalogue={catalogue} />}
      {tab === "review" && <ReviewTab />}
      {tab === "audit" && <AuditLog catalogue={catalogue} />}
    </div>
  );
}

/* ------------------------------------------------------------------- Roles */
function RolesTab({ catalogue, can }: { catalogue: PermissionRow[]; can: AccessCaps }) {
  const [roles, setRoles] = React.useState<RoleRow[] | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [creating, setCreating] = React.useState<null | { from: "template" | "duplicate"; sourceId?: string }>(null);

  // Reload by bumping a counter rather than calling an async loader from the effect body: state is
  // only ever set from the promise callback, which is the pattern the rest of the app uses.
  const [tick, setTick] = React.useState(0);
  const load = React.useCallback(() => setTick((t) => t + 1), []);
  React.useEffect(() => {
    let alive = true;
    createClient()
      .from("system_roles")
      .select("id,key,name,description,base_level,permissions,denied_permissions,is_system")
      .order("name")
      .then(({ data }) => { if (alive) setRoles((data || []) as RoleRow[]); });
    return () => { alive = false; };
  }, [tick]);

  const list = (roles || []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  const current = (roles || []).find((r) => r.id === selected) || null;

  if (roles === null) return <Card><div className="flex justify-center py-10"><Spinner /></div></Card>;

  return (
    <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-[var(--s3)] items-start">
      <Card className="lg:sticky lg:top-[calc(var(--topbar-h)+var(--s3))]">
        <CardHeader
          title="Roles"
          subtitle={`${roles.length} in this company`}
          action={
            <Button
              size="sm"
              variant="primary"
              disabled={!can.create}
              title={can.create ? undefined : "Creating a role needs the roles.create permission."}
              onClick={() => setCreating({ from: "template" })}
            >
              <Plus size={14} /> New
            </Button>
          }
        />
        <div className="px-[var(--s3)] pb-[var(--s3)]">
          <SearchInput placeholder="Search roles…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
          <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
            {list.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded-[var(--radius-sm)] min-w-0",
                  selected === r.id ? "bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] text-[var(--brand)]" : "hover:bg-[var(--neutral-bg)]"
                )}
              >
                <span className="block text-sm font-medium truncate">{r.name}</span>
                <span className="block text-[11px] text-muted truncate">{r.permissions.length} permissions · {r.base_level.replace(/_/g, " ")}</span>
              </button>
            ))}
            {list.length === 0 && <p className="text-sm text-muted px-2 py-3">No role matches that.</p>}
          </div>
        </div>
      </Card>

      {current ? (
        <div className="space-y-[var(--s3)]">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              disabled={!can.create}
              title={can.create ? undefined : "Duplicating a role creates one, which needs the roles.create permission."}
              onClick={() => setCreating({ from: "duplicate", sourceId: current.id })}
            >
              <Copy size={14} /> Duplicate this role
            </Button>
          </div>
          {/* Keyed on the role: picking another one remounts the grid, so it re-seeds from props
              instead of resetting its own state in an effect. */}
          <RoleMatrix key={current.id} role={current} catalogue={catalogue} canEdit={can.edit} onSaved={load} />
        </div>
      ) : (
        <Card>
          <EmptyState icon={<KeyRound size={18} />} title="Pick a role" hint="Choose a role on the left to see and change exactly what it can do — with a diff and an impact count before anything is saved." className="py-[var(--s6)]" />
        </Card>
      )}

      {creating && (
        <NewRoleModal
          mode={creating.from}
          source={creating.sourceId ? (roles || []).find((r) => r.id === creating.sourceId) || null : null}
          existingNames={(roles || []).map((r) => r.name.toLowerCase())}
          onClose={() => setCreating(null)}
          onCreated={(id) => { setCreating(null); setSelected(id); load(); }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ People */
function PeopleTab({ catalogue, can }: { catalogue: PermissionRow[]; can: AccessCaps }) {
  const { departments } = useSession();
  const { byUser: securityRoles } = useSecurityRoles();
  const [people, setPeople] = React.useState<Person[] | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    createClient()
      .from("profiles")
      .select("id,full_name,role,designation,department_id,is_active")
      .order("full_name")
      .then(({ data }) => { if (alive) setPeople((data || []) as Person[]); });
    return () => { alive = false; };
  }, []);

  const list = (people || []).filter((p) => !q || [p.full_name, p.designation].some((v) => (v || "").toLowerCase().includes(q.toLowerCase())));

  if (people === null) return <Card><div className="flex justify-center py-10"><Spinner /></div></Card>;

  return (
    <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-[var(--s3)] items-start">
      <Card className="lg:sticky lg:top-[calc(var(--topbar-h)+var(--s3))]">
        <CardHeader title="People" subtitle={`${people.length} in this company`} />
        <div className="px-[var(--s3)] pb-[var(--s3)]">
          <SearchInput placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
          <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
            {list.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={cn(
                  "w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-[var(--radius-sm)] min-w-0",
                  selected === p.id ? "bg-[color-mix(in_oklab,var(--brand)_12%,transparent)]" : "hover:bg-[var(--neutral-bg)]",
                  !p.is_active && "opacity-60"
                )}
              >
                <Avatar name={p.full_name} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="block text-sm truncate">{p.full_name}</span>
                    {!p.is_active && <Pill tone="tone-muted">Inactive</Pill>}
                  </span>
                  {/*
                    Job title, then department, then access level — three different facts, in that
                    order, so the title is never the last word on what somebody may do. The security
                    roles they hold sit below, because those are the only ones that grant anything.
                  */}
                  <span className="block text-[11px] text-muted truncate">
                    {p.designation || "No job title"}
                    {departments.find((d) => d.id === p.department_id)?.name ? ` · ${departments.find((d) => d.id === p.department_id)!.name}` : ""}
                    {` · ${ROLE_LABEL[p.role as RoleLevel] || p.role}`}
                  </span>
                  <AccessRoles roles={securityRoles.get(p.id)} max={2} className="mt-1" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {selected ? (
        <PersonAccess userId={selected} catalogue={catalogue} canManage={can.manage} />
      ) : (
        <Card>
          <EmptyState icon={<Users size={18} />} title="Pick a person" hint="See exactly what they can do, why each answer is what it is, and grant, deny or time-box any single permission." className="py-[var(--s6)]" />
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Permissions */
function PermissionsTab({ catalogue }: { catalogue: PermissionRow[] }) {
  const toast = useToast();
  const [holders, setHolders] = React.useState<{ perm: PermissionRow; rows: { id: string; name: string; role: string; why: string | null }[] } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const groups = byGroup(catalogue);

  async function whoHas(p: PermissionRow) {
    setBusy(p.key);
    const { data, error } = await createClient().rpc("permission_holders", { p_perm: p.key });
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    setHolders({ perm: p, rows: (data || []) as unknown as { id: string; name: string; role: string; why: string | null }[] });
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-[var(--s3)] items-start">
      <div className="space-y-[var(--s3)]">
        {groups.map((g) => (
          <Card key={g.grp}>
            <CardHeader title={g.label} subtitle={`${g.items.length} permission${g.items.length === 1 ? "" : "s"}`} />
            <div className="divide-y border-t">
              {g.items.map((p) => (
                <div key={p.key} className="px-[var(--s4)] py-2.5 flex items-start gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium">{p.label}</span>
                      <span className="text-[11px] text-muted font-mono">{p.key}</span>
                      {p.risk !== "standard" && <Pill tone={RISK_TONE[p.risk]}>{RISK_LABEL[p.risk]}</Pill>}
                      {p.platform_only && <Pill tone="tone-violet">platform only</Pill>}
                    </div>
                    {p.description && <div className="text-[11px] text-muted mt-0.5">{p.description}</div>}
                    {p.requires.length > 0 && (
                      <div className="text-[11px] text-muted mt-0.5">Needs: {p.requires.join(", ")}</div>
                    )}
                  </div>
                  {!p.platform_only && (
                    <Button size="xs" variant="ghost" className="shrink-0" loading={busy === p.key} onClick={() => whoHas(p)}>
                      Who has this?
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card className="lg:sticky lg:top-[calc(var(--topbar-h)+var(--s3))]">
        <CardHeader
          title={holders ? `Who has “${holders.perm.label}”` : "Who can see this?"}
          subtitle={holders ? `${holders.rows.length} ${holders.rows.length === 1 ? "person" : "people"}` : "Pick a permission to see everyone who holds it, and the reason each of them does."}
        />
        <div className="px-[var(--s3)] pb-[var(--s3)]">
          {!holders ? (
            <EmptyState icon={<Search size={18} />} title="Nothing selected" className="py-[var(--s4)]" />
          ) : holders.rows.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={18} />} title="Nobody holds this" hint="Not a single person in this company currently has it." className="py-[var(--s4)]" />
          ) : (
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {holders.rows.map((r) => (
                <div key={r.id} className="flex items-start gap-2 px-1 py-1.5">
                  <Avatar name={r.name} size={24} />
                  <div className="min-w-0">
                    <div className="text-sm truncate">{r.name}</div>
                    <div className="text-[11px] text-muted">{r.why || ROLE_LABEL[r.role as RoleLevel] || r.role}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------- Company limits */
function CompaniesTab({ companies, catalogue }: { companies: Company[]; catalogue: PermissionRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [orgId, setOrgId] = React.useState(companies[0]?.id || "");
  const [limit, setLimit] = React.useState<{ template: string; permissions: string[] | null; note: string | null } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [tick, setTick] = React.useState(0);
  const reload = React.useCallback(() => setTick((t) => t + 1), []);
  React.useEffect(() => {
    if (!orgId) return;
    let alive = true;
    createClient()
      .from("company_admin_limits")
      .select("template,permissions,note")
      .eq("org_id", orgId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setLimit(data ? (data as { template: string; permissions: string[] | null; note: string | null }) : { template: "full", permissions: null, note: null });
        setLoading(false);
      });
    return () => { alive = false; };
  }, [orgId, tick]);

  async function apply(template: string, permissions: string[] | null) {
    setSaving(true);
    const { error } = await createClient()
      .from("company_admin_limits")
      .upsert({ org_id: orgId, template, permissions, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
    setSaving(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Company administrator limit saved", "success");
    reload();
    router.refresh();
  }

  const company = companies.find((c) => c.id === orgId);
  const assignable = catalogue.filter((p) => !p.platform_only && p.key !== "*");

  return (
    <div className="space-y-[var(--s3)]">
      <Card>
        <CardHeader
          title="What this company's own administrators may do"
          subtitle="A company super admin is an administrator of the things you hand them — not of everything. This is the ceiling; nothing inside the company can raise it."
          action={<Building2 size={15} className="text-muted" />}
        />
        <div className="px-[var(--s4)] pb-[var(--s4)] space-y-[var(--s3)]">
          <Select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="max-w-sm">
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.tenant_code ? ` · ${c.tenant_code}` : ""}</option>
            ))}
          </Select>

          {loading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-2">
                {ADMIN_TEMPLATES.map((t) => {
                  const active = limit?.template === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => apply(t.key, t.permissions)}
                      disabled={saving}
                      className={cn(
                        "text-left px-3 py-2.5 rounded-[var(--radius-sm)] border transition-colors",
                        active ? "border-[var(--brand)] ring-2 ring-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_8%,transparent)]" : "border-[var(--line)] hover:border-[var(--line-strong)]"
                      )}
                    >
                      <span className="text-sm font-medium">{t.label}</span>
                      <span className="block text-[11px] text-muted mt-0.5">{t.hint}</span>
                      {active && <Pill tone="tone-brand" className="mt-1.5">In force</Pill>}
                    </button>
                  );
                })}
              </div>

              <div className="text-xs text-muted">
                {limit?.permissions === null
                  ? `${company?.name || "This company"}'s administrators are unrestricted inside their own company. They still cannot reach any other company, or anything at the platform layer.`
                  : `${limit?.permissions.length} of ${assignable.length} permissions are available to ${company?.name || "this company"}'s administrators. Anything outside the list is refused even for their super admin.`}
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ Access review */
function ReviewTab() {
  const [board, setBoard] = React.useState<ReviewBoard | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    createClient().rpc("access_review_board").then(({ data, error: e }) => {
      if (!alive) return;
      if (e) { setError(e.message); return; }
      setBoard(data as unknown as ReviewBoard);
    });
    return () => { alive = false; };
  }, []);

  if (error) return <Card><EmptyState icon={<ShieldAlert size={18} />} title="Access review is not available to you" hint={error} className="py-[var(--s5)]" /></Card>;
  if (!board) return <Card><div className="flex justify-center py-10"><Spinner /></div></Card>;

  return (
    <div className="grid lg:grid-cols-2 gap-[var(--s3)] items-start">
      <Card>
        <CardHeader title="High-risk authority" subtitle="The permissions that matter most, and how many people hold each one." action={<ShieldAlert size={15} className="text-[var(--danger)]" />} />
        <div className="divide-y border-t">
          {board.high_risk.map((h) => (
            <div key={h.permission} className="px-[var(--s4)] py-2 flex items-center gap-3">
              <span className="text-sm flex-1 min-w-0 truncate">{h.label}</span>
              <Pill tone={h.holders > 3 ? "tone-warn" : "tone-neutral"}>{h.holders} {h.holders === 1 ? "person" : "people"}</Pill>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Temporary access" subtitle="Individual grants and denies with an expiry. These lapse on their own." action={<ClipboardCheck size={15} className="text-muted" />} />
        {board.temporary.length === 0 ? (
          <EmptyState icon={<ClipboardCheck size={18} />} title="Nothing temporary right now" hint="Time-boxed permissions appear here while they are live." className="py-[var(--s4)]" />
        ) : (
          <div className="divide-y border-t">
            {board.temporary.map((t, i) => (
              <div key={i} className="px-[var(--s4)] py-2 flex items-center gap-3 min-w-0">
                <Avatar name={t.name} size={22} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{t.name}</div>
                  <div className="text-[11px] text-muted truncate">{t.permission}{t.reason ? ` · ${t.reason}` : ""}</div>
                </div>
                <Pill tone={t.allowed ? "tone-info" : "tone-danger"}>{t.expires_at ? fmtDate(t.expires_at) : "—"}</Pill>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Acting and time-boxed roles" subtitle="Somebody standing in, or holding a role that ends." />
        {board.acting_roles.length === 0 ? (
          <EmptyState icon={<Users size={18} />} title="Nobody is acting up" className="py-[var(--s4)]" />
        ) : (
          <div className="divide-y border-t">
            {board.acting_roles.map((a, i) => (
              <div key={i} className="px-[var(--s4)] py-2 flex items-center gap-3 min-w-0">
                <Avatar name={a.name} size={22} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{a.name}</div>
                  <div className="text-[11px] text-muted truncate">{a.role}</div>
                </div>
                {a.expires_at && <Pill tone="tone-warn">until {fmtDate(a.expires_at)}</Pill>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Left behind" subtitle="Authority still attached to somebody who has gone or been suspended." action={<ShieldAlert size={15} className="text-[var(--warn)]" />} />
        {board.orphaned.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={18} />} title="Nothing left behind" hint="Nobody inactive is still holding an individual grant." className="py-[var(--s4)]" />
        ) : (
          <div className="divide-y border-t">
            {board.orphaned.map((o) => (
              <div key={o.user_id} className="px-[var(--s4)] py-2 flex items-center gap-3 min-w-0">
                <Avatar name={o.name} size={22} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{o.name}</div>
                  <div className="text-[11px] text-muted">{o.status.replace(/_/g, " ")}</div>
                </div>
                <Pill tone="tone-danger">{o.permissions} still granted</Pill>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
