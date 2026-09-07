"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Download, Upload, CheckSquare, Trash2, Pencil, Check, X, Folder, FolderKanban, Building2, ListChecks, Tag, History, Activity, ShieldCheck, ShieldX, Eye,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, useToast } from "@/components/ui";
import { ClassificationPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, bytes, cn, fmtDate, humanize, isAdminRole, isManagerPlus, type Classification } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { FOLDERS, mimeGroup, MIME_GROUP_LABEL, signedUrl, storageKey, uploadFile } from "./storage";
import { currentVersion, type FileDetailItem } from "./types";
import { ApprovalPill, ClassificationPill, FileThumb } from "./FileBits";
import { FilePreview } from "./FilePreview";

export type FileAudit = { id: number; action: string; summary: string | null; created_at: string; actor: { id: string; full_name: string; avatar_url: string | null } | null; new_value: Json | null };

export function FileDetail({ file, audit }: { file: FileDetailItem; audit: FileAudit[] }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const supabase = createClient();
  const cv = currentVersion(file);
  const previous = file.versions.filter((v) => v.id !== cv?.id);
  const manager = isManagerPlus(profile.role);
  const owner = file.owner_id === profile.id;
  const canEdit = owner || manager;
  const canDelete = owner || isAdminRole(profile.role);

  const [editingName, setEditingName] = React.useState(false);
  const [name, setName] = React.useState(file.name);
  const [tags, setTags] = React.useState(file.tags.join(", "));
  const [editingTags, setEditingTags] = React.useState(false);
  const [newVersion, setNewVersion] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(true);

  async function update(patch: { name?: string; folder?: string; classification?: Classification; tags?: string[] }, msg = "Saved") {
    const { error } = await supabase.from("files").update(patch).eq("id", file.id);
    if (error) { toast.push(error.message, "danger"); return false; }
    toast.push(msg, "success");
    router.refresh();
    return true;
  }

  async function download(path: string, fileName: string) {
    const url = await signedUrl(supabase, "files", path, 600);
    if (!url) { toast.push("Could not create download link", "danger"); return; }
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function setApproval(versionId: string, status: "approved" | "rejected" | "pending") {
    const { error } = await supabase.from("file_versions").update({ approval_status: status }).eq("id", versionId);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(status === "approved" ? "Version approved" : status === "rejected" ? "Version rejected" : "Approval reset", "success");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const paths = file.versions.map((v) => v.storage_path);
    if (paths.length) await supabase.storage.from("files").remove(paths);
    const { error } = await supabase.from("files").delete().eq("id", file.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("File deleted", "success");
    router.push("/files");
    router.refresh();
  }

  const group = mimeGroup(cv?.mime_type, file.name);

  return (
    <div className="page">
      <Link href="/files" className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]"><ArrowLeft size={14} /> Files</Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-[var(--s3)] mb-[var(--s4)]">
        <FileThumb name={file.name} mime={cv?.mime_type} path={cv?.storage_path} size={64} rounded="rounded-[var(--radius)]" />
        <div className="min-w-0 flex-1">
          {editingName ? (
            <form
              className="flex items-center gap-2"
              onSubmit={async (e) => { e.preventDefault(); if (name.trim() && (await update({ name: name.trim() }, "Renamed"))) setEditingName(false); }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="max-w-md" />
              <Button type="submit" variant="primary" size="sm" icon aria-label="Save"><Check size={15} /></Button>
              <Button type="button" variant="ghost" size="sm" icon onClick={() => { setName(file.name); setEditingName(false); }} aria-label="Cancel"><X size={15} /></Button>
            </form>
          ) : (
            <h1 className="h1 break-words flex items-center gap-2 flex-wrap">
              {file.name}
              <span className="pill tone-neutral num">v{file.current_version}</span>
              {canEdit && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditingName(true)} aria-label="Rename"><Pencil size={14} /></button>}
            </h1>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-1.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><Folder size={12} />{canEdit ? (
              <Select value={file.folder} onChange={(e) => update({ folder: e.target.value }, "Moved")} className="!h-6 !w-auto !py-0 !text-xs !pr-6 inline-block">
                {[...FOLDERS, ...(FOLDERS.includes(file.folder as (typeof FOLDERS)[number]) ? [] : [file.folder])].map((f) => <option key={f} value={f}>{f}</option>)}
              </Select>
            ) : file.folder}</span>
            {file.project && <Link href={`/projects/${file.project.id}`} className="inline-flex items-center gap-1 hover:underline"><FolderKanban size={12} />{file.project.name}</Link>}
            {file.department && <Link href={`/departments`} className="inline-flex items-center gap-1 hover:underline"><Building2 size={12} />{file.department.name}</Link>}
            {file.task && <Link href={`/tasks/${file.task.id}`} className="inline-flex items-center gap-1 hover:underline"><ListChecks size={12} />{file.task.title}</Link>}
            <span>· {MIME_GROUP_LABEL[group]}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {canEdit ? (
              <ClassificationPicker value={file.classification} onChange={(c) => update({ classification: c }, "Classification updated")} className="!h-7 !w-auto !text-xs !pr-7" />
            ) : <ClassificationPill value={file.classification} size="lg" />}
            {cv && <ApprovalPill value={cv.approval_status} size="lg" />}
            <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Avatar name={file.owner?.full_name} src={file.owner?.avatar_url} size={18} />{file.owner?.full_name || "—"} · updated {ago(file.updated_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {cv && <Button variant="primary" onClick={() => download(cv.storage_path, file.name)}><Download size={15} /> Download</Button>}
          <Button onClick={() => setNewVersion(true)}><Upload size={15} /> New version</Button>
          <Link href={`/approvals?new=1&file=${file.id}&title=${encodeURIComponent(`Approve ${file.name}`)}`} className="btn btn-secondary"><CheckSquare size={15} /> Request approval</Link>
          {canDelete && <Button variant="ghost" icon onClick={() => setConfirmDelete(true)} aria-label="Delete" className="text-danger"><Trash2 size={15} /></Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_377px] gap-[var(--s4)] items-start">
        {/* Left: preview + versions */}
        <div className="space-y-[var(--s4)] min-w-0">
          <Card>
            <CardHeader title="Preview" subtitle={cv ? `v${cv.version} · ${bytes(cv.size_bytes)}` : undefined} action={<Button variant="ghost" size="sm" onClick={() => setShowPreview((s) => !s)}><Eye size={14} /> {showPreview ? "Hide" : "Show"}</Button>} />
            {showPreview && <div className="px-[var(--s4)] pb-[var(--s4)]">{cv ? <FilePreview name={file.name} mime={cv.mime_type} path={cv.storage_path} /> : <EmptyState title="No version uploaded" />}</div>}
          </Card>

          <Card>
            <CardHeader title="Previous versions" subtitle={previous.length ? `${previous.length} earlier version${previous.length > 1 ? "s" : ""}` : "This is the first version"} action={<History size={15} className="text-muted" />} />
            {previous.length === 0 ? (
              <EmptyState title="No previous versions" hint="Upload a new version and the history will appear here." className="py-[var(--s4)]" />
            ) : (
              <div className="divide-y border-t">
                {previous.map((v) => (
                  <div key={v.id} className="px-[var(--s4)] py-2.5 flex items-center gap-3">
                    <span className="pill tone-muted num">v{v.version}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{v.note || <span className="text-muted">No note</span>}</div>
                      <div className="text-[11px] text-muted flex items-center gap-1.5 flex-wrap">
                        <Avatar name={v.uploader?.full_name} src={v.uploader?.avatar_url} size={14} />{v.uploader?.full_name || "—"} · {fmtDate(v.created_at, true)} · {bytes(v.size_bytes)}
                        <ApprovalPill value={v.approval_status} />
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" icon onClick={() => download(v.storage_path, file.name)} aria-label="Download"><Download size={14} /></Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right: current version, tags, activity */}
        <div className="space-y-[var(--s4)] min-w-0">
          <Card>
            <CardHeader title="Current version" subtitle={cv ? `v${cv.version}` : "—"} />
            {cv ? (
              <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2 text-sm">
                <Row label="Status"><ApprovalPill value={cv.approval_status} /></Row>
                <Row label="Size"><span className="num">{bytes(cv.size_bytes) || "—"}</span></Row>
                <Row label="Type"><span className="truncate">{cv.mime_type || "—"}</span></Row>
                <Row label="Uploaded by"><span className="inline-flex items-center gap-1.5"><Avatar name={cv.uploader?.full_name} src={cv.uploader?.avatar_url} size={18} />{cv.uploader?.full_name || "—"}</span></Row>
                <Row label="Date">{fmtDate(cv.created_at, true)}</Row>
                {cv.note && <Row label="Note"><span className="text-2">{cv.note}</span></Row>}
                {manager && (
                  <div className="flex gap-2 pt-2">
                    {cv.approval_status !== "approved" && <Button size="sm" variant="success" onClick={() => setApproval(cv.id, "approved")}><ShieldCheck size={14} /> Approve</Button>}
                    {cv.approval_status !== "rejected" && <Button size="sm" variant="danger" onClick={() => setApproval(cv.id, "rejected")}><ShieldX size={14} /> Reject</Button>}
                    {cv.approval_status !== "pending" && <Button size="sm" variant="ghost" onClick={() => setApproval(cv.id, "pending")}>Reset</Button>}
                  </div>
                )}
              </div>
            ) : <EmptyState title="No version yet" className="py-[var(--s4)]" />}
          </Card>

          <Card>
            <CardHeader title="Tags" action={canEdit && !editingTags ? <Button size="sm" variant="ghost" icon onClick={() => setEditingTags(true)} aria-label="Edit tags"><Pencil size={14} /></Button> : undefined} />
            <div className="px-[var(--s4)] pb-[var(--s4)]">
              {editingTags ? (
                <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await update({ tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }, "Tags updated")) setEditingTags(false); }}>
                  <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" autoFocus />
                  <Button type="submit" variant="primary" size="sm" icon aria-label="Save"><Check size={15} /></Button>
                  <Button type="button" variant="ghost" size="sm" icon onClick={() => { setTags(file.tags.join(", ")); setEditingTags(false); }} aria-label="Cancel"><X size={15} /></Button>
                </form>
              ) : file.tags.length ? (
                <div className="flex flex-wrap gap-1.5">{file.tags.map((t) => <Link key={t} href={`/files?q=${encodeURIComponent(t)}`} className="pill tone-neutral"><Tag size={10} />{t}</Link>)}</div>
              ) : <div className="text-sm text-muted">No tags</div>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity" action={<Activity size={15} className="text-muted" />} />
            <div className="px-[var(--s4)] pb-[var(--s4)]">
              {manager && audit.length > 0 ? (
                <ol className="relative border-l ml-2 space-y-3">
                  {audit.map((a) => (
                    <li key={a.id} className="pl-4">
                      <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-[var(--brand)] ring-2 ring-[var(--bg-elev)]" />
                      <div className="text-sm">{humanize(a.action.replace("file.", ""))}{a.summary ? <span className="text-muted"> · {a.summary}</span> : null}</div>
                      <div className="text-[11px] text-muted inline-flex items-center gap-1.5 mt-0.5"><Avatar name={a.actor?.full_name} src={a.actor?.avatar_url} size={14} />{a.actor?.full_name || "System"} · {ago(a.created_at)}</div>
                    </li>
                  ))}
                </ol>
              ) : (
                <ol className="relative border-l ml-2 space-y-3">
                  {file.versions.map((v) => (
                    <li key={v.id} className="pl-4">
                      <span className={cn("absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-[var(--bg-elev)]", v.id === cv?.id ? "bg-[var(--brand)]" : "bg-[var(--line-strong)]")} />
                      <div className="text-sm">Version {v.version} uploaded{v.note ? <span className="text-muted"> · {v.note}</span> : null}</div>
                      <div className="text-[11px] text-muted inline-flex items-center gap-1.5 mt-0.5"><Avatar name={v.uploader?.full_name} src={v.uploader?.avatar_url} size={14} />{v.uploader?.full_name || "—"} · {ago(v.created_at)}</div>
                    </li>
                  ))}
                  <li className="pl-4">
                    <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-[var(--line-strong)] ring-2 ring-[var(--bg-elev)]" />
                    <div className="text-sm">File created</div>
                    <div className="text-[11px] text-muted mt-0.5">{ago(file.created_at)}</div>
                  </li>
                </ol>
              )}
            </div>
          </Card>
        </div>
      </div>

      <NewVersionModal open={newVersion} onClose={() => setNewVersion(false)} file={file} />

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete file" width={440} footer={<><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" onClick={remove} loading={busy}>Delete permanently</Button></>}>
        <p className="text-sm">This removes <strong>{file.name}</strong> and all {file.versions.length} version{file.versions.length === 1 ? "" : "s"} from storage. This cannot be undone.</p>
      </Modal>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted text-xs shrink-0 w-24">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

function NewVersionModal(props: { open: boolean; onClose: () => void; file: FileDetailItem }) {
  // Remount the form on every open so its state starts fresh.
  return props.open ? <NewVersionForm {...props} /> : null;
}

function NewVersionForm({ open, onClose, file }: { open: boolean; onClose: () => void; file: FileDetailItem }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [picked, setPicked] = React.useState<File | null>(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function submit() {
    if (!picked || !profile.org_id) return;
    setBusy(true);
    const supabase = createClient();
    const path = storageKey(profile.org_id, file.folder, picked.name);
    const up = await uploadFile(supabase, { bucket: "files", path, file: picked });
    if (up.error) { setBusy(false); toast.push(up.error, "danger"); return; }
    const maxV = Math.max(file.current_version, ...file.versions.map((v) => v.version));
    const { error } = await supabase.from("file_versions").insert({ file_id: file.id, version: maxV + 1, storage_path: path, size_bytes: picked.size, mime_type: up.contentType, uploaded_by: profile.id, note: note || null });
    setBusy(false);
    if (error) { await supabase.storage.from("files").remove([path]); toast.push(error.message, "danger"); return; }
    toast.push(`Version ${maxV + 1} uploaded`, "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Upload new version of ${file.name}`} width={520} footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" onClick={submit} loading={busy} disabled={!picked}><Upload size={15} /> Upload v{Math.max(file.current_version, ...file.versions.map((v) => v.version)) + 1}</Button></>}>
      <div className="space-y-3">
        <button type="button" onClick={() => inputRef.current?.click()} className="w-full rounded-[var(--radius)] border-2 border-dashed border-[var(--line-strong)] hover:bg-[var(--neutral-bg)] p-[var(--s4)] text-center">
          <Upload size={18} className="mx-auto text-muted mb-1.5" />
          <div className="text-sm font-medium">{picked ? picked.name : "Choose the updated file"}</div>
          <div className="text-xs text-muted mt-0.5">{picked ? bytes(picked.size) : "The name stays the same; only the version increments."}</div>
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => { setPicked(e.target.files?.[0] || null); e.target.value = ""; }} />
        </button>
        <Field label="What changed?">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Updated Q3 numbers, fixed logo placement" />
        </Field>
      </div>
    </Modal>
  );
}
