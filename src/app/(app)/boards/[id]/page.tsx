import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { RestrictedResource } from "@/components/access/RequestAccess";
import { BoardCanvas } from "@/components/board/BoardCanvas";

export const metadata = { title: "Board" };

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  await getSession();
  const { id } = await params;
  const supabase = await createClient();
  const { data: board } = await supabase.from("boards").select("*").eq("id", id).maybeSingle();

  // RLS hides a board you cannot open, so "not found" and "no access" look the same here —
  // never a bare 404: offer Request access instead.
  if (!board) {
    return (
      <RestrictedResource
        kind="board"
        backHref="/boards"
        backLabel="All boards"
        resource_type="dataset"
        resource_id={id}
        resource_label="Whiteboard"
      />
    );
  }

  return <BoardCanvas boardId={board.id} roomId={board.room_id || undefined} initialBoard={board} />;
}
