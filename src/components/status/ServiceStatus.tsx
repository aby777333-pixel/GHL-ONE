"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, LifeBuoy, Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Pill, Select, Textarea, useToast } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { ago, cn, type Tables } from "@/lib/utils";
import { SERVICE_STATUSES, SERVICE_STATUS_LABEL, SERVICE_STATUS_TONE, useTouchModule } from "@/components/intel/lib";

export type ServiceRow = Tables<"service_status">;

/** Company service status board. Editing is gated by RLS (IT leads / admins); a status change notifies everyone via trigger. */
export function ServiceStatus({ rows, canEdit }: { rows: ServiceRow[]; canEdit: boolean }) {
  const { profile } = useSession();
  const router = useRouter();
  useTouchModule("status");
  useSeen("nav:/status");
  const [editing, setEditing] = React.useState<ServiceRow | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [live, setLive] = React.useState<ServiceRow[]>(rows);
  const [synced, setSynced] = React.useState(rows);
  if (synced !== rows) { setSynced(rows); setLive(rows); }

  // Realtime: status flips show up without a reload.
  React.useEffect(() => {
    const sb = createClient();
    const ch = sb.channel(`service_status:${profile.org_id}`).on("postgres_changes", { event: "*", schema: "public", table: "service_status" }, () => router.refresh()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [profile.org_id, router]);

  const bad = live.filter((r) => r.status !== "ok");
  const headline = bad.length === 0 ? "All systems operational" : bad.some((r) => r.status === "down") ? `${bad.filter((r) => r.status === "down").length} service${bad.filter((r) => r.status === "down").length > 1 ? "s" : ""} down` : `${bad.length} service${bad.length > 1 ? "s" : ""} affected`;

  return (
    <div className="page page-narrow">
      <PageHeader eyebrow="Company" title="Service status" subtitle="One place to check before raising a ticket. IT updates this; a change notifies everyone." actions={<>
        <Link href="/help?tab=ask&dept=technology" className="btn btn-secondary btn-sm"><LifeBuoy size={14} /> Report a problem</Link>
        {canEdit && <Button size="sm" variant="primary" onClick={() => setAdding(true)}><Plus size={14} /> Add service</Button>}
      </>} />

      <Card className={cn("px-[var(--s4)] py-[var(--s3)] mb-[var(--s3)] flex items-center gap-3", bad.length === 0 ? "tone-success" : bad.some((r) => r.status === "down") ? "tone-danger" : "tone-warn")}>
        <Activity size={18} />
        <div className="min-w-0"><div className="font-medium">{headline}</div><div className="text-xs opacity-80">{bad.length ? "IT is aware — no need to raise separate tickets for the items below." : "If something feels off, report it and IT will update this page."}</div></div>
      </Card>

      <Card>
        <CardHeader title="Services" subtitle={`${live.length} monitored`} />
        {live.length === 0 ? <EmptyState title="No services listed" className="py-[var(--s4)]" /> : (
          <div className="divide-y border-t">
            {live.map((r) => (
              <div key={r.id} className="px-[var(--s4)] py-3 flex items-start gap-3">
                <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.status === "ok" ? "var(--success)" : r.status === "down" ? "var(--danger)" : r.status === "degraded" ? "var(--warn)" : "var(--info)" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{r.name}</span>
                    <Pill tone={SERVICE_STATUS_TONE[r.status] || "tone-neutral"}>{SERVICE_STATUS_LABEL[r.status] || r.status}</Pill>
                  </div>
                  {r.note && <div className="text-sm text-2 mt-0.5 whitespace-pre-wrap">{r.note}</div>}
                  <div className="text-[11px] text-muted mt-1 inline-flex items-center gap-1.5">Updated {ago(r.updated_at)}{r.updated_by && <> by <PersonChip id={r.updated_by} size={12} /></>}</div>
                </div>
                {canEdit && <Button size="xs" variant="ghost" onClick={() => setEditing(r)} aria-label={`Update ${r.name}`}><Pencil size={13} /> Update</Button>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing && <StatusEditor row={editing} onClose={() => setEditing(null)} onSaved={(next) => { setLive((l) => l.map((x) => (x.id === next.id ? next : x))); setEditing(null); router.refresh(); }} />}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add a service">
        <AddService onDone={() => { setAdding(false); router.refresh(); }} onCancel={() => setAdding(false)} />
      </Modal>
    </div>
  );
}

function AddService({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await createClient().from("service_status").insert({ org_id: profile.org_id!, name: name.trim(), updated_by: profile.id });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Service added", "success");
    onDone();
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <Field label="Name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VPN" required /></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Add</Button></div>
    </form>
  );
}

function StatusEditor({ row, onClose, onSaved }: { row: ServiceRow; onClose: () => void; onSaved: (r: ServiceRow) => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [status, setStatus] = React.useState(row.status);
  const [note, setNote] = React.useState(row.note || "");
  const [busy, setBusy] = React.useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await createClient().from("service_status").update({ status, note: note.trim() || null, updated_by: profile.id, updated_at: new Date().toISOString() }).eq("id", row.id).select("*").single();
    setBusy(false);
    if (error || !data) return toast.push(error?.message || "Could not update", "danger");
    toast.push(status !== row.status && (status === "down" || status === "degraded") ? "Status updated — everyone has been notified" : "Status updated", "success");
    onSaved(data);
  }
  return (
    <Modal open onClose={onClose} title={`Update · ${row.name}`} width={480}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Status" hint={status === "down" || status === "degraded" ? "Moving to down/degraded notifies every active employee." : undefined}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>{SERVICE_STATUSES.map((s) => <option key={s} value={s}>{SERVICE_STATUS_LABEL[s]}</option>)}</Select>
        </Field>
        <Field label="Note" hint="What is affected, what to do meanwhile, expected fix time."><Textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 72 }} placeholder="e.g. Email delivery delayed ~30 min; IT working with the provider." /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}
