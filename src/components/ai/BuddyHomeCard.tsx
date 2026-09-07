"use client";

import * as React from "react";
import { AtSign, Compass, LifeBuoy, Lock, Sparkles, Users, X, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, Card } from "@/components/ui";
import type { BuddyMode } from "@/lib/ai/types";
import { ago, cn, relDate } from "@/lib/utils";
import { openBuddy } from "./buddyStore";
import { useAIStatus } from "./useAIStatus";
import { AIDisabledNote } from "./AIDisabledNote";

type Nudge = { id: string; icon: React.ReactNode; title: string; why: string; cta: string; mode: BuddyMode; message?: string; taskId?: string; link?: string };

const DAY = 86400e3;
const dismissKey = () => `ghl.buddy.nudges.${new Date().toISOString().slice(0, 10)}`;
function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(dismissKey()) || "[]") as string[];
  } catch {
    return [];
  }
}
function writeDismissed(ids: string[]) {
  try {
    localStorage.setItem(dismissKey(), JSON.stringify(ids));
  } catch {}
}

/**
 * "Your Buddy" card on the employee Home: the flagship I'M STUCK button, two universal prompts,
 * and up to three smart nudges computed from live data (no AI call) — dismissible for the day.
 */
export function BuddyHomeCard({ className }: { className?: string }) {
  const { profile, people } = useSession();
  const ai = useAIStatus();
  const [nudges, setNudges] = React.useState<Nudge[] | null>(null);
  const [dismissed, setDismissed] = React.useState<string[]>([]);

  React.useEffect(() => {
    let alive = true;
    const supabase = createClient();
    const now = Date.now();
    const twoDaysAgo = new Date(now - 2 * DAY).toISOString();
    const dayAgo = new Date(now - DAY).toISOString();
    const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(new Date().setHours(23, 59, 59, 999)).toISOString();
    const nameOf = (id: string | null) => people.find((p) => p.id === id)?.full_name.split(" ")[0] || "someone";

    Promise.all([
      supabase.from("tasks").select("id,title,status,updated_at,waiting_on,waiting_on_user_id").eq("assignee_id", profile.id).in("status", ["blocked", "waiting"]).lte("updated_at", twoDaysAgo).order("updated_at").limit(5),
      supabase.from("tasks").select("id,title,due_date,assignee_id").eq("waiting_on_user_id", profile.id).not("status", "in", "(done,cancelled)").gte("due_date", startOfDay).lte("due_date", endOfDay).limit(5),
      supabase.from("notifications").select("id,title,link,created_at,actor_id").eq("user_id", profile.id).eq("kind", "mention").is("read_at", null).lte("created_at", dayAgo).order("created_at", { ascending: false }).limit(5),
    ]).then(([blocked, waited, mentions]) => {
      if (!alive) return;
      const out: Nudge[] = [];
      for (const t of blocked.data || []) {
        out.push({
          id: `blocked:${t.id}`,
          icon: <Lock size={14} />,
          title: t.title,
          why: `${t.status === "blocked" ? "Blocked" : "Waiting"} for ${ago(t.updated_at)}${t.waiting_on_user_id ? ` on ${nameOf(t.waiting_on_user_id)}` : ""}. Want help?`,
          cta: "Why is this blocked?",
          mode: "why_blocked",
          taskId: t.id,
          link: `/tasks/${t.id}`,
        });
      }
      for (const t of waited.data || []) {
        out.push({
          id: `waited:${t.id}`,
          icon: <Clock size={14} />,
          title: t.title,
          why: `Due ${relDate(t.due_date)} and ${nameOf(t.assignee_id)} is waiting on you. Want a plan?`,
          cta: "What should I do?",
          mode: "what_next",
          message: `Help me finish “${t.title}” today — someone is waiting on me.`,
          taskId: t.id,
          link: `/tasks/${t.id}`,
        });
      }
      for (const n of mentions.data || []) {
        out.push({
          id: `mention:${n.id}`,
          icon: <AtSign size={14} />,
          title: n.title,
          why: `Mentioned ${ago(n.created_at)} — still unanswered. Want a reply drafted?`,
          cta: "Draft a reply",
          mode: "draft",
          message: `Draft a short reply to this mention: “${n.title}”`,
          link: n.link || "/inbox",
        });
      }
      setNudges(out);
      setDismissed(readDismissed());
    });
    return () => {
      alive = false;
    };
  }, [profile.id, people]);

  const visible = (nudges || []).filter((n) => !dismissed.includes(n.id)).slice(0, 3);
  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    writeDismissed(next);
  };

  if (!ai.loading && !ai.enabled) return <AIDisabledNote compact className={className} />;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="px-[var(--s4)] pt-[var(--s3)] pb-[var(--s3)]">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="w-7 h-7 rounded-[8px] flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))" }}><Sparkles size={14} /></span>
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-tight">Your Buddy</div>
            <div className="text-[11px] text-muted leading-tight">Gets you unstuck and gets work moving</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <button
            type="button"
            onClick={() => openBuddy({ mode: "stuck", send: true })}
            className="rounded-[var(--radius)] px-3.5 py-3 text-left text-white flex items-center gap-2.5 transition-transform active:scale-[.99] hover:brightness-110"
            style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))", boxShadow: "var(--shadow-sm)" }}
          >
            <LifeBuoy size={20} className="shrink-0" />
            <span className="min-w-0">
              <span className="block font-bold tracking-wide leading-tight">I&apos;M STUCK</span>
              <span className="block text-[11px] opacity-90 leading-tight">Fix · SOP · right person</span>
            </span>
          </button>
          <Button variant="secondary" className="!h-auto !py-2.5 justify-start" onClick={() => openBuddy({ mode: "what_next", send: true })}><Compass size={15} className="text-[var(--violet)]" /> What should I do first?</Button>
          <Button variant="secondary" className="!h-auto !py-2.5 justify-start" onClick={() => openBuddy({ mode: "who_can_help", send: true })}><Users size={15} className="text-[var(--violet)]" /> Who can help?</Button>
        </div>
      </div>

      {visible.length > 0 && (
        <div className="border-t">
          <div className="px-[var(--s4)] pt-2 pb-1 eyebrow">Smart nudges</div>
          <ul className="px-2 pb-2">
            {visible.map((n) => (
              <li key={n.id} className="flex items-start gap-2.5 px-2 py-2 rounded-[var(--radius-sm)] row-hover">
                <span className="w-7 h-7 rounded-full tone-violet flex items-center justify-center shrink-0 mt-0.5">{n.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{n.title}</div>
                  <div className="text-xs text-muted">{n.why}</div>
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <Button size="xs" variant="primary" onClick={() => openBuddy({ mode: n.mode, message: n.message, scope: n.taskId ? { taskId: n.taskId, path: n.link } : undefined, send: true })}><Sparkles size={11} /> {n.cta}</Button>
                    {n.link && <a href={n.link} className="btn btn-ghost btn-xs">Open</a>}
                  </div>
                </div>
                <button type="button" onClick={() => dismiss(n.id)} className="btn btn-ghost btn-xs btn-icon shrink-0 text-muted" aria-label="Dismiss for today" title="Dismiss for today"><X size={13} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
