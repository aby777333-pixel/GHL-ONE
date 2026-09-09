"use client";

import * as React from "react";
import { Filter, Inbox, Plus, UserPlus, X } from "lucide-react";
import { Avatar, Button, Menu, MenuItem, SearchInput, Select, Skeleton, EmptyState } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";
import { ConversationRowItem } from "./ConnectBits";
import { CHANNEL_LABEL, CONV_STATUS_LABEL, type ConversationListItem, type InboxLite } from "./lib";

export type ListView = "mine" | "unclaimed" | "all" | "snoozed" | "resolved";
export type ListFilters = { channel: string; priority: string; vip: boolean; unread: boolean; breached: boolean };
export const EMPTY_FILTERS: ListFilters = { channel: "", priority: "", vip: false, unread: false, breached: false };
export type Lane = "open" | "pending" | "snoozed" | "resolved";
const LANES: Lane[] = ["open", "pending", "snoozed", "resolved"];
const VIEWS: { key: ListView; label: string }[] = [
  { key: "mine", label: "Mine" },
  { key: "unclaimed", label: "Unclaimed" },
  { key: "all", label: "All" },
  { key: "snoozed", label: "Snoozed" },
  { key: "resolved", label: "Resolved" },
];

export type AgentChip = { id: string; full_name: string; avatar_url?: string | null };

export function ConversationList({
  items, loading, inboxes, inboxId, onInbox, view, onView, query, onQuery, filters, onFilters, activeId, onSelect, agents, onAssign, onLane, onNew, counts,
}: {
  items: ConversationListItem[];
  loading: boolean;
  inboxes: InboxLite[];
  inboxId: string;
  onInbox: (id: string) => void;
  view: ListView;
  onView: (v: ListView) => void;
  query: string;
  onQuery: (q: string) => void;
  filters: ListFilters;
  onFilters: (f: ListFilters) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  agents: AgentChip[];
  onAssign: (conversationId: string, userId: string | null) => void;
  onLane: (conversationId: string, lane: Lane) => void;
  onNew: () => void;
  counts?: Partial<Record<ListView, number>>;
}) {
  const { profile } = useSession();
  const [showFilters, setShowFilters] = React.useState(false);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const activeFilters = Object.values(filters).filter(Boolean).length;

  const dragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/x-conversation", id);
    e.dataTransfer.effectAllowed = "move";
    setDragging(id);
  };
  const readId = (e: React.DragEvent) => e.dataTransfer.getData("text/x-conversation") || dragging;
  const allow = (e: React.DragEvent, key: string) => {
    if (!dragging && !e.dataTransfer.types.includes("text/x-conversation")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (over !== key) setOver(key);
  };
  const finish = () => {
    setDragging(null);
    setOver(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0" onDragEnd={finish}>
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-[var(--radius-sm)] tone-brand flex items-center justify-center shrink-0"><Inbox size={14} /></span>
          <Select value={inboxId} onChange={(e) => onInbox(e.target.value)} aria-label="Inbox" className="flex-1">
            <option value="">All inboxes</option>
            {inboxes.map((i) => (
              <option key={i.id} value={i.id}>{i.name}{i.address ? ` · ${i.address}` : ""}</option>
            ))}
          </Select>
          <Button size="sm" icon variant="primary" onClick={onNew} aria-label="New conversation" title="New conversation"><Plus size={15} /></Button>
        </div>
        <div className="flex gap-2">
          <SearchInput value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search contacts, subjects…" className="flex-1" />
          <Button size="sm" icon variant={activeFilters ? "primary" : "secondary"} onClick={() => setShowFilters((s) => !s)} aria-label="Filters" title="Filters"><Filter size={14} /></Button>
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 gap-2 text-xs anim-fade-up">
            <Select value={filters.channel} onChange={(e) => onFilters({ ...filters, channel: e.target.value })} aria-label="Channel">
              <option value="">Any channel</option>
              {Object.entries(CHANNEL_LABEL).filter(([k]) => k !== "phone").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select value={filters.priority} onChange={(e) => onFilters({ ...filters, priority: e.target.value })} aria-label="Priority">
              <option value="">Any priority</option>
              {["critical", "urgent", "high", "normal", "low"].map((p) => <option key={p} value={p}>{p[0]!.toUpperCase() + p.slice(1)}</option>)}
            </Select>
            <Toggle checked={filters.vip} onChange={(v) => onFilters({ ...filters, vip: v })}>VIP only</Toggle>
            <Toggle checked={filters.unread} onChange={(v) => onFilters({ ...filters, unread: v })}>Unread</Toggle>
            <Toggle checked={filters.breached} onChange={(v) => onFilters({ ...filters, breached: v })}>SLA breached</Toggle>
            {activeFilters > 0 && <button className="text-left link inline-flex items-center gap-1" onClick={() => onFilters(EMPTY_FILTERS)}><X size={11} /> Clear</button>}
          </div>
        )}
        {/* Wrap, do not scroll. In the narrow list pane the five chips overflowed, and
            `no-scrollbar` removed the only hint that "Resolved" was still there off the edge. */}
        <div className="flex flex-wrap gap-1 -mx-1 px-1">
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => onView(v.key)} className={cn("pill pill-lg whitespace-nowrap", view === v.key ? "tone-brand" : "tone-neutral")}>
              {v.label}{counts?.[v.key] != null && <span className="opacity-75 num">{counts[v.key]}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Drop targets: agent chips + status lanes (appear while dragging; also always usable by keyboard via the row menu). */}
      <div className={cn("border-b px-3 py-2 text-[11px] transition-all", dragging ? "block" : "hidden lg:block")}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="eyebrow mr-1">Assign</span>
          {agents.slice(0, 12).map((a) => (
            <button
              key={a.id}
              title={`Assign to ${a.full_name}`}
              onDragOver={(e) => allow(e, `agent:${a.id}`)}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                const id = readId(e);
                if (id) onAssign(id, a.id);
                finish();
              }}
              onClick={() => activeId && onAssign(activeId, a.id)}
              className={cn("inline-flex items-center gap-1 rounded-full border pl-0.5 pr-2 h-6 bg-[var(--bg-elev)] transition-colors", over === `agent:${a.id}` && "border-[var(--brand-2)] bg-[var(--neutral-bg)]")}
            >
              <Avatar name={a.full_name} src={a.avatar_url} size={18} />
              <span className="max-w-[80px] truncate">{a.id === profile.id ? "Me" : a.full_name.split(" ")[0]}</span>
            </button>
          ))}
          {agents.length === 0 && <span className="text-muted">No inbox members yet</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
          <span className="eyebrow mr-1">Move to</span>
          {LANES.map((l) => (
            <button
              key={l}
              onDragOver={(e) => allow(e, `lane:${l}`)}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                const id = readId(e);
                if (id) onLane(id, l);
                finish();
              }}
              onClick={() => activeId && onLane(activeId, l)}
              className={cn("pill", over === `lane:${l}` ? "tone-brand" : "tone-neutral")}
            >
              {CONV_STATUS_LABEL[l]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="p-3 space-y-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState title={view === "unclaimed" ? "Nothing to claim" : view === "mine" ? "Your queue is clear" : "No conversations"} hint={query ? "Try another search." : view === "mine" ? "Claim something from Unclaimed or start a new conversation." : undefined} className="py-10" />
        ) : (
          items.map((c) => (
            <ConversationRowItem
              key={c.id}
              item={c}
              active={c.id === activeId}
              onSelect={onSelect}
              onDragStart={dragStart}
              menu={
                <Menu trigger={<Button size="xs" icon variant="secondary" aria-label="Row actions"><UserPlus size={12} /></Button>} width={220}>
                  <div className="px-2 py-1 eyebrow">Assign to</div>
                  <MenuItem onClick={() => onAssign(c.id, profile.id)}>Me</MenuItem>
                  {agents.filter((a) => a.id !== profile.id).slice(0, 8).map((a) => <MenuItem key={a.id} onClick={() => onAssign(c.id, a.id)}>{a.full_name}</MenuItem>)}
                  <MenuItem onClick={() => onAssign(c.id, null)}>Unassign</MenuItem>
                  <div className="px-2 py-1 eyebrow border-t mt-1">Move to</div>
                  {LANES.map((l) => <MenuItem key={l} onClick={() => onLane(c.id, l)}>{CONV_STATUS_LABEL[l]}</MenuItem>)}
                </Menu>
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--brand)]" />
      {children}
    </label>
  );
}
