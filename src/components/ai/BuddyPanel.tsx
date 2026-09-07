"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { History, ImagePlus, LifeBuoy, Plus, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, Menu, MenuItem, Pill, Spinner } from "@/components/ui";
import { callAI, type BuddyAssistantKey, type BuddyMode, type BuddyProposal, type BuddyRequest, type BuddyResponse, type BuddyScope, type BuddyContextItem } from "@/lib/ai/types";
import { ago, cn, isManagerPlus } from "@/lib/utils";
import { AIDisabledNote } from "./AIDisabledNote";
import { useAIStatus } from "./useAIStatus";
import { BuddyMessage, type BuddyMsg } from "./BuddyMessage";
import { BuddyComposer, fileToAttachment, uid, type PendingAttachment } from "./BuddyComposer";
import { BAR_MODES, LANGUAGES, MODE_META, plainText, scopeEntity, scopeFor, scopeKey, type ScopeEntity } from "./buddyModes";
import { closeBuddy, consumeBuddyRequest, useBuddy, type BuddyOpenOptions } from "./buddyStore";

export { useBuddy, openBuddy, closeBuddy, toggleBuddy } from "./buddyStore";

/* ------------------------------------------------------------------ types & helpers ---- */

type Conv = { id: string; title: string | null; updated_at: string; mode: string | null; assistant_key: string | null };
type Assistant = { key: BuddyAssistantKey; name: string; description: string | null; department_ids: string[] | null; action_level: number };
type Tone = NonNullable<BuddyRequest["tone"]>;

const CONV_KEY = "ghl.buddy.conversation";
const PREFS_KEY = "ghl.buddy.prefs";
const EMPLOYEE_PROMPTS = ["What should I work on today?", "What am I waiting for?", "How many leaves do I have left?", "Summarise my week"];
const MANAGER_PROMPTS = ["What's going wrong this week?", "Who is overloaded?", "What requires my approval?", "Give me the department brief"];

function readStoredConv(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(CONV_KEY);
  } catch {
    return null;
  }
}
function storeConv(id: string | null) {
  try {
    if (id) sessionStorage.setItem(CONV_KEY, id);
    else sessionStorage.removeItem(CONV_KEY);
  } catch {}
}
type Prefs = { tone: Tone; language: string; readAloud: boolean; persona: string };
function readPrefs(): Prefs {
  const d: Prefs = { tone: "friendly", language: "English", readAloud: false, persona: "auto" };
  if (typeof window === "undefined") return d;
  try {
    return { ...d, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as Partial<Prefs>) };
  } catch {
    return d;
  }
}
function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {}
}

function scopePrompts(scope: BuddyScope): string[] {
  if (scope.taskId) return ["Why is this late?", "What does this task depend on?", "Draft a status update for this task"];
  if (scope.projectId) return ["Summarise this project", "What's blocking this project?", "Who owns the late items here?"];
  if (scope.channelId) return ["Catch me up on this conversation", "What was decided here?", "Any open requests for me here?"];
  if (scope.helpId) return ["What's the status of this request?", "What should I do next on it?"];
  if (scope.fileId) return ["What is this file for?", "Who owns this file?"];
  if (scope.meetingId) return ["Prepare me for this meeting", "What did we decide last time?"];
  if (scope.personId) return ["What are they working on?", "How can I best hand something to them?"];
  return [];
}

async function fetchHistory(): Promise<Conv[]> {
  const { data } = await createClient().from("ai_conversations").select("id,title,updated_at,mode,assistant_key").order("updated_at", { ascending: false }).limit(20);
  return (data as Conv[]) || [];
}
async function fetchMessages(id: string): Promise<{ msgs: BuddyMsg[]; error?: string }> {
  const { data, error } = await createClient().from("ai_messages").select("id,role,content,proposals,sources,confidence,context,mode,attachments").eq("conversation_id", id).order("created_at");
  if (error) return { msgs: [], error: error.message };
  return {
    msgs: (data || []).map((r) => ({
      key: r.id,
      id: r.id,
      role: r.role === "assistant" ? "assistant" : "user",
      content: r.content,
      mode: (r.mode as BuddyMode | null) || null,
      confidence: (r.confidence as BuddyMsg["confidence"]) || null,
      context: Array.isArray(r.context) ? (r.context as unknown as BuddyContextItem[]) : undefined,
      proposals: Array.isArray(r.proposals) && r.proposals.length ? (r.proposals as unknown as BuddyProposal[]) : undefined,
      sources: Array.isArray(r.sources) && r.sources.length ? (r.sources as unknown as { link: string; title: string }[]) : undefined,
      attachments: Array.isArray(r.attachments) ? (r.attachments as unknown as { kind: string; name: string }[]) : undefined,
    })),
  };
}

/* ------------------------------------------------------------------ panel ---- */

export function BuddyPanel({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: { mode?: BuddyMode; message?: string; scope?: BuddyScope } }) {
  const { profile, departments } = useSession();
  const pathname = usePathname();
  const status = useAIStatus();
  const store = useBuddy();
  const mounted = React.useSyncExternalStore(() => () => {}, () => true, () => false);

  const isOpen = open || store.open;
  const close = React.useCallback(() => {
    onClose();
    closeBuddy();
  }, [onClose]);
  // Ctrl+J (AppShell) toggling `open` off while the store holds it open should still close the panel.
  const prevOpen = React.useRef(open);
  React.useEffect(() => {
    if (prevOpen.current && !open) closeBuddy();
    prevOpen.current = open;
  }, [open]);

  const [conversationId, setConversationId] = React.useState<string | null>(readStoredConv);
  const [loadedConv, setLoadedConv] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<BuddyMsg[]>([]);
  const [history, setHistory] = React.useState<Conv[]>([]);
  const [assistants, setAssistants] = React.useState<Assistant[] | null>(null);
  const [prefs, setPrefs] = React.useState<Prefs>(readPrefs);
  const [input, setInput] = React.useState("");
  const [attachments, setAttachments] = React.useState<PendingAttachment[]>([]);
  const [mode, setMode] = React.useState<BuddyMode>("chat");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [disabled, setDisabled] = React.useState(false);
  const [limit, setLimit] = React.useState<BuddyResponse["limit"]>(null);
  const [answeredBy, setAnsweredBy] = React.useState<BuddyResponse["assistant"] | null>(null);
  const [scopeOverride, setScopeOverride] = React.useState<BuddyScope | null>(null);
  const [droppedScope, setDroppedScope] = React.useState<string>("");
  const [entityTitle, setEntityTitle] = React.useState<{ key: string; title: string } | null>(null);
  const [speaking, setSpeaking] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const initialApplied = React.useRef(false);

  const pageScope = React.useMemo(() => scopeFor(pathname), [pathname]);
  const rawScope = scopeOverride || pageScope;
  const scopeK = scopeKey(rawScope);
  const scope: BuddyScope = React.useMemo(() => (droppedScope && droppedScope === scopeK ? { path: rawScope.path } : rawScope), [droppedScope, scopeK, rawScope]);
  const entity: ScopeEntity | null = React.useMemo(() => scopeEntity(scope), [scope]);
  const manager = isManagerPlus(profile.role);
  const aiOff = status.enabled === false && !status.loading;
  const showDisabled = aiOff || disabled;
  const loadingConv = !!conversationId && loadedConv !== conversationId;

  const updatePrefs = (patch: Partial<Prefs>) => setPrefs((p) => { const n = { ...p, ...patch }; savePrefs(n); return n; });

  /* ---------- open/close chrome */
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [isOpen, close]);

  /* ---------- history, assistants */
  React.useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    fetchHistory().then((rows) => alive && setHistory(rows));
    return () => {
      alive = false;
    };
  }, [isOpen]);
  React.useEffect(() => {
    if (!isOpen || assistants) return;
    let alive = true;
    createClient().from("ai_assistants").select("key,name,description,department_ids,action_level").eq("enabled", true).order("position").then(({ data }) => {
      if (!alive) return;
      const mine = profile.department_id;
      setAssistants(((data || []) as Assistant[]).filter((a) => !a.department_ids || !mine || a.department_ids.includes(mine)));
    });
    return () => {
      alive = false;
    };
  }, [isOpen, assistants, profile.department_id]);

  /* ---------- conversation messages */
  React.useEffect(() => {
    if (!isOpen || !conversationId || loadedConv === conversationId) return;
    let alive = true;
    const id = conversationId;
    fetchMessages(id).then((r) => {
      if (!alive) return;
      setMessages(r.msgs);
      if (r.error) setError(r.error);
      setLoadedConv(id);
    });
    return () => {
      alive = false;
    };
  }, [isOpen, conversationId, loadedConv]);

  /* ---------- scope entity title */
  React.useEffect(() => {
    if (!entity) return;
    const key = `${entity.kind}:${entity.id}`;
    let alive = true;
    const supabase = createClient();
    const q =
      entity.kind === "task" ? supabase.from("tasks").select("title").eq("id", entity.id).maybeSingle().then((r) => r.data?.title)
      : entity.kind === "project" ? supabase.from("projects").select("name").eq("id", entity.id).maybeSingle().then((r) => r.data?.name)
      : entity.kind === "channel" ? supabase.from("channels").select("name,type").eq("id", entity.id).maybeSingle().then((r) => (r.data ? (r.data.type === "dm" ? "Direct message" : `#${r.data.name}`) : undefined))
      : entity.kind === "help_request" ? supabase.from("help_requests").select("title").eq("id", entity.id).maybeSingle().then((r) => r.data?.title)
      : entity.kind === "file" ? supabase.from("files").select("name").eq("id", entity.id).maybeSingle().then((r) => r.data?.name)
      : entity.kind === "meeting" ? supabase.from("meetings").select("title").eq("id", entity.id).maybeSingle().then((r) => r.data?.title)
      : supabase.from("profiles").select("full_name").eq("id", entity.id).maybeSingle().then((r) => r.data?.full_name);
    q.then((title) => {
      if (alive && title) setEntityTitle({ key, title });
    });
    return () => {
      alive = false;
    };
  }, [entity]);

  /* ---------- keep newest in view */
  React.useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, isOpen]);

  /* ---------- speech synthesis */
  const speak = React.useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    if (synth.speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(plainText(text).slice(0, 2500));
    u.lang = LANGUAGES.find((l) => l.key === prefs.language)?.speech || "en-IN";
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  }, [prefs.language]);
  React.useEffect(() => {
    if (isOpen) return;
    try {
      window.speechSynthesis?.cancel();
    } catch {}
  }, [isOpen]);

  /* ---------- send */
  const send = React.useCallback(async (text: string, modeOverride?: BuddyMode, extraAttachments?: PendingAttachment[]) => {
    const atts = [...attachments, ...(extraAttachments || [])];
    const useMode = modeOverride || mode;
    const msg = text.trim() || (atts.length ? "" : MODE_META[useMode].prompt);
    if ((!msg && !atts.length) || pending) return;
    setError(null);
    setInput("");
    setAttachments([]);
    setMessages((m) => [...m, { key: uid(), id: null, role: "user", content: msg || "(attachment)", mode: useMode, attachments: atts.map((a) => ({ kind: a.att.kind, name: a.att.name })) }]);
    setPending(true);
    try {
      const body: BuddyRequest = {
        message: msg,
        mode: useMode,
        assistant: prefs.persona !== "auto" ? (prefs.persona as BuddyAssistantKey) : undefined,
        conversationId: conversationId || undefined,
        scope,
        attachments: atts.length ? atts.map((a) => a.att) : undefined,
        tone: prefs.tone,
        language: prefs.language !== "English" ? prefs.language : undefined,
      };
      const res = await callAI<BuddyResponse>("buddy", body);
      setLoadedConv(res.conversationId);
      if (res.conversationId !== conversationId) {
        setConversationId(res.conversationId);
        storeConv(res.conversationId);
      }
      setAnsweredBy(res.assistant);
      setLimit(res.limit || null);
      setMessages((m) => [...m, {
        key: uid(),
        id: res.messageId,
        role: "assistant",
        content: res.answer || "I could not find anything relevant.",
        mode: res.mode,
        confidence: res.confidence,
        context: res.context?.length ? res.context : undefined,
        proposals: res.proposals?.length ? res.proposals : undefined,
        restricted: res.restricted?.length ? res.restricted : undefined,
        suggestions: res.suggestions?.length ? res.suggestions : undefined,
        handoff: res.handoff?.length ? res.handoff : undefined,
        assistant: res.assistant,
        actionLevel: res.assistant.actionLevel,
      }]);
      if (prefs.readAloud) speak(res.answer);
      if (useMode !== "practice" && useMode !== "debug") setMode("chat");
      fetchHistory().then(setHistory);
    } catch (e) {
      const err = e as Error & { disabled?: boolean; status?: number };
      if (err.disabled) setDisabled(true);
      else setError(err.status === 429 ? `${err.message} Meanwhile, the people below can help.` : err.message || "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }, [attachments, mode, pending, prefs, conversationId, scope, speak]);
  const sendRef = React.useRef(send);
  React.useEffect(() => {
    sendRef.current = send;
  }, [send]);

  /* ---------- requests from openBuddy() / initial prop */
  const applyRequest = React.useCallback((r: BuddyOpenOptions) => {
    if (r.scope) setScopeOverride(r.scope);
    const m = r.mode || "chat";
    setMode(m);
    const extra: PendingAttachment[] = (r.attachments || []).map((att) => ({ id: uid(), att, size: "data" in att ? att.data.length : att.text.length }));
    if (r.send || (r.mode && MODE_META[m].autoSend && !r.message)) {
      void sendRef.current(r.message || MODE_META[m].prompt, m, extra);
    } else {
      if (r.message) setInput(r.message);
      if (extra.length) setAttachments((a) => [...a, ...extra]);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, []);
  const reqNonce = store.request?.nonce;
  React.useEffect(() => {
    if (!reqNonce || !store.request) return;
    const r = store.request;
    const t = setTimeout(() => {
      applyRequest(r);
      consumeBuddyRequest(r.nonce);
    }, 0);
    return () => clearTimeout(t);
  }, [reqNonce, store.request, applyRequest]);
  React.useEffect(() => {
    if (!open || !initial || initialApplied.current) return;
    initialApplied.current = true;
    const t = setTimeout(() => applyRequest(initial), 0);
    return () => clearTimeout(t);
  }, [open, initial, applyRequest]);
  // A page navigation clears any scope handed in by openBuddy so the pill always reflects where you are.
  const lastPath = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    const t = setTimeout(() => {
      setScopeOverride(null);
      setDroppedScope("");
    }, 0);
    return () => clearTimeout(t);
  }, [pathname]);

  /* ---------- conversation switching */
  const newConversation = () => {
    setConversationId(null);
    setLoadedConv(null);
    storeConv(null);
    setMessages([]);
    setError(null);
    setMode("chat");
    inputRef.current?.focus();
  };
  const selectConversation = (id: string) => {
    if (id === conversationId) return;
    setConversationId(id);
    storeConv(id);
    setMessages([]);
    setError(null);
  };

  /* ---------- drag & drop */
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    for (const f of files) {
      const r = await fileToAttachment(f);
      if (typeof r === "string") setError(r);
      else setAttachments((a) => (a.length >= 6 ? a : [...a, r]));
    }
  };

  const stuck = () => {
    if (input.trim() || attachments.length) {
      setMode("stuck");
      void send(input, "stuck");
    } else void send("I'm stuck", "stuck");
  };

  const questionBefore = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if (messages[j].role === "user") return messages[j].content;
    return "";
  };

  const dept = departments.find((d) => d.id === profile.department_id);
  const placeholder = entity ? `Ask about this ${entity.label.toLowerCase()}…` : mode !== "chat" ? `${MODE_META[mode].label}: add details (optional) and press Enter` : "Ask anything about your work…";
  const currentAssistant = answeredBy || (prefs.persona !== "auto" ? assistants?.find((a) => a.key === prefs.persona) : null);
  const actionLevel = answeredBy?.actionLevel ?? assistants?.find((a) => a.key === (answeredBy?.key || prefs.persona))?.action_level ?? 5;

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal aria-label="GHL Buddy">
      <div className="absolute inset-0 bg-black/40 anim-fade-in" onClick={close} />
      <div
        className="relative card anim-pop flex flex-col h-full max-h-[100dvh] overflow-hidden rounded-none border-y-0 border-r-0 w-full sm:w-[min(100vw,540px)]"
        style={{ boxShadow: "var(--shadow-lg)" }}
        onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
        onDrop={onDrop}
      >
        {dragging && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg-elev)]/90 border-2 border-dashed border-[var(--brand-2)] m-2 rounded-[var(--radius)] pointer-events-none anim-fade-in">
            <div className="text-sm font-medium inline-flex items-center gap-2"><ImagePlus size={18} className="text-[var(--brand-2)]" /> Drop a screenshot, PDF or text file</div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-2.5 px-3 sm:px-4 h-[55px] border-b shrink-0">
          <span className="w-8 h-8 rounded-[9px] flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))" }}><Sparkles size={16} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold tracking-tight truncate">{currentAssistant?.name || "GHL Buddy"}</span>
              {status.loading ? null : !status.enabled ? <Pill tone="tone-warn">Not configured</Pill> : answeredBy ? <Pill tone="tone-violet" className="hidden sm:inline-flex">answering</Pill> : null}
            </div>
            <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-muted">
              {assistants && assistants.length > 1 ? (
                <select value={prefs.persona} onChange={(e) => updatePrefs({ persona: e.target.value })} className="bg-transparent outline-none max-w-[160px] truncate cursor-pointer hover:text-[var(--fg)]" aria-label="Choose which buddy answers">
                  <option value="auto">Auto · picks by your role</option>
                  {assistants.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
                </select>
              ) : (
                <span className="truncate">{dept ? `Your work companion · ${dept.name}` : "Your work companion"}</span>
              )}
              {entity && (
                <span className="pill tone-neutral max-w-[190px] !h-5 !text-[10px] hidden sm:inline-flex" title={`Using this ${entity.label.toLowerCase()} as context`}>
                  <span className="truncate">Context: {entity.label} “{entityTitle?.key === `${entity.kind}:${entity.id}` ? entityTitle.title : "…"}”</span>
                  <button type="button" onClick={() => setDroppedScope(scopeK)} className="ml-0.5 hover:text-[var(--fg)]" aria-label="Drop page context"><X size={10} /></button>
                </span>
              )}
              {!entity && droppedScope && droppedScope === scopeK && scopeEntity(rawScope) && (
                <button type="button" onClick={() => setDroppedScope("")} className="hidden sm:inline text-[10px] underline decoration-dotted">use page context</button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Menu
              width={300}
              trigger={<button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Conversation history" title="History"><History size={16} /></button>}
            >
              <div className="eyebrow px-2.5 pt-1.5 pb-1">Recent conversations</div>
              {history.length === 0 ? (
                <div className="px-2.5 py-2 text-xs text-muted">No conversations yet</div>
              ) : (
                history.map((c) => (
                  <MenuItem key={c.id} onClick={() => selectConversation(c.id)}>
                    <span className={cn("truncate flex-1", c.id === conversationId && "font-medium")}>{c.title || "Untitled"}</span>
                    <span className="text-[10px] text-muted shrink-0 num">{ago(c.updated_at)}</span>
                  </MenuItem>
                ))
              )}
            </Menu>
            <Button variant="ghost" size="sm" icon onClick={newConversation} aria-label="New conversation" title="New conversation"><Plus size={16} /></Button>
            <Button variant="ghost" size="sm" icon onClick={close} aria-label="Close"><X size={16} /></Button>
          </div>
        </div>

        {/* Mobile context pill */}
        {entity && (
          <div className="sm:hidden px-3 py-1.5 border-b text-[11px] text-muted flex items-center gap-1.5 min-w-0">
            <span className="truncate">Context: {entity.label} “{entityTitle?.key === `${entity.kind}:${entity.id}` ? entityTitle.title : "…"}”</span>
            <button type="button" onClick={() => setDroppedScope(scopeK)} className="ml-auto btn btn-ghost btn-xs !h-5 !px-1.5" aria-label="Drop page context"><X size={11} /></button>
          </div>
        )}

        {/* Limit banner */}
        {limit && limit.max > 0 && limit.used / limit.max >= 0.8 && (
          <div className={cn("px-3 sm:px-4 py-1.5 text-[11px] border-b", limit.used >= limit.max ? "tone-danger" : "tone-warn")}>
            {limit.used >= limit.max ? `Daily limit reached (${limit.max} requests). Your admin can raise it in the AI control center.` : `You've used ${limit.used} of ${limit.max} Buddy requests today.`}
          </div>
        )}

        {/* Body */}
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3">
          {showDisabled ? (
            <AIDisabledNote />
          ) : loadingConv ? (
            <div className="flex items-center justify-center py-10"><Spinner /></div>
          ) : messages.length === 0 ? (
            <EmptyIntro name={profile.full_name} scopePrompts={scopePrompts(scope)} basePrompts={manager ? [...EMPLOYEE_PROMPTS, ...MANAGER_PROMPTS] : EMPLOYEE_PROMPTS} hasTask={!!scope.taskId} onStuck={stuck} onMode={(m) => { setMode(m); if (MODE_META[m].autoSend) void send("", m); else setTimeout(() => inputRef.current?.focus(), 30); }} onPick={(t) => send(t)} />
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={m.key} className="flex justify-end">
                    <div className="max-w-[88%] space-y-1">
                      {m.mode && m.mode !== "chat" && <div className="text-right text-[10px] text-muted">{MODE_META[m.mode].label}</div>}
                      <div className="rounded-2xl rounded-br-md px-3.5 py-2 text-sm whitespace-pre-wrap break-words" style={{ background: "var(--brand)", color: "var(--brand-fg)" }}>{m.content}</div>
                      {!!m.attachments?.length && <div className="flex flex-wrap gap-1 justify-end">{m.attachments.map((a, j) => <span key={j} className="pill tone-neutral !text-[10px]">{a.kind === "image" ? "🖼" : "📎"} {a.name}</span>)}</div>}
                    </div>
                  </div>
                ) : (
                  <BuddyMessage key={m.key} m={m} question={questionBefore(i)} conversationId={conversationId} actionLevel={actionLevel} onSuggestion={(t) => send(t, m.mode || undefined)} onNavigate={close} onSpeak={speak} speaking={speaking} />
                )
              )}
              {pending && (
                <div className="flex gap-2.5 anim-fade-in">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 mt-0.5 animate-pulse" style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))" }}><Sparkles size={13} /></span>
                  <div className="text-sm text-muted inline-flex items-center gap-1.5 py-1.5">
                    {mode === "stuck" ? "Looking for the fix, the SOP and the right person" : mode === "why_blocked" ? "Tracing the chain" : mode === "who_can_help" ? "Checking who is available" : "Thinking"}
                    <span className="inline-flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "120ms" }} />
                      <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: "240ms" }} />
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        {!showDisabled && (
          <BuddyComposer
            value={input}
            onChange={setInput}
            onSend={() => send(input)}
            pending={pending}
            mode={mode}
            onMode={setMode}
            scope={scope}
            attachments={attachments}
            onAttachments={setAttachments}
            tone={prefs.tone}
            onTone={(t) => updatePrefs({ tone: t })}
            language={prefs.language}
            onLanguage={(l) => updatePrefs({ language: l })}
            readAloud={prefs.readAloud}
            onReadAloud={(v) => updatePrefs({ readAloud: v })}
            inputRef={inputRef}
            placeholder={placeholder}
            error={error}
            onStuck={stuck}
          />
        )}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ empty state ---- */

function EmptyIntro({ name, scopePrompts: page, basePrompts, hasTask, onStuck, onMode, onPick }: { name: string; scopePrompts: string[]; basePrompts: string[]; hasTask: boolean; onStuck: () => void; onMode: (m: BuddyMode) => void; onPick: (t: string) => void }) {
  const first = (name || "").split(" ")[0];
  const modes = BAR_MODES.filter((m) => m !== "stuck" && (!MODE_META[m].needsTask || hasTask)).slice(0, 8);
  return (
    <div className="space-y-4 anim-fade-in">
      <div>
        <div className="font-semibold tracking-tight">Hi {first || "there"} — I&apos;m your work buddy.</div>
        <p className="text-sm text-muted mt-1">I don&apos;t just answer questions — I help you get unstuck and get work moving. I only use what you are allowed to see, I never guess, and anything I propose waits for your confirmation.</p>
      </div>
      <button
        type="button"
        onClick={onStuck}
        className="w-full rounded-[var(--radius)] px-4 py-3.5 text-left text-white flex items-center gap-3 transition-transform active:scale-[.995] hover:brightness-110"
        style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))", boxShadow: "var(--shadow)" }}
      >
        <span className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center shrink-0"><LifeBuoy size={20} /></span>
        <span className="min-w-0">
          <span className="block text-base font-bold tracking-wide">I&apos;M STUCK</span>
          <span className="block text-xs opacity-90">Tell me what you&apos;re trying to do. I&apos;ll find the fix, the SOP and the right person.</span>
        </span>
      </button>
      <div>
        <div className="eyebrow mb-1.5">What I can do</div>
        <div className="grid grid-cols-2 gap-1.5">
          {modes.map((m) => {
            const mm = MODE_META[m];
            return (
              <button key={m} type="button" onClick={() => onMode(m)} className="text-left card card-hover px-2.5 py-2 min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium min-w-0"><mm.icon size={14} className="text-[var(--violet)] shrink-0" /><span className="truncate">{mm.label}</span></span>
                <span className="block text-[11px] text-muted mt-0.5 truncate-2">{mm.hint}</span>
              </button>
            );
          })}
        </div>
      </div>
      {page.length > 0 && <PromptGroup title="This page" prompts={page} onPick={onPick} />}
      <PromptGroup title="Try asking" prompts={basePrompts} onPick={onPick} />
    </div>
  );
}

function PromptGroup({ title, prompts, onPick }: { title: string; prompts: string[]; onPick: (p: string) => void }) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{title}</div>
      <div className="space-y-1.5">
        {prompts.map((p) => (
          <button key={p} type="button" onClick={() => onPick(p)} className="w-full text-left card card-hover px-3 py-2 text-sm flex items-center gap-2">
            <Sparkles size={13} className="text-[var(--accent)] shrink-0" />
            <span className="min-w-0 flex-1">{p}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
