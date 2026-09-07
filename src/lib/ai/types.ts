/** Client-safe types for AI API responses (no server imports). */

export type AIProposal = {
  kind: "task" | "decision" | "meeting";
  title: string;
  description?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  due_date?: string | null;
  priority?: "critical" | "urgent" | "high" | "normal" | "low" | null;
  project_id?: string | null;
  reason?: string | null;
};

export type AskResponse = { conversationId: string; answer: string; proposals: AIProposal[]; sources: { link: string; title: string }[] };

export type BriefResponse = { markdown: string; cached: boolean; generatedAt: string };

export type MeetingExtract = {
  summary: string;
  key_points: string[];
  decisions: { title: string; decision: string; reason: string | null }[];
  action_items: { title: string; owner_id: string | null; owner_name: string | null; due_date: string | null; priority: "critical" | "urgent" | "high" | "normal" | "low" }[];
  open_questions: string[];
  risks: string[];
  people_mentioned: string[];
};

export type ExtractedTasks = {
  tasks: { title: string; description: string | null; assignee_id: string | null; assignee_name: string | null; due_date: string | null; priority: "critical" | "urgent" | "high" | "normal" | "low"; depends_on_index: number | null }[];
  summary: string;
};

export type DelegationAI = {
  summary: string;
  project_id: string | null;
  deadline: string | null;
  approver_needed: boolean;
  steps: { title: string; description: string | null; department_id: string | null; assignee_id: string | null; due_date: string | null; priority: "critical" | "urgent" | "high" | "normal" | "low"; depends_on_previous: boolean; final: boolean }[];
};

export type SearchAIResponse = { answer: string; terms: string[]; results: { kind: string; id: string; title: string; subtitle: string | null; link: string }[] };

export type AIError = { error: string; disabled?: boolean };

/** Small fetch helper for client components. Throws Error(message) on failure. */
export async function callAI<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/ai/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const json = (await res.json().catch(() => ({}))) as T & AIError;
  if (!res.ok) {
    const err = new Error(json.error || `AI request failed (${res.status})`) as Error & { disabled?: boolean; status?: number };
    err.disabled = !!json.disabled || res.status === 503;
    err.status = res.status;
    throw err;
  }
  return json as T;
}

/* ---------------------------------------------------------------- GHL Buddy ---- */

export type BuddyMode =
  | "chat" | "stuck" | "debug" | "practice" | "check" | "prepare" | "explain_simple" | "explain_technical"
  | "breakdown" | "who_can_help" | "what_next" | "looking_at" | "why_blocked" | "translate" | "draft" | "incident" | "brief";

export type BuddyAssistantKey = "general" | "it" | "sales" | "support" | "design" | "content" | "hr" | "manager" | "department_head" | "new_joiner";

export type BuddyAttachment =
  | { kind: "image"; name: string; mime: string; data: string }               // base64 png/jpeg/webp/gif, ≤ 4 MB
  | { kind: "document"; name: string; mime: "application/pdf"; data: string } // base64 pdf ≤ 8 MB
  | { kind: "text"; name: string; text: string };                             // pasted logs / error text / forwarded message

export type BuddyScope = { path?: string; projectId?: string; channelId?: string; taskId?: string; helpId?: string; fileId?: string; meetingId?: string; personId?: string };

export type BuddyRequest = {
  message: string;
  mode?: BuddyMode;
  assistant?: BuddyAssistantKey;      // override the auto-selected persona
  conversationId?: string | null;
  scope?: BuddyScope;
  attachments?: BuddyAttachment[];
  tone?: "professional" | "friendly" | "concise" | "technical" | "simple";
  language?: string;                  // e.g. "Tamil", "Hindi" — answer in this language
};

export type BuddyContextItem = { kind: "task" | "project" | "channel" | "knowledge" | "person" | "department" | "help_request" | "file" | "meeting" | "decision" | "my_work" | "hr" | "memory"; id?: string | null; title: string; link?: string | null };

export type BuddyRestrictedHit = { resource_type: string; resource_id: string; label: string; approver_id: string | null; classification: string | null };

export type BuddyActionKind = "task" | "decision" | "meeting" | "help_request" | "leave_request" | "bug_report" | "message_draft" | "knowledge_article" | "access_request" | "bring_in" | "escalation" | "war_room" | "focus" | "learning";

export type BuddyProposal = {
  kind: BuddyActionKind;
  title: string;
  description?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  due_date?: string | null;
  priority?: "critical" | "urgent" | "high" | "normal" | "low" | null;
  project_id?: string | null;
  department_id?: string | null;      // help_request / escalation / war_room target
  service_id?: string | null;         // help desk service
  channel_id?: string | null;         // message_draft / bring_in
  person_id?: string | null;          // bring_in
  resource_type?: string | null;      // access_request
  resource_id?: string | null;
  body?: string | null;               // message_draft / knowledge_article body / bug report details
  fields?: Record<string, string> | null;   // structured extras (steps, expected, actual, severity, environment, leave_type, from, to…)
  reason?: string | null;
};

export type BuddyResponse = {
  conversationId: string;
  messageId: string | null;
  assistant: { key: BuddyAssistantKey; name: string; actionLevel: number };
  mode: BuddyMode;
  answer: string;
  confidence: "high" | "needs_confirmation" | "insufficient";
  context: BuddyContextItem[];
  proposals: BuddyProposal[];
  restricted: BuddyRestrictedHit[];
  suggestions: string[];              // follow-up prompts to show as buttons
  handoff: { kind: "person" | "department" | "help" | "chat"; id?: string | null; label: string }[];  // human handoff — AI is never a barrier
  limit?: { used: number; max: number } | null;
};

export type BuddyStatus = { enabled: boolean; assistant: BuddyAssistantKey; name: string; actionLevel: number; dailyLimit: number | null; usedToday: number; isNewJoiner: boolean; departmentSlug: string | null };
