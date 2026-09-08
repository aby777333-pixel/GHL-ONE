"use client";
/**
 * Board comments: pins anchored to an element or a canvas point, threads, resolve, and
 * "turn this comment into a task". Mentions are written to `board_comments.mentions` —
 * the DB trigger sends the notifications, never the client.
 */
import * as React from "react";
import Link from "next/link";
import { Check, CheckSquare, MessageSquare, Send, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { boardTask } from "@/lib/live/client";
import { Avatar, Button, EmptyState, Modal, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, type Tables } from "@/lib/utils";
import type { BoardElement } from "@/lib/live/types";

export type BoardComment = Tables<"board_comments">;

/** All comments on a board + per-element counts (used to number the pins). */
export function useBoardComments(boardId: string) {
  const [comments, setComments] = React.useState<BoardComment[]>([]);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    const { data } = await createClient().from("board_comments").select("*").eq("board_id", boardId).order("created_at");
    setComments(data || []);
    setLoading(false);
  }, [boardId]);

  React.useEffect(() => {
    const t = setTimeout(() => { void reload(); }, 0);
    return () => clearTimeout(t);
  }, [reload]);

  React.useEffect(() => {
    const sb = createClient();
    const chan = sb.channel(`board-comments:${boardId}`);
    chan.on("postgres_changes", { event: "*", schema: "public", table: "board_comments", filter: `board_id=eq.${boardId}` }, () => { void reload(); });
    let cancelled = false;
    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) sb.realtime.setAuth(data.session.access_token);
      chan.subscribe();
    });
    return () => { cancelled = true; sb.removeChannel(chan); };
  }, [boardId, reload]);

  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comments) if (c.element_id && !c.resolved) m.set(c.element_id, (m.get(c.element_id) || 0) + 1);
    return m;
  }, [comments]);

  return { comments, counts, loading, reload, setComments };
}

function Thread({
  boardId, anchorId, comments, onChanged,
}: {
  boardId: string;
  anchorId: string | null;
  comments: BoardComment[];
  onChanged: () => void;
}) {
  const { profile, people } = useSession();
  const toast = useToast();
  const [body, setBody] = React.useState("");
  const [mentions, setMentions] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  const personName = (id: string | null) => people.find((p) => p.id === id)?.full_name || "Someone";

  async function post() {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    const { error } = await createClient().from("board_comments").insert({
      board_id: boardId,
      element_id: anchorId,
      body: text,
      author_id: profile.id,
      mentions,
    });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    setBody("");
    setMentions([]);
    onChanged();
  }

  async function toggleResolved(c: BoardComment) {
    const { error } = await createClient().from("board_comments").update({ resolved: !c.resolved }).eq("id", c.id);
    if (error) return toast.push(error.message, "danger");
    onChanged();
  }

  async function toTask(c: BoardComment) {
    try {
      const id = await boardTask(boardId, c.element_id || "comment", c.body.slice(0, 180));
      await createClient().from("board_comments").update({ task_id: id }).eq("id", c.id);
      toast.push("Task created", "success");
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not create the task", "danger");
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {comments.map((c) => (
          <div key={c.id} className={cn("rounded-[var(--radius-sm)] border p-2.5", c.resolved && "opacity-60")}>
            <div className="flex items-start gap-2">
              <Avatar name={personName(c.author_id)} size={26} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{personName(c.author_id)}</span>
                  <span className="text-[11px] text-muted">{ago(c.created_at)}</span>
                  {c.resolved && <span className="pill tone-success">Resolved</span>}
                </div>
                <div className="text-sm mt-0.5 whitespace-pre-wrap break-words">{c.body}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <button type="button" onClick={() => toggleResolved(c)} className="text-[11px] text-muted hover:underline inline-flex items-center gap-1">
                    {c.resolved ? <><Undo2 size={11} /> Reopen</> : <><Check size={11} /> Resolve</>}
                  </button>
                  {c.task_id ? (
                    <Link href={`/tasks/${c.task_id}`} className="text-[11px] text-muted hover:underline inline-flex items-center gap-1"><CheckSquare size={11} /> Open task</Link>
                  ) : (
                    <button type="button" onClick={() => toTask(c)} className="text-[11px] text-muted hover:underline inline-flex items-center gap-1"><CheckSquare size={11} /> Turn into task</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {!comments.length && <div className="text-sm text-muted">No comments here yet.</div>}
      </div>

      <div className="space-y-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" style={{ minHeight: 72 }} />
        <div className="flex items-center gap-2">
          <Select
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              const p = people.find((x) => x.id === id);
              if (!p) return;
              setMentions((m) => (m.includes(id) ? m : [...m, id]));
              setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}@${p.full_name} `);
            }}
            className="flex-1"
          >
            <option value="">Mention someone…</option>
            {people.filter((p) => p.id !== profile.id).map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </Select>
          <Button variant="primary" onClick={post} loading={busy} disabled={!body.trim()}><Send size={14} /> Post</Button>
        </div>
        {mentions.length > 0 && (
          <div className="text-[11px] text-muted">Notifying {mentions.map((m) => personName(m)).join(", ")}.</div>
        )}
      </div>
    </div>
  );
}

export function BoardCommentsPanel({
  open, onClose, boardId, comments, elements, focusElementId, onFocusElement, onChanged,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  comments: BoardComment[];
  elements: BoardElement[];
  focusElementId: string | null;
  onFocusElement: (id: string | null) => void;
  onChanged: () => void;
}) {
  const [showResolved, setShowResolved] = React.useState(false);
  const byAnchor = React.useMemo(() => {
    const m = new Map<string, BoardComment[]>();
    for (const c of comments) {
      if (!showResolved && c.resolved) continue;
      const k = c.element_id || "board";
      m.set(k, [...(m.get(k) || []), c]);
    }
    return m;
  }, [comments, showResolved]);

  const anchorLabel = (key: string) => {
    if (key === "board") return "General";
    const el = elements.find((e) => e.id === key);
    if (!el) return "Removed element";
    return (el.text || el.title || el.name || el.type).slice(0, 40);
  };

  return (
    <Modal open={open} onClose={onClose} title="Comments" side width={420}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted">{comments.filter((c) => !c.resolved).length} open</span>
        <label className="text-xs text-muted inline-flex items-center gap-1.5">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved
        </label>
      </div>
      {focusElementId ? (
        <div className="space-y-3">
          <button type="button" onClick={() => onFocusElement(null)} className="text-xs text-muted hover:underline">← All threads</button>
          <div className="eyebrow">{anchorLabel(focusElementId)}</div>
          <Thread boardId={boardId} anchorId={focusElementId} comments={comments.filter((c) => c.element_id === focusElementId)} onChanged={onChanged} />
        </div>
      ) : byAnchor.size ? (
        <div className="space-y-4">
          {[...byAnchor.entries()].map(([key, list]) => (
            <div key={key} className="rounded-[var(--radius)] border p-3">
              <button type="button" onClick={() => onFocusElement(key === "board" ? null : key)} className="eyebrow hover:underline block mb-2 text-left">
                {anchorLabel(key)} · {list.length}
              </button>
              <Thread boardId={boardId} anchorId={key === "board" ? null : key} comments={list} onChanged={onChanged} />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <EmptyState icon={<MessageSquare size={18} />} title="No comments yet" hint="Drop a comment pin on the board, or start a general thread below." />
          <Thread boardId={boardId} anchorId={null} comments={[]} onChanged={onChanged} />
        </div>
      )}
    </Modal>
  );
}

export function BoardCommentsLoading() {
  return <div className="p-6 flex justify-center"><Spinner /></div>;
}
