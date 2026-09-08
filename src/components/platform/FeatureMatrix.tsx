"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input, Pill, useToast } from "@/components/ui";
import { Switch } from "@/components/admin/AdminBits";
import { cn, humanize } from "@/lib/utils";
import { rpcError, type FeatureRow } from "./lib";

type Limits = Record<string, { limit: number | null; dirty: boolean }>;

const CATEGORY_ORDER = ["core", "work", "communication", "intelligence", "people", "platform"];
const CATEGORY_HINT: Record<string, string> = {
  core: "The parts every company needs to exist at all.",
  work: "How work is planned, assigned and tracked.",
  communication: "How people talk to each other and to the outside world.",
  intelligence: "AI and the company's own knowledge.",
  people: "Employment, training and equipment.",
  platform: "Connections to other systems.",
};

/**
 * Which modules this company gets (§45-49). Every write goes through `set_org_feature`, which checks
 * platform authority in the database and writes an audit row — the switch on screen is never the control.
 */
export function FeatureMatrix({ orgId, features, readOnly }: { orgId: string; features: FeatureRow[]; readOnly?: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [state, setState] = React.useState<Record<string, boolean>>(() => Object.fromEntries(features.map((f) => [f.key, f.enabled])));
  const [limits, setLimits] = React.useState<Limits>({});
  const [saving, setSaving] = React.useState<string | null>(null);

  // Limits live in org_features, which the overview payload does not carry.
  React.useEffect(() => {
    let alive = true;
    createClient()
      .from("org_features")
      .select("feature_key,limit_value")
      .eq("org_id", orgId)
      .then(({ data }) => {
        if (!alive) return;
        const m: Limits = {};
        for (const r of data || []) m[r.feature_key] = { limit: r.limit_value == null ? null : Number(r.limit_value), dirty: false };
        setLimits(m);
      });
    return () => {
      alive = false;
    };
  }, [orgId]);

  async function write(key: string, enabled: boolean, limit?: number | null) {
    setSaving(key);
    const { error } = await createClient().rpc("set_org_feature", { p_org: orgId, p_key: key, p_enabled: enabled, p_limit: limit ?? undefined });
    setSaving(null);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return false;
    }
    return true;
  }

  async function toggle(key: string, enabled: boolean) {
    const prev = state[key];
    setState((s) => ({ ...s, [key]: enabled }));
    const ok = await write(key, enabled, limits[key]?.limit ?? null);
    if (!ok) {
      setState((s) => ({ ...s, [key]: prev }));
      return;
    }
    router.refresh();
  }

  async function saveLimit(key: string) {
    const v = limits[key]?.limit ?? null;
    const ok = await write(key, state[key], v);
    if (!ok) return;
    setLimits((s) => ({ ...s, [key]: { limit: v, dirty: false } }));
    toast.push("Limit saved", "success");
  }

  const grouped = React.useMemo(() => {
    const m = new Map<string, FeatureRow[]>();
    for (const f of features) {
      const list = m.get(f.category) || [];
      list.push(f);
      m.set(f.category, list);
    }
    return [...m.entries()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]);
      const ib = CATEGORY_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [features]);

  const on = features.filter((f) => state[f.key]).length;

  return (
    <div className="space-y-[var(--s4)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="eyebrow">Features</div>
          <div className="text-[11px] text-muted mt-0.5">
            {on} of {features.length} on. Turning a module off hides it and stops it working for everyone in this company on their next page load.
          </div>
        </div>
        {readOnly && <Pill tone="tone-warn">Read-only</Pill>}
      </div>

      {grouped.map(([category, list]) => (
        <section key={category} className="min-w-0">
          <div className="eyebrow">{humanize(category)}</div>
          <div className="text-[11px] text-muted mt-0.5 mb-2">{CATEGORY_HINT[category] || ""}</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s2)]">
            {list.map((f) => {
              const enabled = !!state[f.key];
              const lim = limits[f.key];
              return (
                <Card key={f.key} className={cn("p-3 min-w-0 transition-opacity", !enabled && "opacity-70", saving === f.key && "animate-pulse")}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{f.label}</div>
                      <div className="text-[11px] text-muted mt-0.5 font-mono">{f.key}</div>
                    </div>
                    <Switch on={enabled} disabled={readOnly || saving === f.key} onChange={(v) => toggle(f.key, v)} size="sm" />
                  </div>
                  {enabled && !readOnly && (
                    <div className="flex items-end gap-2 mt-2 pt-2 border-t">
                      <label className="min-w-0 flex-1">
                        <span className="label mb-1 text-[10px]">Limit (optional)</span>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 text-[13px]"
                          placeholder="No limit"
                          value={lim?.limit ?? ""}
                          onChange={(e) => setLimits((s) => ({ ...s, [f.key]: { limit: e.target.value === "" ? null : Number(e.target.value), dirty: true } }))}
                        />
                      </label>
                      <Button size="sm" variant="secondary" disabled={!lim?.dirty} onClick={() => saveLimit(f.key)}>
                        Save
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      <div className="text-[11px] text-muted flex items-start gap-1.5">
        <Info size={13} className="shrink-0 mt-px" />
        Feature changes are written by <span className="font-mono">set_org_feature</span> and recorded in the platform audit trail with your name.
      </div>
    </div>
  );
}
