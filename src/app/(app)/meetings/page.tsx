import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { MeetingsClient, type MeetingListItem } from "@/components/meetings/MeetingsClient";

export const metadata = { title: "Meetings" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await getSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const since = new Date(new Date().getTime() - 90 * 86400_000).toISOString();
  const [{ data: meetings }, { data: projects }] = await Promise.all([
    supabase.from("meetings").select("*").gte("starts_at", since).order("starts_at", { ascending: false }).limit(300),
    supabase.from("projects").select("id,name").eq("archived", false).order("name"),
  ]);
  const ids = (meetings || []).map((m) => m.id);
  const roomIds = [...new Set((meetings || []).map((m) => m.live_room_id).filter((x): x is string => !!x))];
  const [{ data: parts }, { data: actions }, { data: rooms }] = ids.length
    ? await Promise.all([
        supabase.from("meeting_participants").select("meeting_id,user_id").in("meeting_id", ids),
        supabase.from("meeting_actions").select("meeting_id,confirmed").in("meeting_id", ids),
        // A room can be tied to a meeting from either side — `meetings.live_room_id`, or the room's own
        // `meeting_id` (a room started from the meeting's Collaborate menu). Read both.
        supabase.from("live_rooms").select("id,status,meeting_id").or(`meeting_id.in.(${ids.join(",")})${roomIds.length ? `,id.in.(${roomIds.join(",")})` : ""}`),
      ])
    : [{ data: [] }, { data: [] }, { data: [] as { id: string; status: string; meeting_id: string | null }[] }];
  // The GHL Live room's own state: a host can end the room before the scheduled end time (→ Ended), and
  // a call can run past it (→ still live). A live room wins over an ended one for the same meeting.
  const roomStatus = new Map((rooms || []).map((r) => [r.id, r.status]));
  const liveByMeeting = new Map<string, string>();
  const liveRoomOf = new Map<string, string>();
  for (const r of rooms || []) {
    if (!r.meeting_id) continue;
    const cur = liveByMeeting.get(r.meeting_id);
    if (!cur || r.status === "live") liveByMeeting.set(r.meeting_id, r.status);
    if (r.status === "live") liveRoomOf.set(r.meeting_id, r.id);
  }

  const items: MeetingListItem[] = (meetings || []).map((m) => ({
    ...m,
    participant_ids: (parts || []).filter((p) => p.meeting_id === m.id).map((p) => p.user_id),
    action_count: (actions || []).filter((a) => a.meeting_id === m.id).length,
    confirmed_count: (actions || []).filter((a) => a.meeting_id === m.id && a.confirmed).length,
    live_status: (() => {
      const linked = m.live_room_id ? roomStatus.get(m.live_room_id) || null : null;
      const byMeeting = liveByMeeting.get(m.id) || null;
      return linked === "live" || byMeeting === "live" ? "live" : linked || byMeeting;
    })(),
    // The room that is live right now, whichever side linked it — so Join always has somewhere to go.
    live_room_now: (m.live_room_id && roomStatus.get(m.live_room_id) === "live" ? m.live_room_id : liveRoomOf.get(m.id)) || null,
  }));

  return (
    <MeetingsClient
      meetings={items}
      projects={projects || []}
      openNew={one(sp.new) === "1"}
      initialTab={one(sp.tab) || undefined}
      defaults={{
        project_id: one(sp.project) || null,
        title: one(sp.title) || undefined,
        participants: one(sp.with).split(",").map((s) => s.trim()).filter(Boolean),
      }}
    />
  );
}
