"use client";

/**
 * One person's access card (§104): what they can actually do, where each answer comes from, and
 * the controls to grant, deny or time-box an individual permission.
 *
 * "Preview as" is a permission *simulation*, never an impersonation (§40): it shows what this
 * person's screens and permissions resolve to. Nobody is signed in as anybody, and no action can
 * be taken through it.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Eye, HelpCircle, Layers, ShieldAlert, ShieldCheck, ShieldX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Spinner, Textarea, useToast } from "@/components/ui";
import { cn, fmtDate, ROLE_LABEL, type RoleLevel } from "@/lib/utils";
import { byGroup, RISK_LABEL, RISK_TONE, type Explanation, type PermissionRow, type PreviewUser } from "./lib";

export function PersonAccess({ userId, catalogue }: { userId: string; catalogue: PermissionRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = React.useState<PreviewUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [why, setWhy] = React.useState<Explanation | null>(null);
  const [editing, setEditing] = React.useState<PermissionRow | null>(null);
  const [tab, setTab] = React.useState<"permissions" | "screens">("permissions");

  // Reload by bumping a counter; state is only ever set from the promise callback, never
  // synchronously in the effect body.
  const [tick, setTick] = React.useState(0);
  const load = React.useCallback(() => setTick((t) => t + 1), []);
  React.useEffect(() => {
    let alive = true;
    createClient()
      .rpc("preview_user_access", { p_user: userId })
      .then(({ data: d, error: e }) => {
        if (!alive) return;
        setLoading(false);
        if (e) { setError(e.message); setData(null); return; }
        setError(null);
        setData(d as unknown as PreviewUser);
      });
    return () => { alive = false; };
  }, [userId, tick]);

  async function explain(perm: string) {
    const { data: d, error: e } = await createClient().rpc("explain_permission", { p_user: userId, p_perm: perm });
    if (e) { toast.push(e.message, "danger"); return; }
    setWhy(d as unknown as Explanation);
  }

  if (loading) return <Card><div className="flex justify-center py-10"><Spinner /></div></Card>;
  if (error) return <Card><EmptyState icon={<ShieldAlert size={18} />} title="Access could not be reviewed" hint={error} className="py-[var(--s5)]" /></Card>;
  if (!data) return null;

  const held = data.permissions.filter((p) => p.allowed && !p.platform_only);
  const groups = byGroup(catalogue.filter((p) => !p.platform_only && p.key !== "*"));
  const allowedKeys = new Set(data.permissions.filter((p) => p.allowed).map((p) => p.key));
  const overrideFor = (key: string) => data.overrides.find((o) => o.perm === key);
  const highRiskHeld = held.filter((p) => p.risk === "high");
  const allowedScreens = data.screens.filter((s) => s.allowed);

  return (
    <div className="space-y-[var(--s3)]">
      <Card>
        <div className="p-[var(--s4)] flex flex-wrap items-start gap-[var(--s3)]">
          <Avatar name={data.user.name} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="h3">{data.user.name}</span>
              <Pill tone="tone-neutral">{ROLE_LABEL[data.user.role as RoleLevel] || data.user.role}</Pill>
              {data.is_platform_owner && <Pill tone="tone-violet"><ShieldCheck size={10} /> Platform owner</Pill>}
              {data.user.status !== "active" && <Pill tone="tone-warn">{data.user.status.replace(/_/g, " ")}</Pill>}
            </div>
            <div className="text-sm text-muted mt-0.5">{data.user.designation || "No designation"}</div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {data.roles.length === 0 ? (
                <span className="text-[11px] text-muted">No additional roles — only their level defaults apply.</span>
              ) : (
                data.roles.map((r) => (
                  <Pill key={r.key} tone={r.acting ? "tone-warn" : "tone-brand"}>
                    {r.name}{r.acting ? " · acting" : ""}{r.expires_at ? ` · until ${fmtDate(r.expires_at)}` : ""}
                  </Pill>
                ))
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[1.618rem] font-semibold num leading-none">{held.length}</div>
            <div className="text-[11px] text-muted">permissions held</div>
            {highRiskHeld.length > 0 && (
              <Pill tone="tone-danger" className="mt-1.5"><ShieldAlert size={10} /> {highRiskHeld.length} high risk</Pill>
            )}
          </div>
        </div>

        {data.is_platform_owner && (
          <div className="mx-[var(--s4)] mb-[var(--s4)] rounded-[var(--radius-sm)] border border-[var(--violet)] tone-violet px-3 py-2 text-xs">
            This person is a platform owner. Platform authority is reserved and is not governed by company roles or
            individual overrides — it can only be changed on the Platform staff screen.
          </div>
        )}
      </Card>

      <div className="flex gap-1 border-b">
        {([["permissions", `Permissions (${held.length})`], ["screens", `Screens (${allowedScreens.length})`]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn("relative h-[38px] px-3 text-sm whitespace-nowrap", tab === k ? "text-[var(--fg)] font-medium" : "text-muted hover:text-[var(--fg-2)]")}
          >
            {label}
            {tab === k && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-[var(--brand)]" />}
          </button>
        ))}
      </div>

      {tab === "permissions" ? (
        <Card>
          <CardHeader title="Effective access" subtitle="What this person can actually do right now, after roles, department, level and any individual rule." />
          <div className="px-[var(--s4)] pb-[var(--s4)] space-y-[var(--s4)]">
            {groups.map((g) => (
              <section key={g.grp}>
                <div className="eyebrow mb-2">{g.label}</div>
                <div className="divide-y border-t">
                  {g.items.map((p) => {
                    const on = allowedKeys.has(p.key);
                    const ov = overrideFor(p.key);
                    return (
                      <div key={p.key} className="py-2 flex items-center gap-2.5 min-w-0">
                        <span className={cn("w-5 h-5 rounded-full shrink-0 flex items-center justify-center", on ? "tone-success" : "tone-muted")}>
                          {on ? <Check size={12} /> : <X size={12} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm">{p.label}</span>
                            {p.risk !== "standard" && <Pill tone={RISK_TONE[p.risk]}>{RISK_LABEL[p.risk]}</Pill>}
                            {ov && (
                              <Pill tone={ov.allowed ? "tone-info" : "tone-danger"}>
                                {ov.allowed ? "granted directly" : "denied directly"}
                                {ov.expires_at ? ` · until ${fmtDate(ov.expires_at)}` : ""}
                              </Pill>
                            )}
                          </span>
                        </span>
                        <button type="button" className="text-[11px] text-muted hover:text-[var(--fg)] inline-flex items-center gap-1 shrink-0" onClick={() => explain(p.key)}>
                          <HelpCircle size={12} /> Why?
                        </button>
                        <Button size="xs" variant="ghost" className="shrink-0" onClick={() => setEditing(p)}>Change</Button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Screens" subtitle="Exactly what this person's navigation contains. The proxy enforces the same list server-side." action={<Eye size={15} className="text-muted" />} />
          <div className="px-[var(--s4)] pb-[var(--s4)]">
            {data.screens.length === 0 ? (
              <EmptyState icon={<Layers size={18} />} title="No screen governance" hint="This company has not restricted any screens yet, so the default applies." className="py-[var(--s4)]" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {data.screens.map((s) => (
                  <div key={s.key} className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-sm", !s.allowed && "opacity-55")}>
                    <span className={cn("w-4 h-4 rounded-full shrink-0 flex items-center justify-center", s.allowed ? "tone-success" : "tone-muted")}>
                      {s.allowed ? <Check size={10} /> : <X size={10} />}
                    </span>
                    <span className="truncate">{s.label}</span>
                    <span className="ml-auto text-[10px] text-muted shrink-0">{s.source}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <WhyModal explanation={why} onClose={() => setWhy(null)} name={data.user.name} />
      {editing && (
        <OverrideModal
          permission={editing}
          userId={userId}
          name={data.user.name}
          current={overrideFor(editing.key)}
          effective={allowedKeys.has(editing.key)}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); void load(); router.refresh(); }}
        />
      )}
    </div>
  );
}

/** WHY does this person have access — the chain, in the order the database evaluated it (§43, §44). */
function WhyModal({ explanation, onClose, name }: { explanation: Explanation | null; onClose: () => void; name: string }) {
  return (
    <Modal open={!!explanation} onClose={onClose} title={explanation?.allowed ? "Why this is allowed" : "Why this is denied"} width={520}>
      {explanation && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className={cn("w-7 h-7 rounded-full flex items-center justify-center", explanation.allowed ? "tone-success" : "tone-danger")}>
              {explanation.allowed ? <ShieldCheck size={15} /> : <ShieldX size={15} />}
            </span>
            <div className="text-sm">
              {name} {explanation.allowed ? "can" : "cannot"} <span className="font-medium">{explanation.perm}</span>
            </div>
          </div>
          <ol className="space-y-2">
            {explanation.chain.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className={cn("mt-0.5 w-1.5 h-1.5 rounded-full shrink-0", step.effect === "allow" ? "bg-[var(--success)]" : "bg-[var(--danger)]")} />
                <span className="min-w-0">
                  <span className="text-xs eyebrow block">{step.step.replace(/_/g, " ")}</span>
                  <span className="text-sm">{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Modal>
  );
}

/** Grant, deny or time-box one permission for one person (§30, §31, §32). */
function OverrideModal({
  permission, userId, name, current, effective, onClose, onDone,
}: {
  permission: PermissionRow;
  userId: string;
  name: string;
  current?: { perm: string; allowed: boolean; expires_at: string | null; reason: string | null };
  effective: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = React.useState<"inherit" | "allow" | "deny">(current ? (current.allowed ? "allow" : "deny") : "inherit");
  const [until, setUntil] = React.useState(current?.expires_at ? current.expires_at.slice(0, 10) : "");
  const [reason, setReason] = React.useState(current?.reason || "");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const supabase = createClient();
    let error;
    if (mode === "inherit") {
      ({ error } = await supabase.from("permission_overrides").delete().eq("user_id", userId).eq("perm", permission.key));
    } else {
      // One rule per person per key: replace rather than stack, so "effective" stays predictable.
      await supabase.from("permission_overrides").delete().eq("user_id", userId).eq("perm", permission.key);
      ({ error } = await supabase.from("permission_overrides").insert({
        user_id: userId,
        perm: permission.key,
        allowed: mode === "allow",
        expires_at: until ? new Date(`${until}T23:59:59`).toISOString() : null,
        reason: reason.trim() || null,
      }));
    }
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(mode === "inherit" ? "Individual rule removed — back to inherited access" : mode === "allow" ? "Granted" : "Denied", "success");
    onDone();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={permission.label}
      width={480}
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}
    >
      <p className="text-sm text-muted mb-3">
        {permission.description}{" "}
        {permission.risk === "high" && <span className="text-danger font-medium">This is a high-risk permission.</span>}
      </p>

      <div className="space-y-1.5 mb-3">
        {([
          ["inherit", "Inherit", `Use whatever their role, department and level give them (currently ${effective ? "allowed" : "denied"}).`],
          ["allow", "Allow", "Grant this to this person specifically, regardless of their role."],
          ["deny", "Deny", "Withhold this from this person specifically. A deny outranks every company-level grant, including company admin."],
        ] as const).map(([k, label, hint]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMode(k)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-[var(--radius-sm)] border transition-colors",
              mode === k ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_8%,transparent)]" : "border-[var(--line)] hover:border-[var(--line-strong)]"
            )}
          >
            <span className="text-sm font-medium">{label}</span>
            <span className="block text-[11px] text-muted mt-0.5">{hint}</span>
          </button>
        ))}
      </div>

      {mode !== "inherit" && (
        <div className="space-y-3">
          <Field label="Until" hint="Leave empty to keep it until somebody changes it. Temporary access lapses on its own.">
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
          <Field label="Reason" hint="Recorded against the change so the next reviewer knows why.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === "allow" ? `Why ${name} needs this…` : `Why ${name} must not have this…`} style={{ minHeight: 64 }} />
          </Field>
          {until && (
            <p className="text-[11px] text-muted inline-flex items-center gap-1">
              <CalendarClock size={12} /> Lapses automatically after {fmtDate(new Date(`${until}T23:59:59`).toISOString())}.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
