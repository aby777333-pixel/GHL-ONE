"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronUp, FileCheck2, Gavel, HelpCircle, ListChecks, Plus, ShieldAlert, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, Input, Pill, Textarea, useToast } from "@/components/ui";
import { PersonPicker, PriorityPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { AIDisabledNote } from "@/components/ai/AIDisabledNote";
import { useAIStatus } from "@/components/ai/useAIStatus";
import { callAI, type MeetingExtract } from "@/lib/ai/types";
import { cn, type Meeting, type TaskPriority } from "@/lib/utils";

export type MeetingAssistantHandle = { extract: () => void };

type DecisionRow = { selected: boolean; title: string; decision: string; reason: string };
type ActionRow = { selected: boolean; title: string; owner_id: string; due: string; priority: TaskPriority };
type Review = { extract: MeetingExtract; decisions: DecisionRow[]; actions: ActionRow[] };

/** Loose name match against the directory: full name, or first name when unambiguous. */
function matchPerson(name: string | null, people: { id: string; full_name: string }[]) {
  if (!name) return "";
  const n = name.trim().toLowerCase();
  if (!n) return "";
  const exact = people.find((p) => p.full_name.toLowerCase() === n);
  if (exact) return exact.id;
  const starts = people.filter((p) => p.full_name.toLowerCase().startsWith(n) || p.full_name.toLowerCase().split(" ")[0] === n.split(" ")[0]);
  return starts.length === 1 ? starts[0]!.id : "";
}

const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;

/**
 * AI meeting assistant: extracts summary, key points, decisions, action items, questions and risks
 * from the meeting notes/transcript (+ optional pasted text), then lets the organiser confirm what to record.
 * Exposes `extract()` so the "Draft summary" button can trigger it.
 */
export const MeetingAssistant = React.forwardRef<MeetingAssistantHandle, { meeting: Meeting; participantIds: string[]; onSummary?: (text: string) => void }>(function MeetingAssistant({ meeting, participantIds, onSummary }, ref) {
  const { profile, people } = useSession();
  const router = useRouter();
  const toast = useToast();
  const ai = useAIStatus();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [extra, setExtra] = React.useState("");
  const [showExtra, setShowExtra] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [disabled, setDisabled] = React.useState(false);
  const [review, setReview] = React.useState<Review | null>(null);
  const [summaryText, setSummaryText] = React.useState("");
  const [createTasks, setCreateTasks] = React.useState(true);
  const [addedRisks, setAddedRisks] = React.useState<Set<number>>(() => new Set());
  const [savedDecisions, setSavedDecisions] = React.useState(false);
  const [savedActions, setSavedActions] = React.useState(false);

  const extract = React.useCallback(async () => {
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setBusy("extract");
    setError(null);
    try {
      const data = await callAI<MeetingExtract>("meeting-extract", { meetingId: meeting.id, text: extra.trim() || undefined });
      setReview({
        extract: data,
        decisions: data.decisions.map((d) => ({ selected: true, title: d.title, decision: d.decision, reason: d.reason || "" })),
        actions: data.action_items.map((a) => ({ selected: true, title: a.title, owner_id: a.owner_id || matchPerson(a.owner_name, people), due: a.due_date || "", priority: a.priority })),
      });
      setSummaryText(data.summary);
      setAddedRisks(new Set());
      setSavedDecisions(false);
      setSavedActions(false);
    } catch (e) {
      const err = e as Error & { disabled?: boolean };
      if (err.disabled) setDisabled(true);
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }, [meeting.id, extra, people]);

  React.useImperativeHandle(ref, () => ({ extract: () => void extract() }), [extract]);

  const setDecision = (i: number, patch: Partial<DecisionRow>) => setReview((r) => r && { ...r, decisions: r.decisions.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const setAction = (i: number, patch: Partial<ActionRow>) => setReview((r) => r && { ...r, actions: r.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  async function saveSummary() {
    if (!summaryText.trim()) return;
    setBusy("summary");
    const { error } = await createClient().from("meetings").update({ summary: summaryText }).eq("id", meeting.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    onSummary?.(summaryText);
    toast.push("Meeting summary saved", "success");
    router.refresh();
  }

  async function recordDecisions() {
    if (!review) return;
    const rows = review.decisions.filter((d) => d.selected && d.title.trim() && d.decision.trim());
    if (!rows.length) return toast.push("Select at least one decision", "danger");
    setBusy("decisions");
    const { error } = await createClient().from("decisions").insert(
      rows.map((d) => ({
        org_id: profile.org_id!,
        title: d.title.trim(),
        decision: d.decision.trim(),
        reason: d.reason.trim() || null,
        decided_by: profile.id,
        meeting_id: meeting.id,
        project_id: meeting.project_id,
        department_id: meeting.department_id,
        participants: Array.from(new Set([...participantIds, profile.id])),
      }))
    );
    setBusy(null);
    if (error) return toast.push(error.message.includes("row-level security") ? "Only team leads and above can record decisions." : error.message, "danger");
    setSavedDecisions(true);
    toast.push(`${plural(rows.length, "decision")} recorded`, "success");
    router.refresh();
  }

  async function addActions() {
    if (!review) return;
    const rows = review.actions.filter((a) => a.selected && a.title.trim());
    if (!rows.length) return toast.push("Select at least one action item", "danger");
    setBusy("actions");
    const supabase = createClient();
    let tasksMade = 0;
    let failed = 0;
    for (const a of rows) {
      const { data: act, error } = await supabase.from("meeting_actions").insert({ meeting_id: meeting.id, title: a.title.trim(), owner_id: a.owner_id || null, due_date: a.due || null }).select("id").single();
      if (error || !act) {
        failed++;
        continue;
      }
      if (!createTasks) continue;
      const { data: task, error: tErr } = await supabase
        .from("tasks")
        .insert({
          org_id: profile.org_id!,
          project_id: meeting.project_id,
          department_id: meeting.department_id,
          title: a.title.trim(),
          description: `From meeting: ${meeting.title}`,
          assignee_id: a.owner_id || null,
          owner_id: meeting.organizer_id || profile.id,
          delegated_by: a.owner_id && a.owner_id !== profile.id ? profile.id : null,
          due_date: a.due ? new Date(`${a.due}T18:00:00`).toISOString() : null,
          priority: a.priority,
          source_meeting_id: meeting.id,
          created_by: profile.id,
          status: "todo",
        })
        .select("id")
        .single();
      if (tErr || !task) {
        failed++;
        continue;
      }
      const { error: uErr } = await supabase.from("meeting_actions").update({ task_id: task.id, confirmed: true }).eq("id", act.id);
      if (!uErr) tasksMade++;
    }
    setBusy(null);
    if (failed) toast.push(`${failed} item${failed === 1 ? "" : "s"} could not be saved`, "danger");
    if (rows.length - failed > 0) {
      setSavedActions(true);
      toast.push(createTasks ? `${plural(tasksMade, "task")} created and assigned` : `${plural(rows.length - failed, "action item")} added`, "success");
      router.refresh();
    }
  }

  async function addRisk(i: number, title: string) {
    if (!meeting.project_id) return;
    setBusy(`risk-${i}`);
    const { error } = await createClient().from("project_risks").insert({ project_id: meeting.project_id, title: title.slice(0, 200), severity: "normal", created_by: profile.id });
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    setAddedRisks((s) => new Set(s).add(i));
    toast.push("Added to project risks", "success");
    router.refresh();
  }

  const selectedDecisions = review?.decisions.filter((d) => d.selected).length || 0;
  const selectedActions = review?.actions.filter((a) => a.selected).length || 0;

  return (
    <div ref={rootRef} className="scroll-mt-[calc(var(--topbar-h)+12px)]">
      <Card className="border-[color-mix(in_oklab,var(--accent)_45%,var(--line))]">
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><Sparkles size={15} className="text-[var(--accent)]" /> AI meeting assistant</span>}
          subtitle={review ? `${plural(review.extract.action_items.length, "action item")} detected · ${plural(review.extract.decisions.length, "decision")} · ${plural(review.extract.open_questions.length, "question")}` : "Summary, decisions, action items, questions and risks from the notes and transcript"}
          action={ai.enabled && !disabled ? <Button size="sm" variant={review ? "secondary" : "primary"} onClick={extract} loading={busy === "extract"}><Sparkles size={13} /> {review ? "Extract again" : "Extract with AI"}</Button> : undefined}
        />
        <div className="px-[var(--s4)] pb-[var(--s4)] space-y-4">
          {ai.loading ? null : !ai.enabled || disabled ? (
            <AIDisabledNote compact />
          ) : (
            <>
              <div>
                <button type="button" onClick={() => setShowExtra((s) => !s)} className="text-xs link inline-flex items-center gap-1">
                  {showExtra ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {showExtra ? "Hide" : "Paste"} extra notes or a transcript {extra.trim() ? `· ${extra.trim().length} chars` : ""}
                </button>
                {showExtra && <Textarea value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Anything not yet in the Notes or Transcript fields — chat excerpts, a call transcript, your own recollection…" style={{ minHeight: 100 }} className="mt-2 font-mono text-[13px]" />}
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-danger rounded-[var(--radius-sm)] border border-[var(--danger)] px-3 py-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{error}</span>
                </div>
              )}

              {!review && !error && busy !== "extract" && <div className="text-sm text-muted">Add notes or a transcript above, then extract. Nothing is recorded until you confirm each section.</div>}

              {review && (
                <div className="space-y-5 anim-fade-up">
                  {/* Summary */}
                  <section>
                    <div className="eyebrow flex items-center gap-1.5 mb-1.5"><FileCheck2 size={12} /> Summary</div>
                    <Textarea value={summaryText} onChange={(e) => setSummaryText(e.target.value)} style={{ minHeight: 110 }} />
                    <div className="flex justify-end mt-2"><Button size="sm" variant="primary" onClick={saveSummary} loading={busy === "summary"} disabled={!summaryText.trim()}>Save as meeting summary</Button></div>
                  </section>

                  {/* Key points */}
                  {review.extract.key_points.length > 0 && (
                    <section>
                      <div className="eyebrow mb-1.5">Key points</div>
                      <ul className="space-y-1">
                        {review.extract.key_points.map((k, i) => <li key={i} className="flex gap-2 text-sm"><span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-2)] mt-2 shrink-0" /><span>{k}</span></li>)}
                      </ul>
                    </section>
                  )}

                  {/* Decisions */}
                  <section>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="eyebrow flex items-center gap-1.5"><Gavel size={12} /> Decisions · {review.decisions.length}</div>
                      {review.decisions.length > 0 && !savedDecisions && <Button size="xs" variant="primary" onClick={recordDecisions} loading={busy === "decisions"} disabled={!selectedDecisions}>Record {selectedDecisions ? `${selectedDecisions} ` : ""}selected</Button>}
                      {savedDecisions && <Pill tone="tone-success">Recorded</Pill>}
                    </div>
                    {review.decisions.length === 0 ? <div className="text-sm text-muted">No decisions detected.</div> : (
                      <div className="space-y-2">
                        {review.decisions.map((d, i) => (
                          <div key={i} className={cn("rounded-[var(--radius-sm)] border p-2.5 space-y-2", !d.selected && "opacity-60")}>
                            <div className="flex items-start gap-2">
                              <input type="checkbox" checked={d.selected} onChange={(e) => setDecision(i, { selected: e.target.checked })} className="accent-[var(--brand)] mt-2.5 shrink-0" disabled={savedDecisions} aria-label="Include decision" />
                              <Input value={d.title} onChange={(e) => setDecision(i, { title: e.target.value })} placeholder="Decision title" className="font-medium" disabled={savedDecisions} />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2 pl-6">
                              <Textarea value={d.decision} onChange={(e) => setDecision(i, { decision: e.target.value })} placeholder="What was decided" style={{ minHeight: 56 }} disabled={savedDecisions} />
                              <Textarea value={d.reason} onChange={(e) => setDecision(i, { reason: e.target.value })} placeholder="Why (optional)" style={{ minHeight: 56 }} disabled={savedDecisions} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Action items */}
                  <section>
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                      <div className="eyebrow flex items-center gap-1.5"><ListChecks size={12} /> Action items · {review.actions.length}</div>
                      {review.actions.length > 0 && !savedActions && (
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer"><input type="checkbox" checked={createTasks} onChange={(e) => setCreateTasks(e.target.checked)} className="accent-[var(--brand)]" /> Create tasks now</label>
                          <Button size="xs" variant="primary" onClick={addActions} loading={busy === "actions"} disabled={!selectedActions}>{createTasks ? `Create ${selectedActions || ""} task${selectedActions === 1 ? "" : "s"}` : `Add ${selectedActions || ""} as action item${selectedActions === 1 ? "" : "s"}`}</Button>
                        </div>
                      )}
                      {savedActions && <Pill tone="tone-success">Added</Pill>}
                    </div>
                    {review.actions.length === 0 ? <div className="text-sm text-muted">No action items detected.</div> : (
                      <div className="space-y-2">
                        {review.actions.map((a, i) => (
                          <div key={i} className={cn("rounded-[var(--radius-sm)] border p-2.5 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] items-start", !a.selected && "opacity-60")}>
                            <input type="checkbox" checked={a.selected} onChange={(e) => setAction(i, { selected: e.target.checked })} className="accent-[var(--brand)] mt-2.5" disabled={savedActions} aria-label="Include action item" />
                            <div className="grid gap-2 min-w-0 sm:grid-cols-[minmax(0,1fr)_170px_140px_120px]">
                              <Input value={a.title} onChange={(e) => setAction(i, { title: e.target.value })} placeholder="What needs to happen" disabled={savedActions} />
                              <PersonPicker value={a.owner_id} onChange={(v) => setAction(i, { owner_id: v })} placeholder="Owner" disabled={savedActions} />
                              <Input type="date" value={a.due} onChange={(e) => setAction(i, { due: e.target.value })} disabled={savedActions} />
                              <PriorityPicker value={a.priority} onChange={(v) => setAction(i, { priority: v })} disabled={savedActions} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Questions & risks */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <section className="min-w-0">
                      <div className="eyebrow flex items-center gap-1.5 mb-1.5"><HelpCircle size={12} /> Open questions · {review.extract.open_questions.length}</div>
                      {review.extract.open_questions.length === 0 ? <div className="text-sm text-muted">None.</div> : (
                        <ul className="space-y-1">{review.extract.open_questions.map((q, i) => <li key={i} className="text-sm flex gap-2"><span className="text-muted">?</span><span>{q}</span></li>)}</ul>
                      )}
                    </section>
                    <section className="min-w-0">
                      <div className="eyebrow flex items-center gap-1.5 mb-1.5"><ShieldAlert size={12} /> Risks · {review.extract.risks.length}</div>
                      {review.extract.risks.length === 0 ? <div className="text-sm text-muted">None.</div> : (
                        <ul className="space-y-1.5">
                          {review.extract.risks.map((r, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <span className="flex-1 min-w-0">{r}</span>
                              {meeting.project_id && (addedRisks.has(i) ? <Pill tone="tone-success">Added</Pill> : <Button size="xs" variant="ghost" onClick={() => addRisk(i, r)} loading={busy === `risk-${i}`} className="shrink-0"><Plus size={12} /> Project risk</Button>)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>

                  {review.extract.people_mentioned.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted"><span>Mentioned:</span>{review.extract.people_mentioned.map((p, i) => <Pill key={i} tone="tone-neutral">{p}</Pill>)}</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
});
