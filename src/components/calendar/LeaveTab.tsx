"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { Palmtree, Check, X, Send } from "lucide-react";
import { Button, Card, CardHeader, EmptyState, Field, Input, Pill, Select, Textarea, useToast } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { APPROVAL_STATUS_LABEL, APPROVAL_STATUS_TONE, cn, fmtDate, isManagerPlus } from "@/lib/utils";
import { LEAVE_KINDS, type LeaveRow } from "./calendarUtils";
import { todayLocal } from "@/components/meetings/meetingUtils";

export function LeaveTab({ leaves }: { leaves: LeaveRow[] }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const manager = isManagerPlus(profile.role);
  const [from, setFrom] = React.useState(() => todayLocal());
  const [to, setTo] = React.useState(() => todayLocal());
  const [kind, setKind] = React.useState("leave");
  const [note, setNote] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  const mine = leaves.filter((l) => l.user_id === profile.id).sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  const pendingOthers = leaves.filter((l) => l.status === "pending" && l.user_id !== profile.id).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const upcomingTeam = leaves.filter((l) => l.status === "approved" && l.user_id !== profile.id && l.ends_on >= todayLocal()).sort((a, b) => a.starts_on.localeCompare(b.starts_on)).slice(0, 12);

  const days = (l: Pick<LeaveRow, "starts_on" | "ends_on">) => differenceInCalendarDays(new Date(l.ends_on), new Date(l.starts_on)) + 1;

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) return;
    if (to < from) return toast.push("End date must be on or after the start", "danger");
    setLoading(true);
    const { error } = await createClient().from("leaves").insert({ org_id: profile.org_id!, user_id: profile.id, starts_on: from, ends_on: to, kind, note: note.trim() || null });
    setLoading(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Leave request sent to your manager", "success");
    setNote("");
    router.refresh();
  }

  async function decide(l: LeaveRow, status: "approved" | "rejected") {
    setBusy(l.id);
    const { error } = await createClient().from("leaves").update({ status }).eq("id", l.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push(status === "approved" ? "Leave approved" : "Leave declined", status === "approved" ? "success" : "info");
    router.refresh();
  }

  async function cancel(l: LeaveRow) {
    setBusy(l.id);
    const { error } = await createClient().from("leaves").update({ status: "rejected", note: [l.note, "Cancelled by employee"].filter(Boolean).join(" · ") }).eq("id", l.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push("Request cancelled", "info");
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-[var(--s3)] items-start">
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><Palmtree size={15} /> Apply for leave</span>} subtitle="Your manager approves; approved leave shows on the company calendar." />
        <form onSubmit={apply} className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} required />
            </Field>
            <Field label="To">
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
            </Field>
          </div>
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {LEAVE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Note">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason or handover notes (optional)" style={{ minHeight: 64 }} />
          </Field>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted num">{from && to && to >= from ? `${days({ starts_on: from, ends_on: to })} day${days({ starts_on: from, ends_on: to }) === 1 ? "" : "s"}` : ""}</span>
            <Button type="submit" variant="primary" loading={loading}><Send size={14} /> Submit</Button>
          </div>
        </form>
      </Card>

      <div className="space-y-[var(--s3)] min-w-0">
        {manager && (
          <Card>
            <CardHeader title="Awaiting your approval" subtitle={pendingOthers.length ? `${pendingOthers.length} request${pendingOthers.length === 1 ? "" : "s"}` : "No pending requests"} />
            {pendingOthers.length > 0 && (
              <div className="px-[var(--s3)] pb-[var(--s3)] space-y-1">
                {pendingOthers.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] row-hover flex-wrap">
                    <PersonChip id={l.user_id} size={22} />
                    <span className="text-sm num">{fmtDate(l.starts_on)}{l.ends_on !== l.starts_on ? ` → ${fmtDate(l.ends_on)}` : ""}</span>
                    <Pill tone="tone-neutral">{LEAVE_KINDS.find((k) => k.value === l.kind)?.label || l.kind}</Pill>
                    <span className="text-xs text-muted num">{days(l)}d</span>
                    {l.note && <span className="text-xs text-muted truncate w-full sm:w-auto sm:flex-1">{l.note}</span>}
                    <span className="flex items-center gap-1 ml-auto">
                      <Button size="xs" variant="success" loading={busy === l.id} onClick={() => decide(l, "approved")}><Check size={12} /> Approve</Button>
                      <Button size="xs" variant="ghost" onClick={() => decide(l, "rejected")}><X size={12} /> Decline</Button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <Card>
          <CardHeader title="My leave" subtitle={mine.length ? `${mine.length} request${mine.length === 1 ? "" : "s"}` : undefined} />
          {mine.length === 0 ? (
            <EmptyState icon={<Palmtree size={18} />} title="No leave requests yet" hint="Submit one on the left — it lands with your manager instantly." className="py-[var(--s4)]" />
          ) : (
            <div className="px-[var(--s3)] pb-[var(--s3)] space-y-1">
              {mine.map((l) => (
                <div key={l.id} className={cn("flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] flex-wrap", l.status === "pending" ? "row-hover" : "")}>
                  <span className="text-sm num">{fmtDate(l.starts_on)}{l.ends_on !== l.starts_on ? ` → ${fmtDate(l.ends_on)}` : ""}</span>
                  <Pill tone="tone-neutral">{LEAVE_KINDS.find((k) => k.value === l.kind)?.label || l.kind}</Pill>
                  <span className="text-xs text-muted num">{days(l)}d</span>
                  <Pill tone={APPROVAL_STATUS_TONE[l.status]}>{APPROVAL_STATUS_LABEL[l.status]}</Pill>
                  {l.note && <span className="text-xs text-muted truncate w-full sm:w-auto sm:flex-1">{l.note}</span>}
                  {l.status === "pending" && <Button size="xs" variant="ghost" className="ml-auto" loading={busy === l.id} onClick={() => cancel(l)}>Cancel</Button>}
                </div>
              ))}
            </div>
          )}
        </Card>

        {upcomingTeam.length > 0 && (
          <Card>
            <CardHeader title="Who's away" subtitle="Approved leave across the company" />
            <div className="px-[var(--s3)] pb-[var(--s3)] space-y-1">
              {upcomingTeam.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-2.5 py-1.5 text-sm">
                  <PersonChip id={l.user_id} size={20} />
                  <span className="text-xs text-muted num ml-auto">{fmtDate(l.starts_on)}{l.ends_on !== l.starts_on ? ` → ${fmtDate(l.ends_on)}` : ""}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
