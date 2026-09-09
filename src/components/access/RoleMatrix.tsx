"use client";

/**
 * The action matrix for one role (§39, §122), with the two things that make editing authority
 * safe to do: you see the diff before you save it, and you see who it reaches.
 *
 * Nothing here decides anything. The grid renders the catalogue, the impact panel comes from
 * `role_change_impact()`, and the save is an ordinary RLS-checked write that the database's own
 * grant-authority triggers will refuse if the editor is reaching past their own authority.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, History, Minus, Plus, RotateCcw, Save, ShieldAlert, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Modal, Pill, Spinner, useToast } from "@/components/ui";
import { cn, fmtDate } from "@/lib/utils";
import { byGroup, RISK_LABEL, RISK_TONE, type ChangeImpact, type PermissionRow } from "./lib";

export type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  base_level: string;
  permissions: string[];
  is_system: boolean;
};

type Version = { version: number; name: string | null; permissions: string[]; created_at: string; created_by: string | null };

export function RoleMatrix({ role, catalogue, onSaved }: { role: RoleRow; catalogue: PermissionRow[]; onSaved?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = React.useState<string[]>(role.permissions || []);
  const [impact, setImpact] = React.useState<ChangeImpact | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [versions, setVersions] = React.useState<Version[] | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  const original = React.useMemo(() => new Set(role.permissions || []), [role.permissions]);
  const chosen = React.useMemo(() => new Set(selected), [selected]);
  const dirty = React.useMemo(
    () => selected.length !== original.size || selected.some((p) => !original.has(p)),
    [selected, original]
  );

  const groups = React.useMemo(() => byGroup(catalogue.filter((p) => !p.platform_only && p.key !== "*")), [catalogue]);

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  /** Ask the database what this change would actually do, before offering to save it (§45, §46). */
  async function review() {
    setChecking(true);
    const { data, error } = await createClient().rpc("role_change_impact", { p_role: role.id, p_permissions: selected });
    setChecking(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setImpact(data as unknown as ChangeImpact);
  }

  async function save() {
    setSaving(true);
    const { error } = await createClient().from("system_roles").update({ permissions: selected }).eq("id", role.id);
    setSaving(false);
    if (error) {
      // The grant-authority triggers speak in plain language; show what they said rather than "failed".
      toast.push(error.message, "danger");
      return;
    }
    toast.push(`“${role.name}” updated${impact?.affected_count ? ` for ${impact.affected_count} ${impact.affected_count === 1 ? "person" : "people"}` : ""}`, "success");
    setImpact(null);
    onSaved?.();
    router.refresh();
  }

  async function loadVersions() {
    setHistoryOpen(true);
    if (versions) return;
    const { data } = await createClient()
      .from("system_role_versions")
      .select("version,name,permissions,created_at,created_by")
      .eq("system_role_id", role.id)
      .order("version", { ascending: false });
    setVersions((data || []) as Version[]);
  }

  async function restore(version: number) {
    const { error } = await createClient().rpc("restore_system_role", { p_role: role.id, p_version: version });
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`Restored version ${version}`, "success");
    setHistoryOpen(false);
    setVersions(null);
    onSaved?.();
    router.refresh();
  }

  return (
    <div className="space-y-[var(--s3)]">
      <Card>
        <CardHeader
          title={<span className="inline-flex items-center gap-2">{role.name} {role.is_system && <Pill tone="tone-neutral">built in</Pill>}</span>}
          subtitle={role.description || `Base level ${role.base_level.replace(/_/g, " ")} · ${selected.length} of ${groups.reduce((n, g) => n + g.items.length, 0)} permissions`}
          action={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={loadVersions}><History size={14} /> History</Button>
              {dirty && <Button size="sm" variant="ghost" onClick={() => { setSelected(role.permissions || []); setImpact(null); }}><RotateCcw size={14} /> Reset</Button>}
              <Button size="sm" variant={dirty ? "primary" : "secondary"} disabled={!dirty} loading={checking} onClick={review}>
                Review change
              </Button>
            </div>
          }
        />
        <div className="px-[var(--s4)] pb-[var(--s4)] space-y-[var(--s4)]">
          {groups.map((g) => (
            <section key={g.grp}>
              <div className="eyebrow mb-2">{g.label}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
                {g.items.map((p) => {
                  const on = chosen.has(p.key);
                  const added = on && !original.has(p.key);
                  const dropped = !on && original.has(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => toggle(p.key)}
                      aria-pressed={on}
                      title={p.description || p.label}
                      className={cn(
                        "flex items-start gap-2.5 text-left px-2.5 py-2 rounded-[var(--radius-sm)] border transition-colors min-w-0",
                        on ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_8%,transparent)]" : "border-[var(--line)] hover:border-[var(--line-strong)]",
                        added && "ring-2 ring-[var(--success)]",
                        dropped && "ring-2 ring-[var(--danger)] opacity-70"
                      )}
                    >
                      <span className={cn("w-4 h-4 rounded-[4px] shrink-0 mt-0.5 flex items-center justify-center border", on ? "bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-fg)]" : "border-[var(--line-strong)]")}>
                        {on && <Check size={11} />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm leading-snug">{p.label}</span>
                          {p.risk !== "standard" && <Pill tone={RISK_TONE[p.risk]}>{RISK_LABEL[p.risk]}</Pill>}
                          {added && <Pill tone="tone-success"><Plus size={9} /> adding</Pill>}
                          {dropped && <Pill tone="tone-danger"><Minus size={9} /> removing</Pill>}
                        </span>
                        {p.description && <span className="block text-[11px] text-muted mt-0.5">{p.description}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </Card>

      {/* Before / after, and who it reaches — shown before the save, never after it (§45, §46, §57). */}
      <Modal
        open={!!impact}
        onClose={() => setImpact(null)}
        title="Review this change"
        width={620}
        footer={
          <>
            <Button variant="ghost" onClick={() => setImpact(null)} disabled={saving}>Back to editing</Button>
            <Button variant={impact?.high_risk.length ? "danger" : "primary"} loading={saving} onClick={save}>
              <Save size={15} /> {impact?.high_risk.length ? "I understand — apply" : "Apply change"}
            </Button>
          </>
        }
      >
        {impact && (
          <div className="space-y-[var(--s3)]">
            {impact.high_risk.length > 0 && (
              <div className="rounded-[var(--radius-sm)] border border-[var(--danger)] tone-danger px-3 py-2.5">
                <div className="text-sm font-medium inline-flex items-center gap-1.5"><ShieldAlert size={14} /> This grants high-risk authority</div>
                <div className="text-xs mt-1">{impact.high_risk.join(" · ")}</div>
              </div>
            )}

            {impact.missing_dependencies.length > 0 && (
              <div className="rounded-[var(--radius-sm)] border border-[var(--warn)] tone-warn px-3 py-2.5">
                <div className="text-sm font-medium inline-flex items-center gap-1.5"><AlertTriangle size={14} /> Some of these will not work on their own</div>
                <ul className="text-xs mt-1 space-y-0.5">
                  {impact.missing_dependencies.map((d, i) => (
                    <li key={i}>“{d.permission}” also needs <span className="font-medium">{d.needs}</span>.</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-[var(--s3)]">
              <div>
                <div className="eyebrow mb-1.5">Newly granted</div>
                {impact.granted.length === 0 ? (
                  <p className="text-sm text-muted">Nothing.</p>
                ) : (
                  <ul className="space-y-1">
                    {impact.granted.map((p) => (
                      <li key={p.key} className="text-sm inline-flex items-center gap-1.5"><Plus size={12} className="text-success" /> {p.label}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="eyebrow mb-1.5">Removed</div>
                {impact.removed.length === 0 ? (
                  <p className="text-sm text-muted">Nothing.</p>
                ) : (
                  <ul className="space-y-1">
                    {impact.removed.map((p) => (
                      <li key={p.key} className="text-sm inline-flex items-center gap-1.5"><Minus size={12} className="text-danger" /> {p.label}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="border-t pt-[var(--s3)]">
              <div className="text-sm font-medium inline-flex items-center gap-1.5">
                <Users size={14} className="text-muted" />
                {impact.affected_count === 0
                  ? "Nobody holds this role yet."
                  : `This changes what ${impact.affected_count} ${impact.affected_count === 1 ? "person" : "people"} can do.`}
              </div>
              {impact.affected.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {impact.affected.map((a) => (
                    <span key={a.id} className="pill tone-neutral"><Avatar name={a.name} size={14} /> {a.name}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Version history and rollback (§49, §51). */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={`History · ${role.name}`} width={560}>
        {versions === null ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : versions.length === 0 ? (
          <EmptyState icon={<History size={18} />} title="No earlier versions" hint="A version is kept every time this role's permissions change." className="py-[var(--s4)]" />
        ) : (
          <div className="divide-y">
            {versions.map((v) => (
              <div key={v.version} className="py-2.5 flex items-start gap-3">
                <Pill tone="tone-neutral">v{v.version}</Pill>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{v.permissions.length} permission{v.permissions.length === 1 ? "" : "s"}</div>
                  <div className="text-[11px] text-muted">{fmtDate(v.created_at, true)}</div>
                </div>
                <Button size="xs" variant="secondary" onClick={() => restore(v.version)}>Restore</Button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
