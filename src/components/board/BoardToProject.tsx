"use client";
/** Element → task, and board → project (frames are milestones, stickies inside them are tasks). */
import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, FolderKanban, Trash2 } from "lucide-react";
import { boardTask, boardToProject } from "@/lib/live/client";
import { Button, Field, Input, Modal, Select, Textarea, useToast } from "@/components/ui";
import { PersonPicker, PriorityPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import type { TaskPriority } from "@/lib/utils";
import type { BoardElement, BoardPage } from "@/lib/live/types";
import { elementsInFrame } from "./boardDraw";

export function ElementTaskModal({
  open, onClose, boardId, element, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  element: BoardElement | null;
  onCreated: (elementId: string, taskId: string) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [assignee, setAssignee] = React.useState<string | null>(null);
  const [due, setDue] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!element) return;
    const t = setTimeout(() => {
      setTitle((element.text || element.title || "").trim().slice(0, 180));
      setAssignee(null);
      setDue("");
    }, 0);
    return () => clearTimeout(t);
  }, [element]);

  async function create() {
    if (!element || !title.trim()) return;
    setBusy(true);
    try {
      const id = await boardTask(boardId, element.id, title.trim(), assignee, due ? new Date(`${due}T18:00:00`).toISOString() : null);
      onCreated(element.id, id);
      toast.push("Task created from this note", "success");
      onClose();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not create the task", "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open && !!element}
      onClose={onClose}
      title="Create a task from this note"
      width={480}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={create} loading={busy} disabled={!title.trim()}><CheckSquare size={14} /> Create task</Button></>}
    >
      <div className="space-y-[var(--s3)]">
        <Field label="Task">
          <Textarea value={title} onChange={(e) => setTitle(e.target.value)} style={{ minHeight: 72 }} autoFocus />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Assign to"><PersonPicker value={assignee} onChange={(v) => setAssignee(v || null)} /></Field>
          <Field label="Due"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
        <p className="text-[11px] text-muted">The task links back to this element on the board, and a badge appears on the note.</p>
      </div>
    </Modal>
  );
}

type Item = { id: string; title: string; milestone: string; assignee_id: string | null; priority: TaskPriority; due: string };

export function BoardToProjectModal({
  open, onClose, boardId, boardTitle, pages, pageId,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  boardTitle: string;
  pages: BoardPage[];
  pageId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [name, setName] = React.useState(boardTitle);
  const [due, setDue] = React.useState("");
  const [scope, setScope] = React.useState<"page" | "all">("page");
  const [items, setItems] = React.useState<Item[]>([]);
  const [busy, setBusy] = React.useState(false);

  const extract = React.useCallback(() => {
    const source = scope === "all" ? pages : pages.filter((p) => p.id === pageId);
    const out: Item[] = [];
    for (const page of source) {
      const frames = page.elements.filter((e) => e.type === "frame");
      const claimed = new Set<string>();
      for (const f of frames) {
        for (const e of elementsInFrame(page.elements, f)) {
          if (!["sticky", "text", "rect", "ellipse", "diamond"].includes(e.type)) continue;
          const t = (e.text || e.title || "").trim();
          if (!t) continue;
          claimed.add(e.id);
          out.push({ id: e.id, title: t.slice(0, 180), milestone: (f.title || f.text || "Milestone").slice(0, 80), assignee_id: null, priority: "normal", due: "" });
        }
      }
      for (const e of page.elements) {
        if (e.type !== "sticky" || claimed.has(e.id)) continue;
        const t = (e.text || "").trim();
        if (!t) continue;
        out.push({ id: e.id, title: t.slice(0, 180), milestone: "Unsorted", assignee_id: null, priority: "normal", due: "" });
      }
    }
    setItems(out);
  }, [pages, pageId, scope]);

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { setName(boardTitle); extract(); }, 0);
    return () => clearTimeout(t);
  }, [open, boardTitle, extract]);

  async function create() {
    if (!name.trim() || !items.length) return;
    setBusy(true);
    try {
      const id = await boardToProject(
        boardId,
        name.trim(),
        items.map((i) => ({
          title: i.title,
          description: `From board **${boardTitle}** · ${i.milestone}`,
          assignee_id: i.assignee_id,
          priority: i.priority,
          due: i.due ? new Date(`${i.due}T18:00:00`).toISOString() : null,
        })),
        due || null
      );
      toast.push("Project created", "success");
      onClose();
      router.push(`/projects/${id}`);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not create the project", "danger");
    } finally {
      setBusy(false);
    }
  }

  const grouped = React.useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) m.set(i.milestone, [...(m.get(i.milestone) || []), i]);
    return [...m.entries()];
  }, [items]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Turn this board into a project"
      width={720}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} loading={busy} disabled={!name.trim() || !items.length}>
            <FolderKanban size={14} /> Create project with {items.length} task{items.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="space-y-[var(--s3)]">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Project name" className="sm:col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Target date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
        <div className="flex items-center gap-2">
          <Select value={scope} onChange={(e) => setScope(e.target.value as "page" | "all")} className="w-auto">
            <option value="page">This page only</option>
            <option value="all">All pages</option>
          </Select>
          <Button size="sm" onClick={extract}>Re-read the board</Button>
          <span className="text-xs text-muted">Frames become milestones; the notes inside them become tasks.</span>
        </div>

        {!items.length && <p className="text-sm text-muted">Nothing found. Add some sticky notes inside a frame first.</p>}

        <div className="space-y-3 max-h-[46vh] overflow-y-auto">
          {grouped.map(([milestone, list]) => (
            <div key={milestone}>
              <div className="eyebrow mb-1.5">{milestone} · {list.length}</div>
              <div className="space-y-1.5">
                {list.map((i) => (
                  <div key={i.id} className="grid grid-cols-1 sm:grid-cols-[1fr_150px_120px_110px_32px] gap-1.5 items-center">
                    <Input value={i.title} onChange={(e) => setItems((s) => s.map((x) => (x.id === i.id ? { ...x, title: e.target.value } : x)))} />
                    <PersonPicker value={i.assignee_id} onChange={(v) => setItems((s) => s.map((x) => (x.id === i.id ? { ...x, assignee_id: v || null } : x)))} />
                    <PriorityPicker value={i.priority} onChange={(v) => setItems((s) => s.map((x) => (x.id === i.id ? { ...x, priority: v } : x)))} />
                    <Input type="date" value={i.due} onChange={(e) => setItems((s) => s.map((x) => (x.id === i.id ? { ...x, due: e.target.value } : x)))} />
                    <Button variant="ghost" size="sm" icon aria-label="Remove" onClick={() => setItems((s) => s.filter((x) => x.id !== i.id))}><Trash2 size={14} /></Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted">Created by {profile.full_name}. Review the list before creating — nothing is written until you press the button.</p>
      </div>
    </Modal>
  );
}
