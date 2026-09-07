import { z } from "zod";
import { withAI, str } from "@/lib/ai/route";
import { extract, logUsage } from "@/lib/ai/client";
import { EXTRACT_TASKS_SYSTEM } from "@/lib/ai/prompts";
import { peopleDirectory, todayIST } from "@/lib/ai/context";

export const maxDuration = 90;

export const ExtractedTasksSchema = z.object({
  tasks: z.array(z.object({
    title: z.string(),
    description: z.string().nullable(),
    assignee_id: z.string().nullable(),
    assignee_name: z.string().nullable(),
    due_date: z.string().nullable().describe("ISO datetime with +05:30 or null"),
    priority: z.enum(["critical", "urgent", "high", "normal", "low"]),
    depends_on_index: z.number().int().nullable(),
  })).max(15),
  summary: z.string().describe("One sentence on what was asked"),
});
export type ExtractedTasks = z.infer<typeof ExtractedTasksSchema>;

/** POST /api/ai/extract-tasks { text, senderName?, projectName? } — tasks from a message, thread, voice transcript or note. */
export async function POST(req: Request) {
  return withAI(req, async (ctx, body) => {
    const text = str(body.text).trim();
    if (!text) throw new Error("text required");
    const dir = await peopleDirectory(ctx.db);
    const user = [
      `Reference date (IST): ${todayIST()}`,
      body.senderName ? `Sender / requester: ${str(body.senderName)}` : `Requester: ${ctx.name}`,
      body.projectName ? `Project context: ${str(body.projectName)}` : "",
      dir.text,
      `\n# Text\n${text}`,
    ].filter(Boolean).join("\n");
    const { data, usage, latencyMs } = await extract({ schema: ExtractedTasksSchema, system: EXTRACT_TASKS_SYSTEM, user, effort: "low", maxTokens: 4000 });
    const valid = new Set(dir.people.map((p) => p.id));
    for (const t of data.tasks) if (t.assignee_id && !valid.has(t.assignee_id)) t.assignee_id = null;
    await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: "extract_tasks", usage, latencyMs });
    return data;
  });
}
