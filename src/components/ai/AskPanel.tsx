"use client";

import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { format } from "date-fns";
import { Sparkles, X, History, Plus, Send, Check, ListChecks, Gavel, Video, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, Field, Input, Kbd, Menu, MenuItem, Pill, Spinner, Textarea, useToast } from "@/components/ui";
import { PersonPicker, PriorityPicker, ProjectPicker } from "@/components/pickers";
import { callAI, type AIProposal, type AskResponse } from "@/lib/ai/types";
import { ago, cn, isManagerPlus, type TaskPriority } from "@/lib/utils";
import { AIDisabledNote } from "./AIDisabledNote";
import { AIMarkdown } from "./AIMarkdown";
import { useAIStatus } from "./useAIStatus";

/* ------------------------------------------------------------------ types */
type Source = { link: string; title: string };
type Msg = { key: string; role: "user" | "assistant"; content: string; proposals?: AIProposal[]; sources?: Source[] };
type Conv = { id: string; title: string | null; updated_at: string };
type Scope = { projectId?: string; channelId?: string; taskId?: string };
type DraftStatus = "pending" | "creating" | "created" | "dismissed";
type Draft = {
  kind: AIProposal["kind"];
  title: string;
  description: string;
  assignee: string;
  due: string;
  priority: TaskPriority;
  project: string;
  reason: string;
  status: DraftStatus;
  link?: string;
};
type PersonLite = { id: string; full_name: string };

const CONV_KEY = "ghl.ai.conversation";
const EMPLOYEE_PROMPTS = ["What should I work on today?", "What am I waiting for?", "Summarise my week"];
const MANAGER_PROMPTS = [
  "What's going wrong this week?",
  "Who is overloaded?",
  "What requires my approval?",
  "Which projects are likely to miss their deadlines?",
  "Give me a five-minute briefing before the management meeting",
  "What changed since yesterday?",
];

/* ---------------------------------------------------------------- helpers */
function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}
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
function scopeFor(pathname: string): Scope {
  const m = /^\/(projects|tasks|chat)\/([^/?#]+)/.exec(pathname || "");
  if (!m || m[2] === "new") return {};
  if (m[1] === "projects") return { projectId: m[2] };
  if (m[1] === "tasks") return { taskId: m[2] };
  return { channelId: m[2] };
}
function scopePrompts(scope: Scope): string[] {
  if (scope.projectId) return ["Summarise this project", "What's blocking this project?", "Who owns the late items here?"];
  if (scope.taskId) return ["Why is this late?", "What does this task depend on?", "Draft a status update for this task"];
  if (scope.channelId) return ["Catch me up on this channel", "What was decided here?", "Any open requests for me in this channel?"];
  return [];
}
function matchPerson(name: string | null | undefined, people: PersonLite[]) {
  if (!name) return "";
  const n = name.trim().toLowerCase();
  if (!n) return "";
  const exact = people.find((p) => p.full_name.toLowerCase() === n);
  if (exact) return exact.id;
  const first = people.filter((p) => p.full_name.toLowerCase().split(/\s+/)[0] === n);
  if (first.length === 1) return first[0].id;
  const partial = people.filter((p) => p.full_name.toLowerCase().includes(n));
  return partial.length === 1 ? partial[0].id : "";
}
async function fetchHistory(): Promise<Conv[]> {
  const { data } = await createClient().from("ai_conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(15);
  return (data as Conv[]) || [];
}
async function fetchMessages(id: string, people: PersonLite[]): Promise<{ msgs: Msg[]; drafts: Record<string, Draft>; error?: string }> {
  const { data, error } = await createClient().from("ai_messages").select("id,role,content,proposals,sources").eq("conversation_id", id).order("created_at");
  if (error) return { msgs: [], drafts: {}, error: error.message };
  const msgs: Msg[] = (data || []).map((r) => ({
    key: r.id,
    role: r.role === "assistant" ? "assistant" : "user",
    content: r.content,
    proposals: Array.isArray(r.proposals) && r.proposals.length ? (r.proposals as unknown as AIProposal[]) : undefined,
    sources: Array.isArray(r.sources) && r.sources.length ? (r.sources as unknown as Source[]) : undefined,
  }));
  const drafts: Record<string, Draft> = {};
  for (const m of msgs) m.proposals?.forEach((p, i) => { drafts[`${m.key}:${i}`] = toDraft(p, people); });
  return { msgs, drafts };
}
function toDraft(p: AIProposal, people: PersonLite[]): Draft {
  const known = p.assignee_id && people.some((x) => x.id === p.assignee_id) ? p.assignee_id : "";
  const assignee = known || matchPerson(p.assignee_name, people);
  let due = "";
  if (p.due_date) {
    const d = new Date(p.due_date);
    if (!Number.isNaN(d.getTime())) due = format(d, "yyyy-MM-dd'T'HH:mm");
  }
  return {
    kind: p.kind,
    title: p.title || "",
    description: p.description || "",
    assignee,
    due,
    priority: p.priority || "normal",
    project: p.project_id || "",
    reason: p.reason || "",
    status: "pending",
  };
}

/* ------------------------------------------------------------------ panel */
export function AskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, people } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const status = useAIStatus();
  const mounted = React.useSyncExternalStore(() => () => {}, () => true, () => false);

  const [conversationId, setConversationId] = React.useState<string | null>(readStoredConv);
  const [loadedConv, setLoadedConv] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [history, setHistory] = React.useState<Conv[]>([]);
  const [projects, setProjects] = React.useState<{ id: string; name: string }[] | null>(null);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [disabled, setDisabled] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const scope = React.useMemo(() => scopeFor(pathname), [pathname]);
  const manager = isManagerPlus(profile.role);
  const hasDrafts = Object.keys(drafts).length > 0;
  const aiOff = status.enabled === false && !status.loading;
  const loadingConv = !!conversationId && loadedConv !== conversationId;

  // Escape closes, lock body scroll, focus composer
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
  }, [open, onClose]);

  // Conversation history (own rows via RLS)
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchHistory().then((rows) => alive && setHistory(rows));
    return () => {
      alive = false;
    };
  }, [open]);

  // Load the messages of the active conversation once (re-runs when the user switches conversations)
  React.useEffect(() => {
    if (!open || !conversationId || loadedConv === conversationId) return;
    let alive = true;
    const id = conversationId;
    fetchMessages(id, people).then((r) => {
      if (!alive) return;
      setMessages(r.msgs);
      setDrafts(r.drafts);
      if (r.error) setError(r.error);
      setLoadedConv(id);
    });
    return () => {
      alive = false;
    };
  }, [open, conversationId, loadedConv, people]);

  // Projects for proposal pickers (loaded once, only when needed)
  React.useEffect(() => {
    if (!hasDrafts || projects) return;
    let alive = true;
    createClient().from("projects").select("id,name").eq("archived", false).order("name").then(({ data }) => {
      if (alive) setProjects(data || []);
    });
    return () => {
      alive = false;
    };
  }, [hasDrafts, projects]);

  // Keep the newest message in view
  React.useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, open]);

  const newConversation = () => {
    setConversationId(null);
    setLoadedConv(null);
    storeConv(null);
    setMessages([]);
    setDrafts({});
    setError(null);
    inputRef.current?.focus();
  };
  const selectConversation = (id: string) => {
    if (id === conversationId) return;
    setConversationId(id);
    storeConv(id);
    setMessages([]);
    setDrafts({});
    setError(null);
  };

  const send = React.useCallback(
    async (text: string) => {
      const msg = text.trim();
      if (!msg || pending) return;
      setError(null);
      setInput("");
      setMessages((m) => [...m, { key: uid(), role: "user", content: msg }]);
      setPending(true);
      try {
        const res = await callAI<AskResponse>("ask", { message: msg, conversationId: conversationId || undefined, scope });
        const key = uid();
        setLoadedConv(res.conversationId);
        if (res.conversationId !== conversationId) {
          setConversationId(res.conversationId);
          storeConv(res.conversationId);
        }
        const proposals = Array.isArray(res.proposals) && res.proposals.length ? res.proposals : undefined;
        const sources = Array.isArray(res.sources) && res.sources.length ? res.sources : undefined;
        setMessages((m) => [...m, { key, role: "assistant", content: res.answer || "I could not find anything relevant.", proposals, sources }]);
        if (proposals) {
          setDrafts((d) => {
            const n = { ...d };
            proposals.forEach((p, i) => { n[`${key}:${i}`] = toDraft(p, people); });
            return n;
          });
        }
        fetchHistory().then(setHistory);
      } catch (e) {
        const err = e as Error & { disabled?: boolean };
        if (err.disabled) setDisabled(true);
        else setError(err.message || "Something went wrong. Please try again.");
      } finally {
        setPending(false);
      }
    },
    [pending, conversationId, scope, people]
  );

  const updateDraft = (key: string, d: Draft) => setDrafts((s) => ({ ...s, [key]: d }));
  const dismissDraft = (key: string) => setDrafts((s) => ({ ...s, [key]: { ...s[key], status: "dismissed" } }));

  const createDraft = async (key: string, d: Draft): Promise<boolean> => {
    if (d.status !== "pending") return false;
    if (d.kind === "meeting") {
      setDrafts((s) => ({ ...s, [key]: { ...s[key], status: "created", link: "/meetings" } }));
      onClose();
      router.push(`/meetings?new=1&title=${encodeURIComponent(d.title)}`);
      return true;
    }
    if (!d.title.trim()) {
      toast.push("Give it a title first", "danger");
      return false;
    }
    setDrafts((s) => ({ ...s, [key]: { ...s[key], status: "creating" } }));
    const supabase = createClient();
    if (d.kind === "task") {
      const { data, error: err } = await supabase
        .from("tasks")
        .insert({
          org_id: profile.org_id!,
          title: d.title.trim(),
          description: d.description || null,
          project_id: d.project || null,
          department_id: profile.department_id || null,
          assignee_id: d.assignee || null,
          owner_id: profile.id,
          delegated_by: d.assignee && d.assignee !== profile.id ? profile.id : null,
          approver_id: null,
          requires_approval: false,
          due_date: d.due ? new Date(d.due).toISOString() : null,
          priority: d.priority,
          created_by: profile.id,
          status: "todo",
        })
        .select("id")
        .single();
      if (err || !data) {
        toast.push(err?.message || "Could not create task", "danger");
        setDrafts((s) => ({ ...s, [key]: { ...s[key], status: "pending" } }));
        return false;
      }
      toast.push("Task created", "success");
      router.refresh();
      setDrafts((s) => ({ ...s, [key]: { ...s[key], status: "created", link: `/tasks/${data.id}` } }));
      return true;
    }
    const { data, error: err } = await supabase
      .from("decisions")
      .insert({
        org_id: profile.org_id!,
        title: d.title.trim(),
        decision: d.description?.trim() || d.title.trim(),
        reason: d.reason || null,
        project_id: d.project || null,
        decided_by: profile.id,
      })
      .select("id")
      .single();
    if (err || !data) {
      toast.push(err?.message || "Could not record decision", "danger");
      setDrafts((s) => ({ ...s, [key]: { ...s[key], status: "pending" } }));
      return false;
    }
    toast.push("Decision recorded", "success");
    router.refresh();
    setDrafts((s) => ({ ...s, [key]: { ...s[key], status: "created", link: `/decisions/${data.id}` } }));
    return true;
  };

  const createAll = async (msgKey: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const key = `${msgKey}:${i}`;
      const d = drafts[key];
      if (!d || d.status !== "pending" || d.kind === "meeting") continue;
      await createDraft(key, d);
    }
  };

  const suggestions = React.useMemo(() => {
    const base = manager ? [...EMPLOYEE_PROMPTS, ...MANAGER_PROMPTS] : EMPLOYEE_PROMPTS;
    return { page: scopePrompts(scope), base };
  }, [manager, scope]);

  const showDisabled = aiOff || disabled;

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal aria-label="Ask GHL">
      <div className="absolute inset-0 bg-black/40 anim-fade-in" onClick={onClose} />
      <div className="relative card anim-pop flex flex-col h-full max-h-[100dvh] overflow-hidden rounded-none border-y-0 border-r-0 w-full sm:w-[min(100vw,480px)]" style={{ boxShadow: "var(--shadow-lg)" }}>
        {/* Header */}
        <div className="flex items-center gap-2.5 px-3 sm:px-4 h-[55px] border-b shrink-0">
          <span className="w-8 h-8 rounded-[9px] flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))" }}>
            <Sparkles size={16} />
          </span>
          <div className="min-w-0 flex items-center gap-2">
            <span className="font-semibold tracking-tight">Ask GHL</span>
            {status.loading ? null : status.enabled ? (
              <Pill tone="tone-neutral" className="hidden sm:inline-flex max-w-[150px] truncate num">{status.model || "AI"}</Pill>
            ) : (
              <Pill tone="tone-warn">Not configured</Pill>
            )}
          </div>
          <div className="ml-auto flex items-center gap-0.5 shrink-0">
            <Menu
              width={280}
              trigger={
                <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Conversation history" title="History">
                  <History size={16} />
                </button>
              }
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
            <Button variant="ghost" size="sm" icon onClick={newConversation} aria-label="New conversation" title="New conversation">
              <Plus size={16} />
            </Button>
            <Button variant="ghost" size="sm" icon onClick={onClose} aria-label="Close">
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3">
          {showDisabled ? (
            <AIDisabledNote />
          ) : loadingConv ? (
            <div className="flex items-center justify-center py-10"><Spinner /></div>
          ) : messages.length === 0 ? (
            <div className="space-y-4 anim-fade-in">
              <p className="text-sm text-muted">Ask about your tasks, projects, people, decisions and chat. Answers only use what you are allowed to see, and anything I propose waits for your confirmation.</p>
              {suggestions.page.length > 0 && <PromptGroup title="This page" prompts={suggestions.page} onPick={send} />}
              <PromptGroup title={manager ? "For you and your team" : "Try asking"} prompts={suggestions.base} onPick={send} />
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.key} className="flex justify-end">
                    <div className="max-w-[88%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm whitespace-pre-wrap break-words" style={{ background: "var(--brand)", color: "var(--brand-fg)" }}>{m.content}</div>
                  </div>
                ) : (
                  <div key={m.key} className="flex gap-2.5">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0 mt-1" style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))" }}><Sparkles size={12} /></span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <AIMarkdown source={m.content} className="text-sm" onNavigate={onClose} />
                      {m.sources && (
                        <div className="flex flex-wrap gap-1.5">
                          {m.sources.map((s) => (
                            <Link key={s.link} href={s.link} onClick={onClose} className="pill tone-neutral max-w-full hover:border-[var(--line-strong)]" title={s.title}>
                              <ExternalLink size={10} /> <span className="truncate">{s.title}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                      {m.proposals && (
                        <ProposalGroup
                          msgKey={m.key}
                          count={m.proposals.length}
                          drafts={drafts}
                          projects={projects || undefined}
                          onChange={updateDraft}
                          onCreate={createDraft}
                          onDismiss={dismissDraft}
                          onCreateAll={createAll}
                          onNavigate={onClose}
                        />
                      )}
                    </div>
                  </div>
                )
              )}
              {pending && (
                <div className="flex gap-2.5 anim-fade-in">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0 mt-1 animate-pulse" style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))" }}><Sparkles size={12} /></span>
                  <div className="text-sm text-muted inline-flex items-center gap-1.5 py-1.5">
                    Thinking
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
          <div className="border-t px-3 sm:px-4 pt-3 pb-3 safe-b shrink-0 bg-[var(--bg-elev)]">
            {error && <div className="text-xs text-danger mb-2 break-words">{error}</div>}
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={Math.min(6, Math.max(1, input.split("\n").length))}
                placeholder={scope.projectId ? "Ask about this project…" : scope.taskId ? "Ask about this task…" : scope.channelId ? "Ask about this channel…" : "Ask anything about your work…"}
                className="flex-1 !min-h-[44px] !resize-none !py-[11px]"
                aria-label="Message"
              />
              <Button variant="primary" icon onClick={() => send(input)} disabled={!input.trim() || pending} aria-label="Send" className="!w-11 !h-11 shrink-0">
                <Send size={16} />
              </Button>
            </div>
            <div className="hidden sm:flex items-center gap-2 mt-2 text-[11px] text-muted">
              <span><Kbd>Enter</Kbd> send</span>
              <span><Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> new line</span>
              <span className="ml-auto"><Kbd>Ctrl</Kbd> <Kbd>J</Kbd> toggle</span>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------- sub-parts */
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

function ProposalGroup({ msgKey, count, drafts, projects, onChange, onCreate, onDismiss, onCreateAll, onNavigate }: {
  msgKey: string;
  count: number;
  drafts: Record<string, Draft>;
  projects?: { id: string; name: string }[];
  onChange: (key: string, d: Draft) => void;
  onCreate: (key: string, d: Draft) => Promise<boolean>;
  onDismiss: (key: string) => void;
  onCreateAll: (msgKey: string, count: number) => Promise<void>;
  onNavigate: () => void;
}) {
  const keys = Array.from({ length: count }, (_, i) => `${msgKey}:${i}`);
  const items = keys.map((k) => [k, drafts[k]] as const).filter((x): x is readonly [string, Draft] => !!x[1]);
  if (items.length === 0) return null;
  const pendingCount = items.filter(([, d]) => d.status === "pending" && d.kind !== "meeting").length;
  const creating = items.some(([, d]) => d.status === "creating");
  return (
    <div className="rounded-[var(--radius)] border bg-[var(--bg-sunken)] p-2 space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="eyebrow">Proposed actions · {items.length}</span>
        {pendingCount > 1 && (
          <Button size="xs" variant="secondary" loading={creating} onClick={() => onCreateAll(msgKey, count)}>
            <Check size={12} /> Create all ({pendingCount})
          </Button>
        )}
      </div>
      {items.map(([k, d]) => (
        <ProposalCard key={k} draft={d} projects={projects} onChange={(nd) => onChange(k, nd)} onCreate={() => onCreate(k, d)} onDismiss={() => onDismiss(k)} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

const KIND_META: Record<AIProposal["kind"], { label: string; icon: React.ReactNode; cta: string }> = {
  task: { label: "Task", icon: <ListChecks size={11} />, cta: "Create task" },
  decision: { label: "Decision", icon: <Gavel size={11} />, cta: "Record decision" },
  meeting: { label: "Meeting", icon: <Video size={11} />, cta: "Schedule" },
};

function ProposalCard({ draft, projects, onChange, onCreate, onDismiss, onNavigate }: {
  draft: Draft;
  projects?: { id: string; name: string }[];
  onChange: (d: Draft) => void;
  onCreate: () => void;
  onDismiss: () => void;
  onNavigate: () => void;
}) {
  const meta = KIND_META[draft.kind];
  if (draft.status === "dismissed") {
    return <div className="text-xs text-muted px-2 py-1 line-through truncate">{meta.label}: {draft.title}</div>;
  }
  if (draft.status === "created") {
    return (
      <div className="card px-3 py-2 flex items-center gap-2 text-sm">
        <Check size={15} className="text-success shrink-0" />
        <span className="min-w-0 flex-1 truncate">{draft.title}</span>
        {draft.link && (
          <Link href={draft.link} onClick={onNavigate} className="btn btn-secondary btn-xs shrink-0">Open</Link>
        )}
      </div>
    );
  }
  return (
    <div className="card p-3 space-y-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <Pill tone="tone-violet"><span className="inline-flex items-center gap-1">{meta.icon}{meta.label}</span></Pill>
        {draft.reason && <span className="text-[11px] text-muted truncate" title={draft.reason}>{draft.reason}</span>}
      </div>
      <Input value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} placeholder="Title" aria-label="Title" />
      {draft.kind === "task" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Assign to"><PersonPicker value={draft.assignee} onChange={(v) => onChange({ ...draft, assignee: v })} /></Field>
          <Field label="Priority"><PriorityPicker value={draft.priority} onChange={(v) => onChange({ ...draft, priority: v })} /></Field>
          <Field label="Deadline"><Input type="datetime-local" value={draft.due} onChange={(e) => onChange({ ...draft, due: e.target.value })} /></Field>
          <Field label="Project"><ProjectPicker value={draft.project} onChange={(v) => onChange({ ...draft, project: v })} projects={projects} /></Field>
        </div>
      )}
      {draft.kind === "decision" && (
        <div className="grid grid-cols-1 gap-2">
          <Field label="Decision"><Textarea value={draft.description} onChange={(e) => onChange({ ...draft, description: e.target.value })} placeholder="What was decided" className="!min-h-[56px]" /></Field>
          <Field label="Reason"><Input value={draft.reason} onChange={(e) => onChange({ ...draft, reason: e.target.value })} placeholder="Why (optional)" /></Field>
          <Field label="Project"><ProjectPicker value={draft.project} onChange={(v) => onChange({ ...draft, project: v })} projects={projects} /></Field>
        </div>
      )}
      {draft.kind === "task" && draft.description && <p className="text-xs text-muted truncate-2" title={draft.description}>{draft.description}</p>}
      {draft.kind === "meeting" && draft.description && <p className="text-xs text-muted truncate-2">{draft.description}</p>}
      <div className="flex justify-end gap-2 pt-0.5">
        <Button size="sm" variant="ghost" onClick={onDismiss} disabled={draft.status === "creating"}>Dismiss</Button>
        <Button size="sm" variant="primary" onClick={onCreate} loading={draft.status === "creating"}>{meta.cta}</Button>
      </div>
    </div>
  );
}
