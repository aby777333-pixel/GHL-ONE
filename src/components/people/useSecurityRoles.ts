"use client";

/**
 * Who holds which security role, for the screens that list people.
 *
 * The point of this hook is the distinction the whole access model rests on: a person's **job
 * title** (`profiles.designation`) says what they do, their **access level** (`profiles.role`) says
 * where they sit in the chain of command, and their **security roles** — these — are the only one
 * of the three that grants anything. Showing them together is what stops somebody reading a title
 * as authority.
 *
 * RLS decides what comes back. `ur_read` lets a person see their own roles, and managers, HR and
 * security administrators see everyone's, so an ordinary employee gets a map containing only
 * themselves. Callers must therefore treat "no roles listed" as "not visible to you", never as
 * "this person has none" — every consumer here simply renders nothing in that case.
 */

import * as React from "react";
import { createClient } from "@/lib/supabase/client";

export type SecurityRole = { id: string; name: string; acting: boolean; expires_at: string | null };

type Row = {
  user_id: string;
  acting: boolean | null;
  expires_at: string | null;
  system_roles: { id: string; name: string } | { id: string; name: string }[] | null;
};

export function useSecurityRoles(): { byUser: Map<string, SecurityRole[]>; loading: boolean } {
  const [byUser, setByUser] = React.useState<Map<string, SecurityRole[]>>(() => new Map());
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    createClient()
      .from("user_roles")
      .select("user_id,acting,expires_at,system_roles(id,name)")
      .then(({ data }) => {
        if (!alive) return;
        const m = new Map<string, SecurityRole[]>();
        const now = Date.now();
        for (const r of (data || []) as Row[]) {
          // An expired grant is not authority any more, so it should not read as any.
          if (r.expires_at && Date.parse(r.expires_at) <= now) continue;
          // PostgREST returns an embedded row as an object or a single-element array depending on
          // how it infers the relationship; accept both rather than guessing.
          const sr = Array.isArray(r.system_roles) ? r.system_roles[0] : r.system_roles;
          if (!sr) continue;
          const list = m.get(r.user_id) || [];
          list.push({ id: sr.id, name: sr.name, acting: !!r.acting, expires_at: r.expires_at });
          m.set(r.user_id, list);
        }
        for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name));
        setByUser(m);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { byUser, loading };
}
