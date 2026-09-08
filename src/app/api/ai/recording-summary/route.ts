import { z } from "zod";
import { withAI, str, writeCache } from "@/lib/ai/route";
import { AI_MODEL, complete, extract, logUsage } from "@/lib/ai/client";
import { peopleDirectory } from "@/lib/ai/context";
import { fmtDuration, type RecordingChapter, type RecordingSummary } from "@/lib/live/types";

export const maxDuration = 90;

const SummarySchema = z.object({
  summary: z.string().describe("3–5 sentences: what this recording is about and what the viewer needs to know."),
  key_points: z.array(z.string()).max(10),
  tasks: z
    .array(
      z.object({
        title: z.string(),
        assignee_name: z.string().nullable().describe("Exact full name of a person from the directory, or null."),
        due: z.string().nullable().describe("YYYY-MM-DD or null"),
      })
    )
    .max(15),
  questions: z.array(z.string()).max(10).describe("Open questions raised but not answered."),
  decisions: z.array(z.string()).max(10),
  segments: z
    .array(z.object({ from_sec: z.number(), to_sec: z.number(), why: z.string() }))
    .max(8)
    .describe("The only parts worth watching, with a one-line reason each."),
  chapters: z.array(z.object({ t: z.number().describe("start second"), title: z.string() })).max(15),
});

const SYSTEM = `You summarise workplace screen recordings and video notes for GHL India Ventures.

Rules:
- Work only from the transcript you are given. Never invent content, names, numbers or commitments.
- Timestamps in the transcript are seconds from the start; chapters and segments must use those seconds and stay inside the recording length.
- Chapters: 3–8 of them, in order, starting at 0, each a short noun phrase describing that stretch.
- Tasks: only things somebody actually committed to or was asked to do. Use an exact full name from the people directory for assignee_name, otherwise null. Never guess a person.
- Segments ("watch only what matters"): the two to five stretches that carry the substance. Skip greetings, waiting and dead air.
- Decisions: only decisions that were actually made. Open questions: things left unresolved.
- Plain, calm English. No praise, no judgement of people, no speculation about performance.`;

const HANDOVER_SYSTEM = `You write concise handover notes for GHL India Ventures from a recording transcript.

Produce short markdown with these headings, omitting any that the transcript does not support:
**Context** — one paragraph on what this work is.
**Where it stands** — bullet points.
**What the next person must do** — bullet points, in order, each actionable.
**Watch out for** — risks, gotchas, blocked items.
**Who to ask** — only names that actually appear in the transcript or directory.

Never invent facts, deadlines or names. Keep it under 350 words.`;

type Line = { t: number; text: string; speaker?: string | null };

function linesFrom(value: unknown): Line[] {
  if (!Array.isArray(value)) return [];
  const out: Line[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text) continue;
    out.push({ t: typeof o.t === "number" ? o.t : 0, text, speaker: typeof o.speaker === "string" ? o.speaker : null });
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * POST /api/ai/recording-summary { recordingId, mode?: "summary" | "handover", text? }
 * Summary, chapters, tasks, decisions and "watch only what matters" segments (§35, §36, §87,
 * §179, §180, §209) — or a handover draft (§210).
 */
export async function POST(req: Request) {
  return withAI(req, async (ctx, body) => {
    const recordingId = str(body.recordingId);
    if (!recordingId) throw new Error("recordingId required");
    const mode = str(body.mode, "summary") === "handover" ? "handover" : "summary";

    const { data: rec } = await ctx.db
      .from("live_recordings")
      .select("id,title,description,kind,duration_sec,transcript,transcript_segments,created_at,owner_id")
      .eq("id", recordingId)
      .maybeSingle();
    if (!rec) throw new Error("Recording not found or not accessible");

    let lines = linesFrom(rec.transcript_segments);
    if (!lines.length) {
      const { data: rows } = await ctx.db.from("live_transcripts").select("text,offset_ms,speaker_name").eq("recording_id", recordingId).order("offset_ms").limit(2000);
      lines = (rows || []).map((r) => ({ t: Math.round((r.offset_ms || 0) / 1000), text: r.text, speaker: r.speaker_name }));
    }
    const pasted = str(body.text).trim();
    const transcriptText = lines.length ? lines.map((l) => `[${fmtDuration(l.t)} = ${Math.round(l.t)}s]${l.speaker ? ` ${l.speaker}:` : ""} ${l.text}`).join("\n") : (rec.transcript || "").trim();
    const source = [transcriptText, pasted && `## Extra notes supplied now\n${pasted}`].filter(Boolean).join("\n\n");
    if (!source) throw new Error("This recording has no transcript yet, so there is nothing to summarise.");

    const dir = await peopleDirectory(ctx.db);
    const header = [
      `Recording: ${rec.title}`,
      rec.description ? `Description: ${rec.description}` : "",
      `Kind: ${rec.kind} · Length: ${rec.duration_sec}s (${fmtDuration(rec.duration_sec)})`,
      "",
      dir.text,
      "",
      "## Transcript",
    ]
      .filter(Boolean)
      .join("\n");

    if (mode === "handover") {
      const { text, usage, latencyMs } = await complete({ system: HANDOVER_SYSTEM, user: `${header}\n${source}`, effort: "medium", maxTokens: 1600 });
      await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: "recording_handover", usage, latencyMs });
      return { handover: text };
    }

    const { data, usage, latencyMs } = await extract({ schema: SummarySchema, system: SYSTEM, user: `${header}\n${source}`, effort: "medium", maxTokens: 5000 });

    // Drop hallucinated people: an assignee must match a real, active person.
    const byName = new Map(dir.people.map((p) => [p.full_name.trim().toLowerCase(), p.full_name]));
    const tasks = data.tasks.map((t) => {
      const raw = (t.assignee_name || "").trim().toLowerCase();
      const exact = raw ? byName.get(raw) : undefined;
      const loose = !exact && raw ? dir.people.find((p) => p.full_name.toLowerCase().includes(raw) || raw.includes(p.full_name.toLowerCase().split(" ")[0]!))?.full_name : undefined;
      return { title: t.title, assignee_name: exact || loose || null, due: t.due };
    });

    const len = Math.max(1, rec.duration_sec);
    const clamp = (n: number) => Math.max(0, Math.min(len, Math.round(n)));
    const chapters: RecordingChapter[] = data.chapters
      .map((c) => ({ t: clamp(c.t), title: c.title.slice(0, 120) }))
      .sort((a, b) => a.t - b.t)
      .filter((c, i, arr) => i === 0 || c.t !== arr[i - 1]!.t);
    const segments = data.segments.map((s) => ({ from_sec: clamp(s.from_sec), to_sec: clamp(s.to_sec), why: s.why })).filter((s) => s.to_sec > s.from_sec);

    const summary: RecordingSummary = {
      summary: data.summary,
      key_points: data.key_points,
      tasks,
      questions: data.questions,
      decisions: data.decisions,
      segments,
    };

    // Owners (and communication admins) can persist it; for everyone else RLS simply ignores the write.
    await ctx.db.from("live_recordings").update({ summary, chapters }).eq("id", recordingId);
    await writeCache(ctx.db, { orgId: ctx.orgId, kind: "recording_summary", entityType: "recording", entityId: recordingId, content: { summary, chapters }, model: AI_MODEL });
    await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: "recording_summary", usage, latencyMs });

    return { summary, chapters };
  });
}
