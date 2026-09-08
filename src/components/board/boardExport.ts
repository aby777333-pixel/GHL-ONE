"use client";
/**
 * Export a board. PNG comes straight off a detached canvas; PDF is produced by drawing every
 * page into a printable window and calling window.print() (no new dependency, deliberately).
 * Every export is recorded in `board_access_log` with action `exported`.
 */
import { createClient } from "@/lib/supabase/client";
import type { BoardPage } from "@/lib/live/types";
import { renderToCanvas, type Palette } from "./boardDraw";

type Bg = "grid" | "dots" | "plain";

function safe(name: string) {
  return name.replace(/[^\w.\-() ]+/g, "_").trim().slice(0, 80) || "board";
}

export async function logExport(boardId: string, actorId: string, details: Record<string, unknown>) {
  await createClient().from("board_access_log").insert({ board_id: boardId, actor_id: actorId, action: "exported", details: details as never });
}

/** Download the current page as a PNG. */
export function exportPagePng(page: BoardPage, palette: Palette, background: Bg, images: Map<string, CanvasImageSource>, boardTitle: string): boolean {
  if (!page.elements.length) return false;
  const canvas = renderToCanvas(page.elements, palette, background, images, 2);
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe(boardTitle)} — ${safe(page.title)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

/** Open a printable window with one page per sheet — "Save as PDF" in the print dialog. */
export function exportPagesPdf(pages: BoardPage[], palette: Palette, background: Bg, images: Map<string, CanvasImageSource>, boardTitle: string): string | null {
  const usable = pages.filter((p) => p.elements.length);
  if (!usable.length) return "There is nothing on this board to export yet.";
  const win = window.open("", "_blank", "width=1024,height=768");
  if (!win) return "Your browser blocked the print window. Allow pop-ups for GHL ONE and try again.";
  const sheets = usable.map((p) => {
    const canvas = renderToCanvas(p.elements, palette, background === "plain" ? "plain" : background, images, 2);
    return { title: p.title, data: canvas.toDataURL("image/png") };
  });
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(boardTitle)}</title><style>
      @page { size: A4 landscape; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font: 13px ui-sans-serif, system-ui, sans-serif; color: #0b1220; background: #fff; }
      .sheet { page-break-after: always; break-after: page; padding: 8px 0 0; }
      .sheet:last-child { page-break-after: auto; break-after: auto; }
      h2 { font-size: 14px; margin: 0 0 8px; font-weight: 600; }
      img { width: 100%; height: auto; }
      @media print { .hint { display: none; } }
      .hint { padding: 10px 14px; background: #eef0f3; border-radius: 8px; margin-bottom: 12px; }
    </style></head><body>
      <div class="hint">Use your browser's print dialog and choose <b>Save as PDF</b>.</div>
      ${sheets.map((s) => `<section class="sheet"><h2>${esc(boardTitle)} — ${esc(s.title)}</h2><img src="${s.data}" alt="${esc(s.title)}"></section>`).join("")}
    </body></html>`
  );
  win.document.close();
  win.focus();
  setTimeout(() => { try { win.print(); } catch { /* the user can still print manually */ } }, 400);
  return null;
}
