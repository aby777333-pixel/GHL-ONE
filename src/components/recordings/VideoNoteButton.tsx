"use client";

/**
 * Video notes (§40–42) — a short camera + microphone message that is uploaded, transcribed and
 * either posted into a chat or sent to selected people — plus the reply composer used on the
 * player page (text / voice / video, optionally anchored to a moment in the video).
 */

import * as React from "react";
import { Mic, MessageSquare, Send, Square, Video } from "lucide-react";
import { Button, Modal, Tabs, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { RECORDING_BUCKET, fmtDuration, recordingPath } from "@/lib/live/types";
import { uploadFile } from "@/components/files/storage";
import { extForMime, useRecorder } from "./useRecorder";
import { ScreenRecorder } from "./ScreenRecorder";
import type { ShareValue } from "./RecordingShare";

/** Records a camera video note and shares it the same way as any other recording. */
export function VideoNoteButton({
  label = "Video note",
  variant = "ghost",
  size = "sm",
  context,
  className,
  onSent,
}: {
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "xs" | "sm" | "md";
  context?: Partial<ShareValue> & { roomId?: string | null };
  className?: string;
  onSent?: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)} title="Record a short video note">
        <Video size={14} /> {label}
      </Button>
      {open && (
        <ScreenRecorder
          open
          onClose={() => setOpen(false)}
          kind="video_note"
          modes={["camera"]}
          context={{ access: "selected", ...context }}
          onSaved={(id) => onSent?.(id)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ replies */

type ReplyTab = "text" | "voice" | "video";

export function ReplyComposer({ recordingId, atSec, onPosted }: { recordingId: string; atSec?: number | null; onPosted?: () => void }) {
  const { profile } = useSession();
  const { push } = useToast();
  const supabase = React.useMemo(() => createClient(), []);
  const [tab, setTab] = React.useState<ReplyTab>("text");
  const [body, setBody] = React.useState("");
  const [anchor, setAnchor] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const rec = useRecorder({ speakerName: profile.full_name });

  const anchorSec = anchor && typeof atSec === "number" ? Math.max(0, Math.round(atSec)) : null;

  async function postText() {
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("live_recording_replies").insert({ recording_id: recordingId, author_id: profile.id, kind: "text", body: body.trim(), at_sec: anchorSec });
    setBusy(false);
    if (error) return push(error.message, "danger");
    setBody("");
    push("Reply posted", "success");
    onPosted?.();
  }

  async function postMedia() {
    if (!rec.result) return;
    setBusy(true);
    const ext = extForMime(rec.result.mime);
    const path = recordingPath(profile.org_id ?? "", profile.id, ext);
    const file = new File([rec.result.blob], `reply.${ext}`, { type: rec.result.mime });
    const up = await uploadFile(supabase, { bucket: RECORDING_BUCKET, path, file });
    if (up.error) {
      setBusy(false);
      return push(up.error, "danger");
    }
    const text = rec.lines.map((l) => l.text).join(" ").trim();
    const { error } = await supabase.from("live_recording_replies").insert({
      recording_id: recordingId,
      author_id: profile.id,
      kind: tab === "voice" ? "voice" : "video",
      body: text || null,
      storage_path: path,
      at_sec: anchorSec,
    });
    setBusy(false);
    if (error) {
      await supabase.storage.from(RECORDING_BUCKET).remove([path]);
      return push(error.message, "danger");
    }
    rec.reset();
    push("Reply posted", "success");
    onPosted?.();
  }

  return (
    <div className="card p-[var(--s3)] flex flex-col gap-[var(--s2)]">
      <Tabs
        tabs={[
          { key: "text" as const, label: "Text" },
          { key: "voice" as const, label: "Voice" },
          { key: "video" as const, label: "Video" },
        ]}
        value={tab}
        onChange={(v) => {
          rec.reset();
          setTab(v);
        }}
      />

      {tab === "text" ? (
        <>
          <Textarea rows={2} placeholder="Reply to this recording…" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex items-center gap-2">
            <AnchorToggle atSec={atSec} anchor={anchor} setAnchor={setAnchor} />
            <Button size="sm" variant="primary" className="ml-auto" onClick={postText} loading={busy} disabled={!body.trim()}>
              <Send size={14} /> Reply
            </Button>
          </div>
        </>
      ) : rec.result ? (
        <>
          {tab === "voice" ? (
            <audio src={rec.result.url} controls className="w-full h-9" />
          ) : (
            <video src={rec.result.url} controls playsInline className="w-full max-h-56 rounded-[var(--radius)] bg-black" />
          )}
          <div className="flex items-center gap-2">
            <AnchorToggle atSec={atSec} anchor={anchor} setAnchor={setAnchor} />
            <Button size="sm" variant="ghost" onClick={rec.reset}>Redo</Button>
            <Button size="sm" variant="primary" onClick={postMedia} loading={busy}>
              <Send size={14} /> Post {tab} reply
            </Button>
          </div>
        </>
      ) : rec.live ? (
        <div className="flex items-center gap-2">
          <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", rec.phase === "recording" ? "bg-[var(--danger)] animate-pulse" : "bg-[var(--warn)]")} />
          <div className="flex-1 flex items-center gap-[2px] h-6 min-w-0 overflow-hidden" aria-hidden>
            {rec.levels.map((l, i) => (
              <span key={i} className="flex-1 rounded-full bg-[var(--brand-2)]" style={{ height: `${Math.round(l * 100)}%`, opacity: 0.35 + l * 0.65 }} />
            ))}
          </div>
          <span className="num text-xs shrink-0">{rec.phase === "countdown" ? rec.countdown : fmtDuration(rec.elapsed)}</span>
          <Button size="sm" variant="primary" icon onClick={rec.stop} aria-label="Stop">
            <Square size={13} />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void rec.start(tab === "voice" ? "voice" : "camera")}>
            {tab === "voice" ? <Mic size={14} /> : <Video size={14} />} Start {tab} reply
          </Button>
          {rec.error && <span className="text-xs text-danger min-w-0 truncate">{rec.error}</span>}
        </div>
      )}
    </div>
  );
}

function AnchorToggle({ atSec, anchor, setAnchor }: { atSec?: number | null; anchor: boolean; setAnchor: (v: boolean) => void }) {
  if (typeof atSec !== "number") return null;
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
      <input type="checkbox" className="accent-[var(--brand)]" checked={anchor} onChange={(e) => setAnchor(e.target.checked)} />
      <MessageSquare size={12} /> at {fmtDuration(atSec)}
    </label>
  );
}

/** Opens the reply composer in a drawer (used by the mobile player layout). */
export function ReplyDrawer({ open, onClose, recordingId, atSec }: { open: boolean; onClose: () => void; recordingId: string; atSec?: number | null }) {
  return (
    <Modal open={open} onClose={onClose} title="Reply" side width={460}>
      <ReplyComposer recordingId={recordingId} atSec={atSec} onPosted={onClose} />
    </Modal>
  );
}
