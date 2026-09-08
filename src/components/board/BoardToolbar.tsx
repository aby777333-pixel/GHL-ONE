"use client";
/** Tool strip, style pickers, zoom controls and page tabs for the board editor. */
import * as React from "react";
import {
  ArrowUpRight, Check, ChevronDown, Circle, Diamond, Eraser, FilePlus2, Frame, Hand, Highlighter, Image as ImageIcon,
  Italic, Maximize2, Minus, MessageSquarePlus, MousePointer2, Pencil, Plus, Redo2, Share2, Smile, Square, StickyNote,
  Table as TableIcon, Type, Undo2, X, Zap,
} from "lucide-react";
import { Button, Menu, MenuItem } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FILL_COLORS, STROKE_COLORS, resolve, type Palette } from "./boardDraw";
import { BOARD_ICONS, ICON_NAMES } from "./boardIcons";

export type Tool =
  | "select" | "hand" | "laser" | "pen" | "highlighter" | "sticky" | "text" | "rect" | "ellipse" | "diamond"
  | "arrow" | "line" | "connector" | "image" | "file" | "icon" | "table" | "frame" | "comment";

export type BoardStyle = { color: string; fill: string; strokeWidth: number; fontSize: number; icon: string };

const TOOLS: { key: Tool; label: string; icon: React.ReactNode; hotkey?: string }[] = [
  { key: "select", label: "Select", icon: <MousePointer2 size={16} />, hotkey: "V" },
  { key: "hand", label: "Pan", icon: <Hand size={16} />, hotkey: "H" },
  { key: "pen", label: "Pen", icon: <Pencil size={16} />, hotkey: "P" },
  { key: "highlighter", label: "Highlighter", icon: <Highlighter size={16} /> },
  { key: "sticky", label: "Sticky note", icon: <StickyNote size={16} />, hotkey: "S" },
  { key: "text", label: "Text", icon: <Type size={16} />, hotkey: "T" },
  { key: "rect", label: "Rectangle", icon: <Square size={16} />, hotkey: "R" },
  { key: "ellipse", label: "Ellipse", icon: <Circle size={16} />, hotkey: "O" },
  { key: "diamond", label: "Diamond", icon: <Diamond size={16} /> },
  { key: "arrow", label: "Arrow", icon: <ArrowUpRight size={16} />, hotkey: "A" },
  { key: "line", label: "Line", icon: <Minus size={16} /> },
  { key: "connector", label: "Connector", icon: <Share2 size={16} />, hotkey: "C" },
  { key: "frame", label: "Frame", icon: <Frame size={16} />, hotkey: "F" },
  { key: "table", label: "Table", icon: <TableIcon size={16} /> },
  { key: "icon", label: "Icon", icon: <Smile size={16} /> },
  { key: "image", label: "Image", icon: <ImageIcon size={16} /> },
  { key: "file", label: "File", icon: <FilePlus2 size={16} /> },
  { key: "comment", label: "Comment pin", icon: <MessageSquarePlus size={16} /> },
  { key: "laser", label: "Laser pointer", icon: <Zap size={16} /> },
];

function Swatch({ token, palette, active, onClick, label }: { token: string; palette: Palette; active?: boolean; onClick: () => void; label?: string }) {
  const c = resolve(palette, token, "fg");
  return (
    <button
      type="button"
      onClick={onClick}
      title={label || token}
      aria-label={label || token}
      className={cn("w-6 h-6 rounded-full border flex items-center justify-center shrink-0", active ? "ring-2 ring-[var(--brand)]" : "")}
      style={{ background: c === "transparent" ? "var(--bg-elev)" : c, borderColor: "var(--line-strong)" }}
    >
      {c === "transparent" && <X size={12} className="text-muted" />}
      {active && c !== "transparent" && <Check size={12} color="#fff" />}
    </button>
  );
}

export function BoardToolbar({
  tool, setTool, style, setStyle, palette, disabled, onUndo, onRedo, canUndo, canRedo, hasSelection, embedded,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  style: BoardStyle;
  setStyle: (s: Partial<BoardStyle>) => void;
  palette: Palette;
  disabled?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  embedded?: boolean;
}) {
  const showStyle = hasSelection || !["select", "hand", "laser", "image", "file"].includes(tool);
  return (
    <div
      className={cn(
        "absolute left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-16px)] flex flex-col items-center gap-2",
        // on phones the page tabs and zoom controls sit on the bottom row, so lift the tools above them
        embedded ? "bottom-3" : "bottom-[58px] sm:bottom-3"
      )}
    >
      {showStyle && (
        <div className="card flex items-center gap-2 px-2 py-1.5 overflow-x-auto no-scrollbar" style={{ boxShadow: "var(--shadow)" }}>
          <div className="flex items-center gap-1">
            {STROKE_COLORS.map((c) => (
              <Swatch key={c} token={c} palette={palette} active={style.color === c} onClick={() => setStyle({ color: c })} />
            ))}
          </div>
          <span className="w-px h-5 bg-[var(--line)] shrink-0" />
          <div className="flex items-center gap-1">
            {FILL_COLORS.map((c) => (
              <Swatch key={c} token={c} palette={palette} active={style.fill === c} onClick={() => setStyle({ fill: c })} label={c === "none" ? "No fill" : c} />
            ))}
          </div>
          <span className="w-px h-5 bg-[var(--line)] shrink-0" />
          <Menu
            width={150}
            trigger={<Button size="sm" variant="ghost" className="shrink-0"><Minus size={14} /> {style.strokeWidth}px <ChevronDown size={12} /></Button>}
          >
            {[1, 2, 4, 6, 10, 16].map((w) => (
              <MenuItem key={w} onClick={() => setStyle({ strokeWidth: w })}>{w} px</MenuItem>
            ))}
          </Menu>
          <Menu
            width={150}
            trigger={<Button size="sm" variant="ghost" className="shrink-0"><Italic size={13} /> {style.fontSize} <ChevronDown size={12} /></Button>}
          >
            {[11, 13, 15, 18, 24, 32, 48].map((s) => (
              <MenuItem key={s} onClick={() => setStyle({ fontSize: s })}>{s} px</MenuItem>
            ))}
          </Menu>
          {tool === "icon" && (
            <Menu width={230} trigger={<Button size="sm" variant="ghost" className="shrink-0">{style.icon} <ChevronDown size={12} /></Button>}>
              <div className="grid grid-cols-6 gap-1 p-1 max-h-56 overflow-y-auto">
                {ICON_NAMES.map((n) => {
                  const I = BOARD_ICONS[n];
                  return (
                    <button key={n} type="button" title={n} onClick={() => setStyle({ icon: n })} className={cn("h-8 rounded-[var(--radius-sm)] flex items-center justify-center hover:bg-[var(--neutral-bg)]", style.icon === n && "bg-[var(--neutral-bg)]")}>
                      <I size={15} />
                    </button>
                  );
                })}
              </div>
            </Menu>
          )}
        </div>
      )}

      <div className="card flex items-center gap-0.5 px-1.5 py-1.5 overflow-x-auto no-scrollbar max-w-full" style={{ boxShadow: "var(--shadow)" }}>
        {TOOLS.map((t) => (
          <button
            key={t.key}
            type="button"
            title={t.hotkey ? `${t.label} (${t.hotkey})` : t.label}
            aria-label={t.label}
            aria-pressed={tool === t.key}
            disabled={disabled && t.key !== "select" && t.key !== "hand" && t.key !== "laser"}
            onClick={() => setTool(t.key)}
            className={cn(
              "w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 transition-colors disabled:opacity-40",
              tool === t.key ? "bg-[var(--brand)] text-[var(--brand-fg)]" : "text-2 hover:bg-[var(--neutral-bg)]"
            )}
          >
            {t.icon}
          </button>
        ))}
        <span className="w-px h-6 bg-[var(--line)] mx-1 shrink-0" />
        <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={onUndo} className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 text-2 hover:bg-[var(--neutral-bg)] disabled:opacity-40">
          <Undo2 size={16} />
        </button>
        <button type="button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={onRedo} className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 text-2 hover:bg-[var(--neutral-bg)] disabled:opacity-40">
          <Redo2 size={16} />
        </button>
      </div>
    </div>
  );
}

export function ZoomControls({ zoom, onZoom, onFit, onReset }: { zoom: number; onZoom: (dir: 1 | -1) => void; onFit: () => void; onReset: () => void }) {
  return (
    <div className="absolute right-3 bottom-3 z-20 card flex items-center gap-0.5 px-1 py-1" style={{ boxShadow: "var(--shadow)" }}>
      <Button size="sm" variant="ghost" icon onClick={() => onZoom(-1)} aria-label="Zoom out"><Minus size={15} /></Button>
      <button type="button" onClick={onReset} title="Zoom to 100%" className="px-2 h-7 text-xs num text-2 rounded-[var(--radius-sm)] hover:bg-[var(--neutral-bg)] min-w-[52px]">
        {Math.round(zoom * 100)}%
      </button>
      <Button size="sm" variant="ghost" icon onClick={() => onZoom(1)} aria-label="Zoom in"><Plus size={15} /></Button>
      <Button size="sm" variant="ghost" icon onClick={onFit} aria-label="Fit to content" title="Fit to content"><Maximize2 size={14} /></Button>
    </div>
  );
}

export function PageTabs({
  pages, pageId, onSelect, onAdd, onRename, onDelete, onMove, disabled,
}: {
  pages: { id: string; title: string }[];
  pageId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  disabled?: boolean;
}) {
  return (
    <div className="absolute left-3 bottom-3 z-20 card flex items-center gap-1 px-1 py-1 max-w-[min(60vw,520px)] overflow-x-auto no-scrollbar" style={{ boxShadow: "var(--shadow)" }}>
      {pages.map((p, i) => (
        <div key={p.id} className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => onSelect(p.id)}
            onDoubleClick={() => {
              if (disabled) return;
              const t = window.prompt("Page name", p.title);
              if (t && t.trim()) onRename(p.id, t.trim());
            }}
            className={cn("h-7 px-2.5 rounded-[var(--radius-sm)] text-xs whitespace-nowrap", p.id === pageId ? "bg-[var(--brand)] text-[var(--brand-fg)] font-medium" : "text-2 hover:bg-[var(--neutral-bg)]")}
          >
            {p.title}
          </button>
          {p.id === pageId && !disabled && (
            <Menu width={190} trigger={<button type="button" aria-label="Page actions" className="w-6 h-7 flex items-center justify-center text-muted hover:text-[var(--fg)]"><ChevronDown size={12} /></button>}>
              <MenuItem icon={<Type size={13} />} onClick={() => { const t = window.prompt("Page name", p.title); if (t && t.trim()) onRename(p.id, t.trim()); }}>Rename</MenuItem>
              <MenuItem icon={<Undo2 size={13} />} onClick={() => onMove(p.id, -1)}>Move left</MenuItem>
              <MenuItem icon={<Redo2 size={13} />} onClick={() => onMove(p.id, 1)}>Move right</MenuItem>
              <MenuItem icon={<Eraser size={13} />} danger onClick={() => { if (pages.length > 1 && window.confirm(`Delete “${p.title}”?`)) onDelete(p.id); }}>Delete page</MenuItem>
            </Menu>
          )}
          {i < pages.length - 1 && <span className="w-px h-4 bg-[var(--line)] mx-0.5" />}
        </div>
      ))}
      {!disabled && (
        <Button size="sm" variant="ghost" icon onClick={onAdd} aria-label="Add page" title="Add page"><Plus size={14} /></Button>
      )}
    </div>
  );
}
