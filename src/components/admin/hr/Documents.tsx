"use client";

import * as React from "react";
import { Eye, EyeOff, ExternalLink, FileText, FileUp, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Spinner, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { bytes, fmtDate } from "@/lib/utils";
import { mimeGroup, FileTypeIcon, signedUrl, uploadFile } from "@/components/files/storage";
import { Note, PersonLine, Switch } from "../AdminBits";
import { DOC_KIND_LABEL, DOC_KINDS, safeName, type EmployeeDocument, type HrData } from "./lib";

/** Signed URL for a private `hr` object (cached). */
export async function openHrDocument(path: string) {
  const url = await signedUrl(createClient(), "hr", path, 600);
  if (url) window.open(url, "_blank", "noopener");
  return !!url;
}

export function DocumentsView({ data, initialUser }: { data: HrData; initialUser?: string }) {
  const toast = useToast();
  const [userId, setUserId] = React.useState(initialUser || "");
  const [docs, setDocs] = React.useState<EmployeeDocument[] | null>(null);
  const [upload, setUpload] = React.useState(false);
  const person = data.people.find((p) => p.id === userId);

  const load = React.useCallback(async (uid: string) => {
    const { data: rows, error } = await createClient().from("employee_documents").select("*").eq("user_id", uid).order("created_at", { ascending: false });
    if (error) { toast.push(error.message, "danger"); return; }
    setDocs(rows || []);
  }, [toast]);

  React.useEffect(() => {
    if (!userId) { const t = setTimeout(() => setDocs(null), 0); return () => clearTimeout(t); }
    let alive = true;
    createClient().from("employee_documents").select("*").eq("user_id", userId).order("created_at", { ascending: false }).then(({ data: rows }) => { if (alive) setDocs(rows || []); });
    return () => { alive = false; };
  }, [userId]);

  async function toggle(d: EmployeeDocument) {
    const { error } = await createClient().from("employee_documents").update({ visible_to_employee: !d.visible_to_employee }).eq("id", d.id);
    if (error) { toast.push(error.message, "danger"); return; }
    setDocs((s) => (s || []).map((x) => (x.id === d.id ? { ...x, visible_to_employee: !d.visible_to_employee } : x)));
  }
  async function remove(d: EmployeeDocument) {
    if (!window.confirm(`Delete “${d.name}”? This cannot be undone.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("employee_documents").delete().eq("id", d.id);
    if (error) { toast.push(error.message, "danger"); return; }
    await supabase.storage.from("hr").remove([d.storage_path]);
    setDocs((s) => (s || []).filter((x) => x.id !== d.id));
    toast.push("Document deleted", "success");
  }

  return (
    <div className="space-y-[var(--s4)]">
      <Card>
        <CardHeader title="Employee documents" subtitle="Offer letters, contracts, ID proofs, certificates, payslips. Stored privately; each file can be shown to the employee or kept HR-only." action={person ? <Button size="sm" variant="primary" onClick={() => setUpload(true)}><FileUp size={14} /> <span className="hidden sm:inline">Upload</span></Button> : undefined} />
        <div className="px-[var(--s4)] pb-3"><PersonPicker value={userId} onChange={setUserId} placeholder="Choose a person to see their documents…" /></div>
        {!userId ? (
          <EmptyState icon={<FileText size={18} />} title="Pick a person" hint="Documents are listed per employee." className="py-[var(--s4)]" />
        ) : docs === null ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <DocumentList docs={docs} canManage onToggle={toggle} onDelete={remove} emptyAction={<Button size="sm" variant="primary" onClick={() => setUpload(true)}><FileUp size={14} /> Upload the first document</Button>} />
        )}
      </Card>
      {person && <UploadDocumentModal open={upload} userId={person.id} userName={person.full_name} onClose={() => setUpload(false)} onUploaded={() => load(person.id)} />}
    </div>
  );
}

export function DocumentList({ docs, canManage, onToggle, onDelete, emptyAction, emptyHint }: { docs: EmployeeDocument[]; canManage?: boolean; onToggle?: (d: EmployeeDocument) => void; onDelete?: (d: EmployeeDocument) => void; emptyAction?: React.ReactNode; emptyHint?: string }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  async function open(d: EmployeeDocument) {
    setBusy(d.id);
    const ok = await openHrDocument(d.storage_path);
    setBusy(null);
    if (!ok) toast.push("Could not open the document", "danger");
  }
  if (docs.length === 0) return <EmptyState icon={<FileText size={18} />} title="No documents" hint={emptyHint || "Nothing uploaded yet."} className="py-[var(--s4)]" action={emptyAction} />;
  return (
    <div className="divide-y border-t">
      {docs.map((d) => (
        <div key={d.id} className="flex items-center gap-3 px-[var(--s4)] py-2.5">
          <span className="w-8 h-8 rounded-[var(--radius-sm)] sunken inline-flex items-center justify-center text-muted shrink-0"><FileTypeIcon group={mimeGroup(d.mime_type, d.name)} size={15} /></span>
          <button type="button" onClick={() => open(d)} disabled={busy === d.id} className="min-w-0 flex-1 text-left">
            <div className="text-sm font-medium truncate hover:underline inline-flex items-center gap-1">{d.name} <ExternalLink size={11} className="text-muted" /></div>
            <div className="text-[11px] text-muted truncate">{DOC_KIND_LABEL[d.kind] || d.kind}{d.size_bytes ? ` · ${bytes(d.size_bytes)}` : ""} · {fmtDate(d.created_at)}{d.uploaded_by && <> · <PersonChip id={d.uploaded_by} size={12} /></>}</div>
          </button>
          {canManage && onToggle ? (
            <button type="button" onClick={() => onToggle(d)} className={`pill cursor-pointer ${d.visible_to_employee ? "tone-success" : "tone-muted"}`} title={d.visible_to_employee ? "Visible to the employee — click to hide" : "HR only — click to show to the employee"}>{d.visible_to_employee ? <Eye size={10} /> : <EyeOff size={10} />} {d.visible_to_employee ? "Employee can see" : "HR only"}</button>
          ) : (
            <Pill tone={d.visible_to_employee ? "tone-success" : "tone-muted"}>{d.visible_to_employee ? "Visible to you" : "HR only"}</Pill>
          )}
          {canManage && onDelete && <Button size="xs" variant="ghost" icon className="text-danger" onClick={() => onDelete(d)} aria-label="Delete"><Trash2 size={13} /></Button>}
        </div>
      ))}
    </div>
  );
}

export function UploadDocumentModal({ open, userId, userName, selfService, onClose, onUploaded }: { open: boolean; userId: string; userName: string; selfService?: boolean; onClose: () => void; onUploaded?: () => void }) {
  const toast = useToast();
  const { profile } = useSession();
  const [file, setFile] = React.useState<File | null>(null);
  const [kind, setKind] = React.useState("other");
  const [name, setName] = React.useState("");
  const [visible, setVisible] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  async function upload() {
    if (!file || !profile.org_id) return;
    if (file.size > 25 * 1024 * 1024) { toast.push("Files must be under 25 MB", "danger"); return; }
    setBusy(true);
    const supabase = createClient();
    const path = `${userId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const up = await uploadFile(supabase, { bucket: "hr", path, file });
    if (up.error) { setBusy(false); toast.push(up.error, "danger"); return; }
    const { error } = await supabase.from("employee_documents").insert({ org_id: profile.org_id, user_id: userId, kind, name: name.trim() || file.name, storage_path: path, size_bytes: file.size, mime_type: up.contentType, uploaded_by: profile.id, visible_to_employee: selfService ? true : visible });
    setBusy(false);
    if (error) { await supabase.storage.from("hr").remove([path]); toast.push(error.message, "danger"); return; }
    toast.push("Document uploaded", "success");
    setFile(null); setName(""); setKind("other"); setVisible(true);
    onClose();
    onUploaded?.();
  }

  return (
    <Modal open={open} onClose={onClose} title={selfService ? "Upload a document" : `Upload for ${userName}`} width={480} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!file} onClick={upload}><Upload size={15} /> Upload</Button></>}>
      <div className="space-y-3">
        {!selfService && <PersonLine id={userId} name={userName} size={28} />}
        <Field label="File"><input type="file" onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f && !name) setName(f.name.replace(/\.[a-z0-9]{1,6}$/i, "")); }} className="input !py-1.5 file:mr-3 file:btn file:btn-secondary file:btn-xs" /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Kind"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{DOC_KINDS.map((k) => <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>)}</Select></Field>
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={file?.name || "Document name"} /></Field>
        </div>
        {selfService ? (
          <Note tone="info">Documents you upload are visible to you and to HR.</Note>
        ) : (
          <Switch on={visible} onChange={setVisible} label={visible ? "Visible to the employee" : "HR only"} hint="You can change this later. Employees see everything recorded about them except HR-only files." />
        )}
      </div>
    </Modal>
  );
}
