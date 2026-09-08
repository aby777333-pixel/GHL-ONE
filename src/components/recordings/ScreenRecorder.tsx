"use client";

/**
 * The recorder modal (§29–33, §37, §81–82, §177): consent → mode → 3·2·1 → capture →
 * review → optional edit → share settings → direct-to-storage upload.
 */

import * as React from "react";
import { AlertTriangle, Camera, Circle, Monitor, Pause, Play, RotateCcw, Send, ShieldCheck, Square, Video, Mic, Sparkles } from "lucide-react";
import { Button, Field, Input, Modal, Pill, Select, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { callAI } from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import { CAPTION_LANGS, fmtDuration, type RecordingChapter, type RecordingKind, type RecordingSummary } from "@/lib/live/types";
import { CAPTURE_MODES, MODE_KIND, useRecorder, type CaptureMode } from "./useRecorder";
import { RecordingEditor } from "./RecordingEditor";
import { RecordingShare, audienceLabel, defaultShare, expiryToIso, saveRecording, type ShareValue } from "./RecordingShare";

type Step = "setup" | "live" | "review" | "edit" | "share" | "saving";
type PostStep = Exclude<Step, "setup" | "live">;

const MODE_ICON: Record<CaptureMode, React.ReactNode> = {
  screen: <Monitor size={15} />,
  screen_voice: <Mic size={15} />,
  screen_cam: <Video size={15} />,
  camera: <Camera size={15} />,
  voice: <Mic size={15} />,
};

export function ScreenRecorder({
  open,
  onClose,
  kind = "screen",
  context,
  onSaved,
  titleHint,
  modes,
}: {
  open: boolean;
  onClose: () => void;
  kind?: RecordingKind;
  context?: Partial<ShareValue> & { roomId?: string | null };
  onSaved?: (id: string) => void;
  titleHint?: string;
  /** Restrict the capture choices (a video note is camera-only). */
  modes?: CaptureMode[];
}) {
  const choices = React.useMemo(() => (modes?.length ? CAPTURE_MODES.filter((m) => modes.includes(m.mode)) : CAPTURE_MODES), [modes]);
  const { profile, people } = useSession();
  const { push } = useToast();
  const supabase = React.useMemo(() => createClient(), []);
  const [postStep, setPostStep] = React.useState<PostStep>("review");
  const [lang, setLang] = React.useState(CAPTION_LANGS[0]!.code);
  const [title, setTitle] = React.useState(titleHint || "");
  const [description, setDescription] = React.useState("");
  const [share, setShare] = React.useState<ShareValue>(() => defaultShare(context));
  const [edited, setEdited] = React.useState<{ blob: Blob; mime: string; durationSec: number; url: string } | null>(null);
  const [progressText, setProgressText] = React.useState("");
  const [postToChat, setPostToChat] = React.useState(kind === "async_update");
  const isAsync = kind === "async_update";

  const rec = useRecorder({ lang, speakerName: profile.full_name });
  const nameOf = React.useCallback((ids: string[]) => ids.map((id) => people.find((p) => p.id === id)?.full_name || "someone").join(", "), [people]);

  /* Persistent "Recording" signal even when the user is in another window. */
  React.useEffect(() => {
    if (rec.phase !== "recording" && rec.phase !== "paused") return;
    const original = document.title;
    document.title = `● Recording — ${original}`;
    return () => {
      document.title = original;
    };
  }, [rec.phase]);

  React.useEffect(() => () => {
    if (edited) URL.revokeObjectURL(edited.url);
  }, [edited]);

  const final = edited || rec.result;
  /** Derived, never synced: capture state owns the flow until there is something to keep. */
  const step: Step = rec.live ? "live" : final ? postStep : "setup";

  function closeAll() {
    rec.cancel();
    setPostStep("review");
    setEdited(null);
    setTitle(titleHint || "");
    setDescription("");
    setProgressText("");
    onClose();
  }

  function requestClose() {
    if (rec.live && !window.confirm("Stop and discard this recording?")) return;
    closeAll();
  }

  async function doSave() {
    if (!final) return;
    setPostStep("saving");
    setProgressText("Preparing…");
    const res = await saveRecording(supabase, {
      orgId: profile.org_id ?? "",
      ownerId: profile.id,
      blob: final.blob,
      mime: final.mime,
      durationSec: final.durationSec,
      kind: kind === "screen" ? MODE_KIND[rec.mode] : kind,
      title: title.trim() || defaultTitle(rec.mode, kind),
      description,
      access: share.access,
      accessIds: share.accessIds,
      projectId: share.projectId,
      taskId: share.taskId,
      channelId: share.channelId,
      helpRequestId: share.helpRequestId,
      departmentId: share.departmentId,
      roomId: context?.roomId ?? null,
      expiresAt: expiryToIso(share.expiry),
      downloadable: share.downloadable,
      lines: rec.lines,
      lang,
      speakerName: profile.full_name,
      speakerId: profile.id,
      onProgress: setProgressText,
    });

    if ("error" in res) {
      push(res.error, "danger");
      setPostStep("share");
      return;
    }

    let summaryText = "";
    if (isAsync && rec.lines.length) {
      setProgressText("Writing the summary so people can read instead of watch…");
      try {
        const ai = await callAI<{ summary: RecordingSummary; chapters: RecordingChapter[] }>("recording-summary", { recordingId: res.id });
        summaryText = [ai.summary?.summary, ...(ai.summary?.key_points || []).map((k) => `• ${k}`)].filter(Boolean).join("\n");
      } catch {
        /* the update still posts without a summary */
      }
    }

    if (share.channelId && postToChat) {
      setProgressText("Posting to the chat…");
      const body = [
        `🎥 **${title.trim() || defaultTitle(rec.mode, kind)}** · ${fmtDuration(final.durationSec)}`,
        summaryText,
        `[Watch the recording](/recordings/${res.id})`,
      ]
        .filter(Boolean)
        .join("\n\n");
      await supabase.from("messages").insert({ channel_id: share.channelId, author_id: profile.id, kind: "video", body });
    }

    push(isAsync ? "Async update posted" : "Recording saved", "success");
    onSaved?.(res.id);
    closeAll();
  }

  const audience = audienceLabel(share, nameOf);

  return (
    <Modal
      open={open}
      onClose={requestClose}
      width={720}
      title={
        <span className="flex items-center gap-2">
          {isAsync ? "Post an async update" : kind === "video_note" ? "Record a video note" : "Record"}
          {rec.live && (
            <span className="pill tone-danger flex items-center gap-1">
              <Circle size={8} className="fill-current animate-pulse" /> Recording
            </span>
          )}
        </span>
      }
      footer={
        step === "review" ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => { setEdited(null); rec.reset(); setPostStep("review"); }}>
              <RotateCcw size={14} /> Record again
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPostStep("edit")}>Trim, cut or blur</Button>
            <Button size="sm" variant="primary" onClick={() => setPostStep("share")}>Continue</Button>
          </>
        ) : step === "share" ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setPostStep("review")}>Back</Button>
            <Button size="sm" variant="primary" onClick={doSave} disabled={isAsync && !share.channelId}>
              <Send size={14} /> {isAsync ? "Post update" : "Save recording"}
            </Button>
          </>
        ) : undefined
      }
    >
      {/* ------------------------------------------------------------ setup */}
      {step === "setup" && (
        <div className="flex flex-col gap-[var(--s3)]">
          <div className="card p-[var(--s3)] border-[var(--warn)] flex gap-2.5">
            <ShieldCheck size={18} className="text-warn shrink-0 mt-0.5" />
            <div className="text-sm min-w-0">
              <div className="font-medium">Before you record</div>
              <p className="text-muted mt-1">
                Nothing is captured until you press start, and a red “Recording” marker stays visible the whole time.
                Choose only the window or tab you want to share — close anything private first.
              </p>
              <p className="mt-1.5">
                When you save it, this will be visible to <span className="font-medium">{audience}</span>. You can change that on the next screen.
              </p>
            </div>
          </div>

          <div>
            <span className="label">What do you want to capture?</span>
            <div className={cn("grid gap-2", choices.length > 1 && "sm:grid-cols-2")}>
              {choices.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => void rec.start(m.mode)}
                  className={cn("text-left rounded-[var(--radius-sm)] border px-3 py-2.5 hover:bg-[var(--neutral-bg)] transition-colors min-w-0")}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {MODE_ICON[m.mode]} {m.label}
                  </span>
                  <span className="block text-[11px] text-muted mt-0.5">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <Field label="Spoken language (for live transcription)">
            <Select value={lang} onChange={(e) => setLang(e.target.value)}>
              {CAPTION_LANGS.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </Select>
          </Field>
          {!rec.speechAvailable && (
            <div className="text-xs text-muted flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-warn" /> Live transcription is not available in this browser — you can still record, and add a transcript later.
            </div>
          )}
          {rec.error && <div className="text-sm text-danger">{rec.error}</div>}
        </div>
      )}

      {/* ------------------------------------------------------------- live */}
      {step === "live" && (
        <div className="flex flex-col gap-[var(--s3)]">
          {rec.phase === "countdown" ? (
            <div className="h-48 flex flex-col items-center justify-center">
              <div className="text-[4rem] leading-none font-semibold num anim-pop">{rec.countdown}</div>
              <div className="text-sm text-muted mt-2">Get ready…</div>
            </div>
          ) : (
            <>
              <div className="card p-[var(--s3)] flex items-center gap-3">
                <span className={cn("w-3 h-3 rounded-full shrink-0", rec.phase === "recording" ? "bg-[var(--danger)] animate-pulse" : "bg-[var(--warn)]")} />
                <span className="text-sm font-medium">{rec.phase === "paused" ? "Paused" : "Recording"}</span>
                <div className="flex-1 flex items-center gap-[2px] h-6 min-w-0 overflow-hidden" aria-hidden>
                  {rec.levels.map((l, i) => (
                    <span key={i} className="flex-1 rounded-full bg-[var(--brand-2)] transition-[height] duration-75" style={{ height: `${Math.round(l * 100)}%`, opacity: 0.35 + l * 0.65 }} />
                  ))}
                </div>
                <span className="num text-sm shrink-0">{fmtDuration(rec.elapsed)}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {rec.phase === "recording" ? (
                  <Button size="sm" variant="secondary" onClick={rec.pause}>
                    <Pause size={14} /> Pause
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={rec.resume}>
                    <Play size={14} /> Resume
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => rec.restart()}>
                  <RotateCcw size={14} /> Restart
                </Button>
                <Button size="sm" variant="primary" onClick={rec.stop} className="ml-auto">
                  <Square size={13} /> Stop
                </Button>
              </div>

              <div className="card p-[var(--s3)] max-h-40 overflow-y-auto text-sm">
                <div className="eyebrow mb-1">Live transcript</div>
                {rec.lines.length === 0 && !rec.interim && <div className="text-muted text-xs">{rec.speechAvailable ? "Listening…" : "Live transcription is not available in this browser."}</div>}
                {rec.lines.slice(-8).map((l, i) => (
                  <p key={i} className="mb-1">
                    <span className="num text-muted text-[11px] mr-1.5">{fmtDuration(l.t)}</span>
                    {l.text}
                  </p>
                ))}
                {rec.interim && <p className="text-muted italic">{rec.interim}</p>}
              </div>
              <p className="text-xs text-muted">You can switch to another window — come back to this tab to stop, or use the browser’s “Stop sharing” bar.</p>
            </>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------- review */}
      {step === "review" && final && (
        <div className="flex flex-col gap-[var(--s3)]">
          <video src={final.url} controls playsInline className="w-full max-h-[46vh] rounded-[var(--radius)] bg-black" />
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Pill tone="tone-neutral">{fmtDuration(final.durationSec)}</Pill>
            <Pill tone="tone-neutral">{(final.blob.size / 1048576).toFixed(1)} MB</Pill>
            {rec.lines.length > 0 && <Pill tone="tone-success">{rec.lines.length} transcript lines</Pill>}
            {edited && <Pill tone="tone-info">edited</Pill>}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- edit */}
      {step === "edit" && final && (
        <RecordingEditor
          src={final.url}
          durationSec={final.durationSec}
          onBack={() => setPostStep("review")}
          onSkip={() => setPostStep("share")}
          onDone={(blob, mime, durationSec) => {
            if (edited) URL.revokeObjectURL(edited.url);
            setEdited({ blob, mime, durationSec, url: URL.createObjectURL(blob) });
            setPostStep("review");
            push("Edits applied", "success");
          }}
        />
      )}

      {/* ------------------------------------------------------------ share */}
      {step === "share" && (
        <div className="flex flex-col gap-[var(--s3)]">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle(rec.mode, kind)} maxLength={200} />
          </Field>
          <Field label="Description" hint="Optional — what should someone know before watching?">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <RecordingShare value={share} onChange={setShare} />
          {share.channelId && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="accent-[var(--brand)]" checked={postToChat} onChange={(e) => setPostToChat(e.target.checked)} />
              Post it to the chat{isAsync ? " with the AI summary in the message" : ""}
            </label>
          )}
          {isAsync && (
            <div className="text-xs text-muted flex items-start gap-1.5">
              <Sparkles size={13} className="text-brand shrink-0 mt-0.5" />
              An async update replaces a meeting: the summary is posted in the message body so the team can read it instead of watching.
              {!share.channelId && <span className="text-warn"> Pick a chat first.</span>}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------- saving */}
      {step === "saving" && (
        <div className="py-[var(--s5)] flex flex-col items-center gap-2 text-center">
          <div className="w-10 h-10 rounded-full sunken flex items-center justify-center">
            <Circle size={14} className="text-danger fill-current animate-pulse" />
          </div>
          <div className="font-medium">{progressText || "Saving…"}</div>
          <div className="text-xs text-muted">Uploading straight to secure storage. Please keep this tab open.</div>
        </div>
      )}
    </Modal>
  );
}

function defaultTitle(mode: CaptureMode, kind: RecordingKind) {
  const when = new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  if (kind === "async_update") return `Async update · ${when}`;
  if (kind === "video_note") return `Video note · ${when}`;
  const label = CAPTURE_MODES.find((m) => m.mode === mode)?.label || "Recording";
  return `${label} · ${when}`;
}

/** Small button any screen can drop in to start a recording (§30). */
export function QuickRecordButton({
  label = "Record",
  variant = "secondary",
  size = "sm",
  kind = "screen",
  context,
  className,
  onSaved,
}: {
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "xs" | "sm" | "md";
  kind?: RecordingKind;
  context?: Partial<ShareValue> & { roomId?: string | null };
  className?: string;
  onSaved?: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)} title="Record your screen or camera">
        <Video size={14} /> {label}
      </Button>
      {open && <ScreenRecorder open onClose={() => setOpen(false)} kind={kind} context={context} onSaved={onSaved} />}
    </>
  );
}
