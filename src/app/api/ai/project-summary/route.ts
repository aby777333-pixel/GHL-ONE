import { withAI, str, bool, readCache, writeCache } from "@/lib/ai/route";
import { AI_MODEL, complete, logUsage } from "@/lib/ai/client";
import { PROJECT_SUMMARY_SYSTEM } from "@/lib/ai/prompts";
import { projectContext } from "@/lib/ai/context";

export const maxDuration = 90;

/** POST /api/ai/project-summary { projectId, force? } — executive AI summary, cached until the project changes. */
export async function POST(req: Request) {
  return withAI(req, async (ctx, body) => {
    const projectId = str(body.projectId);
    if (!projectId) throw new Error("projectId required");
    const c = await projectContext(ctx.db, projectId);
    if (!c) throw new Error("Project not found or not accessible");
    if (!bool(body.force)) {
      const cached = await readCache(ctx.db, { kind: "project_summary", entityType: "project", entityId: projectId, inputHash: c.hash });
      if (cached) return { markdown: (cached.content as { markdown: string }).markdown, cached: true, generatedAt: cached.created_at };
    }
    const { text, usage, latencyMs } = await complete({ system: PROJECT_SUMMARY_SYSTEM, user: c.text, effort: "medium", maxTokens: 2000 });
    await writeCache(ctx.db, { orgId: ctx.orgId, kind: "project_summary", entityType: "project", entityId: projectId, inputHash: c.hash, content: { markdown: text }, model: AI_MODEL });
    await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: "project_summary", usage, latencyMs });
    return { markdown: text, cached: false, generatedAt: new Date().toISOString() };
  });
}
