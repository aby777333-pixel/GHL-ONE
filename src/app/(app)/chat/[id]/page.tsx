import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Conversation } from "@/components/chat/Conversation";
import { INITIAL_PAGE } from "@/components/chat/lib";
import type { ChannelMember, ChatMessage, PersonLite } from "@/components/chat/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toPerson(p: unknown): PersonLite | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  return {
    id: o.id,
    full_name: typeof o.full_name === "string" ? o.full_name : null,
    avatar_url: typeof o.avatar_url === "string" ? o.avatar_url : null,
    presence: typeof o.presence === "string" ? o.presence : null,
    designation: typeof o.designation === "string" ? o.designation : null,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Chat" };
  const supabase = await createClient();
  const { data } = await supabase.from("channels").select("name,type").eq("id", id).maybeSingle();
  return { title: data ? (data.type === "dm" ? data.name : `#${data.name}`) : "Chat" };
}

export default async function ChannelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ id }, { m: focus }] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(id)) notFound();
  const session = await getSession();
  const supabase = await createClient();

  const { data: channel } = await supabase.from("channels").select("*").eq("id", id).maybeSingle();
  if (!channel) notFound();

  const [{ data: memberRows }, { data: msgRows }, { data: pinnedRows }] = await Promise.all([
    supabase.from("channel_members").select("*, profiles!channel_members_user_id_fkey(id,full_name,avatar_url,presence,designation)").eq("channel_id", id).order("joined_at"),
    supabase
      .from("messages")
      .select("*, message_reactions(message_id,user_id,emoji)")
      .eq("channel_id", id)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(INITIAL_PAGE),
    supabase.from("messages").select("*, message_reactions(message_id,user_id,emoji)").eq("channel_id", id).eq("is_pinned", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(50),
  ]);

  const members: ChannelMember[] = (memberRows || []).map((r) => ({
    channel_id: r.channel_id,
    user_id: r.user_id,
    role: r.role,
    last_read_at: r.last_read_at,
    muted: r.muted,
    joined_at: r.joined_at,
    profile: toPerson(r.profiles),
  }));
  const myMember = members.find((m) => m.user_id === session.userId) || null;

  const toMessage = (r: NonNullable<typeof msgRows>[number]): ChatMessage => {
    const { message_reactions, ...rest } = r;
    return { ...rest, reactions: message_reactions || [] };
  };
  const messages = (msgRows || []).map(toMessage).reverse();
  const pinned = (pinnedRows || []).map(toMessage);

  const ids = messages.map((m) => m.id);
  const [{ data: replyRows }, { count: unreadCount }] = await Promise.all([
    ids.length ? supabase.from("messages").select("parent_id").in("parent_id", ids).is("deleted_at", null) : Promise.resolve({ data: [] as { parent_id: string | null }[] }),
    myMember
      ? supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", id)
          .is("parent_id", null)
          .is("deleted_at", null)
          .gt("created_at", myMember.last_read_at)
          .neq("author_id", session.userId)
      : Promise.resolve({ count: 0 }),
  ]);
  const replyCounts: Record<string, number> = {};
  for (const r of replyRows || []) if (r.parent_id) replyCounts[r.parent_id] = (replyCounts[r.parent_id] || 0) + 1;

  return (
    <Conversation
      key={id}
      channel={channel}
      members={members}
      initialMessages={messages}
      pinned={pinned}
      replyCounts={replyCounts}
      myMember={myMember}
      unreadCount={unreadCount || 0}
      focusMessageId={focus || null}
    />
  );
}
