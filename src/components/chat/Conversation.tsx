"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from "@supabase/supabase-js";
import { ChevronLeft, Search, Pin, Bell, BellOff, MoreVertical, Users, FolderKanban, Hash, Lock, Megaphone, Building2, CheckSquare, Sparkles, ArrowDown, X, Link2, LogOut, Info, MoonStar, UserPlus, FolderPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Avatar, AvatarStack, Button, Menu, MenuItem, Modal, Pill, Spinner, useToast } from "@/components/ui";
import { QuickTaskForm } from "@/components/tasks/QuickTaskForm";
import { cn, isManagerPlus, humanize, type Channel, type Message, type Tables } from "@/lib/utils";
import { Composer } from "./Composer";
import { MessageItem, MessageActionSheet, MessageBody } from "./MessageItem";
import { ThreadPanel } from "./ThreadPanel";
import { RecordDecisionModal, ForwardModal, CatchUpModal, MembersDrawer } from "./ChatModals";
import { ExtractTasksModal } from "@/components/ai/ExtractTasksModal";
import { BuddyQuickActions } from "@/components/ai/BuddyQuickActions";
import { EntityLive } from "@/components/live/EntityLive";
import { HuddleNudge } from "@/components/live/HuddleNudge";
import { BUDDY_MENTION_RE, askBuddyInChannel, isBuddyMessage } from "@/components/ai/buddyChat";
import { BringInModal } from "./BringInModal";
import { ConvertProjectModal } from "./ConvertProjectModal";
import { VisibilityPill, OwnerChip } from "./VisibilityPill";
import { PAGE_SIZE, INITIAL_PAGE, dayLabel, isContinuation, isNewDay, mergeMessages, personName, firstName, timeLabel, parseAttachments } from "./lib";
import type { ChannelMember, ChatMessage, MessageAction, PersonLite, Reaction, SendPayload } from "./types";

type Row = Message & { message_reactions: Reaction[] | null };
const toMessage = (r: Row): ChatMessage => {
  const { message_reactions, ...rest } = r;
  return { ...rest, reactions: message_reactions || [] };
};
const SELECT = "*, message_reactions(message_id,user_id,emoji)";

type ReactionEvent = { message_id: string; user_id: string; emoji: string; op: "add" | "remove" };
type PresenceMeta = { userId: string; name: string; typing: boolean };
type QuietHours = { enabled?: boolean; start?: string; end?: string };

/** Minutes since midnight on the IST wall clock (quiet hours are stored in IST). */
function istMinutes() {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return (h % 24) * 60 + m;
  } catch {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
}
function toMinutes(t: string | undefined, fallback: number) {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}
function inQuietHours(q: QuietHours | null, nowMin: number) {
  if (!q || q.enabled === false) return false;
  const s = toMinutes(q.start, 21 * 60);
  const e = toMinutes(q.end, 8 * 60);
  return s < e ? nowMin >= s && nowMin < e : nowMin >= s || nowMin < e;
}
type ModalState = { kind: "task" | "extract" | "decision" | "forward" | "catchup" | "members" | "bringin" | "convert"; m?: ChatMessage } | null;

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 my-2">
      <span className="h-px flex-1 bg-[var(--line)]" />
      <span className="pill tone-neutral">{label}</span>
      <span className="h-px flex-1 bg-[var(--line)]" />
    </div>
  );
}

function ChannelIcon({ channel }: { channel: Channel }) {
  const tone = channel.type === "project" ? "tone-brand" : channel.type === "task" ? "tone-success" : channel.type === "announcement" ? "tone-warn" : channel.type === "department" ? "tone-violet" : "tone-info";
  const Icon = channel.type === "project" ? FolderKanban : channel.type === "task" ? CheckSquare : channel.type === "announcement" ? Megaphone : channel.type === "department" ? Building2 : channel.type === "group" ? (channel.is_private ? Lock : Users) : Hash;
  return (
    <span className={cn("w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0", tone)}>
      <Icon size={17} />
    </span>
  );
}

export function Conversation({
  channel,
  members: initialMembers,
  initialMessages,
  pinned: initialPinned,
  replyCounts: initialReplyCounts,
  myMember,
  unreadCount,
  focusMessageId,
}: {
  channel: Channel;
  members: ChannelMember[];
  initialMessages: ChatMessage[];
  pinned: ChatMessage[];
  replyCounts: Record<string, number>;
  myMember: ChannelMember | null;
  unreadCount: number;
  focusMessageId: string | null;
}) {
  const { profile, people } = useSession();
  const router = useRouter();
  const toast = useToast();
  const me = profile.id;
  const managerPlus = isManagerPlus(profile.role);
  const readOnly = channel.is_readonly && !managerPlus;
  const isDm = channel.type === "dm";

  /* ------------------------------------------------------------- state */
  const [messages, setMessages] = React.useState(initialMessages);
  const [members, setMembers] = React.useState(initialMembers);
  const [pinned, setPinned] = React.useState(initialPinned);
  const [replyCounts, setReplyCounts] = React.useState(initialReplyCounts);
  const [extraPeople, setExtraPeople] = React.useState<Record<string, PersonLite>>({});
  const [hasMore, setHasMore] = React.useState(initialMessages.length >= INITIAL_PAGE);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [newBelow, setNewBelow] = React.useState(0);
  const [highlightId, setHighlightId] = React.useState<string | null>(null);
  const [showPinned, setShowPinned] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [serverHits, setServerHits] = React.useState<ChatMessage[]>([]);
  const [thread, setThread] = React.useState<ChatMessage | null>(null);
  const [threadReplies, setThreadReplies] = React.useState<ChatMessage[]>([]);
  const [threadLoading, setThreadLoading] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [sheetFor, setSheetFor] = React.useState<ChatMessage | null>(null);
  const [modal, setModal] = React.useState<ModalState>(null);
  const [online, setOnline] = React.useState<string[]>([]);
  const [typers, setTypers] = React.useState<string[]>([]);

  const listRef = React.useRef<HTMLDivElement>(null);
  const topRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const nearBottomRef = React.useRef(true);
  const stickRef = React.useRef(true);
  const prependRef = React.useRef<number | null>(null);
  const pendingScrollRef = React.useRef<string | null>(null);
  const loadingRef = React.useRef(false);
  const rtRef = React.useRef<RealtimeChannel | null>(null);
  const threadRef = React.useRef<ChatMessage | null>(null);
  const messagesRef = React.useRef(initialMessages);
  const requestedRef = React.useRef<Set<string>>(new Set());
  const toastRef = React.useRef(toast);

  React.useEffect(() => {
    toastRef.current = toast;
  });
  React.useEffect(() => {
    threadRef.current = thread;
  }, [thread]);
  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /* ----------------------------------------------------------- people */
  const authorOf = React.useCallback(
    (id: string | null): PersonLite | undefined => {
      if (!id) return undefined;
      return people.find((p) => p.id === id) || extraPeople[id] || members.find((m) => m.user_id === id)?.profile || undefined;
    },
    [people, extraPeople, members]
  );

  React.useEffect(() => {
    const ids: string[] = [];
    for (const m of [...messages, ...threadReplies]) {
      if (m.author_id && !authorOf(m.author_id) && !requestedRef.current.has(m.author_id)) ids.push(m.author_id);
    }
    if (!ids.length) return;
    ids.forEach((id) => requestedRef.current.add(id));
    let alive = true;
    createClient()
      .from("profiles")
      .select("id,full_name,avatar_url,presence,designation")
      .in("id", ids)
      .then(({ data }) => {
        if (!alive || !data?.length) return;
        setExtraPeople((prev) => {
          const next = { ...prev };
          for (const p of data) next[p.id] = p;
          return next;
        });
      });
    return () => {
      alive = false;
    };
  }, [messages, threadReplies, authorOf]);

  const other = React.useMemo(() => (isDm ? members.find((m) => m.user_id !== me)?.profile || null : null), [isDm, members, me]);
  const otherLive = other ? people.find((p) => p.id === other.id) : undefined;
  const onlineSet = React.useMemo(() => new Set(online), [online]);

  /* ------------------------------------------ outside working hours (DMs) */
  // `notification_prefs` is only readable by its owner, so we use the company quiet hours + the other person's presence.
  const [quietHours, setQuietHours] = React.useState<QuietHours | null>(null);
  const [nowMin, setNowMin] = React.useState(() => istMinutes());
  const orgId = profile.org_id;
  React.useEffect(() => {
    if (!isDm || !orgId) return;
    let alive = true;
    createClient()
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const s = (data?.settings && typeof data.settings === "object" && !Array.isArray(data.settings) ? (data.settings as { quiet_hours?: QuietHours }) : {}) || {};
        setQuietHours(s.quiet_hours || {});
      });
    const id = setInterval(() => setNowMin(istMinutes()), 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [isDm, orgId]);
  const otherDnd = isDm && !!other && (otherLive?.presence === "dnd" || other.presence === "dnd");
  const otherOnline = isDm && !!other && onlineSet.has(other.id);
  const awayNote = !isDm || !other || otherOnline ? null : otherDnd ? "Do not disturb · they'll see this when they're back" : inQuietHours(quietHours, nowMin) ? "Outside working hours · they'll see this in the morning" : null;

  /* ---------------------------------------------------------- mark read */
  const markRead = React.useCallback(() => {
    createClient().rpc("mark_channel_read", { c: channel.id }).then(() => {});
  }, [channel.id]);

  React.useEffect(() => {
    markRead();
    const onFocus = () => markRead();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [markRead]);

  /* ------------------------------------------------------- patch helpers */
  const patchMessage = React.useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    const map = (ms: ChatMessage[]) => ms.map((m) => (m.id === id ? fn(m) : m));
    setMessages(map);
    setThreadReplies(map);
    setPinned(map);
    setThread((t) => (t && t.id === id ? fn(t) : t));
  }, []);

  const applyReaction = React.useCallback(
    (ev: ReactionEvent) => {
      patchMessage(ev.message_id, (m) => {
        const has = m.reactions.some((r) => r.user_id === ev.user_id && r.emoji === ev.emoji);
        if (ev.op === "add" && !has) return { ...m, reactions: [...m.reactions, { message_id: ev.message_id, user_id: ev.user_id, emoji: ev.emoji }] };
        if (ev.op === "remove" && has) return { ...m, reactions: m.reactions.filter((r) => !(r.user_id === ev.user_id && r.emoji === ev.emoji)) };
        return m;
      });
    },
    [patchMessage]
  );

  const applyUpdate = React.useCallback(
    (row: Message) => {
      patchMessage(row.id, (m) => ({ ...m, ...row }));
      setPinned((ps) => {
        const exists = ps.some((p) => p.id === row.id);
        if (row.is_pinned && !row.deleted_at && !row.parent_id) {
          if (exists) return ps;
          const reactions = messagesRef.current.find((m) => m.id === row.id)?.reactions || [];
          return [{ ...row, reactions }, ...ps];
        }
        return exists ? ps.filter((p) => p.id !== row.id) : ps;
      });
    },
    [patchMessage]
  );

  const handleIncoming = React.useCallback(
    (row: ChatMessage) => {
      if (row.parent_id) {
        setReplyCounts((rc) => ({ ...rc, [row.parent_id!]: (rc[row.parent_id!] || 0) + 1 }));
        if (threadRef.current?.id === row.parent_id) setThreadReplies((rs) => mergeMessages(rs, [row]));
        return;
      }
      const fromOther = row.author_id !== me;
      if (nearBottomRef.current || !fromOther) stickRef.current = true;
      else setNewBelow((n) => n + 1);
      setMessages((ms) => mergeMessages(ms, [row]));
      if (fromOther && document.hasFocus()) markRead();
    },
    [me, markRead]
  );

  /* ----------------------------------------------------------- realtime */
  React.useEffect(() => {
    const supabase = createClient();
    const rt = supabase.channel(`chat:${channel.id}`, { config: { presence: { key: me } } });
    rtRef.current = rt;
    rt.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}` }, (p: RealtimePostgresInsertPayload<Message>) => {
      handleIncoming({ ...p.new, reactions: [] });
    })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}` }, (p: RealtimePostgresUpdatePayload<Message>) => {
        applyUpdate(p.new);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "channel_members", filter: `channel_id=eq.${channel.id}` }, (p: RealtimePostgresUpdatePayload<Tables<"channel_members">>) => {
        setMembers((ms) => ms.map((m) => (m.user_id === p.new.user_id ? { ...m, last_read_at: p.new.last_read_at, muted: p.new.muted, role: p.new.role } : m)));
      })
      .on("broadcast", { event: "reaction" }, ({ payload }) => {
        const ev = payload as ReactionEvent;
        if (ev.user_id !== me) applyReaction(ev);
      })
      .on("presence", { event: "sync" }, () => {
        const state = rt.presenceState<PresenceMeta>();
        const on = new Set<string>();
        const ty = new Set<string>();
        for (const key of Object.keys(state)) {
          for (const p of state[key] || []) {
            on.add(p.userId);
            if (p.typing && p.userId !== me) ty.add(p.name);
          }
        }
        setOnline([...on]);
        setTypers([...ty]);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") rt.track({ userId: me, name: firstName({ id: me, full_name: profile.full_name, avatar_url: null }), typing: false } satisfies PresenceMeta);
      });
    return () => {
      rtRef.current = null;
      supabase.removeChannel(rt);
    };
  }, [channel.id, me, profile.full_name, handleIncoming, applyUpdate, applyReaction]);

  const setTyping = React.useCallback(
    (typing: boolean) => {
      rtRef.current?.track({ userId: me, name: firstName({ id: me, full_name: profile.full_name, avatar_url: null }), typing } satisfies PresenceMeta);
    },
    [me, profile.full_name]
  );

  /* ------------------------------------------------------------ scrolling */
  React.useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prependRef.current != null) {
      el.scrollTop += el.scrollHeight - prependRef.current;
      prependRef.current = null;
      return;
    }
    if (pendingScrollRef.current) {
      const target = el.querySelector<HTMLElement>(`[data-mid="${pendingScrollRef.current}"]`);
      if (target) {
        target.scrollIntoView({ block: "center" });
        pendingScrollRef.current = null;
        stickRef.current = false;
        return;
      }
    }
    if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
      stickRef.current = false;
    }
  }, [messages]);

  // Keep pinned to the bottom while images/attachments load
  React.useEffect(() => {
    const body = bodyRef.current;
    const el = listRef.current;
    if (!body || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (nearBottomRef.current && !pendingScrollRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(body);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = dist < 120;
    if (dist < 40) setNewBelow((n) => (n ? 0 : n));
  };

  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setNewBelow(0);
  };

  /* --------------------------------------------------------- pagination */
  const fetchReplyCounts = React.useCallback((ids: string[]) => {
    if (!ids.length) return;
    createClient()
      .from("messages")
      .select("parent_id")
      .in("parent_id", ids)
      .is("deleted_at", null)
      .then(({ data }) => {
        if (!data) return;
        const counts: Record<string, number> = {};
        for (const r of data) if (r.parent_id) counts[r.parent_id] = (counts[r.parent_id] || 0) + 1;
        setReplyCounts((rc) => ({ ...rc, ...counts }));
      });
  }, []);

  const loadOlder = React.useCallback(async () => {
    if (loadingRef.current) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;
    loadingRef.current = true;
    setLoadingOlder(true);
    const { data, error } = await createClient().from("messages").select(SELECT).eq("channel_id", channel.id).is("parent_id", null).lt("created_at", oldest.created_at).order("created_at", { ascending: false }).limit(PAGE_SIZE);
    loadingRef.current = false;
    setLoadingOlder(false);
    if (error) {
      toastRef.current.push(error.message, "danger");
      return;
    }
    const rows = (data || []).map(toMessage);
    if (rows.length < PAGE_SIZE) setHasMore(false);
    if (rows.length) {
      prependRef.current = listRef.current?.scrollHeight ?? null;
      setMessages((ms) => mergeMessages(ms, rows));
      fetchReplyCounts(rows.map((r) => r.id));
    }
  }, [channel.id, fetchReplyCounts]);

  React.useEffect(() => {
    const el = topRef.current;
    const root = listRef.current;
    if (!el || !root || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadOlder();
      },
      { root, rootMargin: "240px 0px 0px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadOlder]);

  /* ------------------------------------------------------------ threads */
  const openThread = React.useCallback(async (parent: ChatMessage) => {
    setThread(parent);
    setThreadReplies([]);
    setThreadLoading(true);
    const { data, error } = await createClient().from("messages").select(SELECT).eq("parent_id", parent.id).order("created_at");
    setThreadLoading(false);
    if (error) {
      toastRef.current.push(error.message, "danger");
      return;
    }
    setThreadReplies((data || []).map(toMessage));
  }, []);

  /* ------------------------------------------------------------ jump to */
  const jumpTo = React.useCallback(
    async (id: string) => {
      const el = listRef.current;
      const existing = el?.querySelector<HTMLElement>(`[data-mid="${id}"]`);
      if (existing) {
        existing.scrollIntoView({ block: "center", behavior: "smooth" });
        setHighlightId(id);
        return;
      }
      const supabase = createClient();
      const { data: target } = await supabase.from("messages").select(SELECT).eq("id", id).maybeSingle();
      if (!target) {
        toastRef.current.push("That message is no longer available", "danger");
        return;
      }
      if (target.parent_id) {
        const { data: parent } = await supabase.from("messages").select(SELECT).eq("id", target.parent_id).maybeSingle();
        if (parent) {
          await openThread(toMessage(parent));
          setHighlightId(id);
          listRef.current?.querySelector<HTMLElement>(`[data-mid="${parent.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        return;
      }
      const [{ data: before }, { data: after }] = await Promise.all([
        supabase.from("messages").select(SELECT).eq("channel_id", channel.id).is("parent_id", null).lt("created_at", target.created_at).order("created_at", { ascending: false }).limit(30),
        supabase.from("messages").select(SELECT).eq("channel_id", channel.id).is("parent_id", null).gte("created_at", target.created_at).order("created_at").limit(30),
      ]);
      const rows = [...(before || []).reverse(), ...(after || [])].map(toMessage);
      pendingScrollRef.current = id;
      setHighlightId(id);
      setHasMore(true);
      setMessages(rows);
      fetchReplyCounts(rows.map((r) => r.id));
    },
    [channel.id, fetchReplyCounts, openThread]
  );

  React.useEffect(() => {
    if (!focusMessageId) return;
    const t = setTimeout(() => jumpTo(focusMessageId), 60);
    return () => clearTimeout(t);
  }, [focusMessageId, jumpTo]);

  React.useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 2600);
    return () => clearTimeout(t);
  }, [highlightId]);

  /* -------------------------------------------------------------- search */
  React.useEffect(() => {
    const q = search.trim();
    if (q.length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      createClient()
        .from("messages")
        .select(SELECT)
        .eq("channel_id", channel.id)
        .is("deleted_at", null)
        .ilike("body", `%${q.replace(/[%_]/g, "")}%`)
        .order("created_at", { ascending: false })
        .limit(40)
        .then(({ data }) => {
          if (alive) setServerHits((data || []).map(toMessage));
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search, channel.id]);

  const searchResults = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const local = messages.filter((m) => !m.deleted_at && m.body.toLowerCase().includes(q));
    const merged = mergeMessages(local, serverHits.filter((m) => m.body.toLowerCase().includes(q)));
    return merged.reverse().slice(0, 60);
  }, [search, messages, serverHits]);

  /* ---------------------------------------------------------------- send */
  const send = React.useCallback(
    async (p: SendPayload, parentId: string | null = null) => {
      const { data, error } = await createClient()
        .from("messages")
        .insert({ channel_id: channel.id, author_id: me, body: p.body, kind: p.kind, attachments: p.attachments, mentions: p.mentions, parent_id: parentId })
        .select("*")
        .single();
      if (error || !data) {
        toastRef.current.push(error?.message || "Could not send", "danger");
        return false;
      }
      handleIncoming({ ...data, reactions: [] });
      // @GHLBuddy in the message → ask Buddy with this channel as context and post its answer as a reply from you.
      if (p.body && BUDDY_MENTION_RE.test(p.body) && !isBuddyMessage(p.body)) {
        askBuddyInChannel(channel.id, p.body)
          .then(async ({ body }) => {
            const { data: reply, error: rErr } = await createClient().from("messages").insert({ channel_id: channel.id, author_id: me, body, kind: "text", parent_id: parentId }).select("*").single();
            if (rErr || !reply) throw new Error(rErr?.message || "Could not post Buddy's answer");
            handleIncoming({ ...reply, reactions: [] });
          })
          .catch((e: Error & { disabled?: boolean }) => toastRef.current.push(e.disabled ? "GHL Buddy is not configured yet" : e.message || "GHL Buddy could not answer", "danger"));
      }
      return true;
    },
    [channel.id, me, handleIncoming]
  );

  const sendSystem = React.useCallback(
    async (body: string, parentId: string | null) => {
      const { data } = await createClient().from("messages").insert({ channel_id: channel.id, author_id: me, body, kind: "system", parent_id: parentId }).select("*").single();
      if (data) handleIncoming({ ...data, reactions: [] });
    },
    [channel.id, me, handleIncoming]
  );

  /* ----------------------------------------------------------- reactions */
  const toggleReaction = React.useCallback(
    async (m: ChatMessage, emoji: string) => {
      const mine = m.reactions.some((r) => r.user_id === me && r.emoji === emoji);
      const ev: ReactionEvent = { message_id: m.id, user_id: me, emoji, op: mine ? "remove" : "add" };
      applyReaction(ev);
      const supabase = createClient();
      const { error } = mine ? await supabase.from("message_reactions").delete().match({ message_id: m.id, user_id: me, emoji }) : await supabase.from("message_reactions").insert({ message_id: m.id, user_id: me, emoji });
      if (error) {
        applyReaction({ ...ev, op: mine ? "add" : "remove" });
        toastRef.current.push(error.message, "danger");
        return;
      }
      rtRef.current?.send({ type: "broadcast", event: "reaction", payload: ev });
    },
    [me, applyReaction]
  );

  /* -------------------------------------------------------------- actions */
  const channelId = channel.id;
  const pinMessage = React.useCallback(
    async (m: ChatMessage) => {
      const next = !m.is_pinned;
      const { error } = await createClient().from("messages").update({ is_pinned: next }).eq("id", m.id);
      if (error) {
        toastRef.current.push(error.message.includes("row-level security") ? "Only the author or a manager can pin this message." : error.message, "danger");
        return;
      }
      applyUpdate({ ...m, is_pinned: next });
      toastRef.current.push(next ? "Pinned" : "Unpinned", "success");
    },
    [applyUpdate]
  );
  const deleteMessage = React.useCallback(
    async (m: ChatMessage) => {
      if (!window.confirm("Delete this message?")) return;
      const now = new Date().toISOString();
      const { error } = await createClient().from("messages").update({ deleted_at: now }).eq("id", m.id);
      if (error) toastRef.current.push(error.message, "danger");
      else applyUpdate({ ...m, deleted_at: now });
    },
    [applyUpdate]
  );
  const copyLink = React.useCallback(async (m: ChatMessage) => {
    const url = `${window.location.origin}/chat/${channelId}?m=${m.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toastRef.current.push("Link copied", "success");
    } catch {
      toastRef.current.push(url, "info");
    }
  }, [channelId]);

  const onAction = React.useCallback(
    (a: MessageAction, m: ChatMessage) => {
      if (a === "sheet") setSheetFor(m);
      else if (a === "reply") openThread(m);
      else if (a === "task" || a === "extract" || a === "decision" || a === "forward") setModal({ kind: a, m });
      else if (a === "edit") setEditingId(m.id);
      else if (a === "copy") copyLink(m);
      else if (a === "pin") pinMessage(m);
      else if (a === "delete") deleteMessage(m);
    },
    [openThread, copyLink, pinMessage, deleteMessage, setSheetFor, setModal, setEditingId]
  );

  const saveEdit = React.useCallback(
    async (m: ChatMessage, body: string) => {
      if (!body) return false;
      const now = new Date().toISOString();
      const { error } = await createClient().from("messages").update({ body, edited_at: now }).eq("id", m.id);
      if (error) {
        toastRef.current.push(error.message, "danger");
        return false;
      }
      applyUpdate({ ...m, body, edited_at: now });
      return true;
    },
    [applyUpdate]
  );

  /* -------------------------------------------------------- membership */
  const toggleMute = async () => {
    const mine = members.find((m) => m.user_id === me);
    if (!mine) return;
    const next = !mine.muted;
    const { error } = await createClient().from("channel_members").update({ muted: next }).match({ channel_id: channel.id, user_id: me });
    if (error) toast.push(error.message, "danger");
    else {
      setMembers((ms) => ms.map((m) => (m.user_id === me ? { ...m, muted: next } : m)));
      toast.push(next ? "Notifications muted" : "Notifications on", "success");
      router.refresh();
    }
  };

  const addMember = async (userId: string) => {
    const { error } = await createClient().from("channel_members").insert({ channel_id: channel.id, user_id: userId });
    if (error) {
      toast.push(error.message, "danger");
      return false;
    }
    const p = people.find((x) => x.id === userId) || null;
    setMembers((ms) => [...ms, { channel_id: channel.id, user_id: userId, role: "member", last_read_at: new Date().toISOString(), muted: false, joined_at: new Date().toISOString(), profile: p }]);
    sendSystem(`${profile.full_name} added ${p?.full_name || "someone"} to the channel`, null);
    toast.push(`${p?.full_name || "Member"} added`, "success");
    return true;
  };

  const leave = async () => {
    const { error } = await createClient().from("channel_members").delete().match({ channel_id: channel.id, user_id: me });
    if (error) toast.push(error.message, "danger");
    else toast.push(`Left #${channel.name}`, "success");
  };

  const join = async () => {
    // Upsert: if the membership row already exists (stale member list), treat it as joined instead of surfacing a PK error.
    const { error } = await createClient().from("channel_members").upsert({ channel_id: channel.id, user_id: me }, { onConflict: "channel_id,user_id", ignoreDuplicates: true });
    if (error) toast.push(error.message, "danger");
    else {
      toast.push(`Joined #${channel.name}`, "success");
      router.refresh();
    }
  };

  /* ------------------------------------------------------------- derived */
  const myRow = members.find((m) => m.user_id === me);
  const isMember = !!myRow;
  const muted = !!myRow?.muted;
  const isOwner = channel.owner_id === me || channel.co_owner_id === me;
  const canBringIn = !isDm && isMember;
  const canConvert = !isDm && channel.type !== "project" && channel.type !== "task" && channel.type !== "help" && !channel.project_id && (isOwner || managerPlus);
  const canPin = (m: ChatMessage) => m.author_id === me || managerPlus;
  const lastMine = React.useMemo(() => [...messages].reverse().find((m) => m.author_id === me && !m.deleted_at && m.kind !== "system"), [messages, me]);
  const seenLabel = React.useMemo(() => {
    if (!lastMine) return null;
    const readers = members.filter((mm) => mm.user_id !== me && mm.last_read_at >= lastMine.created_at);
    if (!readers.length) return null;
    if (isDm) return "Seen";
    if (readers.length <= 2) return `Seen by ${readers.map((r) => firstName(r.profile)).join(", ")}`;
    return `Seen by ${readers.length}`;
  }, [lastMine, members, me, isDm]);

  const title = isDm ? personName(other) : channel.type === "project" || channel.type === "task" ? channel.name : `#${channel.name}`;
  const subtitle = isDm
    ? other && onlineSet.has(other.id)
      ? "Online"
      : otherLive?.presence && otherLive.presence !== "offline"
        ? humanize(otherLive.presence)
        : other
          ? other.designation || "Offline"
          : "Direct message"
    : channel.description || `${members.length} member${members.length === 1 ? "" : "s"}${online.length ? ` · ${online.length} online` : ""}`;

  const typingLine = typers.length ? `${typers.slice(0, 2).join(" and ")}${typers.length > 2 ? ` and ${typers.length - 2} more` : ""} ${typers.length === 1 ? "is" : "are"} typing…` : null;

  /* -------------------------------------------------------------- render */
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <header className="h-[55px] shrink-0 border-b bg-[var(--bg-elev)] flex items-center gap-1.5 px-2 sm:px-3">
        <Link href="/chat" className="btn btn-ghost btn-sm btn-icon lg:hidden" aria-label="Back to conversations">
          <ChevronLeft size={19} />
        </Link>
        <button type="button" onClick={() => setModal({ kind: "members" })} className="flex items-center gap-2.5 min-w-0 flex-1 text-left h-11 rounded-[var(--radius-sm)] px-1 hover:bg-[var(--neutral-bg)]">
          {isDm ? <Avatar name={other?.full_name} src={other?.avatar_url} size={36} presence={other && onlineSet.has(other.id) ? "available" : otherLive?.presence} /> : <ChannelIcon channel={channel} />}
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-semibold text-sm truncate">
              <span className="truncate">{title}</span>
              {!isDm && <VisibilityPill visibility={channel.visibility} />}
              {channel.is_readonly && <Pill tone="tone-warn" className="shrink-0">read-only</Pill>}
            </span>
            <span className="flex items-center gap-1.5 min-w-0">
              <span className={cn("block text-[11px] truncate min-w-0", isDm && other && onlineSet.has(other.id) ? "text-success" : "text-muted")}>{subtitle}</span>
              {!isDm && channel.owner_id && <OwnerChip id={channel.owner_id} className="hidden sm:inline-flex" />}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          {canBringIn && (
            <Button variant="ghost" size="sm" icon onClick={() => setModal({ kind: "bringin" })} aria-label="Add people" title="Bring someone in">
              <UserPlus size={17} />
            </Button>
          )}
          <EntityLive
            ctx={{ channelId: channel.id, projectId: channel.project_id, personId: isDm ? other?.id : null, title: title }}
            size="sm"
            compact
          />
          <BuddyQuickActions
            scope={{ channelId: channel.id, projectId: channel.project_id || undefined, path: `/chat/${channel.id}` }}
            actions={[{ label: "What am I looking at", mode: "looking_at" }, { label: "Who can help", mode: "who_can_help" }, { label: "Draft a reply", mode: "draft", message: "Draft a reply to the latest message in this conversation" }, { label: "I'm stuck", mode: "stuck" }]}
            extra={[{ label: "Summarise", mode: "chat", message: "Summarise this conversation: key points, decisions and who owes what" }, { label: "Unresolved", mode: "chat", message: "List the unresolved questions and open requests in this conversation, with who should answer each" }, { label: "Tasks we agreed", mode: "breakdown", message: "Extract the tasks we agreed in this conversation and propose them" }]}
          />
          {unreadCount > 20 && (
            <Button size="sm" variant="secondary" onClick={() => setModal({ kind: "catchup" })} className="hidden sm:inline-flex">
              <Sparkles size={14} className="text-[var(--accent)]" /> Catch me up
            </Button>
          )}
          {!isDm && members.length > 0 && (
            <button type="button" onClick={() => setModal({ kind: "members" })} className="hidden md:inline-flex items-center px-1.5 h-8 rounded-[var(--radius-sm)] hover:bg-[var(--neutral-bg)]" aria-label="Members">
              <AvatarStack people={members.map((m) => ({ id: m.user_id, full_name: m.profile?.full_name, avatar_url: m.profile?.avatar_url }))} size={22} max={3} />
            </button>
          )}
          <Button variant="ghost" size="sm" icon onClick={() => { setSearchOpen((o) => !o); setShowPinned(false); }} aria-label="Search in conversation" className={cn(searchOpen && "bg-[var(--neutral-bg)]")}>
            <Search size={17} />
          </Button>
          <button type="button" onClick={() => { setShowPinned((o) => !o); setSearchOpen(false); }} className={cn("relative btn btn-ghost btn-sm btn-icon", showPinned && "bg-[var(--neutral-bg)]")} aria-label="Pinned messages">
            <Pin size={16} />
            {pinned.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-[var(--brand)] text-[var(--brand-fg)] text-[9px] font-semibold flex items-center justify-center">{pinned.length}</span>}
          </button>
          <Menu
            trigger={
              <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="More">
                <MoreVertical size={17} />
              </button>
            }
            width={220}
          >
            <MenuItem icon={<Sparkles size={14} className="text-[var(--accent)]" />} onClick={() => setModal({ kind: "catchup" })}>{unreadCount > 20 ? "Catch me up" : "Summarise recent"}</MenuItem>
            <MenuItem icon={<Info size={14} />} onClick={() => setModal({ kind: "members" })}>Details & members</MenuItem>
            {canBringIn && <MenuItem icon={<UserPlus size={14} />} onClick={() => setModal({ kind: "bringin" })}>Bring someone in</MenuItem>}
            {canConvert && <MenuItem icon={<FolderPlus size={14} />} onClick={() => setModal({ kind: "convert" })}>Convert to project</MenuItem>}
            {isMember && <MenuItem icon={muted ? <Bell size={14} /> : <BellOff size={14} />} onClick={toggleMute}>{muted ? "Unmute" : "Mute"} notifications</MenuItem>}
            {channel.project_id && <MenuItem icon={<FolderKanban size={14} />} onClick={() => router.push(`/projects/${channel.project_id}`)}>Open project</MenuItem>}
            <MenuItem icon={<Link2 size={14} />} onClick={() => navigator.clipboard.writeText(`${window.location.origin}/chat/${channel.id}`).then(() => toast.push("Link copied", "success"))}>Copy channel link</MenuItem>
            {isMember && !isDm && channel.type !== "project" && channel.type !== "task" && (
              <MenuItem icon={<LogOut size={14} />} danger onClick={async () => { if (window.confirm(`Leave #${channel.name}?`)) { await leave(); router.push("/chat"); router.refresh(); } }}>Leave channel</MenuItem>
            )}
          </Menu>
        </div>
      </header>

      {/* Search panel */}
      {searchOpen && (
        <div className="shrink-0 border-b bg-[var(--bg-elev)] px-3 py-2 space-y-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input pl-9 pr-9" placeholder={`Search in ${title}…`} value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
            <button type="button" onClick={() => { setSearch(""); setSearchOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-icon" aria-label="Close search">
              <X size={14} />
            </button>
          </div>
          {search.trim().length >= 2 && (
            <div className="max-h-64 overflow-y-auto rounded-[var(--radius-sm)] border divide-y">
              {searchResults.length ? (
                searchResults.map((m) => (
                  <button key={m.id} type="button" onClick={() => jumpTo(m.id)} className="w-full text-left px-3 py-2 hover:bg-[var(--neutral-bg)]">
                    <div className="text-[11px] text-muted mb-0.5">{personName(authorOf(m.author_id))} · {dayLabel(m.created_at)} {timeLabel(m.created_at)}{m.parent_id ? " · in thread" : ""}</div>
                    <div className="text-sm truncate-2">{m.body}</div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-sm text-muted">No messages match.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pinned panel */}
      {showPinned && (
        <div className="shrink-0 border-b bg-[var(--bg-elev)] px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="eyebrow">Pinned · {pinned.length}</span>
            <button type="button" onClick={() => setShowPinned(false)} className="btn btn-ghost btn-xs btn-icon" aria-label="Close pinned">
              <X size={14} />
            </button>
          </div>
          {pinned.length ? (
            <div className="max-h-56 overflow-y-auto space-y-1">
              {pinned.map((m) => (
                <div key={m.id} className="flex items-start gap-2 rounded-[var(--radius-sm)] border px-3 py-2">
                  <button type="button" onClick={() => jumpTo(m.id)} className="min-w-0 flex-1 text-left">
                    <div className="text-[11px] text-muted mb-0.5">{personName(authorOf(m.author_id))} · {dayLabel(m.created_at)}</div>
                    {m.body ? <MessageBody body={m.body} className="!text-sm truncate-2" /> : <span className="text-sm text-muted">{parseAttachments(m.attachments).length} attachment(s)</span>}
                  </button>
                  {canPin(m) && (
                    <button type="button" onClick={() => onAction("pin", m)} className="btn btn-ghost btn-xs" aria-label="Unpin">
                      Unpin
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted py-2">Nothing pinned yet. Pin important messages from the message menu.</div>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col relative">
          <div ref={listRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div ref={bodyRef} className="py-2">
              <div ref={topRef} className="h-px" />
              {hasMore ? (
                <div className="flex justify-center py-2 h-8">{loadingOlder && <Spinner />}</div>
              ) : (
                <div className="px-4 pt-6 pb-4 text-center">
                  {isDm ? <Avatar name={other?.full_name} src={other?.avatar_url} size={56} className="mx-auto" /> : <div className="mx-auto w-14 h-14 flex items-center justify-center"><ChannelIcon channel={channel} /></div>}
                  <div className="h3 mt-3">{title}</div>
                  <div className="text-xs text-muted mt-1 max-w-sm mx-auto">
                    {isDm ? `This is the beginning of your conversation with ${firstName(other)}.` : channel.description || `This is the beginning of ${title}.`}
                  </div>
                </div>
              )}
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = isNewDay(prev, m);
                return (
                  <React.Fragment key={m.id}>
                    {newDay && <DateSeparator label={dayLabel(m.created_at)} />}
                    <MessageItem
                      m={m}
                      author={authorOf(m.author_id)}
                      me={me}
                      grouped={!newDay && isContinuation(prev, m) && !isBuddyMessage(m.body) && !isBuddyMessage(prev?.body)}
                      highlighted={highlightId === m.id}
                      canPin={canPin(m)}
                      replyCount={replyCounts[m.id]}
                      seenBy={lastMine?.id === m.id ? seenLabel : null}
                      editing={editingId === m.id}
                      onAction={onAction}
                      onReact={toggleReaction}
                      onSaveEdit={saveEdit}
                      onCancelEdit={() => setEditingId(null)}
                    />
                  </React.Fragment>
                );
              })}
              {!messages.length && !hasMore && <div className="text-center text-sm text-muted py-6">Say hello 👋</div>}
            </div>
          </div>

          {newBelow > 0 && (
            <button type="button" onClick={scrollToBottom} className="absolute left-1/2 -translate-x-1/2 bottom-[76px] z-10 btn btn-primary btn-sm rounded-full anim-pop" style={{ boxShadow: "var(--shadow-lg)" }}>
              <ArrowDown size={14} /> {newBelow} new message{newBelow > 1 ? "s" : ""}
            </button>
          )}

          <div className="h-5 shrink-0 px-4 text-[11px] text-muted truncate flex items-center bg-[var(--bg)]">{typingLine}</div>
          {awayNote && (
            <div className="shrink-0 px-3 pb-1.5 bg-[var(--bg)] anim-fade-in">
              <span className={cn("pill max-w-full", otherDnd ? "tone-violet" : "tone-neutral")} title="Sending is fine — this just sets expectations on reply time"><MoonStar size={10} className="shrink-0" /><span className="truncate">{awayNote}</span></span>
            </div>
          )}

          <HuddleNudge channelId={channel.id} />

          {!isMember && !isDm ? (
            <div className="border-t bg-[var(--bg-elev)] px-4 py-3 flex items-center justify-between gap-3 safe-b">
              <span className="text-sm text-muted">You are viewing {title}. Join to post.</span>
              <Button variant="primary" size="sm" onClick={join}>Join channel</Button>
            </div>
          ) : readOnly ? (
            <div className="border-t bg-[var(--bg-elev)] px-4 py-3 text-xs text-muted text-center safe-b">
              <Lock size={12} className="inline mr-1 -mt-0.5" /> This channel is read-only. Only managers and above can post.
            </div>
          ) : (
            <Composer channelId={channel.id} people={people} placeholder={isDm ? `Message ${firstName(other)}${awayNote ? (otherDnd ? " · on do not disturb" : " · outside working hours") : ""}` : `Message ${title}`} onSend={(p) => send(p, null)} onTyping={setTyping} />
          )}
        </div>

        {thread && (
          <div className="fixed inset-0 z-[95] lg:static lg:z-auto lg:w-[360px] xl:w-[400px] lg:border-l lg:shrink-0 bg-[var(--bg-elev)]">
            <ThreadPanel
              channelId={channel.id}
              parent={thread}
              replies={threadReplies}
              loading={threadLoading}
              me={me}
              people={people}
              canPin={canPin(thread)}
              authorOf={authorOf}
              onClose={() => setThread(null)}
              onSend={(p) => send(p, thread.id)}
              onReact={toggleReaction}
              onAction={onAction}
              editingId={editingId}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditingId(null)}
              onTyping={setTyping}
            />
          </div>
        )}
      </div>

      {/* Mobile action sheet */}
      <MessageActionSheet m={sheetFor} me={me} canPin={sheetFor ? canPin(sheetFor) : false} inThread={!!thread && sheetFor?.parent_id === thread.id} onClose={() => setSheetFor(null)} onAction={onAction} onReact={toggleReaction} />

      {/* Create task */}
      <Modal open={modal?.kind === "task"} onClose={() => setModal(null)} title="Create task from message" width={600}>
        {modal?.kind === "task" && modal.m && (
          <>
            <div className="rounded-[var(--radius-sm)] border sunken px-3 py-2 mb-3 text-sm max-h-24 overflow-hidden">
              <div className="text-[11px] text-muted mb-0.5">{personName(authorOf(modal.m.author_id))} · {dayLabel(modal.m.created_at)} {timeLabel(modal.m.created_at)}</div>
              <div className="truncate-2">{modal.m.body}</div>
            </div>
            <QuickTaskForm
              defaults={{
                title: modal.m.body.slice(0, 120),
                description: modal.m.body,
                source_message_id: modal.m.id,
                project_id: channel.project_id,
                department_id: channel.department_id,
                assignee_id: modal.m.author_id,
              }}
              onCancel={() => setModal(null)}
              onCreated={async (id) => {
                const src = modal.m!;
                setModal(null);
                const { data } = await createClient().from("tasks").select("title").eq("id", id).maybeSingle();
                sendSystem(`${profile.full_name} created a task from this message: ${data?.title || src.body.slice(0, 120)} [/tasks/${id}]`, src.id);
              }}
            />
          </>
        )}
      </Modal>

      <ExtractTasksModal
        m={modal?.kind === "extract" ? modal.m || null : null}
        channel={channel}
        replyCount={modal?.kind === "extract" && modal.m ? replyCounts[modal.m.id] || 0 : 0}
        threadReplies={modal?.kind === "extract" && modal.m && thread && thread.id === modal.m.id ? threadReplies : undefined}
        authorOf={authorOf}
        onClose={() => setModal(null)}
        onCreated={(created, src) => {
          const listing = created.map((t) => `${t.title} [/tasks/${t.id}]`).join(" · ");
          sendSystem(`${profile.full_name} extracted ${created.length} task${created.length === 1 ? "" : "s"} from this message: ${listing}`, src.parent_id || src.id);
        }}
      />

      <RecordDecisionModal
        m={modal?.kind === "decision" ? modal.m || null : null}
        channel={channel}
        members={members}
        onClose={() => setModal(null)}
        onRecorded={(id, t) => {
          const src = modal?.m;
          if (src) sendSystem(`${profile.full_name} recorded a decision: ${t} [/decisions/${id}]`, src.id);
        }}
      />

      <ForwardModal m={modal?.kind === "forward" ? modal.m || null : null} from={channel} authorOf={authorOf} onClose={() => setModal(null)} />

      <CatchUpModal
        open={modal?.kind === "catchup"}
        onClose={() => setModal(null)}
        channelId={channel.id}
        since={myMember?.last_read_at || null}
        me={me}
        unreadCount={unreadCount}
        loaded={initialMessages}
        authorOf={authorOf}
        onJump={jumpTo}
        mode={unreadCount > 20 ? "unread" : "recent"}
      />

      <MembersDrawer open={modal?.kind === "members"} onClose={() => setModal(null)} channel={channel} members={members} online={online} onAdd={addMember} onLeave={leave} />

      <BringInModal
        open={modal?.kind === "bringin"}
        onClose={() => setModal(null)}
        channel={channel}
        memberIds={members.map((m) => m.user_id)}
        onAdded={(userId) => {
          if (members.some((m) => m.user_id === userId)) return;
          const p = people.find((x) => x.id === userId) || null;
          const now = new Date().toISOString();
          setMembers((ms) => [...ms, { channel_id: channel.id, user_id: userId, role: "member", last_read_at: now, muted: false, joined_at: now, profile: p }]);
        }}
      />

      <ConvertProjectModal open={modal?.kind === "convert"} onClose={() => setModal(null)} channel={channel} />
    </div>
  );
}
