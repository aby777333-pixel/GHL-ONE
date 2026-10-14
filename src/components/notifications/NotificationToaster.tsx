"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlarmClock, Reply, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { KIND_ICON, announceNotificationsChanged } from "@/components/shell/NotificationsPanel";
import { Avatar } from "@/components/ui";
import { ago, cn, type Notification } from "@/lib/utils";
import { isLiveRing, isMessageNotification, isSnoozed, notifLabel, notifMeta, notifPriority, soundFor, PRIORITY_LABEL, PRIORITY_TONE, type NotifPriority } from "@/lib/notifications/classify";
import { isSoundReady, playNotificationSound, unlockAudio } from "@/lib/notifications/sound";
import { anotherTabActive, claimOnce, gcClaims, startVisibilityHeartbeat, thisTabActive } from "@/lib/notifications/leader";
import { showDesktopNotification, OPEN_LINK_EVENT } from "@/lib/notifications/desktop";
import { isQuietNow, useNotificationPrefs } from "@/lib/notifications/prefs";

/*
  A notification arriving while you are in the app shows up as a pop-up — with a sound, and with
  a desktop notification when no tab of GHL ONE is on screen — not just as a number on the bell.

  Everything that happens already lands in `notifications` (triggers do that; since 0075 that
  includes every channel message), and push reaches a phone that is away. This is the case in
  between: the person is somewhere in GHL ONE and something arrived.

  Rules:
  - At most three on screen, newest at the bottom; the oldest is dropped to make room.
  - Critical stays until dismissed. Urgent 20 s, important 12 s, everything else 8 s.
  - Quiet hours, Do-not-disturb and `dnd`/`focus` presence silence ordinary ones. Urgent and
    critical still show: DND is for chatter, not for "the building is on fire".
  - A message for the conversation you are looking at, in the tab you are looking at, is not
    popped: the conversation itself shows it and marks it read.
  - One sound and one desktop notification per event across every open tab (`claimOnce`), and
    no desktop notification while any GHL ONE tab is on screen. Push (sw.js) uses the same
    `tag`, so a phone and a desktop with both enabled show one card, not two.
  - A burst folded into one row by the database (meta.count grows) re-pops the same card with the
    new count; it does not stack.
  - A Live ring is NOT popped here — the LiveProvider shows the incoming-call card for it.
  - Realtime is a WebSocket and some networks block it. While the channel is not SUBSCRIBED a 45 s
    poll takes over, and coming back online or into focus fetches what was missed.
*/

const MAX_VISIBLE = 3;
const POLL_MS = 45_000;
const TTL: Record<NotifPriority, number> = { normal: 8_000, important: 12_000, urgent: 20_000, critical: 0 };

type Toast = { n: Notification; replyOpen?: boolean };

export function NotificationToaster() {
  const { profile, people } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { prefs } = useNotificationPrefs(profile.id);
  const [items, setItems] = React.useState<Toast[]>([]);
  const [soundHint, setSoundHint] = React.useState(false);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // id → the event stamp last handled (created_at, or meta.bumped_at for a batched row)
  const handled = React.useRef(new Map<string, string>());
  const sinceRef = React.useRef(new Date().toISOString());
  const prefsRef = React.useRef(prefs);
  const pathRef = React.useRef(pathname);
  const presenceRef = React.useRef(profile.presence);
  React.useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  React.useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  React.useEffect(() => {
    presenceRef.current = profile.presence;
  }, [profile.presence]);

  const dismiss = React.useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((s) => s.filter((i) => i.n.id !== id));
  }, []);

  const arm = React.useCallback(
    (n: Notification) => {
      const t = timers.current.get(n.id);
      if (t) clearTimeout(t);
      const ttl = TTL[notifPriority(n)];
      if (ttl > 0) timers.current.set(n.id, setTimeout(() => dismiss(n.id), ttl));
    },
    [dismiss],
  );

  const show = React.useCallback(
    (n: Notification) => {
      setItems((s) => {
        const next = [...s.filter((i) => i.n.id !== n.id), { n }];
        const dropped = next.slice(0, Math.max(0, next.length - MAX_VISIBLE));
        for (const d of dropped) {
          const t = timers.current.get(d.n.id);
          if (t) clearTimeout(t);
          timers.current.delete(d.n.id);
        }
        return next.slice(-MAX_VISIBLE);
      });
      arm(n);
    },
    [arm],
  );

  /** Decide what a new or re-bumped notification earns: pop-up, sound, desktop card. */
  const handle = React.useCallback(
    (n: Notification, source: "live" | "bump" | "catchup") => {
      if (!n?.id || n.read_at) return;
      const meta = notifMeta(n);
      const stamp = source === "bump" ? meta.bumped_at || n.created_at : n.created_at;
      if (handled.current.get(n.id) === stamp) return;
      handled.current.set(n.id, stamp);
      if (isLiveRing(n) || isSnoozed(n)) return;

      const p = prefsRef.current;
      const priority = notifPriority(n);
      const loud = priority === "urgent" || priority === "critical";
      if (!loud && isQuietNow(p, presenceRef.current)) return;

      // Looking at that very conversation, in this tab: the conversation shows it.
      if (isMessageNotification(n) && meta.channel_id && pathRef.current === `/chat/${meta.channel_id}` && thisTabActive()) return;

      show(n);

      const quietSound = source === "catchup";
      void claimOnce(`${n.id}:${stamp}`, async () => {
        if (p.sound && !quietSound) {
          const ok = playNotificationSound(soundFor(n), p.sound_volume);
          if (!ok && !isSoundReady()) setSoundHint(true);
        }
        if (p.desktop && !thisTabActive() && !anotherTabActive()) {
          const preview = p.previews && !p.shared_device;
          await showDesktopNotification({
            title: p.shared_device ? "GHL ONE" : n.title,
            body: preview ? n.body : p.shared_device ? "You have a new notification" : undefined,
            tag: meta.channel_id ? `chat:${meta.channel_id}` : `notif:${n.id}`,
            link: n.link,
            kind: n.kind,
            requireInteraction: loud,
            renotify: source === "bump" || loud,
            silent: !p.sound,
          });
        }
      });
    },
    [show],
  );

  // Session-long plumbing: audio unlock on first gesture, the "who is looking" heartbeat, key GC.
  React.useEffect(() => {
    const stopAudio = unlockAudio();
    const stopBeat = startVisibilityHeartbeat();
    gcClaims();
    const onOpen = (e: Event) => {
      const link = (e as CustomEvent<{ link?: string }>).detail?.link;
      if (link) router.push(link);
    };
    window.addEventListener(OPEN_LINK_EVENT, onOpen);
    return () => {
      stopAudio();
      stopBeat();
      window.removeEventListener(OPEN_LINK_EVENT, onOpen);
    };
  }, [router]);

  // Live feed, with a poll that only runs while the socket is not delivering, and a catch-up
  // when the tab comes back (reconnects do not replay what was missed).
  React.useEffect(() => {
    const supabase = createClient();
    let live = false;
    let cancelled = false;
    const ch = supabase
      .channel(`notification-pops-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, (payload) => {
        handle(payload.new as Notification, "live");
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, (payload) => {
        const n = payload.new as Notification;
        if (!n?.id) return;
        if (n.read_at) {
          dismiss(n.id);
          return;
        }
        const bumped = notifMeta(n).bumped_at;
        if (bumped && Date.now() - Date.parse(bumped) < 30_000) handle(n, "bump");
      });
    // RLS on realtime is evaluated with the token present when the channel joins — subscribe with it.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      ch.subscribe((status) => {
        live = status === "SUBSCRIBED";
      });
    });
    const fetchMissed = async (quiet: boolean) => {
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
      for (const n of data) handle(n, quiet ? "catchup" : "live");
    };
    const poll = () => {
      if (live || document.visibilityState === "hidden") return;
      void fetchMissed(false);
    };
    const catchUp = () => void fetchMissed(true);
    const id = setInterval(poll, POLL_MS);
    window.addEventListener("online", catchUp);
    window.addEventListener("focus", catchUp);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("online", catchUp);
      window.removeEventListener("focus", catchUp);
      supabase.removeChannel(ch);
    };
  }, [profile.id, handle, dismiss]);

  // A snoozed notification comes back when its time is up.
  React.useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const check = async () => {
      const now = Date.now();
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile.id)
        .is("read_at", null)
        .lte("snoozed_until", new Date(now).toISOString())
        .gte("snoozed_until", new Date(now - 90_000).toISOString())
        .limit(MAX_VISIBLE);
      if (cancelled || !data?.length) return;
      for (const n of data) {
        handled.current.delete(n.id);
        handle({ ...n, snoozed_until: null }, "live");
      }
    };
    const id = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [profile.id, handle]);

  // Escape dismisses the newest card. Nothing survives unmount.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setItems((s) => {
        const last = s[s.length - 1];
        if (!last || last.replyOpen) return s;
        const t = timers.current.get(last.n.id);
        if (t) clearTimeout(t);
        timers.current.delete(last.n.id);
        return s.slice(0, -1);
      });
    };
    document.addEventListener("keydown", onKey);
    const map = timers.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  async function markRead(n: Notification) {
    if (n.read_at) return;
    await createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    announceNotificationsChanged();
  }
  async function open(n: Notification) {
    dismiss(n.id);
    await markRead(n);
    if (n.link) router.push(n.link);
  }
  async function snooze(n: Notification, minutes: number) {
    dismiss(n.id);
    const until = new Date(new Date().getTime() + minutes * 60_000).toISOString();
    await createClient().from("notifications").update({ snoozed_until: until }).eq("id", n.id);
    announceNotificationsChanged();
  }
  function toggleReply(id: string) {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((s) => s.map((i) => (i.n.id === id ? { ...i, replyOpen: !i.replyOpen } : i)));
  }
  async function reply(n: Notification, body: string): Promise<boolean> {
    const meta = notifMeta(n);
    if (!meta.channel_id || !body.trim()) return false;
    const { data, error } = await createClient()
      .from("messages")
      .insert({ channel_id: meta.channel_id, author_id: profile.id, body: body.trim(), kind: "text", parent_id: meta.parent_id || null })
      .select("id")
      .single();
    if (error || !data) return false;
    // Replying means you read it; the database stamps the channel read and clears its notifications.
    await createClient().rpc("mark_channel_read", { c: meta.channel_id });
    announceNotificationsChanged();
    dismiss(n.id);
    return true;
  }

  if (items.length === 0) return null;

  return (
    <div
      className="fixed z-[150] left-3 right-3 sm:left-auto sm:w-[380px] flex flex-col gap-2 pointer-events-none"
      style={{ top: "calc(var(--topbar-h) + 8px)" }}
      aria-live="polite"
      aria-relevant="additions"
    >
      {items.map(({ n, replyOpen }) => (
        <ToastCard
          key={n.id}
          n={n}
          replyOpen={!!replyOpen}
          previews={prefs.previews && !prefs.shared_device}
          actorName={people.find((p) => p.id === n.actor_id)?.full_name || notifMeta(n).sender_name || null}
          actorAvatar={people.find((p) => p.id === n.actor_id)?.avatar_url || null}
          soundHint={soundHint && prefs.sound && !isSoundReady()}
          onOpen={() => open(n)}
          onDismiss={() => dismiss(n.id)}
          onSnooze={(m) => snooze(n, m)}
          onToggleReply={() => toggleReply(n.id)}
          onReply={(body) => reply(n, body)}
        />
      ))}
    </div>
  );
}

function ToastCard({
  n,
  replyOpen,
  previews,
  actorName,
  actorAvatar,
  soundHint,
  onOpen,
  onDismiss,
  onSnooze,
  onToggleReply,
  onReply,
}: {
  n: Notification;
  replyOpen: boolean;
  previews: boolean;
  actorName: string | null;
  actorAvatar: string | null;
  soundHint: boolean;
  onOpen: () => void;
  onDismiss: () => void;
  onSnooze: (minutes: number) => void;
  onToggleReply: () => void;
  onReply: (body: string) => Promise<boolean>;
}) {
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const priority = notifPriority(n);
  const loud = priority === "urgent" || priority === "critical";
  const meta = notifMeta(n);
  const message = isMessageNotification(n);
  const canReply = message && !!meta.channel_id && !meta.escalation;
  const label = notifLabel(n);
  const count = meta.count && meta.count > 1 ? meta.count : 0;

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    setFailed(false);
    const ok = await onReply(text);
    setSending(false);
    if (!ok) setFailed(true);
  }

  return (
    <div
      role={loud ? "alert" : "status"}
      className={cn(
        "anim-pop card pointer-events-auto border overflow-hidden",
        priority === "critical" ? "border-[var(--danger)] ring-1 ring-[var(--danger)]" : priority === "urgent" ? "border-[var(--warn)]" : priority === "important" ? "border-[var(--brand-2)]" : "border-[var(--line-strong)]",
      )}
      style={{ boxShadow: "var(--shadow-lg)" }}
    >
      <div className="flex gap-3 px-3.5 pt-3 pb-2.5">
        <span className="mt-0.5 shrink-0">
          {message && (actorName || actorAvatar) ? <Avatar name={actorName} src={actorAvatar} size={34} /> : <span className="w-[34px] h-[34px] rounded-full flex items-center justify-center bg-[var(--neutral-bg)]">{KIND_ICON[n.kind]}</span>}
        </span>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left" title={n.link ? "Open" : undefined}>
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] uppercase tracking-wide text-muted leading-tight truncate">{label}</span>
            {priority !== "normal" && <span className={cn("pill", PRIORITY_TONE[priority])}>{PRIORITY_LABEL[priority]}</span>}
            {count > 0 && <span className="pill tone-neutral">{count}</span>}
            <span className="ml-auto text-[10px] text-muted num shrink-0">{ago(n.created_at).replace(" ago", "")}</span>
          </span>
          <span className="block text-sm font-medium leading-snug mt-0.5">{n.title}</span>
          {n.body && previews && <span className="block text-xs text-muted truncate-2 mt-0.5">{n.body}</span>}
          {n.body && !previews && <span className="block text-xs text-muted mt-0.5 italic">Preview hidden</span>}
        </button>
        <button type="button" onClick={onDismiss} className="btn btn-ghost btn-sm btn-icon shrink-0 -mr-1 -mt-1" aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
      <div className="flex items-center gap-1 px-2.5 pb-2 -mt-1">
        {n.link && (
          <button type="button" onClick={onOpen} className="btn btn-ghost btn-xs">
            Open
          </button>
        )}
        {canReply && (
          <button type="button" onClick={onToggleReply} className="btn btn-ghost btn-xs" aria-expanded={replyOpen}>
            <Reply size={12} /> Reply
          </button>
        )}
        <button type="button" onClick={() => onSnooze(60)} className="btn btn-ghost btn-xs" title="Remind me in an hour">
          <AlarmClock size={12} /> Later
        </button>
        {soundHint && <span className="ml-auto text-[10px] text-muted pr-1">Click anywhere to enable sounds</span>}
      </div>
      {replyOpen && (
        <form
          className="flex items-end gap-1.5 px-2.5 pb-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={meta.channel_type === "dm" ? "Reply…" : `Reply in #${meta.channel_name || "channel"}…`}
            className="textarea !min-h-[36px] text-sm flex-1"
            aria-label="Quick reply"
          />
          <button type="submit" className="btn btn-primary btn-sm btn-icon shrink-0" disabled={sending || !text.trim()} aria-label="Send reply">
            <Send size={14} />
          </button>
          {failed && <span className="text-[10px] text-danger">Could not send</span>}
        </form>
      )}
    </div>
  );
}
