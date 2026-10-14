import type { Channel, Message } from "@/lib/utils";

/** Minimal person shape shared across chat components (compatible with `useSession().people`). */
export type PersonLite = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  presence?: string | null;
  designation?: string | null;
};

/** Stored in `messages.attachments` (jsonb). */
export type ChatAttachment = {
  path: string;
  name: string;
  size: number;
  type: string;
  /** seconds — voice notes only */
  duration?: number;
};

export type Reaction = { message_id: string; user_id: string; emoji: string };

export type ChatMessage = Message & { reactions: Reaction[] };

export type ChannelMember = {
  channel_id: string;
  user_id: string;
  role: string;
  last_read_at: string;
  muted: boolean;
  joined_at: string;
  profile: PersonLite | null;
};

export type ChannelListItem = Channel & {
  unread: number;
  muted: boolean;
  /** For DMs: the other participant. */
  other?: PersonLite | null;
};

/** Message priority (0075). Who may use which level is enforced in Postgres by `messages_priority_guard`. */
export type MessagePriority = "normal" | "important" | "urgent" | "critical";

export type SendPayload = {
  body: string;
  mentions: string[];
  attachments: ChatAttachment[];
  kind: "text" | "voice" | "file";
  /** Defaults to normal. */
  priority?: MessagePriority;
  /** Ask every recipient to acknowledge (tracked in `message_receipts`). */
  ack_required?: boolean;
  /** Remind anyone who has not seen it after this many minutes (needs ack_required). */
  remind_after_minutes?: number | null;
  /** Escalate to the department head when still unacknowledged after twice the reminder interval. */
  escalate?: boolean;
};

/** One row of `message_receipts`: notified, seen and acknowledged are three separate facts. */
export type MessageReceipt = {
  message_id: string;
  user_id: string;
  channel_id: string;
  notified_at: string;
  seen_at: string | null;
  ack_status: string | null;
  acked_at: string | null;
  reminded_at: string | null;
  escalated_at: string | null;
};

export type AckStatus = "seen" | "acknowledged" | "will_respond" | "need_clarification";

export type MessageAction = "reply" | "task" | "extract" | "decision" | "pin" | "copy" | "edit" | "delete" | "forward" | "sheet" | "acks";
