"use client";

import * as React from "react";
import { Mail, Phone, MessageCircle, MessageSquareText, MessagesSquare, StickyNote, Star, ShieldBan } from "lucide-react";
import { Avatar, Pill } from "@/components/ui";
import { usePerson } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { PRIORITY_LABEL, PRIORITY_TONE, ago, cn, type TaskPriority } from "@/lib/utils";
import { CHANNEL_LABEL, CONV_STATUS_LABEL, CONV_STATUS_TONE, slaLabel, type ConversationListItem } from "./lib";

export function ChannelIcon({ channel, size = 14, className }: { channel?: string | null; size?: number; className?: string }) {
  const c = channel || "email";
  const Icon = c === "email" ? Mail : c === "call" || c === "phone" ? Phone : c === "whatsapp" ? MessageCircle : c === "sms" ? MessageSquareText : c === "note" ? StickyNote : MessagesSquare;
  return <Icon size={size} className={className} aria-label={CHANNEL_LABEL[c] || c} />;
}

export function ConvStatusPill({ status }: { status: string }) {
  return <Pill tone={CONV_STATUS_TONE[status] || "tone-neutral"}>{CONV_STATUS_LABEL[status] || status}</Pill>;
}

export function PriorityMini({ priority }: { priority: string }) {
  if (priority === "normal" || priority === "low") return null;
  const p = priority as TaskPriority;
  return <Pill tone={PRIORITY_TONE[p] || "tone-neutral"}>{PRIORITY_LABEL[p] || priority}</Pill>;
}

export function VipBadge({ vip }: { vip?: boolean }) {
  if (!vip) return null;
  return (
    <span className="pill tone-orange" title="VIP contact">
      <Star size={10} /> VIP
    </span>
  );
}

export function DncBadge({ dnc }: { dnc?: boolean }) {
  if (!dnc) return null;
  return (
    <span className="pill tone-danger" title="Do Not Contact">
      <ShieldBan size={10} /> DNC
    </span>
  );
}

/** Live SLA countdown; re-renders every 30 s. Red when breached. */
export function SlaCountdown({ due, breached, className }: { due?: string | null; breached?: boolean; className?: string }) {
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!due) return;
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [due]);
  const s = slaLabel(due, breached);
  if (!s) return null;
  return (
    <span className={cn("text-[11px] num whitespace-nowrap", s.late ? "text-danger font-medium" : "text-muted", className)} title="First-reply SLA">
      {s.text}
    </span>
  );
}

export function AssigneeAvatar({ id, size = 20 }: { id?: string | null; size?: number }) {
  const p = usePerson(id);
  if (!id) return <span className="text-[11px] text-muted italic">Unclaimed</span>;
  return <Avatar name={p?.full_name} src={p?.avatar_url} size={size} />;
}

/** One row of the conversation list. Draggable (HTML5) so it can be dropped on agent chips / status lanes. */
export function ConversationRowItem({ item, active, onSelect, onDragStart, menu }: { item: ConversationListItem; active?: boolean; onSelect: (id: string) => void; onDragStart?: (e: React.DragEvent, id: string) => void; menu?: React.ReactNode }) {
  const showSla = item.status === "open" || item.status === "pending";
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!!onDragStart}
      onDragStart={(e) => onDragStart?.(e, item.id)}
      onClick={() => onSelect(item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(item.id);
        }
      }}
      className={cn("group relative flex gap-2.5 px-3 py-2.5 border-b cursor-pointer row-hover select-none", active && "bg-[var(--neutral-bg)]", item.unread && "font-medium")}
      aria-current={active ? "true" : undefined}
    >
      <span className="w-8 h-8 rounded-full sunken flex items-center justify-center shrink-0 text-muted relative">
        <ChannelIcon channel={item.channel} />
        {item.unread && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--brand-2)]" aria-label="Unread" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Blink zone={`conversation:${item.id}`} />
          <span className="truncate text-sm">{item.contact?.name || "Unknown contact"}</span>
          <VipBadge vip={item.vip} />
          <DncBadge dnc={item.contact?.do_not_contact} />
          <span className="ml-auto text-[11px] text-muted whitespace-nowrap font-normal">{ago(item.last_message_at)}</span>
        </div>
        <div className={cn("text-xs truncate", item.unread ? "text-[var(--fg)]" : "text-muted")}>{item.subject || `(${item.channel})`}</div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <AssigneeAvatar id={item.assigned_to} size={18} />
          <PriorityMini priority={item.priority} />
          {item.inbox && <span className="text-[11px] text-muted truncate">{item.inbox.name}</span>}
          {showSla && <SlaCountdown due={item.sla_due_at} breached={item.sla_breached} className="ml-auto" />}
        </div>
      </div>
      {menu && (
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100" onClick={(e) => e.stopPropagation()}>
          {menu}
        </div>
      )}
    </div>
  );
}
