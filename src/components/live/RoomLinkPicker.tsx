"use client";

/**
 * Link a GHL BOARD or a live document to the room you are in.
 *
 * The stage told people to "open GHL BOARD and pick Use in this room" — an option that existed nowhere, and
 * the room never read a linked board anyway (`boardId` was hard-wired to null). This is that option, where
 * people actually are: create one for this room, or link one they already have.
 *
 * Linking sets `room_id` on the board or document, which is exactly what `can_view_board` /
 * `can_view_live_doc` already read to let the room's participants in — so nothing new is granted here.
 * Writes go through RLS: an UPDATE that RLS refuses matches zero rows WITHOUT an error, so the result is
 * read back and an empty one is reported as a refusal rather than a silent success.
 */

import * as React from "react";
import { Link2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createBoard, createDoc } from "@/lib/live/client";
import { Button, Select, useToast } from "@/components/ui";

export type RoomLinkContext = { roomId: string; orgId: string; meId: string; title: string; meetingId?: string | null; projectId?: string | null };

type Option = { id: string; title: string };

export function RoomLinkPicker({ kind, ctx, onLinked }: { kind: "board" | "doc"; ctx: RoomLinkContext; onLinked: (id: string) => void }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState<"create" | "link" | null>(null);
  const [options, setOptions] = React.useState<Option[] | null>(null);
  const [pick, setPick] = React.useState("");
  const noun = kind === "board" ? "board" : "document";

  async function loadOptions() {
    const sb = createClient();
    // RLS already limits these to what the viewer may see; only offer ones not tied to another room.
    const { data } = kind === "board"
      ? await sb.from("boards").select("id,title").eq("archived", false).is("room_id", null).order("updated_at", { ascending: false }).limit(50)
      : await sb.from("live_docs").select("id,title").eq("archived", false).is("room_id", null).order("updated_at", { ascending: false }).limit(50);
    setOptions((data || []) as Option[]);
  }

  async function create() {
    setBusy("create");
    try {
      const id = kind === "board"
        ? await createBoard({ orgId: ctx.orgId, ownerId: ctx.meId, title: `${ctx.title} — board`, kind: "room", visibility: "members", roomId: ctx.roomId, projectId: ctx.projectId ?? null })
        : await createDoc({ orgId: ctx.orgId, ownerId: ctx.meId, title: `${ctx.title} — notes`, kind: ctx.meetingId ? "meeting_notes" : "doc", roomId: ctx.roomId, meetingId: ctx.meetingId ?? null, projectId: ctx.projectId ?? null, visibility: "members" });
      onLinked(id);
      toast.push(`A ${noun} was created for this room — everyone here can open it`, "success");
      window.open(kind === "board" ? `/boards/${id}` : `/docs/${id}`, "_blank", "noopener");
    } catch (e) {
      toast.push(e instanceof Error ? e.message : `Could not create the ${noun}`, "danger");
    } finally {
      setBusy(null);
    }
  }

  async function link() {
    if (!pick) return;
    setBusy("link");
    const sb = createClient();
    const { data, error } = kind === "board"
      ? await sb.from("boards").update({ room_id: ctx.roomId }).eq("id", pick).select("id")
      : await sb.from("live_docs").update({ room_id: ctx.roomId }).eq("id", pick).select("id");
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    if (!data?.length) return toast.push(`Only someone who can edit that ${noun} can link it to a room`, "danger");
    onLinked(pick);
    toast.push(`Linked — everyone in this room can now open the ${noun}`, "success");
  }

  return (
    <div className="flex flex-col items-center gap-2 w-full max-w-[340px]">
      <Button variant="primary" size="sm" loading={busy === "create"} disabled={!!busy} onClick={() => void create()}>
        <Plus size={14} /> Create a {noun} for this room
      </Button>
      {options === null ? (
        <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void loadOptions()}>
          <Link2 size={14} /> Use an existing {noun}
        </Button>
      ) : options.length === 0 ? (
        <div className="text-[11px] text-muted text-center">No other {noun}s are free to link. Create one above.</div>
      ) : (
        <div className="flex items-center gap-2 w-full">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 min-w-0" aria-label={`Choose a ${noun}`}>
            <option value="">Choose a {noun}…</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </Select>
          <Button size="sm" loading={busy === "link"} disabled={!pick || !!busy} onClick={() => void link()}>Use in this room</Button>
        </div>
      )}
    </div>
  );
}
