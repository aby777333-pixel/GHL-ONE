import type { LucideIcon } from "lucide-react";
import { BookOpen, Bug, ClipboardCheck, Compass, Dumbbell, Eye, Languages, LifeBuoy, Lightbulb, ListChecks, Lock, MessageSquare, Pencil, Siren, Sparkles, Users, Wrench } from "lucide-react";
import type { BuddyContextItem, BuddyMode, BuddyScope } from "@/lib/ai/types";

/* ------------------------------------------------------------------ scope from the URL ---- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Derive the Buddy scope from the current route. Always carries `path`. */
export function scopeFor(pathname: string): BuddyScope {
  const scope: BuddyScope = { path: pathname || "/" };
  const m = /^\/(projects|tasks|chat|help|files|meetings|people)\/([^/?#]+)/.exec(pathname || "");
  if (!m || !UUID_RE.test(m[2])) return scope;
  const id = m[2];
  switch (m[1]) {
    case "projects": scope.projectId = id; break;
    case "tasks": scope.taskId = id; break;
    case "chat": scope.channelId = id; break;
    case "help": scope.helpId = id; break;
    case "files": scope.fileId = id; break;
    case "meetings": scope.meetingId = id; break;
    case "people": scope.personId = id; break;
  }
  return scope;
}

export type ScopeEntity = { kind: "task" | "project" | "channel" | "help_request" | "file" | "meeting" | "person"; id: string; label: string };

/** The single entity a scope points at (for the "Context: …" pill). */
export function scopeEntity(scope: BuddyScope | null | undefined): ScopeEntity | null {
  if (!scope) return null;
  if (scope.taskId) return { kind: "task", id: scope.taskId, label: "Task" };
  if (scope.projectId) return { kind: "project", id: scope.projectId, label: "Project" };
  if (scope.channelId) return { kind: "channel", id: scope.channelId, label: "Conversation" };
  if (scope.helpId) return { kind: "help_request", id: scope.helpId, label: "Help request" };
  if (scope.fileId) return { kind: "file", id: scope.fileId, label: "File" };
  if (scope.meetingId) return { kind: "meeting", id: scope.meetingId, label: "Meeting" };
  if (scope.personId) return { kind: "person", id: scope.personId, label: "Person" };
  return null;
}

export function scopeKey(scope: BuddyScope | null | undefined) {
  const e = scopeEntity(scope);
  return e ? `${e.kind}:${e.id}` : "";
}

/** Link for a context item kind when the server did not send one. */
export function contextLink(c: BuddyContextItem): string | null {
  if (c.link) return c.link;
  if (!c.id) return null;
  switch (c.kind) {
    case "task": return `/tasks/${c.id}`;
    case "project": return `/projects/${c.id}`;
    case "channel": return `/chat/${c.id}`;
    case "knowledge": return `/wiki/knowledge/${c.id}`;
    case "person": return `/people/${c.id}`;
    case "help_request": return `/help/${c.id}`;
    case "file": return `/files/${c.id}`;
    case "meeting": return `/meetings/${c.id}`;
    case "decision": return `/decisions/${c.id}`;
    default: return null;
  }
}

/* ------------------------------------------------------------------ modes ---- */

export type ModeMeta = {
  label: string;
  /** One-line explanation shown when the mode is selected. */
  hint: string;
  /** Default message sent when the composer is empty. */
  prompt: string;
  icon: LucideIcon;
  /** Send immediately when chosen with an empty composer (otherwise we wait for input). */
  autoSend: boolean;
  /** Shown in the universal mode bar. */
  bar: boolean;
  /** Only meaningful when the scope carries a task. */
  needsTask?: boolean;
};

export const MODE_META: Record<BuddyMode, ModeMeta> = {
  chat: { label: "Ask", hint: "Ask anything about your work.", prompt: "", icon: MessageSquare, autoSend: false, bar: false },
  stuck: { label: "I'm stuck", hint: "Tell me what you are trying to do — I'll find the fix, the SOP and the right person.", prompt: "I'm stuck", icon: LifeBuoy, autoSend: true, bar: true },
  what_next: { label: "What should I do next", hint: "Ranks your work: overdue, what others wait on, deadlines, approvals, meetings.", prompt: "What should I do next?", icon: Compass, autoSend: true, bar: true },
  looking_at: { label: "What am I looking at", hint: "Explains the current page or screenshot: what it is, what matters, what you can do.", prompt: "What am I looking at?", icon: Eye, autoSend: true, bar: true },
  who_can_help: { label: "Who can help", hint: "Finds the best person, department or SOP — and offers to bring them in.", prompt: "Who can help me with this?", icon: Users, autoSend: true, bar: true },
  why_blocked: { label: "Why is this blocked", hint: "Traces the real chain: who is waiting on whom, for how long, and how to unblock it.", prompt: "Why is this blocked?", icon: Lock, autoSend: true, bar: true, needsTask: true },
  explain_simple: { label: "Explain simply", hint: "Plain words for a non-technical colleague, plus what it means for you.", prompt: "Explain this simply", icon: Lightbulb, autoSend: false, bar: true },
  explain_technical: { label: "Explain technically", hint: "Turns a description into a precise technical version for IT.", prompt: "Explain this technically", icon: Wrench, autoSend: false, bar: true },
  breakdown: { label: "Break this down", hint: "Turns a task into ordered steps with rough effort and who is involved.", prompt: "Break this down into steps", icon: ListChecks, autoSend: true, bar: true },
  check: { label: "Check my work", hint: "Reviews what you paste or attach against your department's checklist.", prompt: "Check my work", icon: ClipboardCheck, autoSend: false, bar: true },
  prepare: { label: "Prepare me", hint: "Briefing for a meeting, call or review: open issues, past decisions, likely questions.", prompt: "Prepare me for this", icon: BookOpen, autoSend: true, bar: true },
  practice: { label: "Practice with me", hint: "Roleplay a client, executive or interviewer, then coach you.", prompt: "Let's practice — play a skeptical client", icon: Dumbbell, autoSend: true, bar: true },
  debug: { label: "Debug with me", hint: "One check at a time: likely cause, what to inspect, what not to change.", prompt: "Debug this with me", icon: Bug, autoSend: false, bar: true },
  draft: { label: "Draft", hint: "Writes a message, reply or document from approved information only.", prompt: "Draft a message for me", icon: Pencil, autoSend: false, bar: true },
  translate: { label: "Translate", hint: "Faithful translation — names and links stay intact.", prompt: "Translate this", icon: Languages, autoSend: false, bar: true },
  incident: { label: "Incident", hint: "Something is down: scope, containment, war room, notify the right team.", prompt: "Something is down", icon: Siren, autoSend: true, bar: false },
  brief: { label: "Daily brief", hint: "Your morning or end-of-day brief from live data.", prompt: "Give me my daily brief", icon: Sparkles, autoSend: true, bar: false },
};

export const BAR_MODES: BuddyMode[] = ["stuck", "what_next", "looking_at", "who_can_help", "why_blocked", "explain_simple", "explain_technical", "breakdown", "check", "prepare", "practice", "debug", "draft", "translate"];

export const TONES: { key: NonNullable<import("@/lib/ai/types").BuddyRequest["tone"]>; label: string }[] = [
  { key: "friendly", label: "Friendly" },
  { key: "professional", label: "Professional" },
  { key: "concise", label: "Concise" },
  { key: "technical", label: "Technical" },
  { key: "simple", label: "Simple" },
];

export const LANGUAGES: { key: string; label: string; speech: string }[] = [
  { key: "English", label: "English", speech: "en-IN" },
  { key: "Tamil", label: "தமிழ் · Tamil", speech: "ta-IN" },
  { key: "Hindi", label: "हिन्दी · Hindi", speech: "hi-IN" },
  { key: "Malayalam", label: "മലയാളം · Malayalam", speech: "ml-IN" },
  { key: "Telugu", label: "తెలుగు · Telugu", speech: "te-IN" },
  { key: "Kannada", label: "ಕನ್ನಡ · Kannada", speech: "kn-IN" },
];

export const CONFIDENCE_META: Record<"high" | "needs_confirmation" | "insufficient", { label: string; tone: string; hint: string }> = {
  high: { label: "High confidence", tone: "tone-success", hint: "Rests on approved knowledge or live system data." },
  needs_confirmation: { label: "Needs confirmation", tone: "tone-warn", hint: "Parts are inferred — confirm before acting on it." },
  insufficient: { label: "Insufficient information", tone: "tone-danger", hint: "No approved answer — don't guess; ask a person." },
};

/** Markdown → plain speech text (for read-aloud). */
export function plainText(md: string) {
  return (md || "")
    .replace(/```[\s\S]*?```/g, " code block omitted ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>]+/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
