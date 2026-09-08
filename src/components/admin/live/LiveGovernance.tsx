"use client";

/**
 * Admin → GHL LIVE governance.
 *
 * Metadata only — never content. Shows what is live right now, today's totals, the live audit trail and
 * the permission matrix (company default → per department → per role) backed by `collab_policies`.
 * Reads `live_governance()`; writes through `set_collab_policy()` / `delete_collab_policy()`.
 */

import * as React from "react";
import Link from "next/link";
import { Building2, Clock, Crown, Loader2, Lock, Plus, Radio, RefreshCw, ScrollText, ShieldCheck, Trash2, Users, Video } from "lucide-react";
import { Button, Card, CardHeader, EmptyState, Field, Modal, Pill, Select, Spinner, Stat, Tabs, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { ago, cn, fmtDate, humanize, ROLE_LABEL, ROLE_RANK, type RoleLevel } from "@/lib/utils";

type ActiveRoom = {
  id: string; title: string; kind: string; host: string | null; department: string | null; project: string | null;
  started_at: string; minutes: number; participants: number; locked: boolean; confidential: boolean; guests: number;
};
type AuditRow = { at: string; action: string; actor: string | null; summary: string | null; entity_id: string | null };
export type Policy = {
  id: string; org_id: string; scope: "default" | "department" | "role"; department_id: string | null; role: RoleLevel | null;
  can_start_calls: boolean; can_video: boolean; can_record: boolean; can_share_screen: boolean; can_whiteboard: boolean;
  can_invite_guests: boolean; can_remote_assist: boolean; can_create_public_rooms: boolean; can_townhall: boolean;
  recording_retention_days: number | null; confidential_default: boolean; updated_at: string;
};
type Governance = {
  active: ActiveRoom[];
  today: { rooms: number; minutes: number; recordings: number; guest_links: number };
  audit: AuditRow[];
  policies: Policy[];
};

type FlagKey = "can_start_calls" | "can_video" | "can_record" | "can_share_screen" | "can_whiteboard" | "can_invite_guests" | "can_remote_assist" | "can_create_public_rooms" | "can_townhall" | "confidential_default";

const FLAGS: { key: FlagKey; label: string; hint: string }[] = [
  { key: "can_start_calls", label: "Calls", hint: "Start voice calls and huddles" },
  { key: "can_video", label: "Video", hint: "Turn the camera on" },
  { key: "can_share_screen", label: "Screen", hint: "Share a screen" },
  { key: "can_whiteboard", label: "Board", hint: "Open a whiteboard" },
  { key: "can_record", label: "Record", hint: "Record rooms and screens" },
  { key: "can_invite_guests", label: "Guests", hint: "Create external guest links" },
  { key: "can_remote_assist", label: "Assist", hint: "Request remote control (always asked for, never silent)" },
  { key: "can_create_public_rooms", label: "Public", hint: "Create company-wide rooms" },
  { key: "can_townhall", label: "Town hall", hint: "Run broadcast-style rooms" },
  { key: "confidential_default", label: "Confidential", hint: "New rooms start confidential (no recording, watermarked)" },
];

const ROLES = (Object.keys(ROLE_LABEL) as RoleLevel[]).sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]);

type GovernanceResult = { data: Governance | null; error: string | null };

/** Plain fetch helper — no state, so callers decide when the result is applied. */
async function fetchGovernance(): Promise<GovernanceResult> {
  const { data: json, error } = await createClient().rpc("live_governance");
  if (error) return { data: null, error: error.message };
  return { data: (json || {}) as unknown as Governance, error: null };
}

export function LiveGovernance() {
  const toast = useToast();
  const { departments } = useSession();
  const [data, setData] = React.useState<Governance | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"now" | "policies" | "audit">("now");
  const [adding, setAdding] = React.useState(false);

  /* Apply a finished fetch. Kept separate from the fetch so the mount effect can call it from a promise callback. */
  const apply = React.useCallback((r: GovernanceResult) => {
    setLoading(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setError(null);
    setData(r.data);
  }, []);

  /* Manual / scheduled reloads also light up the refresh spinner. */
  const load = React.useCallback(async () => {
    setLoading(true);
    apply(await fetchGovernance());
  }, [apply]);

  React.useEffect(() => {
    let alive = true;
    /* First load: `loading` already starts true, so no state is set before the answer lands. */
    void fetchGovernance().then((r) => {
      if (alive) apply(r);
    });
    const id = setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [apply, load]);

  const deptName = React.useCallback((id: string | null) => departments.find((d) => d.id === id)?.name || "Department", [departments]);

  async function savePolicy(p: Pick<Policy, "scope" | "department_id" | "role">, values: Record<string, unknown>) {
    const { error: e } = await createClient().rpc("set_collab_policy", {
      p_scope: p.scope,
      p_department: (p.department_id ?? null) as unknown as string,
      p_role: (p.role ?? null) as unknown as RoleLevel,
      p_values: values as never,
    });
    if (e) {
      toast.push(e.message, "danger");
      await load();
      return;
    }
    toast.push("Permission updated", "success");
  }

  async function toggle(p: Policy, key: FlagKey) {
    const next = !p[key];
    setData((d) => (d ? { ...d, policies: d.policies.map((x) => (x.id === p.id ? { ...x, [key]: next } : x)) } : d));
    await savePolicy(p, { [key]: next });
  }

  async function setRetention(p: Policy, days: string) {
    const v = days.trim() === "" ? null : Math.max(1, Number(days) || 0) || null;
    setData((d) => (d ? { ...d, policies: d.policies.map((x) => (x.id === p.id ? { ...x, recording_retention_days: v } : x)) } : d));
    await savePolicy(p, { recording_retention_days: v });
  }

  async function removePolicy(p: Policy) {
    if (p.scope === "default") return;
    if (!window.confirm("Remove this rule? People it covered fall back to the company default.")) return;
    const { error: e } = await createClient().rpc("delete_collab_policy", { p_id: p.id });
    if (e) return toast.push(e.message, "danger");
    setData((d) => (d ? { ...d, policies: d.policies.filter((x) => x.id !== p.id) } : d));
    toast.push("Rule removed", "success");
  }

  if (error) {
    return (
      <Card className="p-[var(--s4)]">
        <EmptyState icon={<Lock size={18} />} title="You cannot see live governance" hint={error} />
      </Card>
    );
  }
  if (loading && !data) {
    return (
      <Card className="p-[var(--s5)]">
        <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Loading live governance…</div>
      </Card>
    );
  }

  const g = data || { active: [], today: { rooms: 0, minutes: 0, recordings: 0, guest_links: 0 }, audit: [], policies: [] };
  const defaults = g.policies.find((p) => p.scope === "default") || null;
  const byDept = g.policies.filter((p) => p.scope === "department");
  const byRole = g.policies.filter((p) => p.scope === "role");

  return (
    <div className="space-y-[var(--s4)]">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--s3)]">
        <Stat label="Live now" value={g.active.length} sub={g.active.length ? `${g.active.reduce((a, r) => a + r.participants, 0)} people` : "Nothing running"} icon={<Radio size={15} />} tone={g.active.length ? "text-success" : undefined} />
        <Stat label="Rooms today" value={g.today.rooms} sub={`${g.today.minutes} minutes`} icon={<Clock size={15} />} />
        <Stat label="Recordings today" value={g.today.recordings} icon={<Video size={15} />} />
        <Stat label="Guest links today" value={g.today.guest_links} sub="External access" icon={<Users size={15} />} tone={g.today.guest_links ? "text-warn" : undefined} />
      </div>

      <div className="flex items-center gap-2">
        <Tabs
          className="flex-1"
          tabs={[
            { key: "now", label: <span className="inline-flex items-center gap-1.5"><Radio size={14} /> Live now</span>, count: g.active.length },
            { key: "policies", label: <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} /> Permissions</span>, count: g.policies.length },
            { key: "audit", label: <span className="inline-flex items-center gap-1.5"><ScrollText size={14} /> Audit</span> },
          ]}
          value={tab}
          onChange={setTab}
        />
        <Button size="sm" variant="ghost" icon onClick={load} aria-label="Refresh" title="Refresh">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </Button>
      </div>

      {tab === "now" && (
        <Card>
          <CardHeader title="Rooms running right now" subtitle="Metadata only — administrators never see or hear what happens inside a room." />
          {g.active.length === 0 ? (
            <EmptyState icon={<Radio size={18} />} title="Nothing is live" hint="Calls, huddles and meetings appear here the moment they start." className="py-[var(--s5)]" />
          ) : (
            <div className="divide-y">
              {g.active.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-[var(--s4)] py-2.5 min-w-0">
                  <span className="blink-dot shrink-0" style={{ width: 7, height: 7, ["--blink" as string]: "var(--success)" }} />
                  <span className="min-w-0 flex-1">
                    <Link href={`/live/${r.id}`} className="block text-sm font-medium truncate hover:underline">{r.title}</Link>
                    <span className="block text-[11px] text-muted truncate">
                      {humanize(r.kind)}{r.host ? ` · ${r.host}` : ""}{r.department ? ` · ${r.department}` : ""}{r.project ? ` · ${r.project}` : ""} · {r.minutes} min
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {r.confidential && <Pill tone="tone-violet">confidential</Pill>}
                    {r.locked && <Pill tone="tone-warn">locked</Pill>}
                    {r.guests > 0 && <Pill tone="tone-warn">{r.guests} guest{r.guests > 1 ? "s" : ""}</Pill>}
                    <Pill tone="tone-neutral">{r.participants} in</Pill>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "policies" && (
        <div className="space-y-[var(--s4)]">
          <Card>
            <CardHeader
              title="Who can do what"
              subtitle="Precedence: an individual's role rule wins, then their department rule, then the company default."
              action={<Button size="sm" variant="secondary" onClick={() => setAdding(true)}><Plus size={14} /> Add rule</Button>}
            />
            <div className="px-[var(--s4)] pb-[var(--s4)] overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left">
                    <th className="eyebrow font-normal py-2 pr-3 sticky left-0 bg-[var(--bg-elev)]">Applies to</th>
                    {FLAGS.map((f) => (
                      <th key={f.key} className="eyebrow font-normal py-2 px-2 text-center whitespace-nowrap" title={f.hint}>{f.label}</th>
                    ))}
                    <th className="eyebrow font-normal py-2 px-2 text-center whitespace-nowrap" title="Recordings older than this are expired automatically">Keep (days)</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {defaults && <PolicyRow p={defaults} label="Company default" icon={<ShieldCheck size={13} />} onToggle={toggle} onRetention={setRetention} onRemove={removePolicy} />}
                  {byDept.map((p) => (
                    <PolicyRow key={p.id} p={p} label={deptName(p.department_id)} icon={<Building2 size={13} />} onToggle={toggle} onRetention={setRetention} onRemove={removePolicy} />
                  ))}
                  {byRole.map((p) => (
                    <PolicyRow key={p.id} p={p} label={p.role ? ROLE_LABEL[p.role] : "Role"} icon={<Crown size={13} />} onToggle={toggle} onRetention={setRetention} onRemove={removePolicy} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-xs text-muted">
            Super admins and anyone with the <span className="font-medium">Communication</span> admin permission are never blocked by these rules.
            Turning something off hides the button <em>and</em> refuses the action in the database.
          </p>
        </div>
      )}

      {tab === "audit" && (
        <Card>
          <CardHeader title="Live audit trail" subtitle="Rooms started and ended, recordings, guest links, permission changes." />
          {g.audit.length === 0 ? (
            <EmptyState icon={<ScrollText size={18} />} title="Nothing recorded yet" className="py-[var(--s5)]" />
          ) : (
            <div className="divide-y">
              {g.audit.map((a, i) => (
                <div key={`${a.at}-${i}`} className="flex items-center gap-3 px-[var(--s4)] py-2 min-w-0">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm truncate">{humanize(a.action.replace(/^live\./, ""))}{a.summary ? ` · ${a.summary}` : ""}</span>
                    <span className="block text-[11px] text-muted truncate">{a.actor || "System"} · {fmtDate(a.at, true)}</span>
                  </span>
                  <span className="text-[11px] text-muted shrink-0">{ago(a.at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <AddRule
        open={adding}
        onClose={() => setAdding(false)}
        existingDepts={byDept.map((p) => p.department_id || "")}
        existingRoles={byRole.map((p) => p.role).filter((r): r is RoleLevel => !!r)}
        onCreate={async (scope, departmentId, role) => {
          await savePolicy({ scope, department_id: departmentId, role }, {});
          setAdding(false);
          await load();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ a row */
function PolicyRow({ p, label, icon, onToggle, onRetention, onRemove }: {
  p: Policy;
  label: string;
  icon: React.ReactNode;
  onToggle: (p: Policy, key: FlagKey) => void;
  onRetention: (p: Policy, days: string) => void;
  onRemove: (p: Policy) => void;
}) {
  return (
    <tr>
      <td className="py-2 pr-3 sticky left-0 bg-[var(--bg-elev)]">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <span className="text-muted shrink-0">{icon}</span>
          <span className="truncate font-medium">{label}</span>
        </span>
      </td>
      {FLAGS.map((f) => (
        <td key={f.key} className="py-2 px-2 text-center">
          <button
            type="button"
            role="switch"
            aria-checked={!!p[f.key]}
            aria-label={`${label} · ${f.label}`}
            title={f.hint}
            onClick={() => onToggle(p, f.key)}
            className={cn(
              "w-9 h-5 rounded-full relative transition-colors align-middle",
              p[f.key] ? "bg-[var(--brand)]" : "bg-[var(--line)]"
            )}
          >
            <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", p[f.key] ? "left-[18px]" : "left-0.5")} />
          </button>
        </td>
      ))}
      <td className="py-2 px-2 text-center">
        <input
          className="input h-7 w-[68px] text-center num"
          inputMode="numeric"
          placeholder="∞"
          defaultValue={p.recording_retention_days ?? ""}
          onBlur={(e) => {
            const v = e.target.value;
            if (String(p.recording_retention_days ?? "") !== v) onRetention(p, v);
          }}
        />
      </td>
      <td className="py-2 pl-1">
        {p.scope !== "default" && (
          <button type="button" onClick={() => onRemove(p)} className="btn btn-ghost btn-xs btn-icon text-danger" aria-label={`Remove the ${label} rule`}>
            <Trash2 size={13} />
          </button>
        )}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ add rule */
function AddRule({ open, onClose, existingDepts, existingRoles, onCreate }: {
  open: boolean;
  onClose: () => void;
  existingDepts: string[];
  existingRoles: RoleLevel[];
  onCreate: (scope: "department" | "role", departmentId: string | null, role: RoleLevel | null) => Promise<void>;
}) {
  const { departments } = useSession();
  const [scope, setScope] = React.useState<"department" | "role">("department");
  const [departmentId, setDepartmentId] = React.useState("");
  const [role, setRole] = React.useState<RoleLevel | "">("");
  const [busy, setBusy] = React.useState(false);
  const depts = departments.filter((d) => !existingDepts.includes(d.id));
  const roles = ROLES.filter((r) => !existingRoles.includes(r));

  async function submit() {
    if (scope === "department" && !departmentId) return;
    if (scope === "role" && !role) return;
    setBusy(true);
    await onCreate(scope, scope === "department" ? departmentId : null, scope === "role" ? (role as RoleLevel) : null);
    setBusy(false);
    setDepartmentId("");
    setRole("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a collaboration rule"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>Create rule</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Applies to">
          <Select value={scope} onChange={(e) => setScope(e.target.value as "department" | "role")}>
            <option value="department">A department</option>
            <option value="role">A role</option>
          </Select>
        </Field>
        {scope === "department" ? (
          <Field label="Department" hint={depts.length ? undefined : "Every department already has a rule."}>
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Choose…</option>
              {depts.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Role" hint={roles.length ? undefined : "Every role already has a rule."}>
            <Select value={role} onChange={(e) => setRole(e.target.value as RoleLevel)}>
              <option value="">Choose…</option>
              {roles.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </Select>
          </Field>
        )}
        <p className="text-xs text-muted">New rules start from the built-in defaults; switch the toggles once it appears in the matrix.</p>
      </div>
    </Modal>
  );
}
