"use client";

/**
 * The global collaboration sheet. Mounted once in `AppShell`, it renders wherever the app is,
 * reads `useLive().collaborateCtx` and performs the chosen action through `@/lib/live/client`.
 *
 * Nothing here talks to LiveKit — it creates the room (or the doc / recording / meeting) and then
 * navigates to the surface that owns it (`/live/<id>`, `/docs/<id>`, `/recordings`, `/meetings`).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, ShieldAlert, X } from "lucide-react";
import { Avatar, Button, Modal, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { callPerson, createDoc, knockPerson, startRoom } from "@/lib/live/client";
import type { CollabAction, CollabContext, RoomKind } from "@/lib/live/types";
import { cn } from "@/lib/utils";
import { COLLAB_ACTIONS, EXTRA_ACTIONS, type CollabActionMeta } from "./CollaborateButton";
import { closeCollaborate, useLive } from "./liveStore";

/** Actions that need people picked before anything is created. */
const NEEDS_PEOPLE: CollabAction[] = ["group"];

function titleFor(ctx: CollabContext, fallback: string) {
  return (ctx.title || "").trim() || fallback;
}

export function CollaborateMenu() {
  const { collaborateOpen, collaborateCtx, collaborateAction, collaborateNonce } = useLive();
  const router = useRouter();
  const toast = useToast();
  const { profile, people } = useSession();
  const [busy, setBusy] = React.useState<CollabAction | null>(null);
  const [chosen, setChosen] = React.useState<CollabAction | null>(null);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [q, setQ] = React.useState("");
  const ctx = React.useMemo<CollabContext>(() => collaborateCtx || {}, [collaborateCtx]);
  const ranRef = React.useRef(0);

  /* An action that needs people shows the people screen: either one the user just tapped, or a
     preselected one from the entity page. Derived, so the preselect needs no state write. */
  const preselected = collaborateOpen && collaborateAction && NEEDS_PEOPLE.includes(collaborateAction) ? collaborateAction : null;
  const picking = chosen ?? preselected;

  const close = React.useCallback(() => {
    setChosen(null);
    setPicked([]);
    setQ("");
    closeCollaborate();
  }, []);

  const run = React.useCallback(
    async (action: CollabAction, invitees?: string[]) => {
      const c: CollabContext = { ...ctx, invitees: invitees ?? ctx.invitees ?? [] };
      setBusy(action);
      try {
        const go = (id: string, suffix = "") => {
          close();
          router.push(`/live/${id}${suffix}`);
        };
        switch (action) {
          case "voice": {
            const id = c.personId ? await callPerson(c.personId, false) : await startRoom("call", { ...c, title: titleFor(c, "Voice call") }, { settings: { audio_only_default: true } });
            go(id, "?audio=1");
            return;
          }
          case "video": {
            const id = c.personId ? await callPerson(c.personId, true) : await startRoom("call", { ...c, title: titleFor(c, "Video call") });
            go(id);
            return;
          }
          case "huddle": {
            const id = await startRoom("huddle", { ...c, title: titleFor(c, "Huddle") });
            go(id);
            return;
          }
          case "screen": {
            const id = await startRoom("huddle", { ...c, title: titleFor(c, "Screen share") }, { settings: { allow_screen_share: true } });
            go(id, "?share=1");
            return;
          }
          case "whiteboard": {
            const id = await startRoom("huddle", { ...c, title: titleFor(c, "Whiteboard session") }, { settings: { allow_whiteboard: true } });
            go(id, "?mode=whiteboard");
            return;
          }
          case "war_room": {
            const id = await startRoom("war_room", { ...c, title: titleFor(c, "War room") }, { persistent: true, settings: { allow_recording: true } });
            go(id);
            return;
          }
          case "knock": {
            if (!c.personId) throw new Error("Pick a person to knock");
            await knockPerson(c.personId);
            toast.push("Knocked — they will see it right away", "success");
            close();
            return;
          }
          case "record": {
            close();
            router.push(`/recordings?new=screen${c.projectId ? `&project=${c.projectId}` : ""}${c.taskId ? `&task=${c.taskId}` : ""}${c.channelId ? `&channel=${c.channelId}` : ""}`);
            return;
          }
          case "video_note": {
            close();
            router.push(`/recordings?new=video_note${c.projectId ? `&project=${c.projectId}` : ""}${c.taskId ? `&task=${c.taskId}` : ""}`);
            return;
          }
          case "meeting": {
            close();
            const parts = (c.invitees || []).concat(c.personId ? [c.personId] : []).filter(Boolean);
            router.push(`/meetings?new=1${c.projectId ? `&project=${c.projectId}` : ""}${parts.length ? `&with=${parts.join(",")}` : ""}${c.title ? `&title=${encodeURIComponent(c.title)}` : ""}`);
            return;
          }
          case "doc": {
            if (!profile.org_id) throw new Error("No organization on your profile");
            const id = await createDoc({
              orgId: profile.org_id,
              ownerId: profile.id,
              title: titleFor(c, "Untitled document"),
              kind: c.meetingId ? "meeting_notes" : "doc",
              meetingId: c.meetingId ?? null,
              projectId: c.projectId ?? null,
              taskId: c.taskId ?? null,
              departmentId: c.departmentId ?? profile.department_id ?? null,
              memberIds: (c.invitees || []).concat(c.personId ? [c.personId] : []),
            });
            close();
            router.push(`/docs/${id}`);
            return;
          }
          case "group": {
            const kind: RoomKind = "temp";
            const id = await startRoom(kind, { ...c, title: titleFor(c, "Quick group") });
            go(id);
            return;
          }
          default:
            close();
        }
      } catch (e) {
        toast.push(e instanceof Error ? e.message : "Could not start that", "danger");
      } finally {
        setBusy(null);
      }
    },
    [ctx, close, router, toast, profile.org_id, profile.id, profile.department_id]
  );

  // A preselected action (entity page pressed "Start huddle") runs straight away — once per open.
  React.useEffect(() => {
    if (!collaborateOpen || !collaborateAction) return;
    if (ranRef.current === collaborateNonce) return;
    ranRef.current = collaborateNonce;
    /* Actions that need people are shown by `preselected` above — nothing to start yet. */
    if (NEEDS_PEOPLE.includes(collaborateAction)) return;
    /* `run` starts a call/room and navigates; every path through it touches state (busy, then
       `close`). That is the point of this effect — an entity page fired `openCollaborate(ctx, action)`
       and the work has to begin somewhere. It cannot become a store subscription either: the
       subscriber would fire during `emit()`, before this component re-renders, so `run` would close
       over the previous `ctx` and start the action against the wrong entity. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run(collaborateAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collaborateOpen, collaborateAction, collaborateNonce]);

  const list = React.useMemo<CollabActionMeta[]>(() => {
    const extra: CollabActionMeta[] = [];
    if (ctx.personId) extra.push(EXTRA_ACTIONS.knock);
    if (ctx.incidentId) extra.push(EXTRA_ACTIONS.war_room);
    extra.push(EXTRA_ACTIONS.video_note);
    return [...extra, ...COLLAB_ACTIONS];
  }, [ctx.personId, ctx.incidentId]);

  const candidates = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people
      .filter((p) => p.id !== profile.id)
      .filter((p) => !needle || p.full_name?.toLowerCase().includes(needle) || (p.designation || "").toLowerCase().includes(needle))
      .slice(0, 40);
  }, [people, q, profile.id]);

  if (!collaborateOpen) return null;

  // Silent pass-through while a preselected action is running.
  if (collaborateAction && !picking && busy) {
    return (
      <Modal open onClose={close} title="Starting…" width={360}>
        <div className="flex items-center gap-2.5 py-4 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Setting things up…
        </div>
      </Modal>
    );
  }

  if (picking) {
    return (
      <Modal
        open
        onClose={close}
        title="Who should join?"
        width={480}
        footer={
          <>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button variant="primary" loading={busy !== null} disabled={picked.length === 0} onClick={() => run(picking, picked)}>
              Start with {picked.length || "…"}
            </Button>
          </>
        }
      >
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        {picked.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {picked.map((id) => {
              const p = people.find((x) => x.id === id);
              return (
                <button key={id} type="button" className="pill tone-brand" onClick={() => setPicked((s) => s.filter((x) => x !== id))}>
                  {p?.full_name || "Someone"} <X size={11} />
                </button>
              );
            })}
          </div>
        )}
        <div className="max-h-[46vh] overflow-y-auto -mx-1">
          {candidates.map((p) => {
            const on = picked.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPicked((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                className={cn("w-full flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--radius-sm)] text-left", on ? "bg-[var(--neutral-bg)]" : "hover:bg-[var(--neutral-bg)]")}
              >
                <Avatar name={p.full_name} src={p.avatar_url} size={26} presence={p.presence} />
                <span className="min-w-0">
                  <span className="block text-sm truncate">{p.full_name}</span>
                  <span className="block text-[11px] text-muted truncate">{p.designation || ""}</span>
                </span>
                {on && <span className="ml-auto pill tone-brand">in</span>}
              </button>
            );
          })}
          {candidates.length === 0 && <p className="text-sm text-muted px-2 py-4">Nobody matches that.</p>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={close} title="Collaborate" width={480}>
      <p className="text-sm text-muted mb-3">Pick how you want to work together right now. Everything stays linked to where you started it.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {list.map((a) => (
          <button
            key={a.action}
            type="button"
            disabled={busy !== null}
            onClick={() => (NEEDS_PEOPLE.includes(a.action) ? setChosen(a.action) : run(a.action))}
            className="card p-3 text-left row-hover disabled:opacity-60 flex flex-col gap-1.5 min-w-0"
          >
            <span className="w-8 h-8 rounded-[var(--radius-sm)] sunken flex items-center justify-center text-[var(--brand-2)] shrink-0">
              {busy === a.action ? <Loader2 size={15} className="animate-spin" /> : <a.icon size={15} />}
            </span>
            <span className="text-sm font-medium leading-tight truncate w-full">{a.label}</span>
            <span className="text-[11px] text-muted leading-tight line-clamp-2">{a.hint}</span>
          </button>
        ))}
      </div>
      <ContextLine ctx={ctx} />
    </Modal>
  );
}

/** Tiny reminder of what this collaboration will be attached to (so nothing lands in the void). */
function ContextLine({ ctx }: { ctx: CollabContext }) {
  const { departments, people } = useSession();
  const [label, setLabel] = React.useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const sb = createClient();
      if (ctx.projectId) {
        const { data } = await sb.from("projects").select("name").eq("id", ctx.projectId).maybeSingle();
        if (alive && data) setLabel(`Project · ${data.name}`);
        return;
      }
      if (ctx.taskId) {
        const { data } = await sb.from("tasks").select("title").eq("id", ctx.taskId).maybeSingle();
        if (alive && data) setLabel(`Task · ${data.title}`);
        return;
      }
      if (ctx.channelId) {
        const { data } = await sb.from("channels").select("name").eq("id", ctx.channelId).maybeSingle();
        if (alive && data) setLabel(`Channel · ${data.name}`);
        return;
      }
      if (ctx.departmentId) {
        const d = departments.find((x) => x.id === ctx.departmentId);
        if (alive && d) setLabel(`Department · ${d.name}`);
        return;
      }
      if (ctx.personId) {
        const p = people.find((x) => x.id === ctx.personId);
        if (alive && p) setLabel(`With ${p.full_name}`);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ctx.projectId, ctx.taskId, ctx.channelId, ctx.departmentId, ctx.personId, departments, people]);
  if (!label) return null;
  return (
    <div className="mt-3 pt-3 border-t text-[11px] text-muted flex items-center gap-1.5">
      <ShieldAlert size={12} /> Linked to <span className="font-medium text-[var(--fg-2)] truncate">{label}</span>
    </div>
  );
}
