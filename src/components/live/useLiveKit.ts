"use client";
/**
 * useLiveKit — the media engine behind GHL LIVE.
 *
 * Owns exactly one LiveKit `Room`: join (member or external guest), waiting-room polling,
 * mic/camera/screen publishing, device switching, background blur, connection quality,
 * low-bandwidth modes, reconnect handling and the typed data channel (`LiveDataMessage`).
 *
 * The room OUTLIVES this hook. For a member join the connected `Room` is published to
 * `liveSession.ts` (module scope), so navigating away from `/live/<id>` only detaches this
 * component's listeners — the call carries on and the floating mini bar tells the truth. A page
 * that mounts while a session for the same room exists ADOPTS it instead of joining again.
 * Guests (`guest: true`, or a `guestToken` join) keep the old behaviour: connect on mount,
 * disconnect on unmount, because nothing outside their page could keep their audio alive.
 *
 * Nothing in here touches Supabase — room state lives in `@/lib/live/client`.
 */
import * as React from "react";
import {
  ConnectionQuality,
  ConnectionState,
  type LocalVideoTrack,
  type Participant,
  type RemoteParticipant,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { fetchToken, type TokenResponse } from "@/lib/live/client";
import type { BandwidthMode, LiveDataMessage, QualityLevel } from "@/lib/live/types";
import { clearLiveSession, endLiveSession, getLiveSession, isSessionLive, patchLiveSession, setLiveSession, type LiveSession } from "./liveSession";

export type JoinState =
  | "idle"
  | "connecting"
  | "waiting"      // 202 — waiting room, host must admit
  | "connected"
  | "reconnecting"
  | "denied"       // 403 — no access
  | "ended"        // 410
  | "locked"       // 423 — guest link, room locked
  | "disabled"     // 503 — LiveKit not configured
  | "error";

export type PeerView = {
  identity: string;
  sid: string;
  name: string;
  isLocal: boolean;
  guest: boolean;
  avatar: string | null;
  designation: string | null;
  /** Role carried in LiveKit metadata at join time (host/cohost/presenter/participant). */
  role: string | null;
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  speaking: boolean;
  quality: QualityLevel;
  participant: Participant;
};

export type DeviceState = {
  mics: MediaDeviceInfo[];
  cams: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  activeMic?: string;
  activeCam?: string;
  activeSpeaker?: string;
};

/** LiveKit's numeric VideoQuality enum without importing the protocol package. */
type VQ = Parameters<RemoteTrackPublication["setVideoQuality"]>[0];
const Q_LOW = 0 as VQ;
const Q_HIGH = 2 as VQ;

function qualityOf(q: ConnectionQuality | undefined): QualityLevel {
  return q === ConnectionQuality.Excellent ? "excellent" : q === ConnectionQuality.Good ? "good" : "weak";
}

function metaOf(p: Participant): { guest?: boolean; avatar?: string | null; role?: string | null; designation?: string | null } {
  if (!p.metadata) return {};
  try {
    return JSON.parse(p.metadata) as Record<string, never>;
  } catch {
    return {};
  }
}

export function viewOf(p: Participant, isLocal: boolean): PeerView {
  const m = metaOf(p);
  return {
    identity: p.identity,
    sid: p.sid,
    name: (p.name || p.identity || "Guest").replace(/\s*\(Guest\)$/, ""),
    isLocal,
    guest: !!m.guest,
    avatar: m.avatar ?? null,
    designation: m.designation ?? null,
    role: m.role ?? null,
    micOn: p.isMicrophoneEnabled,
    camOn: p.isCameraEnabled,
    sharing: p.isScreenShareEnabled,
    speaking: p.isSpeaking,
    quality: qualityOf(p.connectionQuality),
    participant: p,
  };
}

export type UseLiveKitOptions = {
  /** Member join. */
  roomId?: string;
  /** External guest join (capability token from `live_guest_link`). */
  guestToken?: string;
  guestName?: string;
  /**
   * Guest mode (`/live/guest/<token>` — outside the app shell). Guests never persist their
   * connection across navigation: there is no `LiveProvider` there to hold their audio.
   */
  guest?: boolean;
  /** Wait for an explicit `join()` call instead of connecting on mount. */
  manual?: boolean;
  /** Start with the camera on. Mic and camera are OFF by default — never auto-enable. */
  startCam?: boolean;
  startMic?: boolean;
  onData?: (msg: LiveDataMessage, from?: RemoteParticipant) => void;
  onMeta?: (meta: TokenResponse) => void;
  /** Fired when the local participant is removed / the room is closed by the host. */
  onDisconnected?: () => void;
};

export function useLiveKit(opts: UseLiveKitOptions) {
  const { roomId, guestToken, guestName, guest, manual, startCam, startMic } = opts;

  /** Only a member join is kept alive across navigation (see the file header). */
  const persistable = !!roomId && !guestToken && !guest;

  const dataCb = React.useRef(opts.onData);
  const metaCb = React.useRef(opts.onMeta);
  const goneCb = React.useRef(opts.onDisconnected);
  React.useEffect(() => {
    dataCb.current = opts.onData;
    metaCb.current = opts.onMeta;
    goneCb.current = opts.onDisconnected;
  });

  const roomRef = React.useRef<Room | null>(null);
  const [room, setRoom] = React.useState<Room | null>(null);
  const [state, setState] = React.useState<JoinState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [meta, setMeta] = React.useState<TokenResponse | null>(null);
  const [tick, setTick] = React.useState(0);
  const [speakers, setSpeakers] = React.useState<string[]>([]);
  const [devices, setDevices] = React.useState<DeviceState>({ mics: [], cams: [], speakers: [] });
  const [bandwidth, setBandwidth] = React.useState<BandwidthMode>("normal");
  const [blurOn, setBlurOn] = React.useState(false);
  const [needsAudioUnlock, setNeedsAudioUnlock] = React.useState(false);

  const bump = React.useCallback(() => setTick((t) => t + 1), []);

  /* ---------------------------------------------------------------- devices */
  const refreshDevices = React.useCallback(async () => {
    try {
      const [mics, cams, spk] = await Promise.all([
        Room.getLocalDevices("audioinput").catch(() => [] as MediaDeviceInfo[]),
        Room.getLocalDevices("videoinput").catch(() => [] as MediaDeviceInfo[]),
        Room.getLocalDevices("audiooutput").catch(() => [] as MediaDeviceInfo[]),
      ]);
      const r = roomRef.current;
      setDevices({
        mics,
        cams,
        speakers: spk,
        activeMic: r?.getActiveDevice("audioinput"),
        activeCam: r?.getActiveDevice("videoinput"),
        activeSpeaker: r?.getActiveDevice("audiooutput"),
      });
    } catch {
      /* enumerateDevices can be blocked — degrade silently */
    }
  }, []);

  const switchDevice = React.useCallback(
    async (kind: MediaDeviceKind, deviceId: string) => {
      const r = roomRef.current;
      if (!r) return false;
      const ok = await r.switchActiveDevice(kind, deviceId).catch(() => false);
      await refreshDevices();
      return ok;
    },
    [refreshDevices]
  );

  /* ------------------------------------------------------------------ join */
  const joiningRef = React.useRef(false);
  const waitTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = React.useRef(true);
  /** Lets the waiting-room poller re-run `join` without referencing it before it exists. */
  const joinRef = React.useRef<() => void>(() => {});

  /**
   * Wire this component's listeners onto a room and hand back the exact undo. Unmounting detaches
   * (the room may be shared with `LiveProvider` and a later mount of this page) — it never
   * `removeAllListeners()`, which would silently unhook the recorder and the global audio bridge.
   */
  const attach = React.useCallback(
    (r: Room) => {
      const rerender = () => bump();
      const onDevices = () => void refreshDevices();
      const onPlayback = () => setNeedsAudioUnlock(!r.canPlaybackAudio);
      const onSpeakers = (list: Participant[]) => setSpeakers(list.map((p) => p.identity));
      const onReconnecting = () => {
        setState("reconnecting");
        patchLiveSession({ state: "reconnecting" });
      };
      const onReconnected = () => {
        setState("connected");
        patchLiveSession({ state: "connected" });
      };
      const onGone = () => {
        // The room really went away (host ended it, server closed it) — the session must not outlive it.
        if (getLiveSession()?.room === r) clearLiveSession();
        if (!aliveRef.current) return;
        setState("ended");
        goneCb.current?.();
      };
      const onData = (payload: Uint8Array, from?: RemoteParticipant) => {
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload)) as LiveDataMessage;
          dataCb.current?.(msg, from);
        } catch {
          /* ignore malformed frames */
        }
      };

      r.on(RoomEvent.ParticipantConnected, rerender)
        .on(RoomEvent.ParticipantDisconnected, rerender)
        .on(RoomEvent.TrackSubscribed, rerender)
        .on(RoomEvent.TrackUnsubscribed, rerender)
        .on(RoomEvent.TrackPublished, rerender)
        .on(RoomEvent.TrackUnpublished, rerender)
        .on(RoomEvent.LocalTrackPublished, rerender)
        .on(RoomEvent.LocalTrackUnpublished, rerender)
        .on(RoomEvent.TrackMuted, rerender)
        .on(RoomEvent.TrackUnmuted, rerender)
        .on(RoomEvent.ParticipantMetadataChanged, rerender)
        .on(RoomEvent.RecordingStatusChanged, rerender)
        .on(RoomEvent.ConnectionQualityChanged, rerender)
        .on(RoomEvent.MediaDevicesChanged, onDevices)
        .on(RoomEvent.ActiveDeviceChanged, onDevices)
        .on(RoomEvent.AudioPlaybackStatusChanged, onPlayback)
        .on(RoomEvent.ActiveSpeakersChanged, onSpeakers)
        .on(RoomEvent.Reconnecting, onReconnecting)
        .on(RoomEvent.Reconnected, onReconnected)
        .on(RoomEvent.Disconnected, onGone)
        .on(RoomEvent.DataReceived, onData);

      return () => {
        r.off(RoomEvent.ParticipantConnected, rerender)
          .off(RoomEvent.ParticipantDisconnected, rerender)
          .off(RoomEvent.TrackSubscribed, rerender)
          .off(RoomEvent.TrackUnsubscribed, rerender)
          .off(RoomEvent.TrackPublished, rerender)
          .off(RoomEvent.TrackUnpublished, rerender)
          .off(RoomEvent.LocalTrackPublished, rerender)
          .off(RoomEvent.LocalTrackUnpublished, rerender)
          .off(RoomEvent.TrackMuted, rerender)
          .off(RoomEvent.TrackUnmuted, rerender)
          .off(RoomEvent.ParticipantMetadataChanged, rerender)
          .off(RoomEvent.RecordingStatusChanged, rerender)
          .off(RoomEvent.ConnectionQualityChanged, rerender)
          .off(RoomEvent.MediaDevicesChanged, onDevices)
          .off(RoomEvent.ActiveDeviceChanged, onDevices)
          .off(RoomEvent.AudioPlaybackStatusChanged, onPlayback)
          .off(RoomEvent.ActiveSpeakersChanged, onSpeakers)
          .off(RoomEvent.Reconnecting, onReconnecting)
          .off(RoomEvent.Reconnected, onReconnected)
          .off(RoomEvent.Disconnected, onGone)
          .off(RoomEvent.DataReceived, onData);
      };
    },
    [bump, refreshDevices]
  );

  /** Undo for the listeners this component put on the current room. */
  const detachRef = React.useRef<(() => void) | null>(null);

  /**
   * Re-use a room that is already connected (the user came back to the page, or never really left).
   * No re-join, no second participant, no flicker.
   */
  const adopt = React.useCallback(
    (s: LiveSession) => {
      const r = s.room;
      if (r.state === ConnectionState.Disconnected) return false;
      detachRef.current?.();
      detachRef.current = attach(r);
      roomRef.current = r;
      setRoom(r);
      setMeta(s.meta);
      metaCb.current?.(s.meta);
      setState(r.state === ConnectionState.Reconnecting ? "reconnecting" : "connected");
      setError(null);
      setNeedsAudioUnlock(!r.canPlaybackAudio);
      setSpeakers(r.activeSpeakers.map((p) => p.identity));
      const camTrack = r.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
      setBlurOn(!!camTrack?.getProcessor());
      void refreshDevices();
      bump();
      return true;
    },
    [attach, bump, refreshDevices]
  );

  const join = React.useCallback(async () => {
    if (joiningRef.current || roomRef.current) return;
    if (!roomId && !guestToken) return;

    const open = getLiveSession();
    if (persistable && isSessionLive(open) && open.roomId === roomId) {
      // Already connected to this very room (mini bar → Return, or a re-render race): adopt it.
      if (adopt(open)) return;
    }
    if (open) {
      // Never two concurrent connections. Leaving a DIFFERENT room is recorded exactly as a leave;
      // a dead session for this same room is only swept up, since we are about to join it again.
      await endLiveSession({ notifyServer: open.roomId !== roomId });
      if (!aliveRef.current) return;
    }

    joiningRef.current = true;
    setState("connecting");
    setError(null);
    try {
      const body = guestToken ? { guestToken, name: guestName || "Guest" } : { roomId: roomId!, device: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : null };
      const t = await fetchToken(body as { roomId: string; device?: string });
      if (!aliveRef.current) return;
      setMeta(t);
      metaCb.current?.(t);

      const r = new Room({
        adaptiveStream: true,
        dynacast: true,
        stopLocalTrackOnUnpublish: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        publishDefaults: { simulcast: true, red: true, dtx: true },
      });
      detachRef.current?.();
      detachRef.current = attach(r);
      await r.connect(t.url, t.token);
      if (!aliveRef.current) {
        detachRef.current?.();
        detachRef.current = null;
        await r.disconnect().catch(() => null);
        return;
      }
      roomRef.current = r;
      setRoom(r);
      setState("connected");
      // From here the call belongs to the session, not to this page.
      if (persistable && roomId) setLiveSession({ roomId, room: r, meta: t, token: t.token, url: t.url, state: "connected" });
      setNeedsAudioUnlock(!r.canPlaybackAudio);
      void refreshDevices();
      if (t.canPublish !== false) {
        if (startMic) await r.localParticipant.setMicrophoneEnabled(true).catch(() => null);
        if (startCam) await r.localParticipant.setCameraEnabled(true).catch(() => null);
      }
      bump();
    } catch (e) {
      const err = e as Error & { status?: number; reason?: string; disabled?: boolean };
      if (!aliveRef.current) return;
      if (err.disabled || err.status === 503) setState("disabled");
      else if (err.status === 202 || err.reason === "waiting") {
        setState("waiting");
        waitTimer.current = setTimeout(() => {
          joiningRef.current = false;
          joinRef.current();
        }, 4000);
      } else if (err.status === 410 || err.reason === "ended") setState("ended");
      else if (err.status === 423) setState("locked");
      else if (err.status === 403 || err.reason === "no_access") setState("denied");
      else setState("error");
      setError(err.message || "Could not join the room");
      if (err.status !== 202 && err.reason !== "waiting") joiningRef.current = false;
      return;
    }
    joiningRef.current = false;
  }, [roomId, guestToken, guestName, startCam, startMic, persistable, adopt, attach, bump, refreshDevices]);

  /**
   * Explicit intent: end the call. This is the ONLY path (besides the session's own `beforeunload`
   * and a room that ended remotely) that disconnects — unmounting no longer does.
   * Callers that already ran `leave_live_room` keep owning that RPC, so it still fires once.
   */
  const leave = React.useCallback(async () => {
    const r = roomRef.current;
    roomRef.current = null;
    setRoom(null);
    detachRef.current?.();
    detachRef.current = null;
    if (getLiveSession()?.room === r) {
      await endLiveSession();
      return;
    }
    if (!r) return;
    try {
      await r.localParticipant.setScreenShareEnabled(false);
    } catch {
      /* ignore */
    }
    r.removeAllListeners();
    await r.disconnect().catch(() => null);
  }, []);

  React.useEffect(() => {
    joinRef.current = () => void join();
  }, [join]);

  React.useEffect(() => {
    aliveRef.current = true;
    // Deferred so the very first render is not followed by a synchronous state cascade.
    const kick = setTimeout(() => {
      // Coming back to a call that never stopped: adopt it, do not join again.
      const open = getLiveSession();
      if (persistable && isSessionLive(open) && open.roomId === roomId && adopt(open)) return;
      if (!manual) void join();
    }, 0);
    return () => {
      if (kick) clearTimeout(kick);
      aliveRef.current = false;
      if (waitTimer.current) clearTimeout(waitTimer.current);
      const r = roomRef.current;
      if (r && getLiveSession()?.room === r) {
        // The call carries on without this page: drop our listeners and local UI state only.
        detachRef.current?.();
        detachRef.current = null;
        roomRef.current = null;
        setRoom(null);
        return;
      }
      void leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, guestToken, manual, persistable]);

  /* ------------------------------------------------------------------ media */
  const localPub = room?.localParticipant;
  const micOn = !!localPub?.isMicrophoneEnabled;
  const camOn = !!localPub?.isCameraEnabled;
  const sharing = !!localPub?.isScreenShareEnabled;

  const setMic = React.useCallback(async (on: boolean) => {
    await roomRef.current?.localParticipant.setMicrophoneEnabled(on).catch(() => null);
    setTick((t) => t + 1);
  }, []);

  const setCam = React.useCallback(async (on: boolean) => {
    await roomRef.current?.localParticipant.setCameraEnabled(on).catch(() => null);
    setTick((t) => t + 1);
  }, []);

  const setShare = React.useCallback(async (on: boolean) => {
    const r = roomRef.current;
    if (!r) return;
    try {
      await r.localParticipant.setScreenShareEnabled(on, { audio: true });
    } catch {
      /* user cancelled the picker, or the browser refused */
    }
    setTick((t) => t + 1);
  }, []);

  /** Background blur. Unsupported browsers must degrade, never crash. */
  const toggleBlur = React.useCallback(async (on: boolean) => {
    const r = roomRef.current;
    const pub = r?.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (!track) {
      setBlurOn(false);
      return { ok: false, reason: "Turn your camera on first." };
    }
    try {
      if (!on) {
        await track.stopProcessor();
        setBlurOn(false);
        return { ok: true };
      }
      const mod = await import("@livekit/track-processors");
      if (typeof mod.supportsBackgroundProcessors === "function" && !mod.supportsBackgroundProcessors()) {
        return { ok: false, reason: "This browser cannot blur backgrounds." };
      }
      await track.setProcessor(mod.BackgroundBlur(12));
      setBlurOn(true);
      return { ok: true };
    } catch {
      setBlurOn(false);
      return { ok: false, reason: "Background blur is not available on this device." };
    }
  }, []);

  /* -------------------------------------------------------- data channel */
  const send = React.useCallback(async (msg: LiveDataMessage, reliable = true) => {
    const r = roomRef.current;
    if (!r || r.state !== ConnectionState.Connected) return;
    try {
      await r.localParticipant.publishData(Uint8Array.from(new TextEncoder().encode(JSON.stringify(msg))), { reliable });
    } catch {
      /* dropped frames are acceptable for ephemeral messages */
    }
  }, []);

  /* ------------------------------------------------------- low bandwidth */
  const applyBandwidth = React.useCallback((mode: BandwidthMode) => {
    setBandwidth(mode);
    const r = roomRef.current;
    if (!r) return;
    for (const p of r.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        const rp = pub as RemoteTrackPublication;
        if (typeof rp.setEnabled !== "function") continue;
        const isVideo = rp.kind === Track.Kind.Video;
        if (!isVideo) continue;
        if (mode === "audio_only") rp.setEnabled(false);
        else {
          rp.setEnabled(true);
          if (typeof rp.setVideoQuality === "function") rp.setVideoQuality(mode === "normal" ? Q_HIGH : Q_LOW);
        }
      }
    }
    if (mode === "audio_only" || mode === "saver") void r.localParticipant.setCameraEnabled(false).catch(() => null);
    setTick((t) => t + 1);
  }, []);

  /* -------------------------------------------------------------- derived */
  const peers = React.useMemo<PeerView[]>(() => {
    const r = room;
    if (!r) return [];
    const list: PeerView[] = [viewOf(r.localParticipant, true)];
    for (const p of r.remoteParticipants.values()) list.push(viewOf(p, false));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, tick, speakers]);

  const localQuality = qualityOf(room?.localParticipant.connectionQuality);

  /** The participant currently sharing their screen, if any. */
  const sharer = React.useMemo(() => peers.find((p) => p.sharing) ?? null, [peers]);

  const unlockAudio = React.useCallback(async () => {
    await roomRef.current?.startAudio().catch(() => null);
    setNeedsAudioUnlock(!roomRef.current?.canPlaybackAudio);
  }, []);

  return {
    room,
    roomRef,
    state,
    error,
    meta,
    peers,
    sharer,
    speakers,
    devices,
    micOn,
    camOn,
    sharing,
    blurOn,
    bandwidth,
    quality: localQuality,
    isRecordingRemote: !!room?.isRecording,
    needsAudioUnlock,
    join,
    leave,
    setMic,
    setCam,
    setShare,
    toggleBlur,
    switchDevice,
    refreshDevices,
    send,
    applyBandwidth,
    unlockAudio,
    retry: () => {
      joiningRef.current = false;
      joinRef.current();
    },
  };
}

export type LiveKitApi = ReturnType<typeof useLiveKit>;
