"use client";

import * as React from "react";
import { Download, FileText, Pause, Play, Loader2 } from "lucide-react";
import { bytes, cn } from "@/lib/utils";
import { fmtDuration, isAudio, isImage, isVideo } from "./lib";
import { useSignedUrl } from "./useSignedUrl";
import type { ChatAttachment } from "./types";

export function AttachmentView({ a, compact }: { a: ChatAttachment; compact?: boolean }) {
  if (isAudio(a.type)) return <VoicePlayer a={a} />;
  if (isImage(a.type)) return <ImageAttachment a={a} compact={compact} />;
  if (isVideo(a.type)) return <VideoAttachment a={a} />;
  return <FileChip a={a} />;
}

function ImageAttachment({ a, compact }: { a: ChatAttachment; compact?: boolean }) {
  const url = useSignedUrl(a.path);
  if (!url) return <div className={cn("skeleton rounded-[var(--radius-sm)]", compact ? "h-20 w-28" : "h-40 w-56 max-w-full")} />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block max-w-full" title={a.name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={a.name} className={cn("rounded-[var(--radius-sm)] border object-cover bg-[var(--bg-sunken)]", compact ? "max-h-20" : "max-h-[320px] max-w-full")} loading="lazy" />
    </a>
  );
}

function VideoAttachment({ a }: { a: ChatAttachment }) {
  const url = useSignedUrl(a.path);
  if (!url) return <div className="skeleton h-40 w-64 max-w-full rounded-[var(--radius-sm)]" />;
  return <video src={url} controls preload="metadata" className="rounded-[var(--radius-sm)] border max-h-[320px] max-w-full bg-black" />;
}

function FileChip({ a }: { a: ChatAttachment }) {
  const url = useSignedUrl(a.path);
  return (
    <a
      href={url || undefined}
      target="_blank"
      rel="noreferrer"
      download={a.name}
      className={cn("inline-flex items-center gap-2.5 max-w-full h-11 pl-2.5 pr-3 rounded-[var(--radius-sm)] border bg-[var(--bg-elev)] hover:border-[var(--line-strong)] transition-colors", !url && "pointer-events-none opacity-70")}
    >
      <span className="w-7 h-7 rounded-[6px] tone-info flex items-center justify-center shrink-0">
        <FileText size={15} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium truncate max-w-[200px]">{a.name}</span>
        <span className="block text-[11px] text-muted">{bytes(a.size) || a.type}</span>
      </span>
      {url ? <Download size={14} className="text-muted shrink-0" /> : <Loader2 size={14} className="animate-spin text-muted shrink-0" />}
    </a>
  );
}

const SPEEDS = [1, 1.5, 2] as const;

/** Voice-note player: play/pause, scrub bar, elapsed time and 1x/1.5x/2x speed. */
export function VoicePlayer({ a }: { a: ChatAttachment }) {
  const url = useSignedUrl(a.path);
  const ref = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [t, setT] = React.useState(0);
  const [dur, setDur] = React.useState(a.duration || 0);
  const [speed, setSpeed] = React.useState<(typeof SPEEDS)[number]>(1);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
    setSpeed(next);
    if (ref.current) ref.current.playbackRate = next;
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    el.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
  };
  const pct = dur ? Math.min(100, (t / dur) * 100) : 0;

  return (
    <div className="flex items-center gap-2.5 h-11 pl-1.5 pr-3 rounded-full border bg-[var(--bg-elev)] w-[min(100%,300px)]">
      <audio
        ref={ref}
        src={url || undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDur(d);
          e.currentTarget.playbackRate = speed;
        }}
      />
      <button type="button" onClick={toggle} disabled={!url} className="w-8 h-8 rounded-full bg-[var(--brand)] text-[var(--brand-fg)] flex items-center justify-center shrink-0 disabled:opacity-50" aria-label={playing ? "Pause" : "Play"}>
        {!url ? <Loader2 size={14} className="animate-spin" /> : playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded-full sunken overflow-hidden cursor-pointer" onClick={seek}>
          <div className="h-full rounded-full bg-[var(--brand-2)] transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[10px] text-muted num mt-1">
          {fmtDuration(t)} / {fmtDuration(dur)}
        </div>
      </div>
      <button type="button" onClick={cycleSpeed} className="pill tone-neutral num" aria-label="Playback speed">
        {speed}x
      </button>
    </div>
  );
}
