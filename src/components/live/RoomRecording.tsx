"use client";
/**
 * Meeting recording for a GHL LIVE room — the save half.
 *
 * `useRoomRecorder` produces the composite blob; this hook turns it into a `live_recordings` row:
 * upload straight to Supabase Storage (never through a Next route), inherit the room's project /
 * channel / task links, default the audience to the people who were actually in the room, and then
 * offer the existing AI summary. Saving never waits for the AI.
 *
 * The room's own captions (`live_transcripts` for this room, from the moment recording started)
 * ride along as the recording's transcript so the summary has something to work with.
 */
import * as React from "react";
import Link from "next/link";
import { Play, Sparkles } from "lucide-react";
import type { Room } from "livekit-client";
import { Button, Modal, Spinner, useToast } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { callAI } from "@/lib/ai/types";
import { saveRecording } from "@/components/recordings/RecordingShare";
import type { TranscriptLine } from "@/components/recordings/useRecorder";
import { fmtDuration, type LiveRoom as LiveRoomRow, type RecordingSummary } from "@/lib/live/types";
import type { PeerView } from "./useLiveKit";
import { useRoomRecorder, type RoomRecorderTake } from "./useRoomRecorder";

export type UseRoomRecordingArgs = {
  room: Room | null;
  peers: PeerView[];
  roomId?: string;
  /** The `live_rooms` row, so the recording inherits the room's links. */
  roomRow: LiveRoomRow | null;
  orgId: string;
  meId: string;
  meName: string;
  roomTitle: string;
  lang?: string;
  /** Called whenever recording ends, including when it ends by itself (room gone, tab closing). */
  onStopped?: () => void;
};

type Saved = { id: string; title: string; durationSec: number };

export function useRoomRecording(args: UseRoomRecordingArgs) {
  const { room, peers, roomId, roomRow, orgId, meId, meName, roomTitle, lang = "en-IN" } = args;
  const toast = useToast();
  const supabase = React.useMemo(() => createClient(), []);

  const [saving, setSaving] = React.useState(false);
  const [progress, setProgress] = React.useState("");
  const [saved, setSaved] = React.useState<Saved | null>(null);
  const [summaryState, setSummaryState] = React.useState<"idle" | "busy" | "done" | "off" | "failed">("idle");
  const [summaryNote, setSummaryNote] = React.useState("");

  const startedAtRef = React.useRef(0);
  const ctxRef = React.useRef({ roomId, roomRow, orgId, meId, meName, roomTitle, lang });
  React.useEffect(() => {
    ctxRef.current = { roomId, roomRow, orgId, meId, meName, roomTitle, lang };
  });

  /** Who was in the room → the default audience for the recording. */
  const audienceIds = React.useCallback(async (id: string, owner: string) => {
    const { data } = await supabase.from("live_participants").select("user_id,role").eq("room_id", id);
    const ids = new Set<string>([owner]);
    for (const row of data || []) if (row.role !== "removed") ids.add(row.user_id);
    return [...ids];
  }, [supabase]);

  /** Room captions captured while this take was running, re-timed to the recording. */
  const transcriptLines = React.useCallback(
    async (id: string, sinceMs: number): Promise<TranscriptLine[]> => {
      if (!sinceMs) return [];
      const { data } = await supabase
        .from("live_transcripts")
        .select("text,speaker_name,created_at")
        .eq("room_id", id)
        .gte("created_at", new Date(sinceMs - 1000).toISOString())
        .order("created_at", { ascending: true })
        .limit(2000);
      return (data || [])
        .filter((r) => (r.text || "").trim())
        .map((r) => ({
          t: Math.max(0, Math.round((new Date(r.created_at as string).getTime() - sinceMs) / 100) / 10),
          text: r.text,
          speaker: r.speaker_name,
        }));
    },
    [supabase]
  );

  const persist = React.useCallback(
    async (take: RoomRecorderTake) => {
      const c = ctxRef.current;
      if (!c.roomId || !c.orgId || !c.meId) {
        toast.push("The recording could not be saved — the room context was lost.", "danger");
        return;
      }
      setSaving(true);
      setSummaryState("idle");
      setSummaryNote("");
      setProgress("Preparing the recording…");
      const [accessIds, lines] = await Promise.all([
        audienceIds(c.roomId, c.meId).catch(() => [c.meId]),
        transcriptLines(c.roomId, startedAtRef.current).catch(() => [] as TranscriptLine[]),
      ]);
      const title = `${c.roomTitle || "Live room"} — ${new Date().toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`;

      const res = await saveRecording(supabase, {
        orgId: c.orgId,
        ownerId: c.meId,
        blob: take.blob,
        mime: take.mime,
        durationSec: take.durationSec,
        kind: "meeting",
        title,
        description: null,
        access: "selected",
        accessIds,
        projectId: c.roomRow?.project_id ?? null,
        taskId: c.roomRow?.task_id ?? null,
        channelId: c.roomRow?.channel_id ?? null,
        helpRequestId: c.roomRow?.help_request_id ?? null,
        departmentId: c.roomRow?.department_id ?? null,
        roomId: c.roomId,
        expiresAt: null,
        downloadable: true,
        lines,
        lang: c.lang,
        speakerName: c.meName,
        speakerId: c.meId,
        onProgress: setProgress,
      });
      setSaving(false);
      setProgress("");

      if ("error" in res) {
        toast.push(res.error, "danger");
        return;
      }
      setSaved({ id: res.id, title, durationSec: take.durationSec });
      toast.push(`Recording saved · ${fmtDuration(take.durationSec)} — open it from Recordings`, "success");
      await supabase
        .from("live_events")
        .insert({ org_id: c.orgId, room_id: c.roomId, kind: "recording_saved", actor_id: c.meId, actor_name: c.meName, payload: { recording_id: res.id } })
        .then(() => null);
    },
    [audienceIds, supabase, toast, transcriptLines]
  );

  const stoppedRef = React.useRef(args.onStopped);
  React.useEffect(() => {
    stoppedRef.current = args.onStopped;
  });
  const rec = useRoomRecorder({ room, peers, onComplete: persist, onEnded: () => stoppedRef.current?.() });

  /** Resolves to `null` when recording started, or to the reason it could not. */
  const start = React.useCallback(async () => {
    const problem = await rec.start();
    if (!problem) startedAtRef.current = Date.now();
    return problem;
  }, [rec]);

  async function runSummary() {
    if (!saved) return;
    setSummaryState("busy");
    setSummaryNote("");
    try {
      const out = await callAI<{ summary: RecordingSummary }>("recording-summary", { recordingId: saved.id });
      setSummaryState("done");
      setSummaryNote(out.summary?.summary?.slice(0, 400) || "The summary was written and saved with the recording.");
    } catch (e) {
      const err = e as Error & { disabled?: boolean };
      setSummaryState(err.disabled ? "off" : "failed");
      setSummaryNote(err.disabled ? "AI is switched off for this workspace, so no summary was written." : err.message || "The summary could not be written.");
    }
  }

  const dialog = (
    <>
      <Modal open={saving} onClose={() => {}} title="Saving the recording" width={420}>
        <div className="flex items-center gap-3 py-2">
          <Spinner />
          <div className="min-w-0">
            <div className="text-sm">{progress || "Working…"}</div>
            <div className="text-[11px] text-muted">Keep this tab open until it finishes.</div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!saved}
        onClose={() => setSaved(null)}
        title="Recording saved"
        width={460}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setSaved(null)}>Close</Button>
            {summaryState !== "off" && (
              <Button size="sm" variant="secondary" onClick={() => void runSummary()} loading={summaryState === "busy"} disabled={summaryState === "done"}>
                <Sparkles size={14} /> {summaryState === "done" ? "Summary written" : "Write the AI summary"}
              </Button>
            )}
            {saved && (
              <Link href={`/recordings/${saved.id}`} className="btn btn-primary btn-sm" onClick={() => setSaved(null)}>
                <Play size={14} /> Open recording
              </Link>
            )}
          </>
        }
      >
        {saved && (
          <div className="flex flex-col gap-[var(--s3)]">
            <div>
              <div className="text-sm font-medium">{saved.title}</div>
              <div className="text-[11px] text-muted">
                {fmtDuration(saved.durationSec)} · shared with everyone who was in this room
              </div>
            </div>
            {summaryNote && (
              <p className={summaryState === "failed" || summaryState === "off" ? "text-xs text-muted" : "text-xs"}>{summaryNote}</p>
            )}
            <p className="text-[11px] text-muted">
              You can change who can see it, attach it to a project or add a summary later from the recording page.
            </p>
          </div>
        )}
      </Modal>
    </>
  );

  return {
    recording: rec.recording,
    paused: rec.paused,
    durationSec: rec.durationSec,
    error: rec.error,
    saving,
    start,
    pause: rec.pause,
    resume: rec.resume,
    stop: rec.stop,
    dialog,
  };
}
