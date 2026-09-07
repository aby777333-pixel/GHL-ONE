"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Modal, Select, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, ProjectPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { PeopleMultiSelect } from "./PeopleMultiSelect";
import { DURATIONS, addMinutesIso, localToIso, nextSlot, todayLocal } from "./meetingUtils";

export type ScheduleDefaults = { project_id?: string | null; department_id?: string | null; participants?: string[]; title?: string };

export function ScheduleMeetingModal({ open, onClose, defaults = {}, onCreated }: { open: boolean; onClose: () => void; defaults?: ScheduleDefaults; onCreated?: (id: string) => void }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = React.useState(defaults.title || "");
  const [date, setDate] = React.useState(() => todayLocal());
  const [time, setTime] = React.useState(() => nextSlot());
  const [duration, setDuration] = React.useState<number>(45);
  const [participants, setParticipants] = React.useState<string[]>((defaults.participants || []).filter((id) => id !== profile.id));
  const [projectId, setProjectId] = React.useState(defaults.project_id || "");
  const [departmentId, setDepartmentId] = React.useState(defaults.department_id || profile.department_id || "");
  const [location, setLocation] = React.useState("");
  const [link, setLink] = React.useState("");
  const [agenda, setAgenda] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date || !time) return;
    if (link && !/^https?:\/\//i.test(link.trim())) return toast.push("Meeting link must start with http:// or https://", "danger");
    setLoading(true);
    const supabase = createClient();
    const starts_at = localToIso(date, time);
    const { data, error } = await supabase
      .from("meetings")
      .insert({
        org_id: profile.org_id!,
        title: title.trim(),
        starts_at,
        ends_at: addMinutesIso(starts_at, duration),
        organizer_id: profile.id,
        project_id: projectId || null,
        department_id: departmentId || null,
        location: location.trim() || null,
        meeting_link: link.trim() || null,
        agenda: agenda.trim() || null,
      })
      .select("id")
      .single();
    if (error || !data) {
      setLoading(false);
      return toast.push(error?.message || "Could not schedule", "danger");
    }
    const ids = Array.from(new Set([profile.id, ...participants]));
    const { error: pErr } = await supabase.from("meeting_participants").insert(ids.map((user_id) => ({ meeting_id: data.id, user_id })));
    setLoading(false);
    if (pErr) toast.push(`Meeting created, but participants could not be added: ${pErr.message}`, "danger");
    else toast.push("Meeting scheduled — participants notified", "success");
    router.refresh();
    onCreated?.(data.id);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Schedule a meeting" width={680}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Title">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekly investor-relations sync" required />
        </Field>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Start (IST)">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
          <Field label="Duration" className="col-span-2 sm:col-span-1">
            <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>{d} minutes</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Participants" hint="You are included automatically.">
          <PeopleMultiSelect value={participants} onChange={setParticipants} exclude={[profile.id]} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Project">
            <ProjectPicker value={projectId} onChange={setProjectId} />
          </Field>
          <Field label="Department">
            <DepartmentPicker value={departmentId} onChange={setDepartmentId} />
          </Field>
          <Field label="Location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Boardroom, 4th floor" />
          </Field>
          <Field label="Meeting link">
            <Input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/…" />
          </Field>
        </div>
        <Field label="Agenda" hint="One point per line. Links are picked up automatically.">
          <Textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder={"1. Review last week's actions\n2. Deck status\n3. Risks"} style={{ minHeight: 89 }} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading}>Schedule</Button>
        </div>
      </form>
    </Modal>
  );
}
