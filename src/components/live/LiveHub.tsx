"use client";
/**
 * GHL LIVE hub — what is live right now, the rooms that are always yours,
 * where you have been, and the ones you starred.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Clock, DoorOpen, Radio, Star, StarOff, Users, Video } from "lucide-react";
import { AvatarStack, Button, Card, EmptyState, PageHeader, Pill, SearchInput, Tabs, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { startRoom, toggleFavorite } from "@/lib/live/client";
import { ROOM_KIND_LABEL, type LiveRoom, type RoomKind } from "@/lib/live/types";
import { ago, cn, fmtDate } from "@/lib/utils";

export type HubRoom = Pick<LiveRoom, "id" | "title" | "kind" | "status" | "persistent" | "started_at" | "last_active_at" | "ended_at" | "host_id" | "department_id" | "project_id" | "confidential"> & {
  participants?: { user_id: string }[];
};

type Tab = "now" | "mine" | "recent" | "starred";

const PERSISTENT_KINDS: RoomKind[] = ["project_room", "department_room", "team_room", "virtual_office"];

export function LiveHub({
  live,
  persistent,
  recent,
  favouriteIds,
}: {
  live: HubRoom[];
  persistent: HubRoom[];
  recent: HubRoom[];
  favouriteIds: string[];
}) {
  const { profile, people, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = React.useState<Tab>(live.length ? "now" : "mine");
  const [q, setQ] = React.useState("");
  const [favs, setFavs] = React.useState<Set<string>>(new Set(favouriteIds));
  const [rows, setRows] = React.useState(live);
  const [busy, setBusy] = React.useState(false);

  // Keep the "live now" list fresh without a reload.
  React.useEffect(() => {
    const sb = createClient();
    const rt = sb
      .channel("live-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_rooms" }, async () => {
        const { data } = await sb
          .from("live_rooms")
          .select("id,title,kind,status,persistent,started_at,last_active_at,ended_at,host_id,department_id,project_id,confidential")
          .eq("status", "live")
          .order("last_active_at", { ascending: false })
          .limit(40);
        setRows((data || []) as HubRoom[]);
      })
      .subscribe();
    return () => {
      void sb.removeChannel(rt);
    };
  }, []);

  const all = React.useMemo(() => {
    const map = new Map<string, HubRoom>();
    for (const r of [...rows, ...persistent, ...recent]) map.set(r.id, r);
    return [...map.values()];
  }, [rows, persistent, recent]);

  const list = React.useMemo(() => {
    const base = tab === "now" ? rows : tab === "mine" ? persistent : tab === "recent" ? recent : all.filter((r) => favs.has(r.id));
    const f = q.trim().toLowerCase();
    return f ? base.filter((r) => r.title.toLowerCase().includes(f)) : base;
  }, [tab, rows, persistent, recent, all, favs, q]);

  async function star(id: string) {
    const on = !favs.has(id);
    setFavs((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
    await toggleFavorite("room", id, profile.id, on).catch(() => null);
  }

  async function quickStart(kind: RoomKind, title: string) {
    setBusy(true);
    try {
      const id = await startRoom(kind, { title }, { persistent: PERSISTENT_KINDS.includes(kind) });
      router.push(`/live/${id}`);
    } catch (e) {
      toast.push((e as Error).message, "danger");
      setBusy(false);
    }
  }

  const hostName = (id: string | null) => (id ? people.find((p) => p.id === id)?.full_name || "Someone" : "—");
  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name : null);

  return (
    <div className="page anim-fade-up">
      <PageHeader
        eyebrow="GHL LIVE"
        title="Live"
        subtitle="Rooms are where the company works out loud — talk, share a screen, decide, and the record stays with the work."
        actions={
          <>
            <Button size="sm" loading={busy} onClick={() => void quickStart("huddle", `${profile.full_name?.split(" ")[0] || "Quick"}'s huddle`)}>
              <Radio size={15} /> Start a huddle
            </Button>
            <Button size="sm" variant="primary" loading={busy} onClick={() => void quickStart("meeting", "New meeting")}>
              <Video size={15} /> New meeting
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-2 mb-[var(--s3)]">
        <Tabs
          className="flex-1 min-w-0"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "now", label: "Live now", count: rows.length },
            { key: "mine", label: "Your rooms", count: persistent.length },
            { key: "recent", label: "Recent" },
            { key: "starred", label: "Starred", count: favs.size },
          ]}
        />
      </div>
      <SearchInput className="mb-[var(--s3)] max-w-sm" placeholder="Find a room…" value={q} onChange={(e) => setQ(e.target.value)} />

      {list.length === 0 ? (
        <EmptyState
          icon={<DoorOpen size={20} />}
          title={tab === "now" ? "Nothing is live right now" : tab === "mine" ? "You have no standing rooms yet" : tab === "starred" ? "No starred rooms" : "No rooms yet"}
          hint={
            tab === "now"
              ? "Start a huddle and people can drop in — it takes one click."
              : tab === "mine"
                ? "Project, department and team rooms appear here as soon as one is created for you."
                : "Rooms you join show up here so you can find the notes afterwards."
          }
          action={<Button variant="primary" size="sm" onClick={() => void quickStart("huddle", "Quick huddle")}>Start a huddle</Button>}
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 stagger">
          {list.map((r) => {
            const isLive = r.status === "live";
            return (
              <Card key={r.id} hover className="p-[var(--s3)] flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <span className={cn("w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0", isLive ? "tone-success" : "tone-neutral")}>
                    {isLive ? <Radio size={16} /> : <Video size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/live/${r.id}`} className="text-sm font-medium truncate block hover:underline">{r.title}</Link>
                    <div className="text-[11px] text-muted truncate">
                      {ROOM_KIND_LABEL[r.kind] || "Room"}
                      {deptName(r.department_id) ? ` · ${deptName(r.department_id)}` : ""}
                      {r.host_id ? ` · ${hostName(r.host_id)}` : ""}
                    </div>
                  </div>
                  <button type="button" onClick={() => void star(r.id)} className="text-muted hover:text-[var(--accent)]" aria-label={favs.has(r.id) ? "Unstar" : "Star"}>
                    {favs.has(r.id) ? <Star size={15} className="fill-[var(--accent)] text-[var(--accent)]" /> : <StarOff size={15} />}
                  </button>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  {isLive && <Pill tone="tone-success" className="gap-1"><span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> Live · {ago(r.last_active_at)}</Pill>}
                  {!isLive && r.persistent && <Pill tone="tone-info">Always open</Pill>}
                  {!isLive && !r.persistent && <Pill tone="tone-neutral"><Clock size={10} /> {r.ended_at ? fmtDate(r.ended_at, true) : fmtDate(r.started_at, true)}</Pill>}
                  {r.confidential && <Pill tone="tone-danger">Confidential</Pill>}
                  {r.participants && r.participants.length > 0 && (
                    <span className="ml-auto inline-flex items-center gap-1 text-muted"><Users size={11} /> {r.participants.length}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-auto pt-1">
                  {r.participants && r.participants.length > 0 && (
                    <AvatarStack size={20} people={r.participants.map((p) => people.find((x) => x.id === p.user_id) || { id: p.user_id, full_name: null, avatar_url: null })} />
                  )}
                  <Link href={`/live/${r.id}`} className={cn("btn btn-sm ml-auto", isLive ? "btn-primary" : "btn-secondary")}>
                    {isLive ? "Join" : r.persistent ? "Open" : "History"}
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-[var(--s5)]">
        <div className="eyebrow mb-2 flex items-center gap-1.5"><Building2 size={12} /> Standing rooms</div>
        <p className="text-xs text-muted max-w-2xl">
          Project rooms, department rooms, team rooms and the virtual office never close — walk in whenever you need someone. Everything said in them stays attached to the project or the department, not to a chat thread.
        </p>
      </div>
    </div>
  );
}
