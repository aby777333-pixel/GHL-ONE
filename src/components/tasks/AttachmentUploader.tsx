"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileText, Paperclip, UploadCloud } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { Button, EmptyState, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, bytes, cn, type FileRow } from "@/lib/utils";

export type FileVersionLite = { id: string; version: number; storage_path: string; size_bytes: number | null; mime_type: string | null; created_at: string };
export type FileWithVersions = FileRow & { file_versions: FileVersionLite[] };

/**
 * Upload a file to the `files` bucket and register it in `files` + `file_versions` (v1).
 * Path: {scope}/{scopeId}/{timestamp}-{filename}. Reusable by tasks, projects, departments.
 */
export async function uploadAttachment(
  supabase: SupabaseClient<Database>,
  opts: { file: File; orgId: string; userId: string; taskId?: string | null; projectId?: string | null; departmentId?: string | null; folder?: string; note?: string }
): Promise<{ id: string } | { error: string }> {
  const { file, orgId, userId } = opts;
  const scope = opts.taskId ? `tasks/${opts.taskId}` : opts.projectId ? `projects/${opts.projectId}` : opts.departmentId ? `departments/${opts.departmentId}` : `users/${userId}`;
  const safeName = file.name.replace(/[^\w.\-()+ ]+/g, "_");
  const path = `${scope}/${Date.now()}-${safeName}`;
  // Storage checks the Blob's own mime type — re-wrap to be explicit.
  const blob = new File([file], safeName, { type: file.type || "application/octet-stream" });
  const up = await supabase.storage.from("files").upload(path, blob, { upsert: false, contentType: blob.type });
  if (up.error) return { error: up.error.message };

  const { data: row, error: fErr } = await supabase
    .from("files")
    .insert({
      org_id: orgId,
      name: file.name,
      folder: opts.folder || (opts.taskId ? "Tasks" : opts.projectId ? "Projects" : opts.departmentId ? "Departments" : "General"),
      task_id: opts.taskId || null,
      project_id: opts.projectId || null,
      department_id: opts.departmentId || null,
      owner_id: userId,
      current_version: 1,
    })
    .select("id")
    .single();
  if (fErr || !row) {
    await supabase.storage.from("files").remove([path]);
    return { error: fErr?.message || "Could not register file" };
  }
  const { error: vErr } = await supabase.from("file_versions").insert({
    file_id: row.id,
    version: 1,
    storage_path: path,
    size_bytes: file.size,
    mime_type: blob.type,
    uploaded_by: userId,
    note: opts.note || null,
  });
  if (vErr) return { error: vErr.message };
  return { id: row.id };
}

export async function signedUrlFor(supabase: SupabaseClient<Database>, storagePath: string) {
  const { data, error } = await supabase.storage.from("files").createSignedUrl(storagePath, 120);
  if (error || !data) return null;
  return data.signedUrl;
}

function currentVersion(f: FileWithVersions) {
  return [...(f.file_versions || [])].sort((a, b) => b.version - a.version)[0] || null;
}

/** Drop zone + button. Calls `onUploaded` after each successful file. */
export function AttachmentUploader({ taskId, projectId, departmentId, onUploaded, compact, className }: { taskId?: string | null; projectId?: string | null; departmentId?: string | null; onUploaded?: (id: string) => void; compact?: boolean; className?: string }) {
  const { profile } = useSession();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFiles(list: FileList | null) {
    if (!list || !list.length) return;
    setBusy(true);
    const supabase = createClient();
    let ok = 0;
    for (const file of Array.from(list)) {
      const res = await uploadAttachment(supabase, { file, orgId: profile.org_id!, userId: profile.id, taskId, projectId, departmentId });
      if ("error" in res) toast.push(`${file.name}: ${res.error}`, "danger");
      else {
        ok++;
        onUploaded?.(res.id);
      }
    }
    setBusy(false);
    if (ok) {
      toast.push(ok === 1 ? "File uploaded" : `${ok} files uploaded`, "success");
      router.refresh();
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-sm)] border border-dashed transition-colors",
        over ? "border-[var(--brand-2)] bg-[var(--info-bg)]" : "border-[var(--line-strong)]",
        compact ? "px-3 py-2" : "px-4 py-5",
        className
      )}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void handleFiles(e.dataTransfer.files); }}
    >
      <div className={cn("flex items-center gap-3", compact ? "" : "flex-col text-center")}>
        <UploadCloud size={compact ? 16 : 22} className="text-muted shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm">{compact ? "Drop files here or" : "Drag & drop files here"}</div>
          {!compact && <div className="text-xs text-muted mt-0.5">Up to 50 MB each · stored in the company file library</div>}
        </div>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => inputRef.current?.click()}>
          <Paperclip size={14} /> {compact ? "Browse" : "Choose files"}
        </Button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
      </div>
    </div>
  );
}

/** List of files with signed download links. */
export function AttachmentList({ files, emptyHint, showLink = true }: { files: FileWithVersions[]; emptyHint?: string; showLink?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function download(f: FileWithVersions) {
    const v = currentVersion(f);
    if (!v) return toast.push("No version stored for this file", "danger");
    setBusy(f.id);
    const url = await signedUrlFor(createClient(), v.storage_path);
    setBusy(null);
    if (!url) return toast.push("Could not create a download link", "danger");
    window.open(url, "_blank", "noopener");
  }

  if (!files.length) return <EmptyState icon={<Paperclip size={18} />} title="No files yet" hint={emptyHint || "Upload documents, designs or references so everyone works from the same version."} />;
  return (
    <ul className="divide-y">
      {files.map((f) => {
        const v = currentVersion(f);
        return (
          <li key={f.id} className="flex items-center gap-3 py-2.5 px-1 row-hover rounded-[var(--radius-sm)]">
            <span className="w-8 h-8 rounded-[var(--radius-sm)] sunken flex items-center justify-center text-muted shrink-0"><FileText size={15} /></span>
            <div className="min-w-0 flex-1">
              {showLink ? <Link href={`/files/${f.id}`} className="text-sm truncate block hover:underline">{f.name}</Link> : <div className="text-sm truncate">{f.name}</div>}
              <div className="text-[11px] text-muted truncate">v{f.current_version}{v?.size_bytes ? ` · ${bytes(v.size_bytes)}` : ""} · {ago(f.updated_at)}</div>
            </div>
            <Button size="sm" variant="ghost" icon aria-label="Download" loading={busy === f.id} onClick={() => void download(f)}>
              <Download size={15} />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
