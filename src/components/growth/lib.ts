import type { Tables } from "@/lib/utils";

/* ---------------------------------------------------------- date helpers */
/** ISO ⇄ `datetime-local` (local time). */
export function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : null;
}
export function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
export function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/* ------------------------------------------------------------- feedback */
export type FeedbackRow = Tables<"feedback">;
export const FEEDBACK_KINDS = ["peer", "manager", "project", "self"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = { peer: "Peer feedback", manager: "Manager feedback", project: "Project feedback", self: "Self reflection" };
export const FEEDBACK_KIND_HINT: Record<FeedbackKind, string> = {
  peer: "From one colleague to another. Specific, kind and useful.",
  manager: "From a manager to a team member about their work, growth or conduct.",
  project: "About a person's contribution on a specific project.",
  self: "Notes to yourself about what went well and what you would change.",
};
export const FEEDBACK_VISIBILITY = ["recipient", "manager", "hr"] as const;
export type FeedbackVisibility = (typeof FEEDBACK_VISIBILITY)[number];
export const FEEDBACK_VISIBILITY_LABEL: Record<FeedbackVisibility, string> = { recipient: "Only the recipient", manager: "Recipient and their manager", hr: "Recipient, their manager and HR" };
export const FEEDBACK_VISIBILITY_HINT: Record<FeedbackVisibility, string> = {
  recipient: "Private between you two. Nobody else — not even HR — can read it.",
  manager: "The recipient's manager can read it too, so it can be part of their reviews and 1-on-1s.",
  hr: "Also visible to HR, for formal records such as probation or promotion reviews.",
};

/* ---------------------------------------------------------------- kudos */
export type KudosRow = Tables<"kudos">;
export const KUDOS_CATEGORIES = ["great_work", "team_contribution", "problem_solving", "project_delivery", "cross_department_help"] as const;
export type KudosCategory = (typeof KUDOS_CATEGORIES)[number];
export const KUDOS_LABEL: Record<KudosCategory, string> = { great_work: "Great work", team_contribution: "Team contribution", problem_solving: "Problem solving", project_delivery: "Project delivery", cross_department_help: "Cross-department help" };
export const KUDOS_TONE: Record<KudosCategory, string> = { great_work: "tone-brand", team_contribution: "tone-info", problem_solving: "tone-violet", project_delivery: "tone-success", cross_department_help: "tone-orange" };
export const KUDOS_EMOJI: Record<KudosCategory, string> = { great_work: "🏆", team_contribution: "🤝", problem_solving: "🧩", project_delivery: "🚀", cross_department_help: "🌉" };
export function kudosLabel(c: string) {
  return KUDOS_LABEL[c as KudosCategory] || c.replace(/_/g, " ");
}
export function kudosTone(c: string) {
  return KUDOS_TONE[c as KudosCategory] || "tone-neutral";
}
export function kudosEmoji(c: string) {
  return KUDOS_EMOJI[c as KudosCategory] || "🏆";
}

/* ---------------------------------------------------------- suggestions */
export const SUGGESTION_KINDS = ["process", "tool", "workplace", "other"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];
export const SUGGESTION_KIND_LABEL: Record<SuggestionKind, string> = { process: "Process", tool: "Tool", workplace: "Workplace", other: "Other" };
export const SUGGESTION_STATUSES = ["new", "reviewing", "accepted", "declined"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];
export const SUGGESTION_STATUS_LABEL: Record<SuggestionStatus, string> = { new: "New", reviewing: "Reviewing", accepted: "Accepted", declined: "Declined" };
export const SUGGESTION_STATUS_TONE: Record<SuggestionStatus, string> = { new: "tone-neutral", reviewing: "tone-warn", accepted: "tone-success", declined: "tone-muted" };

/* ------------------------------------------------------------ mentoring */
export type MentorshipRow = Tables<"mentorships">;
export const MENTORSHIP_STATUS_LABEL: Record<string, string> = { requested: "Requested", active: "Active", ended: "Ended", declined: "Declined" };
export const MENTORSHIP_STATUS_TONE: Record<string, string> = { requested: "tone-warn", active: "tone-success", ended: "tone-muted", declined: "tone-muted" };

/* --------------------------------------------------------------- 1-on-1 */
export type OneOnOneRow = Tables<"one_on_ones">;
export type AgendaItem = { text: string; by: string; done: boolean };
export type ActionItem = { text: string; owner_id: string | null; done: boolean; task_id?: string | null };
export const RECURRENCE_LABEL: Record<string, string> = { weekly: "Weekly", biweekly: "Every two weeks", monthly: "Monthly" };
export const RECURRENCE_DAYS: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 30 };
export function asAgenda(v: unknown): AgendaItem[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object").map((x) => ({ text: String(x.text || ""), by: String(x.by || ""), done: !!x.done }));
}
export function asActions(v: unknown): ActionItem[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object").map((x) => ({ text: String(x.text || ""), owner_id: typeof x.owner_id === "string" ? x.owner_id : null, done: !!x.done, task_id: typeof x.task_id === "string" ? x.task_id : null }));
}

/* --------------------------------------------------------------- skills */
export type EndorsementRow = Tables<"skill_endorsements">;
/** Case-insensitive key used to group skills that differ only in casing/whitespace. */
export function skillKey(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
