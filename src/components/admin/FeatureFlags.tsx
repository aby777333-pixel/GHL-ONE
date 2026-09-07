"use client";

import * as React from "react";
import { Bot, BookOpen, CalendarClock, Clock, FolderOpen, Lightbulb, LifeBuoy, Timer, Users, Workflow, FlaskConical, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, EmptyState, Pill, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, isAdminRole, type Tables } from "@/lib/utils";
import { Note, Switch } from "./AdminBits";
import { hasPerm } from "./perms";

export type FeatureFlagRow = Tables<"feature_flags">;

const FEATURES: { key: string; label: string; hint: string; icon: React.ReactNode }[] = [
  { key: "attendance", label: "Attendance", hint: "Check-in / check-out, daily board, corrections — no location unless the employee shares it.", icon: <Clock size={15} /> },
  { key: "shifts", label: "Shifts & roster", hint: "Shift patterns, assignments and swap requests for support and field teams.", icon: <CalendarClock size={15} /> },
  { key: "timesheets", label: "Focus & timesheets", hint: "Voluntary focus sessions and suggested time entries from meetings and completed tasks.", icon: <Timer size={15} /> },
  { key: "help_desk", label: "Help desk", hint: "Service catalog and help requests with SLAs, owners and dedicated rooms.", icon: <LifeBuoy size={15} /> },
  { key: "automations", label: "Automations", hint: "WHEN / IF / THEN rules, recurring tasks, handoffs, escalation ladder and digests.", icon: <Workflow size={15} /> },
  { key: "ai", label: "Intelligence", hint: "Ask, briefs, summaries, meeting extraction and risk briefings — AI proposes, people confirm.", icon: <Bot size={15} /> },
  { key: "common", label: "GHL Common", hint: "Company-wide rooms: ideas, help, creative, events, random, learning, wins.", icon: <Users size={15} /> },
  { key: "ideas", label: "Ideas", hint: "Suggestion box with votes and follow-through into tasks.", icon: <Lightbulb size={15} /> },
  { key: "wiki", label: "Wiki", hint: "Company knowledge: policies, playbooks, how-tos.", icon: <BookOpen size={15} /> },
  { key: "files", label: "Files", hint: "Versioned documents with classification-based visibility and access requests.", icon: <FolderOpen size={15} /> },
];

type Flag = { feature: string; enabled: boolean; beta: boolean; department_ids: string[] | null };

export function FeatureFlags({ flags: initial, orgId, perms }: { flags: FeatureFlagRow[]; orgId: string; perms: string[] }) {
  const toast = useToast();
  const { profile, departments } = useSession();
  const canEdit = isAdminRole(profile.role) || hasPerm(perms, "features.manage");
  const [flags, setFlags] = React.useState<Record<string, Flag>>(() => {
    const m: Record<string, Flag> = {};
    for (const f of FEATURES) m[f.key] = { feature: f.key, enabled: true, beta: false, department_ids: null };
    for (const f of initial) m[f.feature] = { feature: f.feature, enabled: f.enabled, beta: f.beta, department_ids: f.department_ids };
    return m;
  });
  const [saving, setSaving] = React.useState<string | null>(null);

  async function save(feature: string, patch: Partial<Flag>) {
    const prev = flags[feature];
    const next = { ...prev, ...patch };
    setFlags((s) => ({ ...s, [feature]: next }));
    setSaving(feature);
    const { error } = await createClient().from("feature_flags").upsert({ org_id: orgId, feature, enabled: next.enabled, beta: next.beta, department_ids: next.department_ids }, { onConflict: "org_id,feature" });
    setSaving(null);
    if (error) { setFlags((s) => ({ ...s, [feature]: prev })); toast.push(error.message, "danger"); return; }
  }

  const toggleDept = (feature: string, deptId: string) => {
    const cur = flags[feature].department_ids;
    const set = new Set(cur || departments.map((d) => d.id));
    if (set.has(deptId)) set.delete(deptId); else set.add(deptId);
    const arr = [...set];
    save(feature, { department_ids: arr.length === 0 || arr.length === departments.length ? null : arr });
  };

  const extra = initial.filter((f) => !FEATURES.some((k) => k.key === f.feature));
  const enabledCount = Object.values(flags).filter((f) => f.enabled).length;

  return (
    <div className="space-y-[var(--s3)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><div className="eyebrow">Features</div><div className="text-[11px] text-muted mt-0.5">{enabledCount} of {Object.keys(flags).length} enabled · flags apply instantly; users see modules disappear from navigation on their next page load.</div></div>
        {!canEdit && <Pill tone="tone-warn">Read-only</Pill>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s2)] stagger">
        {[...FEATURES, ...extra.map((f) => ({ key: f.feature, label: f.feature, hint: "Custom feature flag", icon: <FlaskConical size={15} /> }))].map((f) => {
          const fl = flags[f.key];
          const scoped = fl.department_ids != null;
          return (
            <Card key={f.key} className={cn("p-3 min-w-0 transition-opacity", !fl.enabled && "opacity-70", saving === f.key && "animate-pulse")}>
              <div className="flex items-start gap-3">
                <span className={cn("w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0", fl.enabled ? "tone-brand" : "sunken text-muted")}>{f.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium">{f.label}</span>{fl.beta && <Pill tone="tone-violet">Beta</Pill>}{scoped && <Pill tone="tone-info">{fl.department_ids!.length} dept{fl.department_ids!.length === 1 ? "" : "s"}</Pill>}{!fl.enabled && <Pill tone="tone-muted">Off</Pill>}</div>
                  <div className="text-[11px] text-muted mt-0.5">{f.hint}</div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">On <Switch size="sm" on={fl.enabled} onChange={(v) => save(f.key, { enabled: v })} disabled={!canEdit} /></span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">Beta <Switch size="sm" on={fl.beta} onChange={(v) => save(f.key, { beta: v })} disabled={!canEdit} /></span>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted inline-flex items-center gap-1 mr-1"><Building2 size={11} /> Where:</span>
                <button type="button" disabled={!canEdit} onClick={() => save(f.key, { department_ids: null })} className={cn("pill transition-colors", !scoped ? "tone-brand" : "tone-neutral")}>All departments</button>
                {departments.map((d) => {
                  const on = !scoped || fl.department_ids!.includes(d.id);
                  return (
                    <button type="button" key={d.id} disabled={!canEdit} onClick={() => toggleDept(f.key, d.id)} className={cn("pill transition-colors inline-flex items-center gap-1", scoped && on ? "tone-info" : "tone-neutral", !on && "opacity-50")} title={on ? `Enabled for ${d.name}` : `Disabled for ${d.name}`}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: d.color }} />{d.name}
                    </button>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
      {departments.length === 0 && <Card><EmptyState title="No departments yet" hint="Department scoping becomes available once departments exist." className="py-4" /></Card>}
      <Note tone="neutral">Turning a feature off hides it for everyone (or the selected departments) but keeps the data. Beta marks a feature as “try it” in navigation. Attendance and timesheets never add tracking beyond what the employee does explicitly.</Note>
    </div>
  );
}
