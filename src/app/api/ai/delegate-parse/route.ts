import { z } from "zod";
import { withAI, str } from "@/lib/ai/route";
import { extract, logUsage } from "@/lib/ai/client";
import { DELEGATION_SYSTEM } from "@/lib/ai/prompts";
import { peopleDirectory, todayIST } from "@/lib/ai/context";

export const maxDuration = 90;

export const DelegationSchema = z.object({
  summary: z.string(),
  project_id: z.string().nullable(),
  deadline: z.string().nullable().describe("ISO datetime +05:30 for the final deliverable"),
  approver_needed: z.boolean(),
  steps: z.array(z.object({
    title: z.string(),
    description: z.string().nullable(),
    department_id: z.string().nullable(),
    assignee_id: z.string().nullable(),
    due_date: z.string().nullable(),
    priority: z.enum(["critical", "urgent", "high", "normal", "low"]),
    depends_on_previous: z.boolean(),
    final: z.boolean(),
  })).min(1).max(10),
});
export type DelegationAI = z.infer<typeof DelegationSchema>;

/** POST /api/ai/delegate-parse { text } — natural-language instruction → structured workflow proposal. */
export async function POST(req: Request) {
  return withAI(req, async (ctx, body) => {
    const text = str(body.text).trim();
    if (!text) throw new Error("text required");
    const dir = await peopleDirectory(ctx.db);
    const { data: projects } = await ctx.db.from("projects").select("id,name").eq("archived", false).order("name").limit(200);
    const user = [
      `Reference date (IST): ${todayIST()}. Manager giving the instruction: ${ctx.name} (id ${ctx.userId}).`,
      dir.text,
      `Projects (id | name):`,
      ...(projects || []).map((p) => `${p.id} | ${p.name}`),
      `\n# Instruction\n${text}`,
    ].join("\n");
    const { data, usage, latencyMs } = await extract({ schema: DelegationSchema, system: DELEGATION_SYSTEM, user, effort: "medium", maxTokens: 4000 });
    const people = new Set(dir.people.map((p) => p.id));
    const depts = new Set(dir.departments.map((d) => d.id));
    const projs = new Set((projects || []).map((p) => p.id));
    if (data.project_id && !projs.has(data.project_id)) data.project_id = null;
    for (const s of data.steps) {
      if (s.assignee_id && !people.has(s.assignee_id)) s.assignee_id = null;
      if (s.department_id && !depts.has(s.department_id)) s.department_id = null;
    }
    if (data.steps.length && !data.steps.some((s) => s.final)) data.steps[data.steps.length - 1].final = true;
    await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: "delegate_parse", usage, latencyMs });
    return data;
  });
}
