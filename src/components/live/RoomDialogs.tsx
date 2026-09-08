"use client";
/** Every dialog the room can raise, kept out of the canvas so `LiveRoom` stays readable. */
import * as React from "react";
import { AlertTriangle, Layers, MonitorUp } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { ROOM_KIND_LABEL, type LiveDataMessage, type LiveRoom as LiveRoomRow, type RoomKind } from "@/lib/live/types";
import { DevicePicker } from "./DevicePicker";
import { InviteSheet } from "./InviteSheet";
import { HostControls } from "./HostControls";
import { Breakouts } from "./Breakouts";
import { TaskModal } from "./RoomNotes";
import type { WaitingPerson } from "./ParticipantsRail";
import type { LiveKitApi, PeerView } from "./useLiveKit";

export type RoomDialogsProps = {
  lk: LiveKitApi;
  roomId?: string;
  room: LiveRoomRow | null;
  guest?: boolean;
  isHost: boolean;
  title: string;
  kind: RoomKind;
  confidential: boolean;
  guestsAllowed: boolean;
  peers: PeerView[];
  waiting: WaitingPerson[];
  hasBreakouts: boolean;
  captureLabel: string;
  attachment: { path: string; name: string; type: string; size?: number } | null;
  open: {
    devices: boolean;
    invite: boolean;
    host: boolean;
    breakouts: boolean;
    task: boolean;
    shareWarn: boolean;
    endConfirm: boolean;
    move: { id: string; title: string } | null;
  };
  set: {
    devices: (v: boolean) => void;
    invite: (v: boolean) => void;
    host: (v: boolean) => void;
    breakouts: (v: boolean) => void;
    task: (v: boolean) => void;
    shareWarn: (v: boolean) => void;
    endConfirm: (v: boolean) => void;
    move: (v: { id: string; title: string } | null) => void;
  };
  onRefresh: () => void;
  onStartShare: () => void;
  onEndForAll: () => void;
  onJoinBreakout: (id: string) => void;
  send: (m: LiveDataMessage) => void;
};

export function RoomDialogs(p: RoomDialogsProps) {
  const { lk, roomId, room, guest, isHost, title, kind, open, set } = p;

  return (
    <>
      <DevicePicker
        open={open.devices}
        onClose={() => set.devices(false)}
        devices={lk.devices}
        onSwitch={lk.switchDevice}
        onRefresh={() => void lk.refreshDevices()}
        bandwidth={lk.bandwidth}
        onBandwidth={lk.applyBandwidth}
        blurOn={lk.blurOn}
        onBlur={lk.toggleBlur}
      />

      {!guest && roomId && (
        <InviteSheet
          open={open.invite}
          onClose={() => set.invite(false)}
          roomId={roomId}
          roomTitle={title}
          confidential={p.confidential}
          guestsAllowed={p.guestsAllowed}
          context={`It is a ${ROOM_KIND_LABEL[kind] || "room"} with ${p.peers.length} ${p.peers.length === 1 ? "person" : "people"} in it.`}
        />
      )}

      {!guest && roomId && room && isHost && (
        <HostControls
          open={open.host}
          onClose={() => set.host(false)}
          room={room}
          waiting={p.waiting}
          onRefresh={p.onRefresh}
          onEnd={() => {
            set.host(false);
            set.endConfirm(true);
          }}
        />
      )}

      {!guest && roomId && isHost && (
        <Breakouts open={open.breakouts} onClose={() => set.breakouts(false)} roomId={roomId} peers={p.peers} send={p.send} hasBreakouts={p.hasBreakouts} onChanged={p.onRefresh} />
      )}

      {!guest && roomId && (
        <TaskModal open={open.task} onClose={() => set.task(false)} roomId={roomId} attachment={p.attachment} label={p.captureLabel} />
      )}

      <Modal
        open={open.shareWarn}
        onClose={() => set.shareWarn(false)}
        title="Before you share"
        width={460}
        footer={
          <>
            <Button size="sm" onClick={() => set.shareWarn(false)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={p.onStartShare}><MonitorUp size={14} /> Choose what to share</Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-[var(--radius)] tone-warn flex items-center justify-center shrink-0"><AlertTriangle size={18} /></span>
          <div className="text-sm text-2">
            <p>If you share your <strong>entire screen</strong>, everyone here will see your notifications, other windows and anything that pops up.</p>
            <p className="mt-2 text-muted">Share a single window or tab instead, unless you really need the whole screen.</p>
          </div>
        </div>
      </Modal>

      <Modal
        open={open.endConfirm}
        onClose={() => set.endConfirm(false)}
        title="End the meeting for everyone?"
        width={420}
        footer={
          <>
            <Button size="sm" onClick={() => set.endConfirm(false)}>Keep going</Button>
            <Button size="sm" variant="danger" onClick={p.onEndForAll}>End for all</Button>
          </>
        }
      >
        <p className="text-sm text-muted">Everyone is disconnected, a summary goes to the linked channel and the room moves into history. Notes, decisions and tasks are kept.</p>
      </Modal>

      <Modal
        open={!!open.move}
        onClose={() => set.move(null)}
        title="Move to your breakout"
        width={420}
        footer={
          <>
            <Button size="sm" onClick={() => set.move(null)}>Stay here</Button>
            <Button size="sm" variant="primary" onClick={() => open.move && p.onJoinBreakout(open.move.id)}>
              <Layers size={14} /> Join {open.move?.title}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          The host has opened breakout rooms and you are in <strong>{open.move?.title}</strong>. Everything written here is saved before you move.
        </p>
      </Modal>
    </>
  );
}
