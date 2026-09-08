"use client";
/**
 * Breakout rooms (§95–§98). The host splits the room manually, at random or by department;
 * each breakout gets its own notes doc (created by `create_breakouts`). Participants are
 * nudged over the data channel and can walk back with "Bring everyone back".
 */
import * as React from "react";
import { ArrowLeftRight, Layers, Shuffle, Users } from "lucide-react";
import { Button, Field, Input, Modal, Pill, Select, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createBreakouts, endBreakouts } from "@/lib/live/client";
import type { LiveDataMessage } from "@/lib/live/types";
import type { PeerView } from "./useLiveKit";

type Group = { title: string; user_ids: string[] };

/** Stable string hash — deals the random split without an impure call during render. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function Breakouts({
  open,
  onClose,
  roomId,
  peers,
  send,
  hasBreakouts,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
  peers: PeerView[];
  send: (m: LiveDataMessage) => void;
  hasBreakouts: boolean;
  onChanged: () => void;
}) {
  const { people, departments } = useSession();
  const toast = useToast();
  const [count, setCount] = React.useState(2);
  const [mode, setMode] = React.useState<"random" | "department" | "manual">("random");
  const [busy, setBusy] = React.useState(false);
  /** Manual edits win over the automatic split until "Rebuild groups" is pressed. */
  const [edited, setEdited] = React.useState<Group[] | null>(null);
  const [shuffle, setShuffle] = React.useState(0);

  const members = React.useMemo(() => peers.filter((p) => !p.guest).map((p) => p.identity), [peers]);

  const auto = React.useMemo<Group[]>(() => {
    if (mode === "department") {
      const byDept = new Map<string, string[]>();
      for (const id of members) {
        const d = people.find((p) => p.id === id)?.department_id || "none";
        byDept.set(d, [...(byDept.get(d) || []), id]);
      }
      return [...byDept.entries()].map(([d, ids]) => ({ title: departments.find((x) => x.id === d)?.name || "No department", user_ids: ids }));
    }
    const g: Group[] = Array.from({ length: Math.max(2, count) }, (_, i) => ({ title: `Breakout ${i + 1}`, user_ids: [] }));
    if (mode === "random") {
      // Deterministic for a given `shuffle` seed, so re-rendering never re-deals the groups.
      const shuffled = [...members].sort((a, b) => hash(a + shuffle) - hash(b + shuffle));
      shuffled.forEach((id, i) => g[i % g.length].user_ids.push(id));
    }
    return g;
  }, [mode, count, members, people, departments, shuffle]);

  const groups = edited ?? auto;
  const setGroups = (fn: (g: Group[]) => Group[]) => setEdited(fn(groups));
  const build = () => {
    setEdited(null);
    setShuffle((n) => n + 1);
  };

  const nameOf = (id: string) => peers.find((p) => p.identity === id)?.name || people.find((p) => p.id === id)?.full_name || "Someone";

  async function start() {
    const clean = groups.filter((g) => g.user_ids.length);
    if (!clean.length) return toast.push("Put at least one person in a breakout", "danger");
    setBusy(true);
    try {
      const ids = await createBreakouts(roomId, clean);
      // One nudge carrying the parent room id — every client then looks up the breakout it was put in.
      send({ t: "move_to", roomId });
      toast.push(`${ids.length} breakout ${ids.length === 1 ? "room" : "rooms"} opened`, "success");
      onChanged();
      onClose();
    } catch (e) {
      toast.push((e as Error).message, "danger");
    }
    setBusy(false);
  }

  async function bringBack() {
    setBusy(true);
    try {
      await endBreakouts(roomId);
      send({ t: "move_to", roomId });
      toast.push("Everyone is coming back", "success");
      onChanged();
      onClose();
    } catch (e) {
      toast.push((e as Error).message, "danger");
    }
    setBusy(false);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Breakout rooms"
      width={560}
      footer={
        <>
          {hasBreakouts && <Button size="sm" onClick={() => void bringBack()} loading={busy}><ArrowLeftRight size={14} /> Bring everyone back</Button>}
          <Button size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" loading={busy} onClick={() => void start()}><Layers size={14} /> Open breakouts</Button>
        </>
      }
    >
      <div className="space-y-[var(--s3)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Split">
            <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="random">Randomly</option>
              <option value="department">By department</option>
              <option value="manual">Manually</option>
            </Select>
          </Field>
          {mode !== "department" && (
            <Field label="How many rooms">
              <Input type="number" min={2} max={10} value={count} onChange={(e) => setCount(Math.max(2, Math.min(10, Number(e.target.value) || 2)))} />
            </Field>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="xs" onClick={build}><Shuffle size={12} /> Rebuild groups</Button>
          <span className="text-[11px] text-muted">{members.length} {members.length === 1 ? "person" : "people"} in the room · guests stay behind</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {groups.map((g, gi) => (
            <div key={gi} className="card p-2.5">
              <Input
                value={g.title}
                onChange={(e) => setGroups((s) => s.map((x, i) => (i === gi ? { ...x, title: e.target.value } : x)))}
                className="mb-2 h-8 text-sm"
              />
              <div className="space-y-1">
                {g.user_ids.map((id) => (
                  <div key={id} className="flex items-center gap-1.5 text-xs">
                    <Users size={11} className="text-muted" />
                    <span className="truncate flex-1 min-w-0">{nameOf(id)}</span>
                    {mode === "manual" && (
                      <button type="button" className="text-muted hover:text-danger" onClick={() => setGroups((s) => s.map((x, i) => (i === gi ? { ...x, user_ids: x.user_ids.filter((u) => u !== id) } : x)))}>×</button>
                    )}
                  </div>
                ))}
                {!g.user_ids.length && <div className="text-[11px] text-muted">Empty</div>}
              </div>
              {mode === "manual" && (
                <Select
                  className="mt-2 h-8 text-xs"
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    setGroups((s) => s.map((x, i) => (i === gi ? { ...x, user_ids: [...new Set([...x.user_ids, id])] } : { ...x, user_ids: x.user_ids.filter((u) => u !== id) })));
                  }}
                >
                  <option value="">Add someone…</option>
                  {members.map((id) => (
                    <option key={id} value={id}>{nameOf(id)}</option>
                  ))}
                </Select>
              )}
            </div>
          ))}
        </div>

        {hasBreakouts && <Pill tone="tone-info">Breakouts are already running for this room.</Pill>}
      </div>
    </Modal>
  );
}
