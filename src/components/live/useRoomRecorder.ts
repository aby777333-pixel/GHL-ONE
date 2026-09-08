"use client";
/**
 * useRoomRecorder — real, client-side meeting recording for GHL LIVE rooms.
 *
 * Every participant is composited onto one 1280x720 canvas (a grid that reflows as people join and
 * leave, or a screen-dominant layout while somebody shares) and every audio source in the room —
 * remote microphones, screen-share audio and the local microphone — is mixed through a single
 * AudioContext. Both feed one MediaRecorder, so what comes out is a single file the browser can
 * play anywhere. It is then uploaded by `RoomRecording.tsx` exactly like a screen recording.
 *
 * This runs in the HOST's browser: the composite is only as good as the host's connection, and if
 * the host's tab dies the recording ends with it. The host-independent upgrade is LiveKit Egress
 * (a server-side composite recorder) — it needs S3 credentials this workspace does not have yet.
 * When they exist, swap the engine in here and keep the same
 * `{ recording, paused, durationSec, start, pause, resume, stop, error }` surface.
 *
 * Nothing in here touches Supabase.
 */
import * as React from "react";
import { RoomEvent, Track, type Participant, type Room } from "livekit-client";
import { pickVideoMime } from "@/components/recordings/useRecorder";
import type { PeerView } from "./useLiveKit";

export type RoomRecorderTake = { blob: Blob; mime: string; durationSec: number };

export type UseRoomRecorderOptions = {
  /** The live LiveKit room. Recording cannot start without it. */
  room: Room | null;
  /** Current participants — the composite reflows whenever this changes. */
  peers: PeerView[];
  width?: number;
  height?: number;
  fps?: number;
  /** Fired once per take, with the finished blob. Saving/uploading is the caller's job. */
  onComplete?: (take: RoomRecorderTake) => void | Promise<void>;
  /** Fired whenever recording ends — including when it ends by itself (room gone, tab closing). */
  onEnded?: () => void;
};

const DEFAULT_W = 1280;
const DEFAULT_H = 720;
const DEFAULT_FPS = 30;
const PAD = 12;
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/* Canvas cannot read CSS variables, so the composite carries its own small dark palette. */
const C_BG = "#0a0d12";
const C_TILE = "#151b24";
const C_LINE = "rgba(255,255,255,0.10)";
const C_SPEAK = "#22c55e";
const C_TEXT = "#ffffff";
const C_LABEL = "rgba(0,0,0,0.55)";
const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#d97706", "#dc2626", "#059669", "#db2777", "#4f46e5"];

/* ------------------------------------------------------------------ drawing helpers */

function path(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/** Letterbox: fit the source inside the box without ever stretching it. */
function contain(sw: number, sh: number, dw: number, dh: number) {
  if (!sw || !sh) return { x: 0, y: 0, w: dw, h: dh };
  const scale = Math.min(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}

function initialsOf(name: string) {
  const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return (first + last).toUpperCase();
}

function colorFor(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[n % AVATAR_COLORS.length] as string;
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number) {
  if (!text || maxW < 24) return;
  ctx.font = `500 ${size}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let label = text;
  while (label.length > 1 && ctx.measureText(label).width > maxW - 14) label = label.slice(0, -1);
  if (label !== text) label = `${label.slice(0, -1)}…`;
  const w = Math.min(maxW, ctx.measureText(label).width + 14);
  const h = size + 10;
  ctx.fillStyle = C_LABEL;
  path(ctx, x, y - h, w, h, 6);
  ctx.fill();
  ctx.fillStyle = C_TEXT;
  ctx.fillText(label, x + 7, y - h / 2);
}

/* ------------------------------------------------------------------ media helpers */

type VideoSlot = { el: HTMLVideoElement; sid: string };
type AudioSlot = { node: MediaStreamAudioSourceNode; stream: MediaStream };

function liveTrack(p: Participant, source: Track.Source, skipMuted: boolean) {
  const pub = p.getTrackPublication(source);
  const track = pub?.track;
  if (!pub || !track) return null;
  if (skipMuted && pub.isMuted) return null;
  const raw = track.mediaStreamTrack;
  if (!raw || raw.readyState !== "live") return null;
  return { raw, sid: pub.trackSid };
}

/** Lazily created maps: a `new Map()` handed straight to `useRef` counts as hook-owned state. */
function mapOf<K, V>(ref: { current: Map<K, V> | null }): Map<K, V> {
  if (!ref.current) ref.current = new Map<K, V>();
  return ref.current;
}

/** Off-screen host for the <video> elements the composite reads from (never `display:none`). */
function makeStage() {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.dataset.roomRecorder = "1";
  el.style.cssText = "position:fixed;left:-10000px;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none;";
  document.body.appendChild(el);
  return el;
}

/* ------------------------------------------------------------------------- hook */

export type UseRoomRecorder = ReturnType<typeof useRoomRecorder>;

export function useRoomRecorder(opts: UseRoomRecorderOptions) {
  const { room, peers, width = DEFAULT_W, height = DEFAULT_H, fps = DEFAULT_FPS } = opts;

  const [recording, setRecording] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [durationSec, setDurationSec] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const peersRef = React.useRef<PeerView[]>(peers);
  const roomRef = React.useRef<Room | null>(room);
  const completeRef = React.useRef(opts.onComplete);
  const endedRef = React.useRef(opts.onEnded);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const ctxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const videosRef = React.useRef<Map<string, VideoSlot> | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const destRef = React.useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioRef = React.useRef<Map<string, AudioSlot> | null>(null);
  const recRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const canvasStreamRef = React.useRef<MediaStream | null>(null);
  const rafRef = React.useRef(0);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDrawRef = React.useRef(0);
  const startedAtRef = React.useRef(0);
  const accRef = React.useRef(0);
  const activeRef = React.useRef(false);
  const pausedRef = React.useRef(false);
  const settleRef = React.useRef<((take: RoomRecorderTake | null) => void) | null>(null);

  React.useEffect(() => {
    completeRef.current = opts.onComplete;
    endedRef.current = opts.onEnded;
    roomRef.current = room;
  });

  /* --------------------------------------------------------------- sources */

  /** Attach/detach video elements and audio nodes so the mix always matches who is in the room. */
  const syncSources = React.useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const list = peersRef.current;
    const videos = mapOf(videosRef);

    // --- video (camera + screen share)
    const wanted = new Map<string, { raw: MediaStreamTrack; sid: string }>();
    for (const p of list) {
      const cam = liveTrack(p.participant, Track.Source.Camera, true);
      if (cam) wanted.set(`${p.identity}:cam`, cam);
      const share = liveTrack(p.participant, Track.Source.ScreenShare, true);
      if (share) wanted.set(`${p.identity}:screen`, share);
    }
    for (const [key, slot] of videos) {
      const next = wanted.get(key);
      if (next && next.sid === slot.sid) continue;
      slot.el.srcObject = null;
      slot.el.remove();
      videos.delete(key);
    }
    for (const [key, next] of wanted) {
      if (videos.has(key)) continue;
      const el = document.createElement("video");
      el.autoplay = true;
      el.muted = true;
      el.playsInline = true;
      el.srcObject = new MediaStream([next.raw]);
      stage.appendChild(el);
      void el.play().catch(() => null);
      videos.set(key, { el, sid: next.sid });
    }

    // --- audio (every remote mic + every screen-share audio + the local mic)
    const ctx = audioCtxRef.current;
    const dest = destRef.current;
    if (!ctx || !dest) return;
    const audio = mapOf(audioRef);
    const wantedAudio = new Map<string, MediaStreamTrack>();
    for (const p of list) {
      if (!p.isLocal) {
        const mic = liveTrack(p.participant, Track.Source.Microphone, false);
        if (mic) wantedAudio.set(mic.sid, mic.raw);
      }
      const shareAudio = liveTrack(p.participant, Track.Source.ScreenShareAudio, false);
      if (shareAudio) wantedAudio.set(shareAudio.sid, shareAudio.raw);
    }
    const localMic = roomRef.current ? liveTrack(roomRef.current.localParticipant, Track.Source.Microphone, false) : null;
    if (localMic) wantedAudio.set(localMic.sid, localMic.raw);

    for (const [sid, slot] of audio) {
      if (wantedAudio.has(sid)) continue;
      try {
        slot.node.disconnect();
      } catch {
        /* already gone */
      }
      audio.delete(sid);
    }
    for (const [sid, raw] of wantedAudio) {
      if (audio.has(sid)) continue;
      try {
        const stream = new MediaStream([raw]);
        const node = ctx.createMediaStreamSource(stream);
        node.connect(dest);
        audio.set(sid, { node, stream });
      } catch {
        /* a track can end between the check and the connect */
      }
    }
  }, []);

  /* ----------------------------------------------------------------- draw */

  const drawPeer = React.useCallback((ctx: CanvasRenderingContext2D, peer: PeerView, x: number, y: number, w: number, h: number) => {
    if (w < 8 || h < 8) return;
    ctx.save();
    path(ctx, x, y, w, h, 10);
    ctx.fillStyle = C_TILE;
    ctx.fill();
    ctx.clip();

    const el = mapOf(videosRef).get(`${peer.identity}:cam`)?.el;
    if (el && el.videoWidth > 0 && el.videoHeight > 0) {
      const box = contain(el.videoWidth, el.videoHeight, w, h);
      try {
        ctx.drawImage(el, x + box.x, y + box.y, box.w, box.h);
      } catch {
        /* a frame can fail while the track is re-negotiating */
      }
    } else {
      const r = Math.max(14, Math.min(w, h) * 0.22);
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = colorFor(peer.identity || peer.name);
      ctx.fill();
      ctx.fillStyle = C_TEXT;
      ctx.font = `600 ${Math.round(r * 0.8)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initialsOf(peer.name), x + w / 2, y + h / 2 + 1);
      ctx.textAlign = "left";
    }

    const size = Math.max(10, Math.min(16, Math.round(h * 0.075)));
    const name = `${peer.name}${peer.isLocal ? " (host)" : ""}${peer.micOn ? "" : " · muted"}`;
    drawLabel(ctx, name, x + 8, y + h - 8, w - 16, size);
    ctx.restore();

    path(ctx, x + 1, y + 1, w - 2, h - 2, 10);
    ctx.lineWidth = peer.speaking ? 3 : 1;
    ctx.strokeStyle = peer.speaking ? C_SPEAK : C_LINE;
    ctx.stroke();
  }, []);

  const drawFrame = React.useCallback(() => {
    const ctx = ctxRef.current;
    const cv = canvasRef.current;
    if (!ctx || !cv) return;
    const W = cv.width;
    const H = cv.height;
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, W, H);

    const list = peersRef.current;
    const sharer = list.find((p) => p.sharing) || null;
    const shareEl = sharer ? mapOf(videosRef).get(`${sharer.identity}:screen`)?.el : undefined;

    if (sharer && shareEl && shareEl.videoWidth > 0) {
      // Screen-dominant: the share fills the stage, everybody else becomes a strip on the right.
      const stripW = Math.round(W * 0.2);
      const mainW = W - stripW - PAD * 2;
      const mainH = H - PAD * 2;
      ctx.save();
      path(ctx, PAD, PAD, mainW, mainH, 10);
      ctx.fillStyle = "#000000";
      ctx.fill();
      ctx.clip();
      const box = contain(shareEl.videoWidth, shareEl.videoHeight, mainW, mainH);
      try {
        ctx.drawImage(shareEl, PAD + box.x, PAD + box.y, box.w, box.h);
      } catch {
        /* frame not ready */
      }
      drawLabel(ctx, `${sharer.name} is sharing`, PAD + 8, PAD + mainH - 8, mainW - 16, 15);
      ctx.restore();
      path(ctx, PAD, PAD, mainW, mainH, 10);
      ctx.lineWidth = 1;
      ctx.strokeStyle = C_LINE;
      ctx.stroke();

      const tileW = stripW - PAD;
      const tileH = Math.round((tileW * 9) / 16);
      const fits = Math.max(1, Math.floor((H - PAD) / (tileH + PAD)));
      list.slice(0, fits).forEach((p, i) => drawPeer(ctx, p, W - stripW, PAD + i * (tileH + PAD), tileW, tileH));
      if (list.length > fits) drawLabel(ctx, `+${list.length - fits} more`, W - stripW, H - PAD, tileW, 12);
      return;
    }

    // Grid: as square as possible, reflowing with the head count.
    const n = list.length;
    if (!n) {
      drawLabel(ctx, "Waiting for participants…", PAD, H / 2, W - PAD * 2, 18);
      return;
    }
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cellW = (W - PAD * (cols + 1)) / cols;
    const cellH = (H - PAD * (rows + 1)) / rows;
    list.forEach((p, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      // Centre the last, partly filled row.
      const inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
      const offset = ((cols - inRow) * (cellW + PAD)) / 2;
      drawPeer(ctx, p, PAD + offset + c * (cellW + PAD), PAD + r * (cellH + PAD), cellW, cellH);
    });
  }, [drawPeer]);

  /** rAF drives the composite; a timer keeps it limping along when the tab is in the background. */
  const tick = React.useCallback(() => {
    if (!activeRef.current) return;
    const now = performance.now();
    if (now - lastDrawRef.current < (1000 / fps) * 0.9) return;
    lastDrawRef.current = now;
    drawFrame();
    if (!pausedRef.current) setDurationSec((accRef.current + (Date.now() - startedAtRef.current)) / 1000);
  }, [drawFrame, fps]);

  const tickRef = React.useRef(tick);
  React.useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  /* -------------------------------------------------------------- teardown */

  const teardown = React.useCallback(() => {
    activeRef.current = false;
    pausedRef.current = false;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const audio = mapOf(audioRef);
    for (const [, slot] of audio) {
      try {
        slot.node.disconnect();
      } catch {
        /* noop */
      }
    }
    audio.clear();
    const videos = mapOf(videosRef);
    for (const [, slot] of videos) {
      slot.el.srcObject = null;
      slot.el.remove();
    }
    videos.clear();
    canvasStreamRef.current?.getTracks().forEach((t) => t.stop());
    canvasStreamRef.current = null;
    destRef.current = null;
    audioCtxRef.current?.close().catch(() => null);
    audioCtxRef.current = null;
    stageRef.current?.remove();
    stageRef.current = null;
    canvasRef.current = null;
    ctxRef.current = null;
    recRef.current = null;
  }, []);

  /* ----------------------------------------------------------------- stop */

  const stop = React.useCallback((): Promise<RoomRecorderTake | null> => {
    const rec = recRef.current;
    if (!rec || rec.state === "inactive" || !activeRef.current) {
      teardown();
      setRecording(false);
      setPaused(false);
      return Promise.resolve(null);
    }
    if (rec.state === "recording") accRef.current += Date.now() - startedAtRef.current;
    activeRef.current = false;
    return new Promise<RoomRecorderTake | null>((resolve) => {
      settleRef.current = resolve;
      try {
        rec.stop();
      } catch {
        settleRef.current = null;
        teardown();
        setRecording(false);
        setPaused(false);
        resolve(null);
      }
    });
  }, [teardown]);

  const stopRef = React.useRef(stop);
  React.useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  /* ---------------------------------------------------------------- start */

  /** Resolves to `null` when recording started, or to the reason it could not. */
  const start = React.useCallback(async (): Promise<string | null> => {
    if (activeRef.current) return null;
    setError(null);
    const fail = (msg: string) => {
      setError(msg);
      return msg;
    };
    if (!roomRef.current) return fail("You are not connected to the room yet.");
    if (typeof MediaRecorder === "undefined") return fail("This browser cannot record — try Chrome or Edge on a computer.");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx || typeof canvas.captureStream !== "function") return fail("This browser cannot record a meeting composite.");
    canvasRef.current = canvas;
    ctxRef.current = ctx;
    stageRef.current = makeStage();

    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const actx = new AC();
      audioCtxRef.current = actx;
      destRef.current = actx.createMediaStreamDestination();
      await actx.resume().catch(() => null);
    } catch {
      // A silent recording is still better than none.
      audioCtxRef.current = null;
      destRef.current = null;
    }

    syncSources();
    drawFrame();

    const canvasStream = canvas.captureStream(fps);
    canvasStreamRef.current = canvasStream;
    const out = new MediaStream();
    canvasStream.getVideoTracks().forEach((t) => out.addTrack(t));
    (destRef.current?.stream.getAudioTracks() || []).forEach((t) => out.addTrack(t));
    if (!out.getTracks().length) {
      teardown();
      return fail("Nothing to record — no video or audio track was available.");
    }

    const mime = pickVideoMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(out, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined);
    } catch {
      try {
        rec = new MediaRecorder(out);
      } catch {
        teardown();
        return fail("This browser refused to start the recorder.");
      }
    }
    recRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || mime || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      const take: RoomRecorderTake | null = blob.size > 0 ? { blob, mime: type, durationSec: Math.max(1, Math.round(accRef.current / 1000)) } : null;
      teardown();
      setRecording(false);
      setPaused(false);
      setDurationSec(accRef.current / 1000);
      const settle = settleRef.current;
      settleRef.current = null;
      settle?.(take);
      endedRef.current?.();
      if (take) void completeRef.current?.(take);
    };
    try {
      rec.start(1000);
    } catch {
      teardown();
      return fail("This browser refused to start the recorder.");
    }

    accRef.current = 0;
    startedAtRef.current = Date.now();
    lastDrawRef.current = 0;
    activeRef.current = true;
    pausedRef.current = false;
    setDurationSec(0);
    setPaused(false);
    setRecording(true);

    const loop = () => {
      if (!activeRef.current) return;
      rafRef.current = requestAnimationFrame(loop);
      tickRef.current();
    };
    rafRef.current = requestAnimationFrame(loop);
    timerRef.current = setInterval(() => tickRef.current(), Math.round(1000 / fps));
    return null;
  }, [drawFrame, fps, height, syncSources, teardown, width]);

  const pause = React.useCallback(() => {
    const rec = recRef.current;
    if (!rec || rec.state !== "recording") return;
    try {
      rec.pause();
    } catch {
      return;
    }
    accRef.current += Date.now() - startedAtRef.current;
    pausedRef.current = true;
    setPaused(true);
  }, []);

  const resume = React.useCallback(() => {
    const rec = recRef.current;
    if (!rec || rec.state !== "paused") return;
    try {
      rec.resume();
    } catch {
      return;
    }
    startedAtRef.current = Date.now();
    pausedRef.current = false;
    setPaused(false);
  }, []);

  /* --------------------------------------------------------- keep in sync */

  React.useEffect(() => {
    peersRef.current = peers;
    if (activeRef.current) syncSources();
  }, [peers, syncSources]);

  /** The room going away must save the take, never lose it. */
  React.useEffect(() => {
    if (!room) return;
    const onGone = () => {
      if (activeRef.current) void stopRef.current();
    };
    room.on(RoomEvent.Disconnected, onGone);
    return () => {
      room.off(RoomEvent.Disconnected, onGone);
    };
  }, [room]);

  /** Closing the tab: warn, and flush whatever the recorder is still holding. */
  React.useEffect(() => {
    if (!recording) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      void stopRef.current();
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    // `persisted` = the page is going into the back/forward cache (a phone switching apps) —
    // that must not end the meeting recording; a real unload must.
    const onHide = (e: PageTransitionEvent) => {
      if (!e.persisted && activeRef.current) void stopRef.current();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onHide);
    };
  }, [recording]);

  /** Unmount (the host navigated away): stop, and let `onComplete` save what exists. */
  React.useEffect(
    () => () => {
      if (activeRef.current) void stopRef.current();
      else teardown();
    },
    [teardown]
  );

  return { recording, paused, durationSec, start, pause, resume, stop, error };
}
