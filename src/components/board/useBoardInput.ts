"use client";
/**
 * All pointer, touch and keyboard interaction for the board editor.
 *
 * Kept out of BoardCanvas so the editor component stays readable: this hook owns the drag
 * state machine (pan / pinch / draw / move / resize / rotate / marquee / create / connect),
 * element creation for every tool, and the keyboard shortcuts.
 */
import * as React from "react";
import type { BoardElement, BoardOp } from "@/lib/live/types";
import {
  elementBounds, elementsInRect, handleAt, hitTest, rectCenter, resizeRect, toWorld, unionBounds, zoomAt,
  type HandleId, type Rect, type View,
} from "./boardDraw";
import type { BoardStyle, Tool } from "./BoardToolbar";
import type { OverlayAction } from "./BoardElementLayer";
import { uid } from "./BoardTemplates";

type Drag =
  | { m: "none" }
  | { m: "pan"; sx: number; sy: number; view: View }
  | { m: "pinch"; dist: number; zoom: number; cx: number; cy: number; view: View }
  | { m: "draw"; id: string; pts: number[]; ox: number; oy: number }
  | { m: "seg"; id: string; ox: number; oy: number }
  | { m: "move"; start: { x: number; y: number }; from: Map<string, { x: number; y: number }> }
  | { m: "resize"; id: string; handle: HandleId; base: Rect; rotation: number; pts?: number[] }
  | { m: "rotate"; id: string; center: { x: number; y: number } }
  | { m: "marquee"; start: { x: number; y: number }; additive: boolean }
  | { m: "create"; id: string; ox: number; oy: number }
  | { m: "connect"; from: string; id: string };

const EDITABLE = ["sticky", "text", "rect", "ellipse", "diamond", "frame", "table", "connector"];
const HOTKEYS: Record<string, Tool> = { v: "select", h: "hand", p: "pen", s: "sticky", t: "text", r: "rect", o: "ellipse", a: "arrow", c: "connector", f: "frame" };

export type BoardInputOptions = {
  wrapRef: React.RefObject<HTMLDivElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  elements: BoardElement[];
  byId: Map<string, BoardElement>;
  selection: string[];
  selected: BoardElement[];
  setSelection: (ids: string[]) => void;
  canEdit: boolean;
  pageId: string;
  send: (op: BoardOp | BoardOp[], opts?: { record?: boolean; broadcast?: boolean }) => void;
  patch: (id: string, p: Partial<BoardElement>, opts?: { record?: boolean; broadcast?: boolean }) => void;
  nextZ: (delta?: number) => number;
  view: View;
  setView: React.Dispatch<React.SetStateAction<View>>;
  tool: Tool;
  setTool: (t: Tool) => void;
  style: BoardStyle;
  author: { id: string; name: string };
  spaceDown: boolean;
  setSpaceDown: (v: boolean) => void;
  editing: boolean;
  commitEditing: () => void;
  startEditing: (el: BoardElement) => void;
  marquee: Rect | null;
  setMarquee: (r: Rect | null) => void;
  presenting: boolean;
  stepSlide: (d: 1 | -1) => void;
  exitPresent: () => void;
  sendCursor: (x: number, y: number, laser?: boolean) => void;
  setFileKind: (k: "image" | "file") => void;
  openComments: (elementId: string | null) => void;
  closeContextMenu: () => void;
  undo: () => void;
  redo: () => void;
  duplicateSelected: () => void;
  removeSelected: () => void;
  overlayAction: (a: OverlayAction) => void;
};

export function useBoardInput(o: BoardInputOptions) {
  const dragRef = React.useRef<Drag>({ m: "none" });
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const clipboard = React.useRef<BoardElement[]>([]);
  const lastBroadcast = React.useRef(0);

  const {
    wrapRef, fileInputRef, elements, byId, selection, selected, setSelection, canEdit, pageId, send, patch, nextZ,
    view, setView, tool, setTool, style, author, spaceDown, setSpaceDown, editing, commitEditing, startEditing,
    marquee, setMarquee, presenting, stepSlide, exitPresent, sendCursor, setFileKind, openComments, closeContextMenu,
    undo, redo, duplicateSelected, removeSelected, overlayAction,
  } = o;

  const localPoint = React.useCallback((e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current?.getBoundingClientRect();
    return { sx: e.clientX - (r?.left ?? 0), sy: e.clientY - (r?.top ?? 0) };
  }, [wrapRef]);

  /** The element a tool creates on first press. */
  const makeElement = React.useCallback((type: Tool, w: { x: number; y: number }): BoardElement | null => {
    const base = { id: uid(), x: w.x, y: w.y, z: nextZ(), color: style.color, strokeWidth: style.strokeWidth, fontSize: style.fontSize } as BoardElement;
    switch (type) {
      case "sticky": return { ...base, type: "sticky", w: 180, h: 130, fill: style.fill === "none" ? "warn-bg" : style.fill, text: "", author: author.name, authorId: author.id };
      case "text": return { ...base, type: "text", w: 260, h: 48, text: "", fontSize: Math.max(16, style.fontSize) };
      case "rect": case "ellipse": case "diamond": return { ...base, type, w: 200, h: 130, fill: style.fill, text: "" };
      case "frame": return { ...base, type: "frame", w: 640, h: 440, title: "Frame", z: -900, color: "line-strong", fill: "none" };
      case "table": return { ...base, type: "table", w: 360, h: 140, rows: [["Column", "Column"], ["", ""], ["", ""]], fontSize: 12 };
      case "icon": return { ...base, type: "icon", w: 72, h: 72, icon: style.icon };
      case "comment": return { ...base, type: "comment", w: 28, h: 30, fill: "warn" };
      case "pen": case "highlighter": return { ...base, type, points: [0, 0], fill: "none" };
      case "line": case "arrow": return { ...base, type, points: [0, 0, 0, 0], fill: "none" };
      default: return null;
    }
  }, [nextZ, style, author]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (presenting) return;
    closeContextMenu();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const { sx, sy } = localPoint(e);
    pointers.current.set(e.pointerId, { x: sx, y: sy });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      dragRef.current = { m: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: view.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view };
      return;
    }
    if (editing) commitEditing();
    const w = toWorld(view, sx, sy);

    if (spaceDown || e.button === 1 || tool === "hand") { dragRef.current = { m: "pan", sx, sy, view }; return; }
    if (tool === "laser") return;
    if (e.button === 2) return;

    if (tool === "select") {
      if (selected.length && canEdit) {
        const b = selected.length === 1 ? elementBounds(selected[0], byId) : unionBounds(selected, byId);
        const rot = selected.length === 1 ? selected[0].rotation || 0 : 0;
        const h = b ? handleAt(b, rot, w, view.zoom, selected.length === 1) : null;
        if (h && b) {
          if (h === "rot") dragRef.current = { m: "rotate", id: selected[0].id, center: rectCenter(b) };
          else dragRef.current = { m: "resize", id: selected[0].id, handle: h, base: b, rotation: rot, pts: selected[0].points ? [...selected[0].points] : undefined };
          return;
        }
      }
      const hit = hitTest(elements, w.x, w.y, 6 / view.zoom, byId);
      if (hit) {
        if (hit.type === "comment") { setSelection([hit.id]); openComments(hit.id); return; }
        const next = e.shiftKey
          ? selection.includes(hit.id) ? selection.filter((s) => s !== hit.id) : [...selection, hit.id]
          : selection.includes(hit.id) ? selection : [hit.id];
        setSelection(next);
        if (!canEdit || hit.locked) return;
        const from = new Map<string, { x: number; y: number }>();
        for (const id of next) {
          const el = byId.get(id);
          if (el && !el.locked) from.set(id, { x: el.x, y: el.y });
        }
        dragRef.current = { m: "move", start: w, from };
        return;
      }
      if (!e.shiftKey) setSelection([]);
      dragRef.current = { m: "marquee", start: w, additive: e.shiftKey };
      return;
    }

    if (!canEdit) return;

    if (tool === "image" || tool === "file") {
      setFileKind(tool);
      fileInputRef.current?.click();
      setTool("select");
      return;
    }

    if (tool === "connector") {
      const hit = hitTest(elements, w.x, w.y, 6 / view.zoom, byId);
      if (!hit) return;
      const el: BoardElement = { id: uid(), type: "connector", x: w.x, y: w.y, z: nextZ(), from: hit.id, points: [0, 0, 0, 0], color: style.color, strokeWidth: style.strokeWidth };
      send({ op: "add", pageId, el });
      dragRef.current = { m: "connect", from: hit.id, id: el.id };
      return;
    }

    const el = makeElement(tool, w);
    if (!el) return;
    send({ op: "add", pageId, el });
    if (tool === "pen" || tool === "highlighter") dragRef.current = { m: "draw", id: el.id, pts: [0, 0], ox: w.x, oy: w.y };
    else if (tool === "line" || tool === "arrow") dragRef.current = { m: "seg", id: el.id, ox: w.x, oy: w.y };
    else if (tool === "comment") {
      setSelection([el.id]);
      openComments(el.id);
      setTool("select");
    } else {
      dragRef.current = { m: "create", id: el.id, ox: w.x, oy: w.y };
      setSelection([el.id]);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { sx, sy } = localPoint(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: sx, y: sy });
    const w = toWorld(view, sx, sy);
    if (!presenting) sendCursor(w.x, w.y, tool === "laser");

    const d = dragRef.current;
    const now = Date.now();
    // intermediate frames are thinned out on the wire; the final op of the gesture carries the truth
    const live = now - lastBroadcast.current > 45;
    if (live) lastBroadcast.current = now;
    const opts = { record: false as const, broadcast: live };

    switch (d.m) {
      case "pinch": {
        if (pointers.current.size < 2) return;
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        setView(zoomAt(d.view, d.cx, d.cy, d.zoom * (dist / d.dist)));
        return;
      }
      case "pan":
        setView({ ...d.view, x: d.view.x - (sx - d.sx) / d.view.zoom, y: d.view.y - (sy - d.sy) / d.view.zoom });
        return;
      case "draw": {
        const pts = [...d.pts, w.x - d.ox, w.y - d.oy];
        dragRef.current = { ...d, pts };
        patch(d.id, { points: pts }, opts);
        return;
      }
      case "seg":
        patch(d.id, { points: [0, 0, w.x - d.ox, w.y - d.oy] }, opts);
        return;
      case "connect": {
        const hit = hitTest(elements.filter((x) => x.id !== d.id), w.x, w.y, 6 / view.zoom, byId);
        patch(d.id, hit && hit.id !== d.from ? { to: hit.id } : { to: undefined, x: w.x, y: w.y }, opts);
        return;
      }
      case "create": {
        const r = { x: Math.min(d.ox, w.x), y: Math.min(d.oy, w.y), w: Math.abs(w.x - d.ox), h: Math.abs(w.y - d.oy) };
        if (r.w < 12 && r.h < 12) return;
        patch(d.id, { x: r.x, y: r.y, w: Math.max(20, r.w), h: Math.max(20, r.h) }, opts);
        return;
      }
      case "move": {
        const dx = w.x - d.start.x, dy = w.y - d.start.y;
        send([...d.from.entries()].map(([id, p]) => ({ op: "update", pageId, id, patch: { x: p.x + dx, y: p.y + dy } } as BoardOp)), opts);
        return;
      }
      case "resize": {
        const nb = resizeRect(d.base, d.handle, w, d.rotation, e.shiftKey);
        const el = byId.get(d.id);
        const p: Partial<BoardElement> = { x: nb.x, y: nb.y, w: nb.w, h: nb.h };
        if (el?.points && d.pts && d.base.w > 0 && d.base.h > 0) {
          const kx = nb.w / d.base.w, ky = nb.h / d.base.h;
          p.points = d.pts.map((v, i) => (i % 2 ? v * ky : v * kx));
          delete p.w;
          delete p.h;
        }
        patch(d.id, p, opts);
        return;
      }
      case "rotate": {
        const deg = (Math.atan2(w.y - d.center.y, w.x - d.center.x) * 180) / Math.PI + 90;
        patch(d.id, { rotation: e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg) }, opts);
        return;
      }
      case "marquee":
        setMarquee({ x: Math.min(d.start.x, w.x), y: Math.min(d.start.y, w.y), w: Math.abs(w.x - d.start.x), h: Math.abs(w.y - d.start.y) });
        return;
      default:
        return;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = dragRef.current;
    dragRef.current = { m: "none" };
    if (d.m === "marquee" && marquee) {
      const found = elementsInRect(elements, marquee, byId).map((x) => x.id);
      setSelection(d.additive ? [...new Set([...selection, ...found])] : found);
      setMarquee(null);
      return;
    }
    if (d.m === "connect") {
      const el = byId.get(d.id);
      if (el && !el.to) send({ op: "remove", pageId, ids: [d.id] }, { record: false });
      setTool("select");
      return;
    }
    if (d.m === "draw" || d.m === "seg") {
      const el = byId.get(d.id);
      if (el && (!el.points || el.points.length <= 2)) send({ op: "remove", pageId, ids: [d.id] }, { record: false });
      return;
    }
    if (d.m === "create") {
      const el = byId.get(d.id);
      setTool("select");
      if (el && (el.type === "sticky" || el.type === "text")) startEditing(el);
      return;
    }
    // one final authoritative broadcast for anyone who missed a thinned-out frame
    if (d.m === "move") {
      const ops = [...d.from.keys()]
        .map((id) => byId.get(id))
        .filter((el): el is BoardElement => !!el)
        .map((el) => ({ op: "update", pageId, id: el.id, patch: { x: el.x, y: el.y } } as BoardOp));
      send(ops, { record: false });
    }
    if (d.m === "resize" || d.m === "rotate") {
      const el = byId.get(d.id);
      if (el) patch(el.id, { x: el.x, y: el.y, w: el.w, h: el.h, points: el.points, rotation: el.rotation }, { record: false });
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!canEdit || presenting) return;
    const { sx, sy } = localPoint(e);
    const w = toWorld(view, sx, sy);
    const hit = hitTest(elements, w.x, w.y, 6 / view.zoom, byId);
    if (hit) {
      if (EDITABLE.includes(hit.type)) { setSelection([hit.id]); startEditing(hit); }
      return;
    }
    const el = makeElement("sticky", { x: w.x - 90, y: w.y - 65 });
    if (!el) return;
    send({ op: "add", pageId, el });
    setSelection([el.id]);
    startEditing(el);
  };

  /* -------------------------------------------------------------- keyboard */
  React.useEffect(() => {
    const isField = () => {
      const a = document.activeElement;
      return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || (a as HTMLElement).isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(true);
      if (isField()) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && key === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && key === "y") { e.preventDefault(); redo(); return; }
      if (mod && key === "d") { e.preventDefault(); duplicateSelected(); return; }
      if (mod && key === "a") { e.preventDefault(); setSelection(elements.map((x) => x.id)); return; }
      if (mod && key === "c") { clipboard.current = selected.map((x) => ({ ...x })); return; }
      if (mod && key === "v" && clipboard.current.length) {
        e.preventDefault();
        const copies = clipboard.current.map((x) => ({ ...x, id: uid(), x: x.x + 30, y: x.y + 30, z: nextZ(), taskId: null, votes: [] }));
        send(copies.map((el) => ({ op: "add", pageId, el } as BoardOp)));
        setSelection(copies.map((c) => c.id));
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelected(); return; }
      if (e.key === "Escape") { setSelection([]); setTool("select"); exitPresent(); return; }
      if (presenting) {
        if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); stepSlide(1); return; }
        if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); stepSlide(-1); return; }
      }
      if (selection.length && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        send(selected.map((el) => ({ op: "update", pageId, id: el.id, patch: { x: el.x + dx, y: el.y + dy } } as BoardOp)));
        return;
      }
      if (e.key === "[") { overlayAction("back"); return; }
      if (e.key === "]") { overlayAction("forward"); return; }
      const t = HOTKEYS[key];
      if (t && !mod) setTool(t);
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceDown(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [
    undo, redo, duplicateSelected, removeSelected, elements, selected, selection, send, pageId, nextZ,
    overlayAction, presenting, setSelection, setTool, setSpaceDown, stepSlide, exitPresent,
  ]);

  return { onPointerDown, onPointerMove, onPointerUp, onDoubleClick };
}
