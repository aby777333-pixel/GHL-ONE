import "server-only";
import type { Ctx } from "./route";

/*
  Personal memory, with where each piece came from (schema 0062).

  The route used to read `ai_memory` directly — `select key,value limit 12` — and render a flat
  bullet list. Two things were wrong with that. Nothing said where a memory came from, so a note
  Buddy had inferred in passing read exactly like something the person had stated as fact and there
  was no way to answer "where did you get that?". And "limit 12" with no ordering meant the twelve
  it happened to return had nothing to do with what the person was working on.

  `recall_memory()` ranks by closeness to the work in front of them — this project, then this
  department, then their general working context — and returns the provenance with each row. This
  module renders that for the prompt.

  Personal memory is *personal*: `aim_all` is `user_id = auth.uid()`, and 0062 deliberately did not
  widen it. Anything that belongs to the company belongs in `ai_knowledge`, where it is owned,
  reviewed and classified, and the way across is a `knowledge_article` proposal a human approves.
*/

export type MemoryRow = {
  key: string;
  text: string | null;
  kind: "fact" | "preference" | "instruction" | "decision" | "inference" | "uncertain";
  confidence: number | null;
  source_type: string | null;
  source: string | null;
  link: string | null;
  project_id: string | null;
  department_id: string | null;
  updated_at: string;
  verified_at: string | null;
  expires_at: string | null;
  version: number;
};

/** How a memory should read to the model. An inference must never look like a stated fact. */
const KIND_LABEL: Record<MemoryRow["kind"], string> = {
  fact: "fact",
  preference: "preference",
  instruction: "standing instruction",
  decision: "decision",
  inference: "worked out by you, not stated",
  uncertain: "unconfirmed",
};

function ago(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days)) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export async function recallMemory(ctx: Ctx, params: { projectId?: string | null; departmentId?: string | null; query?: string | null; limit?: number }) {
  const { data } = await ctx.db.rpc("recall_memory", {
    p_query: params.query || undefined,
    p_project: params.projectId || undefined,
    p_department: params.departmentId || undefined,
    p_limit: params.limit ?? 12,
  });
  return (Array.isArray(data) ? data : []) as unknown as MemoryRow[];
}

/**
 * The block that goes in the user turn. Every line carries its kind, its source and its age, so the
 * model can both weigh it and say where it came from when asked.
 */
export function renderMemory(rows: MemoryRow[]) {
  if (!rows.length) return "";
  const lines = rows
    .filter((r) => r.text)
    .map((r) => {
      const bits = [KIND_LABEL[r.kind] || r.kind, r.source ? `from ${r.source}` : null, ago(r.updated_at)].filter(Boolean);
      const shaky = r.kind === "inference" || r.kind === "uncertain" || (r.confidence ?? 1) < 0.5;
      return `- [${bits.join(" · ")}] ${r.key}: ${r.text}${shaky ? " (treat as unconfirmed — check before relying on it)" : ""}`;
    });
  if (!lines.length) return "";
  return [
    "PERSONAL WORKING CONTEXT — this person's own memory, held for them alone. It is never company",
    "policy and never applies to anybody else. Use it to avoid asking what they have already told you.",
    "If they ask where something came from, answer from the bracket or call why_you_know_that. If it",
    "is wrong, offer to correct it with remember or drop it with forget_that.",
    ...lines,
  ].join("\n");
}
