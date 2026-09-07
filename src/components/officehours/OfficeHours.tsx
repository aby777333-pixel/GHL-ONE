"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Plus, Trash2, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Pill, Select, Tabs, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker } from "@/components/pickers";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink, useSeen } from "@/components/providers/ActivityProvider";
import { ago, cn, fmtDate, fmtTime, type Tables } from "@/lib/utils";
import { WEEKDAYS, addDaysLocal, friendlyError, localDay, useTouchModule } from "@/components/intel/lib";

export type OfficeHourRow = Tables<"office_hours">;
export type SlotRow = Tables<"expert_slots">;
type TabKey = "book" | "mine" | "host";

/** Office hours: hosts publish weekly windows; people book fixed-length slots (`expert_slots`, no overlaps per host). */
export function OfficeHours({ hours, slots }: { hours: OfficeHourRow[]; slots: SlotRow[] }) {
  const { profile, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  useTouchModule("office_hours");
  useSeen("nav:/office-hours");
  const hosting = hours.filter((h) => h.host_id === profile.id);
  const [tab, setTab] = React.useState<TabKey>("book");
  const [dept, setDept] = React.useState("");
  const [booking, setBooking] = React.useState<OfficeHourRow | null>(null);
  const [publish, setPublish] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  const myBookings = slots.filter((s) => s.user_id === profile.id && s.status === "booked").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const forMe = slots.filter((s) => s.host_id === profile.id && s.status === "booked").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const list = hours.filter((h) => h.active && (!dept || h.department_id === dept)).sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));

  async function setSlot(s: SlotRow, status: "cancelled" | "done") {
    setBusy(s.id);
    const { error } = await createClient().from("expert_slots").update({ status }).eq("id", s.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push(status === "cancelled" ? "Slot cancelled" : "Marked done", "info"); router.refresh();
  }
  async function toggleHours(h: OfficeHourRow) {
    const { error } = await createClient().from("office_hours").update({ active: !h.active }).eq("id", h.id);
    if (error) return toast.push(error.message, "danger");
    router.refresh();
  }
  async function removeHours(h: OfficeHourRow) {
    if (!window.confirm("Remove these office hours? Existing bookings stay.")) return;
    const { error } = await createClient().from("office_hours").delete().eq("id", h.id);
    if (error) return toast.push(error.message, "danger");
    router.refresh();
  }

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "book", label: "Book time", count: list.length },
    { key: "mine", label: "My bookings", count: myBookings.length || undefined },
    { key: "host", label: "I host", count: forMe.length || undefined },
  ];

  return (
    <div className="page">
      <PageHeader eyebrow="People" title="Office hours & experts" subtitle="Book 15–30 minutes with someone who knows. No back-and-forth, no meeting-request ping-pong." actions={<>
        <Link href="/people/skills" className="btn btn-secondary btn-sm"><Users size={14} /> Find an expert</Link>
        <Button variant="primary" onClick={() => setPublish(true)}><Plus size={15} /> Publish my office hours</Button>
      </>} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-3" />

      {tab === "book" && (
        <>
          <div className="mb-3 sm:w-64"><DepartmentPicker value={dept} onChange={setDept} placeholder="All departments" /></div>
          {list.length === 0 ? <Card><EmptyState icon={<CalendarClock size={18} />} title="No office hours published yet" hint="Experts and leads can publish weekly windows; anyone can then book a slot." action={<Button size="sm" variant="primary" onClick={() => setPublish(true)}><Plus size={14} /> Publish mine</Button>} /></Card> : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
              {list.map((h) => (
                <Card key={h.id} className="p-[var(--s3)] flex flex-col gap-2">
                  <div className="flex items-center gap-2"><PersonChip id={h.host_id} size={26} /><Blink zone={`user:${h.host_id}`} />{h.department_id && <Pill tone="tone-neutral" className="ml-auto">{departments.find((d) => d.id === h.department_id)?.name}</Pill>}</div>
                  <div className="font-medium text-sm">{h.title}</div>
                  <div className="text-xs text-muted num">{WEEKDAYS[h.weekday - 1]} · {h.start_time.slice(0, 5)}–{h.end_time.slice(0, 5)} · {h.slot_minutes}-min slots</div>
                  {h.note && <div className="text-xs text-2">{h.note}</div>}
                  <div className="mt-auto pt-1"><Button size="sm" variant={h.host_id === profile.id ? "secondary" : "primary"} disabled={h.host_id === profile.id} onClick={() => setBooking(h)}>{h.host_id === profile.id ? "Your office hours" : "Book a slot"}</Button></div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "mine" && (
        <Card>
          <CardHeader title="My bookings" />
          {myBookings.length === 0 ? <EmptyState title="No upcoming bookings" className="py-[var(--s4)]" /> : (
            <div className="divide-y border-t">{myBookings.map((s) => (
              <div key={s.id} className="px-[var(--s4)] py-2.5 flex items-center gap-3 text-sm">
                <div className="w-28 shrink-0"><div className="text-[11px] text-muted">{fmtDate(s.starts_at)}</div><div className="num font-medium">{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</div></div>
                <div className="min-w-0 flex-1"><div className="inline-flex items-center gap-1.5">with <PersonChip id={s.host_id} size={16} /></div>{s.topic && <div className="text-xs text-muted truncate">{s.topic}</div>}</div>
                <Button size="xs" variant="ghost" loading={busy === s.id} onClick={() => setSlot(s, "cancelled")}><X size={12} /> Cancel</Button>
              </div>
            ))}</div>
          )}
        </Card>
      )}

      {tab === "host" && (
        <div className="space-y-[var(--s3)]">
          <Card>
            <CardHeader title="Booked with you" subtitle={`${forMe.length} upcoming`} />
            {forMe.length === 0 ? <EmptyState title="Nobody has booked yet" className="py-[var(--s4)]" /> : (
              <div className="divide-y border-t">{forMe.map((s) => (
                <div key={s.id} className="px-[var(--s4)] py-2.5 flex items-center gap-3 text-sm">
                  <div className="w-28 shrink-0"><div className="text-[11px] text-muted">{fmtDate(s.starts_at)}</div><div className="num font-medium">{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</div></div>
                  <div className="min-w-0 flex-1"><PersonChip id={s.user_id} size={16} />{s.topic && <div className="text-xs text-muted truncate">{s.topic}</div>}<div className="text-[11px] text-muted">booked {ago(s.created_at)}</div></div>
                  <Button size="xs" variant="success" loading={busy === s.id} onClick={() => setSlot(s, "done")}><Check size={12} /> Done</Button>
                  <Button size="xs" variant="ghost" disabled={busy === s.id} onClick={() => setSlot(s, "cancelled")}><X size={12} /></Button>
                </div>
              ))}</div>
            )}
          </Card>
          <Card>
            <CardHeader title="My published office hours" action={<Button size="sm" variant="secondary" onClick={() => setPublish(true)}><Plus size={13} /> Add</Button>} />
            {hosting.length === 0 ? <EmptyState title="You have not published office hours" hint="Publish a weekly window and colleagues can book you without a meeting request." className="py-[var(--s4)]" /> : (
              <div className="divide-y border-t">{hosting.map((h) => (
                <div key={h.id} className={cn("px-[var(--s4)] py-2.5 flex items-center gap-3 text-sm", !h.active && "opacity-60")}>
                  <div className="min-w-0 flex-1"><div className="font-medium">{h.title}</div><div className="text-xs text-muted num">{WEEKDAYS[h.weekday - 1]} · {h.start_time.slice(0, 5)}–{h.end_time.slice(0, 5)} · {h.slot_minutes} min</div></div>
                  <Pill tone={h.active ? "tone-success" : "tone-muted"}>{h.active ? "Active" : "Paused"}</Pill>
                  <Button size="xs" variant="ghost" onClick={() => toggleHours(h)}>{h.active ? "Pause" : "Resume"}</Button>
                  <button type="button" onClick={() => removeHours(h)} className="text-muted hover:text-[var(--danger)]" aria-label="Remove"><Trash2 size={13} /></button>
                </div>
              ))}</div>
            )}
          </Card>
        </div>
      )}

      {booking && <BookSlotModal h={booking} taken={slots.filter((s) => s.host_id === booking.host_id && s.status === "booked")} onClose={() => setBooking(null)} onDone={() => { setBooking(null); setTab("mine"); router.refresh(); }} />}
      <PublishModal open={publish} onClose={() => setPublish(false)} onDone={() => { setPublish(false); setTab("host"); router.refresh(); }} />
    </div>
  );
}

/** Pick a concrete slot in the next 4 weeks matching the weekly window. */
function BookSlotModal({ h, taken, onClose, onDone }: { h: OfficeHourRow; taken: SlotRow[]; onClose: () => void; onDone: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [topic, setTopic] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [pick, setPick] = React.useState<string | null>(null);
  const [now] = React.useState(() => Date.now());

  const options = React.useMemo(() => {
    const out: { starts: string; ends: string; label: string; free: boolean }[] = [];
    const today = localDay(new Date(now));
    for (let i = 0; i < 28; i++) {
      const day = addDaysLocal(today, i);
      const dow = ((new Date(day + "T00:00:00").getDay() + 6) % 7) + 1;
      if (dow !== h.weekday) continue;
      const [sh, sm] = h.start_time.split(":").map(Number);
      const [eh, em] = h.end_time.split(":").map(Number);
      let cur = new Date(day + "T00:00:00"); cur.setHours(sh, sm, 0, 0);
      const end = new Date(day + "T00:00:00"); end.setHours(eh, em, 0, 0);
      while (cur.getTime() + h.slot_minutes * 60000 <= end.getTime()) {
        const s = cur.toISOString(); const e = new Date(cur.getTime() + h.slot_minutes * 60000).toISOString();
        if (cur.getTime() > now) out.push({ starts: s, ends: e, label: `${fmtDate(s)} · ${fmtTime(s)}`, free: !taken.some((t) => t.starts_at < e && t.ends_at > s) });
        cur = new Date(cur.getTime() + h.slot_minutes * 60000);
      }
    }
    return out;
  }, [h, taken, now]);

  async function book(e: React.FormEvent) {
    e.preventDefault();
    const o = options.find((x) => x.starts === pick);
    if (!o) return;
    setBusy(true);
    const { error } = await createClient().from("expert_slots").insert({ office_hours_id: h.id, host_id: h.host_id!, user_id: profile.id, starts_at: o.starts, ends_at: o.ends, topic: topic.trim() || null });
    setBusy(false);
    if (error) return toast.push(friendlyError(error.message), "danger");
    toast.push("Booked — the host has been notified", "success"); onDone();
  }
  return (
    <Modal open onClose={onClose} title={`Book · ${h.title}`} width={520}>
      <form onSubmit={book} className="space-y-3">
        <div className="text-xs text-muted inline-flex items-center gap-1.5">With <PersonChip id={h.host_id} size={14} /> · {WEEKDAYS[h.weekday - 1]}s {h.start_time.slice(0, 5)}–{h.end_time.slice(0, 5)} · {h.slot_minutes} min</div>
        <Field label="Slot">
          <Select value={pick || ""} onChange={(e) => setPick(e.target.value || null)} required>
            <option value="">Choose a time…</option>
            {options.map((o) => <option key={o.starts} value={o.starts} disabled={!o.free}>{o.label}{o.free ? "" : " — taken"}</option>)}
          </Select>
        </Field>
        <Field label="What do you want to cover?"><Textarea value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="One or two lines so they can prepare" style={{ minHeight: 60 }} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={!pick}>Book</Button></div>
      </form>
    </Modal>
  );
}

function PublishModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [weekday, setWeekday] = React.useState(3);
  const [start, setStart] = React.useState("15:00");
  const [end, setEnd] = React.useState("16:00");
  const [mins, setMins] = React.useState(15);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || end <= start) return toast.push("End must be after start", "danger");
    setBusy(true);
    const { error } = await createClient().from("office_hours").insert({ org_id: profile.org_id!, host_id: profile.id, department_id: profile.department_id, title: title.trim(), weekday, start_time: start, end_time: end, slot_minutes: mins, note: note.trim() || null });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Office hours published", "success"); setTitle(""); setNote(""); onDone();
  }
  return (
    <Modal open={open} onClose={onClose} title="Publish office hours" width={520}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Topic / title"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Anything about GST & invoicing" required /></Field>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Field label="Weekday"><Select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>{WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}</Select></Field>
          <Field label="From"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
          <Field label="To"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></Field>
          <Field label="Slot"><Select value={mins} onChange={(e) => setMins(Number(e.target.value))}>{[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</Select></Field>
        </div>
        <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bring your numbers; remote via Meet link in the invite" /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Publish</Button></div>
      </form>
    </Modal>
  );
}
