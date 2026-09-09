"use client";

import * as React from "react";
import type { Profile, Department } from "@/lib/utils";
import { isPathAllowed, type Screen } from "@/lib/screens";

export type SessionCtx = {
  profile: Profile;
  departments: Department[];
  people: Pick<Profile, "id" | "full_name" | "avatar_url" | "designation" | "department_id" | "role" | "presence" | "email">[];
  /** Governed screens for this user (`effective_screens()`); empty = no governance loaded. */
  screens?: Screen[];
  /** `is_platform_admin()` — this user administers the platform itself, above any single company. */
  platformAdmin?: boolean;
  /** `platform_role()` — platform_super_admin | platform_ops | platform_support | platform_security | … Null for everyone else. */
  platformRole?: string | null;
  /**
   * The permission keys this user effectively holds (`effective_permissions()` filtered to the
   * allowed ones). Convenience for the UI ONLY — every route, query and action is still checked
   * in Postgres by `has_perm`. A missing key here hides a control; it is never what stops anybody.
   */
  permissions?: string[];
};

const Ctx = React.createContext<SessionCtx | null>(null);

export function SessionProvider({ value, children }: { value: SessionCtx; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}

export function usePerson(id?: string | null) {
  const { people } = useSession();
  return id ? people.find((p) => p.id === id) : undefined;
}

export function useDepartment(id?: string | null) {
  const { departments } = useSession();
  return id ? departments.find((d) => d.id === id) : undefined;
}

/**
 * Permission checks in the UI: `usePermission("files.download")`.
 *
 * Convenience, not control. It decides whether to render a button; the database decides whether the
 * button works. Never use it to decide what data to fetch — fetch it and let RLS answer.
 */
export function usePermission(perm: string) {
  const { permissions } = useSession();
  return (permissions || []).includes(perm);
}

/** The whole set, for components that test several keys. */
export function usePermissions() {
  const { permissions } = useSession();
  const set = React.useMemo(() => new Set(permissions || []), [permissions]);
  return {
    has: (perm: string) => set.has(perm),
    hasAny: (perms: string[]) => perms.some((p) => set.has(p)),
    hasAll: (perms: string[]) => perms.every((p) => set.has(p)),
    all: permissions || [],
  };
}

/**
 * Render children only when the permission is held.
 *
 *   <Can permission="projects.create"><Button>New project</Button></Can>
 *
 * `fallback` is for the rare case where a locked thing should still be visible — a resource you
 * may request access to. Most of the time the right answer is to render nothing: an unusable
 * control that is merely disabled tells people the product is broken rather than restricted.
 */
export function Can({ permission, any: anyOf, children, fallback = null }: { permission?: string; any?: string[]; children: React.ReactNode; fallback?: React.ReactNode }) {
  const { has, hasAny } = usePermissions();
  const ok = permission ? has(permission) : anyOf ? hasAny(anyOf) : true;
  return <>{ok ? children : fallback}</>;
}

/** Screen governance on the client: `canOpen("/workforce")`. The proxy enforces the same rule server-side. */
export function useScreens() {
  const { screens } = useSession();
  return {
    screens: screens || [],
    canOpen: (path: string) => isPathAllowed(screens, path),
    screen: (key: string) => (screens || []).find((s) => s.key === key),
  };
}
