import type { Tables } from "@/lib/utils";

export type Course = Tables<"courses">;
export type Lesson = Tables<"lessons">;
export type Enrollment = Tables<"enrollments">;
export type LessonProgress = Tables<"lesson_progress">;

export const LEVELS = ["basic", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<string, string> = { basic: "Basic", intermediate: "Intermediate", advanced: "Advanced" };
export const LEVEL_TONE: Record<string, string> = { basic: "tone-success", intermediate: "tone-info", advanced: "tone-violet" };

export const COURSE_STATUSES = ["draft", "published", "archived"] as const;
export const COURSE_STATUS_LABEL: Record<string, string> = { draft: "Draft", published: "Published", archived: "Archived" };
export const COURSE_STATUS_TONE: Record<string, string> = { draft: "tone-warn", published: "tone-success", archived: "tone-muted" };

export const LESSON_KINDS = ["text", "video", "document", "sop", "quiz"] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];
export const LESSON_KIND_LABEL: Record<string, string> = { text: "Reading", video: "Video", document: "Document", sop: "SOP checklist", quiz: "Quiz" };

export const PASS_MARK = 70;

export type QuizQuestion = { q: string; options: string[]; answer: number };

export function asQuiz(v: unknown): QuizQuestion[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      q: String(x.q || ""),
      options: Array.isArray(x.options) ? x.options.map((o) => String(o)) : [],
      answer: Number.isFinite(Number(x.answer)) ? Number(x.answer) : 0,
    }))
    .filter((q) => q.q && q.options.length >= 2);
}

export function fmtDuration(min?: number | null) {
  if (!min) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Turn a video URL into something embeddable. */
export function videoEmbed(url: string): { kind: "iframe" | "video" | "link"; src: string } {
  const u = url.trim();
  const yt = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i.exec(u);
  if (yt) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/i.exec(u);
  if (vimeo) return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}` };
  const loom = /loom\.com\/(?:share|embed)\/([A-Za-z0-9]+)/i.exec(u);
  if (loom) return { kind: "iframe", src: `https://www.loom.com/embed/${loom[1]}` };
  if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(u)) return { kind: "video", src: u };
  return { kind: "link", src: u };
}

/**
 * Split SOP markdown into numbered steps and everything else.
 * Steps are top-level ordered-list items (`1.` / `1)`); indented lines below a step belong to it.
 */
export function parseSop(source: string): { steps: string[]; notes: string } {
  const lines = (source || "").replace(/\r\n/g, "\n").split("\n");
  const steps: string[] = [];
  const notes: string[] = [];
  let inStep = false;
  for (const line of lines) {
    const m = /^\s{0,1}\d+[.)]\s+(.*)$/.exec(line);
    if (m) { steps.push(m[1].trim()); inStep = true; continue; }
    if (inStep && /^\s{2,}\S/.test(line)) { steps[steps.length - 1] += "\n" + line.trim(); continue; }
    inStep = false;
    notes.push(line);
  }
  return { steps, notes: notes.join("\n").trim() };
}

export const SOP_STORAGE_PREFIX = "ghl.sop.";

/** Overall progress of a person on a course derived from lesson completions. */
export function courseProgress(total: number, done: number) {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

export function isOverdueOn(due?: string | null, status?: string | null) {
  if (!due || status === "completed") return false;
  return new Date(due + "T23:59:59") < new Date();
}
