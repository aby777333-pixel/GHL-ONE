"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, Check, Eye, EyeOff, Save, ShieldCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Pill, Skeleton, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, fmtDate, type Tables } from "@/lib/utils";

type PrivateRow = Tables<"profiles_private">;
type TimelineRow = { occurred_at: string; kind: string; title: string; link: string | null };
type Emergency = { name?: string; relation?: string; phone?: string };

const RECORDED: { what: string; why: string }[] = [
  { what: "Clock in / out and break times", why: "Only when you press the button. Used for your attendance day and payroll accuracy." },
  { what: "Work mode (office, remote, field…)", why: "What you choose on clock-in, so colleagues know where to reach you." },
  { what: "Location — only if you tick “share my location” on a check-in", why: "Captured once at that moment, never continuously. Off by default." },
  { what: "Focus sessions and time entries you start", why: "Voluntary. Used for your own timesheet and task estimates." },
  { what: "Tasks, comments, files and messages you author", why: "Normal work records. Visible to whoever can see the task, project or room." },
  { what: "Leave requests, shift assignments and swaps", why: "Needed to run the roster and approvals." },
];
const NOT_RECORDED = [
  "Keystrokes or mouse activity",
  "Screen contents or screenshots",
  "Webcam or microphone",
  "Continuous or background location",
  "Websites or apps you use",
  "Contents of your private messages (admins see only room membership and metadata)",
];
const WHO: { who: string; sees: string }[] = [
  { who: "You", sees: "Everything on this page, always." },
  { who: "Your manager and team leads", sees: "Attendance days, leave, roster, time entries and your work activity." },
  { who: "HR admins", sees: "The same plus your private record (emergency contact, address, date of birth)." },
  { who: "Super Admin", sees: "Everything, and every Super Admin action is written to the audit log you can ask HR to see." },
];

/** Compact, reusable list of what the system records (used on the attendance page). */
export function WhatIsRecorded({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("grid gap-[var(--s3)]", compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}>
      <div>
        <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><Eye size={12} /> Recorded about you</div>
        <ul className="space-y-1.5">
          {RECORDED.map((r) => (
            <li key={r.what} className="flex items-start gap-2 text-sm">
              <Check size={14} className="text-success shrink-0 mt-0.5" />
              <span className="min-w-0"><span className="font-medium">{r.what}</span>{!compact && <span className="block text-[11px] text-muted leading-snug">{r.why}</span>}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><EyeOff size={12} /> Never recorded</div>
        <ul className="space-y-1.5">
          {NOT_RECORDED.map((n) => (
            <li key={n} className="flex items-start gap-2 text-sm"><X size={14} className="text-danger shrink-0 mt-0.5" /><span>{n}</span></li>
          ))}
        </ul>
        {!compact && <div className="text-[11px] text-muted mt-3">Retention: attendance and time entries are kept for the statutory period (currently 3 years) and then removed. Chat and task history lives with the room or project. You can ask HR for a copy or a correction at any time.</div>}
      </div>
    </div>
  );
}

/**
 * Privacy Center — rendered on the person's own profile. Plain language, no dark patterns:
 * what is recorded, who sees it, what is never recorded, a transparent copy of the last 7 days of recorded
 * activity (`activity_timeline`) and the person's own private record (`profiles_private`, self-editable).
 */
export function PrivacyCenter() {
  const { profile } = useSession();
  const toast = useToast();
  const [timeline, setTimeline] = React.useState<TimelineRow[] | null>(null);
  const [priv, setPriv] = React.useState<PrivateRow | null | undefined>(undefined);
  const [saving, setSaving] = React.useState(false);
  const [emergency, setEmergency] = React.useState<Emergency>({});
  const [personalEmail, setPersonalEmail] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [dob, setDob] = React.useState("");
  const [showBirthday, setShowBirthday] = React.useState(false);
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    const supabase = createClient();
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 86400000);
    (async () => {
      const [{ data: tl }, { data: p }] = await Promise.all([
        supabase.rpc("activity_timeline", { p_user: profile.id, p_from: from.toISOString(), p_to: to.toISOString() }),
        supabase.from("profiles_private").select("*").eq("user_id", profile.id).maybeSingle(),
      ]);
      if (!alive) return;
      setTimeline((tl || []) as TimelineRow[]);
      const row = (p as PrivateRow | null) || null;
      setPriv(row);
      if (row) {
        setEmergency((row.emergency_contact as Emergency) || {});
        setPersonalEmail(row.personal_email || "");
        setAddress(row.address || "");
        setDob(row.date_of_birth || "");
        setShowBirthday(row.show_birthday);
        setNotes(row.notes || "");
      }
    })();
    return () => { alive = false; };
  }, [profile.id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ec = { name: emergency.name?.trim() || undefined, relation: emergency.relation?.trim() || undefined, phone: emergency.phone?.trim() || undefined };
    const { error } = await createClient().from("profiles_private").upsert(
      {
        user_id: profile.id,
        emergency_contact: ec.name || ec.phone || ec.relation ? ec : null,
        personal_email: personalEmail.trim() || null,
        address: address.trim() || null,
        date_of_birth: dob || null,
        show_birthday: showBirthday,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    setSaving(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Private record saved — visible to you and HR only", "success");
  }

  return (
    <div className="space-y-[var(--s4)]">
      <WhatIsRecorded />

      <div>
        <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><ShieldCheck size={12} /> Who can see it</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {WHO.map((w) => (
            <div key={w.who} className="rounded-[var(--radius-sm)] sunken p-2.5">
              <div className="text-sm font-medium">{w.who}</div>
              <div className="text-[11px] text-muted leading-snug mt-0.5">{w.sees}</div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-muted mt-2">Nothing here is hidden from you: whatever your manager or HR can see about you, you can see on this page. If something looks wrong, <Link href="/help" className="link">ask HR for a correction</Link>.</div>
      </div>

      {/* Transparent activity */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="eyebrow inline-flex items-center gap-1.5"><Activity size={12} /> Your recorded activity · last 7 days</div>
          {timeline && <span className="text-[11px] text-muted num">{timeline.length} event{timeline.length === 1 ? "" : "s"}</span>}
        </div>
        {!timeline ? (
          <div className="space-y-2"><Skeleton className="h-5" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-5 w-1/2" /></div>
        ) : timeline.length === 0 ? (
          <div className="text-sm text-muted rounded-[var(--radius-sm)] sunken p-3">Nothing recorded in the last 7 days.</div>
        ) : (
          <ul className="rounded-[var(--radius-sm)] border divide-y max-h-72 overflow-y-auto">
            {timeline.map((t, i) => (
              <li key={`${t.occurred_at}-${i}`} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <Pill tone={t.kind === "focus" ? "tone-violet" : t.kind === "meeting" ? "tone-info" : t.kind.startsWith("attendance") ? "tone-success" : "tone-neutral"} className="shrink-0">{t.kind.replace(/[._]/g, " ")}</Pill>
                {t.link ? <Link href={t.link} className="truncate flex-1 hover:underline">{t.title}</Link> : <span className="truncate flex-1">{t.title}</span>}
                <span className="text-[11px] text-muted num shrink-0" title={fmtDate(t.occurred_at, true)}>{ago(t.occurred_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Private record */}
      <form onSubmit={save} className="space-y-3">
        <div className="eyebrow inline-flex items-center gap-1.5">Private record <span className="pill tone-neutral normal-case tracking-normal">You + HR only</span></div>
        {priv === undefined ? (
          <div className="space-y-2"><Skeleton className="h-9" /><Skeleton className="h-9 w-2/3" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Emergency contact"><Input value={emergency.name || ""} onChange={(e) => setEmergency((s) => ({ ...s, name: e.target.value }))} placeholder="Name" /></Field>
              <Field label="Relation"><Input value={emergency.relation || ""} onChange={(e) => setEmergency((s) => ({ ...s, relation: e.target.value }))} placeholder="Spouse, parent…" /></Field>
              <Field label="Phone"><Input type="tel" value={emergency.phone || ""} onChange={(e) => setEmergency((s) => ({ ...s, phone: e.target.value }))} placeholder="+91 …" /></Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Personal email"><Input type="email" value={personalEmail} onChange={(e) => setPersonalEmail(e.target.value)} placeholder="For payslips and emergencies" /></Field>
              <Field label="Date of birth"><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
            </div>
            <Field label="Address"><Textarea value={address} onChange={(e) => setAddress(e.target.value)} style={{ minHeight: 56 }} placeholder="Current residential address" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showBirthday} onChange={(e) => setShowBirthday(e.target.checked)} className="accent-[var(--brand)]" /> Let colleagues see my birthday (day and month only)</label>
            <Field label="Notes for HR" hint="Anything HR should know — allergies, accessibility needs, preferred name."><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 56 }} /></Field>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] text-muted">{priv?.updated_at ? `Last updated ${ago(priv.updated_at)}` : "Not filled in yet"}</span>
              <Button type="submit" variant="primary" loading={saving}><Save size={15} /> Save private record</Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
