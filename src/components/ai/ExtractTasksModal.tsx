"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Mic, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Modal, Skeleton, Textarea, useToast } from "@/components/ui";
import { PersonPicker, PriorityPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { AIDisabledNote } from "@/components/ai/AIDisabledNote";
import { callAI, type ExtractedTasks } from "@/lib/ai/types";
import { cn, type Channel, type TaskPriority } from "@/lib/utils";
import { dayLabel, personName, timeLabel } from "@/components/chat/lib";
import type { ChatMessage, PersonLite } from "@/components/chat/types";

type Row = { selected: boolean; title: string; description: string; assignee_id: string; due: string; priority: TaskPriority };
type Result = { key: string; data?: ExtractedTasks; error?: string; disabled?: boolean; empty?: boolean };

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function matchPerson(name: string | null, people: { id: string; full_name: string }[]) {
  if (!name) return "";
  const n = name.trim().toLowerCase();
  if (!n) return "";
  const exact = people.find((p) => p.full_name.toLowerCase() === n);
  if (exact) return exact.id;
  const hits = people.filter((p) => p.full_name.toLowerCase().startsWith(n) || p.full_name.toLowerCase().split(" ")[0] === n.split(" ")[0]);
  return hits.length === 1 ? hits[0]!.id : "";
}

/**
 * "Extract tasks (AI)" for a chat message, thread parent (replies included) or voice note (transcript = body).
 * Proposals are editable; nothing is created until "Create N tasks".
 */
export function ExtractTasksModal({ m, channel, replyCount, threadReplies, authorOf, onClose, onCreated }: {
  m: ChatMessage | null;
  channel: Channel;
  replyCount?: number;
  /** Replies already loaded by the thread panel (avoids a refetch). */
  threadReplies?: ChatMessage[];
  authorOf: (id: string | null) => PersonLite | undefined;
  onClose: () => void;
  onCreated: (created: { id: string; title: string }[], src: ChatMessage) => void;
}) {
  const { profile, people } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [result, setResult] = React.useState<Result | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [busy, setBusy] = React.useState(false);
  const open = !!m;
  const key = m ? m.id : null;
  const isVoice = m?.kind === "voice";
  const hasText = !!m?.body.trim();
  const loading = !!key && result?.key !== key;
  // Latest props, read inside the effect so reactions/new replies do not re-trigger the AI call.
  const latest = React.useRef({ m, threadReplies, replyCount, channel, people, authorOf });
  React.useEffect(() => {
    latest.current = { m, threadReplies, replyCount, channel, people, authorOf };
  });

  React.useEffect(() => {
    if (!key) return;
    const { m, threadReplies, replyCount, channel, people, authorOf } = latest.current;
    if (!m) return;
    if (!m.body.trim()) {
      const t = setTimeout(() => setResult({ key, empty: true }), 0);
      return () => clearTimeout(t);
    }
    let alive = true;
    (async () => {
      try {
        const nameOf = (id: string | null) => personName(authorOf(id));
        let replies = threadReplies;
        if (!replies && !m.parent_id && (replyCount || 0) > 0) {
          const { data } = await createClient().from("messages").select("*").eq("parent_id", m.id).is("deleted_at", null).order("created_at").limit(100);
          replies = (data || []).map((r) => ({ ...r, reactions: [] }));
        }
        const lines = [`${nameOf(m.author_id)}: ${m.body}`];
        for (const r of replies || []) if (r.body.trim() && r.kind !== "system") lines.push(`${nameOf(r.author_id)}: ${r.body}`);
        const text = lines.join("\n").slice(0, 8000);
        const data = await callAI<ExtractedTasks>("extract-tasks", { text, senderName: nameOf(m.author_id), projectName: channel.type === "project" ? channel.name : undefined });
        if (!alive) return;
        setResult({ key, data });
        setRows(data.tasks.map((t) => ({ selected: true, title: t.title, description: t.description || "", assignee_id: t.assignee_id || matchPerson(t.assignee_name, people), due: toLocalInput(t.due_date), priority: t.priority })));
      } catch (e) {
        if (!alive) return;
        const err = e as Error & { disabled?: boolean };
        setResult({ key, error: err.message, disabled: err.disabled });
      }
    })();
    return () => {
      alive = false;
    };
  }, [key]);

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const selected = rows.filter((r) => r.selected && r.title.trim());

  async function create() {
    if (!m || !selected.length) return;
    setBusy(true);
    const supabase = createClient();
    const created: { id: string; title: string }[] = [];
    let failed = 0;
    for (const r of selected) {
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          org_id: profile.org_id!,
          title: r.title.trim(),
          description: r.description.trim() || null,
          project_id: channel.project_id,
          department_id: channel.department_id || profile.department_id || null,
          assignee_id: r.assignee_id || null,
          owner_id: profile.id,
          delegated_by: r.assignee_id && r.assignee_id !== profile.id ? profile.id : null,
          due_date: r.due ? new Date(r.due).toISOString() : null,
          priority: r.priority,
          source_message_id: m.id,
          created_by: profile.id,
          status: "todo",
        })
        .select("id,title")
        .single();
      if (error || !data) failed++;
      else created.push(data);
    }
    setBusy(false);
    if (failed) toast.push(`${failed} task${failed === 1 ? "" : "s"} could not be created`, "danger");
    if (created.length) {
      toast.push(`${created.length} task${created.length === 1 ? "" : "s"} created`, "success");
      onCreated(created, m);
      router.refresh();
      onClose();
    }
  }

  const current = result?.key === key ? result : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><Sparkles size={16} className="text-[var(--accent)]" /> Extract tasks</span>}
      width={680}
      footer={current?.data && rows.length ? (
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} loading={busy} disabled={!selected.length}>Create {selected.length || ""} task{selected.length === 1 ? "" : "s"}</Button>
        </>
      ) : undefined}
    >
      {m && (
        <div className="rounded-[var(--radius-sm)] border sunken px-3 py-2 mb-3 text-sm max-h-24 overflow-hidden">
          <div className="text-[11px] text-muted mb-0.5 inline-flex items-center gap-1">{isVoice && <Mic size={11} />}{personName(authorOf(m.author_id))} · {dayLabel(m.created_at)} {timeLabel(m.created_at)}{(replyCount || threadReplies?.length) ? " · thread included" : ""}</div>
          <div className="truncate-2">{hasText ? m.body : <span className="text-muted italic">{isVoice ? "Voice note" : "No text"}</span>}</div>
        </div>
      )}

      {current?.empty ? (
        <div className="text-sm text-muted rounded-[var(--radius-sm)] border px-3 py-3">
          {isVoice ? "No transcript available yet — transcription arrives with the communication superlayer. Once this voice note has a transcript, tasks can be extracted from it." : "This message has no text to extract tasks from."}
        </div>
      ) : loading ? (
        <div className="space-y-2 py-2">
          <div className="text-xs text-muted inline-flex items-center gap-1.5"><Sparkles size={12} className="text-[var(--accent)]" /> Reading the message{replyCount ? " and its thread" : ""}…</div>
          <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-5/6" />
        </div>
      ) : current?.disabled ? (
        <AIDisabledNote compact />
      ) : current?.error ? (
        <div className="flex items-start gap-2 text-sm text-danger rounded-[var(--radius-sm)] border border-[var(--danger)] px-3 py-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{current.error}</span></div>
      ) : current?.data ? (
        <div className="space-y-3">
          {current.data.summary && <div className="text-sm text-2">{current.data.summary}</div>}
          {rows.length === 0 ? (
            <div className="text-sm text-muted rounded-[var(--radius-sm)] border px-3 py-3">No actionable tasks found in this message.</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className={cn("rounded-[var(--radius-sm)] border p-2.5 grid gap-2 grid-cols-[auto_minmax(0,1fr)] items-start", !r.selected && "opacity-60")}>
                  <input type="checkbox" checked={r.selected} onChange={(e) => setRow(i, { selected: e.target.checked })} className="accent-[var(--brand)] mt-2.5" aria-label="Include task" />
                  <div className="grid gap-2 min-w-0">
                    <Input value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} placeholder="Task title" className="font-medium" />
                    {r.description && <Textarea value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} style={{ minHeight: 44 }} className="text-[13px]" />}
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_120px]">
                      <PersonPicker value={r.assignee_id} onChange={(v) => setRow(i, { assignee_id: v })} />
                      <Input type="datetime-local" value={r.due} onChange={(e) => setRow(i, { due: e.target.value })} />
                      <PriorityPicker value={r.priority} onChange={(v) => setRow(i, { priority: v })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="text-[11px] text-muted">Tasks link back to this message{channel.project_id ? " and the project" : ""}. Assignees are notified automatically.</div>
        </div>
      ) : null}
    </Modal>
  );
}
