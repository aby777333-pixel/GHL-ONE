"use client";
/**
 * GHL BOARD — the infinite-canvas editor.
 *
 * One raw <canvas> (scaled by devicePixelRatio) does all the painting; an HTML layer on top
 * carries cursors, the inline text editor, task badges and the selection actions.
 * Every edit is a `BoardOp` that is applied locally, broadcast on `board:<id>` and folded into
 * a debounced save of `boards.doc`.
 */
import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft, Download, FileDown, FolderKanban, Grid3x3, History, Image as ImageIcon, Lock, MessageSquare,
  MoreHorizontal, Presentation, Share2, Sparkles, Users,
} from "lucide-react";
import { Avatar, Button, Menu, MenuItem, Spinner, avatarColor, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { cn, isManagerPlus } from "@/lib/utils";
import type { BoardElement, BoardOp, BoardPage } from "@/lib/live/types";
import { MAX_ZOOM, MIN_ZOOM, centerOn, drawBoard, elementBounds, fitView, hitTest, readPalette, toWorld, zoomAt, type Rect, type View } from "./boardDraw";
import { asDoc, useBoardDoc, type BoardRow } from "./useBoardDoc";
import { BoardToolbar, PageTabs, ZoomControls, type BoardStyle, type Tool } from "./BoardToolbar";
import { useBoardInput } from "./useBoardInput";
import { InlineTextEditor, LiveCursors, SelectionActions, TaskBadges, type OverlayAction } from "./BoardElementLayer";
import { BoardCommentsPanel, useBoardComments } from "./BoardComments";
import { BoardVersions } from "./BoardVersions";
import { BoardShare } from "./BoardShare";
import { BoardAI } from "./BoardAI";
import { BoardTimerBar, PresentBar } from "./BoardPresent";
import { BoardToProjectModal, ElementTaskModal } from "./BoardToProject";
import { useIconImages } from "./boardIcons";
import { loadBoardImage, uploadBoardAsset } from "./boardAssets";
import { exportPagePng, exportPagesPdf, logExport } from "./boardExport";
import { uid } from "./BoardTemplates";

export function BoardCanvas({ boardId, embedded, roomId, initialBoard }: { boardId: string; embedded?: boolean; roomId?: string; initialBoard?: BoardRow | null }) {
  const { profile } = useSession();
  const toast = useToast();
  const me = React.useMemo(() => ({ id: profile.id, name: (profile.full_name || "Someone").split(" ")[0], color: avatarColor(profile.full_name) }), [profile.id, profile.full_name]);
  const api = useBoardDoc(boardId, initialBoard ?? null, me);
  const { board, doc, page, elements, pageId, setPageId, send, replaceDoc, undo, redo, canUndo, canRedo, cursors, peers, saving, sendCursor, sendFollow } = api;
  const { counts, comments, reload: reloadComments } = useBoardComments(boardId);

  const wrapRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const images = React.useRef(new Map<string, CanvasImageSource>());
  const fileInput = React.useRef<HTMLInputElement>(null);

  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [palette, setPalette] = React.useState(() => readPalette());
  const [view, setView] = React.useState<View>({ x: -200, y: -160, zoom: 1 });
  const [tool, setTool] = React.useState<Tool>("select");
  const [style, setStyleState] = React.useState<BoardStyle>({ color: "fg", fill: "warn-bg", strokeWidth: 2, fontSize: 15, icon: "Lightbulb" });
  const [selection, setSelection] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<{ id: string; value: string } | null>(null);
  const [marquee, setMarquee] = React.useState<Rect | null>(null);
  const [panel, setPanel] = React.useState<null | "comments" | "versions" | "share" | "ai" | "project">(null);
  const [focusComment, setFocusComment] = React.useState<string | null>(null);
  const [taskEl, setTaskEl] = React.useState<BoardElement | null>(null);
  const [present, setPresent] = React.useState<{ on: boolean; index: number; following: boolean; presenter: boolean }>({ on: false, index: 0, following: true, presenter: false });
  const [ctx, setCtx] = React.useState<{ x: number; y: number; id: string } | null>(null);
  const [tick, setTick] = React.useState(0);
  const [spaceDown, setSpaceDown] = React.useState(false);
  const [fileKind, setFileKind] = React.useState<"image" | "file">("image");
  const [followOffer, setFollowOffer] = React.useState<string | null>(null);

  const locked = !!board?.locked && board.owner_id !== profile.id && !isManagerPlus(profile.role);
  const canEdit = !locked;
  const byId = React.useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);
  const selected = React.useMemo(() => elements.filter((e) => selection.includes(e.id)), [elements, selection]);
  const repaint = React.useCallback(() => setTick((t) => t + 1), []);

  /* ------------------------------------------------------------ chrome sync */
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const refresh = () => setPalette(readPalette());
    const mo = new MutationObserver(refresh);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", refresh);
    return () => { mo.disconnect(); mq.removeEventListener("change", refresh); };
  }, []);

  /* --------------------------------------------------------------- assets */
  React.useEffect(() => {
    let alive = true;
    for (const el of elements) {
      if (el.type !== "image" || !el.src || images.current.has(el.src)) continue;
      const path = el.src;
      images.current.set(path, null as unknown as CanvasImageSource); // reserve
      void loadBoardImage(path).then((img) => {
        if (!alive) return;
        if (img) images.current.set(path, img);
        else images.current.delete(path);
        repaint();
      });
    }
    return () => { alive = false; };
  }, [elements, repaint]);

  const iconEls = React.useMemo(() => elements.filter((e) => e.type === "icon").map((e) => ({ icon: e.icon, color: e.color })), [elements]);
  const { node: iconNode } = useIconImages(iconEls, palette, images, repaint);

  /* ----------------------------------------------------------------- paint */
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(size.w * dpr) || canvas.height !== Math.round(size.h * dpr)) {
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
    }
    const c = canvas.getContext("2d");
    if (!c) return;
    const raf = requestAnimationFrame(() => {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBoard({
        ctx: c, width: size.w, height: size.h, view, palette, elements,
        background: doc.background || "dots",
        selected: new Set(present.on ? [] : selection),
        images: images.current,
        hidden: editing ? new Set([editing.id]) : undefined,
        marquee,
        commentCounts: counts,
        showChrome: !present.on,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [size, view, palette, elements, doc.background, selection, editing, marquee, counts, present.on, tick]);

  /* ----------------------------------------------------------- view helpers */
  const zoomBy = React.useCallback((dir: 1 | -1) => {
    setView((v) => zoomAt(v, size.w / 2, size.h / 2, v.zoom * (dir > 0 ? 1.2 : 1 / 1.2)));
  }, [size]);
  const fit = React.useCallback(() => {
    if (!size.w) return;
    setView(elements.length ? fitView(elements, size.w, size.h, byId) : { x: -size.w / 2, y: -size.h / 2, zoom: 1 });
  }, [elements, size, byId]);
  const reset = React.useCallback(() => setView((v) => zoomAt(v, size.w / 2, size.h / 2, 1)), [size]);

  const fitted = React.useRef(false);
  React.useEffect(() => {
    if (fitted.current || !size.w || !elements.length) return;
    fitted.current = true;
    const id = requestAnimationFrame(() => setView(fitView(elements, size.w, size.h, byId)));
    return () => cancelAnimationFrame(id);
  }, [size.w, size.h, elements, byId]);

  // non-passive wheel so ctrl+wheel zoom does not scroll the page
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (e.ctrlKey || e.metaKey) setView((v) => zoomAt(v, sx, sy, v.zoom * Math.exp(-e.deltaY / 300)));
      else setView((v) => ({ ...v, x: v.x + e.deltaX / v.zoom, y: v.y + e.deltaY / v.zoom }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* -------------------------------------------------------------- mutations */
  const nextZ = React.useCallback((delta = 1) => (elements.length ? Math.max(...elements.map((e) => e.z ?? 0)) + delta : delta), [elements]);
  const patch = React.useCallback((id: string, p: Partial<BoardElement>, opts?: { record?: boolean; broadcast?: boolean }) => {
    send({ op: "update", pageId, id, patch: p }, opts);
  }, [send, pageId]);

  const setStyle = React.useCallback((s: Partial<BoardStyle>) => {
    setStyleState((cur) => ({ ...cur, ...s }));
    if (!selection.length || !canEdit) return;
    const p: Partial<BoardElement> = {};
    if (s.color) p.color = s.color;
    if (s.fill) p.fill = s.fill;
    if (s.strokeWidth) p.strokeWidth = s.strokeWidth;
    if (s.fontSize) p.fontSize = s.fontSize;
    if (s.icon) p.icon = s.icon;
    if (!Object.keys(p).length) return;
    send(selection.map((id) => ({ op: "update", pageId, id, patch: p } as BoardOp)));
  }, [selection, canEdit, send, pageId]);

  const startEditing = React.useCallback((el: BoardElement) => {
    const value = el.type === "frame" ? el.title || "" : el.type === "table" ? (el.rows || []).map((r) => r.join(" | ")).join("\n") : el.text || "";
    setEditing({ id: el.id, value });
  }, []);

  const commitEditing = React.useCallback(() => {
    if (!editing) return;
    const el = byId.get(editing.id);
    setEditing(null);
    if (!el) return;
    if (el.type === "frame") patch(el.id, { title: editing.value.slice(0, 120) });
    else if (el.type === "table") patch(el.id, { rows: editing.value.split("\n").map((r) => r.split("|").map((c) => c.trim())) });
    else patch(el.id, { text: editing.value });
  }, [editing, byId, patch]);

  const removeSelected = React.useCallback(() => {
    if (!selection.length || !canEdit) return;
    send({ op: "remove", pageId, ids: selection });
    setSelection([]);
  }, [selection, canEdit, send, pageId]);

  const duplicateSelected = React.useCallback(() => {
    if (!selection.length || !canEdit) return;
    const map = new Map<string, string>();
    const copies = selected.map((e) => { const id = uid(); map.set(e.id, id); return { ...e, id, x: e.x + 24, y: e.y + 24, z: nextZ(), taskId: null, votes: [] }; });
    for (const c of copies) {
      if (c.type === "connector") { c.from = c.from ? map.get(c.from) || c.from : c.from; c.to = c.to ? map.get(c.to) || c.to : c.to; }
    }
    send(copies.map((el) => ({ op: "add", pageId, el } as BoardOp)));
    setSelection(copies.map((c) => c.id));
  }, [selection, selected, canEdit, send, pageId, nextZ]);

  const overlayAction = React.useCallback((a: OverlayAction) => {
    if (a === "comment") { setFocusComment(selection[0] || null); setPanel("comments"); return; }
    if (!canEdit) return;
    if (a === "delete") return removeSelected();
    if (a === "duplicate") return duplicateSelected();
    if (a === "task") { setTaskEl(selected[0] || null); return; }
    if (a === "vote") {
      send(selected.map((e) => {
        const votes = e.votes || [];
        return { op: "update", pageId, id: e.id, patch: { votes: votes.includes(profile.id) ? votes.filter((v) => v !== profile.id) : [...votes, profile.id] } } as BoardOp;
      }));
      return;
    }
    if (a === "lock") {
      const lock = !selected.every((e) => e.locked);
      send(selection.map((id) => ({ op: "update", pageId, id, patch: { locked: lock } } as BoardOp)));
      return;
    }
    if (a === "forward") return send({ op: "reorder", pageId, ids: selection, z: nextZ() });
    if (a === "back") return send({ op: "reorder", pageId, ids: selection, z: Math.min(0, ...elements.map((e) => e.z ?? 0)) - 1 });
  }, [canEdit, selection, selected, removeSelected, duplicateSelected, send, pageId, profile.id, nextZ, elements]);

  /* ------------------------------------------------------- pointer + keys */
  const { onPointerDown, onPointerMove, onPointerUp, onDoubleClick } = useBoardInput({
    wrapRef,
    fileInputRef: fileInput,
    elements, byId, selection, selected, setSelection, canEdit, pageId, send, patch, nextZ,
    view, setView, tool, setTool, style,
    author: { id: profile.id, name: profile.full_name },
    spaceDown, setSpaceDown,
    editing: !!editing, commitEditing, startEditing,
    marquee, setMarquee,
    presenting: present.on,
    stepSlide: React.useCallback((d: 1 | -1) => setPresent((p) => ({ ...p, index: Math.max(0, p.index + d) })), []),
    exitPresent: React.useCallback(() => setPresent((p) => (p.on ? { ...p, on: false } : p)), []),
    sendCursor, setFileKind,
    openComments: React.useCallback((elementId: string | null) => { setFocusComment(elementId); setPanel("comments"); }, []),
    closeContextMenu: React.useCallback(() => setCtx(null), []),
    undo, redo, duplicateSelected, removeSelected, overlayAction,
  });

  /* ------------------------------------------------------------ paste/drop */
  const addAsset = React.useCallback(async (file: File, at: { x: number; y: number }, kind: "image" | "file") => {
    if (!profile.org_id || !canEdit) return;
    const res = await uploadBoardAsset(profile.org_id, boardId, file);
    if ("error" in res) return toast.push(res.error, "danger");
    const isImage = kind === "image" && res.type.startsWith("image/");
    const el: BoardElement = isImage
      ? { id: uid(), type: "image", x: at.x, y: at.y, w: 320, h: 220, src: res.path, name: file.name, z: nextZ() }
      : { id: uid(), type: "file", x: at.x, y: at.y, w: 250, h: 76, src: res.path, name: file.name, z: nextZ() };
    send({ op: "add", pageId, el });
    setSelection([el.id]);
  }, [profile.org_id, canEdit, boardId, toast, nextZ, send, pageId]);

  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = [...(e.clipboardData?.items || [])];
      const img = items.find((i) => i.type.startsWith("image/"));
      if (!img) return;
      const file = img.getAsFile();
      if (!file) return;
      e.preventDefault();
      void addAsset(file, toWorld(view, size.w / 2 - 160, size.h / 2 - 110), "image");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addAsset, view, size]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const r = wrapRef.current!.getBoundingClientRect();
    const w = toWorld(view, e.clientX - r.left, e.clientY - r.top);
    let i = 0;
    for (const f of [...(e.dataTransfer?.files || [])]) {
      void addAsset(f, { x: w.x + i * 24, y: w.y + i * 24 }, f.type.startsWith("image/") ? "image" : "file");
      i++;
    }
  };

  /* ----------------------------------------------------------- presentation */
  const frames = React.useMemo(
    () => elements.filter((e) => e.type === "frame").sort((a, b) => a.y - b.y || a.x - b.x),
    [elements]
  );
  React.useEffect(() => {
    if (!present.on || !size.w) return;
    const f = frames[Math.min(present.index, frames.length - 1)];
    if (!f) return;
    const b = elementBounds(f);
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((size.w - 48) / b.w, (size.h - 48) / b.h)));
    const v = centerOn(b, size.w, size.h, zoom);
    const raf = requestAnimationFrame(() => {
      setView(v);
      if (present.presenter) sendFollow(v);
    });
    return () => cancelAnimationFrame(raf);
  }, [present.on, present.index, present.presenter, frames, size, sendFollow]);

  const remoteFollow = api.follow;
  React.useEffect(() => {
    if (!remoteFollow || remoteFollow.userId === profile.id) return;
    const who = peers.find((p) => p.userId === remoteFollow.userId)?.name || "Someone";
    const raf = requestAnimationFrame(() => {
      if (present.following || present.on) {
        setPageId(remoteFollow.pageId);
        setView(remoteFollow.view);
        setFollowOffer(null);
      } else {
        setFollowOffer(who);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [remoteFollow, present.following, present.on, profile.id, peers, setPageId]);

  /* --------------------------------------------------------------- exports */
  const doExport = async (kind: "png" | "pdf") => {
    const p: BoardPage = page || { id: pageId, title: "Page", elements: [] };
    if (kind === "png") {
      if (!exportPagePng(p, palette, doc.background || "dots", images.current, board?.title || "Board")) return toast.push("Nothing to export yet", "info");
    } else {
      const err = exportPagesPdf(doc.pages, palette, doc.background || "dots", images.current, board?.title || "Board");
      if (err) return toast.push(err, "danger");
    }
    await logExport(boardId, profile.id, { kind, page: p.title, pages: kind === "pdf" ? doc.pages.length : 1 });
  };

  /* ----------------------------------------------------------------- pages */
  const addPage = () => {
    const p: BoardPage = { id: uid(), title: `Page ${doc.pages.length + 1}`, elements: [] };
    send({ op: "page_add", page: p });
    setPageId(p.id);
  };
  const movePage = (id: string, dir: -1 | 1) => {
    const i = doc.pages.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= doc.pages.length) return;
    const pages = [...doc.pages];
    [pages[i], pages[j]] = [pages[j], pages[i]];
    replaceDoc({ ...doc, pages });
  };

  const addStickyColumn = (titles: string[], heading: string) => {
    if (!titles.length) return;
    const origin = toWorld(view, 40, 80);
    const f: BoardElement = { id: uid(), type: "frame", x: origin.x, y: origin.y, w: 260, h: 80 + titles.length * 140, title: heading, z: -900, color: "line-strong", fill: "none" };
    const notes = titles.map((t, i) => ({ id: uid(), type: "sticky" as const, x: origin.x + 45, y: origin.y + 50 + i * 140, w: 170, h: 120, text: t, fill: "info-bg", fontSize: 14, z: nextZ() + i }));
    send([{ op: "add", pageId, el: f }, ...notes.map((el) => ({ op: "add", pageId, el } as BoardOp))]);
  };

  if (!board) return <div className="w-full h-full flex items-center justify-center p-10"><Spinner /></div>;

  const height = embedded ? "100%" : undefined;

  return (
    <div
      className={cn("relative w-full overflow-hidden select-none", !embedded && "h-[calc(100dvh-var(--topbar-h)-56px)] lg:h-[calc(100dvh-var(--topbar-h))]")}
      style={{ height, background: "var(--bg)" }}
      ref={wrapRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!canEdit || present.on) return;
        const r = wrapRef.current!.getBoundingClientRect();
        const w = toWorld(view, e.clientX - r.left, e.clientY - r.top);
        const hit = hitTest(elements, w.x, w.y, 6 / view.zoom, byId);
        if (!hit) return setCtx(null);
        setSelection([hit.id]);
        setCtx({ x: e.clientX - r.left, y: e.clientY - r.top, id: hit.id });
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", touchAction: "none", cursor: tool === "hand" || spaceDown ? "grab" : tool === "select" ? "default" : "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      />

      {iconNode}
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        accept={fileKind === "image" ? "image/*" : undefined}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void addAsset(f, toWorld(view, size.w / 2 - 140, size.h / 2 - 100), fileKind);
        }}
      />

      {/* top bar */}
      <div className={cn("absolute top-3 z-20 flex items-center gap-1.5 max-w-[calc(100%-24px)]", embedded ? "right-3" : "left-3 right-3")}>
        {!embedded && (
          <div className="card flex items-center gap-2 px-2.5 h-9 min-w-0" style={{ boxShadow: "var(--shadow)" }}>
            <Link href="/boards" className="text-muted hover:text-[var(--fg)]" aria-label="All boards"><ArrowLeft size={15} /></Link>
            <span className="text-sm font-medium truncate max-w-[30vw]">{board.title}</span>
            {board.locked && <span className="pill tone-warn"><Lock size={10} /> Locked</span>}
            {roomId && <span className="pill tone-violet">In a room</span>}
            <span className="text-[11px] text-muted whitespace-nowrap">{saving ? "Saving…" : "Saved"}</span>
          </div>
        )}
        <div className="flex-1" />
        <div className="card flex items-center gap-0.5 px-1.5 h-9" style={{ boxShadow: "var(--shadow)" }}>
          {peers.length > 1 && (
            <span className="flex items-center pr-1" title={`${peers.length} people here`}>
              {peers.slice(0, 4).map((p, i) => (
                <span key={p.userId + i} style={{ marginLeft: i ? -7 : 0 }}><Avatar name={p.name} size={22} /></span>
              ))}
              {peers.length > 4 && <span className="pill tone-neutral ml-1"><Users size={10} /> {peers.length}</span>}
            </span>
          )}
          <BoardTimerBar timer={api.timer} setTimer={api.setTimer} canEdit={canEdit} />
          <span className="relative inline-flex">
            <Button size="sm" variant="ghost" icon title="Comments" aria-label="Comments" onClick={() => { setFocusComment(null); setPanel("comments"); }}>
              <MessageSquare size={16} />
            </Button>
            {comments.some((c) => !c.resolved) && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--danger)] pointer-events-none" />}
          </span>
          <Button size="sm" variant="ghost" icon title="Ask AI" aria-label="Ask AI" onClick={() => setPanel("ai")}><Sparkles size={16} /></Button>
          <Button size="sm" variant="ghost" icon title="Present" aria-label="Present" onClick={() => setPresent({ on: true, index: 0, following: false, presenter: true })}><Presentation size={16} /></Button>
          <Menu width={230} trigger={<Button size="sm" variant="ghost" icon aria-label="More"><MoreHorizontal size={16} /></Button>}>
            <MenuItem icon={<Share2 size={13} />} onClick={() => setPanel("share")}>Share &amp; access</MenuItem>
            <MenuItem icon={<History size={13} />} onClick={() => setPanel("versions")}>Versions &amp; snapshots</MenuItem>
            <MenuItem icon={<FolderKanban size={13} />} onClick={() => setPanel("project")}>Turn into a project</MenuItem>
            <MenuItem
              icon={<Grid3x3 size={13} />}
              onClick={() => {
                const order = ["dots", "grid", "plain"] as const;
                const next = order[(order.indexOf((doc.background || "dots") as "dots") + 1) % order.length];
                replaceDoc({ ...doc, background: next });
              }}
            >
              Background: {doc.background || "dots"}
            </MenuItem>
            <MenuItem icon={<ImageIcon size={13} />} onClick={() => void doExport("png")}>Export page as PNG</MenuItem>
            <MenuItem icon={<FileDown size={13} />} onClick={() => void doExport("pdf")}>Export all pages as PDF</MenuItem>
            <MenuItem icon={<Download size={13} />} onClick={() => { sendFollow(view); toast.push("Everyone was asked to follow you", "success"); }}>Bring everyone to my view</MenuItem>
            <MenuItem icon={<Lock size={13} />} onClick={() => void api.setLocked(!board.locked)}>{board.locked ? "Unlock the board" : "Lock the board"}</MenuItem>
          </Menu>
        </div>
      </div>

      {followOffer && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 card px-3 py-2 flex items-center gap-2 anim-pop" style={{ boxShadow: "var(--shadow-lg)" }}>
          <span className="text-sm">{followOffer} wants everyone to look here.</span>
          <Button size="sm" variant="primary" onClick={() => { if (remoteFollow) { setPageId(remoteFollow.pageId); setView(remoteFollow.view); } setFollowOffer(null); }}>Jump</Button>
          <Button size="sm" variant="ghost" onClick={() => setFollowOffer(null)}>Dismiss</Button>
        </div>
      )}

      <LiveCursors cursors={cursors} view={view} pageId={pageId} meId={profile.id} />
      <TaskBadges elements={elements} view={view} />
      {editing && byId.get(editing.id) && (
        <InlineTextEditor
          el={byId.get(editing.id)!}
          view={view}
          palette={palette}
          value={editing.value}
          onChange={(v) => setEditing({ id: editing.id, value: v })}
          onCommit={commitEditing}
          onCancel={() => setEditing(null)}
        />
      )}
      {!present.on && !editing && selected.length > 0 && (
        <SelectionActions
          selection={selected}
          view={view}
          canEdit={canEdit}
          votes={selected.reduce((n, e) => n + (e.votes?.length || 0), 0)}
          onAction={overlayAction}
        />
      )}

      {ctx && (
        <div className="absolute z-40 card p-1 anim-pop" style={{ left: ctx.x, top: ctx.y, width: 200, boxShadow: "var(--shadow-lg)" }} onPointerDown={(e) => e.stopPropagation()} onMouseLeave={() => setCtx(null)}>
          <MenuItem onClick={() => { setTaskEl(byId.get(ctx.id) || null); setCtx(null); }}>Create task</MenuItem>
          <MenuItem onClick={() => { setFocusComment(ctx.id); setPanel("comments"); setCtx(null); }}>Comment</MenuItem>
          <MenuItem onClick={() => { overlayAction("duplicate"); setCtx(null); }}>Duplicate</MenuItem>
          <MenuItem onClick={() => { overlayAction("forward"); setCtx(null); }}>Bring forward</MenuItem>
          <MenuItem onClick={() => { overlayAction("back"); setCtx(null); }}>Send back</MenuItem>
          <MenuItem onClick={() => { overlayAction("lock"); setCtx(null); }}>Lock / unlock</MenuItem>
          <MenuItem danger onClick={() => { overlayAction("delete"); setCtx(null); }}>Delete</MenuItem>
        </div>
      )}

      {present.on ? (
        <PresentBar
          frames={frames}
          index={Math.min(present.index, Math.max(0, frames.length - 1))}
          onIndex={(i) => setPresent((p) => ({ ...p, index: Math.max(0, Math.min(i, frames.length - 1)) }))}
          onExit={() => setPresent({ on: false, index: 0, following: false, presenter: false })}
          following={present.following}
          onFollowing={(v) => setPresent((p) => ({ ...p, following: v }))}
          isPresenter={present.presenter}
          onBringEveryone={() => { sendFollow(view); toast.push("Everyone was asked to follow you", "success"); }}
        />
      ) : (
        <>
          <BoardToolbar
            tool={tool}
            setTool={setTool}
            style={style}
            setStyle={setStyle}
            palette={palette}
            disabled={!canEdit}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            hasSelection={selected.length > 0}
            embedded={embedded}
          />
          <PageTabs
            pages={doc.pages.map((p) => ({ id: p.id, title: p.title }))}
            pageId={pageId}
            onSelect={setPageId}
            onAdd={addPage}
            onRename={(id, title) => send({ op: "page_rename", pageId: id, title })}
            onDelete={(id) => { send({ op: "page_remove", pageId: id }); if (id === pageId) setPageId(doc.pages.find((p) => p.id !== id)!.id); }}
            onMove={movePage}
            disabled={!canEdit}
          />
          <ZoomControls zoom={view.zoom} onZoom={zoomBy} onFit={fit} onReset={reset} />
        </>
      )}

      {api.error && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 pill tone-warn">{api.error}</div>
      )}

      <BoardCommentsPanel
        open={panel === "comments"}
        onClose={() => setPanel(null)}
        boardId={boardId}
        comments={comments}
        elements={elements}
        focusElementId={focusComment}
        onFocusElement={setFocusComment}
        onChanged={reloadComments}
      />
      <BoardVersions
        open={panel === "versions"}
        onClose={() => setPanel(null)}
        boardId={boardId}
        canEdit={canEdit}
        onRestored={() => {
          void createClient().from("boards").select("doc").eq("id", boardId).maybeSingle().then(({ data }) => {
            if (data) replaceDoc(asDoc(data.doc), false);
          });
        }}
      />
      <BoardShare open={panel === "share"} onClose={() => setPanel(null)} board={board} onChange={(p) => api.setBoard((b) => (b ? { ...b, ...p } : b))} />
      <BoardAI
        open={panel === "ai"}
        onClose={() => setPanel(null)}
        boardId={boardId}
        elements={elements}
        origin={toWorld(view, 60, 100)}
        onApply={(add, update) => {
          send([
            ...add.map((el) => ({ op: "add", pageId, el } as BoardOp)),
            ...update.map((u) => ({ op: "update", pageId, id: u.id, patch: u.patch } as BoardOp)),
          ]);
          setPanel(null);
        }}
        onAddStickies={(titles, heading) => { addStickyColumn(titles, heading); setPanel(null); }}
      />
      <BoardToProjectModal open={panel === "project"} onClose={() => setPanel(null)} boardId={boardId} boardTitle={board.title} pages={doc.pages} pageId={pageId} />
      <ElementTaskModal
        open={!!taskEl}
        onClose={() => setTaskEl(null)}
        boardId={boardId}
        element={taskEl}
        onCreated={(elementId, taskId) => patch(elementId, { taskId })}
      />
    </div>
  );
}

export default BoardCanvas;
