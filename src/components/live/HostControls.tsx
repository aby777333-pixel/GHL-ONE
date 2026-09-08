"use client";
/** Host / co-host tools (§12, §13, §99, §100). Everything goes through `moderate()` — the RPC enforces "host only" and writes the audit trail. */
import * as React from "react";
import { DoorClosed, EyeOff, Lock, LogOut, ShieldAlert, Unlock, UserCheck } from "lucide-react";
import { Avatar, Button, Modal, useToast } from "@/components/ui";
import { moderate } from "@/lib/live/client";
import type { LiveRoom } from "@/lib/live/types";
import type { WaitingPerson } from "./ParticipantsRail";

function Toggle({ label, hint, on, onChange, icon, disabled }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; icon?: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="w-full flex items-start gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2.5 text-left hover:bg-[var(--neutral-bg)] disabled:opacity-50"
    >
      <span className="text-muted mt-0.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
      </span>
      <span className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${on ? "bg-[var(--brand)]" : "bg-[var(--line-strong)]"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export function HostControls({
  open,
  onClose,
  room,
  waiting,
  onRefresh,
  onEnd,
}: {
  open: boolean;
  onClose: () => void;
  room: LiveRoom;
  waiting: WaitingPerson[];
  onRefresh: () => void;
  onEnd: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  async function act(action: string, value?: string, userId?: string) {
    setBusy(true);
    try {
      await moderate(room.id, action, userId, value);
      onRefresh();
    } catch (e) {
      toast.push((e as Error).message, "danger");
    }
    setBusy(false);
  }

  const s = room.settings || {};

  return (
    <Modal open={open} onClose={onClose} title="Host controls" width={480} side>
      <div className="space-y-[var(--s3)]">
        {waiting.length > 0 && (
          <div>
            <div className="eyebrow mb-2">Waiting room · {waiting.length}</div>
            <div className="space-y-1.5">
              {waiting.map((w) => (
                <div key={w.user_id} className="flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-2">
                  <Avatar name={w.name} src={w.avatar} size={26} />
                  <span className="text-sm truncate flex-1 min-w-0">{w.name}</span>
                  <Button size="xs" variant="primary" loading={busy} onClick={() => void act("admit", undefined, w.user_id)}><UserCheck size={12} /> Admit</Button>
                  <Button size="xs" variant="ghost" loading={busy} onClick={() => void act("remove", undefined, w.user_id)}>Deny</Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Toggle label="Lock the room" hint="Nobody new can join, even with a link." icon={room.locked ? <Lock size={15} /> : <Unlock size={15} />} on={room.locked} onChange={(v) => void act("lock", String(v))} disabled={busy} />
          <Toggle label="Waiting room" hint="You admit each person before they can see or hear anything." icon={<DoorClosed size={15} />} on={room.waiting_room} onChange={(v) => void act("waiting_room", String(v))} disabled={busy} />
          <Toggle label="Confidential" hint="No recording, no guest links, watermark on the stage." icon={<EyeOff size={15} />} on={room.confidential} onChange={(v) => void act("confidential", String(v))} disabled={busy} />
        </div>

        <div>
          <div className="eyebrow mb-2">What participants may do</div>
          <div className="space-y-1.5">
            <Toggle label="Share their screen" on={s.allow_screen_share !== false} onChange={(v) => void act("setting", `allow_screen_share=${v}`)} disabled={busy} />
            <Toggle label="Record" on={s.allow_recording !== false && !room.confidential} onChange={(v) => void act("setting", `allow_recording=${v}`)} disabled={busy || room.confidential} />
            <Toggle label="Use the whiteboard" on={s.allow_whiteboard !== false} onChange={(v) => void act("setting", `allow_whiteboard=${v}`)} disabled={busy} />
            <Toggle label="Presenters only speak" hint="Town-hall mode: only the host, co-hosts and presenters publish." on={!!s.presenter_only} onChange={(v) => void act("setting", `presenter_only=${v}`)} disabled={busy} />
          </div>
        </div>

        <div className="rounded-[var(--radius-sm)] border border-[var(--danger)] p-3">
          <div className="text-sm font-medium flex items-center gap-1.5"><ShieldAlert size={14} className="text-danger" /> End for everyone</div>
          <p className="text-[11px] text-muted mt-1">Closes the room, posts a summary to the linked channel and returns everyone&apos;s presence to normal.</p>
          <Button variant="danger" size="sm" className="mt-2" onClick={onEnd}><LogOut size={14} /> End the meeting</Button>
        </div>
      </div>
    </Modal>
  );
}
