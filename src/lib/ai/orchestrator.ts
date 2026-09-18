import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Effort } from "./client";
import type { BuddyAssistantKey, BuddyAttachment, BuddyIntent, BuddyMode, BuddyRoutingInfo, BuddyScope } from "./types";

/*
  The Buddy intelligence orchestrator.

  Before this, "Auto · picks by your role" was literally all it did: `pickAssistant()` reads role,
  department and tenure, and the *question* was never looked at. A developer in Sales asking about a
  500 error got the Sales persona and a chat-mode prompt; someone typing "why is this stuck?" got no
  blocker trace unless they happened to press the right quick-action button first.

  This layer reads the request — the words, the page the person is on, what they attached — and
  decides the intent, which persona should answer, which mode's instructions apply and how much
  thinking the answer is worth.

  Three rules keep it additive and safe:

  1. **An explicit quick action always wins.** If the person pressed I'M STUCK or Explain simply,
     that is not a hint to be second-guessed. Routing then only annotates (for the console) and may
     *raise* effort, never lower it or change the mode.
  2. **The persona hint is a suggestion to `pickAssistant`, not an override of it.** It travels as
     its `override` argument, which already checks `enabled` and the department allow-list and falls
     back when the assistant is not available to this person. Routing can therefore never hand
     somebody a persona they were not already entitled to, and it never touches `action_level` — the
     ceiling on what Buddy may propose stays exactly where the administrator set it.
  3. **Rules first, model second.** The keyword pass is free, instant and predictable, and settles
     the overwhelming majority of questions. Only a genuinely ambiguous sentence costs a model call,
     and that call is Haiku with a 6-second timeout whose failure mode is "use the rules result".
*/

/** What the person is actually trying to do. Wider than `BuddyMode` — several intents share a mode. */
const INTENTS = [
  "work_ranking", "waiting_on", "blocker", "who_can_help", "policy_knowledge", "coding", "incident",
  "hr_self_service", "meeting_prep", "writing", "translate", "learning", "analysis", "org_structure",
  "screen_help", "personal_support", "general_knowledge", "unclear",
] as const;

type Plan = { mode: BuddyMode; assistant: BuddyAssistantKey | null; effort: Effort; focus: string | null };

/** intent → how Buddy should answer it. The mode carries the existing prompt instructions unchanged. */
const PLAN: Record<BuddyIntent, Plan> = {
  work_ranking:      { mode: "what_next",         assistant: null,     effort: "low",    focus: null },
  waiting_on:        { mode: "what_next",         assistant: null,     effort: "low",    focus: "They are asking what is waiting on them — lead with get_waiting_on_me." },
  blocker:           { mode: "why_blocked",       assistant: null,     effort: "medium", focus: null },
  who_can_help:      { mode: "who_can_help",      assistant: null,     effort: "low",    focus: null },
  policy_knowledge:  { mode: "chat",              assistant: null,     effort: "low",    focus: "A 'how do we / what is the policy' question — search_knowledge first, and say plainly if there is no approved answer." },
  coding:            { mode: "debug",             assistant: "it",     effort: "medium", focus: null },
  incident:          { mode: "incident",          assistant: "it",     effort: "high",   focus: null },
  hr_self_service:   { mode: "chat",              assistant: "hr",     effort: "low",    focus: "Their own HR data — use get_my_hr rather than guessing entitlements." },
  meeting_prep:      { mode: "prepare",           assistant: null,     effort: "medium", focus: null },
  writing:           { mode: "draft",             assistant: "content", effort: "low",   focus: null },
  translate:         { mode: "translate",         assistant: null,     effort: "low",    focus: null },
  learning:          { mode: "explain_simple",    assistant: null,     effort: "low",    focus: "They want to learn, not just be told — explain, then offer the next step." },
  analysis:          { mode: "breakdown",         assistant: null,     effort: "medium", focus: null },
  org_structure:     { mode: "chat",              assistant: null,     effort: "low",    focus: "An organisation question — answer only from the org tools, never from memory." },
  screen_help:       { mode: "looking_at",        assistant: null,     effort: "low",    focus: null },
  personal_support:  { mode: "chat",              assistant: null,     effort: "low",    focus: "Be supportive and practical. You are a colleague, not a therapist or a doctor: no diagnosis, and keep a human path open." },
  general_knowledge: { mode: "chat",              assistant: null,     effort: "low",    focus: "A general question with no company answer behind it. Answer it directly and say when it is general knowledge rather than company policy." },
  unclear:           { mode: "chat",              assistant: null,     effort: "low",    focus: null },
};

/** Phrases that mean an intent. Deliberately specific: "code" alone also appears in "dress code". */
const RULES: { intent: BuddyIntent; weight: number; re: RegExp }[] = [
  { intent: "work_ranking", weight: 3, re: /\b(what should i (do|work on)|what'?s next|my day|prioriti[sz]e|where do i start|todo list|top priority)\b/i },
  { intent: "work_ranking", weight: 2, re: /\b(my tasks|my work today|plan my day|end of day)\b/i },

  { intent: "waiting_on", weight: 3, re: /\b(waiting (on|for) me|awaiting my|needs? my (approval|sign[- ]?off)|what am i waiting for|pending (on|with) me)\b/i },
  { intent: "waiting_on", weight: 2, re: /\b(approvals?|sign[- ]?off)\b.*\b(mine|me|my)\b/i },

  { intent: "blocker", weight: 3, re: /\b(why is (this|it|.*) (blocked|stuck|delayed|late)|what'?s blocking|who is blocking|held up|not moving)\b/i },
  { intent: "blocker", weight: 2, re: /\b(blocked|blocker|bottleneck|stalled)\b/i },

  { intent: "who_can_help", weight: 3, re: /\b(who (can|should) (help|i ask|do i ask|handle)|who knows|who owns|who is responsible|who handles|whom do i)\b/i },
  { intent: "who_can_help", weight: 2, re: /\b(is anyone (free|available)|on duty|find (someone|an expert))\b/i },

  { intent: "policy_knowledge", weight: 3, re: /\b(what is (the|our) (policy|process|procedure)|how do we|is there an? (sop|policy|guide|template)|company policy|as per policy)\b/i },
  { intent: "policy_knowledge", weight: 2, re: /\b(sop|guideline|policy|process for|standard practice)\b/i },

  { intent: "coding", weight: 4, re: /\b(stack ?trace|traceback|null pointer|undefined is not|cannot read propert\w+|segmentation fault|syntax ?error|type ?error|referenceerror|econnrefused|cors|500 error|404 error)\b/i },
  { intent: "coding", weight: 3, re: /\b(debug|bug in|the code|my code|this code|function|api (call|endpoint|error)|database|sql query|supabase|postgres|rls|deploy(ment)? (failed|error)|build (failed|error)|git|merge conflict|typescript|javascript|react|next\.?js|npm|docker)\b/i },
  { intent: "coding", weight: 2, re: /\b(error|exception|fails?|failing|crash(ed|ing)?|not working)\b/i },
  { intent: "coding", weight: 3, re: /```|\bconsole\.(log|error)\b|\bselect .* from \b/i },

  { intent: "incident", weight: 4, re: /\b(is down|outage|everyone is affected|production is|site is down|nothing is working|urgent(ly)? broken|critical failure|data loss|security breach|we are hacked)\b/i },

  { intent: "hr_self_service", weight: 4, re: /\b(how many leaves?|leave balance|casual leave|sick leave|apply for leave|my attendance|am i clocked in|clock ?in|payslip|salary slip|my training|probation|comp ?off|holiday list)\b/i },

  { intent: "meeting_prep", weight: 3, re: /\b(prepare me|prep(are)? for (the|my|this)|before (the|my) (meeting|call|review)|agenda for|what should i ask|brief me (on|for))\b/i },

  { intent: "writing", weight: 3, re: /\b(write (a|an|the|me)|draft (a|an|the|me)|reply to|compose|rephrase|reword|proof ?read|make it (shorter|longer|formal|polite)|email to)\b/i },

  { intent: "translate", weight: 4, re: /\b(translate|in (tamil|hindi|telugu|malayalam|kannada|marathi|bengali|gujarati|urdu|arabic|french|spanish|german)\b)/i },

  { intent: "learning", weight: 4, re: /\b(teach me|i want to learn|help me learn|learn (react|python|sql|excel|to )|how do i get better at)\b/i },
  { intent: "learning", weight: 3, re: /\b(explain (how|what|why)|what does .* mean|how does .* work|i don'?t understand|beginner|for a beginner)\b/i },

  { intent: "analysis", weight: 3, re: /\b(break (this|it) down|break down|step by step|split into tasks|what are the steps|plan for|estimate|compare|pros and cons|analy[sz]e)\b/i },

  { intent: "org_structure", weight: 4, re: /\b(who reports to|reporting line|my manager|org chart|hierarchy|what if .* (is|are) (away|absent|on leave)|team size|who approves)\b/i },

  { intent: "screen_help", weight: 3, re: /\b(what (is|am i looking at) this (page|screen)?|what does this (page|screen|button)|why is this red|what should i do here|explain this (page|screen))\b/i },

  { intent: "personal_support", weight: 3, re: /\b(i'?m (stressed|overwhelmed|anxious|burnt ?out|exhausted|frustrated|worried)|too much work|can'?t cope|motivate me|feeling low|need a break|help me think clearly)\b/i },

  { intent: "general_knowledge", weight: 2, re: /\b(what is the capital|who invented|convert \d|how many (km|kg|miles)|weather|recipe|meaning of the word)\b/i },
];

/** Small, boring helpers. */
const ORDER: Effort[] = ["low", "medium", "high"];
export function maxEffort(a: Effort, b: Effort): Effort {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

function scoreRules(text: string) {
  const scores = new Map<BuddyIntent, number>();
  const signals: string[] = [];
  for (const r of RULES) {
    const m = text.match(r.re);
    if (!m) continue;
    scores.set(r.intent, (scores.get(r.intent) || 0) + r.weight);
    if (signals.length < 6) signals.push(`${r.intent}:"${m[0].slice(0, 28).toLowerCase()}"`);
  }
  return { scores, signals };
}

/** Where the person is and what they attached is evidence too — often better evidence than the words. */
function scoreContext(scores: Map<BuddyIntent, number>, signals: string[], scope: BuddyScope, attachments: BuddyAttachment[], text: string) {
  const bump = (i: BuddyIntent, n: number, why: string) => { scores.set(i, (scores.get(i) || 0) + n); if (signals.length < 8) signals.push(why); };
  const vague = /\b(this|it|that|here|these)\b/i.test(text) || text.length < 24;

  if (scope.taskId && /\b(blocked|stuck|why|late|delay)\b/i.test(text)) bump("blocker", 3, "scope:task+why");
  if (scope.meetingId) bump("meeting_prep", 2, "scope:meeting");
  if (scope.channelId && /\b(reply|respond|answer|draft)\b/i.test(text)) bump("writing", 2, "scope:channel+reply");
  if (scope.path && vague && /\b(what|explain|how)\b/i.test(text)) bump("screen_help", 3, "scope:page+vague");
  if (attachments.some((a) => a.kind === "image")) bump("screen_help", 2, "attachment:image");
  if (attachments.some((a) => a.kind === "text" && /error|exception|at \w+\.|\bstack\b/i.test(a.text || ""))) bump("coding", 4, "attachment:log");
  if (attachments.some((a) => a.kind === "document")) bump("analysis", 2, "attachment:document");
}

/**
 * The classifier of last resort. Only reached when the rules are genuinely undecided, so a slow or
 * failed call costs the answer nothing — the rules result stands. Haiku 4.5 does not accept
 * `output_config.effort` (it returns 400), so only the format goes in `output_config`.
 */
const RouterSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
  focus: z.string().max(140).nullable().describe("One short line telling the answering model what the person actually wants, or null."),
});

const ROUTER_SYSTEM = `You classify one message from an employee to their company AI assistant. Reply only with the structured output.

intents:
work_ranking — what should I do / what matters today
waiting_on — what is waiting on me, my approvals
blocker — why is something stuck, late or blocked
who_can_help — who knows, who owns, who can help
policy_knowledge — how do we do X, what is the policy, is there an SOP
coding — code, errors, logs, databases, deployments, technical debugging
incident — something is down or broken for many people right now
hr_self_service — their own leave, attendance, payslip, training, probation
meeting_prep — prepare me for a meeting, call or review
writing — write, draft, reply, rephrase
translate — translate something
learning — teach me, explain a concept, I want to understand
analysis — break this down, plan, compare, estimate
org_structure — reporting lines, who approves, what if someone is away
screen_help — what is this page / screen / thing in front of me
personal_support — stress, overwhelm, motivation, thinking clearly
general_knowledge — a general question with no company answer behind it
unclear — greeting, chit-chat, or too little to tell

Judge what the person wants, not which words appear. The message may be in any language.`;

async function classifyWithModel(message: string, scopePath: string | null): Promise<{ intent: BuddyIntent; confidence: number; focus: string | null } | null> {
  try {
    // Imported here rather than at the top so the rules path — which settles most questions — pulls
    // in no client at all, and so the routing decision can be exercised on its own.
    const { getAI } = await import("./client");
    const { pickModel } = await import("./models");
    const routerModel = pickModel("router").model;
    const ai = getAI();
    const res = await ai.messages.parse(
      {
        model: routerModel,
        max_tokens: 256,
        system: ROUTER_SYSTEM,
        output_config: { format: zodOutputFormat(RouterSchema) },
        messages: [{ role: "user", content: `${scopePath ? `They are on the page ${scopePath}.\n` : ""}Message: ${message.slice(0, 1500)}` }],
      },
      { timeout: 6000 },
    );
    if (res.stop_reason === "refusal" || !res.parsed_output) return null;
    return res.parsed_output as { intent: BuddyIntent; confidence: number; focus: string | null };
  } catch {
    // A router that fails must be invisible: the rules answer stands and the person gets their reply.
    return null;
  }
}

export async function routeBuddy(params: {
  message: string;
  /** The mode the person chose by pressing a quick action. "chat" and undefined both mean "you decide". */
  explicitMode: BuddyMode | null;
  scope: BuddyScope;
  attachments: BuddyAttachment[];
}): Promise<BuddyRoutingInfo & { plan: Plan }> {
  const text = params.message || "";
  const { scores, signals } = scoreRules(text);
  scoreContext(scores, signals, params.scope, params.attachments, text);

  let best: BuddyIntent = "unclear";
  let top = 0;
  let second = 0;
  for (const [intent, score] of scores) {
    if (score > top) { second = top; top = score; best = intent; }
    else if (score > second) second = score;
  }
  // Confident when the leader is strong AND clear of the runner-up. Two intents tied at 3 is exactly
  // the case worth spending a model call on.
  let confidence = top === 0 ? 0 : Math.min(1, (top / 6) * (1 - Math.min(0.5, second / Math.max(top, 1)) ));
  let source: BuddyRoutingInfo["source"] = top === 0 ? "fallback" : "rules";
  let focus = PLAN[best].focus;

  if (params.explicitMode) {
    /*
      The person pressed a button. That is the answer, and the request must behave exactly as it did
      before this file existed: the mode they chose, no persona hint, no intent note in the prompt,
      and the effort floor that mode has always carried ("low" here is the floor the route applies,
      so `maxEffort` leaves it alone). The intent is still computed and recorded, because "which
      questions arrive behind which button" is precisely what the console needs to know.
    */
    return {
      intent: best, mode: params.explicitMode, assistant: null, source: "explicit_mode",
      confidence: Math.round(confidence * 100) / 100, signals,
      plan: { mode: params.explicitMode, assistant: null, effort: "low", focus: null },
    };
  }

  if (confidence < 0.45 && text.trim().length >= 24 && !!process.env.ANTHROPIC_API_KEY && process.env.AI_ROUTER !== "off") {
    const guess = await classifyWithModel(text, params.scope.path || null);
    if (guess && guess.confidence >= confidence) {
      best = guess.intent;
      confidence = guess.confidence;
      focus = guess.focus || PLAN[best].focus;
      source = "model";
      signals.push("model");
    }
  }

  const plan = { ...PLAN[best], focus };
  return {
    intent: best,
    mode: plan.mode,
    assistant: plan.assistant,
    source,
    confidence: Math.round(confidence * 100) / 100,
    signals,
    plan,
  };
}
