import { z } from "zod";
import { withAI, bool, readCache, writeCache } from "@/lib/ai/route";
import { AI_MODEL, extract, logUsage } from "@/lib/ai/client";
import { myWorkContext, todayIST } from "@/lib/ai/context";

export const maxDuration = 60;

const INBOX_SYSTEM = `You are GHL Buddy's inbox triage inside GHL ONE, the company operating system of GHL India Ventures.
From the person's own work data and unread notifications, pick the FIVE things that actually need their attention today — no more.
Rank: overdue or critical → things other people are blocked on → approvals for them → direct questions/mentions waiting for a reply → deadlines today/tomorrow → useful help you can offer.
Rules: use only the supplied data; never invent items, people or dates; one item per underlying thing (merge duplicates); each "why" is one short plain sentence a busy person can act on; use the links exactly as given (paths like /tasks/{id}); classify each item with the right kind. If fewer than five things matter, return fewer. The summary is one warm, calm sentence (max 25 words).`;

const Digest = z.object({
  summary: z.string(),
  items: z.array(z.object({
    title: z.string(),
    why: z.string(),
    link: z.string().nullable(),
    kind: z.enum(["needs_action", "waiting_on_me", "question", "approval", "mention", "suggested_help"]),
  })).max(5),
});

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/** POST /api/ai/inbox { force?: boolean } — "the 5 things that actually need your attention", cached per user per day. */
export async function POST(req: Request) {
  return withAI(req, async (ctx, body) => {
    const day = todayIST();
    const { data: unread } = await ctx.db.from("notifications").select("id,kind,title,body,link,created_at").eq("user_id", ctx.userId).is("read_at", null).order("created_at", { ascending: false }).limit(60);
    const inputHash = hash((unread || []).map((n) => n.id).join(","));
    if (!bool(body.force)) {
      const cached = await readCache(ctx.db, { kind: "inbox_digest", userId: ctx.userId, day, inputHash });
      if (cached) return { ...(cached.content as object), cached: true, generatedAt: cached.created_at };
    }
    const mine = await myWorkContext(ctx.db, ctx.userId);
    const notes = (unread || []).map((n) => `- [${n.kind}] ${n.title}${n.body ? ` — ${n.body.slice(0, 140)}` : ""}${n.link ? ` (${n.link})` : ""} · ${n.created_at.slice(0, 16)}`).join("\n") || "- none";
    const user = `Person: ${ctx.name} (${ctx.role}). Today (IST): ${day}.\n\n# Work data\n${mine.text}\n\n# Unread notifications (${unread?.length || 0})\n${notes}`;
    const { data, usage, latencyMs } = await extract({ schema: Digest, system: INBOX_SYSTEM, user, effort: "low", maxTokens: 1200 });
    const content = { summary: data.summary, items: data.items.slice(0, 5) };
    await writeCache(ctx.db, { orgId: ctx.orgId, kind: "inbox_digest", userId: ctx.userId, day, inputHash, content, model: AI_MODEL });
    await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: "inbox_digest", usage, latencyMs });
    return { ...content, cached: false, generatedAt: new Date().toISOString() };
  });
}
