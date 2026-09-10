import { clsx, type ClassValue } from "clsx";
import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, isPast, differenceInCalendarDays } from "date-fns";
import type { Database } from "@/lib/database.types";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];

export type Profile = Tables<"profiles">;
export type Department = Tables<"departments">;
export type Project = Tables<"projects">;
export type Task = Tables<"tasks">;
export type Channel = Tables<"channels">;
export type Message = Tables<"messages">;
export type Approval = Tables<"approvals">;
export type Decision = Tables<"decisions">;
export type Meeting = Tables<"meetings">;
export type FileRow = Tables<"files">;
export type Notification = Tables<"notifications">;
export type CalendarEvent = Tables<"calendar_events">;

export type RoleLevel = Enums<"role_level">;
export type TaskStatus = Enums<"task_status">;
export type TaskPriority = Enums<"task_priority">;
export type WaitingOn = Enums<"waiting_on">;
export type ProjectStatus = Enums<"project_status">;
export type ApprovalStatus = Enums<"approval_status">;
export type ApprovalType = Enums<"approval_type">;
export type Classification = Enums<"classification">;

export const ROLE_RANK: Record<RoleLevel, number> = {
  super_admin: 0, director: 1, executive: 2, department_head: 3, manager: 4,
  team_lead: 5, employee: 6, intern: 7, consultant: 8, vendor: 9, guest: 10,
};
export const ROLE_LABEL: Record<RoleLevel, string> = {
  super_admin: "Super Admin", director: "Board / Director", executive: "Executive Management",
  department_head: "Department Head", manager: "Manager", team_lead: "Team Lead", employee: "Employee",
  intern: "Intern", consultant: "External Consultant", vendor: "Vendor", guest: "Guest",
};
export const isAdminRole = (r?: RoleLevel | null) => !!r && ROLE_RANK[r] <= 2;
export const isManagerPlus = (r?: RoleLevel | null) => !!r && ROLE_RANK[r] <= 4;
export const isLeadPlus = (r?: RoleLevel | null) => !!r && ROLE_RANK[r] <= 5;
export const isInternal = (r?: RoleLevel | null) => !!r && ROLE_RANK[r] <= 7;

export const TASK_STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "in_review", "waiting", "blocked", "done", "cancelled"];
export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog", todo: "To do", in_progress: "In progress", in_review: "In review",
  waiting: "Waiting", blocked: "Blocked", done: "Done", cancelled: "Cancelled",
};
export const STATUS_TONE: Record<TaskStatus, string> = {
  backlog: "tone-muted", todo: "tone-neutral", in_progress: "tone-info", in_review: "tone-violet",
  waiting: "tone-warn", blocked: "tone-danger", done: "tone-success", cancelled: "tone-muted",
};

export const PRIORITIES: TaskPriority[] = ["critical", "urgent", "high", "normal", "low"];
export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: "Critical", urgent: "Urgent", high: "High", normal: "Normal", low: "Low",
};
export const PRIORITY_TONE: Record<TaskPriority, string> = {
  critical: "tone-danger", urgent: "tone-orange", high: "tone-warn", normal: "tone-neutral", low: "tone-muted",
};

export const WAITING_LABEL: Record<WaitingOn, string> = {
  none: "Working", employee: "Waiting for employee", manager: "Waiting for manager", client: "Waiting for client",
  vendor: "Waiting for vendor", approval: "Waiting for approval", blocked: "Blocked",
};

export const PROJECT_STATUSES: ProjectStatus[] = ["planning", "active", "on_hold", "at_risk", "delayed", "completed", "cancelled"];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planning", active: "Active", on_hold: "On hold", at_risk: "At risk", delayed: "Delayed", completed: "Completed", cancelled: "Cancelled",
};
export const PROJECT_STATUS_TONE: Record<ProjectStatus, string> = {
  planning: "tone-neutral", active: "tone-info", on_hold: "tone-muted", at_risk: "tone-warn", delayed: "tone-danger", completed: "tone-success", cancelled: "tone-muted",
};

export const APPROVAL_TYPES: ApprovalType[] = ["design", "content", "budget", "purchase", "hiring", "leave", "vendor", "marketing", "campaign", "deployment", "contract", "expense", "investor_material", "other"];
export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "Pending", approved: "Approved", rejected: "Rejected", changes_requested: "Changes requested",
};
export const APPROVAL_STATUS_TONE: Record<ApprovalStatus, string> = {
  pending: "tone-warn", approved: "tone-success", rejected: "tone-danger", changes_requested: "tone-orange",
};

export const CLASSIFICATIONS: Classification[] = ["public", "internal", "confidential", "highly_confidential", "board_only"];
export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  public: "Public", internal: "Internal", confidential: "Confidential", highly_confidential: "Highly confidential", board_only: "Board only",
};

export function humanize(s?: string | null) {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function fmtDate(d?: string | Date | null, withTime = false) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, withTime ? "d MMM yyyy, HH:mm" : "d MMM yyyy");
}

export function fmtTime(d?: string | Date | null) {
  if (!d) return "";
  return format(typeof d === "string" ? new Date(d) : d, "HH:mm");
}

export function relDate(d?: string | Date | null) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isYesterday(date)) return "Yesterday";
  const diff = differenceInCalendarDays(date, new Date());
  if (diff > 0 && diff < 7) return format(date, "EEEE");
  return format(date, "d MMM");
}

export function ago(d?: string | Date | null) {
  if (!d) return "";
  return formatDistanceToNowStrict(typeof d === "string" ? new Date(d) : d, { addSuffix: true });
}

export function isOverdue(due?: string | null, status?: TaskStatus | null) {
  if (!due) return false;
  if (status === "done" || status === "cancelled") return false;
  return isPast(new Date(due));
}

export function dueTone(due?: string | null, status?: TaskStatus | null) {
  if (!due || status === "done" || status === "cancelled") return "text-muted";
  const date = new Date(due);
  if (isPast(date)) return "text-danger";
  if (isToday(date) || isTomorrow(date)) return "text-warn";
  return "text-muted";
}

export function greeting(name?: string | null) {
  const h = new Date().getHours();
  const g = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const first = name?.split(" ")[0];
  return first ? `${g}, ${first}` : g;
}

export function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function bytes(n?: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Score 0–100 from a set of problems relative to volume. */
export function healthScore(parts: { weight: number; bad: number; total: number }[]) {
  let score = 0;
  let wsum = 0;
  for (const p of parts) {
    const ratio = p.total > 0 ? Math.min(1, p.bad / p.total) : 0;
    score += p.weight * (1 - ratio);
    wsum += p.weight;
  }
  return wsum ? Math.round((score / wsum) * 100) : 100;
}

/* ---------------------------------------------------------------- Timezones */
/**
 * Company and working-hours settings drive rosters, escalation windows and notification quiet
 * hours, so the timezone has to be a real IANA zone — a free-text field accepted "ssss" and every
 * downstream calculation then silently used the server default.
 *
 * `Intl.supportedValuesOf` gives the browser's full zone list where it exists (all current engines);
 * the shortlist is the fallback for anything older and for the server render.
 */
export const TIMEZONE_FALLBACK = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Asia/Shanghai",
  "Europe/London", "Europe/Berlin", "Europe/Paris", "America/New_York", "America/Chicago",
  "America/Los_Angeles", "America/Sao_Paulo", "Australia/Sydney", "Africa/Johannesburg", "UTC",
];

/** Valid zones to offer, with `current` kept at the front so an existing value is never dropped. */
export function timezoneOptions(current?: string | null): string[] {
  let list = TIMEZONE_FALLBACK;
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
    if (supported?.length) list = supported;
  } catch {
    /* older engine — the shortlist stands */
  }
  return current && !list.includes(current) ? [current, ...list] : list;
}

/** Does Intl accept this as a timezone? The check the free-text field never made. */
export function isValidTimezone(tz?: string | null): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
