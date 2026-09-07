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

export type SendPayload = {
  body: string;
  mentions: string[];
  attachments: ChatAttachment[];
  kind: "text" | "voice" | "file";
};

export type MessageAction = "reply" | "task" | "decision" | "pin" | "copy" | "edit" | "delete" | "forward" | "sheet";
