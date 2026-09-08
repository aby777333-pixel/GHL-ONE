"use client";
/** Snapshots and version history: list `board_versions`, preview one, restore it. */
import * as React from "react";
import { Camera, History, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { boardRestore, boardSnapshot } from "@/lib/live/client";
import { Button, EmptyState, Modal, Spinner, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, fmtDate, type Tables } from "@/lib/utils";
import { asDoc } from "./useBoardDoc";
import { readPalette, renderToCanvas } from "./boardDraw";

type Version = Pick<Tables<"board_versions">, "id" | "version" | "label" | "created_at" | "created_by"> & { doc?: unknown };

function VersionPreview({ doc }: { doc: unknown }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.replaceChildren();
    const d = asDoc(doc);
    const els = d.pages[0]?.elements ?? [];
    if (!els.length) return;
    const canvas = renderToCanvas(els, readPalette(), d.background || "dots", new Map(), 1, 32);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.borderRadius = "8px";
    host.appendChild(canvas);
  }, [doc]);
  return <div ref={ref} className="sunken rounded-[var(--radius-sm)] border overflow-hidden min-h-[120px] flex items-center justify-center text-xs text-muted" />;
}

export function BoardVersions({ open, onClose, boardId, canEdit, onRestored }: { open: boolean; onClose: () => void; boardId: string; canEdit: boolean; onRestored: () => void }) {
  const { people } = useSession();
  const toast = useToast();
  const [rows, setRows] = React.useState<Version[] | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const { data } = await createClient()
      .from("board_versions")
      .select("id,version,label,created_at,created_by,doc")
      .eq("board_id", boardId)
      .order("version", { ascending: false })
      .limit(60);
    setRows((data as Version[]) || []);
  }, [boardId]);

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [open, load]);

  async function snapshot() {
    setBusy(true);
    try {
      const label = window.prompt("Name this snapshot (optional)", "") || undefined;
      await boardSnapshot(boardId, label);
      toast.push("Snapshot saved", "success");
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not snapshot", "danger");
    } finally {
      setBusy(false);
    }
  }

  async function restore(v: Version) {
    if (!window.confirm(`Restore version ${v.version}? The current board is snapshotted first.`)) return;
    setBusy(true);
    try {
      await boardRestore(boardId, v.id);
      toast.push("Restored", "success");
      onRestored();
      await load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not restore", "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Versions"
      side
      width={440}
      footer={canEdit ? <Button variant="primary" onClick={snapshot} loading={busy}><Camera size={14} /> Snapshot now</Button> : undefined}
    >
      {!rows ? (
        <div className="py-8 flex justify-center"><Spinner /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<History size={18} />} title="No snapshots yet" hint="Take a snapshot before a big change so you can always come back to it." />
      ) : (
        <div className="space-y-2">
          {rows.map((v) => (
            <div key={v.id} className={cn("rounded-[var(--radius-sm)] border p-2.5", selected === v.id && "border-[var(--brand)]")}>
              <button type="button" className="w-full text-left" onClick={() => setSelected(selected === v.id ? null : v.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{v.label || `Version ${v.version}`}</span>
                  <span className="text-[11px] text-muted whitespace-nowrap">{fmtDate(v.created_at, true)}</span>
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  v{v.version} · {people.find((p) => p.id === v.created_by)?.full_name || "Someone"}
                </div>
              </button>
              {selected === v.id && (
                <div className="mt-2 space-y-2">
                  <VersionPreview doc={v.doc} />
                  {canEdit && (
                    <Button size="sm" onClick={() => restore(v)} loading={busy}><RotateCcw size={13} /> Restore this version</Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
