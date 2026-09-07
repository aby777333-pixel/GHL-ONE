import { z } from "zod";
import { withAI, str } from "@/lib/ai/route";
import { complete, extract, logUsage } from "@/lib/ai/client";
import { SEARCH_SYSTEM } from "@/lib/ai/prompts";

export const maxDuration = 60;

const ExpandSchema = z.object({ keywords: z.array(z.string()).min(1).max(6).describe("distinct 1-3 word search terms, most specific first"), intent: z.string() });

/** POST /api/ai/search { q } — semantic-ish search: query understanding → multi-keyword search → AI answer over results. */
export async function POST(req: Request) {
  return withAI(req, async (ctx, body) => {
    const q = str(body.q).trim();
    if (q.length < 2) throw new Error("query too short");
    const started = Date.now();
    const { data: exp, usage: u1 } = await extract({
      schema: ExpandSchema,
      system: "You expand a workplace search query into the distinct keywords most likely to match titles of tasks, projects, people, files, decisions, meetings and chat messages in a company workspace. Include the original key nouns, likely synonyms and shorter forms. Output only the schema.",
      user: `Query: ${q}`,
      effort: "low",
      maxTokens: 400,
    });
    const terms = [...new Set([q, ...exp.keywords].map((t) => t.trim()).filter((t) => t.length >= 2))].slice(0, 6);
    const seen = new Map<string, { kind: string; id: string; title: string; subtitle: string | null; link: string; score: number }>();
    await Promise.all(terms.map(async (t, i) => {
      const { data } = await ctx.db.rpc("search_all", { q: t, lim: 8 });
      for (const r of (data || []) as { kind: string; id: string; title: string; subtitle: string | null; link: string; rank: number }[]) {
        const key = r.kind + r.id;
        const prev = seen.get(key);
        const score = (r.rank || 0) + (i === 0 ? 1 : 0.4);
        if (!prev) seen.set(key, { ...r, score });
        else prev.score += score;
      }
    }));
    const results = [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 30);
    const listing = results.map((r) => `- ${r.kind}: [${r.title}](${r.link}) — ${r.subtitle || ""}`).join("\n") || "No results.";
    const { text, usage: u2 } = await complete({ system: SEARCH_SYSTEM, user: `Query: ${q}\nIntent: ${exp.intent}\n\nResults:\n${listing}`, effort: "low", maxTokens: 600 });
    await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: "search", usage: { input_tokens: (u1.input_tokens || 0) + (u2.input_tokens || 0), output_tokens: (u1.output_tokens || 0) + (u2.output_tokens || 0), cache_read_input_tokens: (u1.cache_read_input_tokens || 0) + (u2.cache_read_input_tokens || 0), cache_creation_input_tokens: (u1.cache_creation_input_tokens || 0) + (u2.cache_creation_input_tokens || 0) }, latencyMs: Date.now() - started });
    return { answer: text, terms, results: results.map(({ score: _s, ...r }) => r) };
  });
}
