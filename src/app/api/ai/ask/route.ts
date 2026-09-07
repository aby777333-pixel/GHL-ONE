import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { withAI, str } from "@/lib/ai/route";
import { AI_MODEL, getAI, logUsage } from "@/lib/ai/client";
import { ASSISTANT_SYSTEM } from "@/lib/ai/prompts";
import { companyContext, decisionsContext, myWorkContext, projectContext, taskContext, channelContext, peopleDirectory, todayIST } from "@/lib/ai/context";
import { isManagerPlus } from "@/lib/utils";

export const maxDuration = 120;

const ProposalSchema = z.object({
  kind: z.enum(["task", "decision", "meeting"]),
  title: z.string(),
  description: z.string().nullable().optional(),
  assignee_id: z.string().nullable().optional(),
  assignee_name: z.string().nullable().optional(),
  due_date: z.string().nullable().optional().describe("ISO datetime with +05:30 offset, or null"),
  priority: z.enum(["critical", "urgent", "high", "normal", "low"]).nullable().optional(),
  project_id: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

/** POST /api/ai/ask — the Ask GHL assistant (tool-using, permission-scoped, human-confirmed actions). */
export async function POST(req: Request) {
  return withAI(req, async (ctx, body) => {
    const message = str(body.message).trim();
    if (!message) throw new Error("Empty message");
    const conversationId = str(body.conversationId) || null;
    const scope = (body.scope && typeof body.scope === "object" ? body.scope : {}) as { projectId?: string; channelId?: string; taskId?: string };
    const ai = getAI();
    const started = Date.now();

    // Conversation persistence (own rows only via RLS)
    let convId = conversationId;
    if (convId) {
      const { data: own } = await ctx.db.from("ai_conversations").select("id").eq("id", convId).maybeSingle();
      if (!own) convId = null;
    }
    if (!convId) {
      const { data: conv } = await ctx.db.from("ai_conversations").insert({ org_id: ctx.orgId, user_id: ctx.userId, title: message.slice(0, 80), scope }).select("id").single();
      convId = conv!.id;
    }
    const { data: history } = await ctx.db.from("ai_messages").select("role,content").eq("conversation_id", convId).order("created_at").limit(20);

    const proposals: Proposal[] = [];
    const sources = new Map<string, string>();
    const manager = isManagerPlus(ctx.role);

    const tools = [
      betaZodTool({
        name: "get_my_work",
        description: "The signed-in user's own tasks, items waiting on them, approvals for them, meetings, mentions and projects. Use for 'what should I work on', 'what am I waiting for', 'my day'.",
        inputSchema: z.object({}),
        run: async () => (await myWorkContext(ctx.db, ctx.userId)).text,
      }),
      betaZodTool({
        name: "get_company_overview",
        description: "Company-wide pulse: department health, workload per person, critical/overdue/blocked tasks, active projects, pending approvals, risks, decisions. Management only; returns 'forbidden' for others.",
        inputSchema: z.object({}),
        run: async () => {
          if (!manager) return "forbidden: only management can see the company overview.";
          return (await companyContext(ctx.db)).text;
        },
      }),
      betaZodTool({
        name: "search_company",
        description: "Universal search across people, tasks, projects, messages, files, decisions, meetings, wiki, approvals (permission-filtered). Use short keyword queries; call several times with different keywords if needed.",
        inputSchema: z.object({ query: z.string().describe("2-4 keywords") }),
        run: async ({ query }) => {
          const { data } = await ctx.db.rpc("search_all", { q: query, lim: 10 });
          const rows = (data || []) as { kind: string; id: string; title: string; subtitle: string | null; link: string }[];
          for (const r of rows) sources.set(r.link, r.title);
          return rows.length ? rows.map((r) => `- ${r.kind}: [${r.title}](${r.link}) — ${r.subtitle || ""}`).join("\n") : "No results.";
        },
      }),
      betaZodTool({
        name: "get_project",
        description: "Full state of one project: tasks, milestones, team, decisions, approvals, meetings, files, risks, recent chat. Use the project id from search or scope.",
        inputSchema: z.object({ project_id: z.string() }),
        run: async ({ project_id }) => {
          const c = await projectContext(ctx.db, project_id);
          if (!c) return "Project not found or not accessible.";
          sources.set(`/projects/${project_id}`, c.project.name);
          return c.text;
        },
      }),
      betaZodTool({
        name: "get_task",
        description: "Details, comments and history of one task.",
        inputSchema: z.object({ task_id: z.string() }),
        run: async ({ task_id }) => {
          const c = await taskContext(ctx.db, task_id);
          if (!c) return "Task not found or not accessible.";
          sources.set(`/tasks/${task_id}`, c.task.title);
          return c.text;
        },
      }),
      betaZodTool({
        name: "get_decisions",
        description: "Decision register entries, optionally for one project or matching a keyword. Use for 'why did we decide', 'what was decided about'.",
        inputSchema: z.object({ project_id: z.string().nullable().optional(), keyword: z.string().nullable().optional() }),
        run: async ({ project_id, keyword }) => decisionsContext(ctx.db, project_id || null, keyword || undefined),
      }),
      betaZodTool({
        name: "get_channel_messages",
        description: "Recent messages of a chat channel (by channel id), optionally since an ISO timestamp. Use to summarise discussions.",
        inputSchema: z.object({ channel_id: z.string(), since_iso: z.string().nullable().optional() }),
        run: async ({ channel_id, since_iso }) => {
          const c = await channelContext(ctx.db, channel_id, since_iso || undefined, 120);
          if (!c) return "Channel not found or not accessible.";
          sources.set(`/chat/${channel_id}`, `#${c.channel.name}`);
          return c.text;
        },
      }),
      betaZodTool({
        name: "list_people",
        description: "Directory of active people with ids, designations and departments. Use before proposing assignments.",
        inputSchema: z.object({}),
        run: async () => (await peopleDirectory(ctx.db)).text,
      }),
      betaZodTool({
        name: "propose_actions",
        description: "Propose tasks, decisions or meetings for the user to confirm. Nothing is created until the user clicks confirm. Include assignee_id from list_people when known.",
        inputSchema: z.object({ actions: z.array(ProposalSchema).min(1).max(12) }),
        run: async ({ actions }) => {
          proposals.push(...actions);
          return `Recorded ${actions.length} proposal(s). Tell the user briefly what you proposed; they will confirm in the UI.`;
        },
      }),
    ];

    const scopeNote = [
      `Signed-in user: ${ctx.name} (id ${ctx.userId}), role ${ctx.role}. Today (IST): ${todayIST()}.`,
      scope.projectId ? `Current page: project ${scope.projectId} — call get_project first.` : "",
      scope.channelId ? `Current page: chat channel ${scope.channelId}.` : "",
      scope.taskId ? `Current page: task ${scope.taskId} — call get_task first.` : "",
    ].filter(Boolean).join(" ");

    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...((history || []).map((h) => ({ role: h.role as "user" | "assistant", content: h.content })) as Anthropic.Beta.BetaMessageParam[]),
      { role: "user", content: `${scopeNote}\n\n${message}` },
    ];

    const final = await ai.beta.messages.toolRunner({
      model: AI_MODEL,
      max_tokens: 4000,
      system: [{ type: "text", text: ASSISTANT_SYSTEM, cache_control: { type: "ephemeral" } }],
      // Netlify synchronous functions are capped at 60s; low effort keeps multi-tool answers inside it.
      output_config: { effort: "low" },
      tools,
      messages,
      max_iterations: 6,
    });

    const answer = final.stop_reason === "refusal"
      ? "I can't help with that request."
      : final.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim() || "I could not find anything relevant.";

    const srcList = [...sources.entries()].slice(0, 12).map(([link, title]) => ({ link, title }));
    await ctx.db.from("ai_messages").insert([
      { conversation_id: convId, role: "user", content: message },
      { conversation_id: convId, role: "assistant", content: answer, proposals: proposals.length ? proposals : null, sources: srcList.length ? srcList : null },
    ]);
    await ctx.db.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
    await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: "ask", usage: final.usage, latencyMs: Date.now() - started });

    return { conversationId: convId, answer, proposals, sources: srcList };
  });
}
