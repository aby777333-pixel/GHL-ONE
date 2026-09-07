"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import { Composer } from "./Composer";
import { MessageItem } from "./MessageItem";
import { isContinuation } from "./lib";
import type { ChatMessage, MessageAction, PersonLite, SendPayload } from "./types";

/**
 * Thread view for one parent message. Fixed full-screen sheet on mobile,
 * inline right column on lg+ (the parent decides where to mount it).
 */
export function ThreadPanel({
  channelId,
  parent,
  replies,
  loading,
  me,
  people,
  canPin,
  authorOf,
  onClose,
  onSend,
  onReact,
  onAction,
  editingId,
  onSaveEdit,
  onCancelEdit,
  onTyping,
}: {
  channelId: string;
  parent: ChatMessage;
  replies: ChatMessage[];
  loading: boolean;
  me: string;
  people: PersonLite[];
  canPin: boolean;
  authorOf: (id: string | null) => PersonLite | undefined;
  onClose: () => void;
  onSend: (p: SendPayload) => Promise<boolean>;
  onReact: (m: ChatMessage, emoji: string) => void;
  onAction: (a: MessageAction, m: ChatMessage) => void;
  editingId: string | null;
  onSaveEdit: (m: ChatMessage, body: string) => Promise<boolean>;
  onCancelEdit: () => void;
  onTyping?: (t: boolean) => void;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const count = replies.length;

  React.useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, loading]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-elev)]">
      <div className="h-[55px] shrink-0 border-b px-3 flex items-center gap-2">
        <div className="min-w-0">
          <div className="h3">Thread</div>
          <div className="text-[11px] text-muted truncate">
            {count} {count === 1 ? "reply" : "replies"}
          </div>
        </div>
        <Button variant="ghost" size="sm" icon onClick={onClose} className="ml-auto" aria-label="Close thread">
          <X size={16} />
        </Button>
      </div>
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto py-2">
        <MessageItem m={parent} author={authorOf(parent.author_id)} me={me} grouped={false} inThread canPin={canPin} onAction={onAction} onReact={onReact} editing={editingId === parent.id} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit} />
        <div className="mx-4 my-2 flex items-center gap-2 text-[11px] text-muted">
          <span className="h-px flex-1 bg-[var(--line)]" />
          {loading ? <Spinner className="!w-3.5 !h-3.5" /> : `${count} ${count === 1 ? "reply" : "replies"}`}
          <span className="h-px flex-1 bg-[var(--line)]" />
        </div>
        {replies.map((r, i) => (
          <MessageItem key={r.id} m={r} author={authorOf(r.author_id)} me={me} grouped={isContinuation(replies[i - 1], r)} inThread canPin={canPin} onAction={onAction} onReact={onReact} editing={editingId === r.id} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit} />
        ))}
      </div>
      <Composer channelId={channelId} parentId={parent.id} people={people} placeholder="Reply in thread" onSend={onSend} onTyping={onTyping} autoFocus />
    </div>
  );
}
