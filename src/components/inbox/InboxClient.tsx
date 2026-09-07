"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, CheckCheck, AlertOctagon, Zap, CheckSquare, AtSign, Clock, Info, Sparkles, AlertTriangle } from "lucide-react";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { KIND_ICON } from "@/components/shell/NotificationsPanel";
import { PersonChip, PriorityPill, StatusPill } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { ago, cn, fmtDate, relDate, type Notification, type Task } from "@/lib/utils";

type Kind = Notification["kind"];
type DueTask = Pick<Task, "id" | "title" | "status" | "priority" | "due_date" | "project_id" | "assignee_id" | "waiting_on" | "waiting_on_user_id">;

const SECTIONS: { key: Kind; title: string; hint: string; icon: React.ReactNode; tone: string }[] = [
  { key: "critical", title: "Critical", hint: "Needs you now", icon: <AlertOctagon size={14} />, tone: "text-danger" },
  { key: "action_required", title: "Action required", hint: "Assigned, reassigned, blocked or waiting on you", icon: <Zap size={14} />, tone: "text-warn" },
  { key: "approval", title: "Approvals", hint: "Requests for your decision and outcomes of yours", icon: <CheckSquare size={14} />, tone: "text-violet" },
  { key: "mention", title: "Mentions", hint: "Where you were named", icon: <AtSign size={14} />, tone: "text-info" },
  { key: "deadline", title: "Deadlines", hint: "Overdue and due within 48 hours", icon: <Clock size={14} />, tone: "text-orange" },
  { key: "information", title: "Information", hint: "Updates you should know about", icon: <Info size={14} />, tone: "text-muted" },
];

/** A row in the inbox: either a single notification or a collapsed group of repetitive ones. */
type Row = { key: string; items: Notification[]; latest: Notification; unread: boolean; collapsedTitle?: string };

function entityLabel(title: string) {
  const i = title.indexOf(": ");
  return i > 0 ? title.slice(i + 2) : title;
}

export function InboxClient({ initial, dueTasks }: { initial: Notification[]; dueTasks: DueTask[] }) {
  const { profile, people } = useSession();
  const router = useRouter();
  const [items, setItems] = React.useState<Notification[]>(initial);
  const [onlyUnread, setOnlyUnread] = React.useState(false);
  const [now] = React.useState(() => Date.now());

  // Live updates on my notifications.
  React.useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`inbox-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, (payload) => {
        const n = payload.new as Notification;
        setItems((s) => (s.some((x) => x.id === n.id) ? s : [n, ...s]));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, (payload) => {
        const n = payload.new as Notification;
        setItems((s) => s.map((x) => (x.id === n.id ? n : x)));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile.id]);

  const visible = onlyUnread ? items.filter((i) => !i.read_at) : items;

  const rows = React.useMemo(() => {
    const byKind = new Map<Kind, Row[]>();
    for (const s of SECTIONS) byKind.set(s.key, []);
    const groups = new Map<string, Notification[]>();
    for (const n of visible) {
      // Collapse repetitive information from the same actor about the same entity.
      const collapsible = n.kind === "information" && n.actor_id && n.entity_id;
      const key = collapsible ? `${n.kind}|${n.actor_id}|${n.entity_type}|${n.entity_id}` : n.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    }
    for (const [key, list] of groups) {
      const latest = list[0]!;
      const row: Row = { key, items: list, latest, unread: list.some((x) => !x.read_at) };
      if (list.length > 1) {
        const actor = people.find((p) => p.id === latest.actor_id)?.full_name.split(" ")[0] || "Someone";
        row.collapsedTitle = `${actor} updated '${entityLabel(latest.title)}' ${list.length} times`;
      }
      byKind.get(latest.kind)?.push(row);
    }
    return byKind;
  }, [visible, people]);

  const unreadCount = (k: Kind) => items.filter((i) => i.kind === k && !i.read_at).length;
  const totalUnread = items.filter((i) => !i.read_at).length;
  const overdue = dueTasks.filter((t) => t.due_date && Date.parse(t.due_date) < now);
  const dueSoon = dueTasks.filter((t) => t.due_date && Date.parse(t.due_date) >= now);

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    const at = new Date().toISOString();
    setItems((s) => s.map((x) => (ids.includes(x.id) ? { ...x, read_at: x.read_at || at } : x)));
    await createClient().from("notifications").update({ read_at: at }).in("id", ids).is("read_at", null);
    router.refresh();
  }
  async function markAll() {
    const at = new Date().toISOString();
    setItems((s) => s.map((x) => ({ ...x, read_at: x.read_at || at })));
    await createClient().from("notifications").update({ read_at: at }).eq("user_id", profile.id).is("read_at", null);
    router.refresh();
  }
  async function open(row: Row) {
    await markRead(row.items.filter((x) => !x.read_at).map((x) => x.id));
    if (row.latest.link) router.push(row.latest.link);
  }

  const focus = [
    { label: "Critical", n: unreadCount("critical"), tone: "text-danger" },
    { label: "Action", n: unreadCount("action_required"), tone: "text-warn" },
    { label: "Approvals", n: unreadCount("approval"), tone: "text-violet" },
    { label: "Mentions", n: unreadCount("mention"), tone: "text-info" },
    { label: "Overdue", n: overdue.length, tone: "text-danger" },
    { label: "Due 48h", n: dueSoon.length, tone: "text-orange" },
  ];

  const nothing = totalUnread === 0 && visible.length === 0 && dueTasks.length === 0;

  return (
    <div className="page page-narrow">
      <PageHeader
        eyebrow="GHL ONE Inbox"
        title="Inbox"
        subtitle={totalUnread ? `${totalUnread} unread — ranked by what matters most.` : "You're up to date."}
        actions={
          <>
            <Button size="sm" variant={onlyUnread ? "primary" : "secondary"} onClick={() => setOnlyUnread((s) => !s)}>{onlyUnread ? "Unread" : "All"}</Button>
            <Button size="sm" variant="secondary" onClick={markAll} disabled={!totalUnread}><CheckCheck size={14} /> Mark all read</Button>
          </>
        }
      />

      {/* Today's focus */}
      <Card className="px-[var(--s4)] py-[var(--s3)] mb-[var(--s3)]">
        <div className="flex items-center gap-2 mb-2"><Sparkles size={14} className="text-[var(--accent)]" /><span className="eyebrow">Today&apos;s focus</span></div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {focus.map((f) => (
            <div key={f.label} className="min-w-0">
              <div className={cn("text-[1.25rem] font-semibold num leading-tight", f.n ? f.tone : "text-muted")}>{f.n}</div>
              <div className="text-[11px] text-muted truncate">{f.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {nothing && (
        <Card>
          <EmptyState icon={<Inbox size={18} />} title="Inbox zero" hint="Assignments, approvals, mentions and deadlines will land here, ranked by urgency." />
        </Card>
      )}

      <div className="space-y-[var(--s3)]">
        {SECTIONS.map((s) => {
          const list = rows.get(s.key) || [];
          const isDeadline = s.key === "deadline";
          const taskRows = isDeadline ? dueTasks : [];
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
                {list.map((r) => (
                  <button key={r.key} onClick={() => open(r)} className={cn("w-full text-left flex items-start gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] row-hover", r.unread && "bg-[color-mix(in_oklab,var(--brand)_6%,transparent)]")}>
                    <span className="mt-0.5 shrink-0">{KIND_ICON[r.latest.kind]}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm leading-snug", r.unread && "font-medium")}>{r.collapsedTitle || r.latest.title}</span>
                      {!r.collapsedTitle && r.latest.body && <span className="block text-xs text-muted truncate-2 mt-0.5">{r.latest.body}</span>}
                      <span className="flex items-center gap-2 mt-1 text-[11px] text-muted">
                        {r.latest.actor_id && <PersonChip id={r.latest.actor_id} size={14} />}
                        <span className="num" title={fmtDate(r.latest.created_at, true)}>{ago(r.latest.created_at)}</span>
                        {r.items.length > 1 && <span className="pill tone-neutral">{r.items.length}</span>}
                      </span>
                    </span>
                    {r.unread && <span className="w-2 h-2 rounded-full bg-[var(--brand-2)] mt-2 shrink-0" />}
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
