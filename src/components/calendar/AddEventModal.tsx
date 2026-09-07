"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Modal, Select, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, ProjectPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { KINDS, KIND_SINGULAR, KIND_COLOR, type EventKind } from "./calendarUtils";
import { todayLocal } from "@/components/meetings/meetingUtils";

const ADDABLE = KINDS.filter((k) => k !== "meeting" && k !== "leave");

export function AddEventModal({ open, onClose, defaultDate }: { open: boolean; onClose: () => void; defaultDate?: Date | null }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = React.useState<EventKind>("event");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [allDay, setAllDay] = React.useState(true);
  const [date, setDate] = React.useState(() => todayLocal(defaultDate || undefined));
  const [endDate, setEndDate] = React.useState("");
  const [start, setStart] = React.useState("10:00");
  const [end, setEnd] = React.useState("11:00");
  const [projectId, setProjectId] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState(profile.department_id || "");
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    const starts_at = allDay ? new Date(`${date}T00:00:00`).toISOString() : new Date(`${date}T${start}`).toISOString();
    const ends_at = allDay ? (endDate ? new Date(`${endDate}T23:59:59`).toISOString() : null) : end ? new Date(`${date}T${end}`).toISOString() : null;
    if (ends_at && ends_at < starts_at) return toast.push("End must be after start", "danger");
    setLoading(true);
    const { error } = await createClient().from("calendar_events").insert({
      org_id: profile.org_id!,
      kind,
      title: title.trim(),
      description: description.trim() || null,
      starts_at,
      ends_at,
      all_day: allDay,
      project_id: projectId || null,
      department_id: departmentId || null,
      created_by: profile.id,
    });
    setLoading(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Added to the company calendar", "success");
    router.refresh();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add to calendar" width={600}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <span className="label">Kind</span>
          <div className="flex flex-wrap gap-1.5">
            {ADDABLE.map((k) => (
              <button type="button" key={k} onClick={() => setKind(k)} className={cn("pill pill-lg border transition-colors", kind === k ? "border-transparent" : "tone-neutral border-transparent hover:border-[var(--line-strong)]")} style={kind === k ? { background: `color-mix(in oklab, ${KIND_COLOR[k]} 18%, transparent)`, color: "var(--fg)" } : undefined}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: KIND_COLOR[k] }} /> {KIND_SINGULAR[k]}
              </button>
            ))}
          </div>
        </div>
        <Field label="Title">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Diwali holiday · Q3 campaign launch" required />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-[var(--brand)]" /> All day
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label={allDay ? "From" : "Date"}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          {allDay ? (
            <Field label="To (optional)">
              <Input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start">
                <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
              </Field>
              <Field label="End">
                <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </div>
          )}
          <Field label="Project">
            <ProjectPicker value={projectId} onChange={setProjectId} />
          </Field>
          <Field label="Department">
            <DepartmentPicker value={departmentId} onChange={setDepartmentId} />
          </Field>
        </div>
        <Field label="Details">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional context, links…" style={{ minHeight: 72 }} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading}>Add event</Button>
        </div>
      </form>
    </Modal>
  );
}
