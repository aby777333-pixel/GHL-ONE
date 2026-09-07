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

/** Screen governance on the client: `canOpen("/workforce")`. The proxy enforces the same rule server-side. */
export function useScreens() {
  const { screens } = useSession();
  return {
    screens: screens || [],
    canOpen: (path: string) => isPathAllowed(screens, path),
    screen: (key: string) => (screens || []).find((s) => s.key === key),
  };
}
