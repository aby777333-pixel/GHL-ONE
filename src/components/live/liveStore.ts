"use client";
/**
 * Global GHL LIVE store (same useSyncExternalStore pattern as buddyStore).
 * - collaborate menu (universal COLLABORATE button) with the entity context it was opened from
 * - the active room the user is connected to (kept alive across navigation by LiveProvider)
 * - minimized / picture-in-picture state
 * - incoming invites (ring / knock) surfaced by LiveProvider
 */
import * as React from "react";
import type { CollabContext, CollabAction, LiveInvite, StageMode } from "@/lib/live/types";

export type ActiveRoom = {
  id: string;
  title: string;
  kind: string;
  role: string;
  startedAt: number;
  mode: StageMode;
  sharing: boolean;
  recording: boolean;
  micOn: boolean;
  camOn: boolean;
  participants: number;
  quality: "excellent" | "good" | "weak";
};

export type LiveStoreState = {
  collaborateOpen: boolean;
  collaborateCtx: CollabContext | null;
  collaborateNonce: number;
  /** A preselected action (e.g. entity page pressed "Start huddle") — the menu can run it immediately. */
  collaborateAction: CollabAction | null;
  active: ActiveRoom | null;
  minimized: boolean;
  pip: boolean;
  invites: (LiveInvite & { from_name?: string; from_avatar?: string | null; room_title?: string })[];
  /** Set by LiveProvider once the LiveKit room object exists; components read it via useLiveRoomRef(). */
  roomRef: { current: unknown } | null;
};

const SERVER_STATE: LiveStoreState = { collaborateOpen: false, collaborateCtx: null, collaborateNonce: 0, collaborateAction: null, active: null, minimized: false, pip: false, invites: [], roomRef: null };
let state: LiveStoreState = { ...SERVER_STATE, invites: [] };
const listeners = new Set<() => void>();
function emit(next: Partial<LiveStoreState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function openCollaborate(ctx: CollabContext | null = null, action: CollabAction | null = null) {
  emit({ collaborateOpen: true, collaborateCtx: ctx, collaborateAction: action, collaborateNonce: state.collaborateNonce + 1 });
}
export function closeCollaborate() {
  emit({ collaborateOpen: false, collaborateAction: null });
}
export function setActiveRoom(active: ActiveRoom | null) {
  emit({ active, minimized: active ? state.minimized : false, pip: active ? state.pip : false });
}
export function patchActiveRoom(patch: Partial<ActiveRoom>) {
  if (!state.active) return;
  emit({ active: { ...state.active, ...patch } });
}
export function setMinimized(minimized: boolean) {
  emit({ minimized });
}
export function setPip(pip: boolean) {
  emit({ pip });
}
export function pushInvite(inv: LiveStoreState["invites"][number]) {
  if (state.invites.some((i) => i.id === inv.id)) return;
  emit({ invites: [...state.invites, inv] });
}
export function dismissInvite(id: string) {
  emit({ invites: state.invites.filter((i) => i.id !== id) });
}
export function setRoomRef(ref: { current: unknown } | null) {
  emit({ roomRef: ref });
}
export function getLiveState() {
  return state;
}

export function useLive() {
  const s = React.useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  return {
    ...s,
    openCollaborate,
    closeCollaborate,
    setActiveRoom,
    patchActiveRoom,
    setMinimized,
    setPip,
    pushInvite,
    dismissInvite,
    inRoom: !!s.active,
  };
}
