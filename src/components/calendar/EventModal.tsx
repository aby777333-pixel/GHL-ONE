"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Pencil, Trash2, Clock, FolderKanban } from "lucide-react";
import { Button, Modal, Pill, useToast } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, isLeadPlus } from "@/lib/utils";
import { entityLink, KIND_COLOR, KIND_SINGULAR, timeLabel, type CalItem } from "./calendarUtils";
import { AddEventModal } from "./AddEventModal";

export function EventModal({ item, onClose, projectName, onDeleted }: { item: CalItem | null; onClose: () => void; projectName: (id?: string | null) => string | undefined; onDeleted: (id: string) => void }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  if (!item) return null;
  const link = entityLink(item);
  /* Own the row (or lead+) and it is a plain calendar entry rather than a mirrored meeting/task
     → you may edit it as well as delete it. Deleting and re-adding was the only way before. */
  const canManage = item.source === "event" && !item.meeting_id && !item.task_id && (item.created_by === profile.id || isLeadPlus(profile.role));

  async function remove() {
    if (!item) return;
    setBusy(true);
    const { error } = await createClient().from("calendar_events").delete().eq("id", item.row_id);
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Event removed", "success");
    onDeleted(item.id);
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={<span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: KIND_COLOR[item.kind] }} /> {KIND_SINGULAR[item.kind]}</span>} width={480}
      footer={
        <>
          {canManage && (
            <>
              <Button variant="ghost" className="mr-auto text-danger" loading={busy} onClick={remove}><Trash2 size={14} /> Delete</Button>
              <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button>
            </>
          )}
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {link && <Link href={link.href} className="btn btn-primary" onClick={onClose}>{link.label} <ArrowUpRight size={14} /></Link>}
        </>
      }
    >
      <h2 className="h2">{item.title}</h2>
      <div className="flex flex-col gap-1.5 mt-3 text-sm">
        <span className="inline-flex items-center gap-2 text-[var(--fg-2)]"><Clock size={14} className="text-muted" /> <span className="num">{item.all_day ? `${fmtDate(item.starts_at)}${item.ends_at && fmtDate(item.ends_at) !== fmtDate(item.starts_at) ? ` → ${fmtDate(item.ends_at)}` : ""} · All day` : `${fmtDate(item.starts_at)} · ${timeLabel(item)} IST`}</span></span>
        {item.project_id && projectName(item.project_id) && (
          <Link href={`/projects/${item.project_id}`} className="inline-flex items-center gap-2 hover:underline"><FolderKanban size={14} className="text-muted" /> {projectName(item.project_id)}</Link>
        )}
        {item.user_id && <span className="inline-flex items-center gap-2 text-xs"><PersonChip id={item.user_id} size={18} /></span>}
        {item.source === "task" && <Pill tone="tone-danger" className="self-start">Your task deadline</Pill>}
      </div>
      {item.description && <p className="text-sm text-[var(--fg-2)] mt-4 whitespace-pre-wrap leading-relaxed">{item.description}</p>}
      {editing && <AddEventModal open event={item} onClose={() => { setEditing(false); onClose(); }} />}
    </Modal>
  );
}
