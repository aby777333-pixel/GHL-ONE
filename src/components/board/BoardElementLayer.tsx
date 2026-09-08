"use client";
/**
 * HTML layer painted on top of the canvas: live cursors with names, the inline text editor,
 * task badges that link to /tasks/<id>, and the floating action bar for the current selection.
 * Everything here is positioned from the same View transform the canvas uses.
 */
import * as React from "react";
import Link from "next/link";
import {
  CheckSquare, Copy, Layers, Lock, MessageSquare, MoveDown, MoveUp, Palette, ThumbsUp, Trash2, Unlock,
} from "lucide-react";
import type { BoardElement } from "@/lib/live/types";
import { cn } from "@/lib/utils";
import { elementBounds, rectCenter, resolve, toScreen, unionBounds, type Palette as Pal, type View } from "./boardDraw";
import type { Cursor } from "./useBoardDoc";

export type OverlayAction = "duplicate" | "delete" | "forward" | "back" | "lock" | "vote" | "comment" | "task" | "style";

export function LiveCursors({ cursors, view, pageId, meId }: { cursors: Cursor[]; view: View; pageId: string; meId: string }) {
  return (
    <>
      {cursors
        .filter((c) => c.pageId === pageId && c.userId !== meId)
        .map((c) => {
          const p = toScreen(view, c.x, c.y);
          return (
            <div key={c.userId} className="absolute pointer-events-none z-30 transition-transform duration-75" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
              {c.laser ? (
                <span className="block w-3.5 h-3.5 -ml-1.5 -mt-1.5 rounded-full" style={{ background: c.color, boxShadow: `0 0 12px 4px ${c.color}` }} />
              ) : (
                <>
                  <svg width="16" height="18" viewBox="0 0 16 18" fill="none" aria-hidden>
                    <path d="M1 1L14.5 8.2L8.4 9.6L5.9 15.6L1 1Z" fill={c.color} stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
                  </svg>
                  <span className="absolute left-3.5 top-3.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap" style={{ background: c.color }}>
                    {c.name}
                  </span>
                </>
              )}
            </div>
          );
        })}
    </>
  );
}

export function TaskBadges({ elements, view }: { elements: BoardElement[]; view: View }) {
  const badges = elements.filter((e) => e.taskId);
  if (!badges.length) return null;
  return (
    <>
      {badges.map((e) => {
        const b = elementBounds(e);
        const p = toScreen(view, b.x, b.y + b.h);
        return (
          <Link
            key={e.id}
            href={`/tasks/${e.taskId}`}
            onPointerDown={(ev) => ev.stopPropagation()}
            className="absolute z-20 pill tone-info hover:underline"
            style={{ transform: `translate(${p.x}px, ${p.y - 8}px)` }}
            title="Open the linked task"
          >
            <CheckSquare size={11} /> Task
          </Link>
        );
      })}
    </>
  );
}

export function InlineTextEditor({
  el, view, palette, value, onChange, onCommit, onCancel,
}: {
  el: BoardElement;
  view: View;
  palette: Pal;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 10);
    return () => clearTimeout(t);
  }, [el.id]);
  const b = elementBounds(el);
  const p = toScreen(view, b.x, b.y);
  const isSticky = el.type === "sticky";
  const size = (el.fontSize ?? (isSticky ? 15 : el.type === "text" ? 18 : 13)) * view.zoom;
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={onCommit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onCommit(); }
      }}
      className="absolute z-30 resize-none outline-none border-2 rounded-[6px] bg-transparent no-scrollbar"
      style={{
        left: p.x, top: p.y, width: b.w * view.zoom, height: b.h * view.zoom,
        padding: 10 * view.zoom,
        fontSize: size,
        lineHeight: 1.32,
        color: resolve(palette, el.color, "fg"),
        borderColor: resolve(palette, "brand"),
        textAlign: el.type === "text" ? "left" : "center",
        background: el.type === "text" ? "transparent" : resolve(palette, el.fill, el.type === "sticky" ? "warn-bg" : "none"),
      }}
      placeholder="Type…"
    />
  );
}

export function SelectionActions({
  selection, view, onAction, canEdit, votes,
}: {
  selection: BoardElement[];
  view: View;
  onAction: (a: OverlayAction) => void;
  canEdit: boolean;
  votes: number;
}) {
  const b = React.useMemo(() => unionBounds(selection), [selection]);
  if (!b || !selection.length) return null;
  const c = rectCenter(b);
  const p = toScreen(view, c.x, b.y);
  const single = selection.length === 1 ? selection[0] : null;
  const locked = selection.every((e) => e.locked);
  const btn = "w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-2 hover:bg-[var(--neutral-bg)] disabled:opacity-40";
  return (
    <div
      className="absolute z-30 card flex items-center gap-0.5 px-1 py-1"
      style={{ left: p.x, top: p.y - 52, transform: "translateX(-50%)", boxShadow: "var(--shadow-lg)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button type="button" className={btn} title="Vote" onClick={() => onAction("vote")} disabled={!canEdit}>
        <ThumbsUp size={15} />{votes > 0 && <span className="text-[10px] ml-0.5 num">{votes}</span>}
      </button>
      <button type="button" className={btn} title="Comment" onClick={() => onAction("comment")}><MessageSquare size={15} /></button>
      {single && ["sticky", "text", "rect", "ellipse", "diamond", "frame"].includes(single.type) && (
        <button type="button" className={btn} title="Create task" onClick={() => onAction("task")} disabled={!canEdit}><CheckSquare size={15} /></button>
      )}
      <span className="w-px h-5 bg-[var(--line)] mx-0.5" />
      <button type="button" className={btn} title="Colours" onClick={() => onAction("style")} disabled={!canEdit}><Palette size={15} /></button>
      <button type="button" className={btn} title="Bring forward" onClick={() => onAction("forward")} disabled={!canEdit}><MoveUp size={15} /></button>
      <button type="button" className={btn} title="Send back" onClick={() => onAction("back")} disabled={!canEdit}><MoveDown size={15} /></button>
      <button type="button" className={btn} title="Duplicate" onClick={() => onAction("duplicate")} disabled={!canEdit}><Copy size={15} /></button>
      <button type="button" className={btn} title={locked ? "Unlock" : "Lock"} onClick={() => onAction("lock")} disabled={!canEdit}>
        {locked ? <Unlock size={15} /> : <Lock size={15} />}
      </button>
      <button type="button" className={cn(btn, "text-danger")} title="Delete" onClick={() => onAction("delete")} disabled={!canEdit}><Trash2 size={15} /></button>
      {selection.length > 1 && (
        <span className="pill tone-neutral ml-1"><Layers size={11} /> {selection.length}</span>
      )}
    </div>
  );
}
