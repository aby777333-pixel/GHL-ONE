import { withAI, str, bool, readCache, writeCache } from "@/lib/ai/route";
import { AI_MODEL, complete, logUsage } from "@/lib/ai/client";
import { BRIEF_SYSTEM } from "@/lib/ai/prompts";
import { companyContext, myWorkContext, todayIST } from "@/lib/ai/context";
import { isManagerPlus, isAdminRole } from "@/lib/utils";

export const maxDuration = 90;

/** POST /api/ai/brief { mode: 'morning' | 'eod', force?: boolean } — personalised daily brief, cached per user/day. */
export async function POST(req: Request) {
  return withAI(req, async (ctx, body) => {
    const mode = str(body.mode, "morning") === "eod" ? "eod" : "morning";
    const kind = mode === "eod" ? "brief_eod" : "brief_morning";
    const day = todayIST();
    if (!bool(body.force)) {
      const cached = await readCache(ctx.db, { kind, userId: ctx.userId, day });
      if (cached) return { markdown: (cached.content as { markdown: string }).markdown, cached: true, generatedAt: cached.created_at };
    }
    const mine = await myWorkContext(ctx.db, ctx.userId);
    let extra = "";
    if (isManagerPlus(ctx.role)) {
      const company = await companyContext(ctx.db);
      if (!company.forbidden) extra = `\n\n# Company view (you are ${isAdminRole(ctx.role) ? "executive management" : "a manager"})\n${company.text}`;
    }
    const firstName = ctx.name.split(" ")[0];
    const user = `Write the ${mode === "eod" ? "end-of-day summary" : "morning brief"} for ${firstName} (${ctx.role}).${mode === "eod" ? " Focus on what happened today and what tomorrow needs." : ""}\n\n# Personal data\n${mine.text}${extra}`;
    const { text, usage, latencyMs } = await complete({ system: BRIEF_SYSTEM, user, effort: "low", maxTokens: 1500 });
    await writeCache(ctx.db, { orgId: ctx.orgId, kind, userId: ctx.userId, day, content: { markdown: text }, model: AI_MODEL });
    await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: kind, usage, latencyMs });
    return { markdown: text, cached: false, generatedAt: new Date().toISOString() };
  });
}
