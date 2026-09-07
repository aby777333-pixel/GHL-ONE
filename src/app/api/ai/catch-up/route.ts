import { withAI, str } from "@/lib/ai/route";
import { complete, logUsage } from "@/lib/ai/client";
import { CATCH_UP_SYSTEM } from "@/lib/ai/prompts";
import { channelContext } from "@/lib/ai/context";

export const maxDuration = 90;

/** POST /api/ai/catch-up { channelId, sinceIso? } — "Catch me up" summary of unread chat. */
export async function POST(req: Request) {
  return withAI(req, async (ctx, body) => {
    const channelId = str(body.channelId);
    if (!channelId) throw new Error("channelId required");
    const c = await channelContext(ctx.db, channelId, str(body.sinceIso) || undefined, 200);
    if (!c) throw new Error("Channel not found or not accessible");
    if (c.count === 0) return { markdown: "Nothing new since you were last here." };
    const { text, usage, latencyMs } = await complete({ system: CATCH_UP_SYSTEM, user: `Reader: ${ctx.name}\n\n${c.text}`, effort: "low", maxTokens: 1500 });
    await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: "catch_up", usage, latencyMs });
    return { markdown: text, count: c.count };
  });
}
