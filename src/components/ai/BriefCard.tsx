"use client";

import * as React from "react";
import { useSession } from "@/components/providers/SessionProvider";
import { isAdminRole } from "@/lib/utils";
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Sparkles, Sunrise, Sunset } from "lucide-react";
import { Button, Card, Skeleton } from "@/components/ui";
import { useLocalStorage } from "@/components/files/useLocalStorage";
import { callAI, type BriefResponse } from "@/lib/ai/types";
import { cn, fmtTime } from "@/lib/utils";
import { AIDisabledNote } from "./AIDisabledNote";
import { AIMarkdown } from "./AIMarkdown";
import { useAIStatus } from "./useAIStatus";

type Mode = "morning" | "eod";
type Loaded = { data?: BriefResponse; error?: string; disabled?: boolean };

const HIDDEN_KEY = "ghl.ai.brief.hidden";

const COPY: Record<"employee" | "manager" | "executive", { title: string; subtitle: string }> = {
  employee: { title: "Your brief", subtitle: "Personalised from your tasks, approvals, meetings and mentions" },
  manager: { title: "Team brief", subtitle: "Your day plus what is moving — or stuck — in your team" },
  executive: { title: "Executive brief", subtitle: "Your day plus the company view: risks, approvals and decisions" },
};

/**
 * AI Morning Brief / End-of-day Summary. Cached server-side per user and day, so re-renders are cheap.
 * `collapsible` adds a Hide toggle (persisted in localStorage) — used on My Work.
 */
export function BriefCard({ variant, collapsible, className }: { variant: "employee" | "manager" | "executive"; collapsible?: boolean; className?: string }) {
  const ai = useAIStatus();
  const { profile } = useSession();
  const [hiddenRaw, setHiddenRaw] = useLocalStorage(HIDDEN_KEY, "0");
  const hidden = !!collapsible && hiddenRaw === "1";
  const [mode, setMode] = React.useState<Mode>(() => (new Date().getHours() >= 16 ? "eod" : "morning"));
  const [loaded, setLoaded] = React.useState<Partial<Record<Mode, Loaded>>>({});
  const [regenerating, setRegenerating] = React.useState(false);
  const reqRef = React.useRef(0);

  const active = ai.enabled && !hidden;
  const current = loaded[mode];
  const loading = active && !current;

  React.useEffect(() => {
    if (!active || loaded[mode]) return;
    const req = ++reqRef.current;
    callAI<BriefResponse>("brief", { mode })
      .then((data) => {
        if (req === reqRef.current) setLoaded((s) => ({ ...s, [mode]: { data } }));
      })
      .catch((e: Error & { disabled?: boolean }) => {
        if (req === reqRef.current) setLoaded((s) => ({ ...s, [mode]: { error: e.message, disabled: e.disabled } }));
      });
  }, [active, mode, loaded]);

  const regenerate = async () => {
    setRegenerating(true);
    const req = ++reqRef.current;
    try {
      const data = await callAI<BriefResponse>("brief", { mode, force: true });
      if (req === reqRef.current) setLoaded((s) => ({ ...s, [mode]: { data } }));
    } catch (e) {
      const err = e as Error & { disabled?: boolean };
      if (req === reqRef.current) setLoaded((s) => ({ ...s, [mode]: { error: err.message, disabled: err.disabled } }));
    } finally {
      setRegenerating(false);
    }
  };

  const copy = COPY[variant];

  if (ai.loading) {
    return (
      <Card className={cn("p-[var(--s4)]", className)}>
        <BriefSkeleton />
      </Card>
    );
  }
  if (!ai.enabled || current?.disabled) return isAdminRole(profile.role) ? <AIDisabledNote compact className={className} /> : null;

  if (hidden) {
    return (
      <button type="button" onClick={() => setHiddenRaw("0")} className={cn("card card-hover w-full px-3 py-2 flex items-center gap-2 text-xs text-muted text-left", className)}>
        <Sparkles size={14} className="text-[var(--accent)] shrink-0" />
        <span className="min-w-0 flex-1 truncate">AI brief hidden</span>
        <span className="inline-flex items-center gap-1 shrink-0">Show <ChevronDown size={13} /></span>
      </button>
    );
  }

  return (
    <Card className={cn("border-[color-mix(in_oklab,var(--accent)_45%,var(--line))] overflow-hidden", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-[var(--s4)] pt-[var(--s3)] pb-[var(--s2)]">
        <div className="min-w-0 flex items-start gap-2.5">
          <span className="w-8 h-8 rounded-[9px] flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))" }}>
            <Sparkles size={15} />
          </span>
          <div className="min-w-0">
            <div className="h3 truncate">{mode === "eod" ? "End-of-day summary" : copy.title}</div>
            <div className="text-xs text-muted mt-0.5">{copy.subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <div className="inline-flex rounded-full border p-0.5 bg-[var(--bg)]" role="tablist" aria-label="Brief mode">
            <ModeButton active={mode === "morning"} onClick={() => setMode("morning")} icon={<Sunrise size={13} />} label="Morning" />
            <ModeButton active={mode === "eod"} onClick={() => setMode("eod")} icon={<Sunset size={13} />} label="End of day" />
          </div>
          {collapsible && (
            <Button size="sm" variant="ghost" icon onClick={() => setHiddenRaw("1")} aria-label="Hide brief" title="Hide">
              <ChevronUp size={15} />
            </Button>
          )}
        </div>
      </div>
      <div className="px-[var(--s4)] pb-[var(--s3)]">
        {loading || regenerating ? (
          <BriefSkeleton />
        ) : current?.error ? (
          <div className="flex items-start gap-2 text-sm text-danger rounded-[var(--radius-sm)] border border-[var(--danger)] px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{current.error}</span>
          </div>
        ) : current?.data ? (
          <AIMarkdown source={current.data.markdown} className="text-sm" />
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t text-[11px] text-muted">
          <span className="num">
            {current?.data ? `Generated ${fmtTime(current.data.generatedAt)}${current.data.cached ? " · cached for today" : ""}` : loading ? "Writing your brief…" : ""}
          </span>
          <Button size="xs" variant="ghost" onClick={regenerate} loading={regenerating} disabled={loading}>
            <RefreshCw size={12} /> Regenerate
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn("inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium transition-colors", active ? "bg-[var(--brand)] text-[var(--brand-fg)]" : "text-muted hover:text-[var(--fg)]")}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function BriefSkeleton() {
  return (
    <div className="space-y-2 py-1">
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-11/12" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
