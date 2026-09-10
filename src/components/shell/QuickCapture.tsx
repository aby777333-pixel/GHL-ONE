"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListChecks, FolderKanban, Video, CheckSquare, Lightbulb, StickyNote, Wand2, MessageSquare } from "lucide-react";
import { Modal, Button, Field, Input, Textarea, useToast } from "@/components/ui";
import { QuickTaskForm } from "@/components/tasks/QuickTaskForm";
import { createClient } from "@/lib/supabase/client";
import { useSession, useScreens } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";

type Kind = "task" | "idea" | "note";

/** Capture first, organise later: task / idea / note from anywhere; shortcuts to project, meeting, approval, delegation. */
export function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const { canOpen } = useScreens();
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
    /* `active`, not `kind`: when the selected kind is unavailable the tabs fall back to the first
       one that is, and branching on the raw selection here would show "Your idea" while saving a
       note. */
    if (active === "idea") {
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

  /*
   * §5: a module the viewer cannot reach must not be offered here either. A note is a task with a
   * tag, so it lives or dies with Tasks; an idea is its own screen. Since 0053 `canOpen` also
   * answers "is this module in the company's plan", so an unbought module disappears from the
   * capture box the same way it disappears from the sidebar.
   */
  const tabs = ([
    { k: "task", label: "Task", icon: <ListChecks size={14} />, path: "/tasks" },
    { k: "idea", label: "Idea", icon: <Lightbulb size={14} />, path: "/ideas" },
    { k: "note", label: "Note", icon: <StickyNote size={14} />, path: "/tasks" },
  ] as { k: Kind; label: string; icon: React.ReactNode; path: string }[]).filter((t) => canOpen(t.path));

  const shortcuts = ([
    { path: "/delegate", href: "/delegate", label: "Delegate", icon: <Wand2 size={14} /> },
    { path: "/projects", href: "/projects/new", label: "Project", icon: <FolderKanban size={14} /> },
    { path: "/meetings", href: "/meetings?new=1", label: "Meeting", icon: <Video size={14} /> },
    { path: "/approvals", href: "/approvals?new=1", label: "Approval", icon: <CheckSquare size={14} /> },
    { path: "/chat", href: "/chat", label: "Message", icon: <MessageSquare size={14} /> },
  ]).filter((x) => canOpen(x.path));

  /* Derived, not corrected in an effect: if the selected kind is not available the first one that
     is wins, and the component never sets state during render. */
  const active: Kind | null = tabs.some((t) => t.k === kind) ? kind : (tabs[0]?.k ?? null);

  return (
    <Modal open={open} onClose={close} title="Quick capture" width={600}>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {tabs.map((t) => (
          <button key={t.k} onClick={() => setKind(t.k)} className={cn("btn btn-sm", active === t.k ? "btn-primary" : "btn-secondary")}>{t.icon} {t.label}</button>
        ))}
        {tabs.length > 0 && shortcuts.length > 0 && <span className="mx-1 h-5 w-px bg-[var(--line)] hidden sm:block" />}
        {shortcuts.map((x) => (
          <button key={x.href} className="btn btn-sm btn-ghost" onClick={() => go(x.href)}>{x.icon} {x.label}</button>
        ))}
      </div>
      {active === null ? (
        <p className="text-sm text-muted py-2">
          Nothing to capture here yet — the modules quick capture writes to are not part of your workspace.
        </p>
      ) : active === "task" ? (
        <QuickTaskForm onCreated={(id) => { close(); router.push(`/tasks/${id}`); }} onCancel={close} />
      ) : (
        <form onSubmit={saveIdeaOrNote} className="space-y-3">
          <Field label={active === "idea" ? "Your idea" : "Note"}>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={active === "idea" ? "What could we do better?" : "Something to remember…"} required />
          </Field>
          <Field label="Details">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Optional context" style={{ minHeight: 89 }} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary" loading={loading}>{active === "idea" ? "Post idea" : "Save note"}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
