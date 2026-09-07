"use client";

import * as React from "react";
import { UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Field, Input, Modal, SearchInput, Select, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";
import type { Course } from "./lib";

export function AssignTrainingModal({ courses, initialCourseId, initialPeople, onClose, onDone }: { courses: Course[]; initialCourseId?: string; initialPeople?: string[]; onClose: () => void; onDone: () => void }) {
  const { profile, people, departments } = useSession();
  const toast = useToast();
  const [courseId, setCourseId] = React.useState(initialCourseId || courses[0]?.id || "");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(initialPeople || []));
  const [due, setDue] = React.useState("");
  const [q, setQ] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const list = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people.filter((p) => p.id !== profile.id && (!dept || p.department_id === dept) && (!needle || p.full_name.toLowerCase().includes(needle) || (p.designation || "").toLowerCase().includes(needle)));
  }, [people, profile.id, q, dept]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSelected((s) => { const n = new Set(s); list.forEach((p) => n.add(p.id)); return n; });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || selected.size === 0) return;
    setLoading(true);
    const rows = [...selected].map((user_id) => ({ course_id: courseId, user_id, assigned_by: profile.id, due_on: due || null }));
    const { error } = await createClient().from("enrollments").upsert(rows, { onConflict: "course_id,user_id", ignoreDuplicates: true });
    setLoading(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`Assigned to ${selected.size} ${selected.size === 1 ? "person" : "people"}. They have been notified.`, "success");
    onDone();
  }

  return (
    <Modal open onClose={onClose} title="Assign training" width={620}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid sm:grid-cols-[1fr_170px] gap-3">
          <Field label="Course">
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
              {courses.length === 0 && <option value="">No published courses</option>}
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}{c.mandatory ? " (mandatory)" : ""}</option>)}
            </Select>
          </Field>
          <Field label="Complete by" hint="Optional">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="label !mb-0">People <span className="text-muted font-normal">· {selected.size} selected</span></span>
            <button type="button" className="text-xs link" onClick={selectAll}>Select all shown</button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mb-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="flex-1" />
            <Select value={dept} onChange={(e) => setDept(e.target.value)} className="sm:w-[180px]">
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div className="border rounded-[var(--radius-sm)] max-h-[280px] overflow-y-auto divide-y">
            {list.length === 0 && <div className="text-sm text-muted p-3 text-center">Nobody matches.</div>}
            {list.map((p) => (
              <label key={p.id} className={cn("flex items-center gap-2.5 px-3 py-2 cursor-pointer row-hover", selected.has(p.id) && "bg-[var(--neutral-bg)]")}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="accent-[var(--brand)]" />
                <Avatar name={p.full_name} src={p.avatar_url} size={24} />
                <span className="text-sm truncate flex-1">{p.full_name}</span>
                <span className="text-[11px] text-muted truncate max-w-[40%]">{p.designation || departments.find((d) => d.id === p.department_id)?.name || ""}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading} disabled={!courseId || selected.size === 0}><UserPlus size={14} /> Assign{selected.size ? ` to ${selected.size}` : ""}</Button>
        </div>
        <div className="text-[11px] text-muted flex items-center gap-1.5"><Users size={11} /> Everyone selected gets a notification with the due date. People already enrolled are skipped.</div>
      </form>
    </Modal>
  );
}
