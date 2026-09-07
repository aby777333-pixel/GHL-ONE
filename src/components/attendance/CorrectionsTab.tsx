"use client";

import * as React from "react";
import Link from "next/link";
import { LifeBuoy, Send, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Pill, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, fmtDate, humanize, isManagerPlus, type Tables } from "@/lib/utils";
import { ATT_STATUS_LABEL, ATT_STATUS_TONE, CORRECTABLE_STATUSES, dayLabel, istDay, type AttendanceDay } from "./attendanceUtils";

type HelpRow = Pick<Tables<"help_requests">, "id" | "title" | "status" | "created_at" | "form_data" | "details" | "owner_id">;
const HELP_TONE: Record<string, string> = { new: "tone-warn", accepted: "tone-info", working: "tone-info", waiting: "tone-orange", completed: "tone-success", declined: "tone-muted" };

/** Managers/HR correct a day directly (audited); everyone else asks HR through the service catalog. */
export function CorrectionsTab({ hrDepartmentId, serviceId, initialRequests, hasAttendancePerm }: { hrDepartmentId: string | null; serviceId: string | null; initialRequests: HelpRow[]; hasAttendancePerm: boolean }) {
  const { profile } = useSession();
  const canCorrect = isManagerPlus(profile.role) || hasAttendancePerm;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s3)] items-start">
      {canCorrect && <ManagerCorrection />}
      <RequestCorrection hrDepartmentId={hrDepartmentId} serviceId={serviceId} initialRequests={initialRequests} />
    </div>
  );
}

function ManagerCorrection() {
  const toast = useToast();
  const today = istDay();
  const [user, setUser] = React.useState("");
  const [day, setDay] = React.useState(today);
  const [status, setStatus] = React.useState<string>("present");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [recent, setRecent] = React.useState<AttendanceDay[] | null>(null);
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    createClient().from("attendance_days").select("*").not("corrected_by", "is", null).order("day", { ascending: false }).limit(25).then(({ data }) => alive && setRecent((data || []) as AttendanceDay[]));
    return () => { alive = false; };
  }, [version]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !day || !note.trim()) return toast.push("Person, day and a reason are required", "danger");
    setBusy(true);
    const { error } = await createClient().rpc("correct_attendance", { p_user: user, p_day: day, p_status: status, p_note: note.trim() });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push(`Marked ${dayLabel(day)} as ${ATT_STATUS_LABEL[status]} — the person can see this on their attendance page`, "success");
    setNote("");
    setVersion((v) => v + 1);
  }

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-muted" /> Correct a day</span>} subtitle="Every correction is audited and visible to the employee, with your note." />
      <form onSubmit={submit} className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
        <Field label="Person"><PersonPicker value={user} onChange={setUser} placeholder="Choose a person" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day"><Input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} required /></Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {CORRECTABLE_STATUSES.map((s) => <option key={s} value={s}>{ATT_STATUS_LABEL[s]}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Reason" hint="Shown to the employee"><Textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 64 }} placeholder="e.g. Forgot to clock in; confirmed present by team lead" required /></Field>
        <div className="flex justify-end"><Button type="submit" variant="primary" loading={busy}><ShieldCheck size={14} /> Apply correction</Button></div>
      </form>
      <div className="border-t px-[var(--s4)] py-[var(--s3)]">
        <div className="eyebrow mb-2">Recent corrections</div>
        {!recent ? <Skeleton className="h-6" /> : recent.length === 0 ? <div className="text-xs text-muted">None yet.</div> : (
          <ul className="space-y-1">
            {recent.map((r) => (
              <li key={`${r.user_id}-${r.day}`} className="flex items-center gap-2 text-sm flex-wrap">
                <PersonChip id={r.user_id} size={18} />
                <span className="num text-xs text-muted">{dayLabel(r.day)}</span>
                <Pill tone={ATT_STATUS_TONE[r.status] || "tone-neutral"}>{ATT_STATUS_LABEL[r.status] || r.status}</Pill>
                {r.correction_note && <span className="text-xs text-muted truncate flex-1 min-w-0">{r.correction_note}</span>}
                <span className="text-[11px] text-muted inline-flex items-center gap-1">by <PersonChip id={r.corrected_by} size={14} /></span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function RequestCorrection({ hrDepartmentId, serviceId, initialRequests }: { hrDepartmentId: string | null; serviceId: string | null; initialRequests: HelpRow[] }) {
  const { profile } = useSession();
  const toast = useToast();
  const today = istDay();
  const [day, setDay] = React.useState(today);
  const [what, setWhat] = React.useState<string>("present");
  const [details, setDetails] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [requests, setRequests] = React.useState<HelpRow[]>(initialRequests);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hrDepartmentId) return toast.push("The HR department is not set up yet — ask an administrator", "danger");
    if (!details.trim()) return toast.push("Tell HR what happened", "danger");
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("help_requests")
      .insert({
        org_id: profile.org_id!, department_id: hrDepartmentId, service_id: serviceId, requester_id: profile.id, requester_department_id: profile.department_id,
        title: "Attendance correction", details: `${dayLabel(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} should be ${ATT_STATUS_LABEL[what]}. ${details.trim()}`,
        form_data: { day, what: `${ATT_STATUS_LABEL[what]} — ${details.trim()}`, status: what }, priority: "normal",
      })
      .select("id,title,status,created_at,form_data,details,owner_id")
      .single();
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Sent to HR — you will be notified when it is picked up", "success");
    setDetails("");
    if (data) setRequests((l) => [data as HelpRow, ...l]);
  }

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><LifeBuoy size={15} className="text-muted" /> Request a correction</span>} subtitle="Missed a clock-in, wrong status, forgot to clock out? Ask HR — it becomes a tracked request with an SLA." />
      <form onSubmit={submit} className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day"><Input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} required /></Field>
          <Field label="It should be">
            <Select value={what} onChange={(e) => setWhat(e.target.value)}>
              {CORRECTABLE_STATUSES.map((s) => <option key={s} value={s}>{ATT_STATUS_LABEL[s]}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="What happened?"><Textarea value={details} onChange={(e) => setDetails(e.target.value)} style={{ minHeight: 64 }} placeholder="e.g. I was at the Chennai client site from 9:15 and could not clock in on my phone." required /></Field>
        <div className="flex justify-end"><Button type="submit" variant="primary" loading={busy}><Send size={14} /> Send to HR</Button></div>
      </form>
      <div className="border-t px-[var(--s4)] py-[var(--s3)]">
        <div className="eyebrow mb-2">My correction requests</div>
        {requests.length === 0 ? (
          <EmptyState title="No requests yet" className="py-3" />
        ) : (
          <ul className="space-y-1">
            {requests.map((r) => {
              const fd = (r.form_data || {}) as { day?: string; what?: string };
              return (
                <li key={r.id} className="flex items-center gap-2 text-sm flex-wrap">
                  <Link href={`/help/${r.id}`} className="num text-xs hover:underline">{fd.day ? dayLabel(fd.day) : fmtDate(r.created_at)}</Link>
                  <Pill tone={HELP_TONE[r.status] || "tone-neutral"}>{humanize(r.status)}</Pill>
                  <span className="text-xs text-muted truncate flex-1 min-w-0">{fd.what || r.details}</span>
                  {r.owner_id && <PersonChip id={r.owner_id} size={16} showName={false} />}
                  <span className="text-[11px] text-muted">{ago(r.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
