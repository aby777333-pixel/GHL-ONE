"use client";

/**
 * Who can see a recording (§37–39, §168), what it is attached to and when it expires.
 * The database trigger `live_recordings_share` sends the notifications — never create them here.
 */

import * as React from "react";
import { Check, Download, Link2, Lock, Search, Users } from "lucide-react";
import { Avatar, Button, Field, Pill, Select, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadFile } from "@/components/files/storage";
import { RECORDING_BUCKET, recordingPath, type RecordingAccess, type RecordingKind } from "@/lib/live/types";
import { captureThumbnail, extForMime, type TranscriptLine } from "./useRecorder";

export type SB = SupabaseClient<Database>;

export type ShareValue = {
  access: RecordingAccess;
  accessIds: string[];
  channelId: string | null;
  taskId: string | null;
  projectId: string | null;
  helpRequestId: string | null;
  departmentId: string | null;
  expiry: ExpiryKey;
  downloadable: boolean;
};

export const ACCESS_OPTIONS: { key: RecordingAccess; label: string; hint: string }[] = [
  { key: "only_me", label: "Only me", hint: "Nobody else can open it" },
  { key: "selected", label: "Selected people", hint: "Only the people you pick" },
  { key: "team", label: "My team", hint: "Everyone in your team" },
  { key: "department", label: "Department", hint: "Everyone in the department" },
  { key: "project", label: "Project", hint: "Everyone who can see the project" },
  { key: "company", label: "Company", hint: "All internal staff" },
];

export function defaultShare(partial?: Partial<ShareValue>): ShareValue {
  return {
    access: "only_me",
    accessIds: [],
    channelId: null,
    taskId: null,
    projectId: null,
    helpRequestId: null,
    departmentId: null,
    expiry: "never",
    downloadable: true,
    ...partial,
  };
}

/** Plain-language answer to "who will be able to see this?" — shown in the consent notice too. */
export function audienceLabel(v: ShareValue, names: (ids: string[]) => string) {
  switch (v.access) {
    case "only_me": return "only you";
    case "selected": return v.accessIds.length ? names(v.accessIds) : "nobody yet — pick people below";
    case "team": return "everyone in your team";
    case "department": return "everyone in the department";
    case "project": return "everyone who can see the project";
    case "company": return "everyone in the company";
    default: return "only you";
  }
}

type Options = { channels: { id: string; name: string }[]; projects: { id: string; name: string }[]; tasks: { id: string; title: string }[]; helps: { id: string; title: string }[] };

export function RecordingShare({ value, onChange, className, recordingId }: { value: ShareValue; onChange: (v: ShareValue) => void; className?: string; recordingId?: string }) {
  const { people, departments } = useSession();
  const { push } = useToast();
  const supabase = React.useMemo(() => createClient(), []);
  const [opts, setOpts] = React.useState<Options>({ channels: [], projects: [], tasks: [], helps: [] });
  const [q, setQ] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const set = (patch: Partial<ShareValue>) => onChange({ ...value, ...patch });

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const [ch, pr, tk, hp] = await Promise.all([
        supabase.from("channels").select("id,name").eq("archived", false).order("name").limit(200),
        supabase.from("projects").select("id,name").eq("archived", false).order("name").limit(200),
        supabase.from("tasks").select("id,title").not("status", "in", "(done,cancelled)").order("created_at", { ascending: false }).limit(120),
        supabase.from("help_requests").select("id,title").not("status", "in", "(completed,declined)").order("created_at", { ascending: false }).limit(80),
      ]);
      if (!alive) return;
      setOpts({ channels: ch.data || [], projects: pr.data || [], tasks: tk.data || [], helps: hp.data || [] });
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? people.filter((p) => (p.full_name || "").toLowerCase().includes(needle) || (p.designation || "").toLowerCase().includes(needle)) : people;
    return list.slice(0, 60);
  }, [people, q]);

  function togglePerson(id: string) {
    const has = value.accessIds.includes(id);
    set({ accessIds: has ? value.accessIds.filter((x) => x !== id) : [...value.accessIds, id] });
  }

  async function persist() {
    if (!recordingId) return;
    setSaving(true);
    const { error } = await supabase
      .from("live_recordings")
      .update({
        access: value.access,
        access_ids: value.accessIds,
        channel_id: value.channelId,
        task_id: value.taskId,
        project_id: value.projectId,
        help_request_id: value.helpRequestId,
        department_id: value.departmentId,
        expires_at: expiryToIso(value.expiry),
        downloadable: value.downloadable,
      })
      .eq("id", recordingId);
    setSaving(false);
    push(error ? error.message : "Sharing updated", error ? "danger" : "success");
  }

  return (
    <div className={cn("flex flex-col gap-[var(--s3)]", className)}>
      <div>
        <span className="label">Who can see this</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ACCESS_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => set({ access: o.key })}
              className={cn(
                "text-left rounded-[var(--radius-sm)] border px-3 py-2 transition-colors min-w-0",
                value.access === o.key ? "border-[var(--brand)] bg-[var(--brand)]/10" : "hover:bg-[var(--neutral-bg)]"
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium truncate">
                {o.key === "only_me" ? <Lock size={13} /> : <Users size={13} />}
                {o.label}
              </span>
              <span className="block text-[11px] text-muted truncate">{o.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {value.access === "selected" && (
        <div className="card p-[var(--s3)] flex flex-col gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input className="input pl-9" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="max-h-52 overflow-y-auto -mx-1 px-1">
            {filtered.map((p) => {
              const on = value.accessIds.includes(p.id);
              return (
                <button key={p.id} type="button" onClick={() => togglePerson(p.id)} className={cn("w-full flex items-center gap-2 px-2 h-10 rounded-[var(--radius-sm)] text-left row-hover", on && "bg-[var(--brand)]/10")}>
                  <Avatar name={p.full_name} src={p.avatar_url} size={24} />
                  <span className="flex-1 min-w-0 truncate text-sm">{p.full_name}</span>
                  {p.designation && <span className="text-[11px] text-muted truncate hidden sm:block">{p.designation}</span>}
                  {on && <Check size={15} className="text-success shrink-0" />}
                </button>
              );
            })}
            {!filtered.length && <div className="text-sm text-muted px-2 py-3">No matching people.</div>}
          </div>
          {value.accessIds.length > 0 && <div className="text-xs text-muted">{value.accessIds.length} selected</div>}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-[var(--s3)]">
        <Field label="Attach to a chat">
          <Select value={value.channelId || ""} onChange={(e) => set({ channelId: e.target.value || null })}>
            <option value="">Not attached</option>
            {opts.channels.map((c) => (
              <option key={c.id} value={c.id}>#{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Attach to a project">
          <Select value={value.projectId || ""} onChange={(e) => set({ projectId: e.target.value || null })}>
            <option value="">No project</option>
            {opts.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Attach to a task">
          <Select value={value.taskId || ""} onChange={(e) => set({ taskId: e.target.value || null })}>
            <option value="">No task</option>
            {opts.tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </Select>
        </Field>
        <Field label="Attach to a support request">
          <Select value={value.helpRequestId || ""} onChange={(e) => set({ helpRequestId: e.target.value || null })}>
            <option value="">No request</option>
            {opts.helps.map((h) => (
              <option key={h.id} value={h.id}>{h.title}</option>
            ))}
          </Select>
        </Field>
        <Field label="Department">
          <Select value={value.departmentId || ""} onChange={(e) => set({ departmentId: e.target.value || null })}>
            <option value="">My department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Expires" hint={value.expiry === "project" ? "Kept until the linked project is completed." : undefined}>
          <Select value={value.expiry} onChange={(e) => set({ expiry: e.target.value as ExpiryKey })}>
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" className="accent-[var(--brand)]" checked={value.downloadable} onChange={(e) => set({ downloadable: e.target.checked })} />
        <Download size={14} className="text-muted" />
        Allow downloading
        {!value.downloadable && <Pill tone="tone-neutral">stream only</Pill>}
      </label>

      {recordingId && (
        <div className="flex items-center gap-2 justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              navigator.clipboard?.writeText(`${window.location.origin}/recordings/${recordingId}`).then(() => push("Link copied", "success")).catch(() => push("Could not copy the link", "danger"));
            }}
          >
            <Link2 size={14} /> Copy link
          </Button>
          <Button size="sm" variant="primary" onClick={persist} loading={saving}>Update sharing</Button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- saving */

export type SaveInput = {
  orgId: string;
  ownerId: string;
  blob: Blob;
  mime: string;
  durationSec: number;
  kind: RecordingKind;
  title: string;
  description?: string | null;
  access: RecordingAccess;
  accessIds: string[];
  projectId?: string | null;
  taskId?: string | null;
  channelId?: string | null;
  helpRequestId?: string | null;
  departmentId?: string | null;
  roomId?: string | null;
  expiresAt?: string | null;
  downloadable: boolean;
  lines: TranscriptLine[];
  lang: string;
  speakerName?: string | null;
  speakerId?: string | null;
  onProgress?: (label: string) => void;
};

/**
 * Upload straight from the browser to Supabase Storage (never through a Next route — serverless
 * functions cap the body at a few MB), then insert the row. If the row fails the object is removed.
 */
export async function saveRecording(supabase: SB, input: SaveInput): Promise<{ id: string } | { error: string }> {
  const ext = extForMime(input.mime);
  const path = recordingPath(input.orgId, input.ownerId, ext);
  const say = input.onProgress || (() => {});

  say("Uploading video…");
  const file = new File([input.blob], `recording.${ext}`, { type: input.mime || "video/webm" });
  const up = await uploadFile(supabase, { bucket: RECORDING_BUCKET, path, file });
  if (up.error) return { error: up.error };

  say("Making a thumbnail…");
  let thumbPath: string | null = null;
  try {
    const thumb = await captureThumbnail(input.blob);
    if (thumb) {
      const tp = path.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
      const tf = new File([thumb], "thumb.jpg", { type: "image/jpeg" });
      const tu = await uploadFile(supabase, { bucket: RECORDING_BUCKET, path: tp, file: tf });
      if (!tu.error) thumbPath = tp;
    }
  } catch {
    /* a missing thumbnail must never block the save */
  }

  say("Saving…");
  const segments = input.lines.map((l) => ({ t: l.t, text: l.text, speaker: l.speaker ?? input.speakerName ?? null }));
  const flat = input.lines.map((l) => l.text).join(" ").trim();
  const { data, error } = await supabase
    .from("live_recordings")
    .insert({
      org_id: input.orgId,
      owner_id: input.ownerId,
      room_id: input.roomId ?? null,
      kind: input.kind,
      title: input.title.trim().slice(0, 200) || "Untitled recording",
      description: input.description?.trim() || null,
      storage_path: path,
      mime_type: input.mime || "video/webm",
      size_bytes: input.blob.size,
      duration_sec: Math.max(1, Math.round(input.durationSec)),
      thumbnail_path: thumbPath,
      transcript: flat || null,
      transcript_segments: segments,
      access: input.access,
      access_ids: input.accessIds,
      project_id: input.projectId ?? null,
      task_id: input.taskId ?? null,
      channel_id: input.channelId ?? null,
      help_request_id: input.helpRequestId ?? null,
      department_id: input.departmentId ?? null,
      expires_at: input.expiresAt ?? null,
      downloadable: input.downloadable,
      status: "ready",
    })
    .select("id")
    .single();

  if (error || !data) {
    await supabase.storage.from(RECORDING_BUCKET).remove(thumbPath ? [path, thumbPath] : [path]);
    return { error: error?.message || "Could not save the recording." };
  }

  if (input.lines.length) {
    await supabase.from("live_transcripts").insert(
      input.lines.slice(0, 2000).map((l) => ({
        org_id: input.orgId,
        recording_id: data.id,
        speaker_id: input.speakerId ?? input.ownerId,
        speaker_name: l.speaker ?? input.speakerName ?? null,
        lang: input.lang,
        text: l.text,
        offset_ms: Math.round(l.t * 1000),
      }))
    );
  }
  return { id: data.id };
}

/** Expiry choices offered when sharing (§39). */
export const EXPIRY_OPTIONS = [
  { key: "never", label: "Never expires" },
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "project", label: "When the project completes" },
] as const;
export type ExpiryKey = (typeof EXPIRY_OPTIONS)[number]["key"];

export function expiryToIso(key: ExpiryKey): string | null {
  if (key === "7") return new Date(Date.now() + 7 * 86400000).toISOString();
  if (key === "30") return new Date(Date.now() + 30 * 86400000).toISOString();
  return null; // "never" and "project" (cleared when the project closes) carry no timestamp
}
