import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ConnectPerms = { use: boolean; send: boolean; approve: boolean; manage: boolean; viewAll: boolean };

/** Effective GHL Connect permissions for the signed-in user (evaluated in Postgres via `has_perm` / `has_admin_perm`). */
export async function connectPerms(): Promise<ConnectPerms> {
  const supabase = await createClient();
  const [use, send, approve, manage, viewAll, commAdmin] = await Promise.all([
    supabase.rpc("has_perm", { p_perm: "connect.use" }),
    supabase.rpc("has_perm", { p_perm: "connect.send" }),
    supabase.rpc("has_perm", { p_perm: "connect.approve" }),
    supabase.rpc("has_perm", { p_perm: "connect.manage" }),
    supabase.rpc("has_perm", { p_perm: "connect.view_all" }),
    supabase.rpc("has_admin_perm", { perm: "communication.manage" }),
  ]);
  const adminOk = !!commAdmin.data;
  return { use: !!use.data || adminOk, send: !!send.data, approve: !!approve.data || adminOk, manage: !!manage.data || adminOk, viewAll: !!viewAll.data || adminOk };
}
