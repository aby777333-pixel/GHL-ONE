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
    const err = new Error(json.error || `AI request failed (${res.status})`) as Error & { disabled?: boolean };
    err.disabled = !!json.disabled || res.status === 503;
    throw err;
  }
  return json as T;
}
