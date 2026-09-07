import type { Json } from "@/lib/database.types";
import type { Enums, Tables } from "@/lib/utils";

export type HelpStatus = Enums<"help_status">;
export type HelpRequest = Tables<"help_requests">;
export type Service = Tables<"service_catalog">;

export const HELP_STATUSES: HelpStatus[] = ["new", "accepted", "working", "waiting", "completed", "declined"];
export const HELP_FLOW: HelpStatus[] = ["new", "accepted", "working", "completed"];
export const OPEN_STATUSES: HelpStatus[] = ["new", "accepted", "working", "waiting"];
export const HELP_STATUS_LABEL: Record<HelpStatus, string> = {
  new: "New", accepted: "Accepted", working: "Working", waiting: "Waiting on requester", completed: "Completed", declined: "Declined",
};
export const HELP_STATUS_TONE: Record<HelpStatus, string> = {
  new: "tone-warn", accepted: "tone-info", working: "tone-brand", waiting: "tone-orange", completed: "tone-success", declined: "tone-muted",
};
export const HELP_STATUS_DOT: Record<HelpStatus, string> = {
  new: "var(--warn)", accepted: "var(--info)", working: "var(--brand-2)", waiting: "var(--orange)", completed: "var(--success)", declined: "var(--fg-muted)",
};

export const DEPT_STATUSES = ["available", "busy", "limited", "emergency_only", "offline"] as const;
export type DeptStatus = (typeof DEPT_STATUSES)[number];
export const DEPT_STATUS_META: Record<DeptStatus, { label: string; hint: string; tone: string }> = {
  available: { label: "Available", hint: "Taking requests as usual.", tone: "tone-success" },
  busy: { label: "Busy", hint: "Responses may be slower than usual.", tone: "tone-warn" },
  limited: { label: "Limited", hint: "Reduced capacity — urgent requests first.", tone: "tone-orange" },
  emergency_only: { label: "Emergency only", hint: "Only critical requests will be picked up right now.", tone: "tone-danger" },
  offline: { label: "Offline", hint: "Nobody is on duty. Requests queue until the department is back.", tone: "tone-muted" },
};
export function asDeptStatus(s?: string | null): DeptStatus {
  return (DEPT_STATUSES as readonly string[]).includes(s || "") ? (s as DeptStatus) : "available";
}

/* --------------------------------------------------------------- form schema */
export type FieldType = "text" | "textarea" | "select" | "date" | "number";
export const FIELD_TYPES: FieldType[] = ["text", "textarea", "select", "date", "number"];
export type FormField = { key: string; label: string; type: FieldType; options?: string[]; required?: boolean };

export function parseSchema(j: Json | null | undefined): FormField[] {
  if (!Array.isArray(j)) return [];
  const out: FormField[] = [];
  for (const item of j) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, Json | undefined>;
    if (typeof o.key !== "string" || !o.key) continue;
    const type = (FIELD_TYPES as string[]).includes(String(o.type)) ? (o.type as FieldType) : "text";
    out.push({
      key: o.key,
      label: typeof o.label === "string" && o.label ? o.label : o.key,
      type,
      options: Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === "string") : undefined,
      required: o.required === true,
    });
  }
  return out;
}

export function parseFormData(j: Json | null | undefined): Record<string, string> {
  if (!j || typeof j !== "object" || Array.isArray(j)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(j as Record<string, Json | undefined>)) {
    if (v == null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

export type HelpAttachment = { name: string; path: string; size: number; type: string };
export function parseHelpAttachments(j: Json | null | undefined): HelpAttachment[] {
  if (!Array.isArray(j)) return [];
  const out: HelpAttachment[] = [];
  for (const item of j) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, Json | undefined>;
    if (typeof o.path !== "string") continue;
    out.push({ path: o.path, name: typeof o.name === "string" ? o.name : o.path.split("/").pop() || "file", size: typeof o.size === "number" ? o.size : 0, type: typeof o.type === "string" ? o.type : "application/octet-stream" });
  }
  return out;
}

/* -------------------------------------------------------------------- SLA */
export function slaLabel(minutes?: number | null) {
  if (!minutes || minutes <= 0) return "Usually acknowledged the same day";
  if (minutes < 60) return `Usually acknowledged within ${minutes} minutes`;
  const h = Math.round(minutes / 60);
  if (h < 24) return `Usually acknowledged within ${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `Usually acknowledged within ${d} day${d === 1 ? "" : "s"}`;
}

/** Remaining time to the SLA deadline. Negative = overdue. */
export function slaRemaining(ackDue: string | null | undefined, now: number) {
  if (!ackDue) return null;
  return new Date(ackDue).getTime() - now;
}
export function fmtRemaining(ms: number) {
  const abs = Math.abs(ms);
  const min = Math.round(abs / 60_000);
  const txt = min < 60 ? `${min}m` : min < 60 * 48 ? `${Math.round(min / 60)}h` : `${Math.round(min / 60 / 24)}d`;
  return ms < 0 ? `${txt} over` : `${txt} left`;
}
export function isOverSla(r: Pick<HelpRequest, "status" | "ack_due_at">, now: number) {
  return r.status === "new" && !!r.ack_due_at && new Date(r.ack_due_at).getTime() < now;
}
