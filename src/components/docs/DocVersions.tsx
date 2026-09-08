"use client";

/**
 * Version history for a live document: `live_doc_versions` + `live_doc_snapshot()`.
 * Restoring writes the old body back as a new version (the current text is snapshotted first,
 * so restore is never destructive).
 */

import * as React from "react";
import { History, RotateCcw, Save } from "lucide-react";
import { Button, EmptyState, Spinner, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { docSnapshot } from "@/lib/live/client";
import { ago, cn, fmtDate } from "@/lib/utils";
import { mdToText } from "./useLiveDoc";

export type DocVersion = { id: string; version: number; body: string; label: string | null; created_by: string | null; created_at: string };

/** Plain fetch helper — kept outside the component so the mount effect can set state from the promise callback. */
async function fetchVersions(docId: string) {
  const { data } = await createClient().from("live_doc_versions").select("*").eq("doc_id", docId).order("version", { ascending: false }).limit(50);
  return (data || []) as unknown as DocVersion[];
}

export function DocVersions({ docId, currentVersion, canEdit, onBeforeSnapshot, onRestore }: {
  docId: string;
  currentVersion: number;
  canEdit: boolean;
  /** Flush pending edits so the snapshot captures what is on screen. */
  onBeforeSnapshot: () => Promise<void>;
  onRestore: (body: string, version: number) => void;
}) {
  const { people } = useSession();
  const toast = useToast();
  const [rows, setRows] = React.useState<DocVersion[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setRows(await fetchVersions(docId));
  }, [docId]);

  React.useEffect(() => {
    let alive = true;
    void fetchVersions(docId).then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, [docId]);

  async function snapshot() {
    setBusy("snapshot");
    try {
      await onBeforeSnapshot();
      await docSnapshot(docId, `Saved by hand`);
      await load();
      toast.push("Version saved", "success");
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not save a version", "danger");
    } finally {
      setBusy(null);
    }
  }

  async function restore(v: DocVersion) {
    if (!window.confirm(`Restore version ${v.version}? The current text is saved as a version first.`)) return;
    setBusy(v.id);
    try {
      await onBeforeSnapshot();
      await docSnapshot(docId, "Before restore");
      const next = currentVersion + 2;
      const { error } = await createClient().from("live_docs").update({ body: v.body, version: next }).eq("id", docId);
      if (error) throw new Error(error.message);
      onRestore(v.body, next);
      await load();
      toast.push(`Restored version ${v.version}`, "success");
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not restore", "danger");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="eyebrow inline-flex items-center gap-1.5"><History size={12} /> Version history</span>
        {canEdit && (
          <Button size="xs" variant="secondary" className="ml-auto" loading={busy === "snapshot"} onClick={snapshot}>
            <Save size={12} /> Save version
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
        {rows === null ? (
          <div className="flex items-center gap-2 text-sm text-muted py-3"><Spinner /> Loading…</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<History size={16} />} title="No saved versions" hint="Save a version before a big rewrite — you can always come back." className="py-[var(--s4)]" />
        ) : (
          rows.map((v) => (
            <div key={v.id} className="card p-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="pill tone-neutral shrink-0 num">v{v.version}</span>
                <span className="text-xs truncate min-w-0 flex-1">{v.label || "Autosaved"}</span>
                <span className="text-[11px] text-muted shrink-0" title={fmtDate(v.created_at, true)}>{ago(v.created_at)}</span>
              </div>
              <div className="text-[11px] text-muted mt-1 truncate">
                {people.find((p) => p.id === v.created_by)?.full_name || "Someone"} · {mdToText(v.body).slice(0, 90) || "empty"}
              </div>
              {canEdit && (
                <div className={cn("mt-2")}>
                  <Button size="xs" variant="ghost" loading={busy === v.id} onClick={() => restore(v)}>
                    <RotateCcw size={12} /> Restore this version
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
