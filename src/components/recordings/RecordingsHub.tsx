"use client";

/**
 * Recording library (§37–39): mine, shared with me, project / department, expiring soon —
 * with a search that also looks inside transcripts, and filters by capture kind.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Film, Lock, Play, Radio, Trash2, Users, Video } from "lucide-react";
import { Avatar, Button, Card, EmptyState, Modal, PageHeader, Pill, SearchInput, Select, Tabs, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { cn, fmtDate, bytes, type Tables } from "@/lib/utils";
import { RECORDING_BUCKET, fmtDuration, type RecordingKind } from "@/lib/live/types";
import { QuickRecordButton, ScreenRecorder } from "./ScreenRecorder";
import { VideoNoteButton } from "./VideoNoteButton";

type Row = Tables<"live_recordings">;
type TabKey = "mine" | "shared" | "work" | "expiring";

const KIND_LABEL: Record<RecordingKind, string> = {
  screen: "Screen",
  screen_voice: "Screen + voice",
  screen_cam: "Screen + webcam",
  camera: "Camera",
  video_note: "Video note",
  meeting: "Meeting",
  async_update: "Async update",
};

const ACCESS_LABEL: Record<string, string> = {
  only_me: "Only me",
  selected: "Selected people",
  team: "Team",
  department: "Department",
  project: "Project",
  company: "Company",
};

export function RecordingsHub({ recordings, now }: { recordings: Row[]; now: string }) {
  const { profile, people } = useSession();
  const supabase = React.useMemo(() => createClient(), []);
  const [tab, setTab] = React.useState<TabKey>("mine");
  const [q, setQ] = React.useState("");
  const [kind, setKind] = React.useState<"" | RecordingKind>("");
  const [thumbs, setThumbs] = React.useState<Record<string, string>>({});
  const [asyncOpen, setAsyncOpen] = React.useState(false);
  const router = useRouter();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = React.useState<Row | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [removed, setRemoved] = React.useState<string[]>([]);

  async function removeRecording(r: Row) {
    setDeleting(true);
    // The video object first — a `protect_delete` trigger blocks removing storage rows through SQL,
    // so it has to go through the Storage API — then the row that lists it.
    const paths = [r.storage_path, r.thumbnail_path].filter((x): x is string => !!x);
    if (paths.length) await supabase.storage.from(RECORDING_BUCKET).remove(paths);
    const { error } = await supabase.from("live_recordings").delete().eq("id", r.id);
    setDeleting(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setRemoved((s) => [...s, r.id]);
    setConfirmDelete(null);
    toast.push("Recording deleted", "success");
    router.refresh();
  }

  React.useEffect(() => {
    const paths = recordings.map((r) => r.thumbnail_path).filter((p): p is string => !!p).slice(0, 200);
    if (!paths.length) return;
    let alive = true;
    supabase.storage
      .from(RECORDING_BUCKET)
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        if (!alive || !data) return;
        const map: Record<string, string> = {};
        for (const d of data) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
        setThumbs(map);
      });
    return () => {
      alive = false;
    };
  }, [recordings, supabase]);

  // "expiring soon" is measured from the server render time so the render stays pure.
  const soon = new Date(now).getTime() + 14 * 86400000;
  const buckets = React.useMemo(() => {
    const visible = removed.length ? recordings.filter((r) => !removed.includes(r.id)) : recordings;
    const mine = visible.filter((r) => r.owner_id === profile.id);
    const shared = visible.filter((r) => r.owner_id !== profile.id && (r.access === "selected" || r.access === "team" || r.access === "company"));
    const work = visible.filter((r) => r.project_id || r.department_id || r.help_request_id || r.access === "project" || r.access === "department");
    const expiring = visible.filter((r) => r.expires_at && new Date(r.expires_at).getTime() < soon).sort((a, b) => (a.expires_at || "").localeCompare(b.expires_at || ""));
    return { mine, shared, work, expiring };
  }, [recordings, removed, profile.id, soon]);

  const list = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return buckets[tab].filter((r) => {
      if (kind && r.kind !== kind) return false;
      if (!needle) return true;
      return [r.title, r.description, r.transcript].some((f) => (f || "").toLowerCase().includes(needle));
    });
  }, [buckets, tab, q, kind]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="GHL LIVE"
        title="Recordings"
        subtitle="Show it once, let everyone watch when they can. Screen recordings, video notes and async updates."
        actions={
          <>
            <VideoNoteButton />
            <Button size="sm" variant="secondary" onClick={() => setAsyncOpen(true)} title="Record an update instead of holding a meeting">
              <Radio size={14} /> Async update
            </Button>
            <QuickRecordButton label="New recording" variant="primary" />
          </>
        }
      />

      <div className="flex flex-col gap-[var(--s3)]">
        <Tabs
          tabs={[
            { key: "mine" as const, label: "Mine", count: buckets.mine.length },
            { key: "shared" as const, label: "Shared with me", count: buckets.shared.length },
            { key: "work" as const, label: "Project & department", count: buckets.work.length },
            { key: "expiring" as const, label: "Expiring soon", count: buckets.expiring.length },
          ]}
          value={tab}
          onChange={setTab}
        />

        <div className="flex flex-wrap items-center gap-2">
          <SearchInput className="flex-1 min-w-[200px]" placeholder="Search titles, descriptions and transcripts" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="w-auto" value={kind} onChange={(e) => setKind(e.target.value as "" | RecordingKind)} aria-label="Filter by kind">
            <option value="">All kinds</option>
            {(Object.keys(KIND_LABEL) as RecordingKind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </Select>
        </div>

        {list.length === 0 ? (
          <EmptyState
            icon={<Film size={18} />}
            title={q || kind ? "Nothing matches" : tab === "mine" ? "You have not recorded anything yet" : "Nothing here yet"}
            hint={q || kind ? "Try a different search or clear the filter." : "Record your screen once instead of explaining the same thing five times."}
            action={tab === "mine" && !q ? <QuickRecordButton label="Record something" variant="primary" /> : undefined}
          />
        ) : (
          <div className="grid gap-[var(--s3)] sm:grid-cols-2 xl:grid-cols-3">
            {list.map((r) => {
              const owner = people.find((p) => p.id === r.owner_id);
              const thumb = r.thumbnail_path ? thumbs[r.thumbnail_path] : undefined;
              const expiringSoon = r.expires_at && new Date(r.expires_at).getTime() < soon;
              return (
                <Link key={r.id} href={`/recordings/${r.id}`} className="min-w-0">
                  <Card hover className="overflow-hidden h-full flex flex-col">
                    <div className="relative aspect-video bg-[var(--neutral-bg)] flex items-center justify-center overflow-hidden">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Video size={22} className="text-muted" />
                      )}
                      <span className="absolute bottom-1.5 right-1.5 num text-[11px] px-1.5 py-0.5 rounded bg-black/70 text-white">{fmtDuration(r.duration_sec)}</span>
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/25">
                        <Play size={26} className="text-white" />
                      </span>
                      {/* Owners could record but never remove — the only way to delete was to open the
                          recording first, which is exactly what people could not do. */}
                      {r.owner_id === profile.id && (
                        <button
                          type="button"
                          aria-label={`Delete ${r.title}`}
                          title="Delete this recording"
                          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-[var(--danger)] transition-colors"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(r); }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="p-[var(--s3)] flex flex-col gap-1.5 min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{r.title}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted min-w-0">
                        <Avatar name={owner?.full_name} src={owner?.avatar_url} size={18} />
                        <span className="truncate">{owner?.full_name || "Someone"}</span>
                        <span>·</span>
                        <span className="whitespace-nowrap">{fmtDate(r.created_at)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-auto pt-1">
                        <Pill tone="tone-neutral">{KIND_LABEL[r.kind as RecordingKind] || r.kind}</Pill>
                        <Pill tone={r.access === "only_me" ? "tone-muted" : "tone-info"}>
                          {r.access === "only_me" ? <Lock size={10} /> : <Users size={10} />} {ACCESS_LABEL[r.access] || r.access}
                        </Pill>
                        {!r.downloadable && <Pill tone="tone-muted">stream only</Pill>}
                        {expiringSoon && (
                          <Pill tone="tone-warn">
                            <Clock size={10} /> {fmtDate(r.expires_at)}
                          </Pill>
                        )}
                        <span className={cn("ml-auto text-[11px] text-muted num")}>{bytes(r.size_bytes)}</span>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this recording?"
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deleting}>Keep it</Button>
            <Button variant="danger" loading={deleting} onClick={() => confirmDelete && removeRecording(confirmDelete)}><Trash2 size={15} /> Delete</Button>
          </>
        }
      >
        <p className="text-sm text-muted">“{confirmDelete?.title}”, its transcript and any replies go for good. Anyone you shared it with loses access.</p>
      </Modal>

      {asyncOpen && <ScreenRecorder open onClose={() => setAsyncOpen(false)} kind="async_update" />}
    </div>
  );
}
