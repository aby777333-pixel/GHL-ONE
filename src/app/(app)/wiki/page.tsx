import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { WikiBrowser } from "@/components/wiki/WikiBrowser";
import { excerpt } from "@/components/wiki/markdown";
import type { WikiListItem } from "@/components/wiki/constants";

export const metadata = { title: "Wiki — GHL ONE" };

export default async function WikiIndexPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await getSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("wiki_pages")
    .select("id,title,slug,category,department_id,classification,author_id,updated_at,created_at,body,author:profiles!wiki_pages_author_id_fkey(id,full_name,avatar_url)")
    .order("updated_at", { ascending: false });

  const pages: WikiListItem[] = (data || []).map((p) => ({
    id: p.id, title: p.title, slug: p.slug, category: p.category, department_id: p.department_id, classification: p.classification,
    author_id: p.author_id, updated_at: p.updated_at, created_at: p.created_at, excerpt: excerpt(p.body, 150),
    author: (p.author as unknown as WikiListItem["author"]) || null,
  }));

  return <WikiBrowser pages={pages} initial={{ category: typeof sp.category === "string" ? sp.category : undefined, q: typeof sp.q === "string" ? sp.q : undefined, create: sp.new === "1" }} />;
}
