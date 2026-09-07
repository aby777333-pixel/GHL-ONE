"use client";

import * as React from "react";
import Link from "next/link";
import { Hash, Lock, Megaphone, FolderKanban, CheckSquare, BellOff, Plus, Building2, Users, MessageSquare } from "lucide-react";
import { Avatar, Button, SearchInput, EmptyState } from "@/components/ui";
import { cn, ago } from "@/lib/utils";
import type { ChannelListItem } from "./types";
import { Blink } from "@/components/providers/ActivityProvider";

const SECTION_ORDER = ["dm", "channel", "project", "task"] as const;
type Section = (typeof SECTION_ORDER)[number];
const SECTION_LABEL: Record<Section, string> = { dm: "Direct messages", channel: "Channels", project: "Projects", task: "Tasks" };

function sectionOf(c: ChannelListItem): Section {
  if (c.type === "dm") return "dm";
  if (c.type === "project") return "project";
  if (c.type === "task") return "task";
  return "channel";
}

function ChannelGlyph({ c }: { c: ChannelListItem }) {
  if (c.type === "dm") return <Avatar name={c.other?.full_name || "?"} src={c.other?.avatar_url} size={34} presence={c.other?.presence} />;
  const tone = c.type === "project" ? "tone-brand" : c.type === "task" ? "tone-success" : c.type === "announcement" ? "tone-warn" : c.type === "department" ? "tone-violet" : "tone-info";
  const Icon = c.type === "project" ? FolderKanban : c.type === "task" ? CheckSquare : c.type === "announcement" ? Megaphone : c.type === "department" ? Building2 : c.type === "group" ? (c.is_private ? Lock : Users) : Hash;
  return (
    <span className={cn("w-[34px] h-[34px] rounded-[10px] flex items-center justify-center shrink-0", tone)}>
      <Icon size={16} />
    </span>
  );
}

export function ChannelList({ items, activeId, onNew }: { items: ChannelListItem[]; activeId?: string | null; onNew: () => void }) {
  const [q, setQ] = React.useState("");
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  const groups = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle ? items.filter((c) => (c.type === "dm" ? c.other?.full_name || "" : c.name).toLowerCase().includes(needle) || (c.description || "").toLowerCase().includes(needle)) : items;
    const by: Record<Section, ChannelListItem[]> = { dm: [], channel: [], project: [], task: [] };
    for (const c of filtered) by[sectionOf(c)].push(c);
    return SECTION_ORDER.map((s) => ({ key: s, label: SECTION_LABEL[s], items: by[s], unread: by[s].reduce((a, c) => a + (c.muted ? 0 : c.unread), 0) })).filter((g) => g.items.length);
  }, [items, q]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <h1 className="h2">Chat</h1>
          <Button variant="primary" size="sm" onClick={onNew}>
            <Plus size={15} /> New
          </Button>
        </div>
        <SearchInput placeholder="Search conversations…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
        {!groups.length && <EmptyState icon={<MessageSquare size={18} />} title={q ? "No matches" : "No conversations yet"} hint={q ? "Try another name." : "Start a direct message or join a channel."} action={!q ? <Button size="sm" onClick={onNew}>Start one</Button> : undefined} />}
        {groups.map((g) => {
          const isCollapsed = !!collapsed[g.key] && !q;
          return (
            <div key={g.key} className="mt-2">
              <button type="button" onClick={() => setCollapsed((s) => ({ ...s, [g.key]: !s[g.key] }))} className="w-full flex items-center gap-2 px-2 h-7 eyebrow hover:text-[var(--fg-2)]">
                <span>{g.label}</span>
                <span className="text-[10px] font-medium normal-case tracking-normal">{g.items.length}</span>
                {isCollapsed && g.unread > 0 && <span className="ml-auto pill tone-brand">{g.unread}</span>}
              </button>
              {!isCollapsed && (
                <div className="space-y-px">
                  {g.items.map((c) => {
                    const active = c.id === activeId;
                    const title = c.type === "dm" ? c.other?.full_name || "You" : c.type === "project" || c.type === "task" ? c.name : `#${c.name}`;
                    const hasUnread = c.unread > 0;
                    return (
                      <Link
                        key={c.id}
                        href={`/chat/${c.id}`}
                        className={cn("flex items-center gap-2.5 px-2 h-[52px] rounded-[var(--radius-sm)] transition-colors", active ? "bg-[color-mix(in_oklab,var(--brand)_12%,transparent)]" : "hover:bg-[var(--neutral-bg)]")}
                      >
                        <ChannelGlyph c={c} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className={cn("text-sm truncate", hasUnread && !c.muted ? "font-semibold" : "font-medium text-2", active && "text-[var(--fg)]")}>{title}</span>
                            {c.is_private && c.type !== "dm" && <Lock size={11} className="text-muted shrink-0" />}
                            {c.muted && <BellOff size={11} className="text-muted shrink-0" />}
                            {!hasUnread && <Blink zone={`channel:${c.id}`} size={6} />}
                          </span>
                          <span className="block text-[11px] text-muted truncate">
                            {c.type === "dm" ? c.other?.designation || (c.other?.presence && c.other.presence !== "offline" ? c.other.presence.replace("_", " ") : "") || " " : c.description || c.type}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-1 shrink-0">
                          <span className={cn("text-[10px] num", hasUnread && !c.muted ? "text-[var(--brand-2)] font-medium" : "text-muted")}>{c.last_message_at ? ago(c.last_message_at).replace(" ago", "") : ""}</span>
                          {hasUnread && <span className={cn("pill", c.muted ? "tone-muted" : "tone-brand")}>{c.unread > 99 ? "99+" : c.unread}</span>}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
