"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, ClipboardCheck, Plus, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { cn, fmtDate } from "@/lib/utils";
import { Note, PersonLine } from "../AdminBits";
import { daysUntil, parseGoals, PROBATION_STATUS_LABEL, PROBATION_STATUS_TONE, todayIso, type HrData, type HrPerson, type ProbationGoal, type ProbationReview } from "./lib";

export function ProbationView({ data }: { data: HrData }) {
  const [today] = React.useState(() => todayIso());
  const [review, setReview] = React.useState<{ person: HrPerson; existing: ProbationReview | null } | null>(null);

  const onProbation = data.people
    .filter((p) => p.is_active && p.probation_ends_on)
    .sort((a, b) => (a.probation_ends_on || "").localeCompare(b.probation_ends_on || ""));
  const pendingFor = (userId: string) => data.probationReviews.find((r) => r.user_id === userId && r.status === "pending") || null;
  const history = data.probationReviews.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-[var(--s4)]">
      <Card>
        <CardHeader title="On probation" subtitle="A review is created and the manager reminded 7 days before the end date. Overdue dates are red." action={<CalendarClock size={15} className="text-muted" />} />
        {onProbation.length === 0 ? (
          <EmptyState icon={<ClipboardCheck size={18} />} title="Nobody is on probation" hint="Set “Probation ends on” in the employee record to track it here." className="py-[var(--s4)]" />
        ) : (
          <div className="divide-y border-t">
            {onProbation.map((p) => {
              const days = daysUntil(p.probation_ends_on!, today);
              const pending = pendingFor(p.id);
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-[var(--s4)] py-2.5">
                  <PersonLine id={p.id} name={p.full_name} size={30} sub={<>{p.designation || "—"}{p.manager_id && <> · manager <PersonChip id={p.manager_id} size={12} /></>}</>} className="flex-1 min-w-[220px]" />
                  <Blink zone={`user:${p.id}`} />
                  <span className={cn("text-xs num", days < 0 ? "text-danger font-medium" : days <= 7 ? "text-warn font-medium" : "text-muted")}>{days < 0 ? `${-days}d overdue` : days === 0 ? "Ends today" : `${days}d left`} · {fmtDate(p.probation_ends_on)}</span>
                  {pending ? <Pill tone="tone-warn">Review pending</Pill> : <Pill tone="tone-neutral">No review yet</Pill>}
                  <Button size="sm" variant={days <= 7 ? "primary" : "secondary"} onClick={() => setReview({ person: p, existing: pending })}><ClipboardCheck size={13} /> {pending ? "Complete review" : "Review"}</Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Review history" subtitle={history.length ? `${history.length} decided` : "Decisions appear here."} />
        {history.length === 0 ? (
          <EmptyState title="No decisions yet" className="py-[var(--s4)]" />
        ) : (
          <div className="divide-y border-t">
            {history.map((r) => {
              const goals = parseGoals(r.goals);
              const met = goals.filter((g) => g.met === true).length;
              return (
                <div key={r.id} className="flex flex-wrap items-start gap-3 px-[var(--s4)] py-2.5">
                  <PersonLine id={r.user_id} size={28} sub={<>Review date {fmtDate(r.review_date)}{r.reviewer_id && <> · reviewer <PersonChip id={r.reviewer_id} size={12} /></>}</>} className="flex-1 min-w-[220px]" />
                  <div className="text-xs text-muted min-w-0 flex-1">
                    {goals.length > 0 && <div className="num">{met}/{goals.length} goals met</div>}
                    {r.status === "extended" && r.extended_to && <div>Extended to {fmtDate(r.extended_to)}</div>}
                    {r.notes && <div className="whitespace-pre-wrap truncate-2">{r.notes}</div>}
                    {r.decided_at && <div>Decided {fmtDate(r.decided_at, true)}{r.decided_by && <> by <PersonChip id={r.decided_by} size={12} /></>}</div>}
                  </div>
                  <Pill tone={PROBATION_STATUS_TONE[r.status] || "tone-neutral"}>{PROBATION_STATUS_LABEL[r.status] || r.status}</Pill>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {review && <ReviewModal key={review.person.id} person={review.person} existing={review.existing} onClose={() => setReview(null)} />}
    </div>
  );
}

function ReviewModal({ person, existing, onClose }: { person: HrPerson; existing: ProbationReview | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [goals, setGoals] = React.useState<ProbationGoal[]>(() => (existing ? parseGoals(existing.goals) : []));
  const [newGoal, setNewGoal] = React.useState("");
  const [notes, setNotes] = React.useState(existing?.notes || "");
  const [reviewer, setReviewer] = React.useState(existing?.reviewer_id || person.manager_id || profile.id);
  const [decision, setDecision] = React.useState<"confirmed" | "extended" | "not_confirmed">("confirmed");
  const [extendedTo, setExtendedTo] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const addGoal = () => { const t = newGoal.trim(); if (!t) return; setGoals((g) => [...g, { title: t, met: null, note: "" }]); setNewGoal(""); };
  const setGoal = (i: number, patch: Partial<ProbationGoal>) => setGoals((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save(decide: boolean) {
    if (!profile.org_id) return;
    if (decide && decision === "extended" && !extendedTo) { toast.push("Choose the new probation end date", "danger"); return; }
    setBusy(true);
    const supabase = createClient();
    const base = { goals: goals.map((g) => ({ title: g.title, met: g.met, note: g.note || null })), notes: notes.trim() || null, reviewer_id: reviewer || null };
    const decided = decide ? { status: decision, extended_to: decision === "extended" ? extendedTo : null, decided_at: new Date().toISOString(), decided_by: profile.id } : {};
    const { error } = existing
      ? await supabase.from("probation_reviews").update({ ...base, ...decided }).eq("id", existing.id)
      : await supabase.from("probation_reviews").insert({ org_id: profile.org_id, user_id: person.id, review_date: person.probation_ends_on || todayIso(), ...base, ...decided });
    if (error) { setBusy(false); toast.push(error.message, "danger"); return; }
    if (decide) {
      const patch = decision === "extended" ? { probation_ends_on: extendedTo } : decision === "confirmed" ? { probation_ends_on: null } : null;
      if (patch) {
        const { error: e2 } = await supabase.from("profiles").update(patch).eq("id", person.id);
        if (e2) { setBusy(false); toast.push(`Review saved, but the profile date was not updated: ${e2.message}`, "danger"); router.refresh(); return; }
      }
    }
    setBusy(false);
    toast.push(decide ? `Probation ${PROBATION_STATUS_LABEL[decision].toLowerCase()} for ${person.full_name}` : "Review draft saved", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} side width={600} title={`Probation review · ${person.full_name}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="secondary" loading={busy} onClick={() => save(false)}>Save draft</Button><Button variant={decision === "not_confirmed" ? "danger" : "primary"} loading={busy} onClick={() => save(true)}><Check size={15} /> Record decision</Button></>}>
      <div className="space-y-[var(--s4)]">
        <PersonLine id={person.id} name={person.full_name} size={36} sub={<>{person.designation || "—"} · probation ends {person.probation_ends_on ? fmtDate(person.probation_ends_on) : "—"}{person.joined_at ? ` · joined ${fmtDate(person.joined_at)}` : ""}</>} />
        <Field label="Reviewer"><PersonPicker value={reviewer} onChange={setReviewer} allowEmpty={false} /></Field>

        <section>
          <div className="eyebrow mb-1.5">Goals</div>
          {goals.length === 0 && <div className="text-xs text-muted mb-2">No goals recorded yet. Add the goals agreed at the day-30 check-in.</div>}
          <ul className="space-y-2">
            {goals.map((g, i) => (
              <li key={i} className="card p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm flex-1 min-w-0">{g.title}</span>
                  <button type="button" onClick={() => setGoal(i, { met: g.met === true ? null : true })} className={cn("pill cursor-pointer", g.met === true ? "tone-success" : "tone-neutral")} aria-label="Met"><ThumbsUp size={10} /> Met</button>
                  <button type="button" onClick={() => setGoal(i, { met: g.met === false ? null : false })} className={cn("pill cursor-pointer", g.met === false ? "tone-danger" : "tone-neutral")} aria-label="Not met"><ThumbsDown size={10} /> Not met</button>
                  <Button size="xs" variant="ghost" icon onClick={() => setGoals((s) => s.filter((_, j) => j !== i))} aria-label="Remove goal"><Trash2 size={12} /></Button>
                </div>
                <Input value={g.note} onChange={(e) => setGoal(i, { note: e.target.value })} placeholder="Evidence / note" className="!h-8 !text-xs" />
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 mt-2">
            <Input value={newGoal} onChange={(e) => setNewGoal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGoal(); } }} placeholder="Add a goal…" />
            <Button size="sm" onClick={addGoal} disabled={!newGoal.trim()}><Plus size={13} /> Add</Button>
          </div>
        </section>

        <Field label="Review notes"><Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Strengths, gaps, support agreed." /></Field>

        <section className="space-y-2">
          <div className="eyebrow">Decision</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(["confirmed", "extended", "not_confirmed"] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDecision(d)} className={cn("card p-3 text-left text-sm transition-colors", decision === d ? "ring-2 ring-[var(--brand)]" : "card-hover")}>
                <div className="font-medium">{PROBATION_STATUS_LABEL[d]}</div>
                <div className="text-[11px] text-muted mt-0.5">{d === "confirmed" ? "Probation date cleared." : d === "extended" ? "Pick a new end date; a new review is scheduled." : "HR follows up on next steps."}</div>
              </button>
            ))}
          </div>
          {decision === "extended" && <Field label="Extend to"><Input type="date" value={extendedTo} onChange={(e) => setExtendedTo(e.target.value)} min={todayIso()} /></Field>}
          <Note tone={decision === "not_confirmed" ? "warn" : "info"}>{decision === "not_confirmed" ? "This does not disable the account. Use Offboard for a structured exit once HR has spoken with the person." : "The person and their manager can see this review in the Privacy Center."}</Note>
        </section>
      </div>
    </Modal>
  );
}
