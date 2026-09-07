"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hash, LogOut, UserPlus, FolderKanban, ExternalLink, Sparkles, Link2, Paperclip, ArrowDownToLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, EmptyState, Field, Input, Modal, Pill, SearchInput, Skeleton, Spinner, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { Markdown } from "@/components/wiki/markdown";
import { useAIStatus } from "@/components/ai/useAIStatus";
import { callAI } from "@/lib/ai/types";
import { cn, fmtDate, humanize, type Channel } from "@/lib/utils";
import { summarizeMessages } from "./summarize";
import { parseAttachments, personName, timeLabel, dayLabel } from "./lib";
import { MessageBody } from "./MessageItem";
import type { ChannelMember, ChatMessage, PersonLite } from "./types";

/* ------------------------------------------------------- Record decision */
export function RecordDecisionModal({ m, channel, members, onClose, onRecorded }: { m: ChatMessage | null; channel: Channel; members: ChannelMember[]; onClose: () => void; onRecorded: (id: string, title: string) => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [decision, setDecision] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const open = !!m;

  React.useEffect(() => {
    if (!m) return;
    const t = setTimeout(() => {
      setTitle(m.body.slice(0, 90));
      setDecision(m.body);
      setReason("");
    }, 0);
    return () => clearTimeout(t);
  }, [m]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!m || !title.trim() || !decision.trim()) return;
    setLoading(true);
    const { data, error } = await createClient()
      .from("decisions")
      .insert({
        org_id: profile.org_id!,
        title: title.trim(),
        decision: decision.trim(),
        reason: reason.trim() || null,
        decided_by: profile.id,
        message_id: m.id,
        channel_id: channel.id,
        project_id: channel.project_id,
        department_id: channel.department_id,
        participants: members.map((x) => x.user_id),
        classification: channel.classification,
      })
      .select("id")
      .single();
    setLoading(false);
    if (error || !data) {
      toast.push(error?.message?.includes("row-level security") ? "Only team leads and above can record decisions." : error?.message || "Could not record decision", "danger");
      return;
    }
    toast.push("Decision recorded", "success");
    onRecorded(data.id, title.trim());
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Record decision" width={520}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus placeholder="What was decided?" />
        </Field>
        <Field label="Decision">
          <Textarea value={decision} onChange={(e) => setDecision(e.target.value)} required style={{ minHeight: 80 }} />
        </Field>
        <Field label="Reason (optional)" hint="Why this option? Future readers will thank you.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 60 }} />
        </Field>
        <div className="text-[11px] text-muted">
          Linked to this message in <b>{channel.type === "dm" ? "this conversation" : `#${channel.name}`}</b> · {members.length} participants
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading}>Record</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------- Forward */
export function ForwardModal({ m, from, authorOf, onClose }: { m: ChatMessage | null; from: Channel; authorOf: (id: string | null) => PersonLite | undefined; onClose: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [channels, setChannels] = React.useState<Channel[] | null>(null);
  const [q, setQ] = React.useState("");
  const [sending, setSending] = React.useState<string | null>(null);
  const open = !!m;

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    createClient()
      .from("channels")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200)
      .then(({ data }) => alive && setChannels(data || []));
    return () => {
      alive = false;
    };
  }, [open]);

  const list = (channels || []).filter((c) => c.id !== from.id && c.name.toLowerCase().includes(q.toLowerCase()));

  async function forward(to: Channel) {
    if (!m) return;
    setSending(to.id);
    const who = personName(authorOf(m.author_id));
    const prefix = `Forwarded from ${from.type === "dm" ? "a direct message" : `#${from.name}`} · ${who} · ${fmtDate(m.created_at, true)}:\n`;
    const { error } = await createClient().from("messages").insert({
      channel_id: to.id,
      author_id: profile.id,
      body: prefix + m.body,
      kind: m.kind === "system" ? "text" : m.kind,
      attachments: m.attachments,
    });
    setSending(null);
    if (error) {
      toast.push(error.message, "danger");
      return;
    }
    toast.push(`Forwarded to ${to.type === "dm" ? to.name : `#${to.name}`}`, "success");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Forward message" width={480}>
      {m && (
        <div className="rounded-[var(--radius-sm)] border sunken px-3 py-2 mb-3 text-sm max-h-24 overflow-hidden">
          <div className="text-[11px] text-muted mb-0.5">{personName(authorOf(m.author_id))} · {fmtDate(m.created_at, true)}</div>
          <div className="truncate-2">{m.body || `${parseAttachments(m.attachments).length} attachment(s)`}</div>
        </div>
      )}
      <SearchInput placeholder="Search channels and people…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="mt-2 max-h-[50dvh] overflow-y-auto divide-y rounded-[var(--radius-sm)] border">
        {!channels ? (
          <div className="p-6 flex justify-center">
            <Spinner />
          </div>
        ) : list.length ? (
          list.map((c) => (
            <button key={c.id} type="button" disabled={!!sending} onClick={() => forward(c)} className="w-full flex items-center gap-3 px-3 h-12 hover:bg-[var(--neutral-bg)] text-left">
              <span className={cn("w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0", c.type === "dm" ? "tone-neutral" : c.type === "project" ? "tone-brand" : "tone-info")}>
                {c.type === "dm" ? <Avatar name={c.name} size={30} /> : c.type === "project" ? <FolderKanban size={15} /> : <Hash size={15} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{c.type === "dm" ? c.name : `#${c.name}`}</span>
                <span className="block text-[11px] text-muted truncate">{c.description || humanize(c.type)}</span>
              </span>
              {sending === c.id && <Spinner className="!w-4 !h-4" />}
            </button>
          ))
        ) : (
          <div className="p-4 text-sm text-muted">No matches.</div>
        )}
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------- Catch me up */
type CatchUpAI = { key: string; markdown?: string; error?: string; disabled?: boolean };

/**
 * "Catch me up" (unread since last read) or "Summarise recent" (last ~100 loaded messages).
 * When AI is configured, an AI summary renders above the extractive highlights; otherwise (or on error) the extractive summary stands alone.
 */
export function CatchUpModal({ open, onClose, channelId, since, me, unreadCount, loaded, authorOf, onJump, mode = "unread" }: { open: boolean; onClose: () => void; channelId: string; since: string | null; me: string; unreadCount: number; loaded: ChatMessage[]; authorOf: (id: string | null) => PersonLite | undefined; onJump: (id: string) => void; mode?: "unread" | "recent" }) {
  const ai = useAIStatus();
  const [fetched, setFetched] = React.useState<ChatMessage[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [aiState, setAiState] = React.useState<CatchUpAI | null>(null);

  const local = React.useMemo(
    () => (mode === "recent" ? loaded.filter((m) => !m.deleted_at && !m.parent_id && m.kind !== "system").slice(-100) : since ? loaded.filter((m) => m.created_at > since && m.author_id !== me && !m.deleted_at && !m.parent_id) : []),
    [loaded, since, me, mode]
  );
  const needFetch = open && mode === "unread" && since && unreadCount > local.length && !fetched;

  React.useEffect(() => {
    if (!needFetch || !since) return;
    let alive = true;
    const t = setTimeout(() => setLoading(true), 0);
    createClient()
      .from("messages")
      .select("*, message_reactions(message_id,user_id,emoji)")
      .eq("channel_id", channelId)
      .is("parent_id", null)
      .is("deleted_at", null)
      .gt("created_at", since)
      .neq("author_id", me)
      .order("created_at")
      .limit(250)
      .then(({ data }) => {
        if (!alive) return;
        setLoading(false);
        setFetched((data || []).map(({ message_reactions, ...rest }) => ({ ...rest, reactions: message_reactions || [] })));
      });
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [needFetch, since, channelId, me]);

  const list = (mode === "unread" && fetched) || local;
  const nameOf = React.useCallback((id: string | null) => personName(authorOf(id)), [authorOf]);
  const summary = React.useMemo(() => summarizeMessages(list, nameOf), [list, nameOf]);

  /* AI summary — keyed by mode/channel/since so re-opening reuses the answer and nothing re-fires while open */
  const sinceIso = mode === "unread" ? since : list[0]?.created_at || null;
  const aiKey = open && ai.enabled && !loading && list.length > 0 ? `${mode}:${channelId}:${sinceIso || ""}` : null;
  const aiLoading = !!aiKey && aiState?.key !== aiKey;
  const aiCurrent = aiKey && aiState?.key === aiKey ? aiState : null;
  React.useEffect(() => {
    if (!aiKey) return;
    let alive = true;
    callAI<{ markdown: string; count?: number }>("catch-up", { channelId, sinceIso: sinceIso || undefined })
      .then((r) => alive && setAiState({ key: aiKey, markdown: r.markdown }))
      .catch((e: Error & { disabled?: boolean }) => alive && setAiState({ key: aiKey, error: e.message, disabled: e.disabled }));
    return () => {
      alive = false;
    };
  }, [aiKey, channelId, sinceIso]);

  const byAuthor = React.useMemo(() => {
    const groups: { id: string | null; items: ChatMessage[] }[] = [];
    for (const m of list) {
      const last = groups[groups.length - 1];
      if (last && last.id === m.author_id) last.items.push(m);
      else groups.push({ id: m.author_id, items: [m] });
    }
    return groups;
  }, [list]);

  return (
    <Modal open={open} onClose={onClose} title={<span className="inline-flex items-center gap-2"><Sparkles size={16} className="text-[var(--accent)]" /> {mode === "recent" ? "Summarise recent" : "Catch me up"}</span>} width={640}
      footer={list.length && mode === "unread" ? <Button variant="primary" onClick={() => { onClose(); onJump(list[0]!.id); }}><ArrowDownToLine size={14} /> Jump to first unread</Button> : undefined}>
      {loading ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : !list.length ? (
        <EmptyState title={mode === "recent" ? "Nothing to summarise yet" : "You are all caught up"} hint={mode === "recent" ? "Once the conversation has messages, a summary appears here." : "Nothing new since you were last here."} />
      ) : (
        <div className="space-y-4">
          {ai.enabled && !aiCurrent?.disabled && (
            <section className="rounded-[var(--radius-sm)] border border-[color-mix(in_oklab,var(--accent)_45%,var(--line))] px-3 py-2.5">
              <div className="eyebrow flex items-center gap-1 mb-1.5"><Sparkles size={11} className="text-[var(--accent)]" /> AI summary{mode === "recent" ? ` · last ${list.length} messages` : ""}</div>
              {aiLoading ? (
                <div className="space-y-1.5 py-1"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-11/12" /><Skeleton className="h-3 w-3/5" /></div>
              ) : aiCurrent?.markdown ? (
                <Markdown source={aiCurrent.markdown} className="text-sm" />
              ) : aiCurrent?.error ? (
                <div className="text-xs text-muted" title={aiCurrent.error}>AI summary unavailable right now — showing highlights instead. <span className="opacity-70">({aiCurrent.error})</span></div>
              ) : null}
            </section>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="card px-3 py-2"><div className="eyebrow">Messages</div><div className="text-xl font-semibold num">{summary.count}</div></div>
            <div className="card px-3 py-2"><div className="eyebrow">People</div><div className="text-xl font-semibold num">{summary.people.length}</div></div>
            <div className="card px-3 py-2"><div className="eyebrow">Attachments</div><div className="text-xl font-semibold num">{summary.attachments}</div></div>
          </div>
          {summary.span && <div className="text-[11px] text-muted">From {dayLabel(summary.span.from)} {timeLabel(summary.span.from)} to {dayLabel(summary.span.to)} {timeLabel(summary.span.to)}</div>}
          <div className="flex flex-wrap gap-1.5">
            {summary.people.map((p) => (
              <Pill key={p.id} tone="tone-neutral">{p.name} · {p.count}</Pill>
            ))}
          </div>
          {summary.highlights.length > 0 && (
            <section>
              <div className="eyebrow mb-1.5">Worth a look</div>
              <div className="space-y-1">
                {summary.highlights.map((h) => (
                  <button key={h.message.id} type="button" onClick={() => { onClose(); onJump(h.message.id); }} className="w-full text-left rounded-[var(--radius-sm)] border px-3 py-2 hover:bg-[var(--neutral-bg)]">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="text-xs font-medium">{nameOf(h.message.author_id)}</span>
                      <span className="text-[10px] text-muted num">{timeLabel(h.message.created_at)}</span>
                      {h.reasons.map((r) => (
                        <Pill key={r} tone={r === "urgent" || r === "blocked" ? "tone-danger" : r === "deadline" ? "tone-warn" : r === "decision" || r === "approved" ? "tone-success" : "tone-info"}>{r}</Pill>
                      ))}
                    </div>
                    <div className="text-sm truncate-2">{h.message.body}</div>
                  </button>
                ))}
              </div>
            </section>
          )}
          {summary.links.length > 0 && (
            <section>
              <div className="eyebrow mb-1.5">Links shared</div>
              <div className="space-y-1">
                {summary.links.map((l) => (
                  <a key={l} href={l} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm link truncate"><Link2 size={13} className="shrink-0" /><span className="truncate">{l}</span></a>
                ))}
              </div>
            </section>
          )}
          <section>
            <div className="eyebrow mb-1.5">Everything, by person</div>
            <div className="space-y-3">
              {byAuthor.map((g, i) => {
                const p = authorOf(g.id);
                return (
                  <div key={i} className="flex gap-2.5">
                    <Avatar name={p?.full_name} src={p?.avatar_url} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium mb-0.5">{personName(p)} <span className="text-muted num font-normal">· {timeLabel(g.items[0]!.created_at)}</span></div>
                      <div className="space-y-1">
                        {g.items.map((m) => (
                          <button key={m.id} type="button" onClick={() => { onClose(); onJump(m.id); }} className="block w-full text-left text-sm text-2 hover:text-[var(--fg)]">
                            {m.body ? <MessageBody body={m.body} className="!text-sm" /> : <span className="inline-flex items-center gap-1 text-muted"><Paperclip size={12} /> {parseAttachments(m.attachments).length} attachment(s)</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}

/* --------------------------------------------------------- Members drawer */
export function MembersDrawer({ open, onClose, channel, members, online, onAdd, onLeave }: { open: boolean; onClose: () => void; channel: Channel; members: ChannelMember[]; online: string[]; onAdd: (userId: string) => Promise<boolean>; onLeave: () => Promise<void> }) {
  const { profile } = useSession();
  const router = useRouter();
  const [pick, setPick] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const onlineSet = React.useMemo(() => new Set(online), [online]);
  const canLeave = channel.type !== "dm" && channel.type !== "project" && channel.type !== "task";
  const sorted = React.useMemo(() => [...members].sort((a, b) => Number(onlineSet.has(b.user_id)) - Number(onlineSet.has(a.user_id)) || (a.profile?.full_name || "").localeCompare(b.profile?.full_name || "")), [members, onlineSet]);

  return (
    <Modal open={open} onClose={onClose} side width={380} title={<span>{channel.type === "dm" ? "Conversation" : `#${channel.name}`}</span>}>
      <div className="space-y-4">
        {channel.description && <p className="text-sm text-2">{channel.description}</p>}
        {channel.project_id && (
          <Link href={`/projects/${channel.project_id}`} className="flex items-center gap-2 text-sm link">
            <FolderKanban size={15} /> Open project <ExternalLink size={12} />
          </Link>
        )}
        {channel.task_id && (
          <Link href={`/tasks/${channel.task_id}`} className="flex items-center gap-2 text-sm link">
            <ExternalLink size={14} /> Open task
          </Link>
        )}
        <section>
          <div className="eyebrow mb-2">{members.length} members</div>
          <div className="space-y-0.5">
            {sorted.map((m) => (
              <Link key={m.user_id} href={`/people/${m.user_id}`} className="flex items-center gap-2.5 h-11 px-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--neutral-bg)]">
                <Avatar name={m.profile?.full_name} src={m.profile?.avatar_url} size={30} presence={onlineSet.has(m.user_id) ? "available" : null} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{m.profile?.full_name || "Unknown"}{m.user_id === profile.id ? " (you)" : ""}</span>
                  <span className="block text-[11px] text-muted truncate">{onlineSet.has(m.user_id) ? "Online" : m.profile?.designation || ""}</span>
                </span>
                {m.role !== "member" && <Pill tone="tone-violet">{m.role}</Pill>}
              </Link>
            ))}
          </div>
        </section>
        {channel.type !== "dm" && (
          <section className="space-y-2">
            <div className="eyebrow">Add people</div>
            <div className="flex gap-2">
              <PersonPicker value={pick} onChange={setPick} placeholder="Choose a person" className="flex-1" />
              <Button
                variant="primary"
                disabled={!pick || members.some((m) => m.user_id === pick)}
                loading={adding}
                onClick={async () => {
                  setAdding(true);
                  const ok = await onAdd(pick);
                  setAdding(false);
                  if (ok) setPick("");
                }}
              >
                <UserPlus size={14} /> Add
              </Button>
            </div>
          </section>
        )}
        {canLeave && (
          <section className="pt-2 border-t">
            <Button
              variant="ghost"
              className="text-danger"
              loading={leaving}
              onClick={async () => {
                if (!window.confirm(`Leave #${channel.name}?`)) return;
                setLeaving(true);
                await onLeave();
                setLeaving(false);
                onClose();
                router.push("/chat");
                router.refresh();
              }}
            >
              <LogOut size={14} /> Leave channel
            </Button>
          </section>
        )}
      </div>
    </Modal>
  );
}
