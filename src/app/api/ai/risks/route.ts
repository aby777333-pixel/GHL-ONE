import { withAI, str, bool, readCache, writeCache } from "@/lib/ai/route";
import { AI_MODEL, complete, logUsage } from "@/lib/ai/client";
import { RISK_SYSTEM, PROJECT_SUMMARY_SYSTEM } from "@/lib/ai/prompts";
import { companyContext, projectContext, todayIST } from "@/lib/ai/context";
import { isManagerPlus } from "@/lib/utils";

export const maxDuration = 120;

/** POST /api/ai/risks { projectId?, force? } — management risk & bottleneck briefing (company or one project). */
export async function POST(req: Request) {
  return withAI(req, async (ctx, body) => {
    const projectId = str(body.projectId);
    if (projectId) {
      const c = await projectContext(ctx.db, projectId);
      if (!c) throw new Error("Project not found or not accessible");
      const { text, usage, latencyMs } = await complete({ system: PROJECT_SUMMARY_SYSTEM + "\n\nFocus this answer on risks, likely misses and bottlenecks, and the decisions management must take.", user: c.text, effort: "medium", maxTokens: 2000 });
      await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: "risks_project", usage, latencyMs });
      return { markdown: text, cached: false, generatedAt: new Date().toISOString() };
    }
    if (!isManagerPlus(ctx.role)) throw new Error("Management only");
    const day = todayIST();
    if (!bool(body.force)) {
      const cached = await readCache(ctx.db, { kind: "risk_report", entityType: "company", day });
      if (cached && Date.now() - new Date(cached.created_at).getTime() < 4 * 3600e3) return { markdown: (cached.content as { markdown: string }).markdown, cached: true, generatedAt: cached.created_at };
    }
    const company = await companyContext(ctx.db);
    if (company.forbidden) throw new Error("Management only");
    const { text, usage, latencyMs } = await complete({ system: RISK_SYSTEM, user: company.text, effort: "medium", maxTokens: 2500 });
    await writeCache(ctx.db, { orgId: ctx.orgId, kind: "risk_report", entityType: "company", day, content: { markdown: text }, model: AI_MODEL });
    await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: "risk_report", usage, latencyMs });
    return { markdown: text, cached: false, generatedAt: new Date().toISOString() };
  });
}
