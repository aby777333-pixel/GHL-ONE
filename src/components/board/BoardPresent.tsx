"use client";
/** Workshop timer (shared over the realtime channel) and presentation mode (frames = slides). */
import * as React from "react";
import { ChevronLeft, ChevronRight, Eye, Pause, Play, Presentation, Timer, X } from "lucide-react";
import { Button, Menu, MenuItem } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { BoardElement } from "@/lib/live/types";
import type { BoardTimer } from "./useBoardDoc";

function mmss(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function BoardTimerBar({ timer, setTimer, canEdit }: { timer: BoardTimer; setTimer: (endsAt: number | null, label: string | null) => void; canEdit: boolean }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!timer.endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer.endsAt]);

  const left = timer.endsAt ? timer.endsAt - now : 0;
  const over = !!timer.endsAt && left <= 0;

  if (!timer.endsAt) {
    if (!canEdit) return null;
    return (
      <Menu
        width={190}
        align="right"
        trigger={<Button size="sm" variant="ghost" icon title="Workshop timer" aria-label="Workshop timer"><Timer size={16} /></Button>}
      >
        {[1, 3, 5, 10, 15, 20, 30].map((m) => (
          <MenuItem key={m} icon={<Play size={13} />} onClick={() => setTimer(Date.now() + m * 60_000, `${m} min`)}>{m} minutes</MenuItem>
        ))}
      </Menu>
    );
  }

  return (
    <div className={cn("pill pill-lg", over ? "tone-danger" : left < 60_000 ? "tone-warn" : "tone-info")}>
      <Timer size={12} />
      <span className="num">{over ? "Time" : mmss(left)}</span>
      {canEdit && (
        <button type="button" aria-label="Stop the timer" className="ml-1 opacity-70 hover:opacity-100" onClick={() => setTimer(null, null)}>
          <Pause size={11} />
        </button>
      )}
    </div>
  );
}

export function PresentBar({
  frames, index, onIndex, onExit, following, onFollowing, isPresenter, onBringEveryone,
}: {
  frames: BoardElement[];
  index: number;
  onIndex: (i: number) => void;
  onExit: () => void;
  following: boolean;
  onFollowing: (v: boolean) => void;
  isPresenter: boolean;
  onBringEveryone: () => void;
}) {
  const frame = frames[index];
  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-3 z-30 card flex items-center gap-1.5 px-2 py-1.5" style={{ boxShadow: "var(--shadow-lg)" }}>
      <span className="pill tone-violet"><Presentation size={11} /> Presenting</span>
      <Button size="sm" variant="ghost" icon aria-label="Previous slide" disabled={index <= 0} onClick={() => onIndex(index - 1)}><ChevronLeft size={16} /></Button>
      <span className="text-xs num min-w-[72px] text-center truncate" title={frame?.title || ""}>
        {frames.length ? `${index + 1} / ${frames.length}` : "No frames"}
      </span>
      <Button size="sm" variant="ghost" icon aria-label="Next slide" disabled={index >= frames.length - 1} onClick={() => onIndex(index + 1)}><ChevronRight size={16} /></Button>
      <span className="w-px h-5 bg-[var(--line)]" />
      {isPresenter ? (
        <Button size="sm" variant="ghost" onClick={onBringEveryone} title="Move everyone to your view"><Eye size={14} /> Bring everyone</Button>
      ) : (
        <label className="text-xs text-muted inline-flex items-center gap-1.5 px-1">
          <input type="checkbox" checked={following} onChange={(e) => onFollowing(e.target.checked)} /> Follow presenter
        </label>
      )}
      <Button size="sm" variant="ghost" icon aria-label="Exit presentation" onClick={onExit}><X size={16} /></Button>
    </div>
  );
}
