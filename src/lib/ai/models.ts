import "server-only";
import type { Effort } from "./client";

/*
  Which model runs which kind of work (§16).

  Before this, every AI feature in GHL ONE used one string — `AI_MODEL`, defaulting to
  `claude-opus-5` — except `ai_assistants.model`, a per-persona override, and the router added in
  0061, which hard-coded Haiku. So "route different workloads to different models by capability,
  latency, cost and complexity" had nowhere to be expressed, and the one place that did use a
  second model had to know, inline, that Haiku rejects `output_config.effort`.

  This module is the single place that answers two questions: which model for this task class, and
  what may be sent to it. GHL Buddy, the router and the shared `complete()` / `extract()` helpers go
  through it. The remaining direct `AI_MODEL` readers — `api/ai/ask` and the cache/usage labels in
  brief, inbox, meeting-extract and project-summary — were left alone deliberately: they behave
  identically today, and moving them is a change for its own sake until one of them needs a
  different model.

  RESOLUTION, most specific first:
    1. an explicit override from the caller — `ai_assistants.model`, which an administrator set for
       one persona and which must keep winning exactly as it did;
    2. the per-class environment variable (`AI_MODEL_CHAT`, `AI_MODEL_EXTRACT`, …);
    3. `AI_MODEL` — the existing global, still honoured everywhere it was honoured before;
    4. the built-in default for the class.

  DEFAULTS ARE NOT A COST DECISION. Every class defaults to what it used before — Opus 5 — except
  `router`, which classifies one sentence into one label and has been Haiku since 0061. Moving a
  workload to a cheaper model changes answer quality, which is the company's decision to make, not
  this file's: it is one environment variable away, and the Buddy console reports what each class
  actually costs so the decision can be made on evidence.
*/

export type TaskClass =
  | "router"     // classify one message into one intent — smallest, fastest, called on the hot path
  | "chat"       // GHL Buddy itself: tools, judgement, the person is waiting
  | "reasoning"  // incidents, blocker traces, risk analysis — correctness over cost
  | "extract"    // structured output against a schema (meeting notes → decisions and actions)
  | "summary"    // briefs, digests, project summaries — cached, not latency-critical
  | "bulk";      // anything fanned out over many rows

const ENV_KEY: Record<TaskClass, string> = {
  router: "AI_ROUTER_MODEL",
  chat: "AI_MODEL_CHAT",
  reasoning: "AI_MODEL_REASONING",
  extract: "AI_MODEL_EXTRACT",
  summary: "AI_MODEL_SUMMARY",
  bulk: "AI_MODEL_BULK",
};

const CLASS_DEFAULT: Partial<Record<TaskClass, string>> = {
  // One sentence in, one label out. Nothing here benefits from a larger model, and it sits in front
  // of every auto-routed question, so latency is the binding constraint.
  router: "claude-haiku-4-5",
};

export type ModelPick = { model: string; source: "override" | "class_env" | "global_env" | "default" };

export function pickModel(task: TaskClass, opts?: { override?: string | null }): ModelPick {
  const override = opts?.override?.trim();
  if (override) return { model: override, source: "override" };
  const byClass = process.env[ENV_KEY[task]]?.trim();
  if (byClass) return { model: byClass, source: "class_env" };
  /*
    A class default outranks the global `AI_MODEL` deliberately, and `router` is the only class that
    has one: it classifies a sentence into a label on the hot path, so pointing the whole product at
    a larger model should not silently make every auto-routed question slower. `AI_ROUTER_MODEL`
    moves it.
  */
  const classDefault = CLASS_DEFAULT[task];
  if (classDefault) return { model: classDefault, source: "default" };
  const global = process.env.AI_MODEL?.trim();
  if (global) return { model: global, source: "global_env" };
  return { model: "claude-opus-5", source: "default" };
}

/**
 * Not every model takes every parameter, and the failure is a 400 rather than a degraded answer.
 * Haiku 4.5 rejects `output_config.effort` outright — the kind of thing that is discovered in
 * production unless one place owns it.
 */
export function supportsEffort(model: string) {
  return !/^claude-haiku/i.test(model) && !/^claude-3/i.test(model);
}

/** Build `output_config` for a model: effort only where it is accepted, plus anything else passed. */
export function outputConfig(model: string, effort?: Effort, extra?: Record<string, unknown>) {
  return { ...(supportsEffort(model) && effort ? { effort } : {}), ...(extra || {}) };
}

/*
  Prices live in `pricing.ts`, which carries no `server-only` marker so the Buddy console can turn
  token counts into money in the browser. Re-exported here so server callers have one import.
*/
export { PRICE_PER_MTOK, estimateCostUsd } from "./pricing";
