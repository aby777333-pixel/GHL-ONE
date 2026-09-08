"use client";
/**
 * AI in the room (§130, §133–§137, §205, §206).
 * Summarise, pull out actions, list open questions, catch a late joiner up.
 * The AI never writes anything: it proposes, a human confirms (§ "AI proposes, humans confirm").
 */
import * as React from "react";
import { CheckSquare, HelpCircle, ListChecks, Rewind, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, EmptyState, Pill, Spinner, useToast } from "@/components/ui";
import { callAI, type BuddyProposal, type BuddyResponse } from "@/lib/ai/types";
import { roomTask } from "@/lib/live/client";

type Job = "summary" | "actions" | "questions" | "catchup";

const JOBS: { key: Job; label: string; icon: React.ComponentType<{ size?: number }>; ask: string }[] = [
  { key: "summary", label: "Summarize now", icon: ListChecks, ask: "Summarise what this meeting has covered so far in at most six bullet points. Only use the notes and events below." },
  { key: "actions", label: "Create actions", icon: CheckSquare, ask: "From the notes and events below, propose the concrete tasks that came out of this meeting. Each one needs a clear title and, where the notes say so, an owner." },
  { key: "questions", label: "Open questions", icon: HelpCircle, ask: "List the questions that are still open in this meeting — things nobody answered or decided." },
  { key: "catchup", label: "Catch me up", icon: Rewind, ask: "I just joined this meeting late. In five short lines, tell me what has happened and what is being decided right now." },
];

export function RoomAI({ roomId, roomTitle, isHost }: { roomId: string; roomTitle: string; isHost: boolean }) {
  const toast = useToast();
  const [job, setJob] = React.useState<Job | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [answer, setAnswer] = React.useState("");
  const [proposals, setProposals] = React.useState<BuddyProposal[]>([]);
  const [confirmed, setConfirmed] = React.useState<Set<number>>(new Set());
  const [disabled, setDisabled] = React.useState(false);

  async function roomContext() {
    const sb = createClient();
    const [notes, events, transcript] = await Promise.all([
      sb.from("live_notes").select("body").eq("room_id", roomId).maybeSingle(),
      sb.from("live_events").select("kind,actor_name,payload,created_at").eq("room_id", roomId).order("created_at", { ascending: true }).limit(120),
      sb.from("live_transcripts").select("speaker_name,text").eq("room_id", roomId).order("created_at", { ascending: true }).limit(200),
    ]);
    const ev = (events.data || [])
      .filter((e) => ["chat", "decision", "task", "bookmark", "joined", "left", "share_started", "note"].includes(e.kind))
      .map((e) => `${e.actor_name || "Someone"} · ${e.kind}${(e.payload as { body?: string })?.body ? `: ${(e.payload as { body?: string }).body}` : ""}`)
      .join("\n");
    const tr = (transcript.data || []).map((t) => `${t.speaker_name || "Speaker"}: ${t.text}`).join("\n").slice(0, 6000);
    return [`Room: ${roomTitle}`, notes.data?.body ? `Shared notes:\n${notes.data.body}` : "", ev ? `Room events:\n${ev}` : "", tr ? `Transcript:\n${tr}` : ""].filter(Boolean).join("\n\n");
  }

  async function run(j: Job) {
    setJob(j);
    setBusy(true);
    setAnswer("");
    setProposals([]);
    setConfirmed(new Set());
    try {
      const ctx = await roomContext();
      const spec = JOBS.find((x) => x.key === j)!;
      const res = await callAI<BuddyResponse>("buddy", {
        mode: j === "catchup" ? "brief" : j === "actions" ? "breakdown" : "chat",
        message: `${spec.ask}\n\n---\n${ctx}\n---\n\nIf the material above does not say something, do not invent it.`,
        scope: { path: `/live/${roomId}` },
      });
      setAnswer(res.answer);
      setProposals(res.proposals.filter((p) => p.kind === "task" || p.kind === "decision"));
    } catch (e) {
      const err = e as Error & { disabled?: boolean };
      if (err.disabled) setDisabled(true);
      else toast.push(err.message, "danger");
    }
    setBusy(false);
  }

  async function confirm(p: BuddyProposal, i: number) {
    try {
      await roomTask(roomId, {
        title: p.title,
        assigneeId: p.assignee_id || null,
        due: p.due_date || null,
        priority: p.priority || "normal",
        description: p.description || p.body || null,
      });
      setConfirmed((s) => new Set(s).add(i));
      toast.push("Task created", "success");
    } catch (e) {
      toast.push((e as Error).message, "danger");
    }
  }

  if (disabled) {
    return <EmptyState icon={<Sparkles size={18} />} title="AI is switched off here" hint="No Anthropic key is configured for this workspace. The Notes tab still keeps the meeting record." className="h-full" />;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="grid grid-cols-2 gap-1.5 p-2 border-b shrink-0">
        {JOBS.map((j) => (
          <Button key={j.key} size="sm" variant={job === j.key ? "secondary" : "ghost"} onClick={() => void run(j.key)} disabled={busy}>
            <j.icon size={14} /> {j.label}
          </Button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {busy && <div className="py-6 flex justify-center"><Spinner /></div>}
        {!busy && !answer && (
          <EmptyState icon={<Sparkles size={18} />} title="Ask the room's AI" hint="It reads the shared notes, the room events and any transcript — nothing else." />
        )}
        {answer && <div className="text-sm whitespace-pre-wrap leading-relaxed">{answer}</div>}

        {proposals.length > 0 && (
          <div className="space-y-2">
            <div className="eyebrow flex items-center gap-1.5">Proposed — you confirm <Pill tone="tone-neutral">{proposals.length}</Pill></div>
            {proposals.map((p, i) => (
              <div key={i} className="card p-2.5">
                <div className="text-sm font-medium">{p.title}</div>
                {(p.description || p.reason) && <div className="text-[11px] text-muted mt-0.5">{p.description || p.reason}</div>}
                <div className="flex items-center gap-2 mt-2">
                  {p.assignee_name && <Pill tone="tone-neutral">{p.assignee_name}</Pill>}
                  {p.due_date && <Pill tone="tone-warn">{p.due_date}</Pill>}
                  <Button size="xs" variant={confirmed.has(i) ? "success" : "primary"} className="ml-auto" disabled={confirmed.has(i)} onClick={() => void confirm(p, i)}>
                    {confirmed.has(i) ? "Created" : "Create task"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {answer && (
          <p className="text-[11px] text-muted border-t pt-2">
            GHL Buddy proposes; nothing was saved automatically. {isHost ? "As host you can also record decisions in the Notes tab." : "Ask the host to record anything that was decided."}
          </p>
        )}
      </div>
    </div>
  );
}
