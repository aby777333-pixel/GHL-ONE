import type { Tables } from "@/lib/utils";

/* ------------------------------------------------------------------ rows */
export type ContactRow = Tables<"contacts">;
export type InboxRow = Tables<"inboxes">;
export type ConversationRow = Tables<"conversations">;
export type MessageRow = Tables<"conversation_messages">;
export type FollowUpRow = Tables<"follow_ups">;
export type CallbackRow = Tables<"callbacks">;
export type TemplateRow = Tables<"comm_templates">;
export type InboxRuleRow = Tables<"inbox_rules">;
export type InboxMemberRow = Tables<"inbox_members">;

export type ContactLite = Pick<ContactRow, "id" | "name" | "company" | "kind" | "vip" | "do_not_contact" | "emails" | "phones">;
export type InboxLite = Pick<InboxRow, "id" | "name" | "kind" | "address">;
/** A conversation row as listed in the left pane (contact + inbox joined). */
export type ConversationListItem = ConversationRow & { contact: ContactLite | null; inbox: InboxLite | null };

export const CONVERSATION_SELECT = "*, contact:contacts(id,name,company,kind,vip,do_not_contact,emails,phones), inbox:inboxes(id,name,kind,address)";

/* ------------------------------------------------------------ RPC shapes */
export type QueueConversation = { id: string; subject: string | null; channel: string; status: string; priority: string; vip: boolean; contact: string | null; last: string; unread: boolean; sla_due: string | null; breached: boolean };
export type QueueUnclaimed = { id: string; subject: string | null; channel: string; inbox: string; inbox_id: string; priority: string; vip: boolean; contact: string | null; waiting_minutes: number };
export type QueueCallback = { id: string; contact: string | null; contact_id: string | null; phone: string | null; due: string; note: string | null; overdue: boolean; conversation_id: string | null };
export type QueueFollowUp = { id: string; title: string; contact: string | null; contact_id: string | null; due: string; priority: string; source: string; overdue: boolean; conversation_id: string | null };
export type QueuePromise = { id: string; text: string; to: string | null; due: string | null; overdue: boolean };
export type QueueApproval = { id: string; conversation_id: string; subject: string | null; by: string | null; at: string };
export type ConnectQueue = {
  mine: QueueConversation[];
  unclaimed: QueueUnclaimed[];
  callbacks: QueueCallback[];
  follow_ups: QueueFollowUp[];
  promises: QueuePromise[];
  awaiting_approval: QueueApproval[];
  my_pending_approval: number;
  snoozed: number;
  resolved_today: number;
  calls_today: number;
};
export const EMPTY_QUEUE: ConnectQueue = { mine: [], unclaimed: [], callbacks: [], follow_ups: [], promises: [], awaiting_approval: [], my_pending_approval: 0, snoozed: 0, resolved_today: 0, calls_today: 0 };

export type TimelineItem = {
  type: "message" | "call" | "follow_up" | "commitment" | "note";
  id: string;
  conversation_id?: string | null;
  at: string;
  direction?: string;
  kind: string;
  subject: string | null;
  preview: string;
  by: string | null;
  status?: string | null;
  duration?: number | null;
};
export type ContactTimeline = {
  error?: string;
  contact: (ContactRow & { owner: string | null }) | null;
  items: TimelineItem[];
  open_conversations: number;
  open_promises: number;
  last_contact: string | null;
};

export type DashboardAgent = { user_id: string; name: string; presence: string | null; open: number; resolved: number; replies: number; calls: number; breached: number; overdue_follow_ups: number; overdue_callbacks: number };
export type DashboardInbox = { id: string; name: string; kind: string; open: number; unassigned: number; breached: number; members: number; provider: string | null };
export type ConnectDashboardData = {
  error?: string;
  open: number;
  pending: number;
  snoozed: number;
  unassigned: number;
  breached: number;
  vip_waiting: number;
  oldest_waiting_minutes: number | null;
  new_in_period: number;
  resolved_in_period: number;
  avg_first_reply_minutes: number | null;
  by_channel: Record<string, number>;
  dispositions: Record<string, number>;
  agents: DashboardAgent[];
  inboxes: DashboardInbox[];
  promises_overdue: number;
};

export type ConnectSettings = {
  approval_statuses: string[];
  approval_roles: string[];
  blocked_domains: string[];
  unclaimed_alert_minutes: number;
  max_open_per_agent: number;
  callback_reminder_minutes: number;
  quiet_hours: { from: string; to: string };
};

export type QueueMessageResult = { id: string; status: "queued" | "pending_approval"; to: string[] };
export type LogCallResult = { call_id: string; conversation_id: string; callback_id: string | null; follow_up_id: string | null; commitment_id: string | null };

/* --------------------------------------------------------------- labels */
export const CHANNELS = ["email", "call", "whatsapp", "sms", "chat", "note"] as const;
export const CHANNEL_LABEL: Record<string, string> = { email: "Email", call: "Call", whatsapp: "WhatsApp", sms: "SMS", chat: "Chat", note: "Note", phone: "Phone" };
export const CONV_STATUSES = ["open", "pending", "snoozed", "resolved", "spam"] as const;
export type ConvStatus = (typeof CONV_STATUSES)[number];
export const CONV_STATUS_LABEL: Record<string, string> = { open: "Open", pending: "Pending", snoozed: "Snoozed", resolved: "Resolved", spam: "Spam" };
export const CONV_STATUS_TONE: Record<string, string> = { open: "tone-info", pending: "tone-warn", snoozed: "tone-violet", resolved: "tone-success", spam: "tone-neutral" };
export const DISPOSITIONS = ["resolved", "interested", "not_interested", "callback", "wrong_number", "complaint", "escalated", "spam"] as const;
export const CALL_DISPOSITIONS = ["connected", "no_answer", "busy", "voicemail", "wrong_number", "callback", "interested", "not_interested", "resolved", "escalated", "complaint"] as const;
export const CONTACT_KINDS = ["customer", "lead", "investor_contact", "vendor", "partner", "candidate", "other"] as const;
export const MESSAGE_STATUS_LABEL: Record<string, string> = { draft: "Draft", pending_approval: "Awaiting approval", queued: "Sending…", sent: "Sent", delivered: "Delivered", failed: "Failed", received: "Received", rejected: "Not approved" };
export const MESSAGE_STATUS_TONE: Record<string, string> = { draft: "tone-neutral", pending_approval: "tone-warn", queued: "tone-info", sent: "tone-success", delivered: "tone-success", failed: "tone-danger", received: "tone-neutral", rejected: "tone-danger" };

export const CONTACT_KIND_LABEL: Record<string, string> = { customer: "Customer", lead: "Lead", investor_contact: "Investor contact", vendor: "Vendor", partner: "Partner", candidate: "Candidate", other: "Other" };

/* ------------------------------------------------------------- helpers */
export function humanizeKey(s?: string | null) {
  return (s || "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** "2h 05m left" / "Overdue 14m" for SLA countdowns. */
export function slaLabel(due?: string | null, breached?: boolean) {
  if (!due) return null;
  const ms = new Date(due).getTime() - Date.now();
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const span = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  if (ms < 0 || breached) return { text: `Overdue ${span}`, late: true };
  return { text: `${span} left`, late: false };
}

export function firstName(name?: string | null) {
  return (name || "").trim().split(/\s+/)[0] || "";
}

/** Fill `{{contact_name}} {{my_name}} {{subject}} {{company}}` in templates; unknown variables are kept for the human to complete. */
export function renderTemplate(text: string, vars: Record<string, string | null | undefined>) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k: string) => {
    const v = vars[k.toLowerCase()];
    return v == null || v === "" ? m : v;
  });
}

/** Snooze presets (IST office hours). */
export function snoozePresets(): { key: string; label: string; at: Date }[] {
  const now = new Date();
  const in1h = new Date(now.getTime() + 3_600_000);
  const in3h = new Date(now.getTime() + 3 * 3_600_000);
  const tomorrow9 = new Date(now);
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  const nextWeek = new Date(now);
  const day = nextWeek.getDay();
  nextWeek.setDate(nextWeek.getDate() + ((8 - day) % 7 || 7));
  nextWeek.setHours(9, 0, 0, 0);
  return [
    { key: "1h", label: "In 1 hour", at: in1h },
    { key: "3h", label: "In 3 hours", at: in3h },
    { key: "tomorrow", label: "Tomorrow 9:00", at: tomorrow9 },
    { key: "week", label: "Next week (Mon 9:00)", at: nextWeek },
  ];
}

/** Local datetime-local input value. */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function bucketOf(due: string): "overdue" | "today" | "tomorrow" | "week" | "later" {
  const d = new Date(due);
  const now = new Date();
  if (d.getTime() < now.getTime()) return "overdue";
  const sod = new Date(now);
  sod.setHours(0, 0, 0, 0);
  const days = Math.floor((d.getTime() - sod.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return "week";
  return "later";
}

export function telHref(phone?: string | null) {
  return phone ? `tel:${phone.replace(/[^0-9+]/g, "")}` : undefined;
}

/** Postgres error → readable sentence (RPC exceptions carry the message verbatim). */
export function errText(e: { message?: string } | null | undefined, fallback = "Something went wrong") {
  const m = e?.message || "";
  return m.replace(/^[A-Z0-9]+:\s*/, "") || fallback;
}
