"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarHeart, Check, HelpCircle, MapPin, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AvatarStack, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pill, Select, Tabs, Textarea, useToast } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { cn, fmtDate, fmtTime, relDate, type Tables } from "@/lib/utils";
import { EVENT_KINDS, EVENT_KIND_LABEL, useTouchModule } from "@/components/intel/lib";

export type EventRow = Tables<"events">;
export type RsvpRow = { event_id: string; user_id: string; status: string };
const KIND_TONE: Record<string, string> = { training: "tone-info", town_hall: "tone-violet", team_meeting: "tone-neutral", celebration: "tone-orange", event: "tone-brand" };

/** Company events with RSVP (yes / maybe / no). Creating is for leads, HR and above (RLS). */
export function Events({ events, rsvps, canCreate }: { events: EventRow[]; rsvps: RsvpRow[]; canCreate: boolean }) {
  const { profile, departments, people } = useSession();
  const router = useRouter();
  const toast = useToast();
  useTouchModule("events");
  useSeen("nav:/events");
  const [tab, setTab] = React.useState<"upcoming" | "past">("upcoming");
  const [create, setCreate] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [now] = React.useState(() => Date.now());
  const list = events.filter((e) => (tab === "upcoming" ? new Date(e.ends_at || e.starts_at).getTime() >= now : new Date(e.ends_at || e.starts_at).getTime() < now)).sort((a, b) => (tab === "upcoming" ? a.starts_at.localeCompare(b.starts_at) : b.starts_at.localeCompare(a.starts_at)));

  async function rsvp(e: EventRow, status: "yes" | "maybe" | "no") {
    setBusy(e.id);
    const { error } = await createClient().from("event_rsvps").upsert({ event_id: e.id, user_id: profile.id, status });
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push(status === "yes" ? "See you there" : status === "maybe" ? "Marked as maybe" : "Declined", status === "yes" ? "success" : "info"); router.refresh();
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Company" title="Events" subtitle="Trainings, town halls, celebrations — RSVP so organisers can plan." actions={canCreate ? <Button variant="primary" onClick={() => setCreate(true)}><Plus size={15} /> New event</Button> : undefined} />
      <Tabs tabs={[{ key: "upcoming" as const, label: "Upcoming", count: events.filter((e) => new Date(e.ends_at || e.starts_at).getTime() >= now).length }, { key: "past" as const, label: "Past" }]} value={tab} onChange={setTab} className="mb-3" />
      {list.length === 0 ? <Card><EmptyState icon={<CalendarHeart size={18} />} title={tab === "upcoming" ? "Nothing coming up" : "No past events"} hint={canCreate ? "Create one — it lands on everyone's calendar." : undefined} /></Card> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
          {list.map((e) => {
            const mine = rsvps.find((r) => r.event_id === e.id && r.user_id === profile.id)?.status;
            const going = rsvps.filter((r) => r.event_id === e.id && r.status === "yes");
            const past = tab === "past";
            return (
              <Card key={e.id} className="p-[var(--s3)] flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap"><Pill tone={KIND_TONE[e.kind] || "tone-neutral"}>{EVENT_KIND_LABEL[e.kind] || e.kind}</Pill><span className="text-[11px] text-muted ml-auto num">{relDate(e.starts_at)}</span></div>
                <div className="font-medium">{e.title}</div>
                <div className="text-xs text-muted num">{fmtDate(e.starts_at)} · {fmtTime(e.starts_at)}{e.ends_at ? `–${fmtTime(e.ends_at)}` : ""}</div>
                {e.location && <div className="text-xs text-muted inline-flex items-center gap-1"><MapPin size={11} /> {e.location}</div>}
                {e.description && <div className="text-xs text-2 truncate-2">{e.description}</div>}
                {e.department_ids && e.department_ids.length > 0 && <div className="text-[11px] text-muted">For {e.department_ids.map((id) => departments.find((d) => d.id === id)?.name).filter(Boolean).join(", ")}</div>}
                <div className="flex items-center gap-2 mt-auto pt-1">
                  {going.length > 0 && <span className="inline-flex items-center gap-1.5 text-[11px] text-muted"><AvatarStack people={going.map((g) => people.find((p) => p.id === g.user_id)).filter((p): p is NonNullable<typeof p> => !!p)} size={18} max={4} /> {going.length} going</span>}
                  {e.created_by && <span className="text-[11px] text-muted ml-auto inline-flex items-center gap-1">by <PersonChip id={e.created_by} size={12} showName={false} /></span>}
                </div>
                {!past && (
                  <div className="flex gap-1">
                    <Button size="xs" variant={mine === "yes" ? "success" : "secondary"} loading={busy === e.id} onClick={() => rsvp(e, "yes")} className={cn("flex-1")}><Check size={12} /> Going</Button>
                    <Button size="xs" variant={mine === "maybe" ? "primary" : "secondary"} disabled={busy === e.id} onClick={() => rsvp(e, "maybe")} className="flex-1"><HelpCircle size={12} /> Maybe</Button>
                    <Button size="xs" variant={mine === "no" ? "danger" : "secondary"} disabled={busy === e.id} onClick={() => rsvp(e, "no")} className="flex-1"><X size={12} /> No</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={create} onClose={() => setCreate(false)} title="New event" width={560}><EventForm onDone={() => { setCreate(false); router.refresh(); }} onCancel={() => setCreate(false)} /></Modal>
    </div>
  );
}

function EventForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { profile, departments } = useSession();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState("event");
  const [desc, setDesc] = React.useState("");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [deptIds, setDeptIds] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !start) return;
    setBusy(true);
    const { error } = await createClient().from("events").insert({ org_id: profile.org_id!, title: title.trim(), kind, description: desc.trim() || null, starts_at: new Date(start).toISOString(), ends_at: end ? new Date(end).toISOString() : null, location: location.trim() || null, department_ids: deptIds.length ? deptIds : null, created_by: profile.id });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Event created — it is on the company calendar", "success"); onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2">
        <Field label="Kind"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{EVENT_KINDS.map((k) => <option key={k} value={k}>{EVENT_KIND_LABEL[k]}</option>)}</Select></Field>
        <Field label="Title"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
        <Field label="Starts"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
        <Field label="Ends"><Input type="datetime-local" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Location" className="sm:col-span-2"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Boardroom / Google Meet link" /></Field>
      </div>
      <Field label="Description"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} style={{ minHeight: 64 }} /></Field>
      <Field label="Audience" hint="Leave empty for the whole company."><div className="flex flex-wrap gap-1.5">{departments.map((d) => <button key={d.id} type="button" onClick={() => setDeptIds((s) => (s.includes(d.id) ? s.filter((x) => x !== d.id) : [...s, d.id]))} className={cn("pill pill-lg", deptIds.includes(d.id) ? "tone-brand" : "tone-neutral")}>{d.name}</button>)}</div></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Create</Button></div>
    </form>
  );
}
