"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, type Message } from "@/lib/utils";
import { ChannelList } from "./ChannelList";
import { NewChannelModal } from "./NewChannelModal";
import type { ChannelListItem } from "./types";

/**
 * Two-pane chat shell. On mobile `/chat` shows the list and `/chat/[id]`
 * shows the conversation full-screen; on lg+ both are side by side.
 */
export function ChatShell({ initialChannels, children }: { initialChannels: ChannelListItem[]; children: React.ReactNode }) {
  const { profile } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isRoot = pathname === "/chat";
  const activeId = isRoot ? null : pathname.split("/")[2] || null;
  const [unread, setUnread] = React.useState<Record<string, number> | null>(null);
  const [bumps, setBumps] = React.useState<Record<string, string>>({});
  const [newOpen, setNewOpen] = React.useState(false);
  const knownIds = React.useMemo(() => new Set(initialChannels.map((c) => c.id)), [initialChannels]);

  // Merge server props with live overrides (never copy props into state)
  const items = React.useMemo(() => {
    const list = initialChannels.map((c) => ({
      ...c,
      unread: unread && c.id in unread ? unread[c.id]! : c.unread,
      last_message_at: bumps[c.id] && (!c.last_message_at || bumps[c.id]! > c.last_message_at) ? bumps[c.id]! : c.last_message_at,
    }));
    return list.sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || "") || a.name.localeCompare(b.name));
  }, [initialChannels, unread, bumps]);

  React.useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshUnread = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        supabase.rpc("my_unread_counts").then(({ data }) => {
          if (!data) return;
          const map: Record<string, number> = {};
          for (const r of data) map[r.channel_id] = Number(r.unread || 0);
          setUnread(map);
        });
      }, 150);
    };
    const ch = supabase
      .channel(`chat-list:${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p: RealtimePostgresInsertPayload<Message>) => {
        const m = p.new;
        if (!m.parent_id) setBumps((b) => ({ ...b, [m.channel_id]: m.created_at }));
        if (!knownIds.has(m.channel_id)) router.refresh();
        refreshUnread();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_members", filter: `user_id=eq.${profile.id}` }, (p) => {
        if (p.eventType !== "UPDATE") router.refresh();
        refreshUnread();
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [profile.id, knownIds, router]);

  return (
    <div className="flex h-[calc(100dvh-var(--topbar-h)-64px)] lg:h-[calc(100dvh-var(--topbar-h))] min-h-0 overflow-hidden">
      <aside className={cn("w-full lg:w-[300px] lg:shrink-0 lg:border-r bg-[var(--bg-elev)] flex-col min-h-0", isRoot ? "flex" : "hidden lg:flex")}>
        <ChannelList items={items} activeId={activeId} onNew={() => setNewOpen(true)} />
      </aside>
      <section className={cn("flex-1 min-w-0 min-h-0 flex-col bg-[var(--bg)]", isRoot ? "hidden lg:flex" : "flex")}>{children}</section>
      <NewChannelModal open={newOpen} onClose={() => setNewOpen(false)} memberChannelIds={initialChannels.map((c) => c.id)} />
    </div>
  );
}
