"use client";

/**
 * GHL LIVE global provider — mounted once in `AppShell`, next to `BuddyPanel`.
 *
 *  · subscribes to `live_invites` for the signed-in user (Supabase Realtime; the user's own token, as
 *    ActivityProvider does, otherwise RLS evaluates with the anon key and nothing arrives)
 *  · shows the incoming call / knock ringer — accept navigates to `/live/<room>`, decline calls `respondInvite`
 *  · keeps `useLive().active` in sync (an ended room clears it)
 *  · renders the floating mini call bar / picture-in-picture so a person can keep working while in a room
 *    ("You are in <room> · Return")
 *  · OWNS THE AUDIO of the persisted call (`liveSession`): remote voices need a mounted <audio>
 *    element, and the room page is gone once the user navigates away — so the sink lives here, and
 *    `Stage` only renders its own for guests (who have no provider). One sink, never two.
 */

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { DoorOpen, LogOut, Maximize2, Mic, MicOff, MonitorUp, Phone, PhoneOff, Radio, Video as VideoIcon } from "lucide-react";
import { Avatar, Button, Modal, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { leaveRoom, respondInvite } from "@/lib/live/client";
import { ROOM_KIND_LABEL, type LiveInvite, type RoomKind } from "@/lib/live/types";
import { cn } from "@/lib/utils";
import { RoomEvent, type Room } from "livekit-client";
import { dismissInvite, getLiveState, patchActiveRoom, pushInvite, setActiveRoom, setMinimized, useLive } from "./liveStore";
import { clearLiveSession, endLiveSession, getLiveSession, useLiveSession, type LiveSession } from "./liveSession";
import { viewOf, type PeerView } from "./useLiveKit";
import { AudioSink } from "./VideoTile";

/** Ring for 60s — the server marks the invite `missed` at 90s. */
const RING_MS = 60_000;

export function LiveProvider() {
  const { profile } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { invites, active, minimized } = useLive();
  const session = useLiveSession();

  /**
   * A full page reload really does lose the media connection. If anything survived into a fresh
   * load with no session behind it, clear it — a bar that says "you are in a room" must be true.
   */
  React.useEffect(() => {
    if (getLiveState().active && !getLiveSession()) setActiveRoom(null);
  }, []);

  /* ------------------------------------------------------------ incoming invites */
  React.useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const onInvite = async (row: LiveInvite) => {
      if (row.to_user !== profile.id || row.status !== "pending") return;
      const [{ data: from }, { data: room }] = await Promise.all([
        supabase.from("profiles").select("full_name,avatar_url").eq("id", row.from_user).maybeSingle(),
        supabase.from("live_rooms").select("title,kind,status").eq("id", row.room_id).maybeSingle(),
      ]);
      if (cancelled) return;
      if (room && room.status !== "live" && room.status !== "open") return;
      pushInvite({ ...row, from_name: from?.full_name || "Someone", from_avatar: from?.avatar_url || null, room_title: room?.title || "Live room" });
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {}
      window.setTimeout(() => dismissInvite(row.id), RING_MS);
    };

    const ch = supabase
      .channel(`live-invites-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_invites", filter: `to_user=eq.${profile.id}` }, (p) => void onInvite(p.new as unknown as LiveInvite))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_invites", filter: `to_user=eq.${profile.id}` }, (p) => {
        const row = p.new as unknown as LiveInvite;
        if (row.status !== "pending") dismissInvite(row.id);
      });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      ch.subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("[live-invites]", status, err?.message);
      });
    });

    /*
      Anything still pending when the page loads (a call placed while we were navigating) — and
      again whenever the tab comes back to the foreground. A ring that arrived while the tab was
      hidden used to be dismissed by its own `RING_MS` timer before the person ever looked at it,
      so returning to the tab showed nothing at all and the call read as "it never popped".
      Realtime also stops delivering to a backgrounded tab that the browser has frozen, so this
      catch-up is the only thing that closes that window.
    */
    const catchUp = () => {
      supabase
        .from("live_invites")
        .select("*")
        .eq("to_user", profile.id)
        .eq("status", "pending")
        .gt("created_at", new Date(Date.now() - RING_MS).toISOString())
        .then(({ data }) => {
          for (const row of (data || []) as unknown as LiveInvite[]) void onInvite(row);
        });
    };
    catchUp();
    const onVisible = () => {
      if (document.visibilityState === "visible") catchUp();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      supabase.removeChannel(ch);
    };
  }, [profile.id]);

  /* ------------------------------------------------------------ keep `active` honest */
  const activeId = active?.id;
  React.useEffect(() => {
    if (!activeId) return;
    const supabase = createClient();
    let cancelled = false;
    const ch = supabase
      .channel(`live-room-watch-${activeId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_rooms", filter: `id=eq.${activeId}` }, (p) => {
        const row = p.new as { status?: string };
        // `end_live_room` (or an archive) really ends the call — drop the media too, not just the bar.
        if (row.status === "ended" || row.status === "archived") {
          // `keepListeners` so the room page (if it is open) still hears Disconnected and shows
          // "This room has ended", and a recording still gets the chance to save itself.
          if (getLiveSession()?.roomId === activeId) void endLiveSession({ keepListeners: true });
          else setActiveRoom(null);
        }
      });
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      ch.subscribe();
    });
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [activeId]);

  const inThisRoom = !!active && pathname.startsWith(`/live/${active.id}`);
  React.useEffect(() => {
    if (inThisRoom && minimized) setMinimized(false);
  }, [inThisRoom, minimized]);

  const ringing = invites[0] || null;

  async function respond(id: string, roomId: string, status: "accepted" | "declined") {
    dismissInvite(id);
    try {
      await respondInvite(id, status);
    } catch {
      /* the ringer is best-effort — the room is what matters */
    }
    if (status === "accepted") router.push(`/live/${roomId}`);
  }

  async function hangUp() {
    if (!active) return;
    try {
      await leaveRoom(active.id);
    } catch {
      /* ignore */
    }
    // Explicit intent — this is one of the few places allowed to disconnect. `leave_live_room` has
    // already run just above, so the session must not run it again.
    await endLiveSession();
    setActiveRoom(null);
    toast.push("You left the room", "info");
  }

  return (
    <>
      {ringing && (
        <Modal open onClose={() => dismissInvite(ringing.id)} title={undefined} width={380}>
          <div className="flex flex-col items-center text-center py-2">
            <span className="relative">
              <Avatar name={ringing.from_name} src={ringing.from_avatar} size={72} />
              <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[var(--brand)] text-[var(--brand-fg)] flex items-center justify-center ring-2 ring-[var(--bg-elev)]">
                {ringing.kind === "knock" ? <DoorOpen size={14} /> : <Phone size={14} />}
              </span>
            </span>
            <div className="h3 mt-3">{ringing.from_name}</div>
            <div className="text-sm text-muted mt-0.5">
              {ringing.kind === "knock" ? "is knocking" : ringing.kind === "request_share" ? "wants to share their screen" : "is calling you"}
              {ringing.room_title ? ` · ${ringing.room_title}` : ""}
            </div>
            {ringing.message && <p className="text-sm mt-2 max-w-[280px]">“{ringing.message}”</p>}
            <div className="flex items-center gap-2 mt-5">
              <Button variant="danger" onClick={() => respond(ringing.id, ringing.room_id, "declined")}>
                <PhoneOff size={15} /> Decline
              </Button>
              <Button variant="success" onClick={() => respond(ringing.id, ringing.room_id, "accepted")}>
                <VideoIcon size={15} /> Join
              </Button>
            </div>
            {invites.length > 1 && <div className="text-[11px] text-muted mt-3">{invites.length - 1} more waiting</div>}
          </div>
        </Modal>
      )}

      {session && <SessionBridge session={session} />}

      {active && !inThisRoom && <MiniBar onReturn={() => router.push(`/live/${active.id}`)} onLeave={hangUp} />}
    </>
  );
}

/* ------------------------------------------------------------- persisted call */
/**
 * The persisted call's home in the React tree: the single remote-audio sink (so voices keep
 * playing while the user works elsewhere) plus the mic / camera / share / participant / quality
 * truth behind the mini bar. Mounted for as long as the session exists, on every page of the shell.
 */
function SessionBridge({ session }: { session: LiveSession }) {
  const room: Room = session.room;
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const onGone = () => clearLiveSession();
    room
      .on(RoomEvent.ParticipantConnected, bump)
      .on(RoomEvent.ParticipantDisconnected, bump)
      .on(RoomEvent.TrackSubscribed, bump)
      .on(RoomEvent.TrackUnsubscribed, bump)
      .on(RoomEvent.TrackPublished, bump)
      .on(RoomEvent.TrackUnpublished, bump)
      .on(RoomEvent.LocalTrackPublished, bump)
      .on(RoomEvent.LocalTrackUnpublished, bump)
      .on(RoomEvent.TrackMuted, bump)
      .on(RoomEvent.TrackUnmuted, bump)
      .on(RoomEvent.ParticipantMetadataChanged, bump)
      .on(RoomEvent.ConnectionQualityChanged, bump)
      .on(RoomEvent.ActiveSpeakersChanged, bump)
      .on(RoomEvent.Disconnected, onGone);
    return () => {
      room
        .off(RoomEvent.ParticipantConnected, bump)
        .off(RoomEvent.ParticipantDisconnected, bump)
        .off(RoomEvent.TrackSubscribed, bump)
        .off(RoomEvent.TrackUnsubscribed, bump)
        .off(RoomEvent.TrackPublished, bump)
        .off(RoomEvent.TrackUnpublished, bump)
        .off(RoomEvent.LocalTrackPublished, bump)
        .off(RoomEvent.LocalTrackUnpublished, bump)
        .off(RoomEvent.TrackMuted, bump)
        .off(RoomEvent.TrackUnmuted, bump)
        .off(RoomEvent.ParticipantMetadataChanged, bump)
        .off(RoomEvent.ConnectionQualityChanged, bump)
        .off(RoomEvent.ActiveSpeakersChanged, bump)
        .off(RoomEvent.Disconnected, onGone);
    };
  }, [room]);

  const peers = React.useMemo<PeerView[]>(() => {
    const list = [viewOf(room.localParticipant, true)];
    for (const p of room.remoteParticipants.values()) list.push(viewOf(p, false));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, tick]);

  const me = peers[0];
  React.useEffect(() => {
    if (!me) return;
    patchActiveRoom({ micOn: me.micOn, camOn: me.camOn, sharing: me.sharing, participants: peers.length, quality: me.quality });
  }, [me, peers.length]);

  return <AudioSink peers={peers} />;
}

/* ------------------------------------------------------------------ mini bar */
/**
 * Floating "you are still in a room" bar. Sits above the 56px mobile bottom nav and to the LEFT of the
 * Buddy FAB (which owns `right-4`), so the two never collide. z-[95] keeps it under modals (z-100+).
 */
function MiniBar({ onReturn, onLeave }: { onReturn: () => void; onLeave: () => void }) {
  const { active, pip, setPip } = useLive();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!active) return null;
  const secs = Math.max(0, Math.round((now - active.startedAt) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const kindLabel = ROOM_KIND_LABEL[active.kind as RoomKind] || "Room";

  return (
    <div
      className="fixed z-[95] left-3 right-[68px] lg:left-[calc(var(--sidebar-w)+16px)] lg:right-auto lg:w-[380px]"
      style={{ bottom: "calc(56px + 12px + env(safe-area-inset-bottom))" }}
      data-live-minibar
    >
      <div className="card px-2.5 py-2 flex items-center gap-2 min-w-0" style={{ boxShadow: "var(--shadow-lg)" }}>
        <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[var(--brand-fg)]" style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))" }}>
          <Radio size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium truncate">{active.title || kindLabel}</span>
          <span className="block text-[11px] text-muted truncate">
            <span className="num">{mm}:{ss}</span> · {active.participants || 1} in {kindLabel.toLowerCase()}
            {active.recording && <span className="text-danger"> · recording</span>}
            {active.sharing && <span className="text-warn"> · sharing</span>}
          </span>
        </span>
        <span className="hidden sm:flex items-center gap-1 shrink-0 text-muted">
          {active.micOn ? <Mic size={13} /> : <MicOff size={13} className="text-danger" />}
          {active.sharing && <MonitorUp size={13} className="text-warn" />}
        </span>
        <button
          type="button"
          onClick={() => setPip(!pip)}
          className={cn("btn btn-ghost btn-sm btn-icon hidden sm:inline-flex", pip && "bg-[var(--neutral-bg)]")}
          aria-label="Picture in picture"
          title="Picture in picture"
        >
          <Maximize2 size={14} />
        </button>
        <Button size="sm" variant="primary" onClick={onReturn}>
          Return
        </Button>
        <Button size="sm" variant="ghost" icon onClick={onLeave} aria-label="Leave the room" title="Leave">
          <LogOut size={15} className="text-danger" />
        </Button>
      </div>
    </div>
  );
}
