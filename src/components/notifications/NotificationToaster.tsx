"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { KIND_ICON, announceNotificationsChanged } from "@/components/shell/NotificationsPanel";
import { cn, type Notification } from "@/lib/utils";

/*
  A notification arriving while you are in the app shows up as a pop-up, not just as a number on
  the bell. Everything that happens — an assignment, a mention, an approval to answer, a sign-up to
  admit, a role change, an incident — already lands in `notifications` (triggers do that), and push
  reaches a phone that is away. What was missing was the case in between: the person is looking at
  the app and nothing moved except the badge. This listens for INSERTs on their own rows and pops
  each one for a few seconds; clicking it opens the link and marks it read, the X just dismisses.

  Rules:
  - At most three on screen, newest at the bottom; the oldest is dropped to make room.
  - Urgent kinds (critical, action_required, security) stay longer. Everything else goes after 8 s.
  - Do-not-disturb, quiet hours, and `dnd`/`focus` presence silence the non-urgent ones — the same
    rule ActivityProvider uses to stop the activity dot pulsing. Urgent ones still show: DND is for
    chatter, not for "the building is on fire".
  - A Live ring (a live_room notification whose link carries ?invite=) is NOT popped here — the
    LiveProvider already shows the incoming-call card for it, and two cards for one call is noise.
  - Realtime is a WebSocket and some networks block it (see "Supabase through the app's own origin").
    While the channel is not SUBSCRIBED a 45 s poll takes over, so the pop-ups degrade to slightly
    late rather than to absent.
*/

const URGENT = new Set<string>(["critical", "action_required", "security"]);
const MAX_VISIBLE = 3;
const TTL_URGENT_MS = 15_000;
const TTL_MS = 8_000;
const POLL_MS = 45_000;

const KIND_LABEL: Record<string, string> = {
  critical: "Critical",
  action_required: "Action required",
  mention: "Mention",
  approval: "Approval",
  deadline: "Deadline",
  information: "Update",
  help_request: "Help request",
  security: "Security",
};

function isLiveRing(n: Notification) {
  return n.entity_type === "live_room" && /[?&]invite=/.test(n.link || "");
}

export function NotificationToaster() {
  const { profile } = useSession();
  const router = useRouter();
  const [items, setItems] = React.useState<Notification[]>([]);
  const quietRef = React.useRef(false);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const seen = React.useRef(new Set<string>());
  const sinceRef = React.useRef(new Date().toISOString());

  const dismiss = React.useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((s) => s.filter((i) => i.id !== id));
  }, []);

  const show = React.useCallback(
    (n: Notification) => {
      if (seen.current.has(n.id)) return;
      seen.current.add(n.id);
      if (isLiveRing(n)) return;
      if (quietRef.current && !URGENT.has(n.kind)) return;
      setItems((s) => {
        const next = [...s.filter((i) => i.id !== n.id), n];
        // Drop the oldest beyond the cap, and stop their timers so a late tick cannot touch state for nothing.
        const dropped = next.slice(0, Math.max(0, next.length - MAX_VISIBLE));
        for (const d of dropped) {
          const t = timers.current.get(d.id);
          if (t) clearTimeout(t);
          timers.current.delete(d.id);
        }
        return next.slice(-MAX_VISIBLE);
      });
      timers.current.set(n.id, setTimeout(() => dismiss(n.id), URGENT.has(n.kind) ? TTL_URGENT_MS : TTL_MS));
    },
    [dismiss],
  );

  // Quiet = DND until, quiet hours, or a presence that says "not now". Same rule as ActivityProvider.
  React.useEffect(() => {
    let alive = true;
    const check = async () => {
      const { data } = await createClient().from("notification_prefs").select("dnd_until,quiet_start,quiet_end").eq("user_id", profile.id).maybeSingle();
      if (!alive) return;
      const now = new Date();
      const dnd = !!data?.dnd_until && Date.parse(data.dnd_until) > now.getTime();
      let inQuiet = false;
      if (data?.quiet_start && data?.quiet_end) {
        const [sh, sm] = String(data.quiet_start).split(":").map(Number);
        const [eh, em] = String(data.quiet_end).split(":").map(Number);
        const cur = now.getHours() * 60 + now.getMinutes();
        const start = sh * 60 + sm;
        const end = eh * 60 + em;
        inQuiet = start <= end ? cur >= start && cur < end : cur >= start || cur < end;
      }
      quietRef.current = dnd || inQuiet || profile.presence === "dnd" || profile.presence === "focus";
    };
    const t = setTimeout(check, 0);
    const id = setInterval(check, 5 * 60_000);
    return () => { alive = false; clearTimeout(t); clearInterval(id); };
  }, [profile.id, profile.presence]);

  // Live feed, with a poll that only runs while the socket is not delivering.
  React.useEffect(() => {
    const supabase = createClient();
    let live = false;
    let cancelled = false;
    const ch = supabase
      .channel(`notification-pops-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, (payload) => {
        const n = payload.new as Notification;
        if (n?.id) show(n);
      });
    // RLS on realtime is evaluated with the token present when the channel joins — subscribe with it.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      ch.subscribe((status) => { live = status === "SUBSCRIBED"; });
    });
    const poll = async () => {
      if (live || document.visibilityState === "hidden") return;
      const since = sinceRef.current;
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile.id)
        .is("read_at", null)
        .gt("created_at", since)
        .order("created_at", { ascending: true })
        .limit(MAX_VISIBLE);
      if (cancelled || !data?.length) return;
      sinceRef.current = data[data.length - 1].created_at;
      for (const n of data) show(n);
    };
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      supabase.removeChannel(ch);
    };
  }, [profile.id, show]);

  // Nothing survives unmount — clear every timer so none fires into a dead component.
  React.useEffect(() => {
    const map = timers.current;
    return () => { for (const t of map.values()) clearTimeout(t); map.clear(); };
  }, []);

  async function open(n: Notification) {
    dismiss(n.id);
    if (!n.read_at) {
      await createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      announceNotificationsChanged();
    }
    if (n.link) router.push(n.link);
  }

  if (items.length === 0) return null;

  return (
    <div
      className="fixed z-[150] left-3 right-3 sm:left-auto sm:w-[360px] flex flex-col gap-2 pointer-events-none"
      style={{ top: "calc(var(--topbar-h) + 8px)" }}
      aria-live="polite"
      aria-relevant="additions"
    >
      {items.map((n) => {
        const urgent = URGENT.has(n.kind);
        return (
          <div
            key={n.id}
            role="status"
            className={cn(
              "anim-pop card pointer-events-auto flex gap-3 px-3.5 py-3 border",
              urgent ? "border-[var(--danger)]" : "border-[var(--line-strong)]",
            )}
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <span className="mt-0.5 shrink-0">{KIND_ICON[n.kind]}</span>
            <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
              <span className="block text-[11px] uppercase tracking-wide text-muted leading-tight">{KIND_LABEL[n.kind] || "Notification"}</span>
              <span className="block text-sm font-medium leading-snug mt-0.5">{n.title}</span>
              {n.body && <span className="block text-xs text-muted truncate-2 mt-0.5">{n.body}</span>}
              {n.link && <span className="block text-[11px] text-[var(--brand-2)] mt-1">Open</span>}
            </button>
            <button type="button" onClick={() => dismiss(n.id)} className="btn btn-ghost btn-sm btn-icon shrink-0 -mr-1 -mt-1" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
