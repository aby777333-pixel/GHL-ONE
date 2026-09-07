"use client";

import * as React from "react";
import { CalendarPlus, Check, Copy, RefreshCw, Rss } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Modal, Skeleton, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

function useFeedToken() {
  const [token, setToken] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    createClient()
      .rpc("my_calendar_token")
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e) setError(e.message);
        else setToken(data);
      });
    return () => {
      alive = false;
    };
  }, []);
  return { token, error, setToken };
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.push(`${label} copied`, "success");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.push("Copy failed — select the link and copy it manually", "danger");
    }
  }
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex items-center gap-1.5">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="input font-mono text-xs h-9 min-w-0 flex-1" />
        <Button type="button" size="sm" variant="secondary" onClick={copy} className="shrink-0" aria-label={`Copy ${label}`}>{copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}<span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span></Button>
      </div>
    </div>
  );
}

/**
 * Personal ICS subscription: my meetings, events and task deadlines, served by /api/calendar/{token}.ics.
 * The token is private; rotating it invalidates every calendar that used the old link.
 */
export function CalendarFeedCard({ className }: { className?: string }) {
  const toast = useToast();
  const { token, error, setToken } = useFeedToken();
  const [rotating, setRotating] = React.useState(false);
  const origin = React.useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const httpsUrl = token && origin ? `${origin}/api/calendar/${token}.ics` : "";
  const webcalUrl = httpsUrl ? httpsUrl.replace(/^https?:\/\//, "webcal://") : "";

  async function rotate() {
    if (!window.confirm("Rotate the feed link? Calendars subscribed with the current link will stop updating until you re-add the new one.")) return;
    setRotating(true);
    const { data, error: e } = await createClient().rpc("rotate_calendar_token");
    setRotating(false);
    if (e) return toast.push(e.message, "danger");
    setToken(data);
    toast.push("Feed link rotated — re-subscribe with the new link", "success");
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="text-sm text-2">Subscribe once and your GHL ONE meetings, events and task deadlines appear in the calendar app you already use — and stay in sync. Keep the link private: anyone with it can read your schedule.</div>
      {error ? (
        <div className="text-sm text-danger">Could not load your feed link: {error}</div>
      ) : !token || !origin ? (
        <div className="space-y-2"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
      ) : (
        <>
          <CopyRow label="Feed URL (https)" value={httpsUrl} />
          <CopyRow label="webcal:// link (opens directly in Apple / Outlook)" value={webcalUrl} />
          <div className="flex items-center gap-2 flex-wrap">
            <a href={webcalUrl} className="btn btn-primary btn-sm"><CalendarPlus size={14} /> Open in my calendar app</a>
            <Button type="button" size="sm" variant="ghost" loading={rotating} onClick={rotate}><RefreshCw size={14} /> Rotate link</Button>
          </div>
        </>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-[var(--radius-sm)] sunken p-2.5">
          <div className="font-medium mb-1">Google Calendar</div>
          <div className="text-muted leading-snug">Other calendars → <span className="font-medium">+</span> → <span className="font-medium">From URL</span> → paste the https link. Google refreshes every few hours.</div>
        </div>
        <div className="rounded-[var(--radius-sm)] sunken p-2.5">
          <div className="font-medium mb-1">Outlook</div>
          <div className="text-muted leading-snug">Add calendar → <span className="font-medium">Subscribe from web</span> → paste the https link and name it “GHL ONE”.</div>
        </div>
        <div className="rounded-[var(--radius-sm)] sunken p-2.5">
          <div className="font-medium mb-1">Apple Calendar</div>
          <div className="text-muted leading-snug">Click the webcal link, or File → <span className="font-medium">New Calendar Subscription</span> → paste it. Set auto-refresh to hourly.</div>
        </div>
      </div>
      <div className="text-[11px] text-muted">Feed covers the last 30 days onward: your meetings, company events and your open task deadlines. Read-only — edits happen in GHL ONE.</div>
    </div>
  );
}

/** Small header button that opens the subscription card in a modal (Calendar page). */
export function CalendarFeedButton({ size = "md" }: { size?: "sm" | "md" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size={size} onClick={() => setOpen(true)} title="Subscribe from Google, Outlook or Apple Calendar"><Rss size={15} /> <span className="hidden sm:inline">Subscribe</span></Button>
      <Modal open={open} onClose={() => setOpen(false)} title={<span className="inline-flex items-center gap-2"><Rss size={15} className="text-muted" /> Subscribe to your calendar</span>} width={600}>
        {open && <CalendarFeedCard />}
      </Modal>
    </>
  );
}
