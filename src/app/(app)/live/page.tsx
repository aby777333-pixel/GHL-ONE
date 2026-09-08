import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { LiveHub, type HubRoom } from "@/components/live/LiveHub";

export const metadata = { title: "GHL LIVE" };
export const dynamic = "force-dynamic";

const COLS = "id,title,kind,status,persistent,started_at,last_active_at,ended_at,host_id,department_id,project_id,confidential";

export default async function LivePage() {
  const session = await getSession();
  const supabase = await createClient();

  const [{ data: liveRooms }, { data: myRooms }, { data: recentIds }, { data: favourites }] = await Promise.all([
    // RLS already limits this to rooms the caller may see.
    supabase.from("live_rooms").select(`${COLS}, participants:live_participants(user_id)`).eq("status", "live").order("last_active_at", { ascending: false }).limit(40),
    supabase.from("live_rooms").select(COLS).eq("persistent", true).neq("status", "ended").order("last_active_at", { ascending: false }).limit(40),
    supabase.from("live_participants").select("room_id,joined_at").eq("user_id", session.userId).order("joined_at", { ascending: false }).limit(30),
    supabase.from("collab_favorites").select("entity_id").eq("user_id", session.userId).eq("kind", "room"),
  ]);

  const ids = [...new Set((recentIds || []).map((r) => r.room_id))];
  const { data: recentRooms } = ids.length
    ? await supabase.from("live_rooms").select(COLS).in("id", ids).order("last_active_at", { ascending: false }).limit(30)
    : { data: [] };

  return (
    <LiveHub
      live={(liveRooms || []) as unknown as HubRoom[]}
      persistent={(myRooms || []) as unknown as HubRoom[]}
      recent={(recentRooms || []) as unknown as HubRoom[]}
      favouriteIds={(favourites || []).map((f) => f.entity_id)}
    />
  );
}
