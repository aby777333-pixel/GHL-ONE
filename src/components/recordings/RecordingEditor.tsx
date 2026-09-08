"use client";

/**
 * Post-recording editor (§33): trim start / trim end, cut a middle section and blur a
 * sensitive rectangle. Everything is re-encoded in the browser by replaying the clip
 * through a <canvas> and recording `canvas.captureStream()` together with the original
 * audio, so no server and no extra dependency is involved.
 */

import * as React from "react";
import { Eraser, Play, Scissors, SkipForward, Square, Wand2 } from "lucide-react";
import { Button, Pill, Progress } from "@/components/ui";
import { fmtDuration } from "@/lib/live/types";
import { pickVideoMime } from "./useRecorder";

type Rect = { x: number; y: number; w: number; h: number }; // normalised 0..1

export function RecordingEditor({
  src,
  durationSec,
  onDone,
  onSkip,
  onBack,
}: {
  src: string;
  durationSec: number;
  onDone: (blob: Blob, mime: string, durationSec: number) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const total = Math.max(0.5, durationSec);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const rafRef = React.useRef(0);

  const [start, setStart] = React.useState(0);
  const [end, setEnd] = React.useState(total);
  const [cutFrom, setCutFrom] = React.useState<number | null>(null);
  const [cutTo, setCutTo] = React.useState<number | null>(null);
  const [blur, setBlur] = React.useState<Rect | null>(null);
  const [drawing, setDrawing] = React.useState<Rect | null>(null);
  const [blurMode, setBlurMode] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [step, setStep] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  const hasCut = cutFrom !== null && cutTo !== null && cutTo > cutFrom;
  const outDuration = Math.max(0.5, end - start - (hasCut ? Math.min(cutTo!, end) - Math.max(cutFrom!, start) : 0));

  React.useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  /* ------------------------------------------------------------- blur box */
  function pointerPos(e: React.PointerEvent) {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)) };
  }
  const dragStart = React.useRef<{ x: number; y: number } | null>(null);

  function onDown(e: React.PointerEvent) {
    if (!blurMode || busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointerPos(e);
    dragStart.current = p;
    setDrawing({ x: p.x, y: p.y, w: 0, h: 0 });
  }
  function onMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    const p = pointerPos(e);
    const a = dragStart.current;
    setDrawing({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) });
  }
  function onUp() {
    if (drawing && drawing.w > 0.02 && drawing.h > 0.02) setBlur(drawing);
    dragStart.current = null;
    setDrawing(null);
  }

  /* ----------------------------------------------------------- preview */
  function previewFrom(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(t, 0), total - 0.05);
    void v.play().catch(() => {});
  }

  /* -------------------------------------------------------- re-encoding */
  async function apply() {
    setErr(null);
    if (typeof MediaRecorder === "undefined") {
      setErr("This browser cannot re-encode video. Save the recording as it is.");
      return;
    }
    setBusy(true);
    setProgress(0);
    setStep("Preparing…");

    const v = document.createElement("video");
    v.src = src;
    v.playsInline = true;
    v.preload = "auto";
    let actx: AudioContext | null = null;
    let cleanupDone = false;
    const cleanup = () => {
      if (cleanupDone) return;
      cleanupDone = true;
      cancelAnimationFrame(rafRef.current);
      try {
        v.pause();
      } catch {
        /* noop */
      }
      v.src = "";
      actx?.close().catch(() => {});
    };

    try {
      await new Promise<void>((res, rej) => {
        v.onloadeddata = () => res();
        v.onerror = () => rej(new Error("Could not read the recording."));
        setTimeout(() => rej(new Error("The recording took too long to open.")), 15000);
      });

      const w = v.videoWidth || 1280;
      const h = v.videoHeight || 720;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is not available in this browser.");
      const canFilter = typeof ctx.filter === "string";

      const tracks: MediaStreamTrack[] = [];
      const canvasTrack = canvas.captureStream(30).getVideoTracks()[0];
      if (canvasTrack) tracks.push(canvasTrack);
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        actx = new AC();
        const dest = actx.createMediaStreamDestination();
        actx.createMediaElementSource(v).connect(dest); // not connected to speakers → silent re-encode
        const a = dest.stream.getAudioTracks()[0];
        if (a) tracks.push(a);
      } catch {
        /* video-only output is still better than failing */
      }

      const mime = pickVideoMime();
      const rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const finished = new Promise<Blob>((res) => {
        rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || mime || "video/webm" }));
      });

      setStep("Re-encoding — this plays through once in real time…");
      v.currentTime = start;
      await new Promise<void>((res) => {
        v.onseeked = () => res();
        setTimeout(res, 4000);
      });
      rec.start(1000);
      await v.play();

      const t0 = Date.now();
      let stopped = false;
      const finish = () => {
        if (stopped) return;
        stopped = true;
        cancelAnimationFrame(rafRef.current);
        try {
          v.pause();
        } catch {
          /* noop */
        }
        setTimeout(() => {
          try {
            if (rec.state !== "inactive") rec.stop();
          } catch {
            /* noop */
          }
        }, 150);
      };

      const draw = () => {
        rafRef.current = requestAnimationFrame(draw);
        const t = v.currentTime;
        if (hasCut && t >= cutFrom! && t < cutTo!) {
          v.currentTime = Math.min(cutTo!, end);
          return;
        }
        if (t >= end || v.ended) return finish();
        try {
          ctx.drawImage(v, 0, 0, w, h);
          if (blur) {
            const bx = blur.x * w, by = blur.y * h, bw = blur.w * w, bh = blur.h * h;
            ctx.save();
            ctx.beginPath();
            ctx.rect(bx, by, bw, bh);
            ctx.clip();
            if (canFilter) {
              ctx.filter = `blur(${Math.max(8, Math.round(Math.min(w, h) * 0.03))}px)`;
              ctx.drawImage(v, 0, 0, w, h);
              ctx.filter = "none";
            } else {
              // Pixelate fallback for browsers without canvas filters.
              const small = document.createElement("canvas");
              small.width = Math.max(2, Math.round(bw / 16));
              small.height = Math.max(2, Math.round(bh / 16));
              const sctx = small.getContext("2d");
              if (sctx) {
                sctx.drawImage(v, bx, by, bw, bh, 0, 0, small.width, small.height);
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(small, 0, 0, small.width, small.height, bx, by, bw, bh);
                ctx.imageSmoothingEnabled = true;
              }
            }
            ctx.restore();
          }
        } catch {
          /* skip a bad frame */
        }
        setProgress(Math.min(99, ((Date.now() - t0) / 1000 / outDuration) * 100));
      };
      draw();

      const blob = await finished;
      cleanup();
      setProgress(100);
      if (!blob.size) throw new Error("The re-encoded clip came out empty. Save the original instead.");
      onDone(blob, blob.type || "video/webm", Math.round(outDuration));
    } catch (e) {
      cleanup();
      setBusy(false);
      setErr(e instanceof Error ? e.message : "Editing failed. You can still save the original recording.");
    }
  }

  const pct = (t: number) => `${(Math.min(total, Math.max(0, t)) / total) * 100}%`;

  return (
    <div className="flex flex-col gap-[var(--s3)]">
      <div ref={wrapRef} className="relative rounded-[var(--radius)] overflow-hidden bg-black select-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <video ref={videoRef} src={src} controls={!blurMode} playsInline className="w-full max-h-[46vh] bg-black" />
        {(blur || drawing) && (
          <div
            className="absolute border-2 border-[var(--brand)] bg-[var(--brand)]/20 pointer-events-none"
            style={{
              left: `${(drawing || blur)!.x * 100}%`,
              top: `${(drawing || blur)!.y * 100}%`,
              width: `${(drawing || blur)!.w * 100}%`,
              height: `${(drawing || blur)!.h * 100}%`,
              backdropFilter: "blur(6px)",
            }}
          />
        )}
        {blurMode && !blur && !drawing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="pill tone-brand">Drag over the area to blur</span>
          </div>
        )}
      </div>

      {/* Timeline map: kept region in brand, removed regions dimmed */}
      <div className="relative h-8 rounded-full sunken overflow-hidden">
        <div className="absolute inset-y-0 bg-[var(--brand)]/35" style={{ left: pct(start), right: `${100 - (end / total) * 100}%` }} />
        {hasCut && <div className="absolute inset-y-0 bg-[var(--danger)]/35" style={{ left: pct(cutFrom!), right: `${100 - (cutTo! / total) * 100}%` }} />}
        <div className="absolute inset-0 flex items-center justify-between px-3 text-[11px] num text-2 pointer-events-none">
          <span>{fmtDuration(start)}</span>
          <span>{fmtDuration(end)}</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-[var(--s3)]">
        <label className="block">
          <span className="label">Trim start · {fmtDuration(start)}</span>
          <input type="range" min={0} max={total} step={0.1} value={start} disabled={busy} onChange={(e) => setStart(Math.min(Number(e.target.value), end - 0.5))} onMouseUp={() => previewFrom(start)} className="w-full accent-[var(--brand)]" />
        </label>
        <label className="block">
          <span className="label">Trim end · {fmtDuration(end)}</span>
          <input type="range" min={0} max={total} step={0.1} value={end} disabled={busy} onChange={(e) => setEnd(Math.max(Number(e.target.value), start + 0.5))} onMouseUp={() => previewFrom(Math.max(0, end - 3))} className="w-full accent-[var(--brand)]" />
        </label>
      </div>

      {hasCut && (
        <div className="grid sm:grid-cols-2 gap-[var(--s3)]">
          <label className="block">
            <span className="label">Cut from · {fmtDuration(cutFrom!)}</span>
            <input type="range" min={0} max={total} step={0.1} value={cutFrom!} disabled={busy} onChange={(e) => setCutFrom(Math.min(Number(e.target.value), (cutTo || total) - 0.3))} className="w-full accent-[var(--danger)]" />
          </label>
          <label className="block">
            <span className="label">Cut to · {fmtDuration(cutTo!)}</span>
            <input type="range" min={0} max={total} step={0.1} value={cutTo!} disabled={busy} onChange={(e) => setCutTo(Math.max(Number(e.target.value), (cutFrom || 0) + 0.3))} className="w-full accent-[var(--danger)]" />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => previewFrom(start)} disabled={busy}>
          <Play size={14} /> Preview
        </Button>
        {hasCut ? (
          <Button size="sm" variant="ghost" onClick={() => { setCutFrom(null); setCutTo(null); }} disabled={busy}>
            <Eraser size={14} /> Remove cut
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => { const a = start + (end - start) * 0.4; setCutFrom(a); setCutTo(Math.min(end - 0.3, a + Math.min(5, (end - start) * 0.2))); }} disabled={busy}>
            <Scissors size={14} /> Cut a section
          </Button>
        )}
        <Button size="sm" variant={blurMode ? "primary" : "ghost"} onClick={() => setBlurMode((b) => !b)} disabled={busy}>
          <Wand2 size={14} /> {blur ? "Blur area set" : "Blur an area"}
        </Button>
        {blur && (
          <Button size="sm" variant="ghost" onClick={() => { setBlur(null); setBlurMode(false); }} disabled={busy}>
            <Eraser size={14} /> Clear blur
          </Button>
        )}
        <Pill tone="tone-neutral" className="ml-auto">Result {fmtDuration(outDuration)}</Pill>
      </div>

      {err && <div className="text-sm text-danger">{err}</div>}

      {busy ? (
        <div className="card p-[var(--s3)] flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Square size={12} className="text-danger animate-pulse" />
            <span>{step}</span>
            <span className="ml-auto num text-muted">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
          <div className="text-xs text-muted">Keep this tab open — re-encoding plays the clip through once.</div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onBack}>Back</Button>
          <Button size="sm" variant="secondary" onClick={onSkip}>
            <SkipForward size={14} /> Skip editing
          </Button>
          <Button size="sm" variant="primary" onClick={apply} disabled={start === 0 && Math.abs(end - total) < 0.15 && !hasCut && !blur}>
            Apply edits
          </Button>
        </div>
      )}
    </div>
  );
}
