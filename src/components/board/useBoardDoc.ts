"use client";
/**
 * Board document state: local edits, undo/redo, Supabase Realtime fan-out (ops + live cursors)
 * and a debounced, conflict-aware persist to `boards.doc`.
 *
 * Realtime auth rule (same as ActivityProvider): the socket must carry the *user's* access token,
 * so `supabase.realtime.setAuth(token)` runs before `subscribe()`.
 */
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { boardChannelName, type BoardDoc, type BoardElement, type BoardOp, type BoardPage } from "@/lib/live/types";
import type { Tables } from "@/lib/utils";

export type BoardRow = Tables<"boards">;
export type Cursor = { userId: string; name: string; color: string; x: number; y: number; pageId: string; laser?: boolean; at: number };
export type BoardTimer = { endsAt: number | null; label: string | null };
export type FollowMsg = { userId: string; pageId: string; view: { x: number; y: number; zoom: number }; at: number };

const SAVE_DEBOUNCE = 800;
const CURSOR_THROTTLE = 40;
const HISTORY_MAX = 80;

export const emptyDoc = (): BoardDoc => ({ pages: [{ id: "p1", title: "Page 1", elements: [] }], background: "dots" });

/** Normalise whatever came back from jsonb into a usable BoardDoc. */
export function asDoc(v: unknown): BoardDoc {
  const d = v as BoardDoc | null;
  if (!d || !Array.isArray(d.pages) || !d.pages.length) return emptyDoc();
  return {
    background: d.background === "grid" || d.background === "plain" ? d.background : "dots",
    pages: d.pages.map((p, i) => ({
      id: String(p?.id || `p${i + 1}`),
      title: String(p?.title || `Page ${i + 1}`),
      elements: Array.isArray(p?.elements) ? (p.elements.filter((e) => e && typeof e === "object" && e.id && e.type) as BoardElement[]) : [],
    })),
  };
}

/** Apply one operation. Pure and idempotent — replaying an op you already have is a no-op. */
export function applyOp(d: BoardDoc, op: BoardOp): BoardDoc {
  const mapPage = (pageId: string, fn: (p: BoardPage) => BoardPage): BoardDoc => ({
    ...d,
    pages: d.pages.map((p) => (p.id === pageId ? fn(p) : p)),
  });
  switch (op.op) {
    case "add":
      return mapPage(op.pageId, (p) => (p.elements.some((e) => e.id === op.el.id) ? p : { ...p, elements: [...p.elements, op.el] }));
    case "update":
      return mapPage(op.pageId, (p) => ({ ...p, elements: p.elements.map((e) => (e.id === op.id ? { ...e, ...op.patch } : e)) }));
    case "remove": {
      const gone = new Set(op.ids);
      return mapPage(op.pageId, (p) => ({
        ...p,
        // dropping an element also drops the connectors anchored to it
        elements: p.elements.filter((e) => !gone.has(e.id) && !(e.type === "connector" && ((e.from && gone.has(e.from)) || (e.to && gone.has(e.to))))),
      }));
    }
    case "reorder": {
      const ids = new Set(op.ids);
      return mapPage(op.pageId, (p) => ({ ...p, elements: p.elements.map((e) => (ids.has(e.id) ? { ...e, z: op.z } : e)) }));
    }
    case "page_add":
      return d.pages.some((p) => p.id === op.page.id) ? d : { ...d, pages: [...d.pages, op.page] };
    case "page_remove":
      return d.pages.length <= 1 ? d : { ...d, pages: d.pages.filter((p) => p.id !== op.pageId) };
    case "page_rename":
      return mapPage(op.pageId, (p) => ({ ...p, title: op.title }));
    case "replace":
      return asDoc(op.doc);
    default:
      return d; // cursor / follow / lock are ephemeral
  }
}

const isDurable = (op: BoardOp) => op.op !== "cursor" && op.op !== "follow" && op.op !== "lock";

export function useBoardDoc(boardId: string, initial: BoardRow | null, me: { id: string; name: string; color: string }) {
  const [board, setBoard] = React.useState<BoardRow | null>(initial);
  const [doc, setDoc] = React.useState<BoardDoc>(() => asDoc(initial?.doc));
  const [pageId, setPageId] = React.useState<string>(() => asDoc(initial?.doc).pages[0].id);
  const [cursors, setCursors] = React.useState<Cursor[]>([]);
  const [peers, setPeers] = React.useState<{ userId: string; name: string; color: string }[]>([]);
  const [timer, setTimerState] = React.useState<BoardTimer>({ endsAt: null, label: null });
  const [follow, setFollow] = React.useState<FollowMsg | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [canUndo, setCanUndo] = React.useState(false);
  const [canRedo, setCanRedo] = React.useState(false);

  const docRef = React.useRef(doc);
  const versionRef = React.useRef(initial?.version ?? 0);
  const pendingRef = React.useRef<BoardOp[]>([]);
  const dirtyRef = React.useRef(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const chanRef = React.useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const past = React.useRef<BoardDoc[]>([]);
  const future = React.useRef<BoardDoc[]>([]);
  const lastCursor = React.useRef(0);
  const origin = React.useId();
  const meRef = React.useRef(me);
  React.useEffect(() => { meRef.current = me; }, [me]);

  const setDocBoth = React.useCallback((next: BoardDoc) => {
    docRef.current = next;
    setDoc(next);
  }, []);

  const syncHistoryFlags = React.useCallback(() => {
    setCanUndo(past.current.length > 0);
    setCanRedo(future.current.length > 0);
  }, []);

  /* ------------------------------------------------------------- persist */
  const doSave = React.useCallback(async (): Promise<void> => {
    const sb = createClient();
    // Two passes: optimistic write, then one merge-and-retry if someone else got there first.
    for (let attempt = 0; attempt < 2; attempt++) {
      const ops = pendingRef.current;
      const snapshot = docRef.current;
      setSaving(true);
      const { data, error: err } = await sb
        .from("boards")
        .update({ doc: snapshot as never, version: versionRef.current + 1 })
        .eq("id", boardId)
        .eq("version", versionRef.current)
        .select("version")
        .maybeSingle();
      if (data) {
        versionRef.current = data.version;
        pendingRef.current = [];
        dirtyRef.current = false;
        setSaving(false);
        setError(null);
        return;
      }
      if (err && err.code !== "PGRST116") {
        setSaving(false);
        setError(err.message);
        return;
      }
      // Someone saved a newer version: take theirs and replay our pending ops on top.
      const { data: fresh } = await sb.from("boards").select("doc,version").eq("id", boardId).maybeSingle();
      if (!fresh) {
        setSaving(false);
        setError("This board is no longer available.");
        return;
      }
      let merged = asDoc(fresh.doc);
      for (const op of ops) merged = applyOp(merged, op);
      versionRef.current = fresh.version;
      setDocBoth(merged);
      if (attempt === 1) {
        pendingRef.current = [];
        dirtyRef.current = false;
        setSaving(false);
        setError("Another edit landed at the same time — reloaded the latest version.");
        return;
      }
    }
  }, [boardId, setDocBoth]);

  const scheduleSave = React.useCallback(() => {
    dirtyRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void doSave();
    }, SAVE_DEBOUNCE);
  }, [doSave]);

  const flush = React.useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (dirtyRef.current) await doSave();
  }, [doSave]);

  /* ------------------------------------------------------------ mutation */
  const pushHistory = React.useCallback(() => {
    past.current = [...past.current.slice(-(HISTORY_MAX - 1)), docRef.current];
    future.current = [];
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  const broadcast = React.useCallback((op: BoardOp) => {
    chanRef.current?.send({ type: "broadcast", event: "op", payload: { op, from: origin } });
  }, [origin]);

  /**
   * Apply locally, broadcast and schedule a save.
   * `record:false` for the middle of a drag (one undo step per gesture);
   * `broadcast:false` to skip the network for an intermediate frame (ops are idempotent,
   * so the final op of the gesture carries the truth).
   */
  const send = React.useCallback((op: BoardOp | BoardOp[], opts?: { record?: boolean; broadcast?: boolean }) => {
    const list = Array.isArray(op) ? op : [op];
    if (!list.length) return;
    if (opts?.record !== false) pushHistory();
    let next = docRef.current;
    for (const o of list) {
      if (isDurable(o)) next = applyOp(next, o);
      if (opts?.broadcast !== false) broadcast(o);
      if (isDurable(o)) pendingRef.current.push(o);
    }
    if (next !== docRef.current) {
      setDocBoth(next);
      scheduleSave();
    }
  }, [broadcast, pushHistory, scheduleSave, setDocBoth]);

  const replaceDoc = React.useCallback((next: BoardDoc, record = true) => {
    if (record) pushHistory();
    setDocBoth(next);
    pendingRef.current.push({ op: "replace", doc: next });
    broadcast({ op: "replace", doc: next });
    scheduleSave();
  }, [broadcast, pushHistory, scheduleSave, setDocBoth]);

  const undo = React.useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current = [...future.current.slice(-(HISTORY_MAX - 1)), docRef.current];
    syncHistoryFlags();
    setDocBoth(prev);
    pendingRef.current.push({ op: "replace", doc: prev });
    broadcast({ op: "replace", doc: prev });
    scheduleSave();
  }, [broadcast, scheduleSave, setDocBoth, syncHistoryFlags]);

  const redo = React.useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current = [...past.current.slice(-(HISTORY_MAX - 1)), docRef.current];
    syncHistoryFlags();
    setDocBoth(next);
    pendingRef.current.push({ op: "replace", doc: next });
    broadcast({ op: "replace", doc: next });
    scheduleSave();
  }, [broadcast, scheduleSave, setDocBoth, syncHistoryFlags]);

  /* ------------------------------------------------------------ realtime */
  React.useEffect(() => {
    const sb = createClient();
    const chan = sb.channel(boardChannelName(boardId), {
      config: { presence: { key: meRef.current.id }, broadcast: { self: false } },
    });
    chanRef.current = chan;

    chan.on("broadcast", { event: "op" }, ({ payload }) => {
      const { op, from } = (payload || {}) as { op?: BoardOp; from?: string };
      if (!op || from === origin) return;
      if (op.op === "cursor") {
        setCursors((cs) => {
          const rest = cs.filter((c) => c.userId !== op.userId);
          return [...rest, { userId: op.userId, name: op.name, color: op.color, x: op.x, y: op.y, pageId: op.pageId, laser: op.laser, at: Date.now() }];
        });
        return;
      }
      if (op.op === "follow") {
        setFollow({ userId: op.userId, pageId: op.pageId, view: op.view, at: Date.now() });
        return;
      }
      if (op.op === "lock") {
        setBoard((b) => (b ? { ...b, locked: op.locked } : b));
        return;
      }
      setDocBoth(applyOp(docRef.current, op));
    });

    chan.on("broadcast", { event: "timer" }, ({ payload }) => {
      const t = (payload || {}) as { endsAt?: number | null; label?: string | null };
      setTimerState({ endsAt: t.endsAt ?? null, label: t.label ?? null });
    });

    chan.on("presence", { event: "sync" }, () => {
      const state = chan.presenceState<{ userId: string; name: string; color: string }>();
      const list: { userId: string; name: string; color: string }[] = [];
      for (const key of Object.keys(state)) for (const m of state[key] || []) if (m.userId) list.push({ userId: m.userId, name: m.name, color: m.color });
      setPeers(list);
    });

    chan.on("postgres_changes", { event: "UPDATE", schema: "public", table: "boards", filter: `id=eq.${boardId}` }, (p) => {
      const row = p.new as BoardRow;
      setBoard((b) => ({ ...(b || row), ...row }));
      // Only adopt a remote document when we have nothing of our own in flight.
      if (!dirtyRef.current && !pendingRef.current.length && row.version !== versionRef.current) {
        versionRef.current = row.version;
        setDocBoth(asDoc(row.doc));
      }
    });

    let cancelled = false;
    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) sb.realtime.setAuth(data.session.access_token);
      chan.subscribe((status) => {
        if (status === "SUBSCRIBED") void chan.track({ userId: meRef.current.id, name: meRef.current.name, color: meRef.current.color });
      });
    });

    const gc = setInterval(() => {
      const cutoff = Date.now() - 6000;
      setCursors((cs) => (cs.some((c) => c.at < cutoff) ? cs.filter((c) => c.at >= cutoff) : cs));
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(gc);
      chanRef.current = null;
      sb.removeChannel(chan);
    };
  }, [boardId, setDocBoth, origin]);

  /* ------------------------------------------------------- initial fetch */
  React.useEffect(() => {
    if (initial) return;
    let alive = true;
    createClient().from("boards").select("*").eq("id", boardId).maybeSingle().then(({ data }) => {
      if (!alive || !data) return;
      setBoard(data);
      versionRef.current = data.version;
      const d = asDoc(data.doc);
      setDocBoth(d);
      setPageId((cur) => (d.pages.some((p) => p.id === cur) ? cur : d.pages[0].id));
    });
    return () => { alive = false; };
  }, [boardId, initial, setDocBoth]);

  // Save what is pending when the tab goes away.
  React.useEffect(() => {
    const onHide = () => { if (dirtyRef.current) void flush(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flush]);

  /* -------------------------------------------------------------- extras */
  const sendCursor = React.useCallback((x: number, y: number, laser = false) => {
    const now = Date.now();
    if (now - lastCursor.current < CURSOR_THROTTLE) return;
    lastCursor.current = now;
    const m = meRef.current;
    chanRef.current?.send({
      type: "broadcast",
      event: "op",
      payload: { op: { op: "cursor", x, y, pageId, name: m.name, color: m.color, userId: m.id, laser } as BoardOp, from: origin },
    });
  }, [pageId, origin]);

  const sendFollow = React.useCallback((view: { x: number; y: number; zoom: number }) => {
    chanRef.current?.send({
      type: "broadcast",
      event: "op",
      payload: { op: { op: "follow", pageId, view, userId: meRef.current.id } as BoardOp, from: origin },
    });
  }, [pageId, origin]);

  const setTimer = React.useCallback((endsAt: number | null, label: string | null) => {
    setTimerState({ endsAt, label });
    chanRef.current?.send({ type: "broadcast", event: "timer", payload: { endsAt, label } });
  }, []);

  const setLocked = React.useCallback(async (locked: boolean) => {
    setBoard((b) => (b ? { ...b, locked } : b));
    chanRef.current?.send({ type: "broadcast", event: "op", payload: { op: { op: "lock", locked } as BoardOp, from: origin } });
    const sb = createClient();
    await sb.from("boards").update({ locked }).eq("id", boardId);
    await sb.from("board_access_log").insert({ board_id: boardId, actor_id: meRef.current.id, action: locked ? "locked" : "unlocked" });
  }, [boardId, origin]);

  const page = doc.pages.find((p) => p.id === pageId) || doc.pages[0];
  const elements = page?.elements ?? [];

  return {
    board, setBoard, doc, page, elements, pageId, setPageId,
    send, replaceDoc, undo, redo, canUndo, canRedo,
    cursors, peers, saving, error, setError, flush,
    sendCursor, sendFollow, follow, setFollow,
    timer, setTimer, setLocked,
    version: versionRef,
  };
}

export type BoardDocApi = ReturnType<typeof useBoardDoc>;
