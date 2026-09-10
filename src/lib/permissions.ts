import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * The one place server code asks "is this allowed?".
 *
 * Every function here goes through the caller's own RLS-scoped client and lets Postgres answer —
 * `has_perm` is the single source of truth (0035), so an answer here can never disagree with what
 * the database will actually permit. Nothing in this file grants anything or widens a scope.
 *
 * Hiding a button is a convenience. THIS is the control: server pages, route handlers and server
 * actions must call it before doing anything a permission governs, because a hidden control is
 * still reachable by typing the URL or posting to the endpoint.
 */

export type PermissionKey = string;

export type EffectivePermission = {
  key: string;
  label: string;
  grp: string;
  risk: "standard" | "elevated" | "high";
  platform_only: boolean;
  allowed: boolean;
};

/**
 * Does the signed-in user hold this permission?
 *
 * Fails closed: a transport error, a missing session or an unknown key all return false. Cached
 * per request, so asking the same question in a layout and again in a page is one round trip.
 */
export const can = cache(async (perm: PermissionKey): Promise<boolean> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("has_perm", { p_perm: perm });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
});

/** `can`, but for several keys at once. Returns a map; every unknown key is false. */
export async function canAll(perms: PermissionKey[]): Promise<Record<string, boolean>> {
  const results = await Promise.all(perms.map(async (p) => [p, await can(p)] as const));
  return Object.fromEntries(results);
}

/** True when EVERY key is held. Use for actions that genuinely need all of them. */
export async function canEvery(perms: PermissionKey[]): Promise<boolean> {
  const map = await canAll(perms);
  return perms.every((p) => map[p]);
}

/** True when ANY key is held. */
export async function canAny(perms: PermissionKey[]): Promise<boolean> {
  const map = await canAll(perms);
  return perms.some((p) => map[p]);
}

/** Is the signed-in user the platform owner — the authority above every company? */
export const isPlatformOwner = cache(async (): Promise<boolean> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("is_platform_owner");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
});

/**
 * The whole catalogue with an allowed flag, for a person you are entitled to review.
 * Returns [] when you are not — the database refuses rather than trimming.
 */
export async function getEffectivePermissions(userId?: string): Promise<EffectivePermission[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("effective_permissions", userId ? { p_user: userId } : {});
    if (error || !Array.isArray(data)) return [];
    return data as unknown as EffectivePermission[];
  } catch {
    return [];
  }
}

/**
 * Throw unless the permission is held. For server actions and route handlers, where the honest
 * outcome of "not allowed" is to stop, not to carry on with a narrower result.
 */
export async function requirePermission(perm: PermissionKey): Promise<void> {
  if (!(await can(perm))) {
    throw new Error(`Not allowed: ${perm}`);
  }
}

/**
 * Does this person hold their company's own top security role?
 *
 * Deliberately NOT `profile.role === "super_admin"`. That is an organisational hierarchy level —
 * a fact about where someone sits, like a job title — and organisational identity must never by
 * itself decide authority. `company_super_admin` (0041) is the role that carries it, given and
 * taken independently of anybody's title, level or department.
 *
 * Fails closed, and cached per request like `can`.
 */
export const isCompanySuperAdmin = cache(async (): Promise<boolean> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("is_company_super_admin");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
});
