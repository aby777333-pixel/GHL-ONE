/**
 * Shared types and label maps for the Platform Command Center (schema `0022_platform.sql`).
 * Pure module — imported by both server pages and client components, so it must stay free of
 * "use client" and of any browser-only import.
 */
import type { Json } from "@/lib/database.types";

/* --------------------------------------------------------------- Lifecycle */
export const COMPANY_STATUSES = ["trial", "onboarding", "active", "read_only", "suspended", "archived", "closed", "pending"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const STATUS_LABEL: Record<string, string> = {
  trial: "Trial", onboarding: "Onboarding", active: "Active", read_only: "Read-only",
  suspended: "Suspended", archived: "Archived", closed: "Closed", pending: "Pending",
};
export const STATUS_TONE: Record<string, string> = {
  trial: "tone-info", onboarding: "tone-warn", active: "tone-success", read_only: "tone-orange",
  suspended: "tone-danger", archived: "tone-muted", closed: "tone-muted", pending: "tone-neutral",
};
export const STATUS_HINT: Record<string, string> = {
  trial: "Evaluating the platform. Everything works; the company has not committed yet.",
  onboarding: "Being set up. People can sign in, but go-live checks are not complete.",
  active: "Live and in daily use.",
  read_only: "People can read everything but cannot create or change anything.",
  suspended: "Nobody in the company can sign in. Data is untouched.",
  archived: "Closed down and kept for the record. Nobody can sign in.",
  closed: "Ended. Kept only for legal retention.",
  pending: "Requested but not yet approved.",
};

/** The three reversible-or-recorded actions we offer. Deletion is deliberately not one of them (§53). */
export const LIFECYCLE_ACTIONS: { status: CompanyStatus; label: string; hint: string; tone: string; danger?: boolean }[] = [
  { status: "read_only", label: "Make read-only", hint: "People keep access to everything they can see, but nothing can be created or changed.", tone: "tone-orange" },
  { status: "suspended", label: "Suspend", hint: "Nobody in the company can sign in. Nothing is deleted and it can be reversed at any time.", tone: "tone-danger", danger: true },
  { status: "archived", label: "Archive", hint: "The company stops operating and is kept for the record. Reversible by the platform owner.", tone: "tone-muted", danger: true },
];

/* ------------------------------------------------------------ Setup health */
export type SetupHealth = {
  org_id: string;
  checks: Record<string, boolean>;
  employees: number;
  departments: number;
  blockers: string[];
};

export const SETUP_LABEL: Record<string, string> = {
  admin: "Company administrator", branding: "Logo and branding", domain: "Email domain verified",
  departments: "Departments created", employees: "Employees added", managers: "Reporting managers assigned",
  attendance: "Attendance configured", mfa: "Two-step sign-in enforced", screens: "Screens configured",
};

export function setupScore(setup?: SetupHealth | null) {
  const checks = setup?.checks || {};
  const keys = Object.keys(checks);
  const done = keys.filter((k) => checks[k]).length;
  return { done, total: keys.length, pct: keys.length ? Math.round((done / keys.length) * 100) : 0 };
}

/* --------------------------------------------------------- Overview shapes */
export type CompanyListItem = {
  org_id: string;
  name: string;
  slug: string | null;
  tenant_code: string | null;
  status: string;
  plan: string | null;
  industry: string | null;
  country: string | null;
  logo_url: string | null;
  created_at: string;
  employees: number;
  admin: string | null;
  storage_mb: number;
  ai: boolean;
  setup: SetupHealth;
};

export type NeedsAttention = { org_id: string; name: string; status: string; reasons: string[] };

export type PlatformOverview = {
  companies: number;
  active: number;
  onboarding: number;
  suspended: number;
  employees: number;
  online: number;
  storage_mb: number;
  ai_calls_today: number;
  video_minutes_today: number;
  security_alerts: number;
  break_glass_open: number;
  needs_attention: NeedsAttention[];
  companies_list: CompanyListItem[];
};

export const EMPTY_OVERVIEW: PlatformOverview = {
  companies: 0, active: 0, onboarding: 0, suspended: 0, employees: 0, online: 0, storage_mb: 0,
  ai_calls_today: 0, video_minutes_today: 0, security_alerts: 0, break_glass_open: 0,
  needs_attention: [], companies_list: [],
};

/* ----------------------------------------------------------- Company shapes */
export type OrgRecord = {
  id: string;
  name: string;
  slug: string | null;
  legal_name: string | null;
  tenant_code: string | null;
  status: string;
  plan: string | null;
  industry: string | null;
  country: string | null;
  timezone: string | null;
  locale: string | null;
  address: string | null;
  website: string | null;
  primary_contact: string | null;
  email_domain: string | null;
  restrict_to_domain: boolean | null;
  custom_domain: string | null;
  domain_verified: boolean | null;
  logo_url: string | null;
  favicon_url: string | null;
  accent_color: string | null;
  welcome_message: string | null;
  limits: Json;
  onboarding_stage: string | null;
  mfa_required: boolean | null;
  retention_days: number | null;
  created_at: string;
  activated_at: string | null;
  suspended_at: string | null;
  archived_at: string | null;
};

export type CompanyAdmin = { id: string; name: string | null; email: string | null; role: string; last_seen_at: string | null };
export type CompanyDept = { id: string; name: string; people: number };
export type UsageRow = {
  org_id: string; day: string; employees: number; active_users: number; storage_mb: number;
  ai_calls: number; video_minutes: number; recordings: number; messages: number; projects: number;
};
export type FeatureRow = { key: string; label: string; category: string; enabled: boolean };
export type OnboardingStep = { key: string; label: string; done: boolean; done_at?: string | null; done_by?: string | null; blocking?: boolean };
export type OnboardingRecord = { org_id: string; steps: OnboardingStep[]; channel_id: string | null; owner_id: string | null; notes: string | null; updated_at: string | null };
export type PlatformAuditRow = { at: string; action: string; actor: string | null; summary: string | null; reason: string | null };
export type SupportSessionRow = {
  id: string; org_id: string; granted_by: string | null; granted_to: string | null;
  scope: string; reason: string | null; expires_at: string; revoked_at: string | null; created_at: string;
};
export type BreakGlassRow = {
  actor: string | null; reason: string; justification: string; scope: string;
  started_at: string; expires_at: string; ended_at: string | null;
};

export type CompanyDetail = {
  company: OrgRecord;
  setup: SetupHealth;
  admins: CompanyAdmin[];
  departments: CompanyDept[];
  usage: UsageRow[];
  features: FeatureRow[];
  onboarding: OnboardingRecord | null;
  audit: PlatformAuditRow[];
  support_sessions: SupportSessionRow[];
  break_glass: BreakGlassRow[];
};

/* ------------------------------------------------------------- Break-glass */
export const JUSTIFICATIONS: { key: string; label: string; hint: string }[] = [
  { key: "customer_support", label: "Customer support", hint: "The company asked for help with something you cannot see from the outside." },
  { key: "investigation", label: "Investigation", hint: "A reported problem needs the actual data to explain it." },
  { key: "security_incident", label: "Security incident", hint: "An active security event in this company." },
  { key: "legal", label: "Legal or regulatory", hint: "A lawful request that has been verified." },
  { key: "policy_audit", label: "Policy audit", hint: "A scheduled review agreed with the company." },
  { key: "emergency_admin", label: "Emergency administration", hint: "The company has no reachable administrator." },
];
export const BG_SCOPES: { key: string; label: string; hint: string }[] = [
  { key: "configuration", label: "Configuration only", hint: "Settings, structure and features. No employee content." },
  { key: "content", label: "Content", hint: "Also the company's own records — messages, tasks, files." },
  { key: "full", label: "Full", hint: "Everything, including confidential material. Use only for a verified emergency." },
];
export const BG_DURATIONS = [15, 30, 60, 120, 240, 480];
export const MIN_REASON = 12;

/* --------------------------------------------------------------- Platform staff */
export const PLATFORM_ROLES: { key: string; label: string; hint: string }[] = [
  { key: "platform_super_admin", label: "Platform owner", hint: "Everything, including creating companies and managing platform staff." },
  { key: "platform_ops", label: "Operations", hint: "Create companies, change status and features across every tenant." },
  { key: "platform_support", label: "Support", hint: "Only the companies explicitly assigned to them." },
  { key: "platform_security", label: "Security", hint: "Every tenant's administrative metadata and the isolation checks." },
  { key: "platform_billing", label: "Billing", hint: "Only the companies assigned to them; usage and plans." },
  { key: "platform_developer", label: "Developer", hint: "Only the companies assigned to them." },
];
export const PLATFORM_ROLE_LABEL: Record<string, string> = Object.fromEntries(PLATFORM_ROLES.map((r) => [r.key, r.label]));

/** Roles that `create_company` / `set_company_status` accept (the RPC enforces this too). */
export const canCreateCompany = (role?: string | null) => role === "platform_super_admin" || role === "platform_ops";
export const canChangeStatus = canCreateCompany;
export const canPublishAnnouncement = (role?: string | null) => role === "platform_super_admin" || role === "platform_ops" || role === "platform_security";
export const isOwnerRole = (role?: string | null) => role === "platform_super_admin";

/* ---------------------------------------------------------------- Helpers */
export function fmtMb(mb?: number | null) {
  const n = Number(mb || 0);
  if (n >= 1024 * 1024) return `${(n / 1048576).toFixed(1)} TB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} GB`;
  return `${Math.round(n)} MB`;
}

export function fmtNum(n?: number | null) {
  return Number(n || 0).toLocaleString();
}

/** Turn a Postgres/PostgREST error into something a person can act on. */
export function rpcError(message?: string | null) {
  const m = (message || "").replace(/^[A-Z0-9]{5}:\s*/, "").trim();
  if (!m) return "Something went wrong. Try again.";
  if (/^forbidden$/i.test(m)) return "You do not have platform access to this company.";
  if (/row-level security/i.test(m)) return "You do not have permission to do that.";
  if (/not allowed in a non-volatile function/i.test(m)) return "The platform backend rejected this read. Report it to the platform team.";
  return m;
}

/** Minutes left before `iso`, floored at 0. */
export function minutesLeft(iso?: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));
}

/**
 * Whether `iso` is still in the future. Like `countdown`, the clock read lives in this module so
 * components can ask the question without calling `Date.now()` in their render body.
 */
export function isFuture(iso?: string | null) {
  return !!iso && Date.parse(iso) > Date.now();
}

export function countdown(iso?: string | null) {
  const m = minutesLeft(iso);
  if (m <= 0) return "expired";
  if (m < 60) return `${m} min left`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min left`;
}

/* ------------------------------------------------------------- Workspaces */
export type Workspace = {
  org_id: string;
  name: string;
  slug: string | null;
  tenant_code: string | null;
  logo_url: string | null;
  accent_color: string | null;
  status: string;
  role: string | null;
  mode: "member" | "platform_admin";
  active: boolean;
};
