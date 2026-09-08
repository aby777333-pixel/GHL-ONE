"use client";
/**
 * Bottom control bar (§200). On phones only the essentials stay on the bar —
 * everything else collapses into a "More" sheet, and the bar clears the 56px bottom nav.
 */
import * as React from "react";
import {
  Bookmark, CheckSquare, CircleDot, Hand, Layers, LogOut, Mic, MicOff, MonitorUp, MoreHorizontal,
  PencilRuler, Phone, Settings2, Share2, ShieldAlert, Smile, Square, UserPlus, Video, VideoOff,
} from "lucide-react";
import { Button, Modal, Pill } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { QualityLevel } from "@/lib/live/types";
import { QualityBadge } from "./QualityBadge";

const REACTIONS = ["👍", "👏", "🎉", "❤️", "😂", "😮", "🤔", "🙌"];

export type ControlBarProps = {
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  recording: boolean;
  handUp: boolean;
  canPublish: boolean;
  canShare: boolean;
  canRecord: boolean;
  canWhiteboard: boolean;
  isHost: boolean;
  quality: QualityLevel;
  guest?: boolean;
  onMic: () => void;
  onCam: () => void;
  onShare: () => void;
  onWhiteboard: () => void;
  onRecord: () => void;
  onInvite: () => void;
  onTask: () => void;
  onHand: () => void;
  onReaction: (emoji: string) => void;
  onSettings: () => void;
  onBookmark: () => void;
  onBreakouts: () => void;
  onHostControls: () => void;
  onLeave: () => void;
  onEnd?: () => void;
  className?: string;
};

function Ctl({
  on,
  danger,
  label,
  icon,
  onClick,
  disabled,
  title,
}: {
  on?: boolean;
  danger?: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={label}
      aria-pressed={on}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 h-[52px] min-w-[54px] px-2 rounded-[var(--radius-sm)] text-[10px] font-medium transition-colors disabled:opacity-45",
        danger ? "tone-danger" : on ? "tone-info" : "text-2 hover:bg-[var(--neutral-bg)]"
      )}
    >
      {icon}
      <span className="leading-none">{label}</span>
    </button>
  );
}

export function ControlBar(props: ControlBarProps) {
  const [more, setMore] = React.useState(false);
  const [reactions, setReactions] = React.useState(false);

  const mic = (
    <Ctl
      key="mic"
      on={props.micOn}
      danger={!props.micOn}
      label={props.micOn ? "Mic on" : "Muted"}
      icon={props.micOn ? <Mic size={18} /> : <MicOff size={18} />}
      onClick={props.onMic}
      disabled={!props.canPublish}
      title={props.canPublish ? undefined : "Only presenters can speak in this room"}
    />
  );
  const cam = (
    <Ctl
      key="cam"
      on={props.camOn}
      label={props.camOn ? "Camera" : "No video"}
      icon={props.camOn ? <Video size={18} /> : <VideoOff size={18} />}
      onClick={props.onCam}
      disabled={!props.canPublish}
    />
  );
  const share = (
    <Ctl key="share" on={props.sharing} label={props.sharing ? "Sharing" : "Share"} icon={<MonitorUp size={18} />} onClick={props.onShare} disabled={!props.canShare} title={props.canShare ? undefined : "Screen sharing is off for this room"} />
  );
  const leave = (
    <Ctl key="leave" danger label="Leave" icon={<Phone size={18} className="rotate-[135deg]" />} onClick={props.onLeave} />
  );

  const secondary: React.ReactNode[] = [
    props.canWhiteboard && <Ctl key="wb" label="Whiteboard" icon={<PencilRuler size={18} />} onClick={props.onWhiteboard} />,
    props.canRecord && <Ctl key="rec" on={props.recording} danger={props.recording} label={props.recording ? "Recording" : "Record"} icon={props.recording ? <Square size={18} /> : <CircleDot size={18} />} onClick={props.onRecord} />,
    !props.guest && <Ctl key="inv" label="Invite" icon={<UserPlus size={18} />} onClick={props.onInvite} />,
    !props.guest && <Ctl key="task" label="Task" icon={<CheckSquare size={18} />} onClick={props.onTask} />,
    <Ctl key="hand" on={props.handUp} label={props.handUp ? "Hand up" : "Raise hand"} icon={<Hand size={18} />} onClick={props.onHand} />,
    <Ctl key="react" label="React" icon={<Smile size={18} />} onClick={() => setReactions((r) => !r)} />,
  ].filter(Boolean);

  const overflow: React.ReactNode[] = [
    <Ctl key="set" label="Settings" icon={<Settings2 size={18} />} onClick={() => { setMore(false); props.onSettings(); }} />,
    !props.guest && <Ctl key="bm" label="Bookmark" icon={<Bookmark size={18} />} onClick={() => { setMore(false); props.onBookmark(); }} />,
    props.isHost && <Ctl key="bo" label="Breakouts" icon={<Layers size={18} />} onClick={() => { setMore(false); props.onBreakouts(); }} />,
    props.isHost && <Ctl key="hc" label="Host tools" icon={<ShieldAlert size={18} />} onClick={() => { setMore(false); props.onHostControls(); }} />,
    !props.guest && <Ctl key="sh" label="Share link" icon={<Share2 size={18} />} onClick={() => { setMore(false); props.onInvite(); }} />,
  ].filter(Boolean);

  return (
    <div className={cn("relative shrink-0 border-t bg-[var(--bg-elev)] safe-b", props.className)}>
      {reactions && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 card p-1.5 flex gap-1 anim-pop z-20" style={{ boxShadow: "var(--shadow-lg)" }}>
          {REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              className="w-9 h-9 rounded-full text-lg hover:bg-[var(--neutral-bg)]"
              onClick={() => {
                props.onReaction(e);
                setReactions(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto no-scrollbar">
        <QualityBadge level={props.quality} className="hidden sm:inline-flex shrink-0" />
        {props.recording && <Pill tone="tone-danger" className="hidden sm:inline-flex shrink-0 gap-1"><span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> REC</Pill>}

        <div className="mx-auto flex items-center gap-1">
          {mic}
          {cam}
          {share}
          {/* everything else on ≥sm; on phones it lives in More */}
          <span className="hidden sm:flex items-center gap-1">{secondary}</span>
          <span className="hidden lg:flex items-center gap-1">{overflow}</span>
          <Ctl label="More" icon={<MoreHorizontal size={18} />} onClick={() => setMore(true)} />
          {leave}
        </div>

        {props.isHost && props.onEnd && (
          <Button variant="danger" size="sm" className="hidden lg:inline-flex shrink-0" onClick={props.onEnd}>
            <LogOut size={14} /> End for all
          </Button>
        )}
      </div>

      <Modal open={more} onClose={() => setMore(false)} title="More" width={420}>
        <div className="grid grid-cols-4 gap-2">
          <span className="sm:hidden contents">{secondary}</span>
          {overflow}
        </div>
        {props.isHost && props.onEnd && (
          <Button
            variant="danger"
            className="w-full mt-[var(--s3)]"
            onClick={() => {
              setMore(false);
              props.onEnd?.();
            }}
          >
            <LogOut size={15} /> End the meeting for everyone
          </Button>
        )}
      </Modal>
    </div>
  );
}
