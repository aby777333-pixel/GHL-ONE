"use client";

import * as React from "react";
import Link from "next/link";
import { MessageSquare, SmilePlus, ListPlus, MoreHorizontal, Pin, Link2, Pencil, Trash2, Forward, Gavel, Check, X, Sparkles } from "lucide-react";
import { Avatar, Button, Menu, MenuItem, Modal } from "@/components/ui";
import { cn } from "@/lib/utils";
import { AttachmentView } from "./Attachment";
import { QUICK_EMOJIS, MORE_EMOJIS, TOKEN_RE, groupReactions, parseAttachments, timeLabel, fullStamp, personName } from "./lib";
import type { ChatMessage, MessageAction, PersonLite } from "./types";
import { AIMarkdown } from "@/components/ai/AIMarkdown";
import { buddyBody, isBuddyMessage } from "@/components/ai/buddyChat";

/* ----------------------------------------------------------- Message body */
export function MessageBody({ body, me, className }: { body: string; me?: string; className?: string }) {
  const nodes = React.useMemo(() => {
    const out: React.ReactNode[] = [];
    let last = 0;
    let i = 0;
    for (const m of body.matchAll(TOKEN_RE)) {
      const idx = m.index ?? 0;
      if (idx > last) out.push(body.slice(last, idx));
      const tok = m[0];
      if (m[1]) {
        const name = tok.slice(2, -1);
        out.push(
          <span key={i++} className="inline-flex items-center rounded-[5px] px-1 font-medium tone-info" style={{ paddingTop: 1, paddingBottom: 1 }}>
            @{name}
          </span>
        );
      } else if (m[2]) {
        const href = tok.slice(1, -1);
        out.push(
          <Link key={i++} href={href} className="link font-medium">
            {href.startsWith("/tasks/") ? "Open task" : href.startsWith("/projects/") ? "Open project" : href}
          </Link>
        );
      } else {
        const trimmed = tok.replace(/[.,;:!?)]+$/, "");
        const trail = tok.slice(trimmed.length);
        out.push(
          <a key={i++} href={trimmed} target="_blank" rel="noreferrer" className="link break-all">
            {trimmed}
          </a>
        );
        if (trail) out.push(trail);
      }
      last = idx + tok.length;
    }
    if (last < body.length) out.push(body.slice(last));
    return out;
  }, [body]);
  void me;
  return <div className={cn("whitespace-pre-wrap break-words text-[15px] sm:text-sm leading-[1.55]", className)}>{nodes}</div>;
}

/* ------------------------------------------------------------- Reactions */
export function ReactionChips({ m, me, onReact }: { m: ChatMessage; me: string; onReact: (m: ChatMessage, emoji: string) => void }) {
  const groups = groupReactions(m, me);
  if (!groups.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {groups.map((g) => (
        <button
          key={g.emoji}
          type="button"
          onClick={() => onReact(m, g.emoji)}
          className={cn("inline-flex items-center gap-1 h-6 px-2 rounded-full border text-xs num transition-colors", g.mine ? "border-[var(--brand-2)] bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] text-[var(--brand)] dark:text-[var(--brand-2)]" : "bg-[var(--bg-elev)] hover:border-[var(--line-strong)]")}
          title={`${g.count} reaction${g.count > 1 ? "s" : ""}`}
        >
          <span>{g.emoji}</span>
          <span>{g.count}</span>
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- Emoji popup */
function EmojiPopover({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const [more, setMore] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-40 card p-1.5 anim-pop" style={{ boxShadow: "var(--shadow-lg)", width: more ? 264 : "auto" }}>
      <div className={cn("grid gap-0.5", more ? "grid-cols-8" : "grid-cols-9")}>
        {(more ? [...QUICK_EMOJIS, ...MORE_EMOJIS] : QUICK_EMOJIS).map((e) => (
          <button key={e} type="button" onClick={() => onPick(e)} className="w-7 h-7 rounded-[6px] text-base hover:bg-[var(--neutral-bg)]">
            {e}
          </button>
        ))}
        {!more && (
          <button type="button" onClick={() => setMore(true)} className="w-7 h-7 rounded-[6px] text-muted hover:bg-[var(--neutral-bg)] flex items-center justify-center" aria-label="More emoji">
            <MoreHorizontal size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Message item */
export type MessageItemProps = {
  m: ChatMessage;
  author?: PersonLite | null;
  me: string;
  grouped: boolean;
  highlighted?: boolean;
  inThread?: boolean;
  canPin: boolean;
  replyCount?: number;
  seenBy?: string | null;
  editing?: boolean;
  onAction: (action: MessageAction, m: ChatMessage) => void;
  onReact: (m: ChatMessage, emoji: string) => void;
  onSaveEdit?: (m: ChatMessage, body: string) => Promise<boolean>;
  onCancelEdit?: () => void;
};

export const MessageItem = React.memo(function MessageItem({ m, author, me, grouped, highlighted, inThread, canPin, replyCount, seenBy, editing, onAction, onReact, onSaveEdit, onCancelEdit }: MessageItemProps) {
  const [emoji, setEmoji] = React.useState(false);
  const [draft, setDraft] = React.useState(m.body);
  const [saving, setSaving] = React.useState(false);
  const pressRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mine = m.author_id === me;
  const buddy = isBuddyMessage(m.body);
  const attachments = React.useMemo(() => parseAttachments(m.attachments), [m.attachments]);
  const mentionsMe = m.mentions.includes(me);

  React.useEffect(() => {
    if (editing) {
      const t = setTimeout(() => setDraft(m.body), 0);
      return () => clearTimeout(t);
    }
  }, [editing, m.body]);

  const startPress = () => {
    pressRef.current = setTimeout(() => onAction("sheet", m), 480);
  };
  const endPress = () => {
    if (pressRef.current) clearTimeout(pressRef.current);
    pressRef.current = null;
  };

  if (m.kind === "system") {
    return (
      <div data-mid={m.id} className={cn("flex justify-center px-4 py-1.5", highlighted && "rounded-[var(--radius-sm)] bg-[color-mix(in_oklab,var(--brand)_10%,transparent)]")}>
        <div className="text-xs text-muted text-center max-w-[80%] [&_a]:font-medium">
          <MessageBody body={m.body} className="!text-xs" />
          <span className="ml-1 opacity-70">{timeLabel(m.created_at)}</span>
        </div>
      </div>
    );
  }

  const deleted = !!m.deleted_at;

  async function saveEdit() {
    if (!onSaveEdit) return;
    setSaving(true);
    const ok = await onSaveEdit(m, draft.trim());
    setSaving(false);
    if (ok) onCancelEdit?.();
  }

  return (
    <div
      data-mid={m.id}
      className={cn(
        "group relative flex gap-2.5 px-3 sm:px-4 transition-colors",
        grouped ? "py-0.5" : "pt-2 pb-0.5",
        highlighted ? "bg-[color-mix(in_oklab,var(--brand)_12%,transparent)]" : mentionsMe && !deleted ? "bg-[color-mix(in_oklab,var(--accent)_9%,transparent)]" : "hover:bg-[color-mix(in_oklab,var(--neutral-bg)_60%,transparent)]"
      )}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchMove={endPress}
      onContextMenu={(e) => {
        if (window.matchMedia("(hover: none)").matches) {
          e.preventDefault();
          onAction("sheet", m);
        }
      }}
    >
      {/* Gutter */}
      <div className="w-8 sm:w-9 shrink-0 pt-0.5">
        {grouped ? (
          <span className="hidden group-hover:block text-[10px] text-muted num leading-6 text-right pr-0.5">{timeLabel(m.created_at)}</span>
        ) : buddy ? (
          <span className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))" }} title="GHL Buddy"><Sparkles size={16} /></span>
        ) : (
          <Link href={author ? `/people/${author.id}` : "#"} className="block">
            <Avatar name={author?.full_name} src={author?.avatar_url} size={34} />
          </Link>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2 min-w-0">
            {buddy ? (
              <span className="font-semibold text-sm truncate text-[var(--violet)]">GHL Buddy <span className="font-normal text-muted">· asked by {mine ? "you" : personName(author)}</span></span>
            ) : (
              <span className="font-semibold text-sm truncate">{mine ? "You" : personName(author)}</span>
            )}
            <span className="text-[11px] text-muted num shrink-0" title={fullStamp(m.created_at)}>
              {timeLabel(m.created_at)}
            </span>
            {m.is_pinned && (
              <span className="text-[10px] text-muted inline-flex items-center gap-0.5">
                <Pin size={10} /> pinned
              </span>
            )}
          </div>
        )}

        {deleted ? (
          <div className="text-sm italic text-muted">Message deleted</div>
        ) : editing ? (
          <div className="mt-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancelEdit?.();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                }
              }}
              autoFocus
              className="textarea !min-h-[60px] text-sm"
            />
            <div className="flex gap-2 mt-1.5">
              <Button size="xs" variant="primary" onClick={saveEdit} loading={saving}>
                <Check size={12} /> Save
              </Button>
              <Button size="xs" variant="ghost" onClick={onCancelEdit}>
                <X size={12} /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {m.body && buddy ? (
              <div className="mt-1 rounded-[var(--radius)] border-l-2 border-[var(--violet)] bg-[color-mix(in_oklab,var(--violet)_7%,transparent)] px-3 py-2">
                <AIMarkdown source={buddyBody(m.body)} className="text-[15px] sm:text-sm" />
              </div>
            ) : m.body ? (
              <MessageBody body={m.body} me={me} />
            ) : null}
            {attachments.length > 0 && (
              <div className={cn("flex flex-wrap gap-2", m.body ? "mt-1.5" : "mt-0.5")}>
                {attachments.map((a) => (
                  <AttachmentView key={a.path} a={a} />
                ))}
              </div>
            )}
            {m.edited_at && <span className="text-[10px] text-muted ml-1">(edited)</span>}
          </>
        )}

        {!deleted && <ReactionChips m={m} me={me} onReact={onReact} />}

        {!inThread && !!replyCount && replyCount > 0 && (
          <button type="button" onClick={() => onAction("reply", m)} className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium link">
            <MessageSquare size={12} /> {replyCount} {replyCount === 1 ? "reply" : "replies"}
          </button>
        )}

        {seenBy && <div className="text-[10px] text-muted mt-0.5 text-right pr-1">{seenBy}</div>}
      </div>

      {/* Hover actions (pointer devices) */}
      {!deleted && !editing && (
        <div className="absolute -top-3 right-3 hidden md:group-hover:flex items-center card p-0.5 gap-0.5 z-10" style={{ boxShadow: "var(--shadow)" }}>
          <button type="button" className="btn btn-ghost btn-xs btn-icon text-base" onClick={() => onReact(m, "👍")} aria-label="Thumbs up">
            👍
          </button>
          <div className="relative">
            <button type="button" className="btn btn-ghost btn-xs btn-icon" onClick={() => setEmoji((o) => !o)} aria-label="React">
              <SmilePlus size={14} />
            </button>
            {emoji && (
              <EmojiPopover
                onPick={(e) => {
                  onReact(m, e);
                  setEmoji(false);
                }}
                onClose={() => setEmoji(false)}
              />
            )}
          </div>
          {!inThread && (
            <button type="button" className="btn btn-ghost btn-xs btn-icon" onClick={() => onAction("reply", m)} aria-label="Reply in thread">
              <MessageSquare size={14} />
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-xs btn-icon" onClick={() => onAction("task", m)} aria-label="Create task">
            <ListPlus size={14} />
          </button>
          <button type="button" className="btn btn-ghost btn-xs btn-icon" onClick={() => onAction("extract", m)} aria-label="Extract tasks (AI)" title="Extract tasks (AI)">
            <Sparkles size={14} className="text-[var(--accent)]" />
          </button>
          <Menu
            trigger={
              <button type="button" className="btn btn-ghost btn-xs btn-icon" aria-label="More">
                <MoreHorizontal size={14} />
              </button>
            }
            width={190}
          >
            <MenuItem icon={<Sparkles size={14} />} onClick={() => onAction("extract", m)}>Extract tasks (AI)</MenuItem>
            <MenuItem icon={<Gavel size={14} />} onClick={() => onAction("decision", m)}>Record decision</MenuItem>
            {canPin && (
              <MenuItem icon={<Pin size={14} />} onClick={() => onAction("pin", m)}>{m.is_pinned ? "Unpin" : "Pin"}</MenuItem>
            )}
            <MenuItem icon={<Link2 size={14} />} onClick={() => onAction("copy", m)}>Copy link</MenuItem>
            <MenuItem icon={<Forward size={14} />} onClick={() => onAction("forward", m)}>Forward</MenuItem>
            {mine && <MenuItem icon={<Pencil size={14} />} onClick={() => onAction("edit", m)}>Edit</MenuItem>}
            {mine && (
              <MenuItem icon={<Trash2 size={14} />} onClick={() => onAction("delete", m)} danger>Delete</MenuItem>
            )}
          </Menu>
        </div>
      )}
    </div>
  );
});

/* ----------------------------------------------------- Mobile action sheet */
function SheetItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("w-full flex items-center gap-3 h-11 px-2 rounded-[var(--radius-sm)] text-[15px] hover:bg-[var(--neutral-bg)] text-left", danger && "text-danger")}>
      <span className="text-muted">{icon}</span>
      {label}
    </button>
  );
}

export function MessageActionSheet({ m, me, canPin, inThread, onClose, onAction, onReact }: { m: ChatMessage | null; me: string; canPin: boolean; inThread?: boolean; onClose: () => void; onAction: (a: MessageAction, m: ChatMessage) => void; onReact: (m: ChatMessage, e: string) => void }) {
  if (!m) return null;
  const mine = m.author_id === me;
  const run = (a: MessageAction) => {
    onClose();
    onAction(a, m);
  };
  const Item = SheetItem;
  return (
    <Modal open={!!m} onClose={onClose} title={undefined} width={420}>
      <div className="flex justify-between gap-1 pb-2 border-b mb-1">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              onClose();
              onReact(m, e);
            }}
            className="w-9 h-9 rounded-full text-xl hover:bg-[var(--neutral-bg)]"
          >
            {e}
          </button>
        ))}
      </div>
      {!inThread && <Item icon={<MessageSquare size={17} />} label="Reply in thread" onClick={() => run("reply")} />}
      <Item icon={<ListPlus size={17} />} label="Create task" onClick={() => run("task")} />
      <Item icon={<Sparkles size={17} />} label="Extract tasks (AI)" onClick={() => run("extract")} />
      <Item icon={<Gavel size={17} />} label="Record decision" onClick={() => run("decision")} />
      {canPin && <Item icon={<Pin size={17} />} label={m.is_pinned ? "Unpin" : "Pin"} onClick={() => run("pin")} />}
      <Item icon={<Link2 size={17} />} label="Copy link" onClick={() => run("copy")} />
      <Item icon={<Forward size={17} />} label="Forward" onClick={() => run("forward")} />
      {mine && <Item icon={<Pencil size={17} />} label="Edit" onClick={() => run("edit")} />}
      {mine && <Item icon={<Trash2 size={17} />} label="Delete" onClick={() => run("delete")} danger />}
    </Modal>
  );
}
