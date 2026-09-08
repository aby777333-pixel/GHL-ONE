import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DocsHub, type DocListItem } from "@/components/docs";

export const metadata = { title: "Live docs" };

export default async function DocsPage() {
  await getSession();
  const supabase = await createClient();
  const { data } = await supabase
    .from("live_docs")
    .select("id,title,kind,visibility,owner_id,updated_at,body,project_id,meeting_id,department_id,room_id")
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(200);

  const docs: DocListItem[] = (data || []).map((d) => ({ ...d, body: (d.body || "").slice(0, 400) }));
  return <DocsHub docs={docs} />;
}
