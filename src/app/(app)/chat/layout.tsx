import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ChatShell } from "@/components/chat/ChatShell";
import type { ChannelListItem, PersonLite } from "@/components/chat/types";

export const metadata = { title: "Chat" };

const PUBLIC_TYPES = new Set(["company", "announcement", "department", "group"]);

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

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const supabase = await createClient();

  const [{ data: channels }, { data: memberships }, { data: unread }] = await Promise.all([
    supabase.from("channels").select("*").order("last_message_at", { ascending: false, nullsFirst: false }).order("name"),
    supabase.from("channel_members").select("channel_id,muted").eq("user_id", session.userId),
    supabase.rpc("my_unread_counts"),
  ]);

  const mine = new Map((memberships || []).map((m) => [m.channel_id, m.muted] as const));
  const unreadMap = new Map((unread || []).map((u) => [u.channel_id, Number(u.unread || 0)] as const));

  // My list: everything I am a member of, plus project/task rooms I can see.
  // Public channels I have not joined live in the "Browse" tab instead.
  const visible = (channels || []).filter((c) => mine.has(c.id) || !PUBLIC_TYPES.has(c.type));

  const dmIds = visible.filter((c) => c.type === "dm").map((c) => c.id);
  const others = new Map<string, PersonLite | null>();
  if (dmIds.length) {
    const { data: dmMembers } = await supabase
      .from("channel_members")
      .select("channel_id,user_id,profiles!channel_members_user_id_fkey(id,full_name,avatar_url,presence,designation)")
      .in("channel_id", dmIds)
      .neq("user_id", session.userId);
    for (const row of dmMembers || []) others.set(row.channel_id, toPerson(row.profiles));
  }

  const items: ChannelListItem[] = visible.map((c) => ({
    ...c,
    unread: unreadMap.get(c.id) || 0,
    muted: mine.get(c.id) || false,
    other: c.type === "dm" ? others.get(c.id) || null : undefined,
  }));

  return <ChatShell initialChannels={items}>{children}</ChatShell>;
}
