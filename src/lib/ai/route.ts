import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiEnabled, aiErrorMessage, AIDisabledError } from "./client";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Ctx = { db: SupabaseClient<Database>; userId: string; orgId: string; role: Database["public"]["Enums"]["role_level"]; name: string; departmentId: string | null };

/** Authenticate the caller (RLS-scoped client) and run the handler with uniform error handling. */
export async function withAI(req: Request, handler: (ctx: Ctx, body: Record<string, unknown>) => Promise<unknown>) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await db.from("profiles").select("org_id,role,full_name,is_active,department_id").eq("id", user.id).maybeSingle();
  if (!profile?.is_active || !profile.org_id) return NextResponse.json({ error: "Account not active" }, { status: 403 });
  if (!aiEnabled()) return NextResponse.json({ error: new AIDisabledError().message, disabled: true }, { status: 503 });
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  try {
    const result = await handler({ db, userId: user.id, orgId: profile.org_id, role: profile.role, name: profile.full_name, departmentId: profile.department_id }, body);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[ai]", e);
    return NextResponse.json({ error: aiErrorMessage(e) }, { status: 500 });
  }
}

export function str(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}
export function bool(v: unknown) {
  return v === true || v === "true" || v === 1;
}

/** Read a cached AI output. */
export async function readCache(db: SupabaseClient<Database>, params: { kind: string; entityType?: string; entityId?: string | null; userId?: string | null; day?: string | null; inputHash?: string | null }) {
  let q = db.from("ai_summaries").select("id,content,created_at,input_hash").eq("kind", params.kind).order("created_at", { ascending: false }).limit(1);
  q = params.entityType ? q.eq("entity_type", params.entityType) : q.is("entity_type", null);
  q = params.entityId ? q.eq("entity_id", params.entityId) : q.is("entity_id", null);
  q = params.userId ? q.eq("user_id", params.userId) : q.is("user_id", null);
  if (params.day) q = q.eq("day", params.day);
  const { data } = await q;
  const row = data?.[0];
  if (!row) return null;
  if (params.inputHash && row.input_hash && row.input_hash !== params.inputHash) return null;
  return row;
}

export async function writeCache(db: SupabaseClient<Database>, params: { orgId: string; kind: string; entityType?: string; entityId?: string | null; userId?: string | null; day?: string | null; inputHash?: string | null; content: unknown; model: string }) {
  const { data } = await db
    .from("ai_summaries")
    .insert({ org_id: params.orgId, kind: params.kind, entity_type: params.entityType ?? null, entity_id: params.entityId ?? null, user_id: params.userId ?? null, day: params.day ?? null, input_hash: params.inputHash ?? null, content: params.content as Database["public"]["Tables"]["ai_summaries"]["Insert"]["content"], model: params.model })
    .select("id,created_at")
    .single();
  return data;
}
