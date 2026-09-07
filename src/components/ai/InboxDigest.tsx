"use client";

import * as React from "react";
import Link from "next/link";
import { AtSign, CheckSquare, Clock, HelpCircle, LifeBuoy, RefreshCw, Sparkles, Zap } from "lucide-react";
import { Button, Card, Skeleton } from "@/components/ui";
import { callAI } from "@/lib/ai/types";
import { ago, cn } from "@/lib/utils";
import { AIDisabledNote } from "./AIDisabledNote";
import { useAIStatus } from "./useAIStatus";
import { openBuddy } from "./buddyStore";

type Kind = "needs_action" | "waiting_on_me" | "question" | "approval" | "mention" | "suggested_help";
type Item = { title: string; why: string; link: string | null; kind: Kind };
type Digest = { summary: string; items: Item[]; cached: boolean; generatedAt: string };

const SECTIONS: { key: Kind; title: string; icon: React.ReactNode; tone: string }[] = [
  { key: "needs_action", title: "Needs action", icon: <Zap size={13} />, tone: "tone-warn" },
  { key: "waiting_on_me", title: "Waiting on me", icon: <Clock size={13} />, tone: "tone-danger" },
  { key: "question", title: "Questions", icon: <HelpCircle size={13} />, tone: "tone-info" },
  { key: "approval", title: "Approvals", icon: <CheckSquare size={13} />, tone: "tone-violet" },
  { key: "mention", title: "Mentions", icon: <AtSign size={13} />, tone: "tone-info" },
  { key: "suggested_help", title: "Suggested help", icon: <LifeBuoy size={13} />, tone: "tone-success" },
];

/** AI personal inbox: "the 5 things that actually need your attention", grouped by kind. Cached per day on the server. */
export function InboxDigest({ className }: { className?: string }) {
  const ai = useAIStatus();
  const [digest, setDigest] = React.useState<Digest | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [disabled, setDisabled] = React.useState(false);

  const load = React.useCallback(async (force: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setDigest(await callAI<Digest>("inbox", { force }));
    } catch (e) {
      const err = e as Error & { disabled?: boolean };
      if (err.disabled) setDisabled(true);
      else setError(err.message || "Could not build your digest");
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    if (ai.loading || !ai.enabled) return;
    const t = setTimeout(() => void load(false), 0);
    return () => clearTimeout(t);
  }, [ai.loading, ai.enabled, load]);

  if (ai.loading) return null;
  if (!ai.enabled || disabled) return <AIDisabledNote compact className={className} />;

  const grouped = SECTIONS.map((s) => ({ ...s, items: (digest?.items || []).filter((i) => i.kind === s.key) })).filter((s) => s.items.length);

  return (
    <Card className={cn("px-[var(--s4)] py-[var(--s3)]", className)}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-6 h-6 rounded-[7px] flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))" }}><Sparkles size={12} /></span>
        <span className="eyebrow">The {digest?.items.length || 5} things that actually need your attention</span>
        <span className="ml-auto inline-flex items-center gap-2">
          {digest && <span className="text-[10px] text-muted num hidden sm:inline">{digest.cached ? "from " : ""}{ago(digest.generatedAt)}</span>}
          <Button size="xs" variant="ghost" onClick={() => load(true)} loading={busy} aria-label="Refresh digest"><RefreshCw size={12} /> Refresh</Button>
        </span>
      </div>

      {error ? (
        <div className="text-xs text-danger">{error}</div>
      ) : !digest ? (
        <div className="space-y-2 pt-1">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ) : (
        <>
          <p className="text-sm text-2 mb-2">{digest.summary}</p>
          {grouped.length === 0 ? (
            <div className="text-sm text-muted">Nothing needs you right now. Enjoy the calm.</div>
          ) : (
            <div className="space-y-2">
              {grouped.map((s) => (
                <div key={s.key}>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium mb-1"><span className={cn("w-5 h-5 rounded-full inline-flex items-center justify-center", s.tone)}>{s.icon}</span>{s.title}</div>
                  <ol className="space-y-1 pl-1">
                    {s.items.map((it, i) => (
                      <li key={`${s.key}-${i}`} className="flex items-start gap-2 text-sm min-w-0">
                        <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-[var(--brand-2)] shrink-0" />
                        <div className="min-w-0 flex-1">
                          {it.link ? <Link href={it.link} className="font-medium hover:underline">{it.title}</Link> : <span className="font-medium">{it.title}</span>}
                          <div className="text-xs text-muted">{it.why}</div>
                        </div>
                        <button type="button" onClick={() => openBuddy({ mode: s.key === "suggested_help" ? "who_can_help" : "what_next", message: `Help me with: ${it.title}. ${it.why}`, send: true })} className="btn btn-ghost btn-xs shrink-0" title="Ask Buddy"><Sparkles size={12} className="text-[var(--accent)]" /></button>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
