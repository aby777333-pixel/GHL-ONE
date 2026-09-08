import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { livekitEnabled, livekitWsUrl, mintToken } from "@/lib/live/livekit";
import type { JoinResult, RoomSettings } from "@/lib/live/types";

export const maxDuration = 30;

/**
 * POST /api/live/token
 * Body: { roomId, device? }  → member join (RLS + join_live_room decide access, waiting room, role)
 *       { guestToken, name }  → external guest join (capability token; no company data)
 * Returns { token, url, role, room, title, kind, settings, confidential, identity }
 */
export async function POST(req: Request) {
  if (!livekitEnabled()) return NextResponse.json({ error: "Live media is not configured (LIVEKIT_* env missing).", disabled: true }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { roomId?: string; device?: string; guestToken?: string; name?: string };
  const supabase = await createClient();

  // ---- external guest -------------------------------------------------------
  if (body.guestToken) {
    const { data, error } = await supabase.rpc("live_guest_lookup", { p_token: body.guestToken });
    const g = (data ?? {}) as { ok?: boolean; room_id?: string; title?: string; livekit_room?: string; guest_name?: string; org?: string; locked?: boolean };
    if (error || !g.ok || !g.livekit_room) return NextResponse.json({ error: "This guest link is invalid or has expired." }, { status: 403 });
    if (g.locked) return NextResponse.json({ error: "The room is locked. Ask the host to unlock it." }, { status: 423 });
    const name = (body.name || g.guest_name || "Guest").slice(0, 60);
    const identity = `guest:${body.guestToken.slice(0, 8)}:${Math.random().toString(36).slice(2, 7)}`;
    await supabase.rpc("live_guest_consume", { p_token: body.guestToken, p_name: name });
    const token = await mintToken({ identity, name: `${name} (Guest)`, room: g.livekit_room, metadata: { guest: true, name }, canPublish: true, canPublishData: true, ttlSeconds: 60 * 60 * 3 });
    return NextResponse.json({ token, url: livekitWsUrl(), role: "guest", room: g.room_id, title: g.title, kind: "temp", settings: { allow_recording: false, allow_whiteboard: false }, confidential: false, identity, guest: true, org: g.org });
  }

  // ---- member ---------------------------------------------------------------
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!body.roomId) return NextResponse.json({ error: "roomId required" }, { status: 400 });

  const { data: joined, error } = await supabase.rpc("join_live_room", { p_room: body.roomId, p_device: body.device ?? undefined });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const j = joined as unknown as JoinResult;
  if (!j.ok) {
    const status = j.reason === "waiting" ? 202 : j.reason === "ended" ? 410 : 403;
    return NextResponse.json({ error: j.reason === "waiting" ? "Waiting for the host to admit you." : j.reason === "ended" ? "This room has ended." : "You do not have access to this room.", reason: j.reason }, { status });
  }

  const { data: profile } = await supabase.from("profiles").select("full_name, avatar_url, role, designation").eq("id", user.id).maybeSingle();
  const settings = (j.settings || {}) as RoomSettings;
  const isHostish = j.role === "host" || j.role === "cohost" || j.role === "presenter";
  const canPublish = settings.presenter_only ? isHostish : true;
  const token = await mintToken({
    identity: user.id,
    name: profile?.full_name || user.email || "Member",
    room: j.livekit_room,
    metadata: { avatar: profile?.avatar_url ?? undefined, role: j.role, designation: profile?.designation ?? undefined, level: profile?.role ?? undefined },
    canPublish,
    canPublishData: true,
  });
  return NextResponse.json({ token, url: livekitWsUrl(), role: j.role, room: body.roomId, title: j.title, kind: j.kind, settings, confidential: j.confidential, identity: user.id, canPublish });
}
