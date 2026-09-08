import { isAdminRole, isLeadPlus, isManagerPlus, type RoleLevel } from "@/lib/utils";

/**
 * Granular admin permissions (mirrors the seeded `admin_roles.permissions` in 0009_workforce_core.sql).
 * `*` = everything. Custom roles may add free-text keys; unknown keys are shown verbatim.
 */
export const ADMIN_PERMISSIONS: { key: string; label: string; group: string; hint: string }[] = [
  { key: "*", label: "Everything", group: "Global", hint: "Full super-admin powers (except primary-admin transfer)" },
  { key: "people.manage", label: "People", group: "HR", hint: "Edit profiles, roles, departments, activation" },
  { key: "hr.manage", label: "HR records", group: "HR", hint: "Private records, leave types, balances, onboarding" },
  { key: "attendance.manage", label: "Attendance", group: "HR", hint: "Attendance board, corrections" },
  { key: "leave.approve", label: "Leave approvals", group: "HR", hint: "Approve leave where HR sign-off is needed" },
  { key: "shifts.manage", label: "Shifts & roster", group: "HR", hint: "Shifts, assignments, swaps" },
  { key: "integrations.manage", label: "Integrations", group: "IT", hint: "Webhooks, Slack, calendar feeds" },
  { key: "automations.manage", label: "Automations", group: "IT", hint: "WHEN / IF / THEN rules and escalation ladder" },
  { key: "features.manage", label: "Feature flags", group: "IT", hint: "Turn modules on or off per department" },
  { key: "system.manage", label: "System settings", group: "IT", hint: "Organization settings, working and quiet hours" },
  { key: "access.approve", label: "Access approvals", group: "Security", hint: "Approve access requests, revoke grants" },
  { key: "audit.read", label: "Audit log", group: "Security", hint: "Read the audit trail and security signals" },
  { key: "security.manage", label: "Security", group: "Security", hint: "Security events, view-as, revoke everywhere" },
  { key: "department.manage", label: "Departments", group: "Structure", hint: "Teams, service catalog, on-duty, status" },
  { key: "projects.manage", label: "Projects", group: "Work", hint: "See and manage every project" },
  { key: "communication.manage", label: "Communication", group: "Work", hint: "Channels, groups, announcements, broadcasts" },
  { key: "ai.manage", label: "AI", group: "Work", hint: "Assistants, knowledge, usage" },
];

export const PERMISSION_LABEL: Record<string, string> = Object.fromEntries(ADMIN_PERMISSIONS.map((p) => [p.key, p.label]));

export function permLabel(key: string) {
  return PERMISSION_LABEL[key] || key;
}

/** True when `perms` contains `*` or any of the given keys. */
export function hasPerm(perms: string[], ...keys: string[]) {
  if (perms.includes("*")) return true;
  return keys.some((k) => perms.includes(k));
}

export type AdminTab =
  | "now" | "people" | "invites" | "hr" | "workflows" | "structure" | "responsibilities" | "departments" | "access" | "roles" | "screens" | "visibility" | "features" | "security"
  | "organization" | "escalation" | "integrations" | "templates" | "ai" | "live" | "audit" | "access-log" | "support";

export const ADMIN_TABS: AdminTab[] = ["now", "people", "invites", "hr", "workflows", "structure", "responsibilities", "departments", "access", "roles", "screens", "visibility", "features", "security", "organization", "escalation", "integrations", "templates", "ai", "live", "audit", "access-log", "support"];

export function isAdminTab(v: unknown): v is AdminTab {
  return typeof v === "string" && (ADMIN_TABS as string[]).includes(v);
}

/**
 * Tab gating. `role` is the profile role; `perms` the caller's effective admin permissions
 * (server-derived from `admin_assignments`; `*` for admin-level roles).
 */
export function tabAllowed(tab: AdminTab, role: RoleLevel, perms: string[]): boolean {
  const admin = isAdminRole(role);
  const manager = isManagerPlus(role);
  const has = (...k: string[]) => hasPerm(perms, ...k);
  switch (tab) {
    case "now": return manager || has("*");
    case "people": return manager || has("people.manage", "hr.manage");
    case "invites": return manager || has("people.manage", "hr.manage");
    // HR console mirrors `is_hr()` in 0012_hr_ops.sql: admin roles, hr.manage or people.manage.
    case "hr": return admin || has("hr.manage", "people.manage");
    // Workflow runs are readable by managers (wr_read); starting/skipping needs manager+ or HR permissions.
    case "workflows": return manager || has("hr.manage", "people.manage");
    // Reporting tree & responsibilities register: managers see their part; HR / people admins the whole company.
    case "structure": return manager || has("hr.manage", "people.manage");
    case "responsibilities": return manager || has("hr.manage", "people.manage");
    case "departments": return admin || has("department.manage");
    case "access": return admin || has("access.approve", "security.manage");
    case "roles": return admin || has("*");
    // Screen governance: who sees which screens (screen_rules / nav_layouts RLS).
    case "screens": return admin || has("features.manage", "security.manage");
    case "visibility": return manager || has("security.manage", "access.approve");
    case "features": return admin || has("features.manage");
    case "security": return admin || has("security.manage", "audit.read");
    case "organization": return admin || has("system.manage");
    case "escalation": return admin || has("system.manage", "automations.manage");
    case "integrations": return admin || has("integrations.manage");
    case "templates": return manager || has("projects.manage");
    case "ai": return admin || has("ai.manage");
    // GHL LIVE governance: what is live, today's totals, the audit trail and the collaboration permission matrix.
    case "live": return admin || has("communication.manage");
    case "audit": return manager || has("audit.read");
    // Who viewed / exported what (`access_event_summary`): security or audit admins.
    case "access-log": return admin || has("security.manage", "audit.read");
    // Platform support access (0022): the company's own door to the GHL ONE platform team.
    // `grant_support_access` requires is_admin() in the database; others see the history read-only.
    case "support": return admin || has("security.manage", "system.manage", "audit.read");
    default: return false;
  }
}

/** Anyone who may open the console at all. */
export function canOpenConsole(role: RoleLevel, perms: string[]) {
  return isLeadPlus(role) || perms.length > 0;
}
