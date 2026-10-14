"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, MailOpen, Inbox, CheckCheck, AlertOctagon, Zap, CheckSquare, AtSign, Clock, Info, Sparkles, AlertTriangle, ArrowRightLeft, MessageSquare, AlarmClock } from "lucide-react";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { KIND_ICON, announceNotificationsChanged } from "@/components/shell/NotificationsPanel";
import { PersonChip, PriorityPill, StatusPill } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { ago, cn, fmtDate, relDate, type Notification, type Task } from "@/lib/utils";
import { InboxDigest } from "@/components/ai/InboxDigest";
import { FILTERS, isMessageNotification, isSnoozed, matchesFilter, notifLabel, notifMeta, notifPriority, PRIORITY_LABEL, PRIORITY_TONE, type NotifFilter } from "@/lib/notifications/classify";

type Kind = Notification["kind"];
type DueTask = Pick<Task, "id" | "title" | "status" | "priority" | "due_date" | "project_id" | "assignee_id" | "waiting_on" | "waiting_on_user_id">;

/*
  Sections are ranked by urgency. "Messages" (0075) is new: every chat notification — direct
  messages, group messages, replies, acknowledgement reminders — lives there, grouped by
  conversation, instead of being scattered through Information. A mention stays under Mentions.
*/
type SectionKey = Kind | "message";
const SECTIONS: { key: SectionKey; title: string; hint: string; icon: React.ReactNode; tone: string }[] = [
  { key: "critical", title: "Critical", hint: "Needs you now", icon: <AlertOctagon size={14} />, tone: "text-danger" },
  { key: "action_required", title: "Action required", hint: "Assigned, reassigned, blocked, waiting on you, or asking for your acknowledgement", icon: <Zap size={14} />, tone: "text-warn" },
  { key: "approval", title: "Approvals", hint: "Requests for your decision and outcomes of yours", icon: <CheckSquare size={14} />, tone: "text-violet" },
  { key: "mention", title: "Mentions", hint: "Where you were named", icon: <AtSign size={14} />, tone: "text-info" },
  { key: "message", title: "Messages", hint: "Direct messages and group conversations", icon: <MessageSquare size={14} />, tone: "text-brand" },
  { key: "deadline", title: "Deadlines", hint: "Overdue and due within 48 hours", icon: <Clock size={14} />, tone: "text-orange" },
  { key: "information", title: "Information", hint: "Updates you should know about", icon: <Info size={14} />, tone: "text-muted" },
];

function sectionOf(n: Notification): SectionKey {
  if (n.kind === "information" && isMessageNotification(n)) return "message";
  if (n.kind === "security" || n.kind === "help_request") return "information";
  return n.kind;
}

/** A row in the inbox: either a single notification or a collapsed group of repetitive ones. */
type Row = { key: string; items: Notification[]; latest: Notification; unread: boolean; collapsedTitle?: string };

function entityLabel(title: string) {
  const i = title.indexOf(": ");
  return i > 0 ? title.slice(i + 2) : title;
}

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

export function InboxClient({ initial, dueTasks, cancelledMeetingIds = [] }: { initial: Notification[]; dueTasks: DueTask[]; cancelledMeetingIds?: string[] }) {
  const { profile, people } = useSession();
  const router = useRouter();
  const [items, setItems] = React.useState<Notification[]>(initial);
  /* Inbox holds what you have not read; once read, a notification moves to Archive, where it can be
     opened again or marked unread to bring it back. Snoozed items sit in Archive until their time. */
  const [view, setView] = React.useState<"inbox" | "archive">("inbox");
  const [filter, setFilter] = React.useState<NotifFilter>("all");
  const [snoozeFor, setSnoozeFor] = React.useState<string | null>(null);
  const archive = view === "archive";
  const [now, setNow] = React.useState(() => Date.now());
  const cancelledMeetings = React.useMemo(() => new Set(cancelledMeetingIds), [cancelledMeetingIds]);

  // Live updates on my notifications.
  React.useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const ch = supabase
      .channel(`inbox-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, (payload) => {
        const n = payload.new as Notification;
        setItems((s) => (s.some((x) => x.id === n.id) ? s : [n, ...s]));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, (payload) => {
        const n = payload.new as Notification;
        setItems((s) => s.map((x) => (x.id === n.id ? n : x)));
      });
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      ch.subscribe();
    });
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      cancelled = true;
      clearInterval(tick);
      supabase.removeChannel(ch);
    };
  }, [profile.id]);

  const unreadLive = (i: Notification) => !i.read_at && !isSnoozed(i, now);
  const visible = (archive ? items.filter((i) => !unreadLive(i)) : items.filter(unreadLive)).filter((i) => filter === "all" || filter === "unread" || matchesFilter(i, filter, now));
  const archivedCount = items.filter((i) => !unreadLive(i)).length;

  const rows = React.useMemo(() => {
    const byKind = new Map<SectionKey, Row[]>();
    for (const s of SECTIONS) byKind.set(s.key, []);
    const groups = new Map<string, Notification[]>();
    for (const n of visible) {
      // Collapse repetitive information from the same actor about the same entity, and chat
      // notifications of one conversation into one row.
      const meta = notifMeta(n);
      const chat = isMessageNotification(n) && meta.channel_id && !meta.reminder && !meta.ack_request && !meta.escalation;
      const collapsible = n.kind === "information" && n.actor_id && n.entity_id;
      const key = chat ? `chat|${meta.channel_id}|${n.kind}` : collapsible ? `${n.kind}|${n.actor_id}|${n.entity_type}|${n.entity_id}` : n.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    }
    for (const [key, list] of groups) {
      const latest = list[0]!;
      const row: Row = { key, items: list, latest, unread: list.some(unreadLive) };
      if (list.length > 1) {
        const meta = notifMeta(latest);
        if (isMessageNotification(latest) && meta.channel_id) {
          const total = list.reduce((a, x) => a + (notifMeta(x).count || 1), 0);
          row.collapsedTitle = meta.channel_type === "dm" ? `${total} new messages from ${meta.sender_name || people.find((p) => p.id === latest.actor_id)?.full_name || "someone"}` : `${total} new messages in #${meta.channel_name || "channel"}`;
        } else {
          const actor = people.find((p) => p.id === latest.actor_id)?.full_name.split(" ")[0] || "Someone";
          row.collapsedTitle = `${actor} updated '${entityLabel(latest.title)}' ${list.length} times`;
        }
      }
      byKind.get(sectionOf(latest))?.push(row);
    }
    return byKind;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, people, now]);

  const unreadCount = (k: SectionKey) => items.filter((i) => sectionOf(i) === k && unreadLive(i)).length;
  const totalUnread = items.filter(unreadLive).length;
  const filterCount = (f: NotifFilter) => items.filter((i) => unreadLive(i) && matchesFilter(i, f, now)).length;
  const overdue = dueTasks.filter((t) => t.due_date && Date.parse(t.due_date) < now);
  const dueSoon = dueTasks.filter((t) => t.due_date && Date.parse(t.due_date) >= now);

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    const at = new Date().toISOString();
    setItems((s) => s.map((x) => (ids.includes(x.id) ? { ...x, read_at: x.read_at || at } : x)));
    await createClient().from("notifications").update({ read_at: at }).in("id", ids).is("read_at", null);
    announceNotificationsChanged();
    router.refresh();
  }
  async function markAll() {
    const at = new Date().toISOString();
    setItems((s) => s.map((x) => ({ ...x, read_at: x.read_at || at })));
    await createClient().from("notifications").update({ read_at: at }).eq("user_id", profile.id).is("read_at", null);
    announceNotificationsChanged();
    router.refresh();
  }
  async function open(row: Row) {
    await markRead(row.items.filter((x) => !x.read_at).map((x) => x.id));
    if (row.latest.link) router.push(row.latest.link);
  }
  async function snooze(row: Row, minutes: number) {
    setSnoozeFor(null);
    const ids = row.items.map((x) => x.id);
    const until = new Date(new Date().getTime() + minutes * 60_000).toISOString();
    setItems((s) => s.map((x) => (ids.includes(x.id) ? { ...x, snoozed_until: until } : x)));
    await createClient().from("notifications").update({ snoozed_until: until }).in("id", ids);
    announceNotificationsChanged();
  }

  const focus = [
    { label: "Critical", n: unreadCount("critical"), tone: "text-danger" },
    { label: "Action", n: unreadCount("action_required"), tone: "text-warn" },
    { label: "Approvals", n: unreadCount("approval"), tone: "text-violet" },
    { label: "Mentions", n: unreadCount("mention"), tone: "text-info" },
    { label: "Messages", n: unreadCount("message"), tone: "text-brand" },
    { label: "Overdue", n: overdue.length, tone: "text-danger" },
    { label: "Due 48h", n: dueSoon.length, tone: "text-orange" },
  ];

  const nothing = archive ? visible.length === 0 : visible.length === 0 && (filter !== "all" || dueTasks.length === 0);

  async function markUnread(row: Row) {
    const ids = row.items.map((x) => x.id);
    const { data, error } = await createClient().from("notifications").update({ read_at: null, snoozed_until: null }).in("id", ids).select("id");
    if (error || !data?.length) return;
    const back = new Set(data.map((d) => d.id));
    setItems((s) => s.map((x) => (back.has(x.id) ? { ...x, read_at: null, snoozed_until: null } : x)));
    announceNotificationsChanged();
    router.refresh();
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        eyebrow="GHL ONE Inbox"
        title="Inbox"
        subtitle={totalUnread ? `${totalUnread} unread — ranked by what matters most.` : "You're up to date."}
        actions={
          <>
            <div className="inline-flex rounded-[var(--radius-sm)] border overflow-hidden" role="group" aria-label="Inbox or archive">
              {(["inbox", "archive"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={cn(
                    "px-2.5 h-8 text-[13px] transition-colors inline-flex items-center gap-1",
                    view === v ? "bg-[var(--brand)] text-white font-medium" : "bg-[var(--bg)] hover:bg-[var(--neutral-bg)]"
                  )}
                >
                  {v === "archive" ? <><Archive size={13} /> Archive</> : "Inbox"}
                  {v === "inbox" && totalUnread > 0 ? <span className="ml-0.5 opacity-80">{totalUnread}</span> : null}
                  {v === "archive" && archivedCount > 0 ? <span className="ml-0.5 opacity-80">{archivedCount}</span> : null}
                </button>
              ))}
            </div>
            <Button size="sm" variant="secondary" onClick={markAll} disabled={!totalUnread}><CheckCheck size={14} /> Mark all read</Button>
          </>
        }
      />

      {/* What kind of thing: the same filters as the bell. */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1 mb-[var(--s3)]" role="tablist" aria-label="Filter notifications">
        {FILTERS.filter((f) => f.key !== "unread").map((f) => {
          const c = f.key === "all" ? 0 : filterCount(f.key);
          const on = filter === f.key;
          return (
            <button key={f.key} type="button" role="tab" aria-selected={on} onClick={() => setFilter(f.key)} className={cn("pill pill-lg border shrink-0 transition-colors", on ? "tone-brand border-transparent" : "tone-neutral border-transparent hover:border-[var(--line-strong)]")}>
              {f.label}
              {c > 0 && <span className="ml-1 opacity-80 num">{c}</span>}
            </button>
          );
        })}
      </div>

      {!archive && filter === "all" && <InboxDigest className="mb-[var(--s3)]" />}

      {/* Today's focus */}
      {!archive && filter === "all" && <Card className="px-[var(--s4)] py-[var(--s3)] mb-[var(--s3)]">
        <div className="flex items-center gap-2 mb-2"><Sparkles size={14} className="text-[var(--accent)]" /><span className="eyebrow">Today&apos;s focus</span></div>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {focus.map((f) => (
            <div key={f.label} className="min-w-0">
              <div className={cn("text-[1.25rem] font-semibold num leading-tight", f.n ? f.tone : "text-muted")}>{f.n}</div>
              <div className="text-[11px] text-muted truncate">{f.label}</div>
            </div>
          ))}
        </div>
      </Card>}

      {nothing && (
        <Card>
          {archive ? (
            <EmptyState icon={<Archive size={18} />} title="Archive is empty" hint="Notifications you have read move here, so the inbox only holds what still needs you." />
          ) : filter !== "all" ? (
            <EmptyState icon={<Inbox size={18} />} title="Nothing here" hint="No unread notifications match this filter." />
          ) : (
            <EmptyState icon={<Inbox size={18} />} title="Inbox zero" hint="Messages, assignments, approvals, mentions and deadlines will land here, ranked by urgency. Read items move to Archive." />
          )}
        </Card>
      )}

      <div className="space-y-[var(--s3)]">
        {SECTIONS.map((s) => {
          const list = rows.get(s.key) || [];
          const isDeadline = s.key === "deadline";
          /*
            Deadlines mixes notifications with due tasks. A task has no read state, so in Archive or
            under a filter it is not listed — Unread means the same thing in every section.
          */
          const taskRows = isDeadline && !archive && filter === "all" ? dueTasks : [];
          if (list.length === 0 && taskRows.length === 0) return null;
          const unreadIds = list.flatMap((r) => r.items.filter((x) => !x.read_at).map((x) => x.id));
          return (
            <Card key={s.key}>
              <div className="flex items-center gap-2 px-[var(--s4)] pt-[var(--s3)] pb-[var(--s2)]">
                <span className={s.tone}>{s.icon}</span>
                <div className="min-w-0">
                  <div className="h3">{s.title}{unreadIds.length > 0 && <span className="ml-2 pill tone-brand">{unreadIds.length}</span>}</div>
                  <div className="text-[11px] text-muted">{s.hint}</div>
                </div>
                {unreadIds.length > 0 && <Button size="xs" variant="ghost" className="ml-auto" onClick={() => markRead(unreadIds)}><CheckCheck size={12} /> Mark read</Button>}
              </div>
              <div className="px-[var(--s2)] pb-[var(--s2)] space-y-0.5">
                {isDeadline && taskRows.map((t) => {
                  const late = t.due_date ? Date.parse(t.due_date) < now : false;
                  return (
                    <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-start gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] row-hover">
                      <span className="mt-0.5 shrink-0">{late ? <AlertTriangle size={15} className="text-danger" /> : <Clock size={15} className="text-orange" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug font-medium">{t.title}</span>
                        <span className="flex items-center gap-1.5 flex-wrap mt-1 text-[11px]">
                          <span className={cn("num", late ? "text-danger font-medium" : "text-orange")}>{late ? "Overdue · " : "Due · "}{relDate(t.due_date)} {fmtDate(t.due_date, true).split(", ")[1]}</span>
                          <StatusPill status={t.status} />
                          <PriorityPill priority={t.priority} iconOnly />
                        </span>
                      </span>
                    </Link>
                  );
                })}
                {list.map((r) => {
                  const priority = notifPriority(r.latest);
                  const snoozed = isSnoozed(r.latest, now);
                  return (
                    <div key={r.key} className={cn("rounded-[var(--radius-sm)] row-hover", r.unread && "bg-[color-mix(in_oklab,var(--brand)_6%,transparent)]")}>
                      <button onClick={() => open(r)} className="w-full text-left flex items-start gap-3 px-2.5 py-2">
                        <span className="mt-0.5 shrink-0">{r.latest.entity_type === "handoff" ? <ArrowRightLeft size={15} className="text-violet" /> : KIND_ICON[r.latest.kind]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted">
                            <span className="truncate">{notifLabel(r.latest)}</span>
                            {priority !== "normal" && <span className={cn("pill", PRIORITY_TONE[priority])}>{PRIORITY_LABEL[priority]}</span>}
                            {snoozed && <span className="pill tone-violet"><AlarmClock size={9} /> Snoozed until {fmtDate(r.latest.snoozed_until, true)}</span>}
                          </span>
                          <span className={cn("block text-sm leading-snug", r.unread && "font-medium")}>{r.collapsedTitle || r.latest.title}</span>
                          {r.latest.body && <span className="block text-xs text-muted truncate-2 mt-0.5">{r.latest.body}</span>}
                          <span className="flex items-center gap-2 mt-1 text-[11px] text-muted">
                            {r.latest.entity_type === "handoff" && <span className="pill tone-violet"><ArrowRightLeft size={10} /> Handoff</span>}
                            {r.latest.entity_type === "meeting" && r.latest.entity_id && cancelledMeetings.has(r.latest.entity_id) && !r.latest.title.startsWith("Meeting cancelled") && <span className="pill tone-danger">Meeting cancelled</span>}
                            {r.latest.actor_id && <PersonChip id={r.latest.actor_id} size={14} />}
                            <span className="num" title={fmtDate(r.latest.created_at, true)}>{ago(r.latest.created_at)}</span>
                            {r.items.length > 1 && <span className="pill tone-neutral">{r.items.length}</span>}
                          </span>
                        </span>
                        {r.unread && <span className="w-2 h-2 rounded-full bg-[var(--brand-2)] mt-2 shrink-0" />}
                      </button>
                      <div className="flex items-center gap-0.5 px-2 pb-1.5 -mt-1">
                        {archive ? (
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => void markUnread(r)} title="Move back to the inbox"><MailOpen size={11} /> Mark unread</button>
                        ) : (
                          <div className="relative">
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSnoozeFor(snoozeFor === r.key ? null : r.key)} aria-expanded={snoozeFor === r.key}><AlarmClock size={11} /> Snooze</button>
                            {snoozeFor === r.key && (
                              <div className="absolute left-0 top-full z-20 card p-1 anim-pop" style={{ boxShadow: "var(--shadow-lg)" }}>
                                {SNOOZE_CHOICES.map((c) => (
                                  <button key={c.label} type="button" className="block w-full text-left text-xs px-2.5 h-8 rounded-[var(--radius-sm)] hover:bg-[var(--neutral-bg)] whitespace-nowrap" onClick={() => void snooze(r, c.minutes())}>
                                    {c.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
