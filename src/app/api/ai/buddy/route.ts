import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { withAI, str } from "@/lib/ai/route";
import { AI_MODEL, getAI, logUsage } from "@/lib/ai/client";
import { BUDDY_MODES, BUDDY_SYSTEM, BUDDY_TONES } from "@/lib/ai/buddyPrompts";
import { todayIST } from "@/lib/ai/context";
import { attachmentBlocks, buildTools, loadAssistants, nextSuggestions, parseConfidence, pickAssistant, scopeContext, type BuddyToolState } from "@/lib/ai/buddy";
import { maxEffort, routeBuddy } from "@/lib/ai/orchestrator";
import { isManagerPlus, isLeadPlus } from "@/lib/utils";
import type { BuddyAssistantKey, BuddyAttachment, BuddyMode, BuddyRequest, BuddyResponse, BuddyScope } from "@/lib/ai/types";

export const maxDuration = 120;

const MODES = new Set<BuddyMode>(["chat", "stuck", "debug", "practice", "check", "prepare", "explain_simple", "explain_technical", "breakdown", "who_can_help", "what_next", "looking_at", "why_blocked", "translate", "draft", "incident", "brief"]);

/** POST /api/ai/buddy — GHL Buddy: role-aware, permission-aware, mode-driven work companion. Proposes; never executes. */
export async function POST(req: Request) {
  return withAI(req, async (ctx, body) => {
    const b = body as Partial<BuddyRequest>;
    const message = str(b.message).trim();
    const attachments = (Array.isArray(b.attachments) ? b.attachments : []) as BuddyAttachment[];
    if (!message && !attachments.length) throw new Error("Empty message");
    const scope = (b.scope && typeof b.scope === "object" ? b.scope : {}) as BuddyScope;
    const started = Date.now();

    /*
      Orchestration (0061). A quick action is an instruction, not a hint: when the person pressed
      one, `explicitMode` is it and routing only annotates. "chat" — what the composer sends when
      they simply typed something — is what "Auto" has always meant, and is now where the
      orchestrator reads the question and decides the mode, the persona hint and the effort.
    */
    const explicitMode: BuddyMode | null = MODES.has(b.mode as BuddyMode) && b.mode !== "chat" ? (b.mode as BuddyMode) : null;
    const routing = await routeBuddy({ message, explicitMode, scope, attachments });
    const mode: BuddyMode = routing.mode;

    // Who is asking → which assistant
    const [{ data: me }, assistants] = await Promise.all([
      ctx.db.from("profiles").select("joined_at,department_id,department:departments(slug,name),role,designation,full_name,timezone").eq("id", ctx.userId).maybeSingle(),
      loadAssistants(ctx),
    ]);
    const dept = (me?.department as unknown as { slug: string; name: string } | null) || null;
    // The person's own persona choice wins; otherwise the orchestrator's hint is offered to
    // pickAssistant, which still checks the assistant is enabled and allowed for this department.
    const assistant = pickAssistant(assistants, { override: (b.assistant as BuddyAssistantKey) || routing.assistant || null, role: ctx.role, departmentId: ctx.departmentId, departmentSlug: dept?.slug || null, joinedAt: me?.joined_at || null });
    if (!assistant.enabled) return { error: "GHL Buddy is switched off for your department. Ask your admin." };

    // Daily limit
    let limit: BuddyResponse["limit"] = null;
    if (assistant.daily_limit) {
      const { data: used } = await ctx.db.rpc("ai_requests_today");
      limit = { used: Number(used || 0), max: assistant.daily_limit };
      if (limit.used >= assistant.daily_limit) return NextResponse.json({ error: `Daily limit reached (${assistant.daily_limit} requests). Your admin can raise it in the AI control center.` }, { status: 429 });
    }

    // Conversation persistence
    let convId = str(b.conversationId) || null;
    if (convId) {
      const { data: own } = await ctx.db.from("ai_conversations").select("id").eq("id", convId).maybeSingle();
      if (!own) convId = null;
    }
    if (!convId) {
      const { data: conv } = await ctx.db.from("ai_conversations").insert({ org_id: ctx.orgId, user_id: ctx.userId, title: (message || attachments[0]?.name || "Buddy").slice(0, 80), scope: scope as never, assistant_key: assistant.key, mode }).select("id").single();
      convId = conv!.id;
    }
    const [{ data: history }, { data: memory }] = await Promise.all([
      ctx.db.from("ai_messages").select("role,content").eq("conversation_id", convId).order("created_at").limit(16),
      ctx.db.from("ai_memory").select("key,value").eq("user_id", ctx.userId).limit(12),
    ]);

    const state: BuddyToolState = { used: [], proposals: [], restricted: [], sources: new Map() };
    const isManager = isManagerPlus(ctx.role);
    const isLead = isLeadPlus(ctx.role);
    const tools = buildTools(ctx, assistant, state, { departmentId: ctx.departmentId, isManager, isLead });
    const pageNote = await scopeContext(ctx, scope, state.used);
    const memNote = (memory || []).map((m) => `- ${m.key}: ${(m.value as { text?: string })?.text || JSON.stringify(m.value)}`).join("\n");

    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: "text", text: BUDDY_SYSTEM, cache_control: { type: "ephemeral" } },
      { type: "text", text: `ASSISTANT PERSONA (${assistant.name}): ${assistant.personality}\nAction level: ${assistant.action_level} (1 answer · 2 suggest · 3 draft · 4 prepare · 5 execute with confirmation · 6 automatic under approved workflow).` },
    ];
    const modeNote = BUDDY_MODES[mode] || "";
    const toneNote = b.tone ? BUDDY_TONES[b.tone] || "" : "";
    const langNote = b.language ? `Answer in ${b.language}. Keep names, ids and links unchanged.` : "";

    const userIntro = [
      `Signed-in person: ${me?.full_name || ctx.name} (id ${ctx.userId}) · ${me?.designation || ctx.role} · role ${ctx.role} · department ${dept?.name || "none"}${ctx.departmentId ? ` (id ${ctx.departmentId})` : ""}. Today (IST): ${todayIST()}.`,
      scope.path ? `Current page: ${scope.path}` : "",
      pageNote,
      memNote ? `PERSONAL WORKING CONTEXT (their own notes, not company policy):\n${memNote}` : "",
      routing.plan.focus ? `INTENT (auto-detected from the question — trust their words over this): ${routing.intent}. ${routing.plan.focus}` : "",
      modeNote, toneNote, langNote,
    ].filter(Boolean).join("\n\n");

    const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: `${userIntro}\n\n${message || "(see attachment)"}` }, ...attachmentBlocks(attachments)];
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...((history || []).map((h) => ({ role: h.role as "user" | "assistant", content: h.content })) as Anthropic.Beta.BetaMessageParam[]),
      { role: "user", content },
    ];

    const ai = getAI();
    const final = await ai.beta.messages.toolRunner({
      model: assistant.model || AI_MODEL,
      max_tokens: 3000,
      system,
      // The per-mode floor is exactly what it was; routing may raise it for work that deserves more
      // thinking (an incident, a blocker trace), never lower it.
      output_config: { effort: maxEffort(mode === "debug" || mode === "check" || mode === "incident" ? "medium" : "low", routing.plan.effort) },
      tools,
      messages,
      max_iterations: 7,
    });

    const raw = final.stop_reason === "refusal"
      ? "I can't help with that request. [confidence: insufficient]"
      : final.content.filter((x): x is Anthropic.Beta.BetaTextBlock => x.type === "text").map((x) => x.text).join("\n").trim() || "I could not find anything relevant. [confidence: insufficient]";
    const { answer, confidence } = parseConfidence(raw);

    // Human handoff affordances (always available — AI must never be a barrier)
    const handoff: BuddyResponse["handoff"] = [];
    for (const u of state.used.filter((x) => x.kind === "person").slice(0, 3)) handoff.push({ kind: "person", id: u.id, label: `Chat with ${u.title}` });
    for (const u of state.used.filter((x) => x.kind === "department").slice(0, 2)) handoff.push({ kind: "department", id: u.id, label: `Ask ${u.title}` });
    if (!handoff.length) handoff.push({ kind: "help", label: "Ask a department for help" });

    const attMeta = attachments.map((a) => ({ kind: a.kind, name: a.name, size: "data" in a ? a.data.length : a.text.length }));
    const { data: inserted } = await ctx.db.from("ai_messages").insert([
      { conversation_id: convId, role: "user", content: message || `(attachment: ${attachments.map((a) => a.name).join(", ")})`, mode, attachments: attMeta.length ? attMeta : null },
      { conversation_id: convId, role: "assistant", content: answer, proposals: state.proposals.length ? (state.proposals as never) : null, sources: [...state.sources.entries()].slice(0, 12).map(([link, title]) => ({ link, title })) as never, confidence, context: state.used as never, mode, routing: { intent: routing.intent, mode, assistant: assistant.key, source: routing.source, confidence: routing.confidence, signals: routing.signals } as never },
    ]).select("id,role");
    const messageId = (inserted || []).find((m) => m.role === "assistant")?.id || null;
    if (state.proposals.length) {
      await ctx.db.from("ai_actions").insert(state.proposals.map((p) => ({ org_id: ctx.orgId, user_id: ctx.userId, conversation_id: convId, message_id: messageId, kind: p.kind, payload: p as never, status: "proposed" })));
    }
    await ctx.db.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
    await logUsage(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, feature: `buddy:${mode}`, usage: final.usage, latencyMs: Date.now() - started, model: assistant.model || AI_MODEL });

    const res: BuddyResponse = {
      conversationId: convId,
      messageId,
      assistant: { key: assistant.key as BuddyAssistantKey, name: assistant.name, actionLevel: assistant.action_level },
      mode,
      answer,
      confidence,
      context: state.used.slice(0, 12),
      proposals: assistant.action_level >= 3 ? state.proposals : [],
      restricted: state.restricted,
      suggestions: nextSuggestions(mode),
      handoff,
      limit: limit ? { used: limit.used + 1, max: limit.max } : null,
      routing: { intent: routing.intent, mode, assistant: routing.assistant, source: routing.source, confidence: routing.confidence, signals: routing.signals },
    };
    return res;
  });
}
