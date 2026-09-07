"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, Handshake, MessagesSquare, PhoneCall } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader } from "@/components/ui";
import { Blink } from "@/components/providers/ActivityProvider";
import { ago, cn, relDate } from "@/lib/utils";
import { ChannelIcon } from "./ConnectBits";
import { EMPTY_QUEUE, type ConnectQueue } from "./lib";

/** Home card: my open conversations, due follow-ups / callbacks and promises. Renders nothing when the person has no Connect access or an empty queue. */
export function ConnectQueueCard({ className }: { className?: string }) {
  const [q, setQ] = React.useState<ConnectQueue | null | undefined>(undefined);
  React.useEffect(() => {
    let alive = true;
    const supabase = createClient();
    supabase.rpc("has_perm", { p_perm: "connect.use" }).then(async ({ data: ok }) => {
      if (!alive) return;
      if (!ok) return setQ(null);
      const { data } = await supabase.rpc("my_connect_queue");
      if (alive) setQ({ ...EMPTY_QUEUE, ...((data as unknown as Partial<ConnectQueue>) || {}) });
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!q) return null;
  const due = [...q.follow_ups.map((f) => ({ id: f.id, kind: f.source === "promise" ? "promise" : "follow_up", title: f.title, who: f.contact, due: f.due, overdue: f.overdue, href: f.conversation_id ? `/connect/${f.conversation_id}` : "/connect/follow-ups" })), ...q.callbacks.map((c) => ({ id: c.id, kind: "callback", title: c.note || "Call back", who: c.contact, due: c.due, overdue: c.overdue, href: c.conversation_id ? `/connect/${c.conversation_id}` : "/connect/follow-ups" }))].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);
  const empty = q.mine.length === 0 && due.length === 0 && q.unclaimed.length === 0 && q.awaiting_approval.length === 0;
  if (empty) return null;
  return (
    <Card className={cn(className)}>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Blink zone="nav:/connect" /> GHL Connect</span>}
        subtitle={`${q.mine.length} open · ${q.unclaimed.length} to claim · ${q.follow_ups.length + q.callbacks.length} due soon${q.awaiting_approval.length ? ` · ${q.awaiting_approval.length} to approve` : ""}`}
        action={<Link href="/connect" className="text-xs link">Open</Link>}
      />
      <div className="px-2 pb-2 space-y-0.5">
        {q.mine.slice(0, 4).map((c) => (
          <Link key={c.id} href={`/connect/${c.id}`} className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] row-hover text-sm">
            <span className="w-6 h-6 rounded-full sunken flex items-center justify-center text-muted shrink-0"><ChannelIcon channel={c.channel} size={12} /></span>
            <span className={cn("flex-1 truncate", c.unread && "font-medium")}>{c.contact || "Contact"}<span className="text-muted"> · {c.subject || c.channel}</span></span>
            <span className={cn("text-[11px] whitespace-nowrap", c.breached ? "text-danger" : "text-muted")}>{c.breached ? "SLA" : ago(c.last)}</span>
          </Link>
        ))}
        {due.map((d) => (
          <Link key={`${d.kind}:${d.id}`} href={d.href} className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] row-hover text-sm">
            <span className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0", d.kind === "promise" ? "tone-violet" : d.kind === "callback" ? "tone-info" : "sunken text-muted")}>{d.kind === "promise" ? <Handshake size={12} /> : d.kind === "callback" ? <PhoneCall size={12} /> : <CalendarClock size={12} />}</span>
            <span className="flex-1 truncate">{d.title}{d.who ? <span className="text-muted"> · {d.who}</span> : null}</span>
            <span className={cn("text-[11px] whitespace-nowrap", d.overdue ? "text-danger" : "text-muted")}>{relDate(d.due)}</span>
          </Link>
        ))}
        {q.unclaimed.length > 0 && q.mine.length === 0 && (
          <Link href="/connect?view=unclaimed" className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] row-hover text-sm"><MessagesSquare size={13} className="text-muted" /> {q.unclaimed.length} unclaimed in your inboxes</Link>
        )}
      </div>
    </Card>
  );
}
