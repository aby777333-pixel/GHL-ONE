"use client";
/**
 * GHL LIVE — the room canvas.
 *
 * Layout (§200): people rail · stage · tabbed panel, with the control bar underneath.
 * On phones the rail and the panel become sheets and the control bar sits above the 56px nav.
 * Media comes from `useLiveKit`; every piece of state that must outlive the call
 * (hands, notes, polls, tasks, decisions, moderation) goes through Supabase.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, PanelRightClose, PanelRightOpen, ShieldAlert, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Modal, Pill, useToast } from "@/components/ui";
import {
  bookmark as bookmarkRoom,
  endRoom,
  fetchRoom,
  invitePerson,
  leaveRoom,
  moderate,
  raiseHand,
  setLiveState,
} from "@/lib/live/client";
import {
  ROOM_KIND_LABEL,
  liveChannelName,
  roomCapturePath,
  type LiveDataMessage,
  type LiveRoom as LiveRoomRow,
  type RoomSettings,
  type StageMode,
} from "@/lib/live/types";
import { cn } from "@/lib/utils";
import { useLiveKit } from "./useLiveKit";
import { Stage } from "./Stage";
import { ControlBar } from "./ControlBar";
import { ParticipantsRail, type WaitingPerson } from "./ParticipantsRail";
import { RoomPanel, type PanelTab } from "./RoomPanel";
import { ConnectionBanner } from "./QualityBadge";
import { useAnnotations, type AnnotKind } from "./Annotations";
import { RoomGate } from "./RoomGates";
import { RoomDialogs } from "./RoomDialogs";
import { useRoomRecording } from "./RoomRecording";

export type LiveRoomProps = {
  roomId?: string;
  /** External guest join — no company chrome, no panels, only the call. */
  guestToken?: string;
  guestName?: string;
  guest?: boolean;
  /** Row loaded by the server page (members). */
  initialRoom?: LiveRoomRow | null;
  /** `?invite=<id>` — accepted as soon as we join. */
  inviteId?: string | null;
  me?: { id: string; name: string; orgId: string } | null;
  backHref?: string;
};

type Reaction = { id: number; emoji: string; left: number };

const CAPTURE_LABEL: Record<string, string> = {
  war_room: "Create a bug from this screen",
  incident: "Create a bug from this screen",
  review: "Add a design comment from this screen",
  training: "Save this screen as a note",
};

export function LiveRoom(props: LiveRoomProps) {
  const { roomId, guestToken, guestName, guest, inviteId, me, backHref = "/live" } = props;
  const router = useRouter();
  const toast = useToast();

  const [room, setRoom] = React.useState<LiveRoomRow | null>(props.initialRoom ?? null);
  const [hands, setHands] = React.useState<Set<string>>(new Set());
  const [waiting, setWaiting] = React.useState<WaitingPerson[]>([]);
  const [mode, setMode] = React.useState<StageMode>("video");
  const [pinned, setPinned] = React.useState<string | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(!guest);
  const [panelTab, setPanelTab] = React.useState<PanelTab>("chat");
  const [railOpen, setRailOpen] = React.useState(false);
  const [reactions, setReactions] = React.useState<Reaction[]>([]);
  const [incomingNotes, setIncomingNotes] = React.useState<{ body: string; version: number } | null>(null);
  const [recording, setRecording] = React.useState(false);
  const [hasBreakouts, setHasBreakouts] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [wide, setWide] = React.useState(() => (typeof window === "undefined" ? true : window.matchMedia("(min-width: 1024px)").matches));

  const [devicesOpen, setDevicesOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [hostOpen, setHostOpen] = React.useState(false);
  const [breakoutsOpen, setBreakoutsOpen] = React.useState(false);
  const [taskOpen, setTaskOpen] = React.useState(false);
  const [shareWarn, setShareWarn] = React.useState(false);
  const [endConfirm, setEndConfirm] = React.useState(false);
  const [capture, setCapture] = React.useState<{ path: string; name: string; type: string; size?: number } | null>(null);
  const [movePrompt, setMovePrompt] = React.useState<{ id: string; title: string } | null>(null);

  const [annotating, setAnnotating] = React.useState(false);
  const [tool, setTool] = React.useState<AnnotKind>("pen");
  const [color, setColor] = React.useState("#ef4444");
  const annots = useAnnotations();

  /* ------------------------------------------------------------- breakouts */
  /** A `move_to` nudge names the parent room; each client then looks up the breakout it was put in. */
  const handleMoveTo = React.useCallback(
    async (targetId: string) => {
      if (!roomId || guest) return;
      const sb = createClient();
      if (targetId === roomId) {
        const { data } = await sb.from("live_rooms").select("id,title").eq("parent_room_id", roomId).neq("status", "ended").limit(1);
        const mine = (data || [])[0];
        if (mine) setMovePrompt({ id: mine.id, title: mine.title });
        return;
      }
      const { data } = await sb.from("live_rooms").select("id,title").eq("id", targetId).maybeSingle();
      if (data) setMovePrompt({ id: data.id, title: data.title });
    },
    [roomId, guest]
  );

  /* ------------------------------------------------------------- media */
  const onData = React.useCallback(
    (msg: LiveDataMessage, from?: { identity: string; name?: string }) => {
      const fromId = from?.identity || "";
      const fromName = (from?.name || "Someone").replace(/\s*\(Guest\)$/, "");
      switch (msg.t) {
        case "reaction":
          setReactions((r) => [...r, { id: Date.now() + Math.random(), emoji: msg.emoji, left: 8 + Math.random() * 78 }].slice(-14));
          break;
        case "hand":
          setHands((h) => {
            const n = new Set(h);
            if (msg.up) n.add(fromId);
            else n.delete(fromId);
            return n;
          });
          break;
        case "notes":
          setIncomingNotes({ body: msg.body, version: msg.version });
          break;
        case "mode":
          if (msg.follow) setMode(msg.mode);
          break;
        case "record":
          setRecording(msg.on);
          break;
        case "request_share":
          toast.push(`${fromName} would like you to share your screen`, "info");
          break;
        case "move_to":
          void handleMoveTo(msg.roomId);
          break;
        case "annot":
        case "annot_clear":
        case "pointer":
          annots.ingest(msg, fromId, fromName);
          break;
        default:
          break;
      }
    },
    [annots, toast, handleMoveTo]
  );

  const lk = useLiveKit({ roomId, guestToken, guestName, onData, onDisconnected: () => setRecording(false) });

  const meId = me?.id || lk.meta?.identity || "";
  const meName = me?.name || guestName || "You";
  const orgId = me?.orgId || lk.meta?.org || "";
  const isHost = lk.meta?.role === "host" || lk.meta?.role === "cohost";
  const settings: RoomSettings = room?.settings || lk.meta?.settings || {};
  const confidential = !!(room?.confidential ?? lk.meta?.confidential);
  const canPublish = lk.meta?.canPublish !== false;
  const canShare = canPublish && settings.allow_screen_share !== false;
  // Only the host or a co-host may record; everybody else sees the indicator, not the button.
  const canRecord = !guest && isHost && !confidential && settings.allow_recording !== false;
  const canWhiteboard = !guest && settings.allow_whiteboard !== false;
  const title = room?.title || lk.meta?.title || "Live room";
  const kind = room?.kind || lk.meta?.kind || "huddle";
  const handUp = hands.has(meId);

  /**
   * Real recording: composites every participant in this browser and saves it to /recordings.
   * `onStopped` keeps the red indicator honest when a take ends by itself (room gone, tab closing).
   */
  const roomRec = useRoomRecording({ room: lk.room, peers: lk.peers, roomId, roomRow: room, orgId, meId, meName, roomTitle: title, onStopped: () => setRecording(false) });

  /** §148–§150 — while you are presenting, only urgent things interrupt you. */
  const notify = React.useCallback(
    (text: string, tone?: "success" | "danger" | "info") => {
      if (lk.sharing && tone !== "danger") return;
      toast.push(text, tone);
    },
    [lk.sharing, toast]
  );

  /* --------------------------------------------------- room + participants */
  const refreshRoom = React.useCallback(async () => {
    if (!roomId || guest) return;
    const r = await fetchRoom(roomId).catch(() => null);
    if (r) setRoom(r);
    const { count } = await createClient().from("live_rooms").select("id", { count: "exact", head: true }).eq("parent_room_id", roomId).neq("status", "ended");
    setHasBreakouts((count || 0) > 0);
  }, [roomId, guest]);

  const refreshParticipants = React.useCallback(async () => {
    if (!roomId || guest) return;
    const sb = createClient();
    const { data } = await sb.from("live_participants").select("user_id,role,hand_raised,left_at").eq("room_id", roomId);
    const rows = data || [];
    setHands(new Set(rows.filter((r) => r.hand_raised && !r.left_at).map((r) => r.user_id)));
    const waitingIds = rows.filter((r) => r.role === "waiting" && !r.left_at).map((r) => r.user_id);
    if (!waitingIds.length) return setWaiting([]);
    const { data: profiles } = await sb.from("profiles").select("id,full_name,avatar_url").in("id", waitingIds);
    setWaiting((profiles || []).map((p) => ({ user_id: p.id, name: p.full_name || "Someone", avatar: p.avatar_url })));
  }, [roomId, guest]);

  React.useEffect(() => {
    if (!roomId || guest) return;
    void (async () => {
      await refreshRoom();
      await refreshParticipants();
    })();
    const sb = createClient();
    const rt = sb
      .channel(`${liveChannelName(roomId)}:state`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_participants", filter: `room_id=eq.${roomId}` }, () => void refreshParticipants())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_rooms", filter: `id=eq.${roomId}` }, (p) => setRoom(p.new as unknown as LiveRoomRow))
      .subscribe();
    return () => {
      void sb.removeChannel(rt);
    };
  }, [roomId, guest, refreshRoom, refreshParticipants]);

  /* ------------------------------------------------------ invite auto-accept */
  React.useEffect(() => {
    if (!inviteId || guest) return;
    void createClient().rpc("respond_live_invite", { p_id: inviteId, p_status: "accepted" });
  }, [inviteId, guest]);

  /* ------------------------------------------------------------ presence */
  React.useEffect(() => {
    if (guest || lk.state !== "connected") return;
    if (recording) void setLiveState("recording");
    else if (lk.sharing) void setLiveState("presenting");
  }, [lk.sharing, recording, lk.state, guest]);

  /* ------------------------------------------------------------ breakpoint */
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  /* --------------------------------------------------------------- cleanup */
  const cleanup = React.useCallback(async () => {
    if (roomId && !guest) await leaveRoom(roomId).catch(() => null);
    await lk.leave();
  }, [roomId, guest, lk]);

  React.useEffect(() => {
    const onLeave = () => {
      if (roomId && !guest) void leaveRoom(roomId).catch(() => null);
    };
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      void cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, guest]);

  /* --------------------------------------------------------- reactions fade */
  React.useEffect(() => {
    if (!reactions.length) return;
    const t = setTimeout(() => setReactions((r) => r.slice(1)), 2600);
    return () => clearTimeout(t);
  }, [reactions]);

  /* ---------------------------------------------------------- interactions */
  async function toggleHand() {
    const up = !handUp;
    setHands((h) => {
      const n = new Set(h);
      if (up) n.add(meId);
      else n.delete(meId);
      return n;
    });
    void lk.send({ t: "hand", up });
    if (roomId && !guest) await raiseHand(roomId, up).catch(() => null);
  }

  function react(emoji: string) {
    setReactions((r) => [...r, { id: Date.now(), emoji, left: 8 + Math.random() * 78 }]);
    void lk.send({ t: "reaction", emoji });
  }

  async function startShare() {
    setShareWarn(false);
    await lk.setShare(true);
    setMode("screen");
    void lk.send({ t: "mode", mode: "screen", follow: true });
  }

  async function onShareClick() {
    if (lk.sharing) {
      await lk.setShare(false);
      setMode("video");
      return;
    }
    setShareWarn(true);
  }

  async function toggleRecording() {
    if (!roomId) return;
    const next = !recording;
    if (next) {
      const problem = await roomRec.start();
      if (problem) return toast.push(problem, "danger");
    } else {
      // Saving happens in `useRoomRecording` as soon as the file is finished.
      void roomRec.stop();
    }
    setRecording(next);
    void lk.send({ t: "record", on: next, by: meName });
    await createClient()
      .from("live_events")
      .insert({ org_id: orgId, room_id: roomId, kind: next ? "recording_started" : "recording_stopped", actor_id: meId, actor_name: meName, payload: {} })
      .then(() => null);
    if (!next) void setLiveState(lk.sharing ? "presenting" : "in_meeting");
    toast.push(next ? "Everyone can see that this room is being recorded" : "Recording indicator switched off", next ? "danger" : "info");
  }

  /** §26–§28 — freeze the shared screen, keep it as a task attachment. */
  async function captureScreen() {
    const video = document.querySelector<HTMLVideoElement>('video[data-live-share="1"]');
    if (!video || !roomId || !orgId) return notify("Nothing is being shared right now", "danger");
    try {
      const cv = document.createElement("canvas");
      cv.width = video.videoWidth || 1280;
      cv.height = video.videoHeight || 720;
      const ctx = cv.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(video, 0, 0, cv.width, cv.height);
      const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/jpeg", 0.86));
      if (!blob) throw new Error("no frame");
      const path = roomCapturePath(orgId, roomId);
      const file = new File([blob], path.split("/").pop() || "screen.jpg", { type: "image/jpeg" });
      const { error } = await createClient().storage.from("live").upload(path, file, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      setCapture({ path, name: file.name, type: "image/jpeg", size: file.size });
      setTaskOpen(true);
    } catch (e) {
      toast.push((e as Error).message || "Could not capture the screen", "danger");
    }
  }

  async function hostAct(action: string, identity?: string, value?: string) {
    if (!roomId) return;
    try {
      await moderate(roomId, action, identity, value);
      await refreshParticipants();
      await refreshRoom();
    } catch (e) {
      toast.push((e as Error).message, "danger");
    }
  }

  async function leaveAndGo() {
    await cleanup();
    router.push(guest ? "/" : backHref);
  }

  async function endForAll() {
    if (!roomId) return;
    setEndConfirm(false);
    try {
      await endRoom(roomId);
      await cleanup();
      router.push(backHref);
    } catch (e) {
      toast.push((e as Error).message, "danger");
    }
  }

  /* ---------------------------------------------------------------- gates */
  if (lk.state !== "connected" && lk.state !== "reconnecting") {
    // The recorder dialogs ride along so a save that is still running survives the room ending.
    return (
      <>
        {roomRec.dialog}
        <RoomGate state={lk.state} error={lk.error} title={title} roomId={roomId} guest={guest} backHref={backHref} onRetry={lk.retry} />
      </>
    );
  }

  /* ----------------------------------------------------------------- room */
  const railActions = {
    onPin: (id: string) => setPinned((p) => (p === id ? null : id)),
    onMute: (id: string) => void hostAct("mute", id, "audio"),
    onRemove: (id: string) => void hostAct("remove", id),
    onRole: (id: string, role: "cohost" | "presenter" | "participant") => void hostAct("role", id, role),
    onTransferHost: (id: string) => void hostAct("transfer_host", id),
    onLowerHand: (id: string) => void hostAct("lower_hand", id),
    onStopShare: (id: string) => void hostAct("stop_share", id),
    onRequestShare: async (id: string) => {
      void lk.send({ t: "request_share", from: meName });
      if (roomId && !guest) await invitePerson(roomId, id, "request_share", `${meName} would like you to share your screen`).catch(() => null);
      notify("Asked them to share", "success");
    },
  };

  return (
    <div
      className={cn(
        "flex flex-col min-h-0",
        // Inside the app shell: minus the topbar, and minus the 56px mobile nav (main has pb-16).
        // Guest pages have neither, so the room owns the whole viewport below its own bar.
        guest ? "h-[calc(100dvh-2.75rem)]" : "h-[calc(100dvh-var(--topbar-h)-4rem)] lg:h-[calc(100dvh-var(--topbar-h))]"
      )}
    >
      {/* header */}
      <div className="flex items-center gap-2 px-3 h-11 border-b shrink-0 bg-[var(--bg-elev)]">
        {!guest && (
          <Button size="xs" icon variant="ghost" onClick={() => void leaveAndGo()} aria-label="Back"><ArrowLeft size={15} /></Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate flex items-center gap-1.5">
            {title}
            {confidential && <Pill tone="tone-danger" className="shrink-0"><ShieldAlert size={11} /> Confidential</Pill>}
            {guest && <Pill tone="tone-warn" className="shrink-0">External Guest</Pill>}
          </div>
          <div className="text-[11px] text-muted truncate">
            {ROOM_KIND_LABEL[kind] || "Room"} · {lk.peers.length} {lk.peers.length === 1 ? "person" : "people"}
            {room?.locked ? " · locked" : ""}
            {room?.waiting_room ? " · waiting room on" : ""}
          </div>
        </div>
        {recording && <Pill tone="tone-danger" className="gap-1 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> Recording</Pill>}
        {!guest && (
          <>
            <Button size="xs" icon variant="ghost" className="lg:hidden" onClick={() => setRailOpen(true)} aria-label="People"><Users size={15} /></Button>
            <Button size="xs" icon variant="ghost" onClick={() => (wide ? setPanelOpen((o) => !o) : setSheetOpen(true))} aria-label={panelOpen ? "Hide panel" : "Show panel"}>
              {wide && panelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            </Button>
          </>
        )}
      </div>

      {lk.state === "reconnecting" && <ConnectionBanner state="reconnecting" />}
      {lk.needsAudioUnlock && (
        <button type="button" onClick={() => void lk.unlockAudio()} className="w-full text-xs font-medium tone-info py-1.5">
          Tap to let this browser play the room audio
        </button>
      )}

      {/* body */}
      <div className="flex-1 min-h-0 flex">
        {!guest && (
          <ParticipantsRail
            peers={lk.peers}
            hands={hands}
            waiting={waiting}
            isHost={isHost}
            pinned={pinned}
            onAdd={() => setInviteOpen(true)}
            onAdmit={(id, admit) => void hostAct(admit ? "admit" : "remove", id)}
            actions={railActions}
            className="hidden lg:flex w-[232px] shrink-0"
          />
        )}

        <div className="flex-1 min-w-0 relative">
          <Stage
            className="h-full"
            mode={mode}
            onMode={(m) => {
              setMode(m);
              if (isHost) void lk.send({ t: "mode", mode: m, follow: false });
            }}
            peers={lk.peers}
            sharer={lk.sharer}
            hands={hands}
            pinned={pinned}
            onPin={setPinned}
            confidentialFor={confidential ? `${meName} · ${new Date().toLocaleDateString()}` : null}
            boardId={null}
            docId={null}
            canWhiteboard={canWhiteboard}
            strokes={annots.strokes}
            pointers={annots.pointers}
            annotating={annotating}
            onAnnotating={setAnnotating}
            tool={tool}
            onTool={setTool}
            color={color}
            onColor={setColor}
            onStroke={(s) => {
              annots.addLocal(s);
              void lk.send({ t: "annot", id: s.id, kind: s.kind, pts: s.pts, color: s.color, text: s.text });
            }}
            onPointer={(x, y, on) => void lk.send({ t: "pointer", x, y, on }, false)}
            onClearAnnotations={() => {
              annots.clearLocal();
              void lk.send({ t: "annot_clear" });
            }}
            captureLabel={CAPTURE_LABEL[kind] || "Create task from this screen"}
            onCapture={guest ? undefined : () => void captureScreen()}
            onOpenNotes={() => {
              setPanelTab("notes");
              if (wide) setPanelOpen(true);
              else setSheetOpen(true);
            }}
          />

          {/* floating reactions */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {reactions.map((r) => (
              <span key={r.id} className="absolute bottom-4 text-2xl anim-fade-up" style={{ left: `${r.left}%`, animation: "fade-up 2.6s ease-out forwards" }}>
                {r.emoji}
              </span>
            ))}
          </div>
        </div>

        {!guest && wide && panelOpen && roomId && (
          <RoomPanel
            className="hidden lg:flex w-[330px] shrink-0 border-l"
            tab={panelTab}
            onTab={setPanelTab}
            roomId={roomId}
            orgId={orgId}
            roomTitle={title}
            meId={meId}
            meName={meName}
            isHost={isHost}
            peers={lk.peers}
            hands={hands}
            waiting={waiting}
            pinned={pinned}
            actions={railActions}
            onAdd={() => setInviteOpen(true)}
            onAdmit={(id, admit) => void hostAct(admit ? "admit" : "remove", id)}
            send={(m) => void lk.send(m)}
            incomingNotes={incomingNotes}
          />
        )}
      </div>

      <ControlBar
        micOn={lk.micOn}
        camOn={lk.camOn}
        sharing={lk.sharing}
        recording={recording}
        handUp={handUp}
        canPublish={canPublish}
        canShare={canShare}
        canRecord={canRecord}
        canWhiteboard={canWhiteboard}
        isHost={isHost}
        guest={guest}
        quality={lk.quality}
        onMic={() => void lk.setMic(!lk.micOn)}
        onCam={() => void lk.setCam(!lk.camOn)}
        onShare={() => void onShareClick()}
        onWhiteboard={() => setMode("whiteboard")}
        onRecord={() => void toggleRecording()}
        onInvite={() => setInviteOpen(true)}
        onTask={() => {
          setCapture(null);
          setTaskOpen(true);
        }}
        onHand={() => void toggleHand()}
        onReaction={react}
        onSettings={() => setDevicesOpen(true)}
        onBookmark={async () => {
          if (!roomId) return;
          await bookmarkRoom(roomId, "Important moment").catch(() => null);
          notify("Moment bookmarked", "success");
        }}
        onBreakouts={() => setBreakoutsOpen(true)}
        onHostControls={() => setHostOpen(true)}
        onLeave={() => void leaveAndGo()}
        onEnd={isHost ? () => setEndConfirm(true) : undefined}
      />

      {/* mobile sheets */}
      {!guest && roomId && (
        <Modal open={!wide && railOpen} onClose={() => setRailOpen(false)} title="People" width={420} side>
          <ParticipantsRail peers={lk.peers} hands={hands} waiting={waiting} isHost={isHost} pinned={pinned} onAdd={() => { setRailOpen(false); setInviteOpen(true); }} onAdmit={(id, admit) => void hostAct(admit ? "admit" : "remove", id)} actions={railActions} className="border-r-0 h-[70dvh]" />
        </Modal>
      )}
      {!guest && roomId && (
        <Modal open={!wide && sheetOpen} onClose={() => setSheetOpen(false)} title={null} width={520} side>
          <div className="h-[74dvh] -mx-[var(--s4)] -my-[var(--s3)]">
            <RoomPanel
              className="h-full"
              mobile
              tab={panelTab}
              onTab={setPanelTab}
              roomId={roomId}
              orgId={orgId}
              roomTitle={title}
              meId={meId}
              meName={meName}
              isHost={isHost}
              peers={lk.peers}
              hands={hands}
              waiting={waiting}
              pinned={pinned}
              actions={railActions}
              onAdd={() => setInviteOpen(true)}
              onAdmit={(id, admit) => void hostAct(admit ? "admit" : "remove", id)}
              send={(m) => void lk.send(m)}
              incomingNotes={incomingNotes}
              onClose={() => setSheetOpen(false)}
            />
          </div>
        </Modal>
      )}

      {roomRec.dialog}

      <RoomDialogs
        lk={lk}
        roomId={roomId}
        room={room}
        guest={guest}
        isHost={isHost}
        title={title}
        kind={kind}
        confidential={confidential}
        guestsAllowed={!!settings.guests_allowed}
        peers={lk.peers}
        waiting={waiting}
        hasBreakouts={hasBreakouts}
        captureLabel={capture ? CAPTURE_LABEL[kind] || "Create a task from this screen" : "Create a task from this room"}
        attachment={capture}
        open={{ devices: devicesOpen, invite: inviteOpen, host: hostOpen, breakouts: breakoutsOpen, task: taskOpen, shareWarn, endConfirm, move: movePrompt }}
        set={{
          devices: setDevicesOpen,
          invite: setInviteOpen,
          host: setHostOpen,
          breakouts: setBreakoutsOpen,
          task: (v) => {
            setTaskOpen(v);
            if (!v) setCapture(null);
          },
          shareWarn: setShareWarn,
          endConfirm: setEndConfirm,
          move: setMovePrompt,
        }}
        onRefresh={() => {
          void refreshRoom();
          void refreshParticipants();
        }}
        onStartShare={() => void startShare()}
        onEndForAll={() => void endForAll()}
        onJoinBreakout={async (id) => {
          setMovePrompt(null);
          await cleanup();
          router.push(`/live/${id}`);
        }}
        send={(m) => void lk.send(m)}
      />
    </div>
  );
}
