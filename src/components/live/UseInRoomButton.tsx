"use client";

/**
 * "Use in this room" on a board or a live document, shown only while you are in a GHL Live room (the
 * call lives in the app shell, so it is still running when you open a board from the same tab).
 *
 * Sets `room_id` — what `can_view_board` / `can_view_live_doc` already read to let the room's participants
 * in, and what the room's stage now reads to show "Open the board / document". The UPDATE is read back:
 * RLS refuses a write by matching zero rows, not by raising, so an empty result is reported as a refusal.
 */

import * as React from "react";
import { Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, useToast } from "@/components/ui";
import { useLive } from "./liveStore";

export function UseInRoomButton({ kind, id, roomId, onLinked }: { kind: "board" | "doc"; id: string; roomId: string | null | undefined; onLinked?: (roomId: string) => void }) {
  const { active } = useLive();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  if (!active || active.id === roomId) return null;
  const noun = kind === "board" ? "board" : "document";

  async function link() {
    if (!active) return;
    setBusy(true);
    const sb = createClient();
    const { data, error } = kind === "board"
      ? await sb.from("boards").update({ room_id: active.id }).eq("id", id).select("id")
      : await sb.from("live_docs").update({ room_id: active.id }).eq("id", id).select("id");
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    if (!data?.length) return toast.push(`Only someone who can edit this ${noun} can link it to a room`, "danger");
    onLinked?.(active.id);
    toast.push(`Now in “${active.title}” — everyone in the room can open this ${noun}`, "success");
  }

  return (
    <Button size="sm" variant="secondary" loading={busy} onClick={() => void link()} title={`Make this ${noun} available in “${active.title}”`}>
      <Radio size={14} /> <span className="hidden sm:inline">Use in this room</span>
    </Button>
  );
}
