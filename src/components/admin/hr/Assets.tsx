"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Inbox, Laptop, PackageCheck, PackagePlus, Pencil, Search, Undo2, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Tabs, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { ago, fmtDate, humanize } from "@/lib/utils";
import { Note, PersonLine } from "../AdminBits";
import { ASSET_KIND_LABEL, ASSET_KINDS, ASSET_REQUEST_TONE, ASSET_STATUS_TONE, ASSET_STATUSES, type AssetAssignment, type AssetRequest, type AssetRow, type HrData } from "./lib";

type Tab = "inventory" | "requests";

export function AssetsView({ data, initialTab }: { data: HrData; initialTab?: Tab }) {
  const [tab, setTab] = React.useState<Tab>(initialTab || "inventory");
  const pending = data.assetRequests.filter((r) => r.status === "pending").length;
  return (
    <div className="space-y-[var(--s3)]">
      <Tabs<Tab>
        tabs={[
          { key: "inventory", label: <span className="inline-flex items-center gap-1.5"><Laptop size={13} /> Inventory</span>, count: data.assets.length || undefined },
          { key: "requests", label: <span className="inline-flex items-center gap-1.5"><Inbox size={13} /> Requests</span>, count: pending || undefined },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "inventory" ? <Inventory data={data} /> : <Requests data={data} />}
    </div>
  );
}

/* ------------------------------------------------------------ Inventory */
function Inventory({ data }: { data: HrData }) {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [kind, setKind] = React.useState("");
  const [editing, setEditing] = React.useState<AssetRow | "new" | null>(null);
  const [assigning, setAssigning] = React.useState<AssetRow | null>(null);
  const [returning, setReturning] = React.useState<{ asset: AssetRow; assignment: AssetAssignment } | null>(null);

  const holder = React.useMemo(() => {
    const m = new Map<string, AssetAssignment>();
    for (const a of data.assignments) if (!a.returned_at) m.set(a.asset_id, a);
    return m;
  }, [data.assignments]);

  const needle = q.trim().toLowerCase();
  const list = data.assets.filter((a) => (!status || a.status === status) && (!kind || a.kind === kind) && (!needle || [a.tag, a.name, a.serial].some((v) => (v || "").toLowerCase().includes(needle))));
  const counts = ASSET_STATUSES.map((s) => ({ s, n: data.assets.filter((a) => a.status === s).length }));

  return (
    <div className="space-y-[var(--s4)]">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {counts.map((c) => (
          <button key={c.s} type="button" onClick={() => setStatus(status === c.s ? "" : c.s)} className={`card card-hover px-3 py-2 text-left ${status === c.s ? "ring-2 ring-[var(--brand)]" : ""}`}>
            <div className="text-[11px] text-muted capitalize">{humanize(c.s)}</div>
            <div className="text-lg font-semibold num">{c.n}</div>
          </button>
        ))}
      </div>
      <Card>
        <CardHeader title="Inventory" subtitle="Every laptop, phone, SIM, card and licence — who holds it and in what condition." action={<Button size="sm" variant="primary" onClick={() => setEditing("new")}><PackagePlus size={14} /> <span className="hidden sm:inline">Add asset</span></Button>} />
        <div className="px-[var(--s4)] pb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tag, name, serial…" className="input pl-8 !h-9 !text-sm w-full" /></div>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="!w-auto"><option value="">All kinds</option>{ASSET_KINDS.map((k) => <option key={k} value={k}>{ASSET_KIND_LABEL[k]}</option>)}</Select>
          <span className="text-xs text-muted num ml-auto">{list.length}</span>
        </div>
        {list.length === 0 ? (
          <EmptyState icon={<Laptop size={18} />} title="No assets" hint="Add the first asset to start tracking who holds what." className="py-[var(--s4)]" action={<Button size="sm" variant="primary" onClick={() => setEditing("new")}><PackagePlus size={14} /> Add asset</Button>} />
        ) : (
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm min-w-[820px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted"><th className="px-[var(--s4)] py-2 font-medium">Tag</th><th className="px-3 py-2 font-medium">Kind</th><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Serial</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Holder</th><th className="px-3 py-2" /></tr></thead>
              <tbody className="divide-y">
                {list.map((a) => {
                  const h = holder.get(a.id);
                  return (
                    <tr key={a.id} className="row-hover">
                      <td className="px-[var(--s4)] py-2 num font-medium whitespace-nowrap">{a.tag}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{ASSET_KIND_LABEL[a.kind] || humanize(a.kind)}</td>
                      <td className="px-3 py-2"><div className="truncate max-w-[260px]">{a.name}</div>{a.notes && <div className="text-[11px] text-muted truncate max-w-[260px]">{a.notes}</div>}</td>
                      <td className="px-3 py-2 num text-xs text-muted whitespace-nowrap">{a.serial || "—"}</td>
                      <td className="px-3 py-2"><Pill tone={ASSET_STATUS_TONE[a.status] || "tone-neutral"}>{humanize(a.status)}</Pill></td>
                      <td className="px-3 py-2 whitespace-nowrap">{h ? <span className="inline-flex items-center gap-1.5"><PersonChip id={h.user_id} size={18} /><Blink zone={`user:${h.user_id}`} /><span className="text-[11px] text-muted">since {fmtDate(h.assigned_at)}</span></span> : <span className="text-muted">—</span>}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {a.status === "available" && <Button size="xs" variant="secondary" onClick={() => setAssigning(a)}><UserPlus size={12} /> Assign</Button>}
                        {h && <Button size="xs" variant="secondary" onClick={() => setReturning({ asset: a, assignment: h })}><Undo2 size={12} /> Returned</Button>}
                        <Button size="xs" variant="ghost" icon onClick={() => setEditing(a)} aria-label="Edit"><Pencil size={12} /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && <AssetModal key={editing === "new" ? "new" : editing.id} asset={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {assigning && <AssignAssetModal open assets={data.assets} defaultAsset={assigning.id} onClose={() => setAssigning(null)} />}
      {returning && <ReturnModal key={returning.assignment.id} asset={returning.asset} assignment={returning.assignment} onClose={() => setReturning(null)} />}
    </div>
  );
}

function AssetModal({ asset, onClose }: { asset: AssetRow | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [tag, setTag] = React.useState(asset?.tag || "");
  const [kind, setKind] = React.useState(asset?.kind || "laptop");
  const [name, setName] = React.useState(asset?.name || "");
  const [serial, setSerial] = React.useState(asset?.serial || "");
  const [status, setStatus] = React.useState(asset?.status || "available");
  const [purchased, setPurchased] = React.useState(asset?.purchased_on || "");
  const [notes, setNotes] = React.useState(asset?.notes || "");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (!profile.org_id || !tag.trim() || !name.trim()) return;
    setBusy(true);
    const payload = { tag: tag.trim(), kind, name: name.trim(), serial: serial.trim() || null, purchased_on: purchased || null, notes: notes.trim() || null, ...(asset && asset.status !== "assigned" && status !== "assigned" ? { status } : {}) };
    const supabase = createClient();
    const { error } = asset ? await supabase.from("assets").update(payload).eq("id", asset.id) : await supabase.from("assets").insert({ ...payload, org_id: profile.org_id, status: status === "assigned" ? "available" : status });
    setBusy(false);
    if (error) { toast.push(error.message.includes("duplicate") ? "That tag is already used" : error.message, "danger"); return; }
    toast.push(asset ? "Asset updated" : "Asset added", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={asset ? `Edit ${asset.tag}` : "Add asset"} width={520} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!tag.trim() || !name.trim()} onClick={save}><Check size={15} /> Save</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Tag" hint="Unique label, e.g. GHL-LT-014"><Input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} autoFocus /></Field>
        <Field label="Kind"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{ASSET_KINDS.map((k) => <option key={k} value={k}>{ASSET_KIND_LABEL[k]}</option>)}</Select></Field>
        <Field label="Name" className="sm:col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. MacBook Air 13" M3' /></Field>
        <Field label="Serial"><Input value={serial} onChange={(e) => setSerial(e.target.value)} /></Field>
        <Field label="Purchased on"><Input type="date" value={purchased} onChange={(e) => setPurchased(e.target.value)} /></Field>
        <Field label="Status" hint={asset?.status === "assigned" ? "Assigned — mark it returned first." : undefined}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} disabled={asset?.status === "assigned"}>{ASSET_STATUSES.filter((s) => s !== "assigned" || asset?.status === "assigned").map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export function AssignAssetModal({ open, assets, defaultAsset, defaultUser, onClose }: { open: boolean; assets: AssetRow[]; defaultAsset?: string; defaultUser?: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [assetId, setAssetId] = React.useState(defaultAsset || "");
  const [userId, setUserId] = React.useState(defaultUser || "");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const available = assets.filter((a) => a.status === "available" || a.id === defaultAsset);

  async function assign() {
    if (!assetId || !userId) return;
    setBusy(true);
    const { error } = await createClient().from("asset_assignments").insert({ asset_id: assetId, user_id: userId, assigned_by: profile.id, condition_note: note.trim() || null });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Asset assigned — the person has been notified", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="Assign an asset" width={480} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!assetId || !userId} onClick={assign}><UserPlus size={15} /> Assign</Button></>}>
      <div className="space-y-3">
        <Field label="Asset">
          <Select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">Choose an available asset…</option>
            {available.map((a) => <option key={a.id} value={a.id}>{a.tag} · {a.name}</option>)}
          </Select>
        </Field>
        <Field label="To"><PersonPicker value={userId} onChange={setUserId} placeholder="Choose a person…" /></Field>
        <Field label="Condition at handover"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. New, with charger and sleeve." /></Field>
        {available.length === 0 && <Note tone="warn">No available assets. Add one in the inventory or mark a returned asset first.</Note>}
      </div>
    </Modal>
  );
}

function ReturnModal({ asset, assignment, onClose }: { asset: AssetRow; assignment: AssetAssignment; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [note, setNote] = React.useState("");
  const [status, setStatus] = React.useState<"available" | "repair" | "retired">("available");
  const [busy, setBusy] = React.useState(false);

  async function done() {
    setBusy(true);
    const supabase = createClient();
    const combined = [assignment.condition_note ? `Handover: ${assignment.condition_note}` : null, note.trim() ? `Return: ${note.trim()}` : null].filter(Boolean).join("\n") || null;
    const { error } = await supabase.from("asset_assignments").update({ returned_at: new Date().toISOString(), condition_note: combined }).eq("id", assignment.id);
    if (error) { setBusy(false); toast.push(error.message, "danger"); return; }
    if (status !== "available") await supabase.from("assets").update({ status }).eq("id", asset.id);
    setBusy(false);
    toast.push(`${asset.tag} marked returned`, "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={`Return ${asset.tag}`} width={460} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={done}><PackageCheck size={15} /> Mark returned</Button></>}>
      <div className="space-y-3">
        <PersonLine id={assignment.user_id} size={30} sub={`Held since ${fmtDate(assignment.assigned_at)}`} />
        <Field label="Condition on return"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any damage, missing accessories…" autoFocus /></Field>
        <Field label="Then">
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="available">Available for reassignment</option>
            <option value="repair">Send for repair</option>
            <option value="retired">Retire</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------- Requests */
function Requests({ data }: { data: HrData }) {
  const [deciding, setDeciding] = React.useState<{ r: AssetRequest; mode: "approve" | "reject" } | null>(null);
  const [show, setShow] = React.useState<"pending" | "all">("pending");
  const list = data.assetRequests.filter((r) => show === "all" || r.status === "pending");
  return (
    <div className="space-y-[var(--s4)]">
      <Card>
        <CardHeader title="Equipment requests" subtitle="Routed to the person's manager, then IT. Approve with an asset to fulfil in one step." action={<Select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className="!w-auto !h-8 !text-xs"><option value="pending">Pending</option><option value="all">All</option></Select>} />
        {list.length === 0 ? (
          <EmptyState icon={<Inbox size={18} />} title="No requests" hint="People ask from their profile → My assets → Request equipment." className="py-[var(--s4)]" />
        ) : (
          <div className="divide-y border-t">
            {list.map((r) => (
              <div key={r.id} className="px-[var(--s4)] py-3 flex flex-wrap items-start gap-3">
                <PersonLine id={r.user_id} size={30} sub={<>{ago(r.created_at)}{r.approver_id && <> · approver <PersonChip id={r.approver_id} size={12} /></>}</>} className="min-w-[200px]" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium capitalize">{ASSET_KIND_LABEL[r.kind] || humanize(r.kind)}</div>
                  <div className="text-muted whitespace-pre-wrap">{r.details}</div>
                  {r.justification && <div className="text-xs text-muted mt-0.5">Why: {r.justification}</div>}
                  {r.decision_note && <div className="text-xs mt-1">Decision: {r.decision_note}</div>}
                  {r.asset_id && <div className="text-xs text-muted mt-0.5">Fulfilled with {data.assets.find((a) => a.id === r.asset_id)?.tag || "an asset"}</div>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Pill tone={ASSET_REQUEST_TONE[r.status] || "tone-neutral"}>{humanize(r.status)}</Pill>
                  {r.status === "pending" && (
                    <>
                      <Button size="sm" variant="primary" onClick={() => setDeciding({ r, mode: "approve" })}><Check size={13} /> Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeciding({ r, mode: "reject" })}><X size={13} /> Reject</Button>
                    </>
                  )}
                  {r.status === "approved" && <Button size="sm" variant="secondary" onClick={() => setDeciding({ r, mode: "approve" })}><PackageCheck size={13} /> Fulfil</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {deciding && <DecideModal key={deciding.r.id + deciding.mode} r={deciding.r} mode={deciding.mode} assets={data.assets} onClose={() => setDeciding(null)} />}
    </div>
  );
}

function DecideModal({ r, mode, assets, onClose }: { r: AssetRequest; mode: "approve" | "reject"; assets: AssetRow[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [assetId, setAssetId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // Matching kind first, then everything else that is free.
  const available = assets.filter((a) => a.status === "available").sort((a, b) => Number(b.kind === r.kind) - Number(a.kind === r.kind) || a.tag.localeCompare(b.tag));

  async function go() {
    setBusy(true);
    const supabase = createClient();
    if (mode === "reject") {
      const { error } = await supabase.from("asset_requests").update({ status: "rejected", decision_note: note.trim() || null }).eq("id", r.id);
      setBusy(false);
      if (error) { toast.push(error.message, "danger"); return; }
      toast.push("Request rejected", "success");
    } else if (assetId) {
      const { error } = await supabase.from("asset_assignments").insert({ asset_id: assetId, user_id: r.user_id, assigned_by: profile.id, condition_note: note.trim() || null });
      if (error) { setBusy(false); toast.push(error.message, "danger"); return; }
      const { error: e2 } = await supabase.from("asset_requests").update({ status: "fulfilled", asset_id: assetId, decision_note: note.trim() || null }).eq("id", r.id);
      setBusy(false);
      if (e2) { toast.push(`Assigned, but the request was not updated: ${e2.message}`, "danger"); return; }
      toast.push("Approved and fulfilled — asset assigned", "success");
    } else {
      const { error } = await supabase.from("asset_requests").update({ status: "approved", decision_note: note.trim() || null }).eq("id", r.id);
      setBusy(false);
      if (error) { toast.push(error.message, "danger"); return; }
      toast.push("Approved — fulfil it when the asset is ready", "success");
    }
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={mode === "approve" ? "Approve request" : "Reject request"} width={480} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={mode === "approve" ? "primary" : "danger"} loading={busy} onClick={go}>{mode === "approve" ? <><Check size={15} /> {assetId ? "Approve & assign" : "Approve"}</> : <><X size={15} /> Reject</>}</Button></>}>
      <div className="space-y-3">
        <div className="sunken rounded-[var(--radius-sm)] p-3 text-sm"><PersonLine id={r.user_id} size={24} sub={`${ASSET_KIND_LABEL[r.kind] || humanize(r.kind)} · ${r.details}`} /></div>
        {mode === "approve" && (
          <Field label="Assign an asset now" hint="Optional — approving without an asset keeps the request open for fulfilment.">
            <Select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">Later</option>
              {available.map((a) => <option key={a.id} value={a.id}>{a.tag} · {a.name}{a.kind !== r.kind ? ` (${ASSET_KIND_LABEL[a.kind] || a.kind})` : ""}</option>)}
            </Select>
          </Field>
        )}
        <Field label={mode === "approve" ? "Note to the person" : "Reason"}><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "approve" ? "e.g. Collect from Admin on Monday." : "Explain the decision — it is shown to the requester."} autoFocus /></Field>
      </div>
    </Modal>
  );
}
