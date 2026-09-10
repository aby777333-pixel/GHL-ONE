/**
 * Shared shapes for the Access Control Studio.
 *
 * Everything here mirrors a database RPC from 0035/0036. The studio never computes authorisation
 * itself — it asks Postgres and renders the answer, so what an owner sees is exactly what the
 * database will do.
 */

export type Risk = "standard" | "elevated" | "high";

export type PermissionRow = {
  key: string;
  label: string;
  description: string | null;
  grp: string;
  risk: Risk;
  requires: string[];
  platform_only: boolean;
  position: number;
  /** The area the key governs (people, files, wiki…). Informational — authorisation is by key. */
  module?: string | null;
  /** view | create | edit | delete | approve | manage | export | publish | … */
  action?: string | null;
  /**
   * The broad key this one refines. `has_perm` accepts either, which is what let the catalogue be
   * split into module × action without changing what any existing role grants (0040).
   */
  legacy_alias?: string | null;
};

/** One line of `effective_permissions()`. */
export type EffectivePermission = {
  key: string;
  label: string;
  grp: string;
  risk: Risk;
  platform_only: boolean;
  allowed: boolean;
};

/** One step of the chain `explain_permission()` returns. */
export type ExplainStep = { step: string; effect: "allow" | "deny"; detail: string };
export type Explanation = { allowed: boolean; perm: string; user_id: string; chain: ExplainStep[]; reason?: string };

export type PreviewUser = {
  user: { id: string; name: string; role: string; designation: string | null; status: string; department_id: string | null; org_id: string | null };
  is_platform_owner: boolean;
  permissions: EffectivePermission[];
  screens: { key: string; label: string; path: string; grp: string; allowed: boolean; source: string }[];
  roles: { key: string; name: string; acting: boolean; expires_at: string | null }[];
  overrides: { perm: string; allowed: boolean; expires_at: string | null; reason: string | null }[];
};

export type PreviewRole = {
  role: { id: string; key: string; name: string; base_level: string; description: string | null };
  permissions: { key: string; label: string; grp: string; risk: Risk; allowed: boolean }[];
  screens: string[];
  denied_screens: string[];
  holders: { id: string; name: string; designation: string | null }[];
};

export type ChangeImpact = {
  role: { id: string; name: string };
  granted: { key: string; label: string; risk: Risk }[];
  removed: { key: string; label: string; risk: Risk }[];
  high_risk: string[];
  missing_dependencies: { permission: string; needs: string }[];
  affected_count: number;
  affected: { id: string; name: string; designation: string | null }[];
};

export type ReviewBoard = {
  high_risk: { permission: string; label: string; holders: number }[];
  temporary: { user_id: string; name: string; permission: string; allowed: boolean; expires_at: string | null; reason: string | null }[];
  acting_roles: { user_id: string; name: string; role: string; expires_at: string | null }[];
  orphaned: { user_id: string; name: string; status: string; permissions: number }[];
  company_limit: { org_id: string; template: string; permissions: string[] | null; note: string | null } | null;
};

export const RISK_TONE: Record<Risk, string> = {
  standard: "tone-neutral",
  elevated: "tone-warn",
  high: "tone-danger",
};

export const RISK_LABEL: Record<Risk, string> = {
  standard: "Standard",
  elevated: "Elevated",
  high: "High risk",
};

/** Human names for the module groups the catalogue uses. */
export const GROUP_LABEL: Record<string, string> = {
  general: "General",
  work: "Work",
  people: "People",
  organisation: "Organisation",
  communication: "Communication",
  connect: "GHL Connect",
  files: "Files",
  reports: "Reports",
  admin: "Administration",
  security: "Security",
  platform: "Platform",
};

export function groupOf(key: string, rows: { key: string; grp: string }[]) {
  return rows.find((r) => r.key === key)?.grp || "general";
}

/** Group a flat catalogue into ordered module buckets for the visual map (§37). */
export function byGroup<T extends { grp: string; position?: number }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    if (!map.has(r.grp)) map.set(r.grp, []);
    map.get(r.grp)!.push(r);
  }
  return [...map.entries()].map(([grp, items]) => ({ grp, label: GROUP_LABEL[grp] || grp, items }));
}

/** The templates an owner can start a company's administrative ceiling from (§110). */
export const ADMIN_TEMPLATES: { key: string; label: string; hint: string; permissions: string[] | null }[] = [
  {
    key: "full",
    label: "Full company admin",
    hint: "Everything inside their own company. The default, and how every existing company behaves today.",
    permissions: null,
  },
  {
    key: "standard",
    label: "Standard company admin",
    hint: "Runs the company day to day, but does not touch security, integrations or the audit log.",
    permissions: [
      "view", "comment", "create", "edit", "delete", "invite", "approve", "assign_task",
      "create_project", "projects.manage", "create_group", "share_internal", "download",
      "view_reports", "manage_team", "people.manage", "attendance.manage", "shifts.manage",
      "leave.approve", "department.manage", "broadcast_department", "broadcast_company",
      "connect.use", "connect.send", "connect.call", "system.manage",
    ],
  },
  {
    key: "restricted",
    label: "Restricted company admin",
    hint: "People and day-to-day work only. No company settings, no external sharing, no exports.",
    permissions: [
      "view", "comment", "create", "edit", "invite", "approve", "assign_task",
      "create_project", "create_group", "share_internal", "view_reports",
      "manage_team", "attendance.manage", "leave.approve", "broadcast_department",
      "connect.use", "connect.call",
    ],
  },
];
