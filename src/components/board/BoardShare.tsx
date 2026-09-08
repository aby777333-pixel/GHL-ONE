"use client";
/** Who can open this board, and the facilitator lock. Changes are written to `board_access_log`. */
import * as React from "react";
import { Copy, Link2, Lock, ShieldCheck, Unlock, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Field, Input, Modal, Select, useToast } from "@/components/ui";
import { DepartmentPicker, ProjectPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { isManagerPlus } from "@/lib/utils";
import type { BoardVisibility } from "@/lib/live/types";
import type { BoardRow } from "./useBoardDoc";

const VISIBILITY: { key: BoardVisibility; label: string; hint: string }[] = [
  { key: "private", label: "Private", hint: "Only you and the people you add." },
  { key: "members", label: "Members", hint: "Anyone you add, plus the linked project or room." },
  { key: "department", label: "Department", hint: "Everyone in the linked department." },
  { key: "company", label: "Company", hint: "Everyone in GHL ONE can open it." },
];

export function BoardShare({
  open, onClose, board, onChange,
}: {
  open: boolean;
  onClose: () => void;
  board: BoardRow;
  onChange: (patch: Partial<BoardRow>) => void;
}) {
  const { profile, people } = useSession();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [title, setTitle] = React.useState(board.title);
  const [add, setAdd] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setTitle(board.title), 0);
    return () => clearTimeout(t);
  }, [board.title]);

  const isOwner = board.owner_id === profile.id || isManagerPlus(profile.role);
  const members = (board.member_ids || []).map((id) => people.find((p) => p.id === id)).filter(Boolean) as typeof people;

  async function patch(p: Partial<BoardRow>, action: string, details: Record<string, unknown> = {}) {
    setBusy(true);
    const sb = createClient();
    const { error } = await sb.from("boards").update(p as never).eq("id", board.id);
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    onChange(p);
    await sb.from("board_access_log").insert({ board_id: board.id, actor_id: profile.id, action, details: details as never });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share this board"
      side
      width={430}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-[var(--s3)]">
        <Field label="Board name">
          <div className="flex gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!isOwner} />
            <Button onClick={() => patch({ title: title.trim() || board.title }, "renamed", { title })} disabled={!isOwner || title.trim() === board.title} loading={busy}>Save</Button>
          </div>
        </Field>

        <Field label="Who can open it" hint={VISIBILITY.find((v) => v.key === board.visibility)?.hint}>
          <Select
            value={board.visibility}
            disabled={!isOwner}
            onChange={(e) => patch({ visibility: e.target.value }, "visibility_changed", { from: board.visibility, to: e.target.value })}
          >
            {VISIBILITY.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </Select>
        </Field>

        {board.visibility === "department" && (
          <Field label="Department">
            <DepartmentPicker value={board.department_id} onChange={(v) => patch({ department_id: v || null }, "visibility_changed", { department_id: v })} />
          </Field>
        )}

        <Field label="Linked project" hint="Members of the project can open the board, and “turn into a project” updates it.">
          <ProjectPicker value={board.project_id} onChange={(v) => patch({ project_id: v || null }, "linked", { project_id: v })} />
        </Field>

        <div>
          <span className="label">People with access</span>
          <div className="space-y-1.5">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] border px-2 py-1.5">
                <Avatar name={m.full_name} src={m.avatar_url} size={26} />
                <span className="text-sm flex-1 min-w-0 truncate">{m.full_name}</span>
                {isOwner && (
                  <button
                    type="button"
                    aria-label={`Remove ${m.full_name}`}
                    className="text-muted hover:text-danger"
                    onClick={() => patch({ member_ids: (board.member_ids || []).filter((x) => x !== m.id) }, "member_removed", { user_id: m.id })}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            {!members.length && <div className="text-xs text-muted">Nobody added yet.</div>}
          </div>
          {isOwner && (
            <div className="flex gap-2 mt-2">
              <Select value={add} onChange={(e) => setAdd(e.target.value)} className="flex-1">
                <option value="">Add someone…</option>
                {people.filter((p) => p.id !== profile.id && !(board.member_ids || []).includes(p.id)).map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </Select>
              <Button
                onClick={() => { if (add) { void patch({ member_ids: [...(board.member_ids || []), add] }, "member_added", { user_id: add }); setAdd(""); } }}
                disabled={!add}
              >
                <UserPlus size={14} /> Add
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-[var(--radius-sm)] border p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={15} className="text-muted" /> Facilitator</div>
          <p className="text-xs text-muted">Locking the board stops everyone except the owner and managers from editing. Useful while you present or after a workshop ends.</p>
          <Button
            variant={board.locked ? "secondary" : "danger"}
            size="sm"
            disabled={!isOwner}
            loading={busy}
            onClick={() => patch({ locked: !board.locked }, board.locked ? "unlocked" : "locked")}
          >
            {board.locked ? <><Unlock size={14} /> Unlock the board</> : <><Lock size={14} /> Lock the board</>}
          </Button>
        </div>

        <Button
          className="w-full"
          onClick={() => {
            navigator.clipboard?.writeText(`${window.location.origin}/boards/${board.id}`).then(
              () => toast.push("Link copied", "success"),
              () => toast.push("Could not copy the link", "danger")
            );
          }}
        >
          <Link2 size={14} /> Copy board link <Copy size={13} className="text-muted" />
        </Button>
      </div>
    </Modal>
  );
}
