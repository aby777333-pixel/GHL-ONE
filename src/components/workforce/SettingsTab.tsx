"use client";

import * as React from "react";
import { Save, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, Field, Input, Select, useToast } from "@/components/ui";
import { Switch } from "@/components/admin/AdminBits";
import { parseSettings, PRIVACY_PRINCIPLE, type AttendanceSettings } from "./lib";

type NumKey = { [K in keyof AttendanceSettings]: AttendanceSettings[K] extends number ? K : never }[keyof AttendanceSettings];
type BoolKey = { [K in keyof AttendanceSettings]: AttendanceSettings[K] extends boolean ? K : never }[keyof AttendanceSettings];

const NUMBERS: { key: NumKey; label: string; hint: string; group: string; min?: number }[] = [
  { key: "grace_minutes", label: "Grace period (minutes)", hint: "Arrivals within this window after shift start are not marked late", group: "Day rules" },
  { key: "early_leave_minutes", label: "Early leave threshold (minutes)", hint: "Check-out earlier than this before shift end is flagged", group: "Day rules" },
  { key: "short_day_minutes", label: "Short day (minutes worked)", hint: "Days with less worked time are flagged (default 6 hours)", group: "Day rules" },
  { key: "max_break_minutes_day", label: "Max break minutes per day", hint: "Above this the day is flagged as excess break", group: "Day rules" },
  { key: "not_in_alert_minutes", label: "“Forgot to check in?” after (minutes)", hint: "Minutes after shift start before the person is nudged; the manager is told an hour later", group: "Nudges" },
  { key: "checkout_reminder_minutes", label: "Check-out reminder after shift end (minutes)", hint: "“Still working?” nudge", group: "Nudges" },
  { key: "break_alert_manager_multiplier", label: "Tell the manager at × break limit", hint: "e.g. 2 = manager hears when a 15-minute break passes 30 minutes", group: "Nudges", min: 1 },
  { key: "idle_hours", label: "Operational inactivity after (hours)", hint: "Clocked in but no task / message / attendance / focus activity — never device telemetry", group: "Nudges", min: 1 },
  { key: "auto_checkout_after_minutes", label: "Auto check-out grace (minutes)", hint: "Reserved for the nightly close; days are closed at shift end or last activity", group: "Automation" },
  { key: "access_events_retention_days", label: "Access log retention (days)", hint: "Who-viewed-what records older than this are purged nightly", group: "Automation", min: 7 },
];
const BOOLS: { key: BoolKey; label: string; hint: string; group: string }[] = [
  { key: "auto_checkout", label: "Auto check-out at night", hint: "Close days left open (flagged as missing check-out, person is told)", group: "Automation" },
  { key: "employee_alerts", label: "Employee nudges", hint: "Check-in reminders, break time-up, check-out reminders to the person", group: "Nudges" },
  { key: "daily_summary", label: "Daily summary to department heads", hint: "Yesterday’s attendance line at 09:05", group: "Automation" },
  { key: "weekly_summary", label: "Weekly summary", hint: "Company line to HR / attendance admins", group: "Automation" },
];
const GROUPS = ["Day rules", "Nudges", "Automation"];

export function SettingsTab({ initial }: { initial: AttendanceSettings }) {
  const toast = useToast();
  const [s, setS] = React.useState<AttendanceSettings>(initial);
  const [busy, setBusy] = React.useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await createClient().rpc("set_attendance_settings", { p_patch: { ...s } });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    setS(parseSettings(data));
    toast.push("Attendance settings saved (audited)", "success");
  }

  return (
    <form onSubmit={save} className="space-y-[var(--s3)]">
      <div className="rounded-[var(--radius-sm)] border border-[var(--success)] tone-success px-3 py-2 text-sm flex items-start gap-2"><ShieldCheck size={15} className="shrink-0 mt-0.5" /> {PRIVACY_PRINCIPLE}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--s3)] items-start">
        {GROUPS.map((g) => (
          <Card key={g}>
            <CardHeader title={g} />
            <div className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
              {NUMBERS.filter((n) => n.group === g).map((n) => (
                <Field key={n.key} label={n.label} hint={n.hint}><Input type="number" min={n.min ?? 0} value={s[n.key]} onChange={(e) => setS((x) => ({ ...x, [n.key]: Number(e.target.value) }))} /></Field>
              ))}
              {BOOLS.filter((b) => b.group === g).map((b) => (
                <Switch key={b.key} on={s[b.key]} onChange={(v) => setS((x) => ({ ...x, [b.key]: v }))} label={b.label} hint={b.hint} />
              ))}
              {g === "Day rules" && (
                <Field label="Who can see shared check-in locations" hint="Only pins the person chose to share on a specific check-in">
                  <Select value={s.show_location_to} onChange={(e) => setS((x) => ({ ...x, show_location_to: e.target.value }))}>
                    <option value="self">Only the person</option>
                    <option value="self_hr">Person + HR</option>
                    <option value="self_manager_hr">Person + manager + HR</option>
                  </Select>
                </Field>
              )}
            </div>
          </Card>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[11px] text-muted">Changes are written to the audit log with before / after values.</span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={() => setS(initial)} disabled={!dirty || busy}>Reset</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!dirty}><Save size={14} /> Save settings</Button>
        </div>
      </div>
    </form>
  );
}
