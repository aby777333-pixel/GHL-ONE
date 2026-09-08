/**
 * GHL BOARD — canvas painting.
 *
 * Everything the board draws lives here; the geometry and palette helpers it builds on are in
 * `boardGeometry.ts` and are re-exported so callers only ever need to import `./boardDraw`.
 */
import type { BoardElement } from "@/lib/live/types";
import {
  GRID, HANDLE_ORDER, connectorPoints, elementBounds, handlePositions, iconKey, rectCenter, resolve, unionBounds,
  type Palette, type Rect, type View,
} from "./boardGeometry";

export * from "./boardGeometry";

/* ------------------------------------------------------------------ paint */
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of String(text).split("\n")) {
    if (!para) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) line = next;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

function fitFontSize(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, base: number, family: string) {
  let size = base;
  for (let i = 0; i < 6; i++) {
    ctx.font = `${size}px ${family}`;
    const lines = wrapLines(ctx, text, w);
    if (lines.length * size * 1.32 <= h || size <= 9) return { size, lines };
    size = Math.max(9, Math.round(size * 0.86));
  }
  ctx.font = `${size}px ${family}`;
  return { size, lines: wrapLines(ctx, text, w) };
}

export type DrawOpts = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  view: View;
  palette: Palette;
  elements: BoardElement[];
  background?: "grid" | "dots" | "plain";
  selected?: Set<string>;
  images?: Map<string, CanvasImageSource>;
  hidden?: Set<string>;
  marquee?: Rect | null;
  showChrome?: boolean;
  commentCounts?: Map<string, number>;
  fontFamily?: string;
};

const FONT = "var(--font-sans), ui-sans-serif, system-ui, sans-serif";

export function drawBoard(o: DrawOpts) {
  const { ctx, width, height, view, palette: p, elements } = o;
  const family = o.fontFamily || FONT;
  const byId = new Map(elements.map((e) => [e.id, e]));
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = resolve(p, "bg");
  ctx.fillRect(0, 0, width, height);
  drawBackground(ctx, width, height, view, p, o.background || "grid");

  ctx.save();
  ctx.translate(-view.x * view.zoom, -view.y * view.zoom);
  ctx.scale(view.zoom, view.zoom);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const ordered = [...elements].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  for (const el of ordered) {
    if (o.hidden?.has(el.id)) continue;
    const b = elementBounds(el, byId);
    ctx.save();
    if (el.rotation) {
      const c = rectCenter(b);
      ctx.translate(c.x, c.y);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-c.x, -c.y);
    }
    try {
      drawElement(ctx, el, b, p, family, byId, o.images, o.commentCounts?.get(el.id) || 0);
    } catch {
      /* one bad element must never kill the frame */
    }
    ctx.restore();
  }

  if (o.showChrome !== false) {
    const sel = o.selected && o.selected.size ? ordered.filter((e) => o.selected!.has(e.id)) : [];
    if (sel.length) drawSelection(ctx, sel, byId, p, view.zoom);
    if (o.marquee) {
      ctx.save();
      ctx.fillStyle = resolve(p, "brand");
      ctx.globalAlpha = 0.12;
      ctx.fillRect(o.marquee.x, o.marquee.y, o.marquee.w, o.marquee.h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = resolve(p, "brand");
      ctx.lineWidth = 1 / view.zoom;
      ctx.setLineDash([4 / view.zoom, 3 / view.zoom]);
      ctx.strokeRect(o.marquee.x, o.marquee.y, o.marquee.w, o.marquee.h);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number, v: View, p: Palette, kind: "grid" | "dots" | "plain") {
  if (kind === "plain") return;
  const step = GRID * v.zoom;
  if (step < 6) return;
  const ox = -(((v.x * v.zoom) % step) + step) % step;
  const oy = -(((v.y * v.zoom) % step) + step) % step;
  ctx.save();
  if (kind === "dots") {
    ctx.fillStyle = resolve(p, "line-strong");
    const r = Math.min(1.5, Math.max(0.6, step / 26));
    for (let x = ox; x < width + step; x += step) {
      for (let y = oy; y < height + step; y += step) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else {
    ctx.strokeStyle = resolve(p, "line");
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < width + step; x += step) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, height); }
    for (let y = oy; y < height + step; y += step) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(width, Math.round(y) + 0.5); }
    ctx.stroke();
  }
  ctx.restore();
}

function strokePoints(ctx: CanvasRenderingContext2D, el: BoardElement) {
  const pts = el.points || [];
  if (pts.length < 4) return;
  ctx.beginPath();
  ctx.moveTo(el.x + pts[0], el.y + pts[1]);
  for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(el.x + pts[i], el.y + pts[i + 1]);
  ctx.stroke();
}

function arrowHead(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, size: number, color: string) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - size * Math.cos(a - Math.PI / 7), y1 - size * Math.sin(a - Math.PI / 7));
  ctx.lineTo(x1 - size * Math.cos(a + Math.PI / 7), y1 - size * Math.sin(a + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function trimTo(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

function drawBoxText(
  ctx: CanvasRenderingContext2D, el: BoardElement, b: Rect, family: string,
  color: string, base: number, align: "top" | "center", left = false
) {
  const text = el.text || "";
  if (!text) return;
  const padX = 12, padY = 10;
  const maxW = Math.max(20, b.w - padX * 2);
  const maxH = Math.max(16, b.h - padY * 2);
  const { size, lines } = fitFontSize(ctx, text, maxW, maxH, el.fontSize ?? base, family);
  ctx.save();
  ctx.font = `${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = left ? "left" : "center";
  ctx.textBaseline = "middle";
  const lh = size * 1.32;
  const total = lines.length * lh;
  let y = align === "center" ? b.y + b.h / 2 - total / 2 + lh / 2 : b.y + padY + lh / 2;
  const x = left ? b.x + padX : b.x + b.w / 2;
  for (const line of lines) {
    if (y > b.y + b.h + lh) break;
    ctx.fillText(line, x, y);
    y += lh;
  }
  ctx.restore();
}

function drawElement(
  ctx: CanvasRenderingContext2D, el: BoardElement, b: Rect, p: Palette, family: string,
  byId: Map<string, BoardElement>, images?: Map<string, CanvasImageSource>, comments = 0
) {
  const stroke = resolve(p, el.color, "fg");
  const fill = resolve(p, el.fill, "none");
  const lw = el.strokeWidth ?? 2;
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;

  switch (el.type) {
    case "pen":
    case "line":
      strokePoints(ctx, el);
      break;
    case "highlighter":
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = Math.max(10, lw * 5);
      strokePoints(ctx, el);
      ctx.restore();
      break;
    case "arrow": {
      strokePoints(ctx, el);
      const pts = el.points || [];
      if (pts.length >= 4) {
        const n = pts.length;
        arrowHead(ctx, el.x + pts[n - 4], el.y + pts[n - 3], el.x + pts[n - 2], el.y + pts[n - 1], Math.max(9, lw * 4), stroke);
      }
      break;
    }
    case "connector": {
      const c = connectorPoints(el, byId);
      if (!c) break;
      const mx = (c[0] + c[2]) / 2, my = (c[1] + c[3]) / 2;
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(c[2], c[3]);
      ctx.stroke();
      arrowHead(ctx, c[0], c[1], c[2], c[3], Math.max(9, lw * 4), stroke);
      if (el.text) {
        ctx.save();
        ctx.font = `500 ${el.fontSize ?? 12}px ${family}`;
        const w = ctx.measureText(el.text).width + 12;
        ctx.fillStyle = resolve(p, "bg-elev");
        rrect(ctx, mx - w / 2, my - 10, w, 20, 6);
        ctx.fill();
        ctx.fillStyle = resolve(p, "fg-2");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(el.text, mx, my);
        ctx.restore();
      }
      break;
    }
    case "frame": {
      ctx.save();
      ctx.fillStyle = resolve(p, el.fill && el.fill !== "none" ? el.fill : "bg-elev");
      ctx.globalAlpha = el.fill && el.fill !== "none" ? 1 : 0.5;
      rrect(ctx, b.x, b.y, b.w, b.h, 14);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = resolve(p, el.color || "line-strong");
      ctx.lineWidth = Math.max(1.5, lw);
      rrect(ctx, b.x, b.y, b.w, b.h, 14);
      ctx.stroke();
      ctx.font = `600 14px ${family}`;
      ctx.fillStyle = resolve(p, "fg-muted");
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(el.title || el.text || "Frame", b.x + 2, b.y - 8);
      ctx.restore();
      break;
    }
    case "rect":
    case "ellipse":
    case "diamond": {
      ctx.beginPath();
      if (el.type === "rect") rrect(ctx, b.x, b.y, b.w, b.h, Math.min(10, b.w / 8, b.h / 8));
      else if (el.type === "ellipse") ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, Math.max(1, b.w / 2), Math.max(1, b.h / 2), 0, 0, Math.PI * 2);
      else {
        ctx.moveTo(b.x + b.w / 2, b.y);
        ctx.lineTo(b.x + b.w, b.y + b.h / 2);
        ctx.lineTo(b.x + b.w / 2, b.y + b.h);
        ctx.lineTo(b.x, b.y + b.h / 2);
        ctx.closePath();
      }
      if (fill !== "transparent") { ctx.fillStyle = fill; ctx.fill(); }
      ctx.stroke();
      if (el.text) drawBoxText(ctx, el, b, family, stroke, 13, "center");
      break;
    }
    case "sticky": {
      ctx.save();
      ctx.shadowColor = "rgba(15,23,42,0.16)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = fill === "transparent" ? resolve(p, "warn-bg") : fill;
      rrect(ctx, b.x, b.y, b.w, b.h, 8);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = resolve(p, "line");
      ctx.lineWidth = 1;
      rrect(ctx, b.x, b.y, b.w, b.h, 8);
      ctx.stroke();
      drawBoxText(ctx, el, b, family, resolve(p, el.color, "fg"), 15, "center");
      if (el.author) {
        ctx.save();
        ctx.font = `500 11px ${family}`;
        ctx.fillStyle = resolve(p, "fg-muted");
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(String(el.author).slice(0, 22), b.x + 10, b.y + b.h - 9);
        ctx.restore();
      }
      break;
    }
    case "text":
      drawBoxText(ctx, el, b, family, stroke, 18, "top", true);
      break;
    case "image": {
      const img = el.src ? images?.get(el.src) : undefined;
      if (img) {
        ctx.save();
        rrect(ctx, b.x, b.y, b.w, b.h, 8);
        ctx.clip();
        ctx.drawImage(img, b.x, b.y, b.w, b.h);
        ctx.restore();
      } else {
        ctx.fillStyle = resolve(p, "bg-sunken");
        rrect(ctx, b.x, b.y, b.w, b.h, 8);
        ctx.fill();
        ctx.strokeStyle = resolve(p, "line");
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = `500 12px ${family}`;
        ctx.fillStyle = resolve(p, "fg-muted");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(el.name || "Loading image…", b.x + b.w / 2, b.y + b.h / 2);
      }
      break;
    }
    case "icon": {
      const img = images?.get(iconKey(el));
      if (img) ctx.drawImage(img, b.x, b.y, b.w, b.h);
      else {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        rrect(ctx, b.x, b.y, b.w, b.h, 10);
        ctx.stroke();
      }
      break;
    }
    case "file": {
      ctx.fillStyle = resolve(p, "bg-elev");
      rrect(ctx, b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      ctx.strokeStyle = resolve(p, "line-strong");
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = resolve(p, "info-bg");
      rrect(ctx, b.x + 12, b.y + b.h / 2 - 16, 26, 32, 4);
      ctx.fill();
      ctx.strokeStyle = resolve(p, "info");
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = `600 13px ${family}`;
      ctx.fillStyle = resolve(p, "fg");
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(trimTo(ctx, el.name || el.text || "File", b.w - 60), b.x + 48, b.y + b.h / 2);
      break;
    }
    case "table": {
      const rows = el.rows && el.rows.length ? el.rows : [["", ""], ["", ""]];
      const cols = Math.max(1, ...rows.map((r) => r.length));
      const cw = b.w / cols, ch = b.h / rows.length;
      ctx.fillStyle = resolve(p, "bg-elev");
      rrect(ctx, b.x, b.y, b.w, b.h, 8);
      ctx.fill();
      ctx.fillStyle = resolve(p, "bg-sunken");
      ctx.fillRect(b.x, b.y, b.w, ch);
      ctx.strokeStyle = resolve(p, "line");
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < cols; c++) { ctx.moveTo(b.x + c * cw, b.y); ctx.lineTo(b.x + c * cw, b.y + b.h); }
      for (let r = 1; r < rows.length; r++) { ctx.moveTo(b.x, b.y + r * ch); ctx.lineTo(b.x + b.w, b.y + r * ch); }
      ctx.stroke();
      ctx.strokeStyle = resolve(p, "line-strong");
      rrect(ctx, b.x, b.y, b.w, b.h, 8);
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.font = `${r === 0 ? "600" : "400"} ${el.fontSize ?? 12}px ${family}`;
          ctx.fillStyle = resolve(p, r === 0 ? "fg" : "fg-2");
          ctx.fillText(trimTo(ctx, rows[r]?.[c] || "", cw - 12), b.x + c * cw + 6, b.y + r * ch + ch / 2);
        }
      }
      break;
    }
    case "comment": {
      const r = 13;
      ctx.fillStyle = resolve(p, el.fill && el.fill !== "none" ? el.fill : "warn");
      ctx.beginPath();
      ctx.arc(b.x + r, b.y + r, r, Math.PI * 0.3, Math.PI * 2.1);
      ctx.lineTo(b.x + r * 0.55, b.y + r * 2.35);
      ctx.closePath();
      ctx.fill();
      ctx.font = `700 11px ${family}`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(comments || 1), b.x + r, b.y + r);
      break;
    }
  }

  if (el.votes && el.votes.length) {
    ctx.save();
    const vx = b.x + b.w - 11, vy = b.y + 3;
    ctx.fillStyle = resolve(p, "brand");
    ctx.beginPath();
    ctx.arc(vx, vy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 11px ${family}`;
    ctx.fillStyle = resolve(p, "brand-fg");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(el.votes.length), vx, vy);
    ctx.restore();
  }
  if (el.locked) {
    ctx.save();
    ctx.strokeStyle = resolve(p, "fg-muted");
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
    ctx.restore();
  }
}

function drawSelection(ctx: CanvasRenderingContext2D, sel: BoardElement[], byId: Map<string, BoardElement>, p: Palette, zoom: number) {
  const brand = resolve(p, "brand");
  const single = sel.length === 1 ? sel[0] : null;
  const b = single ? elementBounds(single, byId) : unionBounds(sel, byId);
  if (!b) return;
  const rotation = single?.rotation || 0;
  ctx.save();
  ctx.lineWidth = 1.5 / zoom;
  ctx.strokeStyle = brand;
  if (!single) {
    ctx.setLineDash([5 / zoom, 4 / zoom]);
    for (const e of sel) {
      const eb = elementBounds(e, byId);
      ctx.strokeRect(eb.x, eb.y, eb.w, eb.h);
    }
    ctx.setLineDash([]);
  }
  const c = rectCenter(b);
  if (rotation) {
    ctx.translate(c.x, c.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-c.x, -c.y);
  }
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  const hs = 8 / zoom;
  ctx.fillStyle = resolve(p, "bg-elev");
  const pos = handlePositions(b, 0);
  for (const id of HANDLE_ORDER) {
    const h = pos.find((x) => x.id === id);
    if (!h) continue;
    ctx.beginPath();
    ctx.rect(h.p.x - hs / 2, h.p.y - hs / 2, hs, hs);
    ctx.fill();
    ctx.stroke();
  }
  if (single) {
    ctx.beginPath();
    ctx.moveTo(c.x, b.y);
    ctx.lineTo(c.x, b.y - 28);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c.x, b.y - 28, hs * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ export */
/** Render `elements` onto a detached canvas — used by PNG / PDF export. */
export function renderToCanvas(
  elements: BoardElement[], palette: Palette, background: "grid" | "dots" | "plain",
  images: Map<string, CanvasImageSource>, scale = 2, pad = 48
): HTMLCanvasElement {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const b = unionBounds(elements, byId) || { x: 0, y: 0, w: 1200, h: 800 };
  const w = Math.max(320, Math.min(6000, Math.round((b.w + pad * 2) * scale)));
  const h = Math.max(240, Math.min(6000, Math.round((b.h + pad * 2) * scale)));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(scale, scale);
  drawBoard({
    ctx, width: w / scale, height: h / scale, view: { x: b.x - pad, y: b.y - pad, zoom: 1 },
    palette, elements, background, images, showChrome: false,
  });
  return canvas;
}
