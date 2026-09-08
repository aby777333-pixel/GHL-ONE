"use client";
/**
 * In-room chat. Messages are kept as `live_events` (kind `chat`) so late joiners and the
 * room history see them, and echoed over Supabase Realtime for instant delivery.
 */
import * as React from "react";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, EmptyState, Textarea } from "@/components/ui";
import { liveChannelName } from "@/lib/live/types";
import { ago } from "@/lib/utils";

type ChatRow = { id: number | string; actor_id: string | null; actor_name: string | null; body: string; created_at: string };

export function RoomChat({ roomId, orgId, meId, meName }: { roomId: string; orgId: string; meId: string; meName: string }) {
  const [rows, setRows] = React.useState<ChatRow[]>([]);
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const sb = createClient();
    let alive = true;
    void sb
      .from("live_events")
      .select("id,actor_id,actor_name,payload,created_at")
      .eq("room_id", roomId)
      .eq("kind", "chat")
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (!alive) return;
        setRows((data || []).map((r) => ({ id: r.id, actor_id: r.actor_id, actor_name: r.actor_name, body: String((r.payload as { body?: string })?.body ?? ""), created_at: r.created_at })));
      });

    const rt = sb
      .channel(liveChannelName(roomId))
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const m = payload as ChatRow;
        if (m.actor_id === meId) return;
        setRows((s) => (s.some((x) => x.id === m.id) ? s : [...s, m]));
      })
      .subscribe();
    return () => {
      alive = false;
      void sb.removeChannel(rt);
    };
  }, [roomId, meId]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [rows.length]);

  async function send() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    const sb = createClient();
    const optimistic: ChatRow = { id: `tmp-${Date.now()}`, actor_id: meId, actor_name: meName, body: text, created_at: new Date().toISOString() };
    setRows((s) => [...s, optimistic]);
    setBody("");
    const { data } = await sb
      .from("live_events")
      .insert({ org_id: orgId, room_id: roomId, kind: "chat", actor_id: meId, actor_name: meName, payload: { body: text } })
      .select("id,created_at")
      .maybeSingle();
    if (data) {
      const row = { ...optimistic, id: data.id, created_at: data.created_at };
      setRows((s) => s.map((x) => (x.id === optimistic.id ? row : x)));
      await sb.channel(liveChannelName(roomId)).send({ type: "broadcast", event: "chat", payload: row });
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2">
        {rows.length === 0 && <EmptyState title="No messages yet" hint="Chat here stays with the room history." className="py-[var(--s5)]" />}
        {rows.map((m) => (
          <div key={String(m.id)} className="flex items-start gap-2">
            <Avatar name={m.actor_name} size={24} />
            <div className="min-w-0">
              <div className="text-[11px] text-muted">
                <span className="font-medium text-2">{m.actor_id === meId ? "You" : m.actor_name || "Someone"}</span> · {ago(m.created_at)}
              </div>
              <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t p-2 flex items-end gap-2 shrink-0">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Message the room…"
          className="min-h-[38px] max-h-[120px]"
          style={{ minHeight: 38 }}
        />
        <Button size="sm" icon variant="primary" onClick={() => void send()} loading={busy} aria-label="Send">
          <Send size={15} />
        </Button>
      </div>
    </div>
  );
}
