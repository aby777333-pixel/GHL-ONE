"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Clock, Globe2, HandHelping, Hash, Hourglass, LifeBuoy, Lock, Megaphone, Plus, Sparkles, Users, Briefcase, Handshake, Crown, PartyPopper } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, EmptyState, PageHeader, Pill, useToast } from "@/components/ui";
import { Blink } from "@/components/providers/ActivityProvider";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip, PriorityPill } from "@/components/tasks/TaskBits";
import { ago, cn, isAdminRole, type Channel } from "@/lib/utils";
import { asVisibility, VISIBILITY_META, untilLabel, type ChannelType } from "./visibility";
import { CreateRoomModal } from "./CreateRoomModal";
import { asDeptStatus, DEPT_STATUS_META, fmtRemaining, slaRemaining, type HelpRequest } from "@/components/help/lib";

export type Availability = {
  department_id: string; name: string; slug: string; color: string; status: string; on_duty_user_id: string | null;
  available: number; busy: number; on_leave: number; open_requests: number; avg_ack_minutes: number; services: number;
};
export type BoardItem = Pick<HelpRequest, "id" | "title" | "details" | "priority" | "status" | "department_id" | "requester_id" | "owner_id" | "service_id" | "created_at" | "ack_due_at" | "deadline">;

export type CommonHubData = {
  openChannels: Channel[];
  rooms: Channel[];
  memberCount: Record<string, number>;
  unread: Record<string, number>;
  membership: Record<string, { expires_at: string | null; role: string; invite_reason: string | null }>;
  board: BoardItem[];
  availability: Availability[];
  openCreate: boolean;
};

const CHANNEL_ORDER = ["general", "announcements", "urgent", "important-updates", "help", "ideas", "wins", "creative", "learning", "events", "random"];
const CHANNEL_ICON: Record<string, React.ReactNode> = {
  announcements: <Megaphone size={17} />, urgent: <Sparkles size={17} />, help: <LifeBuoy size={17} />, events: <PartyPopper size={17} />, random: <PartyPopper size={17} />,
};
const CHANNEL_TONE: Record<string, string> = { announcements: "tone-warn", urgent: "tone-danger", "important-updates": "tone-orange", help: "tone-success", wins: "tone-success", ideas: "tone-violet" };

function roomIcon(t: ChannelType) {
  if (t === "client") return <Briefcase size={16} />;
  if (t === "vendor") return <Handshake size={16} />;
  if (t === "management") return <Crown size={16} />;
  if (t === "social") return <PartyPopper size={16} />;
  if (t === "temporary") return <Hourglass size={16} />;
  return <Users size={16} />;
}

export function CommonHub({ data }: { data: CommonHubData }) {
  const { profile, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [createOpen, setCreateOpen] = React.useState(data.openCreate);
  const [claiming, setClaiming] = React.useState<string | null>(null);
  const [claimed, setClaimed] = React.useState<Set<string>>(() => new Set());
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const channels = React.useMemo(() => {
    const rank = (c: Channel) => {
      const i = CHANNEL_ORDER.indexOf(c.slug || c.name);
      return i < 0 ? 99 : i;
    };
    return [...data.openChannels].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [data.openChannels]);

  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name : undefined) || "Department";
  const board = data.board.filter((b) => !claimed.has(b.id));

  async function claim(item: BoardItem) {
    setClaiming(item.id);
    const { error } = await createClient().from("help_requests").update({ owner_id: profile.id, status: "accepted" }).eq("id", item.id);
    setClaiming(null);
    if (error) {
      toast.push(error.message.includes("row-level security") ? "Only the department's team or a manager can accept this one. Reply in #help instead." : error.message, "danger");
      return;
    }
    setClaimed((s) => new Set(s).add(item.id));
    toast.push("Thanks — you now own this request. A room has been opened with the requester.", "success");
    router.push(`/help/${item.id}`);
  }

  return (
    <div className="page space-y-[var(--s5)] anim-fade-up">
      <PageHeader
        eyebrow="One company · one workspace"
        title="GHL Common"
        subtitle="The shared space for everyone — company channels, who needs help, who is available, and the rooms you are part of."
        actions={
          <>
            <Link href="/help" className="btn btn-secondary btn-sm"><LifeBuoy size={14} /> Ask a department</Link>
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}><Plus size={15} /> Create room</Button>
          </>
        }
      />

      {/* Company channels */}
      <section>
        <div className="flex items-center justify-between mb-[var(--s3)]">
          <div>
            <div className="h2 inline-flex items-center gap-2"><Globe2 size={18} className="text-muted" /> Company channels</div>
            <div className="text-xs text-muted mt-0.5">Open to everyone. You are a member of all of them automatically.</div>
          </div>
        </div>
        {channels.length === 0 ? (
          <Card><EmptyState icon={<Hash size={18} />} title="No company channels yet" hint="An admin can create company-open channels from Chat." /></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 stagger">
            {channels.map((c) => {
              const key = c.slug || c.name;
              const unread = data.unread[c.id] || 0;
              return (
                <Link key={c.id} href={`/chat/${c.id}`} className="card card-hover p-[var(--s3)] flex flex-col gap-2 min-w-0 relative">
                  <div className="flex items-start gap-3">
                    <span className={cn("w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0", CHANNEL_TONE[key] || "tone-info")}>{CHANNEL_ICON[key] || <Hash size={17} />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-medium truncate">#{c.name}</span>
                        <Blink zone={`channel:${c.id}`} />
                        {c.is_readonly && <Lock size={11} className="text-muted shrink-0" />}
                      </div>
                      <div className="text-[11px] text-muted truncate-2 leading-snug mt-0.5">{c.description || "Company conversation"}</div>
                    </div>
                    {unread > 0 && <span className="pill tone-brand num shrink-0">{unread > 99 ? "99+" : unread}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted mt-auto">
                    <span className="inline-flex items-center gap-1"><Users size={11} /> {data.memberCount[c.id] || 0}</span>
                    <span className="inline-flex items-center gap-1 truncate"><Clock size={11} /> {c.last_message_at ? ago(c.last_message_at) : "quiet so far"}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-[var(--s5)] xl:grid-cols-[1.618fr_1fr]">
        {/* Who needs help */}
        <section className="min-w-0">
          <div className="flex items-center justify-between mb-[var(--s3)] gap-2">
            <div>
              <div className="h2 inline-flex items-center gap-2"><HandHelping size={18} className="text-muted" /> Who needs help</div>
              <div className="text-xs text-muted mt-0.5">Open requests waiting for someone. If it is yours to take, say “I can help”.</div>
            </div>
            <Link href="/help" className="text-xs link inline-flex items-center gap-1 shrink-0">Help Desk <ArrowRight size={12} /></Link>
          </div>
          <Card>
            {board.length === 0 ? (
              <EmptyState icon={<HandHelping size={18} />} title="Nobody is waiting" hint="Every open request has an owner. Nice." />
            ) : (
              <ul className="divide-y">
                {board.map((b) => {
                  const rem = slaRemaining(b.ack_due_at, now);
                  const mine = b.requester_id === profile.id;
                  return (
                    <li key={b.id} className="px-[var(--s3)] py-2.5 flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/help/${b.id}`} className="flex items-center gap-1.5 min-w-0 hover:underline">
                          <span className="text-sm font-medium truncate">{b.title}</span>
                          <Blink zone={`help:${b.id}`} />
                        </Link>
                        <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[11px] text-muted mt-0.5">
                          <span className="inline-flex items-center gap-1"><Building2 size={11} /> {deptName(b.department_id)}</span>
                          <span>·</span>
                          <PersonChip id={b.requester_id} size={14} />
                          <span>· {ago(b.created_at)}</span>
                          {b.status === "waiting" && <Pill tone="tone-orange">waiting on requester</Pill>}
                          {rem != null && b.status === "new" && <span className={cn("num", rem < 0 ? "text-danger" : rem < 60 * 60_000 ? "text-warn" : "")}>{fmtRemaining(rem)}</span>}
                        </div>
                        {b.details && <div className="text-xs text-2 truncate-2 mt-1">{b.details}</div>}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <PriorityPill priority={b.priority} />
                        {!mine && b.status === "new" && (
                          <Button size="xs" variant="secondary" loading={claiming === b.id} onClick={() => claim(b)}>I can help</Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        {/* Department availability */}
        <section className="min-w-0">
          <div className="mb-[var(--s3)]">
            <div className="h2 inline-flex items-center gap-2"><Building2 size={18} className="text-muted" /> Department availability</div>
            <div className="text-xs text-muted mt-0.5">Right now, across the company.</div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {data.availability.map((a) => (
              <AvailabilityCard key={a.department_id} a={a} />
            ))}
            {data.availability.length === 0 && <Card><EmptyState icon={<Building2 size={18} />} title="No departments" /></Card>}
          </div>
        </section>
      </div>

      {/* Groups & rooms */}
      <section>
        <div className="flex items-center justify-between mb-[var(--s3)] gap-2">
          <div>
            <div className="h2 inline-flex items-center gap-2"><Users size={18} className="text-muted" /> Groups & rooms</div>
            <div className="text-xs text-muted mt-0.5">Rooms you belong to. Temporary rooms and temporary access show when they end.</div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}><Plus size={14} /> Create room</Button>
        </div>
        {data.rooms.length === 0 ? (
          <Card>
            <EmptyState icon={<Users size={18} />} title="You are not in any rooms yet" hint="Create one for a project, a client, a team or a topic — or wait to be brought in." action={<Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> Create room</Button>} />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger">
            {data.rooms.map((c) => {
              const vis = asVisibility(c.visibility);
              const m = data.membership[c.id];
              const accessEnds = untilLabel(m?.expires_at, now);
              const archives = untilLabel(c.archive_at, now);
              const isOwner = c.owner_id === profile.id || c.co_owner_id === profile.id;
              return (
                <Link key={c.id} href={`/chat/${c.id}`} className="card card-hover p-[var(--s3)] flex flex-col gap-2 min-w-0">
                  <div className="flex items-start gap-3">
                    <span className={cn("w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0", VISIBILITY_META[vis].tone)}>{roomIcon(c.type)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-medium truncate">{c.name}</span>
                        <Blink zone={`channel:${c.id}`} />
                        {(data.unread[c.id] || 0) > 0 && <span className="pill tone-brand num">{data.unread[c.id]}</span>}
                      </div>
                      <div className="text-[11px] text-muted truncate-2 leading-snug mt-0.5">{c.purpose || c.description || `${c.type} room`}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted mt-auto">
                    <Pill tone={VISIBILITY_META[vis].tone}>{VISIBILITY_META[vis].short}</Pill>
                    {isOwner && <Pill tone="tone-violet">{c.owner_id === profile.id ? "owner" : "co-owner"}</Pill>}
                    <span className="inline-flex items-center gap-1"><Users size={11} /> {data.memberCount[c.id] || 0}</span>
                    {accessEnds && <span className={cn("inline-flex items-center gap-1 num", accessEnds === "expired" ? "text-danger" : "text-warn")} title={m?.invite_reason ? `Why you're here: ${m.invite_reason}` : undefined}><Hourglass size={11} /> access ends in {accessEnds}</span>}
                    {!accessEnds && archives && <span className="inline-flex items-center gap-1 num"><Hourglass size={11} /> archives in {archives}</span>}
                    {c.last_message_at && <span className="ml-auto truncate">{ago(c.last_message_at)}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} canManagement={isAdminRole(profile.role)} />
    </div>
  );
}

export function AvailabilityCard({ a, compact }: { a: Availability; compact?: boolean }) {
  const { people } = useSession();
  const status = asDeptStatus(a.status);
  const meta = DEPT_STATUS_META[status];
  const onDuty = a.on_duty_user_id ? people.find((p) => p.id === a.on_duty_user_id) : undefined;
  return (
    <Link href={`/departments/${a.slug}`} className="card card-hover p-3 flex items-center gap-3 min-w-0" style={{ borderLeft: `3px solid ${a.color}` }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium truncate">{a.name}</span>
          <Blink zone={`dept:${a.department_id}`} />
          <Pill tone={meta.tone}>{meta.label}</Pill>
        </div>
        <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[11px] text-muted mt-1 num">
          <span className="text-success">{a.available} available</span>
          <span>· {a.busy} busy</span>
          {a.on_leave > 0 && <span>· {a.on_leave} on leave</span>}
          {!compact && a.open_requests > 0 && <span>· {a.open_requests} open request{a.open_requests === 1 ? "" : "s"}</span>}
          {!compact && a.avg_ack_minutes > 0 && <span>· replies in ~{a.avg_ack_minutes < 60 ? `${a.avg_ack_minutes}m` : `${Math.round(a.avg_ack_minutes / 60)}h`}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onDuty ? (
          <span className="inline-flex items-center gap-1.5" title={`On duty: ${onDuty.full_name}`}>
            <Avatar name={onDuty.full_name} src={onDuty.avatar_url} size={26} presence={onDuty.presence} />
            <span className="hidden sm:block text-[11px] text-muted max-w-[90px] truncate">{onDuty.full_name.split(" ")[0]} on duty</span>
          </span>
        ) : (
          <span className="text-[11px] text-muted hidden sm:block">No one on duty</span>
        )}
        <ArrowRight size={14} className="text-muted" />
      </div>
    </Link>
  );
}

