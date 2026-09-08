"use client";

/**
 * Collaboration memory — "everything this thing ever did live".
 * Calls `live_history(type, id)` and lists the rooms, recordings, boards, documents and decisions
 * that belong to a project / task / department / channel / help request / incident / meeting.
 */

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, FileText, Gavel, History, PenTool, Radio, Video } from "lucide-react";
import { Card, EmptyState, Spinner } from "@/components/ui";
import { liveHistory } from "@/lib/live/client";
import { ago, cn } from "@/lib/utils";

export type HistoryType = "project" | "task" | "department" | "channel" | "help" | "incident" | "meeting";

type RoomRow = { id: string; title: string; kind: string; status: string; started_at: string; ended_at: string | null; host: string | null; participants: number };
type RecRow = { id: string; title: string; kind: string; duration_sec: number; created_at: string; owner: string | null };
type BoardRow = { id: string; title: string; kind: string; updated_at: string; owner: string | null };
type DocRow = { id: string; title: string; kind: string; updated_at: string };
type DecisionRow = { id: string; title: string; decided_at: string; by: string | null };

type History = { rooms?: RoomRow[]; recordings?: RecRow[]; boards?: BoardRow[]; docs?: DocRow[]; decisions?: DecisionRow[] };

function mins(from: string, to: string | null) {
  const end = to ? Date.parse(to) : Date.now();
  const m = Math.max(0, Math.round((end - Date.parse(from)) / 60000));
  return m < 1 ? "under a minute" : `${m} min`;
}

export function CollaborationHistory({ type, id, title = "Collaboration memory", collapsible = true, defaultOpen = false, className }: {
  type: HistoryType;
  id: string;
  title?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen || !collapsible);
  const [data, setData] = React.useState<History | null>(null);
  /* Which (type, id) we already have — or have in flight — so opening twice does not refetch. */
  const requested = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const key = `${type}:${id}`;
    if (requested.current === key) return;
    requested.current = key;
    let alive = true;
    let landed = false;
    const receive = (h: History) => {
      if (!alive) return;
      landed = true;
      setData(h);
    };
    liveHistory(type, id)
      .then((h) => receive(h as History))
      .catch(() => receive({}));
    return () => {
      alive = false;
      /* Closed (or switched) before the answer arrived — let the next open ask again. */
      if (!landed && requested.current === key) requested.current = null;
    };
  }, [open, type, id]);

  const counts = data ? (data.rooms?.length || 0) + (data.recordings?.length || 0) + (data.boards?.length || 0) + (data.docs?.length || 0) + (data.decisions?.length || 0) : 0;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => collapsible && setOpen((o) => !o)}
        className={cn("w-full flex items-center gap-2 px-[var(--s4)] py-[var(--s3)] text-left", collapsible && "row-hover")}
        aria-expanded={open}
      >
        <History size={15} className="text-muted shrink-0" />
        <span className="h3 min-w-0 truncate">{title}</span>
        {data && counts > 0 && <span className="pill tone-neutral ml-1">{counts}</span>}
        {collapsible && <span className="ml-auto text-muted shrink-0">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>}
      </button>

      {open && (
        <div className="px-[var(--s4)] pb-[var(--s3)]">
          {!data ? (
            <div className="flex items-center gap-2 text-sm text-muted py-3"><Spinner /> Looking back…</div>
          ) : counts === 0 ? (
            <EmptyState icon={<Radio size={18} />} title="Nothing live yet" hint="Calls, huddles, recordings, boards and documents started from here will be remembered." className="py-[var(--s4)]" />
          ) : (
            <div className="space-y-[var(--s3)]">
              <Group icon={<Radio size={13} />} label="Rooms" show={!!data?.rooms?.length}>
                {(data?.rooms || []).map((r) => (
                  <Row key={r.id} href={`/live/${r.id}`} title={r.title} meta={`${r.kind.replace(/_/g, " ")} · ${mins(r.started_at, r.ended_at)} · ${r.participants} ${r.participants === 1 ? "person" : "people"}${r.host ? ` · ${r.host}` : ""}`} at={r.started_at} live={r.status === "live"} />
                ))}
              </Group>
              <Group icon={<Video size={13} />} label="Recordings" show={!!data?.recordings?.length}>
                {(data?.recordings || []).map((r) => (
                  <Row key={r.id} href={`/recordings/${r.id}`} title={r.title} meta={`${r.kind.replace(/_/g, " ")}${r.duration_sec ? ` · ${Math.max(1, Math.round(r.duration_sec / 60))} min` : ""}${r.owner ? ` · ${r.owner}` : ""}`} at={r.created_at} />
                ))}
              </Group>
              <Group icon={<PenTool size={13} />} label="Boards" show={!!data?.boards?.length}>
                {(data?.boards || []).map((b) => (
                  <Row key={b.id} href={`/boards/${b.id}`} title={b.title} meta={`${b.kind.replace(/_/g, " ")} board${b.owner ? ` · ${b.owner}` : ""}`} at={b.updated_at} />
                ))}
              </Group>
              <Group icon={<FileText size={13} />} label="Documents" show={!!data?.docs?.length}>
                {(data?.docs || []).map((d) => (
                  <Row key={d.id} href={`/docs/${d.id}`} title={d.title} meta={d.kind.replace(/_/g, " ")} at={d.updated_at} />
                ))}
              </Group>
              <Group icon={<Gavel size={13} />} label="Decisions" show={!!data?.decisions?.length}>
                {(data?.decisions || []).map((d) => (
                  <Row key={d.id} href={`/decisions/${d.id}`} title={d.title} meta={d.by ? `decided by ${d.by}` : "decided"} at={d.decided_at} />
                ))}
              </Group>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Group({ icon, label, show, children }: { icon: React.ReactNode; label: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div>
      <div className="eyebrow mb-1 inline-flex items-center gap-1.5">{icon} {label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ href, title, meta, at, live }: { href: string; title: string; meta: string; at: string; live?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2 px-2 py-1.5 -mx-2 rounded-[var(--radius-sm)] row-hover min-w-0">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm truncate">
          <span className="truncate">{title}</span>
          {live && <span className="pill tone-success shrink-0">live</span>}
        </span>
        <span className="block text-[11px] text-muted truncate">{meta}</span>
      </span>
      <span className="text-[11px] text-muted shrink-0">{ago(at)}</span>
    </Link>
  );
}
