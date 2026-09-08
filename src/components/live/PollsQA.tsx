"use client";
/** Polls and Q&A (§88–§91). Both live in Postgres and stream over Supabase Realtime. */
import * as React from "react";
import { BarChart3, Check, MessageCircleQuestion, Plus, ThumbsUp, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, EmptyState, Field, Input, Pill, Progress, Tabs, Textarea, useToast } from "@/components/ui";
import { liveChannelName, type LivePoll, type LiveQuestion } from "@/lib/live/types";
import { ago, cn } from "@/lib/utils";

export function PollsQA({ roomId, orgId, meId, isHost }: { roomId: string; orgId: string; meId: string; isHost: boolean }) {
  const [tab, setTab] = React.useState<"polls" | "qa">("polls");
  const [polls, setPolls] = React.useState<LivePoll[]>([]);
  const [questions, setQuestions] = React.useState<LiveQuestion[]>([]);

  React.useEffect(() => {
    const sb = createClient();
    let alive = true;
    void Promise.all([
      sb.from("live_polls").select("*").eq("room_id", roomId).order("created_at", { ascending: false }),
      sb.from("live_questions").select("*").eq("room_id", roomId).order("created_at", { ascending: false }),
    ]).then(([p, q]) => {
      if (!alive) return;
      setPolls((p.data || []) as unknown as LivePoll[]);
      setQuestions((q.data || []) as unknown as LiveQuestion[]);
    });

    const rt = sb
      .channel(liveChannelName(roomId))
      .on("postgres_changes", { event: "*", schema: "public", table: "live_polls", filter: `room_id=eq.${roomId}` }, (p) => {
        const row = p.new as unknown as LivePoll;
        if (p.eventType === "DELETE") return setPolls((s) => s.filter((x) => x.id !== (p.old as { id?: string }).id));
        setPolls((s) => [row, ...s.filter((x) => x.id !== row.id)]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "live_questions", filter: `room_id=eq.${roomId}` }, (p) => {
        const row = p.new as unknown as LiveQuestion;
        if (p.eventType === "DELETE") return setQuestions((s) => s.filter((x) => x.id !== (p.old as { id?: string }).id));
        setQuestions((s) => [row, ...s.filter((x) => x.id !== row.id)]);
      })
      .subscribe();
    return () => {
      alive = false;
      void sb.removeChannel(rt);
    };
  }, [roomId]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <Tabs
        className="px-2 shrink-0"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "polls", label: "Polls", count: polls.filter((p) => p.status === "open").length },
          { key: "qa", label: "Q&A", count: questions.filter((q) => !q.answered).length },
        ]}
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {tab === "polls" ? <Polls polls={polls} roomId={roomId} orgId={orgId} meId={meId} isHost={isHost} /> : <QA questions={questions} roomId={roomId} orgId={orgId} meId={meId} isHost={isHost} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- polls */
function Polls({ polls, roomId, orgId, meId, isHost }: { polls: LivePoll[]; roomId: string; orgId: string; meId: string; isHost: boolean }) {
  const toast = useToast();
  const [creating, setCreating] = React.useState(false);
  const [question, setQuestion] = React.useState("");
  const [options, setOptions] = React.useState(["", ""]);
  const [multi, setMulti] = React.useState(false);
  const [anonymous, setAnonymous] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  async function create() {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2) return toast.push("A poll needs a question and two options", "danger");
    setBusy(true);
    const { error } = await createClient()
      .from("live_polls")
      .insert({
        org_id: orgId,
        room_id: roomId,
        question: question.trim(),
        options: opts.map((label, i) => ({ id: `o${i}`, label })),
        multi,
        anonymous,
        created_by: meId,
      });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    setQuestion("");
    setOptions(["", ""]);
    setCreating(false);
  }

  async function vote(poll: LivePoll, optionId: string) {
    const votes: Record<string, string[]> = JSON.parse(JSON.stringify(poll.votes || {}));
    if (!poll.multi) for (const k of Object.keys(votes)) votes[k] = (votes[k] || []).filter((u) => u !== meId);
    const cur = votes[optionId] || [];
    votes[optionId] = cur.includes(meId) ? cur.filter((u) => u !== meId) : [...cur, meId];
    const { error } = await createClient().from("live_polls").update({ votes }).eq("id", poll.id);
    if (error) toast.push(error.message, "danger");
  }

  async function close(poll: LivePoll) {
    await createClient().from("live_polls").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", poll.id);
  }

  return (
    <div className="space-y-2">
      {isHost && !creating && (
        <Button size="sm" variant="secondary" className="w-full" onClick={() => setCreating(true)}>
          <Plus size={14} /> New poll
        </Button>
      )}
      {creating && (
        <div className="card p-3 space-y-2">
          <Field label="Question"><Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should we do first?" autoFocus /></Field>
          {options.map((o, i) => (
            <Input key={i} value={o} onChange={(e) => setOptions((s) => s.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} />
          ))}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="xs" variant="ghost" onClick={() => setOptions((s) => [...s, ""])}><Plus size={12} /> Option</Button>
            <label className="text-xs inline-flex items-center gap-1.5"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Multiple choices</label>
            <label className="text-xs inline-flex items-center gap-1.5"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Anonymous</label>
            <span className="ml-auto flex gap-1">
              <Button size="xs" onClick={() => setCreating(false)}>Cancel</Button>
              <Button size="xs" variant="primary" loading={busy} onClick={() => void create()}>Start</Button>
            </span>
          </div>
        </div>
      )}
      {polls.length === 0 && !creating && <EmptyState icon={<BarChart3 size={18} />} title="No polls yet" hint={isHost ? "Ask the room a quick question." : "The host can start a poll."} />}
      {polls.map((p) => {
        const total = Object.values(p.votes || {}).reduce((a, v) => a + v.length, 0) || 0;
        return (
          <div key={p.id} className="card p-3">
            <div className="flex items-start gap-2">
              <div className="text-sm font-medium flex-1 min-w-0">{p.question}</div>
              <Pill tone={p.status === "open" ? "tone-success" : "tone-neutral"}>{p.status === "open" ? "Open" : "Closed"}</Pill>
            </div>
            <div className="mt-2 space-y-1.5">
              {p.options.map((o) => {
                const v = p.votes?.[o.id] || [];
                const pct = total ? Math.round((v.length / total) * 100) : 0;
                const mine = v.includes(meId);
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={p.status !== "open"}
                    onClick={() => void vote(p, o.id)}
                    className={cn("w-full text-left rounded-[var(--radius-sm)] border px-2.5 py-1.5 disabled:cursor-default", mine && "border-[var(--brand-2)] bg-[var(--info-bg)]")}
                  >
                    <span className="flex items-center gap-2 text-xs">
                      {mine && <Check size={12} />}
                      <span className="flex-1 min-w-0 truncate">{o.label}</span>
                      <span className="num text-muted">{pct}%</span>
                    </span>
                    <Progress value={pct} className="mt-1" height={4} />
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-2 text-[11px] text-muted">
              <span>{total} vote{total === 1 ? "" : "s"}{p.anonymous ? " · anonymous" : ""}</span>
              {isHost && p.status === "open" && (
                <Button size="xs" variant="ghost" className="ml-auto" onClick={() => void close(p)}><X size={12} /> Close</Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------- Q&A */
function QA({ questions, roomId, orgId, meId, isHost }: { questions: LiveQuestion[]; roomId: string; orgId: string; meId: string; isHost: boolean }) {
  const toast = useToast();
  const [body, setBody] = React.useState("");
  const [anonymous, setAnonymous] = React.useState(false);
  const [answering, setAnswering] = React.useState<string | null>(null);
  const [answer, setAnswer] = React.useState("");

  const sorted = React.useMemo(
    () => [...questions].sort((a, b) => Number(a.answered) - Number(b.answered) || (b.upvotes?.length || 0) - (a.upvotes?.length || 0)),
    [questions]
  );

  async function ask() {
    if (!body.trim()) return;
    const { error } = await createClient().from("live_questions").insert({ org_id: orgId, room_id: roomId, body: body.trim(), author_id: meId, anonymous });
    if (error) return toast.push(error.message, "danger");
    setBody("");
  }

  async function upvote(q: LiveQuestion) {
    const up = q.upvotes || [];
    const next = up.includes(meId) ? up.filter((u) => u !== meId) : [...up, meId];
    await createClient().from("live_questions").update({ upvotes: next }).eq("id", q.id);
  }

  return (
    <div className="space-y-2">
      <div className="card p-2 space-y-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ask a question — the room can upvote it." style={{ minHeight: 56 }} />
        <div className="flex items-center gap-2">
          <label className="text-xs inline-flex items-center gap-1.5"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Ask anonymously</label>
          <Button size="xs" variant="primary" className="ml-auto" onClick={() => void ask()}>Ask</Button>
        </div>
      </div>
      {sorted.length === 0 && <EmptyState icon={<MessageCircleQuestion size={18} />} title="No questions yet" hint="Nobody has to interrupt — questions queue up here." />}
      {sorted.map((q) => (
        <div key={q.id} className={cn("card p-3", q.answered && "opacity-70")}>
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => void upvote(q)} className={cn("flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-[var(--radius-sm)] border text-[11px]", (q.upvotes || []).includes(meId) && "border-[var(--brand-2)] text-[var(--brand-2)]")}>
              <ThumbsUp size={12} />
              <span className="num">{q.upvotes?.length || 0}</span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-sm break-words">{q.body}</div>
              <div className="text-[11px] text-muted mt-0.5">{q.anonymous ? "Anonymous" : q.author_id === meId ? "You" : "Someone"} · {ago(q.created_at)}</div>
              {q.answered && q.answer && <div className="mt-1.5 rounded-[var(--radius-sm)] sunken px-2 py-1.5 text-xs"><span className="font-medium">Answer:</span> {q.answer}</div>}
            </div>
            {isHost && !q.answered && (
              <Button size="xs" variant="ghost" onClick={() => { setAnswering(q.id); setAnswer(""); }}>Answer</Button>
            )}
            {isHost && (
              <Button size="xs" icon variant="ghost" aria-label="Delete question" onClick={() => void createClient().from("live_questions").delete().eq("id", q.id)}>
                <Trash2 size={12} />
              </Button>
            )}
          </div>
          {answering === q.id && (
            <div className="mt-2 flex items-end gap-2">
              <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer for the room…" style={{ minHeight: 48 }} autoFocus />
              <Button
                size="xs"
                variant="primary"
                onClick={async () => {
                  await createClient().from("live_questions").update({ answered: true, answer: answer.trim(), answered_by: meId }).eq("id", q.id);
                  setAnswering(null);
                }}
              >
                Save
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
