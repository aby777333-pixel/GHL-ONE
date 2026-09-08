"use client";

/**
 * GHL LIVE — recording engine (browser only, no extra dependencies).
 * MediaRecorder + getDisplayMedia/getUserMedia + <canvas> compositing + Web Speech API.
 * Everything here is capability-checked: an unsupported browser degrades, it never throws at import time.
 */

import * as React from "react";
import type { RecordingKind } from "@/lib/live/types";

/** What the browser captures. `voice` is used for audio-only replies / voice notes. */
export type CaptureMode = "screen" | "screen_voice" | "screen_cam" | "camera" | "voice";

export const CAPTURE_MODES: { mode: CaptureMode; label: string; hint: string }[] = [
  { mode: "screen", label: "Screen only", hint: "No microphone — silent walkthrough" },
  { mode: "screen_voice", label: "Screen + voice", hint: "Narrate what you are showing" },
  { mode: "screen_cam", label: "Screen + webcam", hint: "Your face in a bubble, bottom-left" },
  { mode: "camera", label: "Camera only", hint: "Talk to the team, no screen" },
];

export const MODE_KIND: Record<CaptureMode, RecordingKind> = {
  screen: "screen",
  screen_voice: "screen_voice",
  screen_cam: "screen_cam",
  camera: "camera",
  voice: "camera",
};

export type RecorderPhase = "idle" | "starting" | "countdown" | "recording" | "paused" | "stopped" | "error";
export type TranscriptLine = { t: number; text: string; speaker?: string | null };
export type RecorderResult = { blob: Blob; mime: string; durationSec: number; url: string };

const BARS = 28;
const FLOOR = 0.08;

/* ------------------------------------------------------------------ mime */

/** Best supported container/codec for video, with the required fallback chain. */
export function pickVideoMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const chain = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return chain.find((c) => {
    try {
      return MediaRecorder.isTypeSupported(c);
    } catch {
      return false;
    }
  }) || "";
}

export function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const chain = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return chain.find((c) => {
    try {
      return MediaRecorder.isTypeSupported(c);
    } catch {
      return false;
    }
  }) || "";
}

export function extForMime(mime: string) {
  const m = (mime || "").toLowerCase();
  if (m.includes("mp4")) return "mp4";
  if (m.includes("ogg")) return "ogg";
  return "webm";
}

/* --------------------------------------------------------- speech capture */

type SpeechAlternative = { transcript: string };
type SpeechResult = { isFinal: boolean; length: number; [index: number]: SpeechAlternative };
type SpeechEvent = { resultIndex: number; results: { length: number; [index: number]: SpeechResult } };
type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type RecognizerCtor = new () => Recognizer;

function recognizerCtor(): RecognizerCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const speechSupported = () => typeof window !== "undefined" && !!recognizerCtor();

/* ------------------------------------------------------------ video utils */

/** MediaRecorder blobs often report `Infinity`; seek to the end to force the real duration. */
export function videoDuration(src: Blob | string): Promise<number> {
  return new Promise((resolve) => {
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    const v = document.createElement("video");
    let done = false;
    const finish = (n: number) => {
      if (done) return;
      done = true;
      if (typeof src !== "string") URL.revokeObjectURL(url);
      resolve(Number.isFinite(n) && n > 0 ? n : 0);
    };
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      if (v.duration === Infinity || Number.isNaN(v.duration)) {
        v.currentTime = 1e101;
        v.ontimeupdate = () => {
          v.ontimeupdate = null;
          finish(v.duration);
        };
      } else finish(v.duration);
    };
    v.onerror = () => finish(0);
    v.src = url;
    setTimeout(() => finish(v.duration), 8000);
  });
}

/** JPEG thumbnail from a frame in the middle of the clip. */
export function captureThumbnail(blob: Blob, atSec?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    let done = false;
    const finish = (b: Blob | null) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(b);
    };
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => {
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      v.currentTime = Math.max(0.1, Math.min(atSec ?? d / 2, Math.max(0.1, d - 0.1)));
    };
    v.onseeked = () => {
      try {
        const w = v.videoWidth || 640;
        const h = v.videoHeight || 360;
        const scale = Math.min(1, 640 / Math.max(1, w));
        const c = document.createElement("canvas");
        c.width = Math.round(w * scale);
        c.height = Math.round(h * scale);
        const ctx = c.getContext("2d");
        if (!ctx) return finish(null);
        ctx.drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => finish(b), "image/jpeg", 0.72);
      } catch {
        finish(null);
      }
    };
    v.onerror = () => finish(null);
    v.src = url;
    setTimeout(() => finish(null), 10000);
  });
}

/* ------------------------------------------------------------------ hook */

export type UseRecorder = ReturnType<typeof useRecorder>;

export function useRecorder(opts: { lang?: string; speakerName?: string | null; countdownFrom?: number } = {}) {
  const { lang = "en-IN", speakerName = null, countdownFrom = 3 } = opts;

  const [phase, setPhase] = React.useState<RecorderPhase>("idle");
  const [mode, setMode] = React.useState<CaptureMode>("screen_voice");
  const [error, setError] = React.useState<string | null>(null);
  const [countdown, setCountdown] = React.useState(0);
  const [elapsed, setElapsed] = React.useState(0);
  const [levels, setLevels] = React.useState<number[]>(() => Array(BARS).fill(FLOOR));
  const [result, setResult] = React.useState<RecorderResult | null>(null);
  const [lines, setLines] = React.useState<TranscriptLine[]>([]);
  const [interim, setInterim] = React.useState("");
  const [hasMic, setHasMic] = React.useState(false);

  const recRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const tracksRef = React.useRef<MediaStreamTrack[]>([]);
  const streamsRef = React.useRef<MediaStream[]>([]);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const rafRef = React.useRef(0);
  const drawRafRef = React.useRef(0);
  const recogRef = React.useRef<Recognizer | null>(null);
  const recogOnRef = React.useRef(false);
  const videosRef = React.useRef<HTMLVideoElement[]>([]);
  const startedAtRef = React.useRef(0);
  const accRef = React.useRef(0);
  const phaseRef = React.useRef<RecorderPhase>("idle");
  const langRef = React.useRef(lang);
  const resultRef = React.useRef<RecorderResult | null>(null);

  React.useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  React.useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  React.useEffect(() => {
    resultRef.current = result;
  }, [result]);

  const teardown = React.useCallback((keepResult = true) => {
    cancelAnimationFrame(rafRef.current);
    cancelAnimationFrame(drawRafRef.current);
    try {
      if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    } catch {
      /* already stopped */
    }
    recRef.current = null;
    tracksRef.current.forEach((t) => {
      try {
        t.stop();
      } catch {
        /* noop */
      }
    });
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    tracksRef.current = [];
    streamsRef.current = [];
    videosRef.current.forEach((v) => {
      v.srcObject = null;
    });
    videosRef.current = [];
    recogOnRef.current = false;
    try {
      recogRef.current?.abort();
    } catch {
      /* noop */
    }
    recogRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    if (!keepResult && resultRef.current) {
      URL.revokeObjectURL(resultRef.current.url);
      resultRef.current = null;
    }
  }, []);

  React.useEffect(() => () => teardown(false), [teardown]);

  /* ------------------------------------------------------------ speech */
  const startSpeech = React.useCallback(() => {
    const Ctor = recognizerCtor();
    if (!Ctor) return;
    try {
      const r = new Ctor();
      r.lang = langRef.current;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        let live = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (!res) continue;
          const text = (res[0]?.transcript || "").trim();
          if (!text) continue;
          if (res.isFinal) {
            const at = (accRef.current + (phaseRef.current === "recording" ? Date.now() - startedAtRef.current : 0)) / 1000;
            setLines((prev) => [...prev, { t: Math.max(0, Math.round(at * 10) / 10), text, speaker: speakerName }]);
          } else live = text;
        }
        setInterim(live);
      };
      r.onerror = () => {};
      r.onend = () => {
        if (!recogOnRef.current) return;
        try {
          r.start();
        } catch {
          /* Chrome throws if restarted too fast; the next tick recovers */
        }
      };
      recogRef.current = r;
      recogOnRef.current = true;
      r.start();
    } catch {
      recogOnRef.current = false;
    }
  }, [speakerName]);

  const stopSpeech = React.useCallback(() => {
    recogOnRef.current = false;
    setInterim("");
    try {
      recogRef.current?.stop();
    } catch {
      /* noop */
    }
  }, []);

  /* ------------------------------------------------------------- meter */
  const attachMeter = React.useCallback((ctx: AudioContext, stream: MediaStream) => {
    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let last = 0;
      const tick = (ts: number) => {
        rafRef.current = requestAnimationFrame(tick);
        if (ts - last < 70) return;
        last = ts;
        if (phaseRef.current !== "recording") return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i]! - 128) / 128;
          sum += v * v;
        }
        const level = Math.min(1, Math.max(FLOOR, Math.sqrt(sum / data.length) * 3.2));
        setLevels((prev) => [...prev.slice(1), level]);
        setElapsed((accRef.current + (Date.now() - startedAtRef.current)) / 1000);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      /* meter is decorative */
    }
  }, []);

  /** Timer for silent modes (no mic → no analyser loop). */
  const attachTimer = React.useCallback(() => {
    let last = 0;
    const tick = (ts: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (ts - last < 200) return;
      last = ts;
      if (phaseRef.current === "recording") setElapsed((accRef.current + (Date.now() - startedAtRef.current)) / 1000);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  /* -------------------------------------------------------------- start */
  const stopRef = React.useRef<() => void>(() => {});

  const begin = React.useCallback(
    async (m: CaptureMode) => {
      if (typeof MediaRecorder === "undefined") {
        setError("Recording is not supported in this browser.");
        setPhase("error");
        return;
      }
      setError(null);
      setLines([]);
      setInterim("");
      setLevels(Array(BARS).fill(FLOOR));
      setElapsed(0);
      setResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
      setMode(m);
      setPhase("starting");

      const wantsScreen = m === "screen" || m === "screen_voice" || m === "screen_cam";
      const wantsMic = m !== "screen";
      const wantsCam = m === "screen_cam" || m === "camera";
      let display: MediaStream | null = null;
      let mic: MediaStream | null = null;
      let cam: MediaStream | null = null;

      try {
        if (wantsScreen) {
          if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Screen capture is not available in this browser.");
          display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
          streamsRef.current.push(display);
        }
        if (wantsMic) {
          mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
          streamsRef.current.push(mic);
        }
        if (wantsCam) {
          cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" } });
          streamsRef.current.push(cam);
        }
      } catch (e) {
        teardown();
        const msg = e instanceof Error && e.message ? e.message : "";
        setError(/denied|NotAllowed/i.test(msg) || !msg ? "Permission was not granted, so nothing was recorded." : msg);
        setPhase("error");
        return;
      }

      setHasMic(!!mic);

      // Audio: mix microphone + shared tab/system audio into one track.
      let audioTrack: MediaStreamTrack | null = null;
      let ctx: AudioContext | null = null;
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const sources = [mic, display].filter((s): s is MediaStream => !!s && s.getAudioTracks().length > 0);
        if (sources.length) {
          ctx = new AC();
          audioCtxRef.current = ctx;
          const dest = ctx.createMediaStreamDestination();
          sources.forEach((s) => ctx!.createMediaStreamSource(s).connect(dest));
          audioTrack = dest.stream.getAudioTracks()[0] || null;
        }
      } catch {
        audioTrack = mic?.getAudioTracks()[0] || display?.getAudioTracks()[0] || null;
      }

      // Video: raw track, or a canvas composite for screen + circular webcam bubble.
      let videoTrack: MediaStreamTrack | null = null;
      if (m === "screen_cam" && display && cam) {
        const screenEl = document.createElement("video");
        const camEl = document.createElement("video");
        for (const [el, s] of [[screenEl, display], [camEl, cam]] as [HTMLVideoElement, MediaStream][]) {
          el.srcObject = s;
          el.muted = true;
          el.playsInline = true;
          videosRef.current.push(el);
          await el.play().catch(() => {});
        }
        const w = screenEl.videoWidth || display.getVideoTracks()[0]?.getSettings().width || 1280;
        const h = screenEl.videoHeight || display.getVideoTracks()[0]?.getSettings().height || 720;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const cctx = canvas.getContext("2d");
        const draw = () => {
          drawRafRef.current = requestAnimationFrame(draw);
          if (!cctx) return;
          try {
            cctx.drawImage(screenEl, 0, 0, w, h);
            const r = Math.round(Math.min(w, h) * 0.13);
            const cx = r + Math.round(w * 0.02);
            const cy = h - r - Math.round(h * 0.03);
            const cw = camEl.videoWidth || 640;
            const ch = camEl.videoHeight || 480;
            const side = Math.min(cw, ch);
            cctx.save();
            cctx.beginPath();
            cctx.arc(cx, cy, r, 0, Math.PI * 2);
            cctx.clip();
            cctx.drawImage(camEl, (cw - side) / 2, (ch - side) / 2, side, side, cx - r, cy - r, r * 2, r * 2);
            cctx.restore();
            cctx.beginPath();
            cctx.arc(cx, cy, r, 0, Math.PI * 2);
            cctx.lineWidth = Math.max(2, r * 0.045);
            cctx.strokeStyle = "rgba(255,255,255,0.9)";
            cctx.stroke();
          } catch {
            /* a frame can fail while a source is re-negotiating */
          }
        };
        draw();
        videoTrack = canvas.captureStream(30).getVideoTracks()[0] || null;
      } else if (m === "camera" && cam) {
        videoTrack = cam.getVideoTracks()[0] || null;
      } else if (display) {
        videoTrack = display.getVideoTracks()[0] || null;
      }

      const audioOnly = m === "voice" || !videoTrack;
      const out = new MediaStream();
      if (videoTrack && !audioOnly) out.addTrack(videoTrack);
      if (audioTrack) out.addTrack(audioTrack);
      if (!out.getTracks().length) {
        teardown();
        setError("Nothing to record — no audio or video track was available.");
        setPhase("error");
        return;
      }
      tracksRef.current = [videoTrack, audioTrack].filter((t): t is MediaStreamTrack => !!t);

      // The browser's own "Stop sharing" bar must end the recording too.
      const displayTrack = display?.getVideoTracks()[0];
      if (displayTrack) displayTrack.onended = () => stopRef.current();

      // 3 · 2 · 1 countdown before a single frame is captured.
      setPhase("countdown");
      for (let n = countdownFrom; n > 0; n--) {
        setCountdown(n);
        await new Promise((r) => setTimeout(r, 850));
        if (!streamsRef.current.length) return; // cancelled during the countdown
      }
      setCountdown(0);

      const mime = audioOnly ? pickAudioMime() : pickVideoMime();
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(out, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined);
      } catch {
        rec = new MediaRecorder(out);
      }
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || mime || (audioOnly ? "audio/webm" : "video/webm");
        const blob = new Blob(chunksRef.current, { type });
        const url = URL.createObjectURL(blob);
        const dur = Math.max(1, Math.round(accRef.current / 1000));
        setResult({ blob, mime: type, durationSec: dur, url });
        setElapsed(accRef.current / 1000);
        setPhase("stopped");
      };
      rec.start(1000);
      accRef.current = 0;
      startedAtRef.current = Date.now();
      setPhase("recording");
      if (mic && ctx) attachMeter(ctx, mic);
      else attachTimer();
      if (wantsMic) startSpeech();
    },
    [attachMeter, attachTimer, countdownFrom, startSpeech, teardown]
  );

  const stop = React.useCallback(() => {
    const rec = recRef.current;
    if (!rec || rec.state === "inactive") return;
    if (rec.state === "recording") accRef.current += Date.now() - startedAtRef.current;
    stopSpeech();
    cancelAnimationFrame(drawRafRef.current);
    try {
      rec.stop();
    } catch {
      /* noop */
    }
    tracksRef.current.forEach((t) => t.stop());
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
  }, [stopSpeech]);

  React.useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const pause = React.useCallback(() => {
    const rec = recRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.pause();
    accRef.current += Date.now() - startedAtRef.current;
    stopSpeech();
    setPhase("paused");
  }, [stopSpeech]);

  const resume = React.useCallback(() => {
    const rec = recRef.current;
    if (!rec || rec.state !== "paused") return;
    rec.resume();
    startedAtRef.current = Date.now();
    setPhase("recording");
    startSpeech();
  }, [startSpeech]);

  /** Throw the take away and start a fresh one in the same mode (still a user gesture). */
  const restart = React.useCallback(
    (m?: CaptureMode) => {
      teardown(false);
      chunksRef.current = [];
      setPhase("idle");
      setTimeout(() => void begin(m || mode), 60);
    },
    [begin, mode, teardown]
  );

  const reset = React.useCallback(() => {
    teardown(false);
    chunksRef.current = [];
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setLines([]);
    setInterim("");
    setElapsed(0);
    setError(null);
    setPhase("idle");
  }, [teardown]);

  const cancel = React.useCallback(() => {
    teardown(false);
    setPhase("idle");
  }, [teardown]);

  const live = phase === "recording" || phase === "paused" || phase === "countdown";

  return {
    phase, mode, error, countdown, elapsed, levels, result, lines, interim, hasMic, live,
    speechAvailable: speechSupported(),
    start: begin, stop, pause, resume, restart, reset, cancel,
    setLines,
  };
}
