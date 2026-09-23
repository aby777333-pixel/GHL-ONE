import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BarChart3, CheckSquare, FileText, Gavel, MessageCircleQuestion, PenTool, Radio, StickyNote, Users, Video } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, EmptyState, Pill } from "@/components/ui";
import { PersonChip, StatusPill } from "@/components/tasks/TaskBits";
import { ROOM_KIND_LABEL, type RoomKind } from "@/lib/live/types";
import { fmtDate, type TaskStatus } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("live_rooms").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ? `${data.title} · History` : "Room history" };
}

/*
  One room's history: its notes, decisions, tasks, recordings, boards, documents and who was there.

  "Open the history" on an ended room sent people to `/live?room=<id>`, which the hub ignores — they landed
  on "Your rooms" with no history in sight. This is the page that link was always meant to reach, and the
  History button on a Recent card now comes straight here instead of via the "This room has ended" screen.

  Every read goes through the caller's own RLS-scoped client, so a history shows exactly what the viewer
  may see — and a room they cannot see is a 404, never a partial page.
*/
export default async function LiveRoomHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, getSession()]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const supabase = await createClient();

  const { data: room } = await supabase.from("live_rooms").select("id,title,kind,status,started_at,ended_at,host_id,meeting_id,project_id,persistent").eq("id", id).maybeSingle();
  if (!room) notFound();

  const [{ data: notes }, { data: decisions }, { data: tasks }, { data: recordings }, { data: boards }, { data: docs }, { data: parts }, { data: polls }, { data: questions }] = await Promise.all([
    supabase.from("live_notes").select("body,updated_at").eq("room_id", id).maybeSingle(),
    supabase.from("decisions").select("id,title,decided_at,status").eq("live_room_id", id).order("decided_at"),
    supabase.from("tasks").select("id,title,status,assignee_id").eq("source_live_room_id", id).order("created_at"),
    supabase.from("live_recordings").select("id,title,created_at,duration_sec,status").eq("room_id", id).order("created_at"),
    supabase.from("boards").select("id,title,created_at").eq("room_id", id).order("created_at"),
    supabase.from("live_docs").select("id,title,created_at").eq("room_id", id).order("created_at"),
    supabase.from("live_participants").select("user_id,joined_at").eq("room_id", id).order("joined_at"),
    // Polls with their results, and the room's Q&A — reported missing from the history.
    supabase.from("live_polls").select("id,question,options,votes,status,anonymous").eq("room_id", id).order("created_at"),
    supabase.from("live_questions").select("id,body,answer,answered,anonymous,author_id,upvotes").eq("room_id", id).order("created_at"),
  ]);

  const isLive = room.status === "live";
  const people = [...new Set((parts || []).map((p) => p.user_id))];
  const noteText = (notes?.body || "").trim();
  const mins = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${Math.max(1, Math.round(s / 60))} min`);

  return (
    <div className="page">
      <Link href="/live?tab=recent" className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]"><ArrowLeft size={14} /> GHL Live</Link>

      <Card className="px-[var(--s4)] py-[var(--s4)] mb-[var(--s3)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow mb-1">Room history</div>
            <h1 className="h1 break-words">{room.title}</h1>
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2 text-sm text-[var(--fg-2)]">
              <span>{ROOM_KIND_LABEL[room.kind as RoomKind] || "Room"}</span>
              <span className="num">{fmtDate(room.started_at, true)}{room.ended_at ? ` → ${fmtDate(room.ended_at, true)}` : ""}</span>
              {room.host_id && <span className="inline-flex items-center gap-1.5 text-xs text-muted">Host <PersonChip id={room.host_id} size={18} /></span>}
              {room.meeting_id && <Link href={`/meetings/${room.meeting_id}`} className="text-xs link">Open the meeting</Link>}
              {room.project_id && <Link href={`/projects/${room.project_id}`} className="text-xs link">Open the project</Link>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isLive ? <Pill tone="tone-success" size="lg">Live now</Pill> : <Pill tone="tone-neutral" size="lg">{room.persistent ? "Always open" : "Ended"}</Pill>}
            {(isLive || room.persistent) && <Link href={`/live/${room.id}`} className="btn btn-primary btn-sm"><Radio size={14} /> {isLive ? "Join" : "Open room"}</Link>}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-[var(--s3)] items-start">
        <div className="space-y-[var(--s3)] min-w-0">
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><StickyNote size={15} className="text-muted" /> Notes</span>} />
            <div className="px-[var(--s4)] pb-[var(--s4)]">
              {noteText ? <div className="text-sm whitespace-pre-wrap break-words">{noteText}</div> : <div className="text-xs text-muted">No notes were taken in this room.</div>}
            </div>
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Gavel size={15} className="text-muted" /> Decisions</span>} subtitle={`${decisions?.length || 0} recorded`} />
            {decisions?.length ? (
              <ul className="divide-y border-t">
                {decisions.map((d) => (
                  <li key={d.id}><Link href={`/decisions/${d.id}`} className="flex items-center gap-3 px-[var(--s4)] py-2 row-hover"><span className="text-sm flex-1 min-w-0 truncate">{d.title}</span><span className="text-[11px] text-muted num shrink-0">{fmtDate(d.decided_at)}</span></Link></li>
                ))}
              </ul>
            ) : <EmptyState title="No decisions recorded" className="py-[var(--s3)]" />}
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><BarChart3 size={15} className="text-muted" /> Polls</span>} subtitle={`${polls?.length || 0} asked`} />
            {polls?.length ? (
              <div className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
                {polls.map((p) => {
                  const options = (Array.isArray(p.options) ? p.options : []) as { id: string; label: string }[];
                  const votes = (p.votes && typeof p.votes === "object" && !Array.isArray(p.votes) ? p.votes : {}) as Record<string, string[]>;
                  const total = Object.values(votes).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
                  return (
                    <div key={p.id} className="rounded-[var(--radius-sm)] border p-3">
                      <div className="text-sm font-medium">{p.question}</div>
                      <ul className="mt-2 space-y-1">
                        {options.map((o) => {
                          const n = Array.isArray(votes[o.id]) ? votes[o.id].length : 0;
                          const pct = total ? Math.round((n / total) * 100) : 0;
                          return (
                            <li key={o.id} className="flex items-center gap-2 text-xs">
                              <span className="flex-1 min-w-0 truncate">{o.label}</span>
                              <span className="num text-muted">{n} · {pct}%</span>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="text-[11px] text-muted mt-1.5">{total} vote{total === 1 ? "" : "s"}{p.anonymous ? " · anonymous" : ""}{p.status === "open" ? " · still open" : ""}</div>
                    </div>
                  );
                })}
              </div>
            ) : <EmptyState title="No polls were run" className="py-[var(--s3)]" />}
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><MessageCircleQuestion size={15} className="text-muted" /> Q&amp;A</span>} subtitle={`${questions?.length || 0} question${questions?.length === 1 ? "" : "s"}`} />
            {questions?.length ? (
              <ul className="divide-y border-t">
                {questions.map((q) => (
                  <li key={q.id} className="px-[var(--s4)] py-2 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="flex-1 min-w-0 break-words">{q.body}</span>
                      {q.upvotes?.length ? <span className="text-[11px] text-muted num shrink-0">▲ {q.upvotes.length}</span> : null}
                      <Pill tone={q.answered ? "tone-success" : "tone-neutral"}>{q.answered ? "Answered" : "Open"}</Pill>
                    </div>
                    <div className="text-[11px] text-muted mt-0.5">{q.anonymous || !q.author_id ? "Anonymous" : <PersonChip id={q.author_id} size={14} />}</div>
                    {q.answer && <div className="text-xs mt-1 sunken rounded-[var(--radius-sm)] px-2 py-1.5 whitespace-pre-wrap">{q.answer}</div>}
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No questions were asked" className="py-[var(--s3)]" />}
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><CheckSquare size={15} className="text-muted" /> Tasks</span>} subtitle={`${tasks?.length || 0} created here`} />
            {tasks?.length ? (
              <ul className="divide-y border-t">
                {tasks.map((t) => (
                  <li key={t.id}><Link href={`/tasks/${t.id}`} className="flex items-center gap-3 px-[var(--s4)] py-2 row-hover"><span className="text-sm flex-1 min-w-0 truncate">{t.title}</span>{t.assignee_id && <PersonChip id={t.assignee_id} size={16} showName={false} />}<StatusPill status={t.status as TaskStatus} /></Link></li>
                ))}
              </ul>
            ) : <EmptyState title="No tasks came out of this room" className="py-[var(--s3)]" />}
          </Card>
        </div>

        <div className="space-y-[var(--s3)] min-w-0">
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Users size={15} className="text-muted" /> Who was there</span>} subtitle={`${people.length} ${people.length === 1 ? "person" : "people"}`} />
            <div className="px-[var(--s4)] pb-[var(--s4)] flex flex-col gap-1.5">
              {people.length ? people.map((u) => <PersonChip key={u} id={u} size={20} />) : <span className="text-xs text-muted">Nobody joined.</span>}
            </div>
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Video size={15} className="text-muted" /> Recordings</span>} />
            {recordings?.length ? (
              <ul className="divide-y border-t">
                {recordings.map((r) => (
                  <li key={r.id}><Link href={`/recordings/${r.id}`} className="flex items-center gap-3 px-[var(--s4)] py-2 row-hover"><span className="text-sm flex-1 min-w-0 truncate">{r.title}</span><span className="text-[11px] text-muted num shrink-0">{r.status === "ready" ? mins(r.duration_sec) : r.status}</span></Link></li>
                ))}
              </ul>
            ) : <div className="px-[var(--s4)] pb-[var(--s4)] text-xs text-muted">Not recorded.</div>}
          </Card>

          {(boards?.length || docs?.length) ? (
            <Card>
              <CardHeader title="Boards & documents" />
              <ul className="divide-y border-t">
                {(boards || []).map((b) => (
                  <li key={b.id}><Link href={`/boards/${b.id}`} className="flex items-center gap-2 px-[var(--s4)] py-2 row-hover text-sm"><PenTool size={13} className="text-muted shrink-0" /><span className="truncate">{b.title}</span></Link></li>
                ))}
                {(docs || []).map((d) => (
                  <li key={d.id}><Link href={`/docs/${d.id}`} className="flex items-center gap-2 px-[var(--s4)] py-2 row-hover text-sm"><FileText size={13} className="text-muted shrink-0" /><span className="truncate">{d.title}</span></Link></li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
