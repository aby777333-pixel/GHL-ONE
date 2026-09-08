"use client";
/**
 * Annotations (§22, §23) — an ephemeral drawing layer above the shared screen.
 * Every point is normalised 0..1 so a stroke drawn on a laptop lands in the same
 * place on a phone. Strokes and pointers travel over the LiveKit data channel and
 * are never persisted (use "Create task from this screen" to keep something).
 */
import * as React from "react";
import { ArrowUpRight, Circle, Eraser, Highlighter, Pencil, Square, Type } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { LiveDataMessage } from "@/lib/live/types";

export type AnnotKind = "pen" | "arrow" | "circle" | "rect" | "text" | "highlight";
export type Stroke = { id: string; kind: AnnotKind; pts: number[]; color: string; text?: string; born: number; ttl: number };
export type Pointer = { id: string; name: string; x: number; y: number; color: string; at: number };

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];
const TOOLS: { key: AnnotKind; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "pen", label: "Pen", icon: Pencil },
  { key: "arrow", label: "Arrow", icon: ArrowUpRight },
  { key: "circle", label: "Circle", icon: Circle },
  { key: "rect", label: "Box", icon: Square },
  { key: "highlight", label: "Highlight", icon: Highlighter },
  { key: "text", label: "Text", icon: Type },
];

export function useAnnotations() {
  const [strokes, setStrokes] = React.useState<Stroke[]>([]);
  const [pointers, setPointers] = React.useState<Pointer[]>([]);

  /** Feed messages that arrived on the data channel. */
  const ingest = React.useCallback((msg: LiveDataMessage, fromId: string, fromName: string) => {
    if (msg.t === "annot") {
      setStrokes((s) => [...s.filter((x) => x.id !== msg.id), { id: msg.id, kind: msg.kind, pts: msg.pts, color: msg.color, text: msg.text, born: Date.now(), ttl: msg.ttl ?? 12000 }].slice(-120));
    } else if (msg.t === "annot_clear") {
      setStrokes((s) => (msg.id ? s.filter((x) => x.id !== msg.id) : []));
    } else if (msg.t === "pointer") {
      setPointers((p) => {
        const rest = p.filter((x) => x.id !== fromId);
        if (!msg.on) return rest;
        return [...rest, { id: fromId, name: fromName, x: msg.x, y: msg.y, color: COLORS[fromId.charCodeAt(0) % COLORS.length], at: Date.now() }];
      });
    }
  }, []);

  // Expire old strokes and stale pointers.
  React.useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setStrokes((s) => (s.some((x) => now - x.born > x.ttl) ? s.filter((x) => now - x.born <= x.ttl) : s));
      setPointers((p) => (p.some((x) => now - x.at > 4000) ? p.filter((x) => now - x.at <= 4000) : p));
    }, 900);
    return () => clearInterval(t);
  }, []);

  const addLocal = React.useCallback((s: Omit<Stroke, "born" | "ttl">, ttl = 12000) => {
    setStrokes((prev) => [...prev.filter((x) => x.id !== s.id), { ...s, born: Date.now(), ttl }].slice(-120));
  }, []);
  const clearLocal = React.useCallback((id?: string) => setStrokes((s) => (id ? s.filter((x) => x.id !== id) : [])), []);

  return { strokes, pointers, ingest, addLocal, clearLocal };
}

/** Draws the normalised strokes onto a canvas sized to its container. */
function paint(ctx: CanvasRenderingContext2D, w: number, h: number, strokes: Stroke[]) {
  ctx.clearRect(0, 0, w, h);
  for (const s of strokes) {
    const age = Date.now() - s.born;
    ctx.globalAlpha = s.kind === "highlight" ? 0.32 : Math.max(0.15, 1 - age / s.ttl);
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.kind === "highlight" ? 14 : 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const p = s.pts;
    if (s.kind === "text" && s.text) {
      ctx.globalAlpha = 1;
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.fillText(s.text, p[0] * w, p[1] * h);
      continue;
    }
    if (p.length < 4) continue;
    if (s.kind === "pen" || s.kind === "highlight") {
      ctx.beginPath();
      ctx.moveTo(p[0] * w, p[1] * h);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * w, p[i + 1] * h);
      ctx.stroke();
    } else if (s.kind === "rect") {
      ctx.strokeRect(p[0] * w, p[1] * h, (p[2] - p[0]) * w, (p[3] - p[1]) * h);
    } else if (s.kind === "circle") {
      ctx.beginPath();
      ctx.ellipse((p[0] + p[2]) / 2 * w, (p[1] + p[3]) / 2 * h, Math.abs(p[2] - p[0]) / 2 * w, Math.abs(p[3] - p[1]) / 2 * h, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.kind === "arrow") {
      const x0 = p[0] * w, y0 = p[1] * h, x1 = p[2] * w, y1 = p[3] * h;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - 13 * Math.cos(a - 0.4), y1 - 13 * Math.sin(a - 0.4));
      ctx.lineTo(x1 - 13 * Math.cos(a + 0.4), y1 - 13 * Math.sin(a + 0.4));
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function AnnotationLayer({
  strokes,
  pointers,
  active,
  tool,
  color,
  onStroke,
  onPointer,
  className,
}: {
  strokes: Stroke[];
  pointers: Pointer[];
  /** When false the layer is purely decorative and lets clicks through. */
  active: boolean;
  tool: AnnotKind;
  color: string;
  onStroke: (s: { id: string; kind: AnnotKind; pts: number[]; color: string; text?: string }) => void;
  onPointer: (x: number, y: number, on: boolean) => void;
  className?: string;
}) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const draft = React.useRef<number[] | null>(null);
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  // Repaint on every animation-ish tick while strokes exist (they fade out).
  React.useEffect(() => {
    let raf = 0;
    const loop = () => {
      const cv = canvasRef.current;
      const wrap = wrapRef.current;
      if (cv && wrap) {
        const w = wrap.clientWidth, h = wrap.clientHeight;
        if (cv.width !== w || cv.height !== h) {
          cv.width = w;
          cv.height = h;
        }
        const ctx = cv.getContext("2d");
        if (ctx) {
          const live = draft.current ? [...strokes, { id: "__draft", kind: tool, pts: draft.current, color, born: Date.now(), ttl: 20000 } as Stroke] : strokes;
          paint(ctx, w, h, live);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [strokes, tool, color]);

  const norm = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  function down(e: React.PointerEvent) {
    if (!active) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const [x, y] = norm(e);
    if (tool === "text") {
      const text = window.prompt("Note on the screen");
      if (text) onStroke({ id: Math.random().toString(36).slice(2), kind: "text", pts: [x, y], color, text });
      return;
    }
    draft.current = [x, y];
    force();
  }
  function move(e: React.PointerEvent) {
    const [x, y] = norm(e);
    onPointer(x, y, true);
    if (!active || !draft.current) return;
    if (tool === "pen" || tool === "highlight") draft.current = [...draft.current, x, y];
    else draft.current = [draft.current[0], draft.current[1], x, y];
  }
  function up() {
    if (!draft.current) return;
    const pts = draft.current;
    draft.current = null;
    if (pts.length >= 4) onStroke({ id: Math.random().toString(36).slice(2), kind: tool, pts, color });
    force();
  }

  return (
    <div
      ref={wrapRef}
      className={cn("absolute inset-0", active ? "cursor-crosshair touch-none" : "pointer-events-none", className)}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={() => {
        onPointer(0, 0, false);
        up();
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {pointers.map((p) => (
        <span key={p.id} className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
          <span className="w-3 h-3 rounded-full ring-2 ring-white/80" style={{ background: p.color }} />
          <span className="text-[10px] font-medium text-white px-1 rounded bg-black/55 whitespace-nowrap">{p.name}</span>
        </span>
      ))}
    </div>
  );
}

export function AnnotationToolbar({
  tool,
  onTool,
  color,
  onColor,
  on,
  onToggle,
  onClear,
}: {
  tool: AnnotKind;
  onTool: (t: AnnotKind) => void;
  color: string;
  onColor: (c: string) => void;
  on: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap card px-1.5 py-1" style={{ boxShadow: "var(--shadow)" }}>
      <Button size="xs" variant={on ? "primary" : "ghost"} onClick={onToggle} title="Annotate the shared screen">
        <Pencil size={13} /> Annotate
      </Button>
      {on && (
        <>
          <span className="w-px h-5 bg-[var(--line)] mx-0.5" />
          {TOOLS.map((t) => (
            <Button key={t.key} size="xs" icon variant={tool === t.key ? "secondary" : "ghost"} onClick={() => onTool(t.key)} title={t.label} aria-label={t.label}>
              <t.icon size={13} />
            </Button>
          ))}
          <span className="w-px h-5 bg-[var(--line)] mx-0.5" />
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onColor(c)}
              aria-label={`Colour ${c}`}
              className={cn("w-4 h-4 rounded-full border", color === c && "ring-2 ring-offset-1 ring-[var(--brand-2)]")}
              style={{ background: c }}
            />
          ))}
          <Button size="xs" icon variant="ghost" onClick={onClear} title="Clear annotations" aria-label="Clear annotations">
            <Eraser size={13} />
          </Button>
        </>
      )}
    </div>
  );
}

export { COLORS as ANNOT_COLORS };
