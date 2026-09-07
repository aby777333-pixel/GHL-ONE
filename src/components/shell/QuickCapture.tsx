"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListChecks, FolderKanban, Video, CheckSquare, Lightbulb, StickyNote, Wand2, MessageSquare } from "lucide-react";
import { Modal, Button, Field, Input, Textarea, useToast } from "@/components/ui";
import { QuickTaskForm } from "@/components/tasks/QuickTaskForm";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";

type Kind = "task" | "idea" | "note";

/** Capture first, organise later: task / idea / note from anywhere; shortcuts to project, meeting, approval, delegation. */
export function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [kind, setKind] = React.useState<Kind>("task");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const close = React.useCallback(() => { setKind("task"); setTitle(""); setBody(""); onClose(); }, [onClose]);
  const go = (href: string) => { close(); router.push(href); };

  async function saveIdeaOrNote(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    const supabase = createClient();
    if (kind === "idea") {
      const { error } = await supabase.from("ideas").insert({ org_id: profile.org_id!, title: title.trim(), body: body || null, author_id: profile.id });
      setLoading(false);
      if (error) return toast.push(error.message, "danger");
      toast.push("Idea posted to the Idea Board", "success");
    } else {
      // A note is a private task in backlog assigned to me — organised later.
      const { error } = await supabase.from("tasks").insert({ org_id: profile.org_id!, title: title.trim(), description: body || null, assignee_id: profile.id, owner_id: profile.id, created_by: profile.id, status: "backlog", priority: "low", tags: ["note"] });
      setLoading(false);
      if (error) return toast.push(error.message, "danger");
      toast.push("Note saved to your backlog", "success");
    }
    router.refresh();
    close();
  }

  const tabs: { k: Kind; label: string; icon: React.ReactNode }[] = [
    { k: "task", label: "Task", icon: <ListChecks size={14} /> },
    { k: "idea", label: "Idea", icon: <Lightbulb size={14} /> },
    { k: "note", label: "Note", icon: <StickyNote size={14} /> },
  ];

  return (
    <Modal open={open} onClose={close} title="Quick capture" width={600}>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {tabs.map((t) => (
          <button key={t.k} onClick={() => setKind(t.k)} className={cn("btn btn-sm", kind === t.k ? "btn-primary" : "btn-secondary")}>{t.icon} {t.label}</button>
        ))}
        <span className="mx-1 h-5 w-px bg-[var(--line)] hidden sm:block" />
        <button className="btn btn-sm btn-ghost" onClick={() => go("/delegate")}><Wand2 size={14} /> Delegate</button>
        <button className="btn btn-sm btn-ghost" onClick={() => go("/projects/new")}><FolderKanban size={14} /> Project</button>
        <button className="btn btn-sm btn-ghost" onClick={() => go("/meetings?new=1")}><Video size={14} /> Meeting</button>
        <button className="btn btn-sm btn-ghost" onClick={() => go("/approvals?new=1")}><CheckSquare size={14} /> Approval</button>
        <button className="btn btn-sm btn-ghost" onClick={() => go("/chat")}><MessageSquare size={14} /> Message</button>
      </div>
      {kind === "task" ? (
        <QuickTaskForm onCreated={(id) => { close(); router.push(`/tasks/${id}`); }} onCancel={close} />
      ) : (
        <form onSubmit={saveIdeaOrNote} className="space-y-3">
          <Field label={kind === "idea" ? "Your idea" : "Note"}>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "idea" ? "What could we do better?" : "Something to remember…"} required />
          </Field>
          <Field label="Details">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Optional context" style={{ minHeight: 89 }} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary" loading={loading}>{kind === "idea" ? "Post idea" : "Save note"}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
