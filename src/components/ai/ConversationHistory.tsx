"use client";

/**
 * Buddy's conversation history, in one popup with two parts.
 *
 * The dropdown used to be a flat list of every conversation it had loaded, which is fine for a
 * week and unusable after a month: no way to find a particular chat, no way to rename one that had
 * been auto-titled badly, no way to delete anything.
 *
 * So: **Recent** stays short and answers "take me back to what I was just doing", and **All
 * conversations** is the place to search, rename and delete. Same popup, because that is where
 * people already look.
 *
 * Renaming and deleting are ordinary RLS-checked writes — `ai_conversations` is governed by
 * `aic_own` (`user_id = auth.uid()`), so a person can only ever touch their own. Deleting is
 * irreversible, so it asks first, inline, rather than through a modal that would cover the list.
 */

import * as React from "react";
import { Check, History, Pencil, Search, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, useToast } from "@/components/ui";
import { ago, cn } from "@/lib/utils";

export type Conv = { id: string; title: string | null; updated_at: string; mode: string | null; assistant_key: string | null };

const RECENT = 5;

export function ConversationHistory({
  history,
  conversationId,
  onSelect,
  onChanged,
}: {
  history: Conv[];
  conversationId: string | null;
  onSelect: (id: string) => void;
  /**
   * Reload the list after a rename or delete — the panel owns the data. A delete passes the id it
   * removed, because the panel cannot tell from the refreshed list alone whether the conversation
   * currently on screen is the one that just went.
   */
  onChanged: (deletedId?: string) => void;
}) {
  const toast = useToast();
  const ref = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* Closing puts the popup back to its resting state, so it never reopens mid-rename. */
  function close() {
    setOpen(false);
    setShowAll(false);
    setQ("");
    setRenaming(null);
    setConfirmDelete(null);
  }

  const matches = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return history;
    return history.filter((c) => (c.title || "Untitled").toLowerCase().includes(t));
  }, [history, q]);

  const shown = showAll ? matches : history.slice(0, RECENT);

  async function rename(id: string) {
    const title = draft.trim();
    setRenaming(null);
    if (!title) return;
    setBusy(true);
    const { error } = await createClient().from("ai_conversations").update({ title }).eq("id", id);
    setBusy(false);
    if (error) {
      toast.push(error.message, "danger");
      return;
    }
    onChanged();
  }

  async function remove(id: string) {
    setBusy(true);
    const { error } = await createClient().from("ai_conversations").delete().eq("id", id);
    setBusy(false);
    setConfirmDelete(null);
    if (error) {
      toast.push(error.message, "danger");
      return;
    }
    toast.push("Conversation deleted", "success");
    onChanged(id);
  }

  function Row({ c }: { c: Conv }) {
    const isRenaming = renaming === c.id;
    const isConfirming = confirmDelete === c.id;
    return (
      <div
        className={cn(
          "group flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-sm)]",
          c.id === conversationId ? "bg-[color-mix(in_oklab,var(--brand)_10%,transparent)]" : "hover:bg-[var(--neutral-bg)]"
        )}
      >
        {isRenaming ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") rename(c.id);
                if (e.key === "Escape") setRenaming(null);
              }}
              className="input !h-7 !text-[13px] flex-1 min-w-0"
              aria-label="Conversation title"
            />
            <button type="button" className="btn btn-ghost btn-xs btn-icon" onClick={() => rename(c.id)} aria-label="Save title"><Check size={13} /></button>
            <button type="button" className="btn btn-ghost btn-xs btn-icon" onClick={() => setRenaming(null)} aria-label="Cancel"><X size={13} /></button>
          </>
        ) : isConfirming ? (
          <>
            <span className="flex-1 min-w-0 truncate text-[13px] text-muted">Delete “{c.title || "Untitled"}”?</span>
            <Button size="xs" variant="danger" loading={busy} onClick={() => remove(c.id)}>Delete</Button>
            <button type="button" className="btn btn-ghost btn-xs btn-icon" onClick={() => setConfirmDelete(null)} aria-label="Keep"><X size={13} /></button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                onSelect(c.id);
                close();
              }}
              className="flex-1 min-w-0 text-left"
            >
              <span className={cn("block truncate text-[13px]", c.id === conversationId && "font-medium")}>{c.title || "Untitled"}</span>
              <span className="block text-[10px] text-muted num">{ago(c.updated_at)}</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-icon opacity-0 group-hover:opacity-100 focus:opacity-100"
              onClick={() => {
                setDraft(c.title || "");
                setConfirmDelete(null);
                setRenaming(c.id);
              }}
              aria-label={`Rename ${c.title || "conversation"}`}
              title="Rename"
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-icon opacity-0 group-hover:opacity-100 focus:opacity-100 text-danger"
              onClick={() => {
                setRenaming(null);
                setConfirmDelete(c.id);
              }}
              aria-label={`Delete ${c.title || "conversation"}`}
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-icon"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="Conversation history"
        aria-expanded={open}
        title="History"
      >
        <History size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[320px] max-w-[86vw] rounded-[var(--radius)] border bg-[var(--bg-elev)] shadow-[var(--shadow-lg)] z-50 anim-fade-in">
          <div className="px-2.5 pt-2 pb-1 flex items-center justify-between gap-2">
            <span className="eyebrow">{showAll ? "All conversations" : "Recent conversations"}</span>
            {history.length > RECENT && (
              <button
                type="button"
                className="text-[11px] text-muted hover:text-[var(--fg)] underline decoration-dotted"
                onClick={() => {
                  setShowAll((v) => !v);
                  setQ("");
                }}
              >
                {showAll ? "Show recent" : `All ${history.length}`}
              </button>
            )}
          </div>

          {showAll && (
            <div className="px-2.5 pb-1.5">
              <div className="relative">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search conversations…"
                  className="input !h-7 !text-[13px] !pl-7 w-full"
                  aria-label="Search conversations"
                />
              </div>
            </div>
          )}

          <div className="max-h-[46vh] overflow-y-auto px-1 pb-1.5 space-y-0.5">
            {history.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-muted">No conversations yet</p>
            ) : shown.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-muted">Nothing matches “{q.trim()}”.</p>
            ) : (
              shown.map((c) => <Row key={c.id} c={c} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
