import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Pill } from "@/components/ui";
import { RecordingPlayer, type Bookmark } from "@/components/recordings/RecordingPlayer";
import { toLines, type Line } from "@/components/recordings/TranscriptView";
import { fmtDuration } from "@/lib/live/types";

export const metadata = { title: "Recording" };

export default async function RecordingPage({ params }: { params: Promise<{ id: string }> }) {
  await getSession();
  const { id } = await params;
  const supabase = await createClient();

  const { data: recording } = await supabase.from("live_recordings").select("*").eq("id", id).maybeSingle();
  if (!recording) notFound();

  /*
    Transcript, replies and bookmarks are extras around the video. `Promise.all` meant one of them
    rejecting — a dropped connection, a slow query timing out — threw the whole route, and with no
    error boundary in the app that surfaced as a bare "this page couldn't load" with the recording
    itself perfectly playable underneath. Settle them independently and fall back to empty.
  */
  const [transcriptRes, repliesRes, eventsRes] = await Promise.allSettled([
    supabase.from("live_transcripts").select("text,offset_ms,speaker_name").eq("recording_id", id).order("offset_ms").limit(3000),
    supabase.from("live_recording_replies").select("*").eq("recording_id", id).order("created_at"),
    recording.room_id
      ? supabase.from("live_events").select("payload,created_at,actor_name").eq("room_id", recording.room_id).eq("kind", "bookmark").order("created_at").limit(200)
      : Promise.resolve({ data: [] as { payload: unknown; created_at: string; actor_name: string | null }[] }),
  ]);
  const transcriptRows = transcriptRes.status === "fulfilled" ? transcriptRes.value.data : null;
  const replies = repliesRes.status === "fulfilled" ? repliesRes.value.data : null;
  const events = eventsRes.status === "fulfilled" ? eventsRes.value.data : null;

  const transcript: Line[] = (transcriptRows || []).length
    ? (transcriptRows || []).map((r) => ({ t: Math.max(0, Math.round((r.offset_ms || 0) / 1000)), text: r.text, speaker: r.speaker_name }))
    : toLines(recording.transcript_segments);

  const started = new Date(recording.created_at).getTime();
  const bookmarks: Bookmark[] = (events || []).map((e) => {
    const p = (e.payload || {}) as Record<string, unknown>;
    const t = typeof p.t === "number" ? p.t : typeof p.at_sec === "number" ? p.at_sec : Math.max(0, (new Date(e.created_at).getTime() - started) / 1000);
    return { t, label: typeof p.label === "string" ? p.label : `Bookmark by ${e.actor_name || "someone"}` };
  });

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <Link href="/recordings" className="inline-flex items-center gap-1 link">
            <ArrowLeft size={12} /> Recordings
          </Link>
        }
        title={recording.title}
        subtitle={recording.description || undefined}
        actions={
          <>
            <Pill tone="tone-neutral">{fmtDuration(recording.duration_sec)}</Pill>
            {recording.status !== "ready" && <Pill tone="tone-warn">{recording.status}</Pill>}
          </>
        }
      />
      <RecordingPlayer recording={recording} transcript={transcript} replies={replies || []} bookmarks={bookmarks} />
    </div>
  );
}
