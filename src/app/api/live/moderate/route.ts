import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { livekitEnabled, muteParticipant, removeParticipant } from "@/lib/live/livekit";

export const maxDuration = 30;

/**
 * POST /api/live/moderate  { roomId, userId, action, value? }
 * action: admit | remove | role | lock | waiting_room | setting | confidential | transfer_host | mute | stop_share | lower_hand | end
 * The database RPC enforces "host only" and writes the audit trail; LiveKit is then updated for media-level actions.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { roomId?: string; userId?: string; action?: string; value?: string };
  if (!body.roomId || !body.action) return NextResponse.json({ error: "roomId and action required" }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (body.action === "end") {
    const { error } = await supabase.rpc("end_live_room", { p_room: body.roomId, p_summary: body.value ?? undefined });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (livekitEnabled()) {
      const { data: room } = await supabase.from("live_rooms").select("livekit_room").eq("id", body.roomId).maybeSingle();
      if (room?.livekit_room) {
        const { roomService } = await import("@/lib/live/livekit");
        await roomService().deleteRoom(room.livekit_room).catch(() => null);
      }
    }
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.rpc("live_moderate", { p_room: body.roomId, p_user: body.userId ?? user.id, p_action: body.action, p_value: body.value ?? undefined });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (livekitEnabled() && body.userId && ["mute", "remove", "stop_share"].includes(body.action)) {
    const { data: room } = await supabase.from("live_rooms").select("livekit_room").eq("id", body.roomId).maybeSingle();
    if (room?.livekit_room) {
      if (body.action === "mute") await muteParticipant(room.livekit_room, body.userId, body.value === "video" ? ["video"] : body.value === "all" ? ["audio", "video", "screen"] : ["audio"]);
      if (body.action === "stop_share") await muteParticipant(room.livekit_room, body.userId, ["screen"]);
      if (body.action === "remove") await removeParticipant(room.livekit_room, body.userId);
    }
  }
  return NextResponse.json({ ok: true });
}
