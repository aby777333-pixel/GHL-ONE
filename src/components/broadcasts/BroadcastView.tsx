"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, Megaphone, ShieldAlert, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Pill, Progress, Textarea, useToast } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { ago, cn, fmtDate, type Tables } from "@/lib/utils";
import { BROADCAST_KIND_LABEL, BROADCAST_KIND_TONE, CHECKIN_STATUSES, jsonObj, strArr, useTouchModule } from "@/components/intel/lib";

export type BroadcastRow = Tables<"broadcasts">;
export type AckRow = { user_id: string; acked_at: string };
export type CheckinRow = { user_id: string; status: string; note: string | null; at: string };

export function describeAudience(audience: BroadcastRow["audience"], departments: { id: string; name: string }[]) {
  const a = jsonObj(audience);
  if (a.all === true) return "Everyone";
  const parts: string[] = [];
  const d = strArr(a.department_ids); if (d.length) parts.push(d.map((id) => departments.find((x) => x.id === id)?.name || "department").join(", "));
  const t = strArr(a.team_ids); if (t.length) parts.push(`${t.length} team${t.length > 1 ? "s" : ""}`);
  const r = strArr(a.roles); if (r.length) parts.push(r.map((x) => x.replace(/_/g, " ")).join(", "));
  const u = strArr(a.user_ids); if (u.length) parts.push(`${u.length} ${u.length > 1 ? "people" : "person"}`);
  return parts.join(" · ") || "Everyone";
}

/** One broadcast: acknowledge / check in for recipients; roll-up for the sender and managers. */
export function BroadcastView({ b, acks, checkins, audienceIds, canSeeRollup }: { b: BroadcastRow; acks: AckRow[]; checkins: CheckinRow[]; audienceIds: string[]; canSeeRollup: boolean }) {
  const { profile, departments, people } = useSession();
  const router = useRouter();
  const toast = useToast();
  useTouchModule("broadcasts");
  useSeen(`nav:/broadcasts/${b.id}`);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const myAck = acks.find((a) => a.user_id === profile.id);
  const myCheckin = checkins.find((c) => c.user_id === profile.id);

  async function ack() {
    setBusy("ack");
    const { error } = await createClient().from("broadcast_acks").upsert({ broadcast_id: b.id, user_id: profile.id });
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push("Acknowledged", "success"); router.refresh();
  }
  async function checkin(status: string) {
    setBusy(status);
    const { error } = await createClient().from("checkins").upsert({ broadcast_id: b.id, user_id: profile.id, status, note: note.trim() || null, at: new Date().toISOString() });
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push(status === "need_help" ? "Sent — someone will reach out to you" : "Checked in", "success"); router.refresh();
  }

  const ackedIds = new Set(acks.map((a) => a.user_id));
  const checkedIds = new Set(checkins.map((c) => c.user_id));
  const missingAck = audienceIds.filter((id) => !ackedIds.has(id));
  const missingCheckin = audienceIds.filter((id) => !checkedIds.has(id));
  const needHelp = checkins.filter((c) => c.status === "need_help");

  return (
    <div className="page page-narrow">
      <Link href="/announcements" className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]"><ArrowLeft size={14} /> Announcements</Link>
      <Card className={cn("p-[var(--s4)] mb-[var(--s3)] border-l-4", b.kind === "emergency" ? "border-l-[var(--danger)]" : b.kind === "urgent" ? "border-l-[var(--orange)]" : "border-l-[var(--info)]")}>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Pill tone={BROADCAST_KIND_TONE[b.kind] || "tone-neutral"} size="lg">{b.kind === "emergency" ? <ShieldAlert size={12} /> : <Megaphone size={12} />} {BROADCAST_KIND_LABEL[b.kind] || b.kind}</Pill>
          <span className="text-xs text-muted inline-flex items-center gap-1.5"><Users size={12} /> {describeAudience(b.audience, departments)}</span>
          <span className="text-xs text-muted">· {fmtDate(b.created_at, true)}</span>
          {b.created_by && <span className="text-xs text-muted inline-flex items-center gap-1">· from <PersonChip id={b.created_by} size={14} /></span>}
        </div>
        <h1 className="h1 break-words">{b.title}</h1>
        <p className="text-sm mt-3 whitespace-pre-wrap">{b.body}</p>

        {(b.require_ack || b.request_checkin) && (
          <div className="mt-[var(--s4)] pt-[var(--s3)] border-t space-y-3">
            {b.require_ack && (
              myAck ? <div className="text-sm inline-flex items-center gap-2 tone-success rounded-full px-3 py-1"><CheckCircle2 size={14} /> You acknowledged this {ago(myAck.acked_at)}</div>
                : <div className="flex items-center gap-3 flex-wrap"><span className="text-sm">Please confirm you have read this.</span><Button variant="primary" size="sm" loading={busy === "ack"} onClick={ack}><Check size={14} /> Acknowledge</Button></div>
            )}
            {b.request_checkin && (
              <div>
                <div className="text-sm mb-2">{myCheckin ? <span className="inline-flex items-center gap-2">You checked in as <Pill tone={CHECKIN_STATUSES.find((s) => s.key === myCheckin.status)?.tone || "tone-neutral"}>{CHECKIN_STATUSES.find((s) => s.key === myCheckin.status)?.label || myCheckin.status}</Pill> {ago(myCheckin.at)} — update if things change.</span> : "Please check in so we know you are okay."}</div>
                <div className="flex flex-wrap gap-1.5">
                  {CHECKIN_STATUSES.map((s) => <Button key={s.key} size="sm" variant={s.key === "safe" ? "success" : s.key === "need_help" ? "danger" : "secondary"} loading={busy === s.key} onClick={() => checkin(s.key)}>{s.label}</Button>)}
                </div>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note — where you are, what you need" style={{ minHeight: 44 }} className="mt-2" />
              </div>
            )}
          </div>
        )}
      </Card>

      {canSeeRollup && (b.require_ack || b.request_checkin) && (
        <div className="grid md:grid-cols-2 gap-[var(--s3)]">
          {b.require_ack && (
            <Card>
              <CardHeader title="Acknowledgements" subtitle={`${acks.length} of ${audienceIds.length}`} />
              <div className="px-[var(--s4)] pb-[var(--s3)]">
                <Progress value={audienceIds.length ? (acks.length / audienceIds.length) * 100 : 0} tone="var(--success)" className="mb-3" />
                <RollupList title="Not yet acknowledged" ids={missingAck} empty="Everyone has acknowledged." people={people} tone="tone-warn" />
              </div>
            </Card>
          )}
          {b.request_checkin && (
            <Card>
              <CardHeader title="Check-ins" subtitle={`${checkins.length} of ${audienceIds.length}${needHelp.length ? ` · ${needHelp.length} need help` : ""}`} />
              <div className="px-[var(--s4)] pb-[var(--s3)] space-y-3">
                <Progress value={audienceIds.length ? (checkins.length / audienceIds.length) * 100 : 0} tone={needHelp.length ? "var(--danger)" : "var(--success)"} />
                {needHelp.length > 0 && (
                  <div>
                    <div className="eyebrow mb-1 text-danger">Need help</div>
                    <ul className="space-y-1">{needHelp.map((c) => <li key={c.user_id} className="text-sm flex items-start gap-2"><PersonChip id={c.user_id} size={16} /><span className="text-xs text-muted">{c.note ? `“${c.note}”` : ""} · {ago(c.at)}</span></li>)}</ul>
                  </div>
                )}
                <RollupList title="Not yet checked in" ids={missingCheckin} empty="Everyone has checked in." people={people} tone="tone-warn" />
                {checkins.filter((c) => c.status !== "need_help").length > 0 && (
                  <div>
                    <div className="eyebrow mb-1">Checked in</div>
                    <div className="flex flex-wrap gap-1.5">{checkins.filter((c) => c.status !== "need_help").map((c) => <span key={c.user_id} className={cn("pill", CHECKIN_STATUSES.find((s) => s.key === c.status)?.tone || "tone-neutral")}><PersonChip id={c.user_id} size={12} /></span>)}</div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function RollupList({ title, ids, empty, people, tone }: { title: string; ids: string[]; empty: string; people: { id: string; full_name: string }[]; tone: string }) {
  if (ids.length === 0) return <EmptyState title={empty} className="py-3" />;
  return (
    <div>
      <div className="eyebrow mb-1">{title} <span className="pill tone-neutral">{ids.length}</span></div>
      <div className="flex flex-wrap gap-1.5 max-h-[220px] overflow-y-auto">{ids.map((id) => <span key={id} className={cn("pill", tone)}>{people.find((p) => p.id === id)?.full_name || "Someone"}</span>)}</div>
    </div>
  );
}
