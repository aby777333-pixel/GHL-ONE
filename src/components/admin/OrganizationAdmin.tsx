"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, Building, Clock, MoonStar, Siren, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, useToast } from "@/components/ui";
import type { Tables } from "@/lib/utils";
import type { Json } from "@/lib/database.types";

type Settings = {
  working_hours?: { start?: string; end?: string; days?: string[]; timezone?: string };
  quiet_hours?: { start?: string; end?: string; enabled?: boolean };
  escalation?: { overdue_hours?: number; critical_overdue_hours?: number; notify_manager?: boolean; notify_department_head?: boolean; notify_executives?: boolean };
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function readSettings(j: Json): Settings {
  if (!j || typeof j !== "object" || Array.isArray(j)) return {};
  return j as Settings;
}

export function OrganizationAdmin({ org }: { org: Tables<"organizations"> | null }) {
  const router = useRouter();
  const toast = useToast();
  const base = React.useMemo(() => readSettings(org?.settings ?? {}), [org]);
  const [name, setName] = React.useState(org?.name || "");
  const [tagline, setTagline] = React.useState(org?.tagline || "");
  const [whStart, setWhStart] = React.useState(base.working_hours?.start || "09:30");
  const [whEnd, setWhEnd] = React.useState(base.working_hours?.end || "18:30");
  const [whDays, setWhDays] = React.useState<string[]>(base.working_hours?.days || ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [whTz, setWhTz] = React.useState(base.working_hours?.timezone || "Asia/Kolkata");
  const [qhEnabled, setQhEnabled] = React.useState(base.quiet_hours?.enabled ?? true);
  const [qhStart, setQhStart] = React.useState(base.quiet_hours?.start || "21:00");
  const [qhEnd, setQhEnd] = React.useState(base.quiet_hours?.end || "08:00");
  const [busy, setBusy] = React.useState(false);

  if (!org) return <Card><EmptyState icon={<Building size={20} />} title="Organization not found" hint="Your profile is not linked to an organization." /></Card>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setBusy(true);
    const settings: Settings = {
      ...base,
      working_hours: { start: whStart, end: whEnd, days: whDays, timezone: whTz },
      quiet_hours: { enabled: qhEnabled, start: qhStart, end: qhEnd },
      // legacy `escalation` settings are preserved untouched via ...base; the ladder lives in escalation_rules now
    };
    const { error } = await createClient().from("organizations").update({ name: name.trim() || org.name, tagline: tagline.trim() || null, settings: settings as Json }).eq("id", org.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Organization settings saved", "success");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-[var(--s4)]">
      <Card>
        <CardHeader title="Identity" action={<Building size={15} className="text-muted" />} />
        <div className="px-[var(--s4)] pb-[var(--s4)] grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Company name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Tagline"><Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="One Company. One Workspace. One Source of Truth." /></Field>
          <div className="sm:col-span-2 text-[11px] text-muted">Slug: <span className="font-mono">{org.slug}</span> · created {new Date(org.created_at).toLocaleDateString()}</div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s4)]">
        <Card>
          <CardHeader title="Working hours" subtitle="Default schedule for deadlines and availability" action={<Clock size={15} className="text-muted" />} />
          <div className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start"><Input type="time" value={whStart} onChange={(e) => setWhStart(e.target.value)} /></Field>
              <Field label="End"><Input type="time" value={whEnd} onChange={(e) => setWhEnd(e.target.value)} /></Field>
            </div>
            <Field label="Timezone"><Input value={whTz} onChange={(e) => setWhTz(e.target.value)} placeholder="Asia/Kolkata" /></Field>
            <div>
              <span className="label">Working days</span>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => {
                  const on = whDays.includes(d);
                  return <button type="button" key={d} onClick={() => setWhDays((s) => (on ? s.filter((x) => x !== d) : [...s, d]))} className={`pill pill-lg ${on ? "tone-brand" : "tone-neutral"}`}>{d}</button>;
                })}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Quiet hours" subtitle="Non-critical notifications are held until morning" action={<MoonStar size={15} className="text-muted" />} />
          <div className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
            <Toggle on={qhEnabled} onChange={setQhEnabled} label="Enable quiet hours" hint="Critical alerts always break through." />
            <div className="grid grid-cols-2 gap-3">
              <Field label="From"><Input type="time" value={qhStart} onChange={(e) => setQhStart(e.target.value)} disabled={!qhEnabled} /></Field>
              <Field label="Until"><Input type="time" value={qhEnd} onChange={(e) => setQhEnd(e.target.value)} disabled={!qhEnabled} /></Field>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Escalation rules" subtitle="Who gets told when work slips" action={<Siren size={15} className="text-muted" />} />
        <div className="px-[var(--s4)] pb-[var(--s4)] flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-muted flex-1">The escalation ladder — reminders before the deadline, then overdue alerts that climb from assignee to manager, department head and executives — is live and runs every 15 minutes. Edit the steps in the Escalation tab.</p>
          <Link href="/admin?tab=escalation" className="btn btn-secondary btn-sm shrink-0">Open Escalation <ArrowRight size={14} /></Link>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={busy}><Save size={15} /> Save settings</Button>
      </div>
    </form>
  );
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? "bg-[var(--brand)]" : "bg-[var(--line-strong)]"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-[2px]"}`} />
      </button>
      <span className="text-sm"><span className="font-medium">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}
