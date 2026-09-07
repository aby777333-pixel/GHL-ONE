"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FolderKanban } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Modal, useToast } from "@/components/ui";
import type { Channel } from "@/lib/utils";

/** Turn a conversation into a project — the room becomes the project channel and members become project members. */
export function ConvertProjectModal({ open, onClose, channel }: { open: boolean; onClose: () => void; channel: Channel }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState(channel.name);
  const [due, setDue] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("convert_channel_to_project", { p_channel: channel.id, p_name: name.trim(), p_due: due || undefined });
    setBusy(false);
    if (error || !data) return toast.push(error?.message || "Could not convert", "danger");
    toast.push("This room is now a project", "success");
    onClose();
    router.push(`/projects/${data}`);
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="Convert to project" width={480}>
      <form onSubmit={submit} className="space-y-3">
        <div className="text-sm text-muted">
          The conversation, its history and everyone in it move into a new project room. Nothing is deleted; you get tasks, milestones and files on top.
        </div>
        <Field label="Project name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Due date (optional)">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}><FolderKanban size={14} /> Create project</Button>
        </div>
      </form>
    </Modal>
  );
}
