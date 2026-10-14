import type { Notification } from "@/lib/utils";

/*
  One place that answers "what kind of thing is this notification?" for the toaster, the bell,
  the Inbox and Buddy. The database stores `kind` (the enum the triggers have always written),
  `priority` (0075) and `meta` (0075: which channel, who sent it, how many messages folded into
  it). Everything the UI needs to filter, sound and style a notification is derived here, from
  those columns — never from the wording of the title.
*/

export type NotifPriority = "normal" | "important" | "urgent" | "critical";

export type NotifMeta = {
  channel_id?: string;
  channel_type?: string;
  channel_name?: string;
  message_id?: string;
  sender_id?: string;
  sender_name?: string;
  parent_id?: string | null;
  count?: number;
  mention?: boolean;
  broadcast?: "everyone" | "here";
  ack_required?: boolean;
  message_priority?: string;
  bumped_at?: string;
  reminder?: boolean;
  ack_request?: boolean;
  escalation?: boolean;
  ack?: string;
};

export function notifMeta(n: Pick<Notification, "meta">): NotifMeta {
  const m = n.meta;
  if (!m || typeof m !== "object" || Array.isArray(m)) return {};
  return m as NotifMeta;
}

export const PRIORITY_RANK: Record<NotifPriority, number> = { normal: 0, important: 1, urgent: 2, critical: 3 };

export function asPriority(p: string | null | undefined): NotifPriority {
  return p === "critical" || p === "urgent" || p === "important" ? p : "normal";
}

/**
 * The priority the UI treats a notification as. The column decides; for rows written by triggers
 * that pre-date 0075 (priority 'normal' for everything) the kind supplies a floor, so a critical
 * task alert is still a critical alert and an assignment still needs action.
 */
export function notifPriority(n: Pick<Notification, "kind" | "priority">): NotifPriority {
  const col = asPriority(n.priority);
  const floor: NotifPriority = n.kind === "critical" ? "critical" : n.kind === "action_required" || n.kind === "mention" || n.kind === "security" ? "important" : "normal";
  return PRIORITY_RANK[col] >= PRIORITY_RANK[floor] ? col : floor;
}

export const PRIORITY_LABEL: Record<NotifPriority, string> = { normal: "", important: "Important", urgent: "Urgent", critical: "Critical" };
export const PRIORITY_TONE: Record<NotifPriority, string> = { normal: "tone-neutral", important: "tone-brand", urgent: "tone-warn", critical: "tone-danger" };

export type NotifCategory = "dm" | "group" | "mention" | "announcement" | "urgent" | "approval" | "task" | "meeting" | "call" | "system" | "other";

export type NotifFilter = "all" | "unread" | NotifCategory;

export const FILTERS: { key: NotifFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "dm", label: "Direct messages" },
  { key: "group", label: "Group messages" },
  { key: "mention", label: "Mentions" },
  { key: "announcement", label: "Announcements" },
  { key: "urgent", label: "Urgent" },
  { key: "approval", label: "Approvals" },
  { key: "task", label: "Tasks" },
  { key: "meeting", label: "Meetings & reminders" },
  { key: "call", label: "Calls" },
  { key: "system", label: "System" },
];

const TASK_ENTITIES = new Set(["task", "handoff", "workflow_step", "delegation", "commitment"]);
const APPROVAL_ENTITIES = new Set(["approval", "leave", "request", "access_request", "join_request"]);
const MEETING_ENTITIES = new Set(["meeting", "event", "calendar", "one_on_one", "interview", "digest_meeting"]);
const SYSTEM_ENTITIES = new Set(["digest", "system", "account", "role", "policy", "permission", "security", "broadcast", "service_status"]);

export function isMessageNotification(n: Pick<Notification, "entity_type">) {
  return n.entity_type === "message";
}

/** Every category a notification belongs to (a mention inside a DM is both). */
export function notifCategories(n: Pick<Notification, "kind" | "priority" | "entity_type" | "link" | "meta" | "title">): NotifCategory[] {
  const out = new Set<NotifCategory>();
  const meta = notifMeta(n);
  const p = notifPriority(n);
  if (isMessageNotification(n)) {
    if (meta.channel_type === "dm") out.add("dm");
    else out.add("group");
    if (meta.channel_type === "announcement" || meta.broadcast) out.add("announcement");
  }
  if (n.kind === "mention") out.add("mention");
  if (n.entity_type === "announcement") out.add("announcement");
  if (p === "urgent" || p === "critical") out.add("urgent");
  if (n.kind === "approval" || (n.entity_type && APPROVAL_ENTITIES.has(n.entity_type))) out.add("approval");
  if (n.entity_type && TASK_ENTITIES.has(n.entity_type)) out.add("task");
  if (n.kind === "deadline") out.add("task");
  if (n.entity_type && MEETING_ENTITIES.has(n.entity_type)) out.add("meeting");
  if (n.entity_type === "live_room") out.add("call");
  if (n.kind === "security" || (n.entity_type && SYSTEM_ENTITIES.has(n.entity_type))) out.add("system");
  if (out.size === 0) out.add("other");
  return [...out];
}

export function isSnoozed(n: Pick<Notification, "snoozed_until">, now = Date.now()) {
  return !!n.snoozed_until && Date.parse(n.snoozed_until) > now;
}

export function matchesFilter(n: Notification, f: NotifFilter, now = Date.now()) {
  if (f === "all") return true;
  if (f === "unread") return !n.read_at && !isSnoozed(n, now);
  return notifCategories(n).includes(f);
}

/** An incoming Live ring; the LiveProvider shows its own card for these. */
export function isLiveRing(n: Pick<Notification, "entity_type" | "link">) {
  return n.entity_type === "live_room" && /[?&]invite=/.test(n.link || "");
}

export type NotifSound = "dm" | "channel" | "mention" | "urgent" | "critical";

/** Which sound a notification earns. Null = silent (a digest, a read receipt…). */
export function soundFor(n: Pick<Notification, "kind" | "priority" | "entity_type" | "meta" | "link">): NotifSound {
  const p = notifPriority(n);
  if (p === "critical") return "critical";
  if (p === "urgent") return "urgent";
  if (n.kind === "mention") return "mention";
  if (isMessageNotification(n) && notifMeta(n).channel_type === "dm") return "dm";
  return "channel";
}

export const KIND_LABEL: Record<string, string> = {
  critical: "Critical",
  action_required: "Action required",
  mention: "Mention",
  approval: "Approval",
  deadline: "Deadline",
  information: "Update",
  help_request: "Help request",
  security: "Security",
};

/** A short label for the card header: "Direct message", "#techy", "Mention", "Approval"… */
export function notifLabel(n: Pick<Notification, "kind" | "priority" | "entity_type" | "link" | "meta" | "title">): string {
  const meta = notifMeta(n);
  if (isMessageNotification(n)) {
    if (meta.escalation) return "Escalation";
    if (meta.reminder || meta.ack_request) return "Acknowledgement";
    if (meta.channel_type === "dm") return n.kind === "mention" ? "Mention · direct message" : "Direct message";
    const name = meta.channel_name ? `#${meta.channel_name}` : "Group";
    return n.kind === "mention" ? `Mention · ${name}` : name;
  }
  const cats = notifCategories(n);
  if (cats.includes("approval")) return "Approval";
  if (cats.includes("task")) return n.kind === "deadline" ? "Deadline" : "Task";
  if (cats.includes("meeting")) return "Meeting";
  if (cats.includes("call")) return "Call";
  if (cats.includes("announcement")) return "Announcement";
  if (cats.includes("system")) return KIND_LABEL[n.kind] || "System";
  return KIND_LABEL[n.kind] || "Notification";
}

/** Group notifications of one channel under one key so a burst reads as one thing. */
export function groupKey(n: Pick<Notification, "id" | "entity_type" | "meta" | "kind">) {
  const meta = notifMeta(n);
  if (isMessageNotification(n) && meta.channel_id && !meta.reminder && !meta.ack_request && !meta.escalation) return `chat:${meta.channel_id}:${n.kind}`;
  return n.id;
}
