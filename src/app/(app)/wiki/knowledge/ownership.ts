import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isAdminRole, type RoleLevel } from "@/lib/utils";
import type { Ownership } from "@/components/ai/KnowledgeBrowser";

/** Which departments' knowledge the caller may approve (admins / ai.manage → all). */
export async function knowledgeOwnership(db: SupabaseClient<Database>, userId: string, role: RoleLevel): Promise<Ownership> {
  if (isAdminRole(role)) return { all: true, departments: [] };
  const [{ data: perm }, { data: owned }, { data: headed }] = await Promise.all([
    db.rpc("has_admin_perm", { perm: "ai.manage" }),
    db.from("ai_knowledge_owners").select("department_id").eq("user_id", userId),
    db.from("departments").select("id").eq("head_id", userId),
  ]);
  if (perm) return { all: true, departments: [] };
  return { all: false, departments: [...new Set([...(owned || []).map((o) => o.department_id), ...(headed || []).map((d) => d.id)])] };
}
