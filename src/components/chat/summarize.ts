import type { ChatMessage } from "./types";

/**
 * Phase-1 extractive "catch me up" summary. Phase 2 will swap the body of this
 * function for an AI summariser while keeping the same return shape.
 */
export type ChatSummary = {
  count: number;
  people: { id: string; name: string; count: number }[];
  links: string[];
  highlights: { message: ChatMessage; reasons: string[] }[];
  attachments: number;
  span: { from: string; to: string } | null;
};

const SIGNALS: { key: string; re: RegExp }[] = [
  { key: "decision", re: /\b(decid\w*|agreed|final(ise|ize)d?|go ahead|sign(ed)? off)\b/i },
  { key: "approved", re: /\b(approv\w*|rejected|declined)\b/i },
  { key: "deadline", re: /\b(deadline|due|by (today|tomorrow|monday|tuesday|wednesday|thursday|friday|eod|eow)|asap)\b/i },
  { key: "urgent", re: /\b(urgent\w*|critical|immediately|priority)\b/i },
  { key: "blocked", re: /\b(blocked|blocker|stuck|waiting on|can'?t proceed)\b/i },
  { key: "question", re: /\?\s*$/ },
];

const URL_RE = /https?:\/\/[^\s<>"']+/g;

export function summarizeMessages(messages: ChatMessage[], nameOf: (id: string | null) => string): ChatSummary {
  const live = messages.filter((m) => !m.deleted_at && m.kind !== "system");
  const byPerson = new Map<string, number>();
  const links = new Set<string>();
  const highlights: ChatSummary["highlights"] = [];
  let attachments = 0;

  for (const m of live) {
    const pid = m.author_id || "unknown";
    byPerson.set(pid, (byPerson.get(pid) || 0) + 1);
    for (const u of m.body.matchAll(URL_RE)) links.add(u[0].replace(/[.,;:!?)]+$/, ""));
    if (Array.isArray(m.attachments)) attachments += m.attachments.length;
    const reasons = SIGNALS.filter((s) => s.re.test(m.body)).map((s) => s.key);
    if (m.mentions.length) reasons.push("mention");
    if (m.is_pinned) reasons.push("pinned");
    if (reasons.length) highlights.push({ message: m, reasons });
  }

  const people = [...byPerson.entries()]
    .map(([id, count]) => ({ id, name: nameOf(id === "unknown" ? null : id), count }))
    .sort((a, b) => b.count - a.count);

  return {
    count: live.length,
    people,
    links: [...links].slice(0, 12),
    highlights: highlights.slice(0, 12),
    attachments,
    span: live.length ? { from: live[0]!.created_at, to: live[live.length - 1]!.created_at } : null,
  };
}
