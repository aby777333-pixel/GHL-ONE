"use client";

/**
 * Recording player (§84–87): chapter markers and bookmarks on the scrub bar, a click-to-jump
 * transcript, playback speed, "watch only what matters", the AI summary with its follow-up
 * actions (task, SOP, handover) and the reply thread.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookMarked, Bookmark, CheckSquare, Download, FileText, Lock, Rewind, Send, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button, Card, EmptyState, Modal, Pill, Select, Spinner, Tabs, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { signedUrl } from "@/components/files/storage";
import { callAI } from "@/lib/ai/types";
import { cn, fmtDate, type Tables } from "@/lib/utils";
import { RECORDING_BUCKET, fmtDuration, type RecordingChapter, type RecordingSummary } from "@/lib/live/types";
import { TranscriptView, toLines, type Line } from "./TranscriptView";
import { ReplyComposer } from "./VideoNoteButton";
import { RecordingShare, defaultShare, type ShareValue } from "./RecordingShare";

export type RecordingRow = Tables<"live_recordings">;
export type ReplyRow = Tables<"live_recording_replies">;
export type Bookmark = { t: number; label: string };

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function parseSummary(v: unknown): RecordingSummary | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.summary !== "string") return null;
  const arr = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : []);
  return {
    summary: o.summary,
    key_points: arr(o.key_points),
    questions: arr(o.questions),
    decisions: arr(o.decisions),
    tasks: Array.isArray(o.tasks)
      ? (o.tasks as Record<string, unknown>[]).filter((t) => t && typeof t.title === "string").map((t) => ({ title: String(t.title), assignee_name: typeof t.assignee_name === "string" ? t.assignee_name : null, due: typeof t.due === "string" ? t.due : null }))
      : [],
    segments: Array.isArray(o.segments)
      ? (o.segments as Record<string, unknown>[]).filter((s) => typeof s?.from_sec === "number" && typeof s?.to_sec === "number").map((s) => ({ from_sec: Number(s.from_sec), to_sec: Number(s.to_sec), why: typeof s.why === "string" ? s.why : "" }))
      : [],
  };
}

function parseChapters(v: unknown): RecordingChapter[] {
  if (!Array.isArray(v)) return [];
  return (v as Record<string, unknown>[])
    .filter((c) => c && typeof c.t === "number" && typeof c.title === "string")
    .map((c) => ({ t: Number(c.t), title: String(c.title) }))
    .sort((a, b) => a.t - b.t);
}

export function RecordingPlayer({ recording, transcript, replies: initialReplies, bookmarks }: { recording: RecordingRow; transcript: Line[]; replies: ReplyRow[]; bookmarks: Bookmark[] }) {
  const { profile, people } = useSession();
  const { push } = useToast();
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const isOwner = recording.owner_id === profile.id;
  const [url, setUrl] = React.useState<string | null>(null);
  const [current, setCurrent] = React.useState(0);
  const [duration, setDuration] = React.useState(recording.duration_sec || 0);
  const [speed, setSpeed] = React.useState(1);
  const [onlyMatters, setOnlyMatters] = React.useState(false);
  const [tab, setTab] = React.useState<"transcript" | "summary" | "replies" | "share">("transcript");
  const [summary, setSummary] = React.useState<RecordingSummary | null>(() => parseSummary(recording.summary));
  const [chapters, setChapters] = React.useState<RecordingChapter[]>(() => parseChapters(recording.chapters));
  const [thinking, setThinking] = React.useState<"" | "summary" | "handover">("");
  const [handover, setHandover] = React.useState<string | null>(null);
  const [replies, setReplies] = React.useState<ReplyRow[]>(initialReplies);
  const [share, setShare] = React.useState<ShareValue>(() =>
    defaultShare({
      access: recording.access as ShareValue["access"],
      accessIds: recording.access_ids || [],
      channelId: recording.channel_id,
      taskId: recording.task_id,
      projectId: recording.project_id,
      helpRequestId: recording.help_request_id,
      departmentId: recording.department_id,
      downloadable: recording.downloadable,
      expiry: recording.expires_at ? "30" : "never",
    })
  );

  const lines = React.useMemo<Line[]>(() => (transcript.length ? transcript : toLines(recording.transcript_segments)), [transcript, recording.transcript_segments]);
  const segments = summary?.segments || [];

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const u = await signedUrl(supabase, RECORDING_BUCKET, recording.storage_path, 7200);
      if (alive) setUrl(u);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, recording.storage_path]);

  // Count the view (the row's own RLS decides whether the write lands).
  React.useEffect(() => {
    void supabase.from("live_recordings").update({ views: (recording.views || 0) + 1 }).eq("id", recording.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seek = React.useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, t);
    void v.play().catch(() => {});
  }, []);

  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    if (!onlyMatters || !segments.length) return;
    const inside = segments.some((s) => v.currentTime >= s.from_sec - 0.2 && v.currentTime <= s.to_sec);
    if (inside) return;
    const next = segments.find((s) => s.from_sec > v.currentTime);
    if (next) v.currentTime = next.from_sec;
    else v.pause();
  }

  function scrub(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - box.left) / box.width) * (duration || recording.duration_sec || 1));
  }

  const total = duration || recording.duration_sec || 1;
  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / total) * 100))}%`;

  /* ------------------------------------------------------------ AI actions */
  async function generateSummary() {
    setThinking("summary");
    try {
      const res = await callAI<{ summary: RecordingSummary; chapters: RecordingChapter[] }>("recording-summary", { recordingId: recording.id });
      setSummary(res.summary);
      setChapters(res.chapters || []);
      setTab("summary");
      push("Summary ready", "success");
    } catch (e) {
      push(e instanceof Error ? e.message : "Could not summarise this recording.", "danger");
    } finally {
      setThinking("");
    }
  }

  async function prepareHandover() {
    setThinking("handover");
    try {
      const res = await callAI<{ handover: string }>("recording-summary", { recordingId: recording.id, mode: "handover" });
      setHandover(res.handover);
    } catch (e) {
      push(e instanceof Error ? e.message : "Could not prepare a handover.", "danger");
    } finally {
      setThinking("");
    }
  }

  async function makeSop(body?: string) {
    const text =
      body ||
      [summary?.summary, "", ...(summary?.key_points || []).map((k) => `- ${k}`), "", ...(summary?.decisions || []).map((d) => `**Decision:** ${d}`), "", `Source recording: /recordings/${recording.id}`]
        .filter((l) => l !== undefined)
        .join("\n");
    const { data, error } = await supabase.rpc("live_to_knowledge", { p_title: recording.title, p_body: text, p_kind: "sop", p_recording: recording.id });
    if (error) return push(error.message, "danger");
    push("Draft SOP created in Knowledge", "success");
    if (data) window.open(`/wiki/knowledge/${data}`, "_blank");
  }

  async function createTask(t: { title: string; assignee_name?: string | null; due?: string | null }) {
    const assignee = t.assignee_name ? people.find((p) => p.full_name?.toLowerCase() === t.assignee_name!.toLowerCase())?.id : null;
    const { error } = await supabase.from("tasks").insert({
      org_id: profile.org_id ?? "",
      title: t.title.slice(0, 200),
      description: `From the recording **${recording.title}** · /recordings/${recording.id}`,
      created_by: profile.id,
      owner_id: profile.id,
      assignee_id: assignee || profile.id,
      due_date: t.due || null,
      project_id: recording.project_id,
      department_id: recording.department_id,
      source_live_room_id: recording.room_id,
      tags: ["recording"],
    });
    push(error ? error.message : "Task created", error ? "danger" : "success");
  }

  async function remove() {
    if (!window.confirm("Delete this recording for everyone? This cannot be undone.")) return;
    const { error } = await supabase.from("live_recordings").delete().eq("id", recording.id);
    if (error) return push(error.message, "danger");
    await supabase.storage.from(RECORDING_BUCKET).remove(recording.thumbnail_path ? [recording.storage_path, recording.thumbnail_path] : [recording.storage_path]);
    push("Recording deleted", "success");
    router.push("/recordings");
  }

  async function download() {
    const u = await signedUrl(supabase, RECORDING_BUCKET, recording.storage_path, 600);
    if (u) window.open(u, "_blank");
  }

  async function reloadReplies() {
    const { data } = await supabase.from("live_recording_replies").select("*").eq("recording_id", recording.id).order("created_at");
    setReplies(data || []);
  }

  const owner = people.find((p) => p.id === recording.owner_id);

  return (
    <div className="grid lg:grid-cols-[minmax(0,1.618fr)_minmax(320px,1fr)] gap-[var(--s4)] items-start">
      {/* ------------------------------------------------------------ video */}
      <div className="min-w-0 flex flex-col gap-[var(--s3)]">
        <div className="rounded-[var(--radius)] overflow-hidden bg-black">
          {url ? (
            <video
              ref={videoRef}
              src={url}
              controls
              controlsList={recording.downloadable ? undefined : "nodownload"}
              playsInline
              className="w-full max-h-[62vh] bg-black"
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setDuration(d);
                e.currentTarget.playbackRate = speed;
              }}
            />
          ) : (
            <div className="aspect-video flex items-center justify-center">
              <Spinner />
            </div>
          )}
        </div>

        {/* scrub bar with chapters, AI segments and bookmarks */}
        <div>
          <div className="relative h-7 rounded-full sunken overflow-hidden cursor-pointer" onClick={scrub} role="slider" aria-label="Seek" aria-valuenow={Math.round(current)} aria-valuemin={0} aria-valuemax={Math.round(total)} tabIndex={0}>
            {segments.map((s, i) => (
              <span key={`s${i}`} className="absolute inset-y-0 bg-[var(--success)]/25" style={{ left: pct(s.from_sec), width: pct(Math.max(0, s.to_sec - s.from_sec)) }} title={s.why} />
            ))}
            <span className="absolute inset-y-0 left-0 bg-[var(--brand)]/45" style={{ width: pct(current) }} />
            {chapters.map((c, i) => (
              <span key={`c${i}`} className="absolute inset-y-0 w-[2px] bg-[var(--fg-muted)]" style={{ left: pct(c.t) }} title={`${fmtDuration(c.t)} · ${c.title}`} />
            ))}
            {bookmarks.map((b, i) => (
              <span key={`b${i}`} className="absolute top-0 w-[3px] h-2.5 rounded-b bg-[var(--warn)]" style={{ left: pct(b.t) }} title={`${fmtDuration(b.t)} · ${b.label}`} />
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px] num text-muted mt-1">
            <span>{fmtDuration(current)}</span>
            <span>{fmtDuration(total)}</span>
          </div>
        </div>

        {/* controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="w-auto"
            value={String(speed)}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSpeed(v);
              if (videoRef.current) videoRef.current.playbackRate = v;
            }}
            aria-label="Playback speed"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>{s}×</option>
            ))}
          </Select>
          <Button size="sm" variant="ghost" onClick={() => seek(Math.max(0, current - 10))}>
            <Rewind size={14} /> 10s
          </Button>
          {segments.length > 0 && (
            <>
              <Button size="sm" variant={onlyMatters ? "primary" : "secondary"} onClick={() => setOnlyMatters((v) => !v)} title="Skip everything the AI marked as filler">
                <Sparkles size={14} /> Only what matters
              </Button>
              <Button size="sm" variant="ghost" onClick={() => seek((segments.find((s) => s.from_sec > current) || segments[0]!).from_sec)}>
                Next highlight
              </Button>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {recording.downloadable ? (
              <Button size="sm" variant="ghost" onClick={download}>
                <Download size={14} /> Download
              </Button>
            ) : (
              <Pill tone="tone-neutral">
                <Lock size={11} /> stream only
              </Pill>
            )}
            {isOwner && (
              <Button size="sm" variant="ghost" className="text-danger" onClick={remove}>
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        </div>

        {chapters.length > 0 && (
          <Card className="p-[var(--s3)]">
            <div className="eyebrow mb-1.5">Chapters</div>
            <div className="flex flex-col">
              {chapters.map((c, i) => (
                <button key={i} type="button" onClick={() => seek(c.t)} className={cn("flex gap-2 text-left text-sm px-2 py-1.5 rounded-[var(--radius-sm)] row-hover", current >= c.t && (!chapters[i + 1] || current < chapters[i + 1]!.t) && "bg-[var(--brand)]/10")}>
                  <span className="num text-[11px] text-muted w-11 shrink-0 pt-0.5">{fmtDuration(c.t)}</span>
                  <span className="min-w-0">{c.title}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        <div className="text-xs text-muted">
          {owner?.full_name || "Someone"} · {fmtDate(recording.created_at, true)} · {recording.views} view{recording.views === 1 ? "" : "s"}
          {recording.expires_at && ` · expires ${fmtDate(recording.expires_at)}`}
        </div>
      </div>

      {/* ------------------------------------------------------------ panel */}
      <div className="min-w-0 lg:sticky lg:top-[var(--s4)]">
        <Card className="flex flex-col max-h-[78vh] min-h-[420px]">
          <Tabs
            className="px-[var(--s3)] shrink-0"
            tabs={[
              { key: "transcript" as const, label: "Transcript" },
              { key: "summary" as const, label: "Summary" },
              { key: "replies" as const, label: "Replies", count: replies.length },
              ...(isOwner ? [{ key: "share" as const, label: "Sharing" }] : []),
            ]}
            value={tab}
            onChange={setTab}
          />
          <div className="flex-1 min-h-0 overflow-y-auto p-[var(--s3)]">
            {tab === "transcript" && <TranscriptView lines={lines} currentSec={current} onSeek={seek} className="h-full" />}

            {tab === "summary" && (
              <div className="flex flex-col gap-[var(--s3)]">
                {!summary ? (
                  <EmptyState
                    icon={<Sparkles size={18} />}
                    title="No summary yet"
                    hint={lines.length ? "Turn the transcript into a summary, chapters, tasks and the parts worth watching." : "This recording has no transcript, so there is nothing to summarise."}
                    action={
                      lines.length ? (
                        <Button size="sm" variant="primary" onClick={generateSummary} loading={thinking === "summary"}>
                          <Wand2 size={14} /> Summarise
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <>
                    <p className="text-sm">{summary.summary}</p>
                    {summary.key_points.length > 0 && (
                      <Section title="Key points">
                        <ul className="text-sm list-disc pl-4 space-y-1">
                          {summary.key_points.map((k, i) => (
                            <li key={i}>{k}</li>
                          ))}
                        </ul>
                      </Section>
                    )}
                    {summary.tasks.length > 0 && (
                      <Section title="Tasks">
                        {summary.tasks.map((t, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm py-1">
                            <span className="min-w-0 flex-1">
                              {t.title}
                              <span className="block text-[11px] text-muted">{t.assignee_name || "Unassigned"}{t.due ? ` · due ${t.due}` : ""}</span>
                            </span>
                            <Button size="xs" variant="ghost" onClick={() => createTask(t)} title="Create this task">
                              <CheckSquare size={13} />
                            </Button>
                          </div>
                        ))}
                      </Section>
                    )}
                    {summary.decisions.length > 0 && (
                      <Section title="Decisions">
                        <ul className="text-sm list-disc pl-4 space-y-1">
                          {summary.decisions.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      </Section>
                    )}
                    {summary.questions.length > 0 && (
                      <Section title="Open questions">
                        <ul className="text-sm list-disc pl-4 space-y-1">
                          {summary.questions.map((q, i) => (
                            <li key={i}>{q}</li>
                          ))}
                        </ul>
                      </Section>
                    )}
                    {segments.length > 0 && (
                      <Section title="Watch only what matters">
                        {segments.map((s, i) => (
                          <button key={i} type="button" onClick={() => seek(s.from_sec)} className="w-full text-left text-sm px-2 py-1.5 rounded-[var(--radius-sm)] row-hover flex gap-2">
                            <span className="num text-[11px] text-muted w-11 shrink-0 pt-0.5">{fmtDuration(s.from_sec)}</span>
                            <span className="min-w-0">{s.why}</span>
                          </button>
                        ))}
                      </Section>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="ghost" onClick={generateSummary} loading={thinking === "summary"}>
                        <Wand2 size={14} /> Redo
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => makeSop()}>
                        <BookMarked size={14} /> Make this a SOP
                      </Button>
                      <Button size="sm" variant="secondary" onClick={prepareHandover} loading={thinking === "handover"}>
                        <FileText size={14} /> Prepare handover
                      </Button>
                    </div>
                  </>
                )}
                {recording.knowledge_id && (
                  <Link href={`/wiki/knowledge/${recording.knowledge_id}`} className="link text-sm">
                    Open the knowledge entry created from this recording
                  </Link>
                )}
              </div>
            )}

            {tab === "replies" && (
              <div className="flex flex-col gap-[var(--s3)]">
                <ReplyComposer recordingId={recording.id} atSec={current} onPosted={reloadReplies} />
                {replies.length === 0 && <div className="text-sm text-muted">No replies yet.</div>}
                {replies.map((r) => (
                  <ReplyItem key={r.id} reply={r} onSeek={seek} authorName={people.find((p) => p.id === r.author_id)?.full_name || "Someone"} />
                ))}
              </div>
            )}

            {tab === "share" && isOwner && <RecordingShare value={share} onChange={setShare} recordingId={recording.id} />}
          </div>
        </Card>
      </div>

      <Modal open={!!handover} onClose={() => setHandover(null)} title="Handover draft" width={620} footer={<>
        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(handover || ""); push("Copied", "success"); }}>Copy</Button>
        <Button size="sm" variant="primary" onClick={() => { void makeSop(handover || ""); setHandover(null); }}>
          <Send size={14} /> Save to Knowledge
        </Button>
      </>}>
        <pre className="whitespace-pre-wrap text-sm font-sans">{handover}</pre>
      </Modal>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-1">{title}</div>
      {children}
    </div>
  );
}

function ReplyItem({ reply, onSeek, authorName }: { reply: ReplyRow; onSeek: (t: number) => void; authorName: string }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!reply.storage_path) return;
    let alive = true;
    signedUrl(supabase, RECORDING_BUCKET, reply.storage_path, 3600).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [supabase, reply.storage_path]);
  return (
    <div className="border-t pt-2 first:border-t-0">
      <div className="flex items-center gap-2 text-[11px] text-muted mb-1">
        <span className="font-medium text-[var(--fg-2)]">{authorName}</span>
        {typeof reply.at_sec === "number" && (
          <button type="button" className="link num inline-flex items-center gap-1" onClick={() => onSeek(reply.at_sec!)}>
            <Bookmark size={10} /> {fmtDuration(reply.at_sec)}
          </button>
        )}
        <span className="ml-auto">{fmtDate(reply.created_at, true)}</span>
      </div>
      {reply.body && <p className="text-sm">{reply.body}</p>}
      {reply.kind === "voice" && url && (
        <audio src={url} controls className="w-full h-9 mt-1" />
      )}
      {reply.kind === "video" && url && (
        <video src={url} controls playsInline className="w-full max-h-56 rounded-[var(--radius)] bg-black mt-1" />
      )}
    </div>
  );
}
