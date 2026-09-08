"use client";
/**
 * The live media session — the one LiveKit `Room` the browser is connected to, held at module scope
 * so it is completely unaffected by React unmounting.
 *
 * Why this exists: `useLiveKit` used to disconnect in its unmount cleanup, so walking away from
 * `/live/<id>` silently ended the call while the floating mini bar still said "You are in <room>".
 * Now the room page *adopts* whatever is in here, and only an explicit intent ends the call:
 *
 *   · Leave / End for all in the room                (LiveRoom → cleanup → useLiveKit.leave)
 *   · the mini bar's hang-up                         (LiveProvider)
 *   · `end_live_room` / the room ending remotely     (LiveProvider watcher + RoomEvent.Disconnected)
 *   · joining a different room                       (useLiveKit.join discards the old session)
 *   · closing the tab                                (the `beforeunload` handler below)
 *
 * Same hand-rolled `useSyncExternalStore` shape as `liveStore.ts` / `buddyStore.ts` — no new deps.
 * Guests (`/live/guest/<token>`) never land here: that page is outside the `(app)` shell, so nothing
 * would keep their audio alive; `useLiveKit` keeps the old connect-on-mount / leave-on-unmount path.
 */
import * as React from "react";
import { ConnectionState, type Room } from "livekit-client";
import { leaveRoom, type TokenResponse } from "@/lib/live/client";
import { setActiveRoom } from "./liveStore";

export type LiveSessionState = "connected" | "reconnecting";

export type LiveSession = {
  /** `live_rooms.id` — a session is only ever kept for a member join, never for a guest link. */
  roomId: string;
  /** The live LiveKit room. Lives outside React; unmounting must never touch it. */
  room: Room;
  meta: TokenResponse;
  token: string;
  url: string;
  state: LiveSessionState;
};

let session: LiveSession | null = null;
const listeners = new Set<() => void>();
/** The server never has a session; a stable snapshot keeps `useSyncExternalStore` happy. */
const SERVER_SNAPSHOT: LiveSession | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getLiveSession() {
  return session;
}

/** True while the underlying room is still usable (adoptable by a freshly mounted page). */
export function isSessionLive(s: LiveSession | null): s is LiveSession {
  return !!s && s.room.state !== ConnectionState.Disconnected;
}

/* ------------------------------------------------------------------ tab close */

function onBeforeUnload() {
  const s = session;
  if (!s) return;
  // Best effort, exactly as the room page did before: tell the server we left, then drop the media.
  void leaveRoom(s.roomId).catch(() => null);
  void s.room.disconnect().catch(() => null);
}

function bindUnload() {
  if (typeof window === "undefined") return;
  window.removeEventListener("beforeunload", onBeforeUnload);
  window.addEventListener("beforeunload", onBeforeUnload);
}

function unbindUnload() {
  if (typeof window === "undefined") return;
  window.removeEventListener("beforeunload", onBeforeUnload);
}

/* --------------------------------------------------------------- mutations */

/** Publish the connected room so it survives navigation. Replaces any previous session. */
export function setLiveSession(next: LiveSession) {
  session = next;
  bindUnload();
  emit();
}

export function patchLiveSession(patch: Partial<Pick<LiveSession, "state" | "meta">>) {
  if (!session) return;
  session = { ...session, ...patch };
  emit();
}

/**
 * Forget the session without touching the room — for when the room has already gone away
 * (host ended it, server closed the connection). Also clears the mini bar so it cannot lie.
 */
export function clearLiveSession() {
  if (!session) return;
  session = null;
  unbindUnload();
  emit();
  setActiveRoom(null);
}

/**
 * Explicit intent: really end this call.
 *
 * `notifyServer` runs the `leave_live_room` RPC — pass `false` where the caller has already run it
 * (the room page and the mini bar both do, exactly as they did before) so a leave is still recorded
 * once and only once.
 *
 * `keepListeners` leaves the room's listeners in place so `RoomEvent.Disconnected` still reaches
 * whoever is mounted — that is what makes the room page show "This room has ended" and lets an
 * in-flight recording save itself. Use it when the room ended on us; leave it off when the user
 * chose to leave, where the ended screen would only flash before we navigate away.
 */
export async function endLiveSession({ notifyServer = false, keepListeners = false }: { notifyServer?: boolean; keepListeners?: boolean } = {}) {
  const s = session;
  session = null;
  unbindUnload();
  emit();
  setActiveRoom(null);
  if (!s) return;
  if (notifyServer) await leaveRoom(s.roomId).catch(() => null);
  try {
    await s.room.localParticipant.setScreenShareEnabled(false);
  } catch {
    /* the track may already be gone */
  }
  if (!keepListeners) s.room.removeAllListeners();
  await s.room.disconnect().catch(() => null);
}

/** Subscribe to the session (LiveProvider uses it to own the global audio sink). */
export function useLiveSession() {
  return React.useSyncExternalStore(subscribe, () => session, () => SERVER_SNAPSHOT);
}
