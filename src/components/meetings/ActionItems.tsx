"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ListChecks, ExternalLink, Trash2, Sparkles } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { PersonChip, StatusPill } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { cn, relDate, type Meeting, type Tables, type TaskStatus } from "@/lib/utils";

export type MeetingAction = Tables<"meeting_actions">;
export type LinkedTask = { id: string; title: string; status: TaskStatus };

export function ActionItems({ meeting, actions, tasks, canEdit }: { meeting: Meeting; actions: MeetingAction[]; tasks: LinkedTask[]; canEdit: boolean }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [owner, setOwner] = React.useState("");
  const [due, setDue] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const taskById = React.useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const pending = actions.filter((a) => !a.task_id);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy("add");
    const { error } = await createClient().from("meeting_actions").insert({ meeting_id: meeting.id, title: title.trim(), owner_id: owner || null, due_date: due || null });
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    setTitle("");
    setOwner("");
    setDue("");
    router.refresh();
  }

  async function remove(a: MeetingAction) {
    setBusy(a.id);
    const { error } = await createClient().from("meeting_actions").delete().eq("id", a.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    router.refresh();
  }

  async function createTask(a: MeetingAction): Promise<boolean> {
    const supabase = createClient();
    const assignee = a.owner_id || null;
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        org_id: profile.org_id!,
        title: a.title,
        description: `From meeting: ${meeting.title}`,
        project_id: meeting.project_id,
        department_id: meeting.department_id,
        assignee_id: assignee,
        owner_id: meeting.organizer_id || profile.id,
        delegated_by: assignee && assignee !== profile.id ? profile.id : null,
        due_date: a.due_date ? new Date(`${a.due_date}T18:00:00`).toISOString() : null,
        source_meeting_id: meeting.id,
        created_by: profile.id,
        status: "todo",
      })
      .select("id")
      .single();
    if (error || !data) {
      toast.push(error?.message || "Could not create task", "danger");
      return false;
    }
    const { error: uErr } = await supabase.from("meeting_actions").update({ task_id: data.id, confirmed: true }).eq("id", a.id);
    if (uErr) {
      toast.push(uErr.message, "danger");
      return false;
    }
    return true;
  }

  async function createOne(a: MeetingAction) {
    setBusy(a.id);
    const ok = await createTask(a);
    setBusy(null);
    if (ok) {
      toast.push("Task created and assigned", "success");
      router.refresh();
    }
  }

  async function createAll() {
    setBusy("all");
    let n = 0;
    for (const a of pending) if (await createTask(a)) n++;
    setBusy(null);
    toast.push(`${n} task${n === 1 ? "" : "s"} created`, n ? "success" : "danger");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><ListChecks size={15} /> Action items</span>}
        subtitle={actions.length ? `${actions.filter((a) => a.confirmed).length}/${actions.length} confirmed as tasks` : "Capture who does what by when"}
        action={canEdit && pending.length > 1 ? <Button size="sm" variant="primary" loading={busy === "all"} onClick={createAll}><Sparkles size={13} /> Create all {pending.length} tasks</Button> : undefined}
      />
      <div className="px-[var(--s3)] pb-[var(--s3)]">
        {actions.length === 0 && <div className="text-sm text-muted px-2 py-2">No action items yet.</div>}
        <ul className="space-y-1">
          {actions.map((a) => {
            const t = a.task_id ? taskById.get(a.task_id) : undefined;
            return (
              <li key={a.id} className={cn("flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius-sm)]", a.confirmed ? "bg-[color-mix(in_oklab,var(--success)_7%,transparent)]" : "row-hover")}>
                <span className={cn("w-2 h-2 rounded-full shrink-0", t?.status === "done" ? "bg-[var(--success)]" : a.confirmed ? "bg-[var(--info)]" : "bg-[var(--warn)]")} />
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm leading-snug", t?.status === "done" && "line-through text-muted")}>{a.title}</div>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[11px] text-muted">
                    <PersonChip id={a.owner_id} size={16} />
                    {a.due_date && <span className="num">Due {relDate(a.due_date)}</span>}
                    {t && (
                      <Link href={`/tasks/${t.id}`} className="pill tone-info hover:underline"><ExternalLink size={10} /> Task <StatusPill status={t.status} /></Link>
                    )}
                    {!t && a.task_id && <Link href={`/tasks/${a.task_id}`} className="pill tone-info hover:underline"><ExternalLink size={10} /> Task</Link>}
                  </div>
                </div>
                {canEdit && !a.task_id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="xs" variant="primary" loading={busy === a.id} onClick={() => createOne(a)}>Create task</Button>
                    <Button size="xs" variant="ghost" icon aria-label="Remove" onClick={() => remove(a)}><Trash2 size={13} /></Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {canEdit && (
          <form onSubmit={add} className="mt-3 pt-3 border-t grid grid-cols-1 sm:grid-cols-[1fr_180px_150px_auto] gap-2 items-end">
            <Field label="New action item" className="min-w-0">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen?" />
            </Field>
            <Field label="Owner" className="min-w-0">
              <PersonPicker value={owner} onChange={setOwner} placeholder="Owner" />
            </Field>
            <Field label="Due" className="min-w-0">
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
            <Button type="submit" variant="secondary" loading={busy === "add"} className="h-9"><Plus size={14} /> Add</Button>
          </form>
        )}
      </div>
    </Card>
  );
}
