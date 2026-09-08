import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { BoardsHub } from "@/components/board/BoardsHub";

export const metadata = { title: "Boards" };

export default async function BoardsPage() {
  const { userId } = await getSession();
  const supabase = await createClient();
  const [{ data: boards }, { data: favorites }] = await Promise.all([
    supabase.from("boards").select("*").order("updated_at", { ascending: false }).limit(300),
    supabase.from("collab_favorites").select("entity_id").eq("user_id", userId).eq("kind", "board"),
  ]);
  return <BoardsHub boards={boards || []} favorites={(favorites || []).map((f) => f.entity_id)} />;
}
