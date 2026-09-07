import { z } from "zod";
import { withAI, str, writeCache } from "@/lib/ai/route";
import { AI_MODEL, extract, logUsage } from "@/lib/ai/client";
import { MEETING_EXTRACT_SYSTEM } from "@/lib/ai/prompts";
import { meetingContext } from "@/lib/ai/context";

export const maxDuration = 120;

export const MeetingExtractSchema = z.object({
  summary: z.string(),
  key_points: z.array(z.string()).max(10),
  decisions: z.array(z.object({ title: z.string(), decision: z.string(), reason: z.string().nullable() })).max(12),
  action_items: z.array(z.object({ title: z.string(), owner_id: z.string().nullable(), owner_name: z.string().nullable(), due_date: z.string().nullable().describe("YYYY-MM-DD or null"), priority: z.enum(["critical", "urgent", "high", "normal", "low"]) })).max(20),
  open_questions: z.array(z.string()).max(10),
  risks: z.array(z.string()).max(10),
  people_mentioned: z.array(z.string()).max(20),
});
export type MeetingExtract = z.infer<typeof MeetingExtractSchema>;

/** POST /api/ai/meeting-extract { meetingId, text? } — summary, decisions, action items, questions, risks. */
export async function POST(req: Request) {
  return withAI(req, async (ctx, body) => {
    const meetingId = str(body.meetingId);
    if (!meetingId) throw new Error("meetingId required");
    const c = await meetingContext(ctx.db, meetingId);
    if (!c) throw new Error("Meeting not found or not accessible");
    const pasted = str(body.text).trim();
    const source = pasted ? `${c.text}\n\n## Additional notes / transcript supplied now\n${pasted}` : c.text;
    if (!c.meeting.notes && !c.meeting.transcript && !pasted) throw new Error("Add notes or a transcript first, then extract.");
    const { data, usage, latencyMs } = await extract({ schema: MeetingExtractSchema, system: MEETING_EXTRACT_SYSTEM, user: source, effort: "medium", maxTokens: 6000 });
    // Validate owner ids against participants; keep names for the UI to resolve
    const valid = new Set(c.dir.people.map((p) => p.id));
    for (const a of data.action_items) if (a.owner_id && !valid.has(a.owner_id)) a.owner_id = null;
    await writeCache(ctx.db, { orgId: ctx.orgId, kind: "meeting_extract", entityType: "meeting", entityId: meetingId, content: data, model: AI_MODEL });
    await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: "meeting_extract", usage, latencyMs });
    return data;
  });
}
