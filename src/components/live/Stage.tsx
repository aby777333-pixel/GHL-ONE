"use client";
/**
 * Stage — the centre of the room (§200, §201). One button switches between
 * video grid, the shared screen, the whiteboard and a live document.
 * Confidential rooms (§158, §159) get a repeating watermark with the viewer's name.
 */
import * as React from "react";
import Link from "next/link";
import { Maximize2, Minimize2, MonitorUp, PencilRuler, FileText, LayoutGrid, ExternalLink, Camera, MousePointer2 } from "lucide-react";
import { Track } from "livekit-client";
import { Button, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { StageMode } from "@/lib/live/types";
import type { PeerView } from "./useLiveKit";
import { AudioSink, VideoTile, useTrackElement } from "./VideoTile";
import { AnnotationLayer, AnnotationToolbar, type AnnotKind, type Pointer, type Stroke } from "./Annotations";

export const STAGE_MODES: { key: StageMode; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "video", label: "Video", icon: LayoutGrid },
  { key: "screen", label: "Screen", icon: MonitorUp },
  { key: "whiteboard", label: "Whiteboard", icon: PencilRuler },
  { key: "doc", label: "Document", icon: FileText },
];

function gridCols(n: number) {
  if (n <= 1) return "grid-cols-1";
  if (n <= 4) return "grid-cols-1 sm:grid-cols-2";
  if (n <= 9) return "grid-cols-2 lg:grid-cols-3";
  return "grid-cols-2 lg:grid-cols-4";
}

function Watermark({ text }: { text: string }) {
  return (
    <div
      className="absolute inset-0 pointer-events-none select-none overflow-hidden opacity-[0.11] mix-blend-difference"
      aria-hidden
      style={{ color: "var(--fg)" }}
    >
      <div className="absolute inset-[-30%] flex flex-wrap gap-x-16 gap-y-10 -rotate-[24deg] text-[11px] font-semibold whitespace-nowrap">
        {Array.from({ length: 90 }).map((_, i) => (
          <span key={i}>{text}</span>
        ))}
      </div>
    </div>
  );
}

/** The shared screen, with the annotation overlay on top. */
function ScreenStage({
  sharer,
  strokes,
  pointers,
  annotating,
  tool,
  color,
  onStroke,
  onPointer,
}: {
  sharer: PeerView;
  strokes: Stroke[];
  pointers: Pointer[];
  annotating: boolean;
  tool: AnnotKind;
  color: string;
  onStroke: (s: { id: string; kind: AnnotKind; pts: number[]; color: string; text?: string }) => void;
  onPointer: (x: number, y: number, on: boolean) => void;
}) {
  const ref = useTrackElement<HTMLVideoElement>(sharer.participant, Track.Source.ScreenShare);
  return (
    <div className="relative w-full h-full bg-black/90 rounded-[var(--radius)] overflow-hidden">
      {/* `data-live-share` lets "Create task from this screen" grab the current frame. */}
      <video ref={ref} data-live-share="1" autoPlay playsInline muted={sharer.isLocal} className="absolute inset-0 w-full h-full object-contain" />
      <AnnotationLayer strokes={strokes} pointers={pointers} active={annotating} tool={tool} color={color} onStroke={onStroke} onPointer={onPointer} />
      <span className="absolute top-2 left-2 pill tone-info text-[11px]">
        <MonitorUp size={11} /> {sharer.isLocal ? "You are sharing" : `${sharer.name} is sharing`}
      </span>
    </div>
  );
}

export type StageProps = {
  mode: StageMode;
  onMode: (m: StageMode) => void;
  peers: PeerView[];
  sharer: PeerView | null;
  hands: Set<string>;
  pinned: string | null;
  onPin: (identity: string | null) => void;
  onPeerMenu?: (identity: string) => void;
  confidentialFor?: string | null;
  /** Board / doc linked to this room (owned by other agents' pages — we link out). */
  boardId?: string | null;
  docId?: string | null;
  canWhiteboard?: boolean;
  /* annotations */
  strokes: Stroke[];
  pointers: Pointer[];
  annotating: boolean;
  onAnnotating: (on: boolean) => void;
  tool: AnnotKind;
  onTool: (t: AnnotKind) => void;
  color: string;
  onColor: (c: string) => void;
  onStroke: (s: { id: string; kind: AnnotKind; pts: number[]; color: string; text?: string }) => void;
  onPointer: (x: number, y: number, on: boolean) => void;
  onClearAnnotations: () => void;
  /** "Create task from this screen" (§26-28) — label depends on the room kind. */
  captureLabel?: string;
  onCapture?: () => void;
  /** Opens the Notes tab of the side panel — shared notes live there, not on the stage. */
  onOpenNotes?: () => void;
  className?: string;
};

export function Stage(props: StageProps) {
  const { mode, onMode, peers, sharer, hands, pinned, onPin, onPeerMenu, confidentialFor, boardId, docId, canWhiteboard } = props;
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [full, setFull] = React.useState(false);

  const toggleFull = async () => {
    try {
      if (!document.fullscreenElement) {
        await wrapRef.current?.requestFullscreen();
        setFull(true);
      } else {
        await document.exitFullscreen();
        setFull(false);
      }
    } catch {
      /* fullscreen can be blocked — ignore */
    }
  };
  React.useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const pinnedPeer = pinned ? peers.find((p) => p.identity === pinned) : null;
  const others = pinnedPeer ? peers.filter((p) => p.identity !== pinned) : peers;

  return (
    <div ref={wrapRef} className={cn("relative flex flex-col min-h-0 min-w-0 bg-[var(--bg)]", props.className)}>
      {/* mode switcher */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b overflow-x-auto no-scrollbar shrink-0">
        {STAGE_MODES.map((m) => {
          const disabled = (m.key === "screen" && !sharer) || (m.key === "whiteboard" && !canWhiteboard);
          return (
            <Button
              key={m.key}
              size="xs"
              variant={mode === m.key ? "secondary" : "ghost"}
              onClick={() => onMode(m.key)}
              disabled={disabled}
              title={disabled && m.key === "screen" ? "Nobody is sharing yet" : m.label}
            >
              <m.icon size={13} /> <span className="hidden sm:inline">{m.label}</span>
            </Button>
          );
        })}
        <div className="ml-auto flex items-center gap-1">
          {mode === "screen" && sharer && props.onCapture && (
            <Button size="xs" variant="ghost" onClick={props.onCapture} title="Turn what is on screen into work">
              <Camera size={13} /> <span className="hidden sm:inline">{props.captureLabel || "Create task from this screen"}</span>
            </Button>
          )}
          <Button size="xs" icon variant="ghost" onClick={toggleFull} aria-label={full ? "Exit fullscreen" : "Fullscreen"} title={full ? "Exit fullscreen" : "Fullscreen"}>
            {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </Button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 p-2">
        {mode === "screen" && sharer && (
          <div className="h-full flex flex-col gap-2 min-h-0">
            <div className="flex-1 min-h-0">
              <ScreenStage
                sharer={sharer}
                strokes={props.strokes}
                pointers={props.pointers}
                annotating={props.annotating}
                tool={props.tool}
                color={props.color}
                onStroke={props.onStroke}
                onPointer={props.onPointer}
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <AnnotationToolbar
                tool={props.tool}
                onTool={props.onTool}
                color={props.color}
                onColor={props.onColor}
                on={props.annotating}
                onToggle={() => props.onAnnotating(!props.annotating)}
                onClear={props.onClearAnnotations}
              />
              <span className="text-[11px] text-muted inline-flex items-center gap-1">
                <MousePointer2 size={11} /> Your pointer is visible to everyone while you are over the screen.
              </span>
            </div>
          </div>
        )}

        {mode === "video" && (
          <div className="h-full flex flex-col gap-2 min-h-0">
            {pinnedPeer && (
              <div className="flex-1 min-h-0">
                <VideoTile peer={pinnedPeer} handRaised={hands.has(pinnedPeer.identity)} pinned onPin={() => onPin(null)} className="h-full" />
              </div>
            )}
            <div
              className={cn("grid gap-2 min-h-0", pinnedPeer ? "grid-flow-col auto-cols-[132px] overflow-x-auto no-scrollbar h-[92px] shrink-0" : cn("flex-1 content-start overflow-y-auto", gridCols(others.length)))}
            >
              {others.map((p) => (
                <VideoTile
                  key={p.identity}
                  peer={p}
                  compact={!!pinnedPeer}
                  handRaised={hands.has(p.identity)}
                  pinned={false}
                  onPin={() => onPin(p.identity)}
                  onMenu={onPeerMenu ? () => onPeerMenu(p.identity) : undefined}
                  className={pinnedPeer ? "" : "min-h-[132px]"}
                />
              ))}
            </div>
          </div>
        )}

        {mode === "whiteboard" && (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon={<PencilRuler size={20} />}
              title="GHL BOARD"
              hint={boardId ? "The whiteboard for this room opens in its own tab so you keep the call on screen." : "No board is linked to this room yet. Open GHL BOARD and pick “Use in this room”."}
              action={
                <Button variant="primary" size="sm" onClick={() => window.open(boardId ? `/boards/${boardId}` : "/boards", "_blank", "noopener")}>
                  <ExternalLink size={14} /> {boardId ? "Open the board" : "Open GHL BOARD"}
                </Button>
              }
            />
          </div>
        )}

        {mode === "doc" && (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon={<FileText size={20} />}
              title="Live document"
              hint={docId ? "The shared document opens in a new tab; the Notes tab here stays in sync with the room." : "No document is linked to this room. Use the Notes tab for shared notes."}
              action={
                docId ? (
                  <Link href={`/docs/${docId}`} target="_blank" className="btn btn-primary btn-sm">
                    <ExternalLink size={14} /> Open the document
                  </Link>
                ) : (
                  <Button size="sm" onClick={props.onOpenNotes}>Open shared notes</Button>
                )
              }
            />
          </div>
        )}

        {mode === "screen" && !sharer && (
          <div className="h-full flex items-center justify-center">
            <EmptyState icon={<MonitorUp size={20} />} title="Nobody is sharing" hint="Use Share screen in the control bar, or ask someone to share." />
          </div>
        )}

        {confidentialFor && <Watermark text={`${confidentialFor} · ${new Date().toLocaleString()}`} />}
      </div>

      <AudioSink peers={peers} />
    </div>
  );
}
