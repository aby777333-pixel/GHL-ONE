"use client";

/**
 * GHL LIVE global provider — mounted once in `AppShell`, next to `BuddyPanel`.
 *
 *  · subscribes to `live_invites` for the signed-in user (Supabase Realtime; the user's own token, as
 *    ActivityProvider does, otherwise RLS evaluates with the anon key and nothing arrives)
 *  · shows the incoming call / knock ringer — accept navigates to `/live/<room>`, decline calls `respondInvite`
 *  · keeps `useLive().active` in sync (an ended room clears it)
 *  · renders the floating mini call bar / picture-in-picture so a person can keep working while in a room
 *    ("You are in <room> · Return")
 */

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { DoorOpen, LogOut, Maximize2, Mic, MicOff, MonitorUp, Phone, PhoneOff, Radio, Video as VideoIcon } from "lucide-react";
import { Avatar, Button, Modal, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { leaveRoom, respondInvite } from "@/lib/live/client";
import { ROOM_KIND_LABEL, type LiveInvite, type RoomKind } from "@/lib/live/types";
import { cn } from "@/lib/utils";
import { dismissInvite, pushInvite, setActiveRoom, setMinimized, useLive } from "./liveStore";

/** Ring for 60s — the server marks the invite `missed` at 90s. */
const RING_MS = 60_000;

export function LiveProvider() {
  const { profile } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { invites, active, minimized } = useLive();

  /* ------------------------------------------------------------ incoming invites */
  React.useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const onInvite = async (row: LiveInvite) => {
      if (row.to_user !== profile.id || row.status !== "pending") return;
      const [{ data: from }, { data: room }] = await Promise.all([
        supabase.from("profiles").select("full_name,avatar_url").eq("id", row.from_user).maybeSingle(),
        supabase.from("live_rooms").select("title,kind,status").eq("id", row.room_id).maybeSingle(),
      ]);
      if (cancelled) return;
      if (room && room.status !== "live" && room.status !== "open") return;
      pushInvite({ ...row, from_name: from?.full_name || "Someone", from_avatar: from?.avatar_url || null, room_title: room?.title || "Live room" });
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {}
      window.setTimeout(() => dismissInvite(row.id), RING_MS);
    };

    const ch = supabase
      .channel(`live-invites-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_invites", filter: `to_user=eq.${profile.id}` }, (p) => void onInvite(p.new as unknown as LiveInvite))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_invites", filter: `to_user=eq.${profile.id}` }, (p) => {
        const row = p.new as unknown as LiveInvite;
        if (row.status !== "pending") dismissInvite(row.id);
      });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      ch.subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("[live-invites]", status, err?.message);
      });
    });

    // Anything still pending when the page loads (a call placed while we were navigating).
    supabase
      .from("live_invites")
      .select("*")
      .eq("to_user", profile.id)
      .eq("status", "pending")
      .gt("created_at", new Date(Date.now() - RING_MS).toISOString())
      .then(({ data }) => {
        for (const row of (data || []) as unknown as LiveInvite[]) void onInvite(row);
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [profile.id]);

  /* ------------------------------------------------------------ keep `active` honest */
  const activeId = active?.id;
  React.useEffect(() => {
    if (!activeId) return;
    const supabase = createClient();
    let cancelled = false;
    const ch = supabase
      .channel(`live-room-watch-${activeId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_rooms", filter: `id=eq.${activeId}` }, (p) => {
        const row = p.new as { status?: string };
        if (row.status === "ended" || row.status === "archived") setActiveRoom(null);
      });
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      ch.subscribe();
    });
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [activeId]);

  const inThisRoom = !!active && pathname.startsWith(`/live/${active.id}`);
  React.useEffect(() => {
    if (inThisRoom && minimized) setMinimized(false);
  }, [inThisRoom, minimized]);

  const ringing = invites[0] || null;

  async function respond(id: string, roomId: string, status: "accepted" | "declined") {
    dismissInvite(id);
    try {
      await respondInvite(id, status);
    } catch {
      /* the ringer is best-effort — the room is what matters */
    }
    if (status === "accepted") router.push(`/live/${roomId}`);
  }

  async function hangUp() {
    if (!active) return;
    try {
      await leaveRoom(active.id);
    } catch {
      /* ignore */
    }
    setActiveRoom(null);
    toast.push("You left the room", "info");
  }

  return (
    <>
      {ringing && (
        <Modal open onClose={() => dismissInvite(ringing.id)} title={undefined} width={380}>
          <div className="flex flex-col items-center text-center py-2">
            <span className="relative">
              <Avatar name={ringing.from_name} src={ringing.from_avatar} size={72} />
              <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[var(--brand)] text-[var(--brand-fg)] flex items-center justify-center ring-2 ring-[var(--bg-elev)]">
                {ringing.kind === "knock" ? <DoorOpen size={14} /> : <Phone size={14} />}
              </span>
            </span>
            <div className="h3 mt-3">{ringing.from_name}</div>
            <div className="text-sm text-muted mt-0.5">
              {ringing.kind === "knock" ? "is knocking" : ringing.kind === "request_share" ? "wants to share their screen" : "is calling you"}
              {ringing.room_title ? ` · ${ringing.room_title}` : ""}
            </div>
            {ringing.message && <p className="text-sm mt-2 max-w-[280px]">“{ringing.message}”</p>}
            <div className="flex items-center gap-2 mt-5">
              <Button variant="danger" onClick={() => respond(ringing.id, ringing.room_id, "declined")}>
                <PhoneOff size={15} /> Decline
              </Button>
              <Button variant="success" onClick={() => respond(ringing.id, ringing.room_id, "accepted")}>
                <VideoIcon size={15} /> Join
              </Button>
            </div>
            {invites.length > 1 && <div className="text-[11px] text-muted mt-3">{invites.length - 1} more waiting</div>}
          </div>
        </Modal>
      )}

      {active && !inThisRoom && <MiniBar onReturn={() => router.push(`/live/${active.id}`)} onLeave={hangUp} />}
    </>
  );
}

/* ------------------------------------------------------------------ mini bar */
/**
 * Floating "you are still in a room" bar. Sits above the 56px mobile bottom nav and to the LEFT of the
 * Buddy FAB (which owns `right-4`), so the two never collide. z-[95] keeps it under modals (z-100+).
 */
function MiniBar({ onReturn, onLeave }: { onReturn: () => void; onLeave: () => void }) {
  const { active, pip, setPip } = useLive();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!active) return null;
  const secs = Math.max(0, Math.round((now - active.startedAt) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const kindLabel = ROOM_KIND_LABEL[active.kind as RoomKind] || "Room";

  return (
    <div
      className="fixed z-[95] left-3 right-[68px] lg:left-[calc(var(--sidebar-w)+16px)] lg:right-auto lg:w-[380px]"
      style={{ bottom: "calc(56px + 12px + env(safe-area-inset-bottom))" }}
      data-live-minibar
    >
      <div className="card px-2.5 py-2 flex items-center gap-2 min-w-0" style={{ boxShadow: "var(--shadow-lg)" }}>
        <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[var(--brand-fg)]" style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))" }}>
          <Radio size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium truncate">{active.title || kindLabel}</span>
          <span className="block text-[11px] text-muted truncate">
            <span className="num">{mm}:{ss}</span> · {active.participants || 1} in {kindLabel.toLowerCase()}
            {active.recording && <span className="text-danger"> · recording</span>}
            {active.sharing && <span className="text-warn"> · sharing</span>}
          </span>
        </span>
        <span className="hidden sm:flex items-center gap-1 shrink-0 text-muted">
          {active.micOn ? <Mic size={13} /> : <MicOff size={13} className="text-danger" />}
          {active.sharing && <MonitorUp size={13} className="text-warn" />}
        </span>
        <button
          type="button"
          onClick={() => setPip(!pip)}
          className={cn("btn btn-ghost btn-sm btn-icon hidden sm:inline-flex", pip && "bg-[var(--neutral-bg)]")}
          aria-label="Picture in picture"
          title="Picture in picture"
        >
          <Maximize2 size={14} />
        </button>
        <Button size="sm" variant="primary" onClick={onReturn}>
          Return
        </Button>
        <Button size="sm" variant="ghost" icon onClick={onLeave} aria-label="Leave the room" title="Leave">
          <LogOut size={15} className="text-danger" />
        </Button>
      </div>
    </div>
  );
}
