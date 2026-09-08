import "server-only";
import { AccessToken, RoomServiceClient, type VideoGrant } from "livekit-server-sdk";

/** Server-side LiveKit helpers. Keys live only in env (Netlify secrets). */
export function livekitEnabled() {
  return !!(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && (process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL));
}

export function livekitWsUrl() {
  return process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL || "";
}

function httpUrl() {
  return livekitWsUrl().replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

export function roomService() {
  return new RoomServiceClient(httpUrl(), process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
}

export async function mintToken(opts: {
  identity: string;
  name: string;
  room: string;
  metadata?: Record<string, unknown>;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
  hidden?: boolean;
  ttlSeconds?: number;
}) {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
    identity: opts.identity,
    name: opts.name,
    metadata: opts.metadata ? JSON.stringify(opts.metadata) : undefined,
    ttl: opts.ttlSeconds ?? 60 * 60 * 6,
  });
  const grant: VideoGrant = {
    room: opts.room,
    roomJoin: true,
    canPublish: opts.canPublish ?? true,
    canSubscribe: opts.canSubscribe ?? true,
    canPublishData: opts.canPublishData ?? true,
    canUpdateOwnMetadata: true,
    hidden: opts.hidden ?? false,
  };
  at.addGrant(grant);
  return at.toJwt();
}

/** Mute every published track of a participant (host control). */
export async function muteParticipant(room: string, identity: string, kinds: ("audio" | "video" | "screen")[] = ["audio"]) {
  const svc = roomService();
  const p = await svc.getParticipant(room, identity).catch(() => null);
  if (!p) return false;
  for (const t of p.tracks) {
    const src = String(t.source ?? "").toLowerCase();
    const isScreen = src.includes("screen");
    const isAudio = String(t.type ?? "").toLowerCase().includes("audio") || t.type === 0;
    const match = (kinds.includes("screen") && isScreen) || (kinds.includes("audio") && isAudio && !isScreen) || (kinds.includes("video") && !isAudio && !isScreen);
    if (match && !t.muted) await svc.mutePublishedTrack(room, identity, t.sid, true).catch(() => null);
  }
  return true;
}

export async function removeParticipant(room: string, identity: string) {
  await roomService().removeParticipant(room, identity).catch(() => null);
}

export async function listRoomParticipants(room: string) {
  return roomService().listParticipants(room).catch(() => []);
}
