"use client";

import * as React from "react";
import { Mic, Pause, Play, Send, Square, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { fmtDuration, pickRecorderMime } from "./lib";

type Phase = "starting" | "recording" | "paused" | "preview" | "error";
const BARS = 28;

/**
 * Voice-note recorder. Records with MediaRecorder, shows a level meter while
 * recording, lets the user pause/resume, preview and then send or discard.
 */
export function VoiceRecorder({ onSend, onCancel, sending }: { onSend: (blob: Blob, mime: string, durationSec: number) => void; onCancel: () => void; sending?: boolean }) {
  const [phase, setPhase] = React.useState<Phase>("starting");
  const [error, setError] = React.useState<string | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const [levels, setLevels] = React.useState<number[]>(() => Array(BARS).fill(0.08));
  const [preview, setPreview] = React.useState<{ url: string; blob: Blob; mime: string } | null>(null);

  const recRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const ctxRef = React.useRef<AudioContext | null>(null);
  const rafRef = React.useRef<number>(0);
  const startedAtRef = React.useRef(0);
  const accumulatedRef = React.useRef(0);
  const phaseRef = React.useRef<Phase>("starting");

  React.useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  React.useEffect(() => {
    let cancelled = false;
    const mime = pickRecorderMime();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      queueMicrotask(() => {
        setError("Voice notes are not supported in this browser.");
        setPhase("error");
      });
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recRef.current = rec;
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          const type = rec.mimeType || mime || "audio/webm";
          const blob = new Blob(chunksRef.current, { type });
          const url = URL.createObjectURL(blob);
          setPreview({ url, blob, mime: type });
          setPhase("preview");
        };
        rec.start(250);
        startedAtRef.current = Date.now();
        accumulatedRef.current = 0;
        setPhase("recording");

        // Level meter
        try {
          const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new Ctx();
          ctxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          let last = 0;
          const tick = (ts: number) => {
            rafRef.current = requestAnimationFrame(tick);
            if (ts - last < 70) return;
            last = ts;
            if (phaseRef.current === "recording") {
              analyser.getByteTimeDomainData(data);
              let sum = 0;
              for (let i = 0; i < data.length; i++) {
                const v = (data[i]! - 128) / 128;
                sum += v * v;
              }
              const rms = Math.sqrt(sum / data.length);
              const level = Math.min(1, Math.max(0.08, rms * 3.2));
              setLevels((prev) => [...prev.slice(1), level]);
              setElapsed((accumulatedRef.current + (Date.now() - startedAtRef.current)) / 1000);
            }
          };
          rafRef.current = requestAnimationFrame(tick);
        } catch {
          // analyser is optional
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError("Microphone access was denied.");
        setPhase("error");
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      try {
        if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
      } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const pause = () => {
    const rec = recRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.pause();
    accumulatedRef.current += Date.now() - startedAtRef.current;
    setPhase("paused");
  };
  const resume = () => {
    const rec = recRef.current;
    if (!rec || rec.state !== "paused") return;
    rec.resume();
    startedAtRef.current = Date.now();
    setPhase("recording");
  };
  const stop = () => {
    const rec = recRef.current;
    if (!rec || rec.state === "inactive") return;
    if (rec.state === "recording") accumulatedRef.current += Date.now() - startedAtRef.current;
    setElapsed(accumulatedRef.current / 1000);
    rec.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    cancelAnimationFrame(rafRef.current);
  };
  const send = () => {
    if (!preview) return;
    onSend(preview.blob, preview.mime, Math.max(1, Math.round(elapsed)));
  };

  return (
    <div className="flex items-center gap-2 w-full min-w-0">
      {phase === "error" ? (
        <>
          <span className="text-sm text-danger flex-1 min-w-0 truncate">{error}</span>
          <Button size="sm" variant="ghost" onClick={onCancel}>Close</Button>
        </>
      ) : phase === "preview" && preview ? (
        <>
          <Button size="sm" variant="ghost" icon onClick={onCancel} aria-label="Discard" className="text-danger">
            <Trash2 size={16} />
          </Button>
          <audio src={preview.url} controls className="flex-1 min-w-0 h-9" />
          <span className="text-xs text-muted num hidden sm:inline">{fmtDuration(elapsed)}</span>
          <Button size="sm" variant="primary" onClick={send} loading={sending} aria-label="Send voice note">
            <Send size={14} /> <span className="hidden sm:inline">Send</span>
          </Button>
        </>
      ) : (
        <>
          <Button size="sm" variant="ghost" icon onClick={onCancel} aria-label="Cancel recording" className="text-danger">
            <Trash2 size={16} />
          </Button>
          <div className="flex-1 min-w-0 h-9 rounded-full sunken px-3 flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full shrink-0", phase === "recording" ? "bg-[var(--danger)] animate-pulse" : "bg-[var(--warn)]")} />
            <div className="flex-1 flex items-center gap-[2px] h-6 min-w-0 overflow-hidden" aria-hidden>
              {levels.map((l, i) => (
                <span key={i} className="flex-1 rounded-full bg-[var(--brand-2)] transition-[height] duration-75" style={{ height: `${Math.round(l * 100)}%`, opacity: 0.35 + l * 0.65 }} />
              ))}
            </div>
            <span className="text-xs num text-2 shrink-0">{phase === "starting" ? <Loader2 size={12} className="animate-spin" /> : fmtDuration(elapsed)}</span>
          </div>
          {phase === "recording" && (
            <Button size="sm" variant="secondary" icon onClick={pause} aria-label="Pause">
              <Pause size={15} />
            </Button>
          )}
          {phase === "paused" && (
            <Button size="sm" variant="secondary" icon onClick={resume} aria-label="Resume">
              <Play size={15} />
            </Button>
          )}
          <Button size="sm" variant="primary" icon onClick={stop} disabled={phase === "starting"} aria-label="Stop and preview">
            <Square size={14} />
          </Button>
        </>
      )}
      <span className="sr-only">
        <Mic size={12} />
      </span>
    </div>
  );
}
