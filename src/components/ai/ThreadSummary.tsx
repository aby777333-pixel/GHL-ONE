"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw, Sparkles, X } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { Markdown } from "@/components/wiki/markdown";
import { AIDisabledNote } from "@/components/ai/AIDisabledNote";
import { callAI, type AskResponse } from "@/lib/ai/types";
import { personName } from "@/components/chat/lib";
import type { ChatMessage, PersonLite } from "@/components/chat/types";

const MAX_CHARS = 6000;
const PROMPT = "Summarise this thread: context, decision, open questions, actions. Be concise and use short headings.";

type Result = { key: string; answer?: string; error?: string; disabled?: boolean };

/** Inline AI summary of one chat thread (parent + replies). Runs on mount; "Refresh" re-runs it. */
export function ThreadSummary({ channelId, parent, replies, authorOf, onClose }: { channelId: string; parent: ChatMessage; replies: ChatMessage[]; authorOf: (id: string | null) => PersonLite | undefined; onClose: () => void }) {
  const [result, setResult] = React.useState<Result | null>(null);
  const [run, setRun] = React.useState(0);
  const key = `${parent.id}:${run}`;
  const loading = result?.key !== key;
  const latest = React.useRef({ parent, replies, authorOf });
  React.useEffect(() => {
    latest.current = { parent, replies, authorOf };
  });

  React.useEffect(() => {
    const { parent, replies, authorOf } = latest.current;
    const nameOf = (id: string | null) => personName(authorOf(id));
    const lines = [`${nameOf(parent.author_id)}: ${parent.body || "(attachment)"}`];
    for (const r of replies) if (!r.deleted_at && r.kind !== "system" && r.body.trim()) lines.push(`${nameOf(r.author_id)}: ${r.body}`);
    let text = lines.join("\n");
    if (text.length > MAX_CHARS) text = text.slice(text.length - MAX_CHARS);
    let alive = true;
    callAI<AskResponse>("ask", { message: `${PROMPT}\n\n# Thread (${replies.length} replies)\n${text}`, scope: { channelId } })
      .then((r) => alive && setResult({ key, answer: r.answer }))
      .catch((e: Error & { disabled?: boolean }) => alive && setResult({ key, error: e.message, disabled: e.disabled }));
    return () => {
      alive = false;
    };
  }, [key, channelId]);

  return (
    <div className="shrink-0 border-b bg-[var(--bg)] px-3 py-2 max-h-[45%] overflow-y-auto anim-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <span className="eyebrow inline-flex items-center gap-1"><Sparkles size={11} className="text-[var(--accent)]" /> Thread summary</span>
        <span className="ml-auto flex items-center gap-0.5">
          <Button size="xs" variant="ghost" icon aria-label="Refresh summary" onClick={() => setRun((n) => n + 1)} disabled={loading}><RefreshCw size={12} /></Button>
          <Button size="xs" variant="ghost" icon aria-label="Close summary" onClick={onClose}><X size={13} /></Button>
        </span>
      </div>
      {loading ? (
        <div className="space-y-1.5 py-1"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-11/12" /><Skeleton className="h-3 w-2/3" /></div>
      ) : result?.disabled ? (
        <AIDisabledNote compact />
      ) : result?.error ? (
        <div className="flex items-start gap-2 text-xs text-danger"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{result.error}</span></div>
      ) : (
        <Markdown source={result?.answer || ""} className="text-sm" />
      )}
    </div>
  );
}
