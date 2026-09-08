"use client";
/** Left rail (§200): who is here, who is waiting, hands up, and the host's per-person actions. */
import * as React from "react";
import { Hand, MicOff, MonitorUp, MoreHorizontal, Pin, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Avatar, Button, Menu, MenuItem, Pill, SearchInput } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { PeerView } from "./useLiveKit";
import { QualityDot } from "./QualityBadge";

export type WaitingPerson = { user_id: string; name: string; avatar: string | null };

export type RailActions = {
  onPin: (identity: string) => void;
  onMute?: (identity: string) => void;
  onRemove?: (identity: string) => void;
  onRole?: (identity: string, role: "cohost" | "presenter" | "participant") => void;
  onTransferHost?: (identity: string) => void;
  onLowerHand?: (identity: string) => void;
  onRequestShare?: (identity: string) => void;
  onStopShare?: (identity: string) => void;
};

export function ParticipantsRail({
  peers,
  hands,
  waiting,
  isHost,
  pinned,
  onAdd,
  onAdmit,
  actions,
  className,
  compact,
}: {
  peers: PeerView[];
  hands: Set<string>;
  waiting: WaitingPerson[];
  isHost: boolean;
  pinned: string | null;
  onAdd?: () => void;
  onAdmit?: (userId: string, admit: boolean) => void;
  actions: RailActions;
  className?: string;
  compact?: boolean;
}) {
  const [q, setQ] = React.useState("");
  const list = React.useMemo(() => {
    const f = q.trim().toLowerCase();
    const arr = f ? peers.filter((p) => p.name.toLowerCase().includes(f)) : peers;
    return [...arr].sort((a, b) => Number(hands.has(b.identity)) - Number(hands.has(a.identity)) || Number(b.sharing) - Number(a.sharing) || a.name.localeCompare(b.name));
  }, [peers, q, hands]);

  return (
    <div className={cn("flex flex-col min-h-0 border-r bg-[var(--bg-elev)]", className)}>
      <div className="flex items-center gap-2 px-3 h-11 border-b shrink-0">
        <Users size={15} className="text-muted" />
        <span className="text-sm font-medium">People</span>
        <Pill tone="tone-neutral" className="ml-1">{peers.length}</Pill>
        {onAdd && (
          <Button size="xs" icon variant="ghost" className="ml-auto" onClick={onAdd} aria-label="Add people" title="Add people">
            <UserPlus size={14} />
          </Button>
        )}
      </div>

      {isHost && waiting.length > 0 && (
        <div className="px-2 py-2 border-b bg-[var(--warn-bg)]/40">
          <div className="eyebrow mb-1.5 px-1">Waiting room · {waiting.length}</div>
          <div className="space-y-1">
            {waiting.map((w) => (
              <div key={w.user_id} className="flex items-center gap-2 px-1">
                <Avatar name={w.name} src={w.avatar} size={24} />
                <span className="text-xs truncate flex-1 min-w-0">{w.name}</span>
                <Button size="xs" variant="primary" onClick={() => onAdmit?.(w.user_id, true)}>Admit</Button>
                <Button size="xs" variant="ghost" onClick={() => onAdmit?.(w.user_id, false)}>Deny</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {peers.length > 6 && (
        <div className="px-2 py-2 shrink-0">
          <SearchInput placeholder="Find someone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-2 space-y-0.5">
        {list.map((p) => (
          <div
            key={p.identity}
            className={cn(
              "group flex items-center gap-2 px-1.5 py-1.5 rounded-[var(--radius-sm)] min-w-0",
              p.speaking ? "bg-[var(--success-bg)]" : "hover:bg-[var(--neutral-bg)]",
              pinned === p.identity && "ring-1 ring-[var(--brand-2)]"
            )}
          >
            <Avatar name={p.name} src={p.avatar} size={compact ? 24 : 28} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium truncate flex items-center gap-1">
                {p.name}
                {p.isLocal && <span className="text-muted font-normal">(you)</span>}
                {hands.has(p.identity) && <Hand size={12} className="text-[var(--warn)]" />}
              </div>
              <div className="text-[11px] text-muted truncate flex items-center gap-1">
                {p.guest ? <span className="pill tone-warn text-[10px]">External Guest</span> : p.role === "host" ? <span className="inline-flex items-center gap-0.5"><ShieldCheck size={10} /> Host</span> : p.role === "cohost" ? "Co-host" : p.role === "presenter" ? "Presenter" : p.designation || ""}
              </div>
            </div>
            <span className="flex items-center gap-1 shrink-0">
              {p.sharing && <MonitorUp size={12} className="text-[var(--info)]" />}
              {!p.micOn && <MicOff size={12} className="text-muted" />}
              <QualityDot level={p.quality} />
              <Menu
                width={210}
                trigger={
                  <button type="button" className="w-6 h-6 rounded-full inline-flex items-center justify-center text-muted opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Options for ${p.name}`}>
                    <MoreHorizontal size={14} />
                  </button>
                }
              >
                <MenuItem icon={<Pin size={13} />} onClick={() => actions.onPin(p.identity)}>{pinned === p.identity ? "Unpin" : "Pin to stage"}</MenuItem>
                {!p.isLocal && !p.sharing && actions.onRequestShare && <MenuItem icon={<MonitorUp size={13} />} onClick={() => actions.onRequestShare?.(p.identity)}>Ask to share screen</MenuItem>}
                {isHost && !p.isLocal && (
                  <>
                    {p.micOn && <MenuItem icon={<MicOff size={13} />} onClick={() => actions.onMute?.(p.identity)}>Mute</MenuItem>}
                    {p.sharing && <MenuItem onClick={() => actions.onStopShare?.(p.identity)}>Stop their share</MenuItem>}
                    {hands.has(p.identity) && <MenuItem onClick={() => actions.onLowerHand?.(p.identity)}>Lower hand</MenuItem>}
                    {!p.guest && p.role !== "cohost" && <MenuItem onClick={() => actions.onRole?.(p.identity, "cohost")}>Make co-host</MenuItem>}
                    {!p.guest && p.role !== "presenter" && <MenuItem onClick={() => actions.onRole?.(p.identity, "presenter")}>Make presenter</MenuItem>}
                    {!p.guest && (p.role === "cohost" || p.role === "presenter") && <MenuItem onClick={() => actions.onRole?.(p.identity, "participant")}>Reset to participant</MenuItem>}
                    {!p.guest && <MenuItem onClick={() => actions.onTransferHost?.(p.identity)}>Transfer host</MenuItem>}
                    <MenuItem danger onClick={() => actions.onRemove?.(p.identity)}>Remove from room</MenuItem>
                  </>
                )}
              </Menu>
            </span>
          </div>
        ))}
        {list.length === 0 && <div className="text-xs text-muted px-2 py-4 text-center">Nobody matches “{q}”.</div>}
      </div>
    </div>
  );
}
