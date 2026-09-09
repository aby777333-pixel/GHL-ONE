"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, Loader2, Search, ShieldAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Pill, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";
import { rpcError, STATUS_LABEL, STATUS_TONE, type Workspace } from "@/components/platform/lib";

/**
 * The always-visible tenant indicator (§22, §23, §24).
 *
 * It answers one question at a glance: *which company am I looking at right now* — and, when the
 * viewer is platform staff rather than a member of that company, says so in colour. Switching goes
 * through `set_active_workspace` (which validates membership or platform authority and audits every
 * administrative entry) and then refreshes the router so every server component re-reads its data
 * against the new tenant. Nothing is ever merged across companies.
 */
/**
 * Plain fetch helper — no state, so the mount effect can apply the result from a promise callback.
 * Returns null on error so the caller keeps whatever list it already had.
 */
async function fetchWorkspaces(): Promise<Workspace[] | null> {
  const { data, error } = await createClient().rpc("my_workspaces");
  if (error) return null;
  return (data || []) as unknown as Workspace[];
}

export function WorkspaceSwitcher({ className }: { className?: string }) {
  const { profile, platformAdmin } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Workspace[] | null>(null);
  const [q, setQ] = React.useState("");
  const [pending, setPending] = React.useState<Workspace | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    const rows = await fetchWorkspaces();
    if (rows) setItems(rows);
  }, []);

  React.useEffect(() => {
    let alive = true;
    void fetchWorkspaces().then((rows) => {
      if (alive && rows) setItems(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = React.useMemo(() => {
    const list = items || [];
    return list.find((w) => w.active) || list.find((w) => w.org_id === profile.org_id) || null;
  }, [items, profile.org_id]);

  const administrative = current?.mode === "platform_admin";
  const list = (items || []).filter((w) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return [w.name, w.slug, w.tenant_code].some((v) => (v || "").toLowerCase().includes(t));
  });
  const canSwitch = (items || []).length > 1 || platformAdmin;

  async function enter(w: Workspace, why?: string) {
    setBusy(true);
    const { error } = await createClient().rpc("set_active_workspace", { p_org: w.org_id, p_reason: why || undefined });
    setBusy(false);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return;
    }
    setOpen(false);
    setPending(null);
    setReason("");
    setQ("");
    toast.push(w.mode === "platform_admin" ? `Entered ${w.name} in administrative mode` : `Switched to ${w.name}`, "success");
    // Every server component must re-read against the new tenant — never mix two companies in one view.
    router.push("/");
    router.refresh();
    load();
  }

  const name = current?.name || "Workspace";
  const badge = current ? (
    <span
      className={cn("w-6 h-6 rounded-[7px] shrink-0 inline-flex items-center justify-center text-[10px] font-bold text-white overflow-hidden", administrative && "ring-2 ring-[var(--orange)]")}
      style={{ background: current.accent_color || "linear-gradient(135deg, var(--brand), #0f172a)" }}
    >
      {current.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={current.logo_url} alt="" className="w-full h-full object-cover" />
      ) : (
        (current.name || "?").slice(0, 2).toUpperCase()
      )}
    </span>
  ) : (
    <Building2 size={15} className="text-muted shrink-0" />
  );

  return (
    <div ref={ref} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        onClick={() => canSwitch && setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 h-9 pl-1.5 pr-2 rounded-[var(--radius-sm)] border max-w-[46vw] sm:max-w-[260px] transition-colors",
          administrative ? "border-[var(--orange)] bg-[var(--orange-bg)]" : "border-[var(--line)] bg-[var(--bg)] hover:border-[var(--line-strong)]",
          !canSwitch && "cursor-default"
        )}
        title={administrative ? `${name} — you are here as platform staff, not as a member` : name}
        aria-label={`Current company: ${name}`}
      >
        {badge}
        <span className="min-w-0 hidden sm:block text-left leading-tight">
          <span className="block text-[13px] font-medium truncate max-w-[150px]">{name}</span>
          {administrative ? (
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-orange">Administrative mode</span>
          ) : current?.tenant_code ? (
            /* Label it. A bare "GHL-001" under your own name reads as *your* employee code, and
               testers reported it as a mismatch against the (different, per-person) code on the
               profile. It is the company's tenant code and nothing else. */
            <span className="block text-[10px] text-muted truncate" title={`Company code ${current.tenant_code}`}>
              Company · {current.tenant_code}
            </span>
          ) : null}
        </span>
        {administrative && <ShieldAlert size={14} className="text-orange sm:hidden" />}
        {canSwitch && <ChevronDown size={13} className="text-muted shrink-0" />}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-[80] card anim-pop w-[min(92vw,340px)] overflow-hidden" style={{ boxShadow: "var(--shadow-lg)" }}>
          <div className="px-3 pt-2.5 pb-2 border-b">
            <div className="eyebrow">Switch company</div>
            <div className="relative mt-1.5">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies…" className="input pl-8 h-8 text-[13px]" />
            </div>
          </div>

          <div className="max-h-[46vh] overflow-y-auto py-1">
            {items === null && (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            )}
            {items !== null && list.length === 0 && <div className="px-3 py-3 text-sm text-muted">No company matches “{q}”.</div>}
            {list.map((w) => {
              const isPending = pending?.org_id === w.org_id;
              return (
                <div key={w.org_id} className="px-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => (w.mode === "platform_admin" ? (setPending(isPending ? null : w), setReason("")) : enter(w))}
                    className={cn("w-full flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--radius-sm)] text-left row-hover", w.active && "bg-[var(--neutral-bg)]")}
                  >
                    <span
                      className={cn("w-7 h-7 rounded-[7px] shrink-0 inline-flex items-center justify-center text-[10px] font-bold text-white overflow-hidden", w.mode === "platform_admin" && "ring-2 ring-[var(--orange)]")}
                      style={{ background: w.accent_color || "linear-gradient(135deg, var(--brand), #0f172a)" }}
                    >
                      {w.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={w.logo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (w.name || "?").slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium truncate">{w.name}</span>
                        {w.active && <Check size={13} className="text-[var(--success)] shrink-0" />}
                      </span>
                      <span className="flex items-center gap-1.5 mt-0.5">
                        {w.mode === "platform_admin" ? (
                          <Pill tone="tone-orange">Platform staff</Pill>
                        ) : (
                          <span className="text-[10px] text-muted truncate">{w.tenant_code || w.slug}</span>
                        )}
                        {w.status !== "active" && <Pill tone={STATUS_TONE[w.status] || "tone-neutral"}>{STATUS_LABEL[w.status] || w.status}</Pill>}
                      </span>
                    </span>
                  </button>

                  {isPending && (
                    <div className="mx-2 mb-2 mt-1 p-2.5 rounded-[var(--radius-sm)] border border-[var(--orange)] bg-[var(--orange-bg)]">
                      <div className="text-[11px] font-semibold text-orange flex items-center gap-1.5">
                        <ShieldAlert size={12} /> Entering as platform staff
                      </div>
                      <p className="text-[11px] text-2 mt-1">
                        You are not a member of {w.name}. This entry is recorded in the company&apos;s own audit trail. Say why.
                      </p>
                      <input
                        autoFocus
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason for entering this company"
                        className="input h-8 text-[13px] mt-1.5"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && reason.trim().length >= 6) enter(w, reason.trim());
                        }}
                      />
                      <div className="flex items-center justify-end gap-1.5 mt-1.5">
                        <Button size="xs" variant="ghost" onClick={() => setPending(null)}>
                          <X size={13} /> Cancel
                        </Button>
                        <Button size="xs" variant="primary" loading={busy} disabled={reason.trim().length < 6} onClick={() => enter(w, reason.trim())}>
                          Enter company
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-3 py-2 border-t text-[11px] text-muted">
            Data never mixes between companies. Switching reloads everything for the company you pick.
          </div>
        </div>
      )}
    </div>
  );
}
