import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { WikiPage, type WikiPageData } from "@/components/wiki/WikiPage";

export default async function WikiSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await getSession();
  const supabase = await createClient();
  const { data } = await supabase
    .from("wiki_pages")
    .select("*, author:profiles!wiki_pages_author_id_fkey(id,full_name,avatar_url,designation), department:departments!wiki_pages_department_id_fkey(id,name,color)")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) notFound();
  const { data: siblings } = await supabase.from("wiki_pages").select("id,title,slug").eq("category", data.category).neq("id", data.id).order("title").limit(12);
  return <WikiPage page={data as unknown as WikiPageData} siblings={siblings || []} />;
}
