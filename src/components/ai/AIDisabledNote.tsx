"use client";

import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, isAdminRole } from "@/lib/utils";

/** Shown wherever an intelligence feature would render but ANTHROPIC_API_KEY is not configured. */
export function AIDisabledNote({ compact, className }: { compact?: boolean; className?: string }) {
  const { profile } = useSession();
  const admin = isAdminRole(profile.role);

  if (compact) {
    return (
      <div className={cn("card px-3 py-2 flex items-center gap-2.5 text-xs text-muted border-dashed", className)}>
        <Sparkles size={14} className="shrink-0 text-[var(--accent)]" />
        <span className="min-w-0 flex-1">Intelligence features are not configured yet.</span>
        {admin && (
          <Link href="/admin?tab=ai" className="link inline-flex items-center gap-1 shrink-0">Set up <ArrowRight size={12} /></Link>
        )}
      </div>
    );
  }

  return (
    <div className={cn("card p-[var(--s4)] border-dashed", className)}>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full sunken flex items-center justify-center shrink-0 text-[var(--accent)]"><Sparkles size={17} /></span>
        <div className="min-w-0">
          <div className="font-medium">Intelligence features are not configured yet</div>
          <p className="text-sm text-muted mt-1">
            Add <code>ANTHROPIC_API_KEY</code> to the environment (Netlify → Site configuration → Environment variables) and redeploy. Ask GHL, daily briefs, project summaries and AI search switch on automatically.
          </p>
          {admin && (
            <Link href="/admin?tab=ai" className="btn btn-secondary btn-sm mt-3 inline-flex">Open Intelligence settings <ArrowRight size={13} /></Link>
          )}
        </div>
      </div>
    </div>
  );
}
