"use client";

import * as React from "react";
import { Upload, X, GitBranch, FilePlus2, AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Modal, Select, useToast, Spinner } from "@/components/ui";
import { ClassificationPicker, DepartmentPicker, ProjectPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { bytes, cn, type Classification } from "@/lib/utils";
import { FOLDERS, FileTypeIcon, mimeGroup, normalizeName, storageKey, uploadFile } from "./storage";
import { currentVersion, type FileListItem } from "./types";

type Staged = {
  id: string;
  file: File;
  /** Explicit user choice for a detected duplicate (keyed by the duplicate's id). */
  choice?: { dupId: string; asVersion: boolean };
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  existing: FileListItem[];
  projects: { id: string; name: string }[];
  defaults?: { folder?: string; project_id?: string; department_id?: string; task_id?: string | null };
  onDone: () => void;
};

/** Multi-file upload with "Final_FINAL" de-duplication → new version. State resets on every open (inner form remounts). */
export function UploadModal(props: Props) {
  return props.open ? <UploadForm {...props} /> : null;
}

function UploadForm({ open, onClose, existing, projects, defaults, onDone }: Props) {
  const { profile } = useSession();
  const toast = useToast();
  const [folder, setFolder] = React.useState(defaults?.folder || "General");
  const [projectId, setProjectId] = React.useState(defaults?.project_id || "");
  const [departmentId, setDepartmentId] = React.useState(defaults?.department_id || profile.department_id || "");
  const [classification, setClassification] = React.useState<Classification>("internal");
  const [tags, setTags] = React.useState("");
  const [note, setNote] = React.useState("");
  const [staged, setStaged] = React.useState<Staged[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const findDuplicate = React.useCallback(
    (name: string) => {
      const norm = normalizeName(name);
      if (!norm) return undefined;
      return existing.find((e) => e.folder === folder && (e.project_id || "") === (projectId || "") && normalizeName(e.name) === norm);
    },
    [existing, folder, projectId]
  );

  // Duplicates are derived from the current folder/project so they re-detect automatically.
  const items = React.useMemo(
    () => staged.map((it) => {
      const duplicate = findDuplicate(it.file.name);
      const asVersion = duplicate ? (it.choice?.dupId === duplicate.id ? it.choice.asVersion : true) : false;
      return { ...it, duplicate, asVersion };
    }),
    [staged, findDuplicate]
  );

  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list);
    setStaged((s) => [...s, ...arr.map((file) => ({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`, file, status: "pending" as const }))]);
  };
  const choose = (id: string, dupId: string, asVersion: boolean) => setStaged((s) => s.map((x) => (x.id === id ? { ...x, choice: { dupId, asVersion } } : x)));
  const mark = (id: string, patch: Partial<Staged>) => setStaged((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function submit() {
    if (!items.length || !profile.org_id) return;
    setBusy(true);
    const supabase = createClient();
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    let ok = 0;
    for (const it of items) {
      if (it.status === "done") { ok++; continue; }
      mark(it.id, { status: "uploading" });
      const path = storageKey(profile.org_id, folder, it.file.name);
      const up = await uploadFile(supabase, { bucket: "files", path, file: it.file });
      if (up.error) { mark(it.id, { status: "error", error: up.error }); continue; }
      let error: string | null = null;
      if (it.asVersion && it.duplicate) {
        const cv = currentVersion(it.duplicate);
        const nextVersion = Math.max(it.duplicate.current_version, cv?.version || 0) + 1;
        const { error: e } = await supabase.from("file_versions").insert({
          file_id: it.duplicate.id, version: nextVersion, storage_path: path, size_bytes: it.file.size, mime_type: up.contentType, uploaded_by: profile.id, note: note || null,
        });
        error = e?.message || null;
      } else {
        const { data: fileRow, error: e1 } = await supabase
          .from("files")
          .insert({
            org_id: profile.org_id, name: it.file.name, folder, project_id: projectId || null, department_id: departmentId || null,
            task_id: defaults?.task_id || null, classification, owner_id: profile.id, tags: tagList,
          })
          .select("id")
          .single();
        if (e1 || !fileRow) error = e1?.message || "Could not create file";
        else {
          const { error: e2 } = await supabase.from("file_versions").insert({
            file_id: fileRow.id, version: 1, storage_path: path, size_bytes: it.file.size, mime_type: up.contentType, uploaded_by: profile.id, note: note || null,
          });
          error = e2?.message || null;
        }
      }
      if (error) {
        await supabase.storage.from("files").remove([path]);
        mark(it.id, { status: "error", error });
      } else {
        ok++;
        mark(it.id, { status: "done" });
      }
    }
    setBusy(false);
    if (ok === items.length) {
      toast.push(ok === 1 ? "File uploaded" : `${ok} files uploaded`, "success");
      onDone();
    } else {
      toast.push(`${ok}/${items.length} uploaded — check the errors`, "danger");
    }
  }

  const versions = items.filter((s) => s.asVersion && s.duplicate).length;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Upload files"
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!items.length}>
            <Upload size={15} /> Upload {items.length ? `${items.length} file${items.length > 1 ? "s" : ""}` : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={cn("rounded-[var(--radius)] border-2 border-dashed p-[var(--s4)] text-center cursor-pointer transition-colors", drag ? "border-[var(--brand-2)] bg-[color-mix(in_oklab,var(--brand)_8%,transparent)]" : "border-[var(--line-strong)] hover:bg-[var(--neutral-bg)]")}
        >
          <Upload size={20} className="mx-auto text-muted mb-2" />
          <div className="text-sm font-medium">Drop files here or click to choose</div>
          <div className="text-xs text-muted mt-1">Up to 50 MB each. Re-uploading a known file adds a new version automatically.</div>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        </div>

        {items.length > 0 && (
          <div className="card divide-y">
            {items.map((it) => (
              <div key={it.id} className="px-3 py-2 flex items-start gap-3">
                <span className="mt-0.5 text-muted"><FileTypeIcon group={mimeGroup(it.file.type, it.file.name)} size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm truncate">{it.file.name}</span>
                    <span className="text-[11px] text-muted num shrink-0">{bytes(it.file.size)}</span>
                    {it.status === "uploading" && <Spinner className="ml-auto" />}
                    {it.status === "done" && <CheckCircle2 size={15} className="ml-auto text-success" />}
                    {it.status === "error" && <AlertCircle size={15} className="ml-auto text-danger" />}
                  </div>
                  {it.error && <div className="text-[11px] text-danger mt-0.5">{it.error}</div>}
                  {it.duplicate && it.status === "pending" && (
                    <div className="mt-1.5 rounded-[var(--radius-sm)] tone-warn px-2.5 py-2 text-xs">
                      <div className="font-medium">Looks like “{it.duplicate.name}” (v{it.duplicate.current_version}) — add as a new version?</div>
                      <div className="flex gap-1.5 mt-1.5">
                        <button type="button" onClick={() => choose(it.id, it.duplicate!.id, true)} className={cn("btn btn-xs", it.asVersion ? "btn-primary" : "btn-secondary")}><GitBranch size={12} /> New version v{it.duplicate.current_version + 1}</button>
                        <button type="button" onClick={() => choose(it.id, it.duplicate!.id, false)} className={cn("btn btn-xs", !it.asVersion ? "btn-primary" : "btn-secondary")}><FilePlus2 size={12} /> Separate file</button>
                      </div>
                    </div>
                  )}
                </div>
                {it.status === "pending" && (
                  <button type="button" className="btn btn-ghost btn-xs btn-icon" onClick={() => setStaged((s) => s.filter((x) => x.id !== it.id))} aria-label="Remove"><X size={13} /></button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Folder">
            <Select value={folder} onChange={(e) => setFolder(e.target.value)}>
              {FOLDERS.map((f) => <option key={f} value={f}>{f}</option>)}
            </Select>
          </Field>
          <Field label="Project">
            <ProjectPicker value={projectId} onChange={setProjectId} projects={projects} />
          </Field>
          <Field label="Department">
            <DepartmentPicker value={departmentId} onChange={setDepartmentId} />
          </Field>
          <Field label="Classification">
            <ClassificationPicker value={classification} onChange={setClassification} />
          </Field>
          <Field label="Tags" hint="Comma separated" className="sm:col-span-2">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="investor, q3, brand" />
          </Field>
          <Field label={versions ? "Version note" : "Note"} className="sm:col-span-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={versions ? "What changed in this version?" : "Optional context for this upload"} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
