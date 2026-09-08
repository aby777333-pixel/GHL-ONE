"use client";
/** One participant tile: video (or avatar), name, mic/cam/share/quality indicators, pin + host menu. */
import * as React from "react";
import { Hand, MicOff, MonitorUp, Pin, PinOff, Volume2 } from "lucide-react";
import { Track, type Participant } from "livekit-client";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { PeerView } from "./useLiveKit";
import { QualityDot } from "./QualityBadge";

/** Attaches a LiveKit track to a <video>/<audio> element for as long as it is mounted. */
export function useTrackElement<T extends HTMLMediaElement>(participant: Participant, source: Track.Source) {
  const ref = React.useRef<T>(null);
  const publication = participant.getTrackPublication(source);
  const trackSid = publication?.trackSid;
  const muted = publication?.isMuted;
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const track = participant.getTrackPublication(source)?.track;
    if (!track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [participant, source, trackSid, muted]);
  return ref;
}

/** Remote audio has to live in the DOM for the browser to play it. */
export function AudioSink({ peers }: { peers: PeerView[] }) {
  return (
    <div className="hidden" aria-hidden>
      {peers
        .filter((p) => !p.isLocal)
        .map((p) => (
          <PeerAudio key={p.identity} peer={p} />
        ))}
    </div>
  );
}

function PeerAudio({ peer }: { peer: PeerView }) {
  const mic = useTrackElement<HTMLAudioElement>(peer.participant, Track.Source.Microphone);
  const share = useTrackElement<HTMLAudioElement>(peer.participant, Track.Source.ScreenShareAudio);
  return (
    <>
      <audio ref={mic} autoPlay playsInline />
      <audio ref={share} autoPlay playsInline />
    </>
  );
}

export function VideoTile({
  peer,
  handRaised,
  pinned,
  onPin,
  onMenu,
  compact,
  className,
}: {
  peer: PeerView;
  handRaised?: boolean;
  pinned?: boolean;
  onPin?: () => void;
  onMenu?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const videoRef = useTrackElement<HTMLVideoElement>(peer.participant, Track.Source.Camera);
  const hasVideo = peer.camOn;

  return (
    <div
      className={cn(
        "relative rounded-[var(--radius)] overflow-hidden sunken border min-w-0 group",
        peer.speaking ? "ring-2 ring-[var(--success)] border-[var(--success)]" : "border-[var(--line)]",
        className
      )}
      style={{ aspectRatio: compact ? "16 / 10" : undefined }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={peer.isLocal}
        // `contain` on the main tiles: the cell rarely matches the camera's 16:9, so `cover` silently
        // crops — heads lost off the top. Thumbnails in the pinned filmstrip keep `cover`, where
        // filling the small box matters more than seeing the whole frame.
        className={cn("absolute inset-0 w-full h-full bg-black/80", compact ? "object-cover" : "object-contain", !hasVideo && "hidden", peer.isLocal && "-scale-x-100")}
      />
      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Avatar name={peer.name} src={peer.avatar} size={compact ? 36 : 56} />
          {!compact && <span className="text-xs text-muted truncate max-w-[80%]">{peer.designation || ""}</span>}
        </div>
      )}

      {/* top row */}
      <div className="absolute top-1.5 left-1.5 right-1.5 flex items-start gap-1">
        {peer.guest && <span className="pill tone-warn text-[10px]">External Guest</span>}
        {(peer.role === "host" || peer.role === "cohost") && <span className="pill tone-info text-[10px]">{peer.role === "host" ? "Host" : "Co-host"}</span>}
        <div className="ml-auto flex items-center gap-1">
          {handRaised && (
            <span className="w-6 h-6 rounded-full tone-warn flex items-center justify-center" title="Hand raised">
              <Hand size={12} />
            </span>
          )}
          {onPin && (
            <button
              type="button"
              onClick={onPin}
              className="w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              aria-label={pinned ? "Unpin" : "Pin"}
              title={pinned ? "Unpin" : "Pin"}
            >
              {pinned ? <PinOff size={12} /> : <Pin size={12} />}
            </button>
          )}
          {onMenu && (
            <button
              type="button"
              onClick={onMenu}
              className="w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-[13px] leading-none"
              aria-label="Participant options"
            >
              ⋯
            </button>
          )}
        </div>
      </div>

      {/* bottom row */}
      <div className="absolute bottom-0 inset-x-0 px-2 py-1.5 flex items-center gap-1.5 bg-gradient-to-t from-black/65 to-transparent">
        <span className="text-[11px] font-medium text-white truncate">
          {peer.name}
          {peer.isLocal ? " (you)" : ""}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {peer.sharing && <MonitorUp size={12} className="text-white" />}
          {peer.micOn ? (
            peer.speaking && <Volume2 size={12} className="text-[var(--success)]" />
          ) : (
            <MicOff size={12} className="text-white/80" />
          )}
          <QualityDot level={peer.quality} />
        </span>
      </div>
    </div>
  );
}
