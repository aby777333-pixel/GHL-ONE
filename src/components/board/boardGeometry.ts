/**
 * GHL BOARD — geometry, hit-testing and the theme palette.
 *
 * No React, no Supabase, no canvas: plain functions the renderer, the pointer state machine
 * and the exporters all share. Colours are never hard-coded — they resolve from the CSS
 * tokens in globals.css (read per repaint via `readPalette()`), so dark mode works for free.
 */
import type { BoardElement, BoardElementType } from "@/lib/live/types";

export type View = { x: number; y: number; zoom: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Palette = Record<string, string>;
export type Point = { x: number; y: number };

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
export const GRID = 20;

/* ------------------------------------------------------------------ palette */
const VARS = [
  "bg", "bg-elev", "bg-sunken", "fg", "fg-2", "fg-muted", "line", "line-strong", "brand", "brand-fg", "accent",
  "success", "warn", "danger", "info", "violet", "orange", "neutral",
  "success-bg", "warn-bg", "danger-bg", "info-bg", "violet-bg", "orange-bg", "neutral-bg",
];

/** Read every token this renderer paints with from the document root. Call again on theme change. */
export function readPalette(): Palette {
  const p: Palette = {};
  if (typeof document === "undefined") return p;
  const cs = getComputedStyle(document.documentElement);
  for (const v of VARS) p[v] = (cs.getPropertyValue(`--${v}`) || "").trim() || "#808080";
  return p;
}

/** Stroke / text colours offered in the picker (token keys). */
export const STROKE_COLORS = ["fg", "brand", "danger", "warn", "success", "info", "violet", "orange", "fg-muted"];
/** Fill colours offered in the picker (token keys; "none" = transparent). */
export const FILL_COLORS = ["warn-bg", "info-bg", "success-bg", "violet-bg", "orange-bg", "danger-bg", "neutral-bg", "none"];

export function resolve(p: Palette, c?: string | null, fallback = "fg"): string {
  const key = c || fallback;
  if (key === "none" || key === "transparent") return "transparent";
  if (key.startsWith("#") || key.startsWith("rgb") || key.startsWith("hsl")) return key;
  if (key.startsWith("var(")) return p[key.slice(6, -1)] || p[fallback] || "#808080";
  return p[key] || p[fallback] || "#808080";
}

/* ---------------------------------------------------------------- geometry */
export const DEFAULT_SIZE: Partial<Record<BoardElementType, [number, number]>> = {
  sticky: [180, 180], text: [240, 44], rect: [200, 130], ellipse: [180, 130], diamond: [180, 130],
  image: [280, 200], file: [230, 76], icon: [72, 72], table: [360, 140], frame: [640, 440], comment: [28, 30],
};

export function sizeOf(el: BoardElement): [number, number] {
  const d = DEFAULT_SIZE[el.type] || [140, 90];
  return [el.w ?? d[0], el.h ?? d[1]];
}

export function normRect(x0: number, y0: number, x1: number, y1: number): Rect {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function rotPoint(p: Point, c: Point, deg: number): Point {
  if (!deg) return p;
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** Walk from `from` towards `to` and stop on the border of `r`. */
function clipToRect(from: Point, to: Point, r: Rect): Point {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (!dx && !dy) return from;
  const hw = r.w / 2 + 3, hh = r.h / 2 + 3;
  const sx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const sy = dy === 0 ? Infinity : hh / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: from.x + dx * s, y: from.y + dy * s };
}

/** Where a connector actually starts and ends: centres of the two anchored elements, clipped to their edges. */
export function connectorPoints(el: BoardElement, byId: Map<string, BoardElement>): [number, number, number, number] | null {
  const a = el.from ? byId.get(el.from) : undefined;
  const b = el.to ? byId.get(el.to) : undefined;
  if (a && b) {
    const ra = elementBounds(a), rb = elementBounds(b);
    const ca = rectCenter(ra), cb = rectCenter(rb);
    const p1 = clipToRect(ca, cb, ra), p2 = clipToRect(cb, ca, rb);
    return [p1.x, p1.y, p2.x, p2.y];
  }
  if (el.points && el.points.length >= 4) {
    return [el.x + el.points[0], el.y + el.points[1], el.x + el.points[2], el.y + el.points[3]];
  }
  if (a) {
    const ca = rectCenter(elementBounds(a));
    return [ca.x, ca.y, el.x, el.y];
  }
  return null;
}

export function elementBounds(el: BoardElement, byId?: Map<string, BoardElement>): Rect {
  if (el.type === "connector" && byId) {
    const p = connectorPoints(el, byId);
    if (p) {
      const r = normRect(p[0], p[1], p[2], p[3]);
      return { x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 };
    }
  }
  if (el.points && el.points.length >= 2 && el.type !== "connector") {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (let i = 0; i + 1 < el.points.length; i += 2) {
      const px = el.x + el.points[i], py = el.y + el.points[i + 1];
      if (px < minx) minx = px;
      if (px > maxx) maxx = px;
      if (py < miny) miny = py;
      if (py > maxy) maxy = py;
    }
    const pad = Math.max(2, (el.strokeWidth ?? 2) / 2);
    return { x: minx - pad, y: miny - pad, w: maxx - minx + pad * 2, h: maxy - miny + pad * 2 };
  }
  const [w, h] = sizeOf(el);
  return { x: el.x, y: el.y, w, h };
}

export function unionBounds(els: BoardElement[], byId?: Map<string, BoardElement>): Rect | null {
  if (!els.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of els) {
    const b = elementBounds(e, byId);
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function distToSeg(px: number, py: number, x0: number, y0: number, x1: number, y1: number) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len)) : 0;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

const STROKY = new Set<BoardElementType>(["pen", "highlighter", "line", "arrow"]);

export function hitElement(el: BoardElement, wx: number, wy: number, tolerance: number, byId: Map<string, BoardElement>): boolean {
  if (el.type === "connector") {
    const p = connectorPoints(el, byId);
    if (!p) return false;
    return distToSeg(wx, wy, p[0], p[1], p[2], p[3]) <= Math.max(tolerance, (el.strokeWidth ?? 2) + 5);
  }
  const b = elementBounds(el, byId);
  const c = rectCenter(b);
  const q = el.rotation ? rotPoint({ x: wx, y: wy }, c, -el.rotation) : { x: wx, y: wy };
  if (STROKY.has(el.type) && el.points && el.points.length >= 4) {
    const tol = Math.max(tolerance, (el.strokeWidth ?? 2) + (el.type === "highlighter" ? 12 : 5));
    for (let i = 0; i + 3 < el.points.length; i += 2) {
      if (distToSeg(q.x, q.y, el.x + el.points[i], el.y + el.points[i + 1], el.x + el.points[i + 2], el.y + el.points[i + 3]) <= tol) return true;
    }
    return false;
  }
  return q.x >= b.x - tolerance && q.x <= b.x + b.w + tolerance && q.y >= b.y - tolerance && q.y <= b.y + b.h + tolerance;
}

/** Topmost element under a world point. Frames are only picked by their title bar / border so they never swallow clicks. */
export function hitTest(elements: BoardElement[], wx: number, wy: number, tolerance: number, byId: Map<string, BoardElement>): BoardElement | null {
  const ordered = [...elements].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  for (let i = ordered.length - 1; i >= 0; i--) {
    const el = ordered[i];
    if (el.type === "frame") continue;
    if (hitElement(el, wx, wy, tolerance, byId)) return el;
  }
  for (let i = ordered.length - 1; i >= 0; i--) {
    const el = ordered[i];
    if (el.type !== "frame") continue;
    const b = elementBounds(el);
    if (wx >= b.x && wx <= b.x + b.w && wy >= b.y - 28 && wy <= b.y) return el;
    const near = Math.abs(wx - b.x) < tolerance || Math.abs(wx - (b.x + b.w)) < tolerance || Math.abs(wy - b.y) < tolerance || Math.abs(wy - (b.y + b.h)) < tolerance;
    if (near && wx >= b.x - tolerance && wx <= b.x + b.w + tolerance && wy >= b.y - tolerance && wy <= b.y + b.h + tolerance) return el;
  }
  return null;
}

export function elementsInRect(elements: BoardElement[], r: Rect, byId: Map<string, BoardElement>): BoardElement[] {
  return elements.filter((el) => {
    const b = elementBounds(el, byId);
    return b.x + b.w >= r.x && b.x <= r.x + r.w && b.y + b.h >= r.y && b.y <= r.y + r.h;
  });
}

/** Stickies / shapes whose centre falls inside a frame — used by "board to project". */
export function elementsInFrame(elements: BoardElement[], frame: BoardElement): BoardElement[] {
  const b = elementBounds(frame);
  return elements.filter((e) => {
    if (e.id === frame.id || e.type === "frame") return false;
    const c = rectCenter(elementBounds(e));
    return c.x >= b.x && c.x <= b.x + b.w && c.y >= b.y && c.y <= b.y + b.h;
  });
}

/* ------------------------------------------------------------------ handles */
export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rot";
export const HANDLE_ORDER: HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function handlePositions(b: Rect, rotation = 0): { id: HandleId; p: Point }[] {
  const c = rectCenter(b);
  const raw: [HandleId, number, number][] = [
    ["nw", b.x, b.y], ["n", c.x, b.y], ["ne", b.x + b.w, b.y], ["e", b.x + b.w, c.y],
    ["se", b.x + b.w, b.y + b.h], ["s", c.x, b.y + b.h], ["sw", b.x, b.y + b.h], ["w", b.x, c.y],
    ["rot", c.x, b.y - 28],
  ];
  return raw.map(([id, x, y]) => ({ id, p: rotPoint({ x, y }, c, rotation) }));
}

export function handleAt(b: Rect, rotation: number, world: Point, zoom: number, withRotate: boolean): HandleId | null {
  const tol = 10 / zoom;
  for (const h of handlePositions(b, rotation)) {
    if (h.id === "rot" && !withRotate) continue;
    if (Math.abs(world.x - h.p.x) <= tol && Math.abs(world.y - h.p.y) <= tol) return h.id;
  }
  return null;
}

export const HANDLE_CURSOR: Record<HandleId, string> = {
  nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", rot: "grab",
};

/** New axis-aligned bounds after dragging `handle` to `world` (rotation-aware: the opposite corner stays put). */
export function resizeRect(b: Rect, handle: HandleId, world: Point, rotation: number, keepRatio: boolean): Rect {
  const c = rectCenter(b);
  const l = rotation ? rotPoint(world, c, -rotation) : world;
  let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
  if (handle.includes("w")) x0 = l.x;
  if (handle.includes("e")) x1 = l.x;
  if (handle.includes("n")) y0 = l.y;
  if (handle.includes("s")) y1 = l.y;
  let nb = normRect(x0, y0, x1, y1);
  nb = { ...nb, w: Math.max(8, nb.w), h: Math.max(8, nb.h) };
  if (keepRatio && b.w > 0 && b.h > 0 && handle.length === 2) {
    const ratio = b.w / b.h;
    if (nb.w / nb.h > ratio) nb.w = nb.h * ratio;
    else nb.h = nb.w / ratio;
    if (handle.includes("w")) nb.x = x1 - nb.w;
    if (handle.includes("n")) nb.y = y1 - nb.h;
  }
  if (!rotation) return nb;
  const anchor: Point = {
    x: handle.includes("w") ? b.x + b.w : handle.includes("e") ? b.x : c.x,
    y: handle.includes("n") ? b.y + b.h : handle.includes("s") ? b.y : c.y,
  };
  const before = rotPoint(anchor, c, rotation);
  const after = rotPoint(anchor, rectCenter(nb), rotation);
  return { ...nb, x: nb.x + (before.x - after.x), y: nb.y + (before.y - after.y) };
}

/* ------------------------------------------------------------------- view */
export function toScreen(v: View, wx: number, wy: number): Point {
  return { x: (wx - v.x) * v.zoom, y: (wy - v.y) * v.zoom };
}
export function toWorld(v: View, sx: number, sy: number): Point {
  return { x: sx / v.zoom + v.x, y: sy / v.zoom + v.y };
}
export function zoomAt(v: View, sx: number, sy: number, zoom: number): View {
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  const w = toWorld(v, sx, sy);
  return { zoom: z, x: w.x - sx / z, y: w.y - sy / z };
}
export function fitView(els: BoardElement[], vw: number, vh: number, byId: Map<string, BoardElement>, pad = 80): View {
  const b = unionBounds(els, byId);
  if (!b || b.w <= 0 || b.h <= 0) return { x: -vw / 2, y: -vh / 2, zoom: 1 };
  const z = Math.max(MIN_ZOOM, Math.min(2, Math.min((vw - pad * 2) / b.w, (vh - pad * 2) / b.h)));
  return { zoom: z, x: b.x + b.w / 2 - vw / (2 * z), y: b.y + b.h / 2 - vh / (2 * z) };
}
export function centerOn(r: Rect, vw: number, vh: number, zoom: number): View {
  return { zoom, x: r.x + r.w / 2 - vw / (2 * zoom), y: r.y + r.h / 2 - vh / (2 * zoom) };
}

/** Cache key for a rasterised lucide icon. */
export function iconKey(el: { icon?: string | null; color?: string | null }) {
  return `${el.icon || "star"}|${el.color || "fg"}`;
}
