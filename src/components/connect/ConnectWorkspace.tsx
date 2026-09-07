"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart3, CalendarClock, Check, Contact, MessagesSquare, Settings, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, EmptyState, Field, Input, Modal, Select, useToast } from "@/components/ui";
import { cn, isManagerPlus, type TaskPriority } from "@/lib/utils";
import { ConversationList, EMPTY_FILTERS, type AgentChip, type Lane, type ListFilters, type ListView } from "./ConversationList";
import { ConversationView } from "./ConversationView";
import { ContactPane } from "./ContactPane";
import { ContactFormModal } from "./ContactForm";
import { CONVERSATION_SELECT, EMPTY_QUEUE, errText, type ConnectQueue, type ConversationListItem, type InboxLite, type ContactRow } from "./lib";

type Pane = "list" | "conv" | "contact";
type SearchHit = { id: string; name: string; company: string | null; emails: string[]; phones: string[]; do_not_contact: boolean };

export function ConnectWorkspace({ initialId, initialInbox, canManage, canApprove }: { initialId?: string | null; initialInbox?: string | null; canManage: boolean; canApprove: boolean }) {
  const { profile, people } = useSession();
  const toast = useToast();
  const [inboxes, setInboxes] = React.useState<InboxLite[]>([]);
  const [members, setMembers] = React.useState<{ inbox_id: string; user_id: string }[]>([]);
  const [inboxId, setInboxId] = React.useState(initialInbox || "");
  const [view, setView] = React.useState<ListView>(initialId ? "all" : "mine");
  const [query, setQuery] = React.useState("");
  const [filters, setFilters] = React.useState<ListFilters>(EMPTY_FILTERS);
  const [items, setItems] = React.useState<ConversationListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeId, setActiveId] = React.useState<string | null>(initialId || null);
  const [pane, setPane] = React.useState<Pane>(initialId ? "conv" : "list");
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [queue, setQueue] = React.useState<ConnectQueue>(EMPTY_QUEUE);
  const [newOpen, setNewOpen] = React.useState(false);

  /* ---- module adoption + static data */
  React.useEffect(() => {
    const supabase = createClient();
    supabase.rpc("touch_module", { p_module: "connect" }).then(() => {});
    let alive = true;
    Promise.all([supabase.from("inboxes").select("id,name,kind,address").eq("active", true).order("name"), supabase.from("inbox_members").select("inbox_id,user_id")]).then(([i, m]) => {
      if (!alive) return;
      setInboxes(i.data || []);
      setMembers(m.data || []);
    });
    return () => {
      alive = false;
    };
  }, []);

  const loadQueue = React.useCallback(async () => {
    const { data } = await createClient().rpc("my_connect_queue");
    if (data) setQueue({ ...EMPTY_QUEUE, ...(data as unknown as Partial<ConnectQueue>) });
  }, []);

  /* ---- list */
  const loadList = React.useCallback(async () => {
    const supabase = createClient();
    let q = supabase.from("conversations").select(CONVERSATION_SELECT).order("last_message_at", { ascending: false }).limit(200);
    if (view === "mine") q = q.eq("assigned_to", profile.id).in("status", ["open", "pending"]);
    else if (view === "unclaimed") q = q.is("assigned_to", null).eq("status", "open");
    else if (view === "all") q = q.in("status", ["open", "pending"]);
    else if (view === "snoozed") q = q.eq("status", "snoozed");
    else q = q.eq("status", "resolved");
    if (inboxId) q = q.eq("inbox_id", inboxId);
    if (filters.channel) q = q.eq("channel", filters.channel);
    if (filters.priority) q = q.eq("priority", filters.priority as TaskPriority);
    if (filters.vip) q = q.eq("vip", true);
    if (filters.unread) q = q.eq("unread", true);
    if (filters.breached) q = q.eq("sla_breached", true);
    const term = query.trim();
    if (term) {
      const { data: hits } = await supabase.rpc("search_contacts", { p_q: term, p_limit: 30 });
      const ids = (hits || []).map((h) => h.id);
      const subj = `subject.ilike.%${term.replace(/[%,]/g, "")}%`;
      q = ids.length ? q.or(`${subj},contact_id.in.(${ids.join(",")})`) : q.ilike("subject", `%${term.replace(/[%,]/g, "")}%`);
    }
    const { data, error } = await q;
    if (error) toast.push(errText(error), "danger");
    setItems(((data as unknown as ConversationListItem[] | null) || []).sort((a, b) => Number(b.vip) - Number(a.vip) || (b.last_message_at || "").localeCompare(a.last_message_at || "")));
    setLoading(false);
  }, [view, inboxId, filters, query, profile.id, toast]);

  React.useEffect(() => {
    const t = setTimeout(() => {
      loadList();
      loadQueue();
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadList, loadQueue, refreshKey, query]);

  /* ---- realtime: any conversation / message change I am allowed to see → refresh (debounced) */
  React.useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRefreshKey((k) => k + 1), 200);
    };
    const ch = supabase
      .channel(`connect-ws:${profile.id}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, bump)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversation_messages" }, bump)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_messages" }, bump);
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      ch.subscribe();
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [profile.id]);

  /* ---- selection + URL sync (no navigation: keeps the workspace mounted) */
  const select = React.useCallback((id: string | null) => {
    setActiveId(id);
    setPane(id ? "conv" : "list");
    if (typeof window !== "undefined") window.history.replaceState(window.history.state, "", id ? `/connect/${id}` : "/connect");
  }, []);

  const active = items.find((c) => c.id === activeId) || null;
  // Contact for the right pane: from the list row when we have it, else fetched (deep link to a row outside the current view).
  const [fetchedContact, setFetchedContact] = React.useState<{ id: string; contact_id: string | null } | null>(null);
  React.useEffect(() => {
    if (!activeId || active) return;
    let alive = true;
    createClient().from("conversations").select("contact_id").eq("id", activeId).maybeSingle().then(({ data }) => alive && setFetchedContact({ id: activeId, contact_id: data?.contact_id || null }));
    return () => {
      alive = false;
    };
  }, [activeId, active]);
  const activeContactId = active ? active.contact_id : fetchedContact?.id === activeId ? fetchedContact.contact_id : null;

  const agents: AgentChip[] = React.useMemo(() => {
    const ids = new Set(members.filter((m) => !inboxId || m.inbox_id === inboxId).map((m) => m.user_id));
    const list = people.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, full_name: p.full_name, avatar_url: p.avatar_url }));
    const meFirst = list.sort((a, b) => (a.id === profile.id ? -1 : b.id === profile.id ? 1 : a.full_name.localeCompare(b.full_name)));
    if (!meFirst.some((a) => a.id === profile.id)) meFirst.unshift({ id: profile.id, full_name: profile.full_name, avatar_url: profile.avatar_url });
    return meFirst;
  }, [members, inboxId, people, profile.id, profile.full_name, profile.avatar_url]);

  const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

  async function assign(conversationId: string, userId: string | null) {
    const supabase = createClient();
    const { error } = userId === profile.id ? await supabase.rpc("claim_conversation", { p_id: conversationId }) : await supabase.rpc("assign_conversation", { p_id: conversationId, p_user: (userId ?? null) as unknown as string });
    if (error) return toast.push(errText(error), "danger");
    toast.push(userId ? `Assigned to ${userId === profile.id ? "you" : people.find((p) => p.id === userId)?.full_name || "agent"}` : "Unassigned", "success");
    refresh();
  }
  const [laneModal, setLaneModal] = React.useState<{ id: string; lane: "snoozed" | "resolved" } | null>(null);
  async function lane(conversationId: string, l: Lane) {
    if (l === "snoozed" || l === "resolved") return setLaneModal({ id: conversationId, lane: l });
    const { error } = await createClient().from("conversations").update({ status: l, snoozed_until: null }).eq("id", conversationId);
    if (error) return toast.push(errText(error), "danger");
    refresh();
  }

  async function approve(id: string, ok: boolean) {
    const { error } = await createClient().rpc("approve_message", { p_message: id, p_approve: ok });
    if (error) return toast.push(errText(error), "danger");
    if (ok) {
      const r = await fetch("/api/connect/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: id }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      toast.push(j.ok ? "Approved and sent" : `Approved, but not sent: ${j.error || "provider error"}`, j.ok ? "success" : "danger");
    }
    refresh();
  }

  const counts: Partial<Record<ListView, number>> = { mine: queue.mine.length, unclaimed: queue.unclaimed.length, snoozed: queue.snoozed };

  return (
    <div className="flex flex-col h-[calc(100dvh-var(--topbar-h)-64px)] lg:h-[calc(100dvh-var(--topbar-h))] min-h-0 overflow-hidden">
      {/* ------------------------------------------------------ top strip */}
      <div className="flex items-center gap-2 px-3 h-11 border-b bg-[var(--bg-elev)] shrink-0 overflow-x-auto no-scrollbar">
        <span className="inline-flex items-center gap-1.5 font-medium text-sm"><MessagesSquare size={15} className="text-[var(--brand-2)]" /> GHL Connect</span>
        <span className="text-[11px] text-muted hidden sm:inline">Shared inboxes, calls and follow-ups for Sales &amp; Support.</span>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <Link href="/connect/follow-ups" className="btn btn-ghost btn-sm" title="Follow-up board"><CalendarClock size={14} /><span className="hidden sm:inline">Follow-ups</span>{(queue.follow_ups.length + queue.callbacks.length) > 0 && <span className="pill tone-warn">{queue.follow_ups.length + queue.callbacks.length}</span>}</Link>
          <Link href="/connect/contacts" className="btn btn-ghost btn-sm" title="Contacts"><Contact size={14} /><span className="hidden sm:inline">Contacts</span></Link>
          {(canManage || canApprove || isManagerPlus(profile.role)) && <Link href="/connect/dashboard" className="btn btn-ghost btn-sm" title="Dashboard"><BarChart3 size={14} /><span className="hidden sm:inline">Dashboard</span></Link>}
          {canManage && <Link href="/connect/admin" className="btn btn-ghost btn-sm" title="Connect admin"><Settings size={14} /></Link>}
        </div>
      </div>

      {/* ------------------------------------------------ approvals strip */}
      {queue.awaiting_approval.length > 0 && (
        <div className="px-3 py-1.5 border-b tone-warn text-xs flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          <span className="font-medium whitespace-nowrap">Awaiting your approval ({queue.awaiting_approval.length})</span>
          {queue.awaiting_approval.slice(0, 4).map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-elev)] text-[var(--fg)] pl-2.5 pr-1 h-6 whitespace-nowrap">
              <button className="hover:underline max-w-[180px] truncate" onClick={() => select(a.conversation_id)}>{a.by?.split(" ")[0]}: {a.subject || "message"}</button>
              <Button size="xs" variant="success" icon onClick={() => approve(a.id, true)} aria-label="Approve and send" title="Approve and send"><Check size={11} /></Button>
              <Button size="xs" variant="ghost" icon onClick={() => approve(a.id, false)} aria-label="Reject" title="Reject"><X size={11} /></Button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <aside className={cn("w-full lg:w-[320px] lg:shrink-0 lg:border-r bg-[var(--bg-elev)] min-h-0", pane === "list" ? "flex" : "hidden lg:flex")}>
          <div className="w-full min-h-0">
            <ConversationList
              items={items} loading={loading} inboxes={inboxes} inboxId={inboxId} onInbox={setInboxId} view={view} onView={setView} query={query} onQuery={setQuery}
              filters={filters} onFilters={setFilters} activeId={activeId} onSelect={select} agents={agents} onAssign={assign} onLane={lane} onNew={() => setNewOpen(true)} counts={counts}
            />
          </div>
        </aside>
        <section className={cn("flex-1 min-w-0 min-h-0 bg-[var(--bg)]", pane === "conv" ? "flex" : "hidden lg:flex")}>
          <div className="w-full min-h-0">
            {activeId ? (
              <ConversationView key={activeId} id={activeId} refreshKey={refreshKey} onBack={() => select(null)} onChanged={refresh} onOpenContact={() => setPane("contact")} canApprove={canApprove} />
            ) : (
              <EmptyState icon={<MessagesSquare size={20} />} title="Pick a conversation" hint="Claim something from Unclaimed, or start a new email or call from the + button." className="h-full" />
            )}
          </div>
        </section>
        <aside className={cn("w-full lg:w-[300px] xl:w-[340px] lg:shrink-0 lg:border-l bg-[var(--bg-elev)] min-h-0", pane === "contact" ? "flex" : "hidden lg:flex")}>
          <div className="w-full min-h-0">
            {activeId ? <ContactPane contactId={activeContactId} refreshKey={refreshKey} onBack={() => setPane("conv")} onOpenConversation={select} /> : <div className="p-4 text-xs text-muted">Contact details appear here.</div>}
          </div>
        </aside>
      </div>

      <NewConversationModal open={newOpen} onClose={() => setNewOpen(false)} inboxes={inboxes} defaultInbox={inboxId} onCreated={(id) => { setNewOpen(false); setView("all"); select(id); refresh(); }} />
      {laneModal && <LaneModal target={laneModal} onClose={() => setLaneModal(null)} onDone={() => { setLaneModal(null); refresh(); }} />}
    </div>
  );
}

/* ------------------------------------------------ drop-lane confirmations */
function LaneModal({ target, onClose, onDone }: { target: { id: string; lane: "snoozed" | "resolved" }; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [until, setUntil] = React.useState(() => { const d = new Date(Date.now() + 86_400_000); d.setHours(9, 0, 0, 0); return d; });
  const [disp, setDisp] = React.useState("resolved");
  async function go() {
    const supabase = createClient();
    const { error } = target.lane === "snoozed" ? await supabase.rpc("snooze_conversation", { p_id: target.id, p_until: until.toISOString() }) : await supabase.rpc("resolve_conversation", { p_id: target.id, p_disposition: disp });
    if (error) return toast.push(errText(error), "danger");
    onDone();
  }
  return (
    <Modal open onClose={onClose} title={target.lane === "snoozed" ? "Snooze until" : "Resolve"} width={400} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go}>{target.lane === "snoozed" ? "Snooze" : "Resolve"}</Button></>}>
      {target.lane === "snoozed" ? (
        <Field label="Reopen at"><Input type="datetime-local" value={`${until.getFullYear()}-${String(until.getMonth() + 1).padStart(2, "0")}-${String(until.getDate()).padStart(2, "0")}T${String(until.getHours()).padStart(2, "0")}:${String(until.getMinutes()).padStart(2, "0")}`} onChange={(e) => e.target.value && setUntil(new Date(e.target.value))} /></Field>
      ) : (
        <Field label="Outcome">
          <Select value={disp} onChange={(e) => setDisp(e.target.value)}>
            {["resolved", "interested", "not_interested", "callback", "wrong_number", "complaint", "escalated", "spam"].map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
          </Select>
        </Field>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------ new conversation */
export function NewConversationModal({ open, onClose, inboxes, defaultInbox, onCreated, contact }: { open: boolean; onClose: () => void; inboxes: InboxLite[]; defaultInbox?: string; onCreated: (id: string) => void; contact?: ContactRow | null }) {
  const toast = useToast();
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [picked, setPicked] = React.useState<SearchHit | null>(contact ? { id: contact.id, name: contact.name, company: contact.company, emails: contact.emails, phones: contact.phones, do_not_contact: contact.do_not_contact } : null);
  const [channel, setChannel] = React.useState<"email" | "call" | "whatsapp" | "sms">("email");
  const [subject, setSubject] = React.useState("");
  const [inbox, setInbox] = React.useState(defaultInbox || "");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!q.trim()) return;
    let alive = true;
    const t = setTimeout(() => {
      createClient().rpc("search_contacts", { p_q: q.trim(), p_limit: 8 }).then(({ data }) => alive && setHits((data || []) as SearchHit[]));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  async function start() {
    if (!picked) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("start_conversation", { p_contact: picked.id, p_channel: channel, p_subject: subject.trim() || undefined, p_inbox: inbox || undefined });
    setBusy(false);
    if (error || !data) return toast.push(errText(error), "danger");
    onCreated(data);
  }

  const usableInboxes = inboxes.filter((i) => (channel === "call" ? i.kind === "phone" : i.kind === channel));

  return (
    <Modal open={open} onClose={onClose} title="New conversation" width={520} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={start} loading={busy} disabled={!picked || picked.do_not_contact}>Start</Button></>}>
      <div className="space-y-3">
        {!contact && (
          <Field label="Contact">
            {picked ? (
              <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 h-9 text-sm">
                <span className="flex-1 truncate">{picked.name}{picked.company ? ` · ${picked.company}` : ""}</span>
                {picked.do_not_contact && <span className="pill tone-danger">DNC</span>}
                <button className="text-muted" onClick={() => setPicked(null)} aria-label="Change contact"><X size={14} /></button>
              </div>
            ) : (
              <>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, company, email or phone…" autoFocus />
                {q.trim() && hits.length > 0 && (
                  <div className="mt-1 card divide-y max-h-48 overflow-y-auto">
                    {hits.map((h) => <button key={h.id} className="w-full text-left px-3 py-2 text-sm row-hover" onClick={() => setPicked(h)}>{h.name}<span className="text-muted"> {h.company ? `· ${h.company}` : ""} {h.emails[0] || h.phones[0] || ""}</span></button>)}
                  </div>
                )}
                <button className="link text-xs mt-1" onClick={() => setCreateOpen(true)}>+ New contact</button>
              </>
            )}
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Channel">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
              <option value="email">Email</option><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option>
            </Select>
          </Field>
          <Field label="Inbox">
            <Select value={inbox} onChange={(e) => setInbox(e.target.value)}>
              <option value="">Auto (my department&apos;s)</option>
              {usableInboxes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={channel === "call" ? "e.g. Renewal discussion" : "e.g. Proposal for Q4"} /></Field>
        {picked?.do_not_contact && <p className="text-xs text-danger">This contact is marked Do Not Contact. A manager must clear the flag first.</p>}
      </div>
      {createOpen && <ContactFormModal open onClose={() => setCreateOpen(false)} initial={{ name: q }} onSaved={(c) => { setCreateOpen(false); setPicked({ id: c.id, name: c.name, company: c.company, emails: c.emails, phones: c.phones, do_not_contact: c.do_not_contact }); }} />}
    </Modal>
  );
}
