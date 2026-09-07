"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs, useToast } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { cn, fmtDate, fmtTime, type Tables } from "@/lib/utils";
import { RESOURCE_KINDS, RESOURCE_KIND_LABEL, addDaysLocal, friendlyError, useTouchModule } from "@/components/intel/lib";

export type ResourceRow = Tables<"resources">;
export type BookingRow = Tables<"bookings">;
const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i); // 08:00 → 20:00

/** Rooms, desks, equipment, vehicles — day grid with book/cancel. The DB rejects overlaps (exclusion constraint). */
export function Bookings({ resources, bookings, day: initialDay, canManage }: { resources: ResourceRow[]; bookings: BookingRow[]; day: string; canManage: boolean }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  useTouchModule("bookings");
  useSeen("nav:/bookings");
  const [kind, setKind] = React.useState<string>(RESOURCE_KINDS.find((k) => resources.some((r) => r.kind === k)) || "room");
  const [booking, setBooking] = React.useState<{ resource: ResourceRow; hour?: number } | null>(null);
  const [addRes, setAddRes] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const day = initialDay;
  const go = (d: string) => router.push(`/bookings?day=${d}`);
  const list = resources.filter((r) => r.kind === kind && r.active);
  const dayStart = new Date(day + "T00:00:00").getTime();

  async function cancel(b: BookingRow) {
    setBusy(b.id);
    const { error } = await createClient().from("bookings").delete().eq("id", b.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push("Booking cancelled", "info"); router.refresh();
  }

  const tabs = RESOURCE_KINDS.map((k) => ({ key: k, label: RESOURCE_KIND_LABEL[k], count: resources.filter((r) => r.kind === k && r.active).length || undefined }));
  const mine = bookings.filter((b) => b.user_id === profile.id).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <div className="page">
      <PageHeader eyebrow="Office" title="Bookings" subtitle="Meeting rooms, hot desks, equipment and vehicles. Double bookings are impossible — the calendar says no." actions={<>
        {canManage && <Button variant="secondary" size="sm" onClick={() => setAddRes(true)}><Plus size={14} /> Add resource</Button>}
        <span className="inline-flex items-center gap-1"><Button size="sm" variant="ghost" icon aria-label="Previous day" onClick={() => go(addDaysLocal(day, -1))}><ChevronLeft size={15} /></Button><Input type="date" value={day} onChange={(e) => e.target.value && go(e.target.value)} className="!h-8 !text-xs !w-auto" /><Button size="sm" variant="ghost" icon aria-label="Next day" onClick={() => go(addDaysLocal(day, 1))}><ChevronRight size={15} /></Button></span>
      </>} />
      <Tabs tabs={tabs} value={kind} onChange={setKind} className="mb-3" />

      {list.length === 0 ? <Card><EmptyState icon={<CalendarDays size={18} />} title={`No ${RESOURCE_KIND_LABEL[kind].toLowerCase()} yet`} hint={canManage ? "Add the first one to start taking bookings." : "Admin or HR can add resources."} action={canManage ? <Button size="sm" variant="primary" onClick={() => setAddRes(true)}><Plus size={14} /> Add</Button> : undefined} /></Card> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-xs min-w-[720px] border-collapse">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted"><th className="px-[var(--s3)] py-2 font-medium w-[200px]">{fmtDate(day)}</th>{HOURS.map((h) => <th key={h} className="px-1 py-2 font-medium num text-center">{String(h).padStart(2, "0")}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {list.map((r) => {
                const rows = bookings.filter((b) => b.resource_id === r.id);
                return (
                  <tr key={r.id} className="row-hover">
                    <td className="px-[var(--s3)] py-2 align-top">
                      <div className="font-medium text-sm">{r.name}</div>
                      <div className="text-[11px] text-muted">{[r.location, r.capacity ? `${r.capacity} seats` : null].filter(Boolean).join(" · ")}</div>
                      <Button size="xs" variant="secondary" className="mt-1" onClick={() => setBooking({ resource: r })}><Plus size={11} /> Book</Button>
                    </td>
                    {HOURS.map((h) => {
                      const slotStart = dayStart + h * 3600000; const slotEnd = slotStart + 3600000;
                      const b = rows.find((x) => new Date(x.starts_at).getTime() < slotEnd && new Date(x.ends_at).getTime() > slotStart);
                      return (
                        <td key={h} className="p-0.5 align-top">
                          {b ? (
                            <div className={cn("rounded-[var(--radius-sm)] px-1 py-1 h-full min-h-[40px] text-[10px] leading-tight", b.user_id === profile.id ? "tone-brand" : "tone-info")} title={`${fmtTime(b.starts_at)}–${fmtTime(b.ends_at)} · ${b.purpose || ""}`}>
                              <div className="truncate"><PersonChip id={b.user_id} size={12} showName={false} /> {b.purpose || "Booked"}</div>
                              {(b.user_id === profile.id || canManage) && new Date(b.starts_at).getTime() === Math.max(new Date(b.starts_at).getTime(), slotStart) && <button type="button" onClick={() => cancel(b)} disabled={busy === b.id} className="mt-0.5 inline-flex items-center gap-0.5 opacity-80 hover:opacity-100"><X size={9} /> cancel</button>}
                            </div>
                          ) : (
                            <button type="button" onClick={() => setBooking({ resource: r, hour: h })} className="w-full min-h-[40px] rounded-[var(--radius-sm)] hover:bg-[var(--neutral-bg)]" aria-label={`Book ${r.name} at ${h}:00`} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {mine.length > 0 && (
        <Card className="mt-[var(--s3)]">
          <CardHeader title="My bookings today" />
          <div className="divide-y border-t">{mine.map((b) => <div key={b.id} className="px-[var(--s4)] py-2 text-sm flex items-center gap-3"><span className="num w-28">{fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}</span><span className="flex-1 truncate">{resources.find((r) => r.id === b.resource_id)?.name}{b.purpose ? ` · ${b.purpose}` : ""}</span><Button size="xs" variant="ghost" loading={busy === b.id} onClick={() => cancel(b)}><X size={12} /> Cancel</Button></div>)}</div>
        </Card>
      )}

      {booking && <BookModal resource={booking.resource} day={day} hour={booking.hour} onClose={() => setBooking(null)} onDone={() => { setBooking(null); router.refresh(); }} />}
      <Modal open={addRes} onClose={() => setAddRes(false)} title="Add a resource"><ResourceForm onDone={() => { setAddRes(false); router.refresh(); }} onCancel={() => setAddRes(false)} /></Modal>
    </div>
  );
}

function BookModal({ resource, day, hour, onClose, onDone }: { resource: ResourceRow; day: string; hour?: number; onClose: () => void; onDone: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [start, setStart] = React.useState(`${String(hour ?? 10).padStart(2, "0")}:00`);
  const [end, setEnd] = React.useState(`${String((hour ?? 10) + 1).padStart(2, "0")}:00`);
  const [purpose, setPurpose] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (end <= start) return toast.push("End must be after start", "danger");
    setBusy(true);
    const { error } = await createClient().from("bookings").insert({ resource_id: resource.id, user_id: profile.id, starts_at: new Date(`${day}T${start}:00`).toISOString(), ends_at: new Date(`${day}T${end}:00`).toISOString(), purpose: purpose.trim() || null });
    setBusy(false);
    if (error) return toast.push(friendlyError(error.message), "danger");
    toast.push(`${resource.name} booked`, "success"); onDone();
  }
  return (
    <Modal open onClose={onClose} title={`Book · ${resource.name}`} width={460}>
      <form onSubmit={submit} className="space-y-3">
        <div className="text-xs text-muted">{fmtDate(day)}{resource.location ? ` · ${resource.location}` : ""}{resource.capacity ? ` · ${resource.capacity} seats` : ""}</div>
        <div className="grid grid-cols-2 gap-2"><Field label="From"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></Field><Field label="To"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></Field></div>
        <Field label="Purpose"><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Client call — Mauritius" /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Book</Button></div>
      </form>
    </Modal>
  );
}

function ResourceForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [kind, setKind] = React.useState<string>("room");
  const [name, setName] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [capacity, setCapacity] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from("resources").insert({ org_id: profile.org_id!, kind, name: name.trim(), location: location.trim() || null, capacity: capacity ? Number(capacity) : null });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Resource added", "success"); onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{RESOURCE_KINDS.map((k) => <option key={k} value={k}>{RESOURCE_KIND_LABEL[k]}</option>)}</Select></Field>
        <Field label="Name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Boardroom" required /></Field>
        <Field label="Location"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="4th floor" /></Field>
        <Field label="Capacity"><Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>Add</Button></div>
    </form>
  );
}

