"use client";
/**
 * Shared notes (§69, §70, §71, §141, §198). Everyone edits the same `live_notes.body`;
 * writes are debounced 600 ms and broadcast so the room sees them as they are typed.
 * The same tab records decisions, creates tasks and bookmarks the moment.
 */
import * as React from "react";
import { Bookmark, CheckSquare, Gavel, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Modal, Textarea, useToast } from "@/components/ui";
import { PersonPicker, PriorityPicker } from "@/components/pickers";
import { bookmark as bookmarkRoom, roomDecision, roomTask } from "@/lib/live/client";
import { liveChannelName, type LiveDataMessage } from "@/lib/live/types";
import type { TaskPriority } from "@/lib/utils";

export function RoomNotes({
  roomId,
  orgId,
  meId,
  send,
  incoming,
}: {
  roomId: string;
  orgId: string;
  meId: string;
  send: (m: LiveDataMessage) => void;
  /** Notes pushed by other participants over the data channel. */
  incoming: { body: string; version: number } | null;
}) {
  const toast = useToast();
  const [body, setBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const versionRef = React.useRef(0);
  const dirtyRef = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [taskOpen, setTaskOpen] = React.useState(false);
  const [decisionOpen, setDecisionOpen] = React.useState(false);

  React.useEffect(() => {
    const sb = createClient();
    let alive = true;
    void sb
      .from("live_notes")
      .select("body,version")
      .eq("room_id", roomId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setBody(data?.body || "");
        versionRef.current = data?.version || 0;
        setLoaded(true);
      });
    const rt = sb
      .channel(liveChannelName(roomId))
      .on("postgres_changes", { event: "*", schema: "public", table: "live_notes", filter: `room_id=eq.${roomId}` }, (p) => {
        const row = p.new as { body?: string; version?: number; updated_by?: string };
        if (!row || row.updated_by === meId) return;
        if ((row.version ?? 0) >= versionRef.current && !dirtyRef.current) {
          versionRef.current = row.version ?? 0;
          setBody(row.body || "");
        }
      })
      .subscribe();
    return () => {
      alive = false;
      void sb.removeChannel(rt);
    };
  }, [roomId, meId]);

  // Live text from the data channel (faster than the DB round-trip).
  React.useEffect(() => {
    if (!incoming || dirtyRef.current) return;
    if (incoming.version >= versionRef.current) {
      versionRef.current = incoming.version;
      setBody(incoming.body);
    }
  }, [incoming]);

  const save = React.useCallback(
    (next: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        setSaving(true);
        const version = versionRef.current + 1;
        versionRef.current = version;
        await createClient()
          .from("live_notes")
          .upsert({ room_id: roomId, org_id: orgId, body: next, version, updated_by: meId, updated_at: new Date().toISOString() }, { onConflict: "room_id" });
        send({ t: "notes", body: next, version });
        dirtyRef.current = false;
        setSaving(false);
      }, 600);
    },
    [roomId, orgId, meId, send]
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b shrink-0">
        <Button size="xs" variant="ghost" onClick={() => setDecisionOpen(true)}><Gavel size={13} /> Record decision</Button>
        <Button size="xs" variant="ghost" onClick={() => setTaskOpen(true)}><CheckSquare size={13} /> Create task</Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={async () => {
            await bookmarkRoom(roomId, "Important moment").catch(() => null);
            toast.push("Moment bookmarked", "success");
          }}
        >
          <Bookmark size={13} /> Bookmark
        </Button>
        {saving && <Loader2 size={13} className="animate-spin text-muted ml-auto" />}
      </div>
      <Textarea
        value={body}
        disabled={!loaded}
        onChange={(e) => {
          dirtyRef.current = true;
          setBody(e.target.value);
          save(e.target.value);
        }}
        placeholder={"Shared notes — everyone in this room sees what you type.\n\nAgenda\n• \n\nDecisions\n• \n\nNext steps\n• "}
        className="flex-1 min-h-0 rounded-none border-0 focus:shadow-none resize-none"
        style={{ minHeight: 0 }}
      />

      <TaskModal open={taskOpen} onClose={() => setTaskOpen(false)} roomId={roomId} />
      <DecisionModal open={decisionOpen} onClose={() => setDecisionOpen(false)} roomId={roomId} />
    </div>
  );
}

export function TaskModal({
  open,
  onClose,
  roomId,
  initialTitle,
  attachment,
  label = "Create a task from this room",
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
  initialTitle?: string;
  attachment?: { path: string; name: string; type: string; size?: number } | null;
  label?: string;
}) {
  const toast = useToast();
  const [title, setTitle] = React.useState(initialTitle || "");
  const [assignee, setAssignee] = React.useState("");
  const [due, setDue] = React.useState("");
  const [priority, setPriority] = React.useState<TaskPriority>("normal");
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!title.trim()) return toast.push("Give the task a title", "danger");
    setBusy(true);
    try {
      await roomTask(roomId, {
        title: title.trim(),
        assigneeId: assignee || null,
        due: due ? new Date(`${due}T18:00:00`).toISOString() : null,
        priority,
        description: description.trim() || null,
        attachments: attachment ? [attachment] : [],
      });
      toast.push("Task created", "success");
      setTitle("");
      setDescription("");
      onClose();
    } catch (e) {
      toast.push((e as Error).message, "danger");
    }
    setBusy(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={label}
      width={520}
      footer={
        <>
          <Button size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" loading={busy} onClick={() => void submit()}>Create</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="What needs to happen?">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fix the alignment on the pricing page" autoFocus />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Assign to"><PersonPicker value={assignee} onChange={setAssignee} /></Field>
          <Field label="Due"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Priority"><PriorityPicker value={priority} onChange={setPriority} /></Field>
        </div>
        <Field label="Details" hint={attachment ? `A screenshot from the shared screen will be attached (${attachment.name}).` : undefined}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Context the assignee will need." style={{ minHeight: 80 }} />
        </Field>
      </div>
    </Modal>
  );
}

export function DecisionModal({ open, onClose, roomId }: { open: boolean; onClose: () => void; roomId: string }) {
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [decision, setDecision] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!title.trim() || !decision.trim()) return toast.push("A decision needs a title and the decision itself", "danger");
    setBusy(true);
    try {
      await roomDecision(roomId, { title: title.trim(), decision: decision.trim(), reason: reason.trim() || null });
      toast.push("Decision recorded", "success");
      setTitle("");
      setDecision("");
      setReason("");
      onClose();
    } catch (e) {
      toast.push((e as Error).message, "danger");
    }
    setBusy(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a decision"
      width={520}
      footer={
        <>
          <Button size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" loading={busy} onClick={() => void submit()}>Record</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Decision about"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Launch date for the investor portal" autoFocus /></Field>
        <Field label="What was decided"><Textarea value={decision} onChange={(e) => setDecision(e.target.value)} style={{ minHeight: 76 }} /></Field>
        <Field label="Why" hint="Future you will thank present you."><Textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 60 }} /></Field>
      </div>
    </Modal>
  );
}
