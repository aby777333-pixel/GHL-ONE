"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, AlertOctagon, AtSign, Bell, CheckCheck, CheckSquare, Clock, Info, LifeBuoy, MailOpen, ShieldAlert, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Avatar, Button, EmptyState, Modal } from "@/components/ui";
import { PushOptInPrompt } from "@/components/notifications/PushOptIn";
import { ago, cn, type Notification } from "@/lib/utils";
import { FILTERS, isMessageNotification, isSnoozed, matchesFilter, notifLabel, notifMeta, notifPriority, PRIORITY_LABEL, PRIORITY_TONE, type NotifFilter } from "@/lib/notifications/classify";

export const KIND_ICON: Record<string, React.ReactNode> = {
  critical: <AlertOctagon size={15} className="text-danger" />,
  action_required: <Zap size={15} className="text-warn" />,
  mention: <AtSign size={15} className="text-info" />,
  approval: <CheckSquare size={15} className="text-violet" />,
  deadline: <Clock size={15} className="text-orange" />,
  information: <Info size={15} className="text-muted" />,
  /* `security` and `help_request` are in the notification_kind enum and were missing here, so those
     notifications rendered with an empty icon slot. Authority changes (0052) are all `security`. */
  security: <ShieldAlert size={15} className="text-danger" />,
  help_request: <LifeBuoy size={15} className="text-info" />,
};

/*
  Tell the shell a notification was just marked read, so the bell badge drops at once. The badge otherwise
  waited for a realtime UPDATE event, which did not always arrive — the count stayed "unread" until the
  page was reloaded. Fired by every place in the app that marks notifications read.
*/
export const NOTIFICATIONS_CHANGED = "ghl:notifications-changed";
export function announceNotificationsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

/*
  The bell is the notification centre: every notification, filtered by what it is about (direct
  messages, group messages, mentions, announcements, urgent, approvals, tasks, meetings, calls,
  system), each one linking straight to the conversation, task or approval it concerns. Mark read,
  mark all read, mark unread, snooze — all here, and the list follows realtime while it is open.
*/
const SNOOZE_CHOICES: { label: string; minutes: () => number }[] = [
  { label: "1 hour", minutes: () => 60 },
  { label: "3 hours", minutes: () => 180 },
  {
    label: "Tomorrow 09:00",
    minutes: () => {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      t.setHours(9, 0, 0, 0);
      return Math.max(5, Math.round((t.getTime() - Date.now()) / 60_000));
    },
  },
];

export function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, people } = useSession();
  const router = useRouter();
  const [items, setItems] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [filter, setFilter] = React.useState<NotifFilter>("all");
  const [snoozeFor, setSnoozeFor] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data } = await createClient().from("notifications").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(80);
    setItems(data || []);
    setNow(Date.now());
    setLoading(false);
  }, [profile.id]);

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [open, load]);

  // Follow the feed while the panel is open, so what you are reading does not go stale.
  React.useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    let cancelled = false;
    const ch = supabase
      .channel(`notification-centre-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, (p) => {
        const n = p.new as Notification;
        setItems((s) => (s.some((x) => x.id === n.id) ? s : [n, ...s]));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, (p) => {
        const n = p.new as Notification;
        setItems((s) => s.map((x) => (x.id === n.id ? n : x)));
      });
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      ch.subscribe();
    });
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [open, profile.id]);

  const visible = React.useMemo(() => items.filter((n) => matchesFilter(n, filter, now)), [items, filter, now]);
  const unread = items.filter((i) => !i.read_at && !isSnoozed(i, now)).length;
  const countFor = (f: NotifFilter) => items.filter((n) => !n.read_at && !isSnoozed(n, now) && matchesFilter(n, f, now)).length;

  async function markAll() {
    const at = new Date().toISOString();
    setItems((s) => s.map((x) => ({ ...x, read_at: x.read_at || at })));
    await createClient().from("notifications").update({ read_at: at }).eq("user_id", profile.id).is("read_at", null);
    announceNotificationsChanged();
  }
  async function markRead(n: Notification) {
    if (n.read_at) return;
    const at = new Date().toISOString();
    setItems((s) => s.map((x) => (x.id === n.id ? { ...x, read_at: at } : x)));
    await createClient().from("notifications").update({ read_at: at }).eq("id", n.id);
    announceNotificationsChanged();
  }
  async function markUnread(n: Notification) {
    const { data } = await createClient().from("notifications").update({ read_at: null, snoozed_until: null }).eq("id", n.id).select("id");
    if (!data?.length) return;
    setItems((s) => s.map((x) => (x.id === n.id ? { ...x, read_at: null, snoozed_until: null } : x)));
    announceNotificationsChanged();
  }
  async function snooze(n: Notification, minutes: number) {
    setSnoozeFor(null);
    const until = new Date(new Date().getTime() + minutes * 60_000).toISOString();
    setItems((s) => s.map((x) => (x.id === n.id ? { ...x, snoozed_until: until } : x)));
    await createClient().from("notifications").update({ snoozed_until: until }).eq("id", n.id);
    announceNotificationsChanged();
  }
  async function openItem(n: Notification) {
    await markRead(n);
    onClose();
    if (n.link) router.push(n.link);
  }

  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Bell size={16} /> Notifications</span>} side width={440}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-xs text-muted">{unread} unread</span>
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" onClick={markAll} disabled={!unread}><CheckCheck size={13} /> Mark all read</Button>
          <Button size="xs" variant="ghost" onClick={() => { onClose(); router.push("/inbox"); }}>Open Inbox</Button>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 pb-2 mb-1" role="tablist" aria-label="Filter notifications">
        {FILTERS.map((f) => {
          const c = f.key === "all" ? 0 : countFor(f.key);
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(f.key)}
              className={cn("pill pill-lg border shrink-0 transition-colors", on ? "tone-brand border-transparent" : "tone-neutral border-transparent hover:border-[var(--line-strong)]")}
            >
              {f.label}
              {c > 0 && <span className="ml-1 opacity-80 num">{c}</span>}
            </button>
          );
        })}
      </div>
      <PushOptInPrompt />
      {!loading && visible.length === 0 && (
        <EmptyState icon={<Bell size={18} />} title={filter === "all" ? "You're all caught up" : "Nothing here"} hint={filter === "all" ? "Messages, mentions, approvals, assignments and reminders land here." : "No notifications match this filter."} />
      )}
      <div className="space-y-1">
        {visible.map((n) => {
          const priority = notifPriority(n);
          const meta = notifMeta(n);
          const snoozed = isSnoozed(n, now);
          const actor = people.find((p) => p.id === n.actor_id);
          const msg = isMessageNotification(n);
          return (
            <div key={n.id} className={cn("relative rounded-[var(--radius-sm)] row-hover", !n.read_at && !snoozed && "bg-[color-mix(in_oklab,var(--brand)_7%,transparent)]")}>
              <button onClick={() => openItem(n)} className="w-full text-left flex gap-3 px-2.5 py-2.5">
                <span className="mt-0.5 shrink-0">
                  {msg && actor ? <Avatar name={actor.full_name} src={actor.avatar_url} size={28} /> : KIND_ICON[n.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted">
                    <span className="truncate">{notifLabel(n)}</span>
                    {priority !== "normal" && <span className={cn("pill", PRIORITY_TONE[priority])}>{PRIORITY_LABEL[priority]}</span>}
                    {meta.count && meta.count > 1 ? <span className="pill tone-neutral">{meta.count}</span> : null}
                    {snoozed && <span className="pill tone-violet"><AlarmClock size={9} /> Snoozed</span>}
                  </span>
                  <span className={cn("block text-sm leading-snug", !n.read_at && !snoozed && "font-medium")}>{n.title}</span>
                  {n.body && <span className="block text-xs text-muted truncate-2 mt-0.5">{n.body}</span>}
                  <span className="block text-[11px] text-muted mt-1">{ago(n.created_at)}</span>
                </span>
                {!n.read_at && !snoozed && <span className="w-2 h-2 rounded-full bg-[var(--brand-2)] mt-2 shrink-0" />}
              </button>
              <div className="flex items-center gap-0.5 px-2 pb-1.5 -mt-1">
                {!n.read_at ? (
                  <>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => markRead(n)}><CheckCheck size={11} /> Read</button>
                    <div className="relative">
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSnoozeFor(snoozeFor === n.id ? null : n.id)} aria-expanded={snoozeFor === n.id}><AlarmClock size={11} /> Snooze</button>
                      {snoozeFor === n.id && (
                        <div className="absolute left-0 top-full z-20 card p-1 anim-pop" style={{ boxShadow: "var(--shadow-lg)" }}>
                          {SNOOZE_CHOICES.map((c) => (
                            <button key={c.label} type="button" className="block w-full text-left text-xs px-2.5 h-8 rounded-[var(--radius-sm)] hover:bg-[var(--neutral-bg)] whitespace-nowrap" onClick={() => snooze(n, c.minutes())}>
                              {c.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => markUnread(n)}><MailOpen size={11} /> Mark unread</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
