/**
 * Account status — the client half of `account_status_of()` (migration 0078).
 *
 * The database decides the status; this file only names it. Every screen that shows somebody's
 * registration state (the waiting page, the owner's registrations console, the approver list) reads
 * these labels, so they cannot drift apart. Client-safe: no server imports.
 */

export type AccountStatusKey =
  | "email_verification_pending"
  | "awaiting_company"
  | "pending_approval"
  | "pending_department"
  | "active"
  | "suspended"
  | "deactivated"
  | "rejected"
  | "unknown"
  | "signed_out";

export type AccountStatus = {
  status: AccountStatusKey;
  email?: string | null;
  full_name?: string | null;
  company?: { name?: string | null; status?: string | null; available?: boolean; on_platform?: boolean } | null;
  department?: { name: string } | null;
  requested_department?: string | null;
  request?: {
    status: "pending" | "approved" | "declined";
    department_id: string | null;
    designation: string | null;
    note: string | null;
    decision_note: string | null;
    decided_label: string | null;
    created_at: string;
  } | null;
  decision_note?: string | null;
  decided_label?: string | null;
  registration?: {
    designation?: string | null;
    phone?: string | null;
    employee_ref?: string | null;
    manager_name?: string | null;
    recognized?: boolean;
    domain?: string | null;
    via?: string | null;
    email_verified_at?: string | null;
    created_at?: string | null;
  } | null;
  /** Information the company requires that is still missing: "phone" | "employee_id" | "department". */
  needs?: string[];
};

export const STATUS_LABEL: Record<AccountStatusKey, string> = {
  email_verification_pending: "Email Verification Pending",
  awaiting_company: "Awaiting Company Activation",
  pending_approval: "Pending Approval",
  pending_department: "Pending Department Assignment",
  active: "Active",
  suspended: "Suspended",
  deactivated: "Deactivated",
  rejected: "Rejected",
  unknown: "Being set up",
  signed_out: "Signed out",
};

export const STATUS_TONE: Record<AccountStatusKey, string> = {
  email_verification_pending: "tone-info",
  awaiting_company: "tone-warn",
  pending_approval: "tone-warn",
  pending_department: "tone-warn",
  active: "tone-success",
  suspended: "tone-danger",
  deactivated: "tone-neutral",
  rejected: "tone-danger",
  unknown: "tone-neutral",
  signed_out: "tone-neutral",
};

/** Order for filters and summaries: what needs attention first. */
export const STATUS_ORDER: AccountStatusKey[] = [
  "awaiting_company",
  "pending_department",
  "pending_approval",
  "email_verification_pending",
  "rejected",
  "suspended",
  "deactivated",
  "active",
];

export const NEED_LABEL: Record<string, string> = {
  phone: "your mobile number",
  employee_id: "your employee ID",
  department: "the department you work in",
};

export function statusKey(s: string | null | undefined): AccountStatusKey {
  return (s && s in STATUS_LABEL ? s : "unknown") as AccountStatusKey;
}

/** First name for a friendly greeting, never an email address. */
export function firstName(name: string | null | undefined, email?: string | null): string {
  const n = (name || "").trim();
  if (n && !n.includes("@")) return n.split(/\s+/)[0];
  return (email || "").split("@")[0] || "there";
}
