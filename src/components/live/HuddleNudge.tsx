"use client";

/**
 * "This chat is getting complicated — start a 5-minute huddle?"
 *
 * Polls `huddle_suggestion(channel)` (12+ messages from 2+ people in the last 20 minutes and no room
 * already running). Dismissible, remembered for the session, and never shown twice in a row —
 * a nudge, not a nag.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Radio, X } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { huddleSuggestion, startRoom } from "@/lib/live/client";
import { cn } from "@/lib/utils";

const POLL_MS = 90_000;
const SNOOZE_MS = 30 * 60_000;
const key = (id: string) => `ghl-huddle-nudge:${id}`;

function snoozedUntil(channelId: string): number {
  try {
    return Number(sessionStorage.getItem(key(channelId)) || 0);
  } catch {
    return 0;
  }
}

export function HuddleNudge({ channelId, className }: { channelId: string; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [show, setShow] = React.useState(false);
  const [live, setLive] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const check = async () => {
      if (Date.now() < snoozedUntil(channelId)) return;
      try {
        const s = await huddleSuggestion(channelId);
        if (!alive) return;
        setLive(s.live_room_id || null);
        setShow(!!s.suggest);
      } catch {
        /* the nudge is optional — never surface an error for it */
      }
    };
    const t = setTimeout(check, 8000);
    const id = setInterval(check, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(t);
      clearInterval(id);
    };
  }, [channelId]);

  function snooze() {
    try {
      sessionStorage.setItem(key(channelId), String(Date.now() + SNOOZE_MS));
    } catch {}
    setShow(false);
  }

  async function start() {
    setBusy(true);
    try {
      const id = await startRoom("huddle", { channelId, title: "Quick huddle" }, { settings: { timer_minutes: 5 } });
      router.push(`/live/${id}`);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not start the huddle", "danger");
    } finally {
      setBusy(false);
    }
  }

  if (live) {
    return (
      <div className={cn("shrink-0 px-3 pb-1.5 bg-[var(--bg)]", className)}>
        <button type="button" onClick={() => router.push(`/live/${live}`)} className="pill tone-success max-w-full">
          <span className="blink-dot shrink-0" style={{ width: 6, height: 6, ["--blink" as string]: "var(--success)" }} />
          <span className="truncate">Huddle in progress in this channel · Join</span>
        </button>
      </div>
    );
  }

  if (!show) return null;

  return (
    <div className={cn("shrink-0 px-3 pb-1.5 bg-[var(--bg)] anim-fade-in", className)}>
      <div className="card px-2.5 py-1.5 flex items-center gap-2 min-w-0">
        <Radio size={14} className="text-[var(--brand-2)] shrink-0" />
        <span className="text-xs min-w-0 flex-1 truncate">This is moving fast — start a 5-minute huddle?</span>
        <Button size="xs" variant="primary" loading={busy} onClick={start}>Start huddle</Button>
        <button type="button" onClick={snooze} className="btn btn-ghost btn-xs btn-icon shrink-0" aria-label="Not now">
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
