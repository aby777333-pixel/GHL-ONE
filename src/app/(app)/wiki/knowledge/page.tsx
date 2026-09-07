import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { KnowledgeBrowser, type KnowledgeRow } from "@/components/ai/KnowledgeBrowser";
import { knowledgeOwnership } from "./ownership";

export const metadata = { title: "Approved knowledge — GHL ONE" };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  const supabase = await createClient();
  const [{ data }, ownership] = await Promise.all([
    supabase
      .from("ai_knowledge")
      .select("id,title,kind,department_id,tags,status,review_at,approved_at,approved_by,owner_id,updated_at,created_by,classification,source_type")
      .order("updated_at", { ascending: false })
      .limit(400),
    knowledgeOwnership(supabase, session.userId, session.profile.role),
  ]);
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return <KnowledgeBrowser rows={(data || []) as KnowledgeRow[]} ownership={ownership} initial={{ q: one(sp.q), dept: one(sp.dept), create: sp.new === "1", title: one(sp.title), body: one(sp.body), tags: one(sp.tags) }} />;
}
