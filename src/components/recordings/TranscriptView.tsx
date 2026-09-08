"use client";

/**
 * Transcript panel (§34, §84): searchable, click a sentence to jump to that moment,
 * and the line playing right now stays highlighted and in view.
 */

import * as React from "react";
import { Search, Type } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";
import { fmtDuration } from "@/lib/live/types";

export type Line = { t: number; text: string; speaker?: string | null };

/** Normalise whatever is stored in `transcript_segments` / `live_transcripts` into lines. */
export function toLines(value: unknown): Line[] {
  if (!Array.isArray(value)) return [];
  const out: Line[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text) continue;
    const t = typeof o.t === "number" ? o.t : typeof o.offset_ms === "number" ? o.offset_ms / 1000 : 0;
    out.push({ t: Math.max(0, t), text, speaker: typeof o.speaker === "string" ? o.speaker : typeof o.speaker_name === "string" ? o.speaker_name : null });
  }
  return out.sort((a, b) => a.t - b.t);
}

export function TranscriptView({
  lines,
  currentSec,
  onSeek,
  className,
  emptyHint,
}: {
  lines: Line[];
  currentSec: number;
  onSeek: (sec: number) => void;
  className?: string;
  emptyHint?: string;
}) {
  const [q, setQ] = React.useState("");
  const listRef = React.useRef<HTMLDivElement>(null);
  const activeRef = React.useRef<HTMLButtonElement>(null);
  const needle = q.trim().toLowerCase();

  const shown = React.useMemo(() => (needle ? lines.filter((l) => l.text.toLowerCase().includes(needle)) : lines), [lines, needle]);

  const activeIndex = React.useMemo(() => {
    let idx = -1;
    for (let i = 0; i < shown.length; i++) if (shown[i]!.t <= currentSec + 0.25) idx = i;
    return idx;
  }, [shown, currentSec]);

  React.useEffect(() => {
    if (needle) return;
    const el = activeRef.current;
    const box = listRef.current;
    if (!el || !box) return;
    const top = el.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 60) box.scrollTo({ top: top - box.clientHeight / 3, behavior: "smooth" });
  }, [activeIndex, needle]);

  if (!lines.length) {
    return (
      <div className={className}>
        <EmptyState icon={<Type size={18} />} title="No transcript" hint={emptyHint || "This recording has no transcript. Live transcription needs a browser that supports speech recognition."} />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col min-h-0", className)}>
      <div className="relative mb-2 shrink-0">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input className="input pl-9" placeholder="Search the transcript" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {needle && <div className="text-xs text-muted mb-1.5 shrink-0">{shown.length} match{shown.length === 1 ? "" : "es"}</div>}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto pr-1">
        {shown.map((l, i) => (
          <button
            key={`${l.t}-${i}`}
            ref={i === activeIndex ? activeRef : undefined}
            type="button"
            onClick={() => onSeek(l.t)}
            className={cn(
              "w-full text-left rounded-[var(--radius-sm)] px-2 py-1.5 flex gap-2 text-sm row-hover",
              i === activeIndex && !needle && "bg-[var(--brand)]/10"
            )}
          >
            <span className="num text-[11px] text-muted shrink-0 pt-0.5 w-11">{fmtDuration(l.t)}</span>
            <span className="min-w-0">
              {l.speaker && <span className="text-[11px] text-muted mr-1">{l.speaker}:</span>}
              {needle ? highlight(l.text, needle) : l.text}
            </span>
          </button>
        ))}
        {!shown.length && <div className="text-sm text-muted px-2 py-3">Nothing in the transcript matches “{q}”.</div>}
      </div>
    </div>
  );
}

function highlight(text: string, needle: string) {
  const i = text.toLowerCase().indexOf(needle);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-[var(--warn)]/35 text-[var(--fg)] rounded px-0.5">{text.slice(i, i + needle.length)}</mark>
      {text.slice(i + needle.length)}
    </>
  );
}
