import { callAI, type BuddyResponse } from "@/lib/ai/types";

/** Marker that prefixes a chat message body written by GHL Buddy (inserted by the asking user). */
export const BUDDY_PREFIX = "🤖 **GHL Buddy** · ";
export const BUDDY_MENTION_RE = /@ghl\s?buddy\b/i;
/** Synthetic id used by the chat mention autocomplete. */
export const BUDDY_MENTION_ID = "__ghlbuddy";

export function isBuddyMessage(body: string | null | undefined) {
  return !!body && body.startsWith(BUDDY_PREFIX);
}
export function buddyBody(body: string) {
  return body.slice(BUDDY_PREFIX.length);
}
export function stripBuddyMention(text: string) {
  return text.replace(BUDDY_MENTION_RE, "").replace(/\s{2,}/g, " ").trim();
}

/** Ask GHL Buddy in the context of a channel; returns the answer body ready to insert as a message. */
export async function askBuddyInChannel(channelId: string, text: string): Promise<{ body: string; res: BuddyResponse }> {
  const message = stripBuddyMention(text) || "Catch me up on this conversation";
  const res = await callAI<BuddyResponse>("buddy", { message, mode: "chat", scope: { channelId, path: `/chat/${channelId}` } });
  const answer = (res.answer || "I could not find anything relevant.").trim();
  const note = res.confidence === "insufficient" ? "\n\n_I don't have an approved answer for this — best to ask a person._" : res.confidence === "needs_confirmation" ? "\n\n_Needs confirmation — parts of this are inferred._" : "";
  return { body: `${BUDDY_PREFIX}${answer}${note}`, res };
}
