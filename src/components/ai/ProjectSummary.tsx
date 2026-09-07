"use client";

import * as React from "react";
import { AlertTriangle, ArrowRight, RefreshCw, Sparkles } from "lucide-react";
import { Button, Card, CardHeader, Skeleton } from "@/components/ui";
import { Markdown, excerpt } from "@/components/wiki/markdown";
import { AIDisabledNote } from "@/components/ai/AIDisabledNote";
import { useAIStatus } from "@/components/ai/useAIStatus";
import { callAI, type BriefResponse } from "@/lib/ai/types";
import { ago } from "@/lib/utils";

type Loaded = { key: string; data?: BriefResponse; error?: string; disabled?: boolean };

/** Loads (or re-generates) the cached executive summary of a project. */
function useProjectSummary(projectId: string, enabled: boolean) {
  const [state, setState] = React.useState<Loaded | null>(null);
  const [regenerating, setRegenerating] = React.useState(false);
  const key = enabled ? projectId : null;
  const loading = !!key && state?.key !== key;

  React.useEffect(() => {
    if (!key) return;
    let alive = true;
    callAI<BriefResponse>("project-summary", { projectId: key })
      .then((data) => alive && setState({ key, data }))
      .catch((e: Error & { disabled?: boolean }) => alive && setState({ key, error: e.message, disabled: e.disabled }));
    return () => {
      alive = false;
    };
  }, [key]);

  const regenerate = React.useCallback(async () => {
    if (!key) return;
    setRegenerating(true);
    try {
      const data = await callAI<BriefResponse>("project-summary", { projectId: key, force: true });
      setState({ key, data });
    } catch (e) {
      const err = e as Error & { disabled?: boolean };
      setState({ key, error: err.message, disabled: err.disabled });
    } finally {
      setRegenerating(false);
    }
  }, [key]);

  return { state: state?.key === key ? state : null, loading, regenerating, regenerate };
}

function SummarySkeleton() {
  return (
    <div className="space-y-2 py-1">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-11/12" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-4 w-1/3 mt-3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-danger rounded-[var(--radius-sm)] border border-[var(--danger)] px-3 py-2">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{text}</span>
    </div>
  );
}

/** Project Room → "AI Summary" tab. */
export function ProjectSummary({ projectId }: { projectId: string }) {
  const ai = useAIStatus();
  const { state, loading, regenerating, regenerate } = useProjectSummary(projectId, ai.enabled);
  const [risk, setRisk] = React.useState<{ data?: BriefResponse; error?: string; disabled?: boolean } | null>(null);
  const [riskBusy, setRiskBusy] = React.useState(false);

  async function analyseRisks() {
    setRiskBusy(true);
    try {
      const data = await callAI<BriefResponse>("risks", { projectId });
      setRisk({ data });
    } catch (e) {
      const err = e as Error & { disabled?: boolean };
      setRisk({ error: err.message, disabled: err.disabled });
    } finally {
      setRiskBusy(false);
    }
  }

  if (ai.loading) return <Card className="p-[var(--s4)]"><SummarySkeleton /></Card>;
  if (!ai.enabled || state?.disabled) return <AIDisabledNote />;

  return (
    <div className="grid gap-[var(--s4)] lg:grid-cols-[minmax(0,1fr)_380px] items-start">
      <Card className="min-w-0">
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><Sparkles size={15} className="text-[var(--accent)]" /> AI summary</span>}
          subtitle="Executive read of the project state — regenerated when the project changes"
        />
        <div className="px-[var(--s4)] pb-[var(--s4)]">
          {loading || regenerating ? <SummarySkeleton /> : state?.error ? <ErrorLine text={state.error} /> : state?.data ? <Markdown source={state.data.markdown} /> : null}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t text-xs text-muted">
            <span className="num">{state?.data ? `Generated ${ago(state.data.generatedAt)}${state.data.cached ? " · cached" : ""}${ai.model ? ` · ${ai.model}` : ""}` : ""}</span>
            <Button size="xs" variant="ghost" onClick={regenerate} loading={regenerating} disabled={loading}><RefreshCw size={12} /> Regenerate</Button>
          </div>
        </div>
      </Card>

      <Card className="min-w-0">
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><AlertTriangle size={15} className="text-[var(--warn)]" /> Risks & bottlenecks</span>}
          subtitle="What is likely to slip, who is stuck, and the decisions management must take"
          action={<Button size="sm" variant={risk?.data ? "secondary" : "primary"} onClick={analyseRisks} loading={riskBusy}><Sparkles size={13} /> {risk?.data ? "Re-analyse" : "Analyse risks"}</Button>}
        />
        <div className="px-[var(--s4)] pb-[var(--s4)]">
          {riskBusy ? <SummarySkeleton /> : risk?.disabled ? <AIDisabledNote compact /> : risk?.error ? <ErrorLine text={risk.error} /> : risk?.data ? (
            <>
              <Markdown source={risk.data.markdown} />
              <div className="text-xs text-muted num mt-3 pt-3 border-t">Analysed {ago(risk.data.generatedAt)}</div>
            </>
          ) : (
            <div className="text-sm text-muted">Run the analysis to get a risk briefing for this project: overdue chains, blocked owners, unapproved items and what to decide now.</div>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Compact "AI verdict" teaser for the Overview tab; opens the AI Summary tab. */
export function ProjectAITeaser({ projectId, onOpen }: { projectId: string; onOpen: () => void }) {
  const ai = useAIStatus();
  const { state, loading } = useProjectSummary(projectId, ai.enabled);
  if (ai.loading) return null;
  if (!ai.enabled || state?.disabled) return <AIDisabledNote compact />;
  const text = state?.data ? excerpt(state.data.markdown, 260) : null;
  return (
    <section className="card p-[var(--s4)] border-[color-mix(in_oklab,var(--accent)_45%,var(--line))]">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={15} className="text-[var(--accent)]" />
        <span className="h3">AI verdict</span>
        {state?.data && <span className="text-[11px] text-muted num ml-auto">{ago(state.data.generatedAt)}</span>}
      </div>
      {loading ? (
        <div className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /></div>
      ) : state?.error ? (
        <div className="text-sm text-muted">Summary unavailable right now.</div>
      ) : (
        <p className="text-sm text-2 leading-relaxed">{text}</p>
      )}
      <button type="button" onClick={onOpen} className="mt-2 text-sm link inline-flex items-center gap-1">Read the full AI summary <ArrowRight size={13} /></button>
    </section>
  );
}
