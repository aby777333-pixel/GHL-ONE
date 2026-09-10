"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { Button, Card, CardHeader, Skeleton } from "@/components/ui";
import { callAI, type BriefResponse } from "@/lib/ai/types";
import { ago, cn } from "@/lib/utils";
import { AIDisabledNote } from "./AIDisabledNote";
import { AIMarkdown } from "./AIMarkdown";
import { useAIStatus } from "./useAIStatus";

type Loaded = { data?: BriefResponse; error?: string; disabled?: boolean };

/** Command Center → "AI management briefing": company-wide risks, likely misses, bottlenecks, decisions needed. Cached 4h server-side. */
export function RiskBriefing({ full, className }: { full?: boolean; className?: string }) {
  const ai = useAIStatus();
  const [state, setState] = React.useState<Loaded | null>(null);
  const [regenerating, setRegenerating] = React.useState(false);
  const reqRef = React.useRef(0);
  const loading = ai.enabled && !state;

  React.useEffect(() => {
    if (!ai.enabled || state) return;
    const req = ++reqRef.current;
    callAI<BriefResponse>("risks", {})
      .then((data) => {
        if (req === reqRef.current) setState({ data });
      })
      .catch((e: Error & { disabled?: boolean }) => {
        if (req === reqRef.current) setState({ error: e.message, disabled: e.disabled });
      });
  }, [ai.enabled, state]);

  const regenerate = async () => {
    setRegenerating(true);
    const req = ++reqRef.current;
    try {
      const data = await callAI<BriefResponse>("risks", { force: true });
      if (req === reqRef.current) setState({ data });
    } catch (e) {
      const err = e as Error & { disabled?: boolean };
      if (req === reqRef.current) setState({ error: err.message, disabled: err.disabled });
    } finally {
      setRegenerating(false);
    }
  };

  if (ai.loading) {
    return (
      <Card className={cn("p-[var(--s4)]", className)}>
        <RiskSkeleton />
      </Card>
    );
  }
  if (!ai.enabled || state?.disabled) return <AIDisabledNote compact={!full} className={className} />;

  return (
    <Card className={cn("border-[color-mix(in_oklab,var(--accent)_45%,var(--line))]", className)}>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Sparkles size={15} className="text-[var(--accent)]" /> AI management briefing</span>}
        subtitle="What's going wrong, likely misses, bottlenecks and the decisions only you can take"
        action={
          <Button size="sm" variant="ghost" onClick={regenerate} loading={regenerating} disabled={loading} title="Regenerate">
            <RefreshCw size={13} /> <span className="hidden sm:inline">Regenerate</span>
          </Button>
        }
      />
      <div className={cn("px-[var(--s4)] pb-[var(--s4)]", full && "max-w-3xl")}>
        {loading || regenerating ? (
          <RiskSkeleton />
        ) : state?.error ? (
          <div className="flex items-start gap-2 text-sm text-danger rounded-[var(--radius-sm)] border border-[var(--danger)] px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{state.error}</span>
          </div>
        ) : state?.data ? (
          /*
            In the Command Center's right-hand column the briefing is as long as the model made it.
            Left unbounded it stretched the whole row, so the left column ended in a screen of empty
            space and the page needed several extra scrolls. Compact mode gives the briefing its own
            scroll instead; the dedicated "AI briefing" tab (`full`) still shows it whole.
          */
          <div className={cn(!full && "max-h-[min(56vh,540px)] overflow-y-auto pr-1")}>
            <AIMarkdown source={state.data.markdown} className={full ? undefined : "text-sm"} />
          </div>
        ) : null}
        {state?.data && (
          <div className="text-[11px] text-muted num mt-3 pt-2.5 border-t">
            Generated {ago(state.data.generatedAt)}{state.data.cached ? " · refreshed every 4 hours" : ""}{ai.model ? ` · ${ai.model}` : ""}
          </div>
        )}
      </div>
    </Card>
  );
}

function RiskSkeleton() {
  return (
    <div className="space-y-2 py-1">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-11/12" />
      <Skeleton className="h-4 w-2/5 mt-3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-4 w-1/3 mt-3" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  );
}
