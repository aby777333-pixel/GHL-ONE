import type { Json } from "@/lib/database.types";
import { ROLE_RANK, type Profile, type RoleLevel, type Tables } from "@/lib/utils";

/* ------------------------------------------------------------------ rows */
export type SystemRoleRow = Tables<"system_roles">;
export type UserRoleRow = Tables<"user_roles">;
export type RoleDefaultRow = Tables<"role_defaults">;
export type PermissionOverrideRow = Tables<"permission_overrides">;
export type ScreenRow = Tables<"screens">;
export type ScreenRuleRow = Tables<"screen_rules">;
export type NavLayoutRow = Tables<"nav_layouts">;
export type ResponsibilityRow = Tables<"responsibilities">;
export type DelegationRow = Tables<"delegations">;
export type PolicyRow = Tables<"policies">;
export type ConfigHistoryRow = Tables<"config_history">;
export type AccessReviewRow = Tables<"access_reviews">;
export type AccessReviewItemRow = Tables<"access_review_items">;

/** The slice of a profile the structure / wizard screens work with. */
export type StructurePerson = Pick<Profile, "id" | "full_name" | "avatar_url" | "designation" | "department_id" | "team_id" | "manager_id" | "secondary_manager_id" | "functional_manager_id" | "role" | "presence" | "status" | "is_active" | "is_external" | "email" | "frozen" | "config_incomplete">;
export const STRUCTURE_SELECT = "id,full_name,avatar_url,designation,department_id,team_id,manager_id,secondary_manager_id,functional_manager_id,role,presence,status,is_active,is_external,email,frozen,config_incomplete";

export type EffectiveScreen = { key: string; label: string; path: string; grp: string; allowed: boolean; source: string; sort_order: number };

/* --------------------------------------------------- the 20 permission keys */
export const PERMISSION_KEYS: { key: string; label: string; group: string; hint: string }[] = [
  { key: "view", label: "View", group: "Content", hint: "See what their role allows" },
  { key: "comment", label: "Comment", group: "Content", hint: "Comment on tasks, files and decisions" },
  { key: "create", label: "Create", group: "Content", hint: "Create tasks, notes and files" },
  { key: "edit", label: "Edit", group: "Content", hint: "Edit content they can see" },
  { key: "delete", label: "Delete", group: "Content", hint: "Delete content (audited)" },
  { key: "download", label: "Download", group: "Sharing", hint: "Download files — probation and interns lose this by default" },
  { key: "share_internal", label: "Share internally", group: "Sharing", hint: "Share files and links with colleagues" },
  { key: "share_external", label: "Share externally", group: "Sharing", hint: "Share outside the company — high risk" },
  { key: "export", label: "Export", group: "Sharing", hint: "Export reports and lists" },
  { key: "approve", label: "Approve", group: "Authority", hint: "Decide approvals routed to them" },
  { key: "invite", label: "Invite", group: "Authority", hint: "Invite people into rooms and projects" },
  { key: "assign_task", label: "Assign work", group: "Authority", hint: "Assign tasks to others (within assignment rules)" },
  { key: "manage_team", label: "Manage team", group: "Authority", hint: "Team settings, roster, WIP limits" },
  { key: "create_group", label: "Create groups", group: "Collaboration", hint: "Open new rooms" },
  { key: "create_project", label: "Create projects", group: "Collaboration", hint: "Start projects" },
  { key: "broadcast_department", label: "Broadcast (dept)", group: "Communication", hint: "Announce to their department" },
  { key: "broadcast_company", label: "Broadcast (company)", group: "Communication", hint: "Announce company-wide" },
  { key: "view_reports", label: "View reports", group: "Insight", hint: "Operational reports" },
  { key: "review_recordings", label: "Review recordings", group: "Insight", hint: "Listen to recorded calls (Connect)" },
  { key: "record_calls", label: "Record calls", group: "Insight", hint: "Record customer calls (Connect)" },
];
export const PERMISSION_GROUPS = [...new Set(PERMISSION_KEYS.map((p) => p.group))];
export const PERM_LABEL: Record<string, string> = Object.fromEntries(PERMISSION_KEYS.map((p) => [p.key, p.label]));
export const permName = (k: string) => PERM_LABEL[k] || k;

/* ----------------------------------------------------------- statuses */
export const EMPLOYEE_STATUSES = ["active", "probation", "contract", "intern", "notice_period", "suspended", "inactive", "exited"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];
export const EMPLOYEE_STATUS_LABEL: Record<string, string> = { active: "Active", probation: "Probation", contract: "Contract", intern: "Intern", notice_period: "Notice period", suspended: "Suspended", inactive: "Inactive", exited: "Exited" };
export const EMPLOYEE_STATUS_TONE: Record<string, string> = { active: "tone-success", probation: "tone-info", contract: "tone-violet", intern: "tone-info", notice_period: "tone-warn", suspended: "tone-danger", inactive: "tone-muted", exited: "tone-muted" };

/* ----------------------------------------------------------- lifecycle */
export const LIFECYCLE_STAGES = ["candidate", "offer", "joining", "onboarding", "probation", "confirmed", "growth", "promotion_transfer", "leadership", "exit"] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];
export const LIFECYCLE_LABEL: Record<LifecycleStage, string> = { candidate: "Candidate", offer: "Offer", joining: "Joining", onboarding: "Onboarding", probation: "Probation", confirmed: "Confirmed", growth: "Growth", promotion_transfer: "Promotion / transfer", leadership: "Leadership", exit: "Exit" };

/** Derive the lifecycle stage from status, probation, workflow runs and role. */
export function lifecycleStage(p: { status: string; is_active: boolean; role: RoleLevel; probation_ends_on: string | null; joined_at: string | null }, runs: { kind: string; status: string }[], today: string): LifecycleStage {
  if (p.status === "exited" || p.status === "notice_period" || runs.some((r) => r.kind === "offboarding" && r.status === "running")) return "exit";
  if (!p.is_active && p.status !== "suspended") return "joining";
  if (runs.some((r) => r.kind === "onboarding" && r.status === "running")) return "onboarding";
  if (p.status === "probation" || (p.probation_ends_on && p.probation_ends_on >= today)) return "probation";
  if (runs.some((r) => (r.kind === "promotion" || r.kind === "transfer") && r.status === "running")) return "promotion_transfer";
  if (ROLE_RANK[p.role] <= 4) return "leadership";
  if (p.joined_at && today.slice(0, 4) > p.joined_at.slice(0, 4)) return "growth";
  return "confirmed";
}

/* --------------------------------------------------- permission preview */
/** Client-side mirror of `has_perm` precedence for previews (override → roles → department → level default). */
export function previewPermissions(opts: { level: RoleLevel; status?: string; roles: SystemRoleRow[]; department?: Pick<Tables<"departments">, "default_permissions"> | null; levelDefaults: RoleDefaultRow[]; overrides?: Record<string, boolean> }): Record<string, { allowed: boolean; source: string }> {
  const out: Record<string, { allowed: boolean; source: string }> = {};
  const lvl = opts.levelDefaults.find((d) => d.level === opts.level)?.permissions || [];
  for (const { key } of PERMISSION_KEYS) {
    if (opts.level === "super_admin") { out[key] = { allowed: true, source: "super admin" }; continue; }
    if (opts.overrides && key in opts.overrides) { out[key] = { allowed: opts.overrides[key]!, source: "individual override" }; continue; }
    if ((opts.status === "probation" || opts.status === "intern") && ["download", "share_external", "export"].includes(key)) { out[key] = { allowed: false, source: `${opts.status} rule` }; continue; }
    if ((opts.status === "suspended" || opts.status === "notice_period") && ["share_external", "export", "delete"].includes(key)) { out[key] = { allowed: false, source: `${opts.status} rule` }; continue; }
    const viaRole = opts.roles.find((r) => r.permissions.includes(key));
    if (viaRole) { out[key] = { allowed: true, source: `role: ${viaRole.name}` }; continue; }
    if (opts.department?.default_permissions.includes(key)) { out[key] = { allowed: true, source: "department default" }; continue; }
    out[key] = { allowed: lvl.includes(key), source: lvl.includes(key) ? "level default" : "not granted" };
  }
  return out;
}

/* ------------------------------------------------------ screen preview */
export const SCREEN_GROUP_LABEL: Record<string, string> = { core: "Core", work: "Work", me: "Me", company: "Company", admin: "Admin" };
export const SCREEN_GROUPS = ["core", "work", "me", "company", "admin"];

/** Client-side mirror of `effective_screens` precedence (individual → role rule → system role → department rule → department default → company default → system default). */
export function previewScreens(opts: {
  screens: ScreenRow[];
  rules: ScreenRuleRow[];
  level: RoleLevel;
  isExternal?: boolean;
  userId?: string | null;
  roleIds: string[];
  roles: SystemRoleRow[];
  departmentId?: string | null;
  department?: Pick<Tables<"departments">, "default_screens"> | null;
  hasAdminAssignment?: boolean;
  nowMs: number;
}): EffectiveScreen[] {
  const live = (r: ScreenRuleRow) => !r.expires_at || new Date(r.expires_at).getTime() > opts.nowMs;
  const rank = ROLE_RANK[opts.level];
  return opts.screens.slice().sort((a, b) => a.position - b.position).map((s) => {
    const user = opts.userId ? opts.rules.find((r) => r.scope === "user" && r.scope_id === opts.userId && r.screen_key === s.key && live(r)) : undefined;
    if (user) return { key: s.key, label: s.label, path: s.path, grp: s.grp, allowed: user.allowed, source: "individual override", sort_order: s.position };
    const roleRules = opts.rules.filter((r) => r.scope === "role" && r.scope_id && opts.roleIds.includes(r.scope_id) && r.screen_key === s.key && live(r));
    if (roleRules.length) return { key: s.key, label: s.label, path: s.path, grp: s.grp, allowed: roleRules.some((r) => r.allowed), source: "role rule", sort_order: s.position };
    const sysRoles = opts.roles.filter((r) => opts.roleIds.includes(r.id) && (r.screens.includes(s.key) || r.denied_screens.includes(s.key)));
    if (sysRoles.length) return { key: s.key, label: s.label, path: s.path, grp: s.grp, allowed: sysRoles.some((r) => r.screens.includes(s.key)) || !sysRoles.some((r) => r.denied_screens.includes(s.key)), source: "system role", sort_order: s.position };
    const dept = opts.departmentId ? opts.rules.find((r) => r.scope === "department" && r.scope_id === opts.departmentId && r.screen_key === s.key && live(r)) : undefined;
    if (dept) return { key: s.key, label: s.label, path: s.path, grp: s.grp, allowed: dept.allowed, source: "department rule", sort_order: s.position };
    if (opts.department?.default_screens.includes(s.key)) return { key: s.key, label: s.label, path: s.path, grp: s.grp, allowed: true, source: "department default", sort_order: s.position };
    const def = opts.rules.find((r) => r.scope === "default" && !r.scope_id && r.screen_key === s.key);
    if (def) return { key: s.key, label: s.label, path: s.path, grp: s.grp, allowed: def.allowed, source: "company default", sort_order: s.position };
    let allowed: boolean;
    if (opts.isExternal) allowed = s.external_ok && !s.admin_only;
    else if (s.key === "people-intelligence") allowed = opts.level === "super_admin";
    else if (s.key === "admin") allowed = rank <= ROLE_RANK.team_lead || !!opts.hasAdminAssignment;
    else allowed = rank <= ROLE_RANK[s.default_min_level];
    return { key: s.key, label: s.label, path: s.path, grp: s.grp, allowed, source: `system default (${s.default_min_level}+)`, sort_order: s.position };
  });
}

/* ------------------------------------------------------------- home cards */
export const HOME_CARD_KEYS = ["clock", "buddy", "my_work", "approvals", "meetings", "team_today", "team_goals", "kudos", "announcements", "projects", "decisions"] as const;
export const HOME_CARD_LABEL: Record<string, string> = { clock: "Clock in / out", buddy: "GHL Buddy", my_work: "My work", approvals: "Approvals", meetings: "Meetings", team_today: "Team today", team_goals: "Team goals", kudos: "Kudos", announcements: "Announcements", projects: "Projects", decisions: "Decisions" };
export const QUICK_ACTION_OPTIONS: { key: string; label: string }[] = [
  { key: "new_task", label: "New task" }, { key: "request_help", label: "Request help" }, { key: "apply_leave", label: "Apply for leave" }, { key: "clock", label: "Clock in" },
  { key: "new_meeting", label: "Schedule a meeting" }, { key: "ask_buddy", label: "Ask GHL Buddy" }, { key: "new_decision", label: "Log a decision" }, { key: "new_request", label: "Self-service request" },
];

export type NavLayout = { nav: string[]; home_cards: { key: string; hidden: boolean }[]; quick_actions: string[] };
export function parseNavLayout(row: Pick<NavLayoutRow, "nav" | "home_cards" | "quick_actions"> | null | undefined): NavLayout {
  const strs = (j: Json | undefined) => (Array.isArray(j) ? j.filter((x): x is string => typeof x === "string") : []);
  const cards = Array.isArray(row?.home_cards) ? row!.home_cards.flatMap((c) => (c && typeof c === "object" && !Array.isArray(c) && typeof (c as Record<string, Json | undefined>).key === "string" ? [{ key: (c as Record<string, string>).key, hidden: !!(c as Record<string, unknown>).hidden }] : [])) : [];
  return { nav: strs(row?.nav), home_cards: cards, quick_actions: strs(row?.quick_actions) };
}

/* ---------------------------------------------------------------- CSV */
/** Hand-rolled RFC-4180-ish parser: quotes, escaped quotes, CRLF, blank lines skipped. Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { inQ = true; continue; }
    if (ch === ",") { row.push(cell); cell = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(cell); if (row.some((c) => c.trim() !== "")) rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export const IMPORT_COLUMNS = ["full_name", "email", "designation", "department", "role", "manager_email", "phone"] as const;
export type ImportRow = Record<(typeof IMPORT_COLUMNS)[number], string>;

export function csvEscape(v: string) {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/* ------------------------------------------------------------- helpers */
export const ROLE_LEVELS: RoleLevel[] = ["super_admin", "director", "executive", "department_head", "manager", "team_lead", "employee", "intern", "consultant", "vendor", "guest"];
export const ASSIGNABLE_LEVELS: RoleLevel[] = ROLE_LEVELS.filter((r) => r !== "super_admin");
export const DELEGATION_KINDS: { key: string; label: string; hint: string }[] = [
  { key: "approvals", label: "Approvals", hint: "Pending approvals are routed to the delegate" },
  { key: "leave", label: "Leave", hint: "Leave requests from reports go to the delegate" },
  { key: "requests", label: "Requests", hint: "Self-service requests" },
  { key: "decisions", label: "Decisions", hint: "Decision rights" },
  { key: "tasks", label: "Task assignment", hint: "May assign work to the delegator's reports" },
  { key: "help", label: "Help desk", hint: "Help requests owned by the delegator" },
];
export const DECISION_LEVELS: { key: string; label: string }[] = [
  { key: "recommend", label: "Recommends only" }, { key: "approve_routine", label: "Approves routine items" }, { key: "approve_team", label: "Approves for the team" }, { key: "approve_department", label: "Approves for the department" }, { key: "approve_company", label: "Approves company-wide" },
];
export const POLICY_CATEGORIES = ["attendance", "leave", "remote", "it", "security", "communication", "travel", "expense", "conduct", "data"] as const;
export const LOCKABLE_FEATURES: { key: string; label: string; hint: string }[] = [
  { key: "external_sharing", label: "External sharing", hint: "Stops every share outside the company" },
  { key: "video_calls", label: "Video calls", hint: "Disables meetings and calls" },
  { key: "downloads", label: "Downloads", hint: "Files become view-only for everyone" },
  { key: "ai", label: "AI / GHL Buddy", hint: "Pauses the assistant company-wide" },
];

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
export function endOfDayIso(date: string) {
  return date ? new Date(`${date}T23:59:59`).toISOString() : null;
}
export function jsonArray(j: Json | null | undefined): Json[] {
  return Array.isArray(j) ? j : [];
}
export function jsonObj(j: Json | null | undefined): Record<string, Json | undefined> {
  return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, Json | undefined>) : {};
}
export function num(j: Json | undefined, d = 0) {
  return typeof j === "number" ? j : typeof j === "string" && j !== "" && !Number.isNaN(Number(j)) ? Number(j) : d;
}
export function str(j: Json | undefined, d = "") {
  return typeof j === "string" ? j : j == null ? d : String(j);
}

/** Quality gate item on a task (`tasks.quality_gates`). */
export type QualityGate = { label: string; done: boolean; by?: string | null; at?: string | null };
export function parseGates(j: Json | null | undefined): QualityGate[] {
  return jsonArray(j).flatMap((g) => {
    const o = jsonObj(g);
    return typeof o.label === "string" ? [{ label: o.label, done: !!o.done, by: typeof o.by === "string" ? o.by : null, at: typeof o.at === "string" ? o.at : null }] : [];
  });
}

/** Quiz question on a policy (`policies.quiz`). */
export type QuizQuestion = { q: string; options: string[]; answer: number };
export function parseQuiz(j: Json | null | undefined): QuizQuestion[] {
  return jsonArray(j).flatMap((x) => {
    const o = jsonObj(x);
    if (typeof o.q !== "string") return [];
    const options = jsonArray(o.options).filter((s): s is string => typeof s === "string");
    const answer = typeof o.answer === "number" ? o.answer : typeof o.answer === "string" ? Math.max(0, options.indexOf(o.answer)) : 0;
    return [{ q: o.q, options, answer }];
  });
}
