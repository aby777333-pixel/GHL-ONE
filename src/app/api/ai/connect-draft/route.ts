import { withAI, str } from "@/lib/ai/route";
import { complete, logUsage } from "@/lib/ai/client";

export const maxDuration = 60;

const CONNECT_DRAFT_SYSTEM = `You are the AI Email Buddy inside GHL Connect, the communication hub of GHL India Ventures (Sales & Support). You draft replies that a human agent will review and send; you never send anything yourself.

Hard rules
- Never invent prices, discounts, timelines, delivery dates, guarantees, availability, stock, legal terms or anything not present in the thread or the agent's instruction. If the contact asked for such a thing and it is not in the material, write "I will confirm this and get back to you by [date]".
- Never promise on behalf of colleagues or other departments.
- Do not reveal internal notes, other customers, or anything marked internal.
- Match the language the contact wrote in (Indian English by default). Keep the GHL tone: warm, precise, respectful, no hype, no exclamation marks, no emojis.
- Address the contact by first name if known. Sign off with the agent's name (given) — no company slogans.
- Output plain text only: the email body, ready to paste. No subject line, no markdown, no preamble, no quotes around it. 60–180 words unless the thread needs more.`;

/** POST /api/ai/connect-draft { conversationId, instruction? } — a reviewed-before-send reply draft for one conversation (RLS-scoped). */
export async function POST(req: Request) {
  return withAI(req, async (ctx, body) => {
    const conversationId = str(body.conversationId).trim();
    if (!/^[0-9a-f-]{36}$/i.test(conversationId)) throw new Error("conversationId required");
    const instruction = str(body.instruction).trim();
    const { data: conv } = await ctx.db.from("conversations").select("id,subject,channel,status,priority,vip,contact_id,inbox_id").eq("id", conversationId).maybeSingle();
    if (!conv) throw new Error("Conversation not found or restricted");
    const [{ data: contact }, { data: messages }, { data: inbox }] = await Promise.all([
      conv.contact_id ? ctx.db.from("contacts").select("name,company,kind,language,preferred_channel").eq("id", conv.contact_id).maybeSingle() : Promise.resolve({ data: null }),
      ctx.db.from("conversation_messages").select("direction,kind,author_id,from_address,subject,body,created_at,status").eq("conversation_id", conversationId).neq("direction", "internal").neq("kind", "system").order("created_at").limit(30),
      conv.inbox_id ? ctx.db.from("inboxes").select("name,address,signature").eq("id", conv.inbox_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const thread = (messages || [])
      .filter((m) => m.status !== "rejected" && m.status !== "failed")
      .map((m) => `[${m.direction === "inbound" ? `CONTACT (${m.from_address || contact?.name || "contact"})` : "US"} · ${m.kind} · ${m.created_at.slice(0, 16).replace("T", " ")}]\n${(m.body || "").slice(0, 2500)}`)
      .join("\n\n");
    const user = [
      `Agent (signs the email): ${ctx.name}`,
      `Inbox: ${inbox?.name || "—"}${inbox?.address ? ` <${inbox.address}>` : ""}`,
      `Contact: ${contact?.name || "unknown"}${contact?.company ? ` · ${contact.company}` : ""}${contact?.kind ? ` · ${contact.kind}` : ""}${contact?.language ? ` · prefers ${contact.language}` : ""}`,
      `Subject: ${conv.subject || "(none)"} · channel ${conv.channel} · status ${conv.status}`,
      instruction ? `Agent instruction: ${instruction}` : "Agent instruction: reply to the latest message from the contact.",
      `\n# Thread (oldest first)\n${thread || "(no messages yet — write an opening message based on the subject)"}`,
    ].join("\n");
    const { text, usage, latencyMs } = await complete({ system: CONNECT_DRAFT_SYSTEM, user, effort: "low", maxTokens: 900 });
    await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: "connect_draft", usage, latencyMs });
    return { draft: text, subject: conv.subject ? (/^re:/i.test(conv.subject) ? conv.subject : `Re: ${conv.subject}`) : null, ai_drafted: true };
  });
}
