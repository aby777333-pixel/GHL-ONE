"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Briefcase, FileUp, Laptop, PackagePlus, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { fmtDate, humanize, type Profile, type Tables } from "@/lib/utils";
import { DocumentList, UploadDocumentModal } from "@/components/admin/hr/Documents";
import { ASSET_KIND_LABEL, ASSET_KINDS, ASSET_REQUEST_TONE, EMPLOYMENT_LABEL, WORK_MODE_LABEL, type EmployeeDocument } from "@/components/admin/hr/lib";

/** Whether the signed-in user is HR (`is_hr()` in 0012_hr_ops.sql). Resolved once per mount. */
export function useIsHr() {
  const [hr, setHr] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let alive = true;
    createClient().rpc("is_hr").then(({ data }) => { if (alive) setHr(!!data); });
    return () => { alive = false; };
  }, []);
  return hr;
}

/* ------------------------------------------------------------ Employment */
export function EmploymentCard({ person }: { person: Profile }) {
  const [shift, setShift] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!person.shift_id) return;
    let alive = true;
    createClient().from("shifts").select("name,start_time,end_time").eq("id", person.shift_id).maybeSingle().then(({ data }) => { if (alive && data) setShift(`${data.name} · ${data.start_time.slice(0, 5)}–${data.end_time.slice(0, 5)}`); });
    return () => { alive = false; };
  }, [person.shift_id]);
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Employee code", value: person.employee_code || "—" },
    { label: "Type", value: EMPLOYMENT_LABEL[person.employment_type] || humanize(person.employment_type) },
    { label: "Work mode", value: WORK_MODE_LABEL[person.work_mode] || humanize(person.work_mode) },
    { label: "Location", value: person.location || "—" },
    { label: "Shift", value: person.shift_id ? shift || "…" : person.working_hours || "Default hours" },
    { label: "Joined", value: person.joined_at ? fmtDate(person.joined_at) : "—" },
    ...(person.probation_ends_on ? [{ label: "Probation ends", value: fmtDate(person.probation_ends_on) }] : []),
  ];
  return (
    <Card>
      <CardHeader title="Employment" subtitle="Maintained by HR." action={<Briefcase size={15} className="text-muted" />} />
      <div className="px-[var(--s4)] pb-[var(--s4)]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 py-1 border-b border-dashed last:border-0 text-sm"><span className="text-xs text-muted">{r.label}</span><span className="num text-right truncate">{r.value}</span></div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- Assets */
type Assignment = Tables<"asset_assignments"> & { asset: Pick<Tables<"assets">, "id" | "tag" | "kind" | "name" | "serial"> | null };
type AssetRequest = Tables<"asset_requests">;

async function fetchAssets(userId: string) {
  const supabase = createClient();
  const [{ data: a }, { data: r }] = await Promise.all([
    supabase.from("asset_assignments").select("*, asset:assets(id,tag,kind,name,serial)").eq("user_id", userId).is("returned_at", null).order("assigned_at", { ascending: false }),
    supabase.from("asset_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);
  return { items: (a || []) as Assignment[], requests: (r || []) as AssetRequest[] };
}

export function MyAssetsCard({ userId, self }: { userId: string; self: boolean }) {
  const toast = useToast();
  const [items, setItems] = React.useState<Assignment[] | null>(null);
  const [requests, setRequests] = React.useState<AssetRequest[]>([]);
  const [asking, setAsking] = React.useState(false);

  const load = React.useCallback(() => fetchAssets(userId).then((x) => { setItems(x.items); setRequests(x.requests); }), [userId]);

  React.useEffect(() => {
    let alive = true;
    fetchAssets(userId).then((x) => { if (alive) { setItems(x.items); setRequests(x.requests); } });
    return () => { alive = false; };
  }, [userId]);

  return (
    <Card id="assets" className="scroll-mt-24">
      <CardHeader title={self ? "My assets" : "Assets"} subtitle="Equipment currently held, and equipment requests." action={self ? <Button size="sm" onClick={() => setAsking(true)}><PackagePlus size={14} /> Request equipment</Button> : <Laptop size={15} className="text-muted" />} />
      {items === null ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : items.length === 0 && requests.length === 0 ? (
        <EmptyState icon={<Laptop size={18} />} title="No equipment assigned" hint={self ? "Need a laptop, phone, SIM or access card? Ask here — it goes to your manager, then IT." : "Nothing is assigned right now."} className="py-[var(--s4)]" action={self ? <Button size="sm" variant="primary" onClick={() => setAsking(true)}><PackagePlus size={14} /> Request equipment</Button> : undefined} />
      ) : (
        <div className="divide-y border-t">
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-[var(--s4)] py-2.5">
              <span className="w-8 h-8 rounded-[var(--radius-sm)] sunken inline-flex items-center justify-center text-muted shrink-0"><Laptop size={15} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{a.asset?.name || "Asset"} <span className="text-muted font-normal text-xs num">· {a.asset?.tag}</span></div>
                <div className="text-[11px] text-muted truncate">{ASSET_KIND_LABEL[a.asset?.kind || ""] || humanize(a.asset?.kind)}{a.asset?.serial ? ` · ${a.asset.serial}` : ""} · since {fmtDate(a.assigned_at)}{a.condition_note ? ` · ${a.condition_note}` : ""}</div>
              </div>
            </div>
          ))}
          {requests.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-[var(--s4)] py-2.5">
              <span className="w-8 h-8 rounded-[var(--radius-sm)] sunken inline-flex items-center justify-center text-muted shrink-0"><Send size={14} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">Request: {ASSET_KIND_LABEL[r.kind] || humanize(r.kind)} <span className="text-muted text-xs">· {r.details}</span></div>
                <div className="text-[11px] text-muted truncate">{fmtDate(r.created_at)}{r.decision_note ? ` · ${r.decision_note}` : ""}</div>
              </div>
              <Pill tone={ASSET_REQUEST_TONE[r.status] || "tone-neutral"}>{humanize(r.status)}</Pill>
            </div>
          ))}
        </div>
      )}
      {self && <RequestEquipmentModal open={asking} onClose={() => setAsking(false)} onDone={() => { void load(); toast.push("Request sent to your manager", "success"); }} />}
    </Card>
  );
}

function RequestEquipmentModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { profile } = useSession();
  const [kind, setKind] = React.useState("laptop");
  const [details, setDetails] = React.useState("");
  const [why, setWhy] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function send() {
    if (!profile.org_id || !details.trim()) return;
    setBusy(true);
    const { error } = await createClient().from("asset_requests").insert({ org_id: profile.org_id, user_id: profile.id, kind, details: details.trim(), justification: why.trim() || null });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setDetails(""); setWhy("");
    onClose();
    onDone();
  }
  return (
    <Modal open={open} onClose={onClose} title="Request equipment" width={460} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!details.trim()} onClick={send}><Send size={15} /> Send request</Button></>}>
      <div className="space-y-3">
        <Field label="What do you need?"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{ASSET_KINDS.map((k) => <option key={k} value={k}>{ASSET_KIND_LABEL[k]}</option>)}</Select></Field>
        <Field label="Details"><Input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. Second monitor, 24 inch" autoFocus /></Field>
        <Field label="Why"><Textarea rows={3} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Helps your manager approve quickly." /></Field>
        <p className="text-[11px] text-muted">Goes to your manager for approval, then IT / Admin fulfil it. You are notified at each step.</p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------- Documents */
export function MyDocumentsCard({ userId, self, name }: { userId: string; self: boolean; name: string }) {
  const router = useRouter();
  const [docs, setDocs] = React.useState<EmployeeDocument[] | null>(null);
  const [upload, setUpload] = React.useState(false);
  const load = React.useCallback(async () => {
    const { data } = await createClient().from("employee_documents").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    setDocs(data || []);
  }, [userId]);
  React.useEffect(() => {
    let alive = true;
    createClient().from("employee_documents").select("*").eq("user_id", userId).order("created_at", { ascending: false }).then(({ data }) => { if (alive) setDocs(data || []); });
    return () => { alive = false; };
  }, [userId]);
  return (
    <Card id="documents" className="scroll-mt-24">
      <CardHeader title={self ? "My documents" : "Documents"} subtitle={self ? "Letters, contracts and certificates HR has shared with you. You can add your own." : "Documents on file."} action={<Button size="sm" onClick={() => setUpload(true)}><FileUp size={14} /> Upload</Button>} />
      {docs === null ? <div className="flex justify-center py-6"><Spinner /></div> : <DocumentList docs={docs} emptyHint={self ? "Nothing shared yet. Upload a certificate or ID proof for HR here." : "No documents visible to you."} emptyAction={<Button size="sm" variant="primary" onClick={() => setUpload(true)}><FileUp size={14} /> Upload</Button>} />}
      <UploadDocumentModal open={upload} userId={userId} userName={name} selfService={self} onClose={() => setUpload(false)} onUploaded={() => { void load(); router.refresh(); }} />
    </Card>
  );
}
