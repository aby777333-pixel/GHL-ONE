import { format, isToday, isYesterday, isSameDay, differenceInMinutes } from "date-fns";
import type { Json } from "@/lib/database.types";
import type { ChatAttachment, ChatMessage, PersonLite } from "./types";

export const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅", "🙏", "🔥"];
export const MORE_EMOJIS = ["😀", "😅", "🤔", "😍", "😢", "😡", "👏", "💯", "🚀", "⭐", "☕", "🙌", "🤝", "💡", "📌", "⚡"];

export const PAGE_SIZE = 40;
export const INITIAL_PAGE = 60;
export const GROUP_WINDOW_MIN = 5;

/** Tokens rendered specially inside a message body. */
export const TOKEN_RE = /(\[@[^\]]+\])|(\[\/[^\]\s]+\])|(https?:\/\/[^\s<>"']+)/g;
export const MENTION_RE = /\[@([^\]]+)\]/g;

export function parseAttachments(j: Json | null | undefined): ChatAttachment[] {
  if (!Array.isArray(j)) return [];
  const out: ChatAttachment[] = [];
  for (const item of j) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, Json | undefined>;
    if (typeof o.path !== "string") continue;
    out.push({
      path: o.path,
      name: typeof o.name === "string" ? o.name : o.path.split("/").pop() || "file",
      size: typeof o.size === "number" ? o.size : 0,
      type: typeof o.type === "string" ? o.type : "application/octet-stream",
      duration: typeof o.duration === "number" ? o.duration : undefined,
    });
  }
  return out;
}

export const isImage = (type: string) => type.startsWith("image/");
export const isAudio = (type: string) => type.startsWith("audio/");
export const isVideo = (type: string) => type.startsWith("video/");

export function dayLabel(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return format(d, sameYear ? "EEEE, d MMM" : "d MMM yyyy");
}

export function timeLabel(iso: string) {
  return format(new Date(iso), "HH:mm");
}

export function fullStamp(iso: string) {
  return format(new Date(iso), "d MMM yyyy, HH:mm");
}

/** Same author within the grouping window, same day, both plain (non-system) messages. */
export function isContinuation(prev: ChatMessage | undefined, cur: ChatMessage) {
  if (!prev) return false;
  if (prev.kind === "system" || cur.kind === "system") return false;
  if (prev.author_id !== cur.author_id) return false;
  if (prev.deleted_at) return false;
  const a = new Date(prev.created_at);
  const b = new Date(cur.created_at);
  return isSameDay(a, b) && Math.abs(differenceInMinutes(b, a)) < GROUP_WINDOW_MIN;
}

export function isNewDay(prev: ChatMessage | undefined, cur: ChatMessage) {
  if (!prev) return true;
  return !isSameDay(new Date(prev.created_at), new Date(cur.created_at));
}

export function personName(p?: PersonLite | null) {
  return p?.full_name || "Unknown";
}

export function firstName(p?: PersonLite | null) {
  return (p?.full_name || "Unknown").split(/\s+/)[0] || "Unknown";
}

/** Keep only mention ids whose `[@Name]` token still exists in the body. */
export function pruneMentions(body: string, ids: string[], people: PersonLite[]) {
  const present = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) present.add(m[1]!.trim().toLowerCase());
  return ids.filter((id) => {
    const p = people.find((x) => x.id === id);
    return p && present.has((p.full_name || "").trim().toLowerCase());
  });
}

/* ---------------------------------------------------------------- drafts */
export function draftKey(channelId: string, parentId?: string | null) {
  return `ghl-chat-draft:${channelId}${parentId ? `:${parentId}` : ""}`;
}
export function loadDraft(key: string) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
export function saveDraft(key: string, text: string) {
  try {
    if (text.trim()) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
  } catch {}
}

/* ------------------------------------------------------------- reactions */
export function groupReactions(m: ChatMessage, me: string) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean; users: string[] }>();
  for (const r of m.reactions) {
    const g = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false, users: [] };
    g.count += 1;
    g.users.push(r.user_id);
    if (r.user_id === me) g.mine = true;
    map.set(r.emoji, g);
  }
  return [...map.values()];
}

/* ---------------------------------------------------------------- files */
export function safeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(-80);
}

export function storagePath(channelId: string, name: string) {
  return `${channelId}/${Date.now()}-${safeFileName(name)}`;
}

export function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) || "";
}

export function fmtDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Sort ascending by created_at and de-duplicate by id. */
export function mergeMessages(list: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map<string, ChatMessage>();
  for (const m of list) map.set(m.id, m);
  for (const m of incoming) {
    const existing = map.get(m.id);
    map.set(m.id, { ...(existing || {}), ...m, reactions: m.reactions?.length ? m.reactions : existing?.reactions ?? [] });
  }
  return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}
