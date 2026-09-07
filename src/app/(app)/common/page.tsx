import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { CommonHub, type CommonHubData } from "@/components/common/CommonHub";
import { GROUP_TYPES } from "@/components/common/visibility";
import type { Enums } from "@/lib/utils";

export const metadata = { title: "GHL Common" };

export default async function CommonPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  const supabase = await createClient();

  const [{ data: open }, { data: unread }, { data: board }, { data: availability }, { data: myMemberships }] = await Promise.all([
    supabase.from("channels").select("*").eq("visibility", "company_open").eq("archived", false).neq("type", "dm").order("name"),
    supabase.rpc("my_unread_counts"),
    supabase
      .from("help_requests")
      .select("id,title,details,priority,status,department_id,requester_id,owner_id,service_id,created_at,ack_due_at,deadline")
      .eq("visible_on_board", true)
      .in("status", ["new", "waiting"])
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.rpc("department_availability"),
    supabase.from("channel_members").select("channel_id,expires_at,role,invite_reason").eq("user_id", session.userId),
  ]);

  const openIds = (open || []).map((c) => c.id);
  const myIds = (myMemberships || []).map((m) => m.channel_id);
  const [{ data: memberRows }, { data: rooms }] = await Promise.all([
    openIds.length ? supabase.from("channel_members").select("channel_id").in("channel_id", openIds) : Promise.resolve({ data: [] as { channel_id: string }[] }),
    myIds.length
      ? supabase.from("channels").select("*").in("id", myIds).in("type", GROUP_TYPES as Enums<"channel_type">[]).eq("archived", false).order("last_message_at", { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const memberCount: Record<string, number> = {};
  for (const r of memberRows || []) memberCount[r.channel_id] = (memberCount[r.channel_id] || 0) + 1;
  const unreadMap: Record<string, number> = {};
  for (const u of unread || []) unreadMap[u.channel_id] = Number(u.unread || 0);
  const membership: CommonHubData["membership"] = {};
  for (const m of myMemberships || []) membership[m.channel_id] = { expires_at: m.expires_at, role: m.role, invite_reason: m.invite_reason };

  const roomIds = (rooms || []).map((c) => c.id);
  const { data: roomMembers } = roomIds.length ? await supabase.from("channel_members").select("channel_id").in("channel_id", roomIds) : { data: [] as { channel_id: string }[] };
  for (const r of roomMembers || []) memberCount[r.channel_id] = (memberCount[r.channel_id] || 0) + 1;

  const data: CommonHubData = {
    openChannels: open || [],
    rooms: rooms || [],
    memberCount,
    unread: unreadMap,
    membership,
    board: board || [],
    availability: availability || [],
    openCreate: sp.new === "1",
  };
  return <CommonHub data={data} />;
}
