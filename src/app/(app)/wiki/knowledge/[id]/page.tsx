import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { KnowledgeArticle } from "@/components/ai/KnowledgeArticle";
import { knowledgeOwnership } from "../ownership";

export const metadata = { title: "Knowledge — GHL ONE" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function KnowledgeArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const session = await getSession();
  const supabase = await createClient();
  const [{ data }, ownership] = await Promise.all([
    supabase.from("ai_knowledge").select("*").eq("id", id).maybeSingle(),
    knowledgeOwnership(supabase, session.userId, session.profile.role),
  ]);
  if (!data) notFound();
  return <KnowledgeArticle article={data} ownership={ownership} />;
}
