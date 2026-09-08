"use client";
/**
 * Right panel (§200): Chat · Notes · Files · AI · Q&A — and People on small screens,
 * where the whole panel becomes a bottom sheet that clears the 56px mobile nav.
 */
import * as React from "react";
import { BarChart3, FileText, MessageSquare, NotebookPen, Sparkles, Users, X } from "lucide-react";
import { Button, EmptyState, Tabs } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { LiveDataMessage } from "@/lib/live/types";
import { RoomChat } from "./RoomChat";
import { RoomNotes } from "./RoomNotes";
import { PollsQA } from "./PollsQA";
import { RoomAI } from "./RoomAI";
import { ParticipantsRail, type RailActions, type WaitingPerson } from "./ParticipantsRail";
import type { PeerView } from "./useLiveKit";

export type PanelTab = "chat" | "notes" | "files" | "ai" | "qa" | "people";

export function RoomPanel({
  tab,
  onTab,
  roomId,
  orgId,
  roomTitle,
  meId,
  meName,
  isHost,
  peers,
  hands,
  waiting,
  pinned,
  actions,
  onAdd,
  onAdmit,
  send,
  incomingNotes,
  onClose,
  className,
  mobile,
}: {
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  roomId: string;
  orgId: string;
  roomTitle: string;
  meId: string;
  meName: string;
  isHost: boolean;
  peers: PeerView[];
  hands: Set<string>;
  waiting: WaitingPerson[];
  pinned: string | null;
  actions: RailActions;
  onAdd: () => void;
  onAdmit: (userId: string, admit: boolean) => void;
  send: (m: LiveDataMessage) => void;
  incomingNotes: { body: string; version: number } | null;
  onClose?: () => void;
  className?: string;
  mobile?: boolean;
}) {
  const tabs: { key: PanelTab; label: React.ReactNode; count?: number }[] = [
    { key: "chat", label: <span className="inline-flex items-center gap-1"><MessageSquare size={13} /> Chat</span> },
    { key: "notes", label: <span className="inline-flex items-center gap-1"><NotebookPen size={13} /> Notes</span> },
    { key: "qa", label: <span className="inline-flex items-center gap-1"><BarChart3 size={13} /> Q&A</span> },
    { key: "ai", label: <span className="inline-flex items-center gap-1"><Sparkles size={13} /> AI</span> },
    { key: "files", label: <span className="inline-flex items-center gap-1"><FileText size={13} /> Files</span> },
  ];
  if (mobile) tabs.unshift({ key: "people", label: <span className="inline-flex items-center gap-1"><Users size={13} /> People</span>, count: peers.length });

  return (
    <div className={cn("flex flex-col min-h-0 bg-[var(--bg-elev)]", className)}>
      <div className="flex items-center border-b shrink-0">
        <Tabs className="flex-1 min-w-0 border-b-0 px-1" tabs={tabs} value={tab} onChange={onTab} />
        {onClose && (
          <Button size="sm" icon variant="ghost" onClick={onClose} aria-label="Close panel"><X size={16} /></Button>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {tab === "chat" && <RoomChat roomId={roomId} orgId={orgId} meId={meId} meName={meName} />}
        {tab === "notes" && <RoomNotes roomId={roomId} orgId={orgId} meId={meId} send={send} incoming={incomingNotes} />}
        {tab === "qa" && <PollsQA roomId={roomId} orgId={orgId} meId={meId} isHost={isHost} />}
        {tab === "ai" && <RoomAI roomId={roomId} roomTitle={roomTitle} isHost={isHost} />}
        {tab === "files" && <RoomFiles roomId={roomId} />}
        {tab === "people" && (
          <ParticipantsRail peers={peers} hands={hands} waiting={waiting} isHost={isHost} pinned={pinned} onAdd={onAdd} onAdmit={onAdmit} actions={actions} className="h-full border-r-0" compact />
        )}
      </div>
    </div>
  );
}

/** Files shared with this room — recordings, captures and board assets all live in the `live` bucket. */
function RoomFiles({ roomId }: { roomId: string }) {
  return (
    <EmptyState
      icon={<FileText size={18} />}
      title="Files from this room"
      hint="Screenshots you turn into tasks and recordings made here are attached to the task or the recording itself, so they stay with the work."
      action={
        <Button size="sm" onClick={() => window.open(`/live/${roomId}`, "_self")}>Open room history</Button>
      }
      className="h-full"
    />
  );
}
