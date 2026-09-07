import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Model is configurable; defaults to Claude Opus 5. */
export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5";

export type Effort = "low" | "medium" | "high";

export function aiEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
export function getAI() {
  if (!aiEnabled()) throw new AIDisabledError();
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  return client;
}

export class AIDisabledError extends Error {
  constructor() {
    super("AI is not configured. Add ANTHROPIC_API_KEY to enable intelligence features.");
    this.name = "AIDisabledError";
  }
}

type Usage = { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };

/** Record token usage for admin visibility. Never throws. */
export async function logUsage(supabase: SupabaseClient<Database>, params: { orgId: string; userId: string; feature: string; usage?: Usage | null; latencyMs?: number; model?: string }) {
  try {
    const u = params.usage || {};
    await supabase.from("ai_usage").insert({
      org_id: params.orgId,
      user_id: params.userId,
      feature: params.feature,
      model: params.model || AI_MODEL,
      input_tokens: u.input_tokens || 0,
      output_tokens: u.output_tokens || 0,
      cache_read_tokens: u.cache_read_input_tokens || 0,
      cache_write_tokens: u.cache_creation_input_tokens || 0,
      latency_ms: params.latencyMs ?? null,
    });
  } catch {
    /* usage logging must never break a feature */
  }
}

/** Plain text completion with a cached, stable system prompt. */
export async function complete(params: { system: string; user: string; effort?: Effort; maxTokens?: number }) {
  const ai = getAI();
  const started = Date.now();
  const res = await ai.messages.create({
    model: AI_MODEL,
    max_tokens: params.maxTokens ?? 4000,
    system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
    output_config: { effort: params.effort ?? "medium" },
    messages: [{ role: "user", content: params.user }],
  });
  if (res.stop_reason === "refusal") throw new Error("The assistant declined this request.");
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  return { text, usage: res.usage, latencyMs: Date.now() - started };
}

/** Structured extraction validated against a Zod schema. */
export async function extract<T extends z.ZodType>(params: { schema: T; system: string; user: string; effort?: Effort; maxTokens?: number }): Promise<{ data: z.infer<T>; usage: Anthropic.Usage; latencyMs: number }> {
  const ai = getAI();
  const started = Date.now();
  const res = await ai.messages.parse({
    model: AI_MODEL,
    max_tokens: params.maxTokens ?? 6000,
    system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
    output_config: { effort: params.effort ?? "medium", format: zodOutputFormat(params.schema) },
    messages: [{ role: "user", content: params.user }],
  });
  if (res.stop_reason === "refusal") throw new Error("The assistant declined this request.");
  if (!res.parsed_output) throw new Error("The assistant returned an unreadable result. Please try again.");
  return { data: res.parsed_output as z.infer<T>, usage: res.usage, latencyMs: Date.now() - started };
}

/** Human-readable error for API routes. */
export function aiErrorMessage(e: unknown) {
  if (e instanceof AIDisabledError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "The AI API key is invalid.";
  if (e instanceof Anthropic.RateLimitError) return "The AI service is busy. Please try again in a moment.";
  if (e instanceof Anthropic.APIError) return `AI service error (${e.status}).`;
  return e instanceof Error ? e.message : "Unexpected AI error.";
}
