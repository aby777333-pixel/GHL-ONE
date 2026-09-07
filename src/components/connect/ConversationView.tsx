"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Check, CheckCircle2, Clock, ExternalLink, Hand, LifeBuoy, Link2, ListPlus, MoreHorizontal, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { Avatar, Button, Field, Input, Menu, MenuItem, Modal, Pill, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { QuickTaskForm } from "@/components/tasks/QuickTaskForm";
import { openBuddy } from "@/components/ai/buddyStore";
import { PRIORITY_LABEL, PRIORITY_TONE, cn, fmtDate, type TaskPriority } from "@/lib/utils";
import { ChannelIcon, ConvStatusPill, SlaCountdown, VipBadge } from "./ConnectBits";
import { Composer } from "./Composer";
import { CONVERSATION_SELECT, DISPOSITIONS, MESSAGE_STATUS_LABEL, MESSAGE_STATUS_TONE, errText, humanizeKey, snoozePresets, toLocalInput, type ConversationListItem, type MessageRow, type TemplateRow } from "./lib";

type Props = {
  id: string;
  refreshKey: number;
  onBack?: () => void;
  onChanged: () => void;
  onOpenContact?: () => void;
  /** Supervisors: pending approvals in this conversation are actionable inline. */
  canApprove: boolean;
};

export function ConversationView({ id, refreshKey, onBack, onChanged, onOpenContact, canApprove }: Props) {
  const { profile, people } = useSession();
  const toast = useToast();
  useSeen(`conversation:${id}`);
  const [conv, setConv] = React.useState<ConversationListItem | null>(null);
  const [messages, setMessages] = React.useState<MessageRow[]>([]);
  const [templates, setTemplates] = React.useState<TemplateRow[]>([]);
  const [signature, setSignature] = React.useState<string | null>(null);
  const [needsApproval, setNeedsApproval] = React.useState(false);
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null);
  const [modal, setModal] = React.useState<"assign" | "snooze" | "resolve" | "task" | "help" | null>(null);
  const [linked, setLinked] = React.useState<{ task?: { id: string; title: string; status: string } | null; help?: { id: string; title: string; status: string } | null }>({});
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    const supabase = createClient();
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from("conversations").select(CONVERSATION_SELECT).eq("id", id).maybeSingle(),
      supabase.from("conversation_messages").select("*").eq("conversation_id", id).order("created_at").limit(500),
    ]);
    const row = (c as ConversationListItem | null) || null;
    setConv(row);
    setMessages(m || []);
    setLoadedFor(id);
    if (row) {
      const [{ data: task }, { data: help }] = await Promise.all([
        row.linked_task_id ? supabase.from("tasks").select("id,title,status").eq("id", row.linked_task_id).maybeSingle() : Promise.resolve({ data: null }),
        row.linked_help_request_id ? supabase.from("help_requests").select("id,title,status").eq("id", row.linked_help_request_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setLinked({ task, help });
      if (row.unread && (row.assigned_to === profile.id || !row.assigned_to)) await supabase.from("conversations").update({ unread: false }).eq("id", id);
    }
  }, [id, profile.id]);

  React.useEffect(() => {
    let alive = true;
    const t = setTimeout(() => void load().then(() => alive && bottomRef.current?.scrollIntoView({ block: "end" })), 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [load, refreshKey]);

  React.useEffect(() => {
    let alive = true;
    const supabase = createClient();
    Promise.all([supabase.from("comm_templates").select("*").order("scope").order("name"), supabase.rpc("needs_send_approval")]).then(([t, a]) => {
      if (!alive) return;
      setTemplates(t.data || []);
      setNeedsApproval(!!a.data);
    });
    return () => {
      alive = false;
    };
  }, []);
  React.useEffect(() => {
    if (!conv?.inbox_id) return;
    let alive = true;
    createClient().from("signatures").select("body").eq("user_id", profile.id).eq("inbox_id", conv.inbox_id).maybeSingle().then(({ data }) => alive && setSignature(data?.body || null));
    return () => {
      alive = false;
    };
  }, [conv?.inbox_id, profile.id]);

  const changed = React.useCallback(() => {
    load();
    onChanged();
  }, [load, onChanged]);

  /** Run an RPC; toast on error, refresh on success. */
  async function run(fn: (db: ReturnType<typeof createClient>) => PromiseLike<{ error: { message: string } | null }>): Promise<boolean> {
    const { error } = await fn(createClient());
    if (error) {
      toast.push(errText(error), "danger");
      return false;
    }
    changed();
    return true;
  }

  async function reopen() {
    const { error } = await createClient().from("conversations").update({ status: "open", snoozed_until: null }).eq("id", id);
    if (error) return toast.push(errText(error), "danger");
    changed();
  }
  async function setPriority(p: TaskPriority) {
    const { error } = await createClient().from("conversations").update({ priority: p }).eq("id", id);
    if (error) return toast.push(errText(error), "danger");
    changed();
  }
  async function approve(mid: string, ok: boolean, note?: string) {
    if (!(await run((db) => db.rpc("approve_message", { p_message: mid, p_approve: ok, p_note: note })))) return;
    if (ok) {
      const r = await fetch("/api/connect/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: mid }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      toast.push(j.ok ? "Approved and sent" : `Approved, but not sent: ${j.error || "provider error"}`, j.ok ? "success" : "danger");
      changed();
    } else toast.push("Message not approved — the author has been told", "info");
  }
  async function retrySend(mid: string) {
    // Failed messages are editable by their author; re-queue then send.
    const { error } = await createClient().from("conversation_messages").update({ status: "queued", error: null }).eq("id", mid);
    if (error) return toast.push(errText(error), "danger");
    const r = await fetch("/api/connect/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: mid }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    toast.push(j.ok ? "Sent" : `Not sent: ${j.error || "provider error"}`, j.ok ? "success" : "danger");
    changed();
  }

  const loading = loadedFor !== id;
  if (loading && !conv) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20 w-3/4 ml-auto" />
      </div>
    );
  }
  if (!conv) {
    return (
      <div className="p-6 text-center text-sm text-muted">
        {onBack && <button className="link inline-flex items-center gap-1 mb-3" onClick={onBack}><ArrowLeft size={13} /> Back</button>}
        <div>This conversation is not available — it may be restricted or deleted.</div>
      </div>
    );
  }

  const mine = conv.assigned_to === profile.id;
  const assignee = people.find((p) => p.id === conv.assigned_to);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ------------------------------------------------------- header */}
      <div className="border-b px-3 py-2 bg-[var(--bg-elev)] shrink-0">
        <div className="flex items-start gap-2">
          {onBack && <Button size="sm" icon variant="ghost" className="lg:hidden shrink-0" onClick={onBack} aria-label="Back"><ArrowLeft size={16} /></Button>}
          <span className="w-8 h-8 rounded-full sunken hidden sm:flex items-center justify-center shrink-0 text-muted mt-0.5"><ChannelIcon channel={conv.channel} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium truncate">{conv.subject || `${humanizeKey(conv.channel)} with ${conv.contact?.name || "contact"}`}</span>
              <VipBadge vip={conv.vip} />
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-muted">
              <ConvStatusPill status={conv.status} />
              <Menu trigger={<button className={cn("pill", PRIORITY_TONE[conv.priority] || "tone-neutral")} title="Change priority">{PRIORITY_LABEL[conv.priority]}</button>} align="left" width={150}>
                {(["critical", "urgent", "high", "normal", "low"] as TaskPriority[]).map((p) => <MenuItem key={p} onClick={() => setPriority(p)}>{PRIORITY_LABEL[p]}</MenuItem>)}
              </Menu>
              <button className="inline-flex items-center gap-1 hover:underline" onClick={onOpenContact}>{conv.contact?.name || "Unknown contact"}{conv.contact?.company ? ` · ${conv.contact.company}` : ""}</button>
              {conv.inbox && <span>· {conv.inbox.name}</span>}
              {(conv.status === "open" || conv.status === "pending") && <SlaCountdown due={conv.sla_due_at} breached={conv.sla_breached} />}
              {conv.status === "snoozed" && conv.snoozed_until && <span className="inline-flex items-center gap-1"><Clock size={11} /> until {fmtDate(conv.snoozed_until, true)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {assignee ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs pr-1"><Avatar name={assignee.full_name} src={assignee.avatar_url} size={20} /> {mine ? "You" : assignee.full_name.split(" ")[0]}</span>
            ) : (
              <Button size="sm" variant="primary" onClick={() => run((db) => db.rpc("claim_conversation", { p_id: id }))}><Hand size={13} /> Claim</Button>
            )}
            <Menu trigger={<Button size="sm" icon variant="secondary" aria-label="Conversation actions"><MoreHorizontal size={15} /></Button>} width={230}>
              {!mine && <MenuItem icon={<Hand size={13} />} onClick={() => run((db) => db.rpc("claim_conversation", { p_id: id }))}>Claim (take over)</MenuItem>}
              <MenuItem icon={<UserPlus size={13} />} onClick={() => setModal("assign")}>Assign…</MenuItem>
              {conv.status !== "resolved" && <MenuItem icon={<Clock size={13} />} onClick={() => setModal("snooze")}>Snooze…</MenuItem>}
              {conv.status !== "resolved" ? <MenuItem icon={<CheckCircle2 size={13} />} onClick={() => setModal("resolve")}>Resolve…</MenuItem> : <MenuItem icon={<CheckCircle2 size={13} />} onClick={reopen}>Reopen</MenuItem>}
              {conv.status === "snoozed" && <MenuItem icon={<Clock size={13} />} onClick={reopen}>Un-snooze now</MenuItem>}
              <div className="border-t my-1" />
              <MenuItem icon={<ListPlus size={13} />} onClick={() => setModal("task")}>{conv.linked_task_id ? "Replace linked task…" : "Link to a task…"}</MenuItem>
              <MenuItem icon={<LifeBuoy size={13} />} onClick={() => setModal("help")}>{conv.linked_help_request_id ? "Replace help request…" : "Link help request…"}</MenuItem>
              <MenuItem icon={<Bot size={13} />} onClick={() => openBuddy({ mode: "brief", scope: { path: `/connect/${id}` }, message: `Summarise this conversation with ${conv.contact?.name || "the contact"} and what I should do next.` })}>Ask Buddy about this</MenuItem>
            </Menu>
          </div>
        </div>
        {(linked.task || linked.help) && (
          <div className="flex flex-wrap gap-2 mt-2 text-xs">
            {linked.task && <Link href={`/tasks/${linked.task.id}`} className="pill tone-neutral hover:underline"><Link2 size={10} /> Task: {linked.task.title} <span className="opacity-70">· {humanizeKey(linked.task.status)}</span></Link>}
            {linked.help && <Link href={`/help/${linked.help.id}`} className="pill tone-neutral hover:underline"><LifeBuoy size={10} /> Help: {linked.help.title} <span className="opacity-70">· {humanizeKey(linked.help.status)}</span></Link>}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------- thread */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2 bg-[var(--bg)]">
        {messages.length === 0 && <div className="text-center text-sm text-muted py-8">No messages yet. Write the first one below.</div>}
        {messages.map((m) => (
          <MessageBubble key={m.id} m={m} canApprove={canApprove} onApprove={approve} onRetry={m.author_id === profile.id ? retrySend : undefined} />
        ))}
        <div ref={bottomRef} />
      </div>

      <Composer key={conv.id} conversation={conv} messages={messages} templates={templates} signature={signature} needsApproval={needsApproval} onChanged={changed} />

      {/* ------------------------------------------------------- modals */}
      <AssignModal open={modal === "assign"} onClose={() => setModal(null)} current={conv.assigned_to} onAssign={async (u, note) => { if (await run((db) => db.rpc("assign_conversation", { p_id: id, p_user: (u || null) as unknown as string, p_note: note || undefined }))) setModal(null); }} />
      <SnoozeModal open={modal === "snooze"} onClose={() => setModal(null)} onSnooze={async (at, note) => { if (await run((db) => db.rpc("snooze_conversation", { p_id: id, p_until: at.toISOString(), p_note: note || undefined }))) setModal(null); }} />
      <ResolveModal open={modal === "resolve"} onClose={() => setModal(null)} onResolve={async (d, note) => { if (await run((db) => db.rpc("resolve_conversation", { p_id: id, p_disposition: d, p_note: note || undefined }))) setModal(null); }} />
      <Modal open={modal === "task"} onClose={() => setModal(null)} title="Link to a task" width={620}>
        <p className="text-xs text-muted mb-3">Create a task for the work this conversation needs. The conversation stays linked so the team can see both sides.</p>
        <QuickTaskForm
          defaults={{ title: conv.subject || `Follow up with ${conv.contact?.name || "contact"}`, description: `From GHL Connect: /connect/${id}${conv.contact ? `\nContact: ${conv.contact.name}` : ""}`, department_id: conv.department_id, assignee_id: conv.assigned_to || profile.id }}
          onCancel={() => setModal(null)}
          onCreated={async (taskId) => {
            const { error } = await createClient().from("conversations").update({ linked_task_id: taskId }).eq("id", id);
            if (error) toast.push(errText(error), "danger");
            setModal(null);
            changed();
          }}
        />
      </Modal>
      <LinkHelpModal open={modal === "help"} onClose={() => setModal(null)} onPick={async (hid) => { const { error } = await createClient().from("conversations").update({ linked_help_request_id: hid }).eq("id", id); if (error) toast.push(errText(error), "danger"); setModal(null); changed(); }} />
    </div>
  );
}

/* ------------------------------------------------------------ bubbles */
function MessageBubble({ m, canApprove, onApprove, onRetry }: { m: MessageRow; canApprove: boolean; onApprove: (id: string, ok: boolean, note?: string) => void; onRetry?: (id: string) => void }) {
  const { people } = useSession();
  const author = people.find((p) => p.id === m.author_id);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  if (m.kind === "system") {
    return <div className="text-center text-[11px] text-muted py-1"><span className="px-2 py-0.5 rounded-full sunken">{m.body} · {fmtDate(m.created_at, true)}</span></div>;
  }
  const internal = m.direction === "internal";
  const outbound = m.direction === "outbound";
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[92%] sm:max-w-[78%] rounded-[var(--radius)] px-3 py-2 text-sm", internal ? "tone-warn border border-[var(--warn)]/30" : outbound ? "bg-[var(--brand)] text-[var(--brand-fg)]" : "card")}>
        <div className={cn("flex items-center gap-2 text-[11px] mb-1 flex-wrap", outbound && !internal ? "opacity-80" : "text-muted")}>
          {internal ? <span className="font-medium">Internal note · {author?.full_name || "someone"}</span> : outbound ? <span>{author?.full_name || "GHL"}{m.to_addresses?.length ? ` → ${m.to_addresses.join(", ")}` : ""}</span> : <span>{m.from_address || "Contact"}</span>}
          <span>{fmtDate(m.created_at, true)}</span>
          {m.kind === "call" && <span className="pill tone-neutral">Call</span>}
          {m.ai_drafted && <span className={cn("pill", outbound ? "bg-white/20" : "tone-violet")}><Bot size={10} /> AI-drafted</span>}
          {outbound && m.status !== "sent" && m.status !== "delivered" && <Pill tone={MESSAGE_STATUS_TONE[m.status] || "tone-neutral"}>{MESSAGE_STATUS_LABEL[m.status] || m.status}</Pill>}
        </div>
        {m.subject && m.kind === "email" && !internal && <div className="font-medium mb-1">{m.subject}</div>}
        <div className="whitespace-pre-wrap break-words">{m.body}</div>
        {Array.isArray(m.attachments) && m.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(m.attachments as { name?: string; path?: string }[]).map((a, i) => <span key={i} className={cn("pill", outbound ? "bg-white/20" : "tone-neutral")}>{a.name || a.path || "attachment"}</span>)}
          </div>
        )}
        {m.error && <div className={cn("mt-1 text-[11px]", outbound ? "opacity-90" : "text-danger")}>{m.status === "rejected" ? "Reason: " : "Error: "}{m.error}</div>}
        {m.status === "failed" && onRetry && <button className="mt-1 text-[11px] underline" onClick={() => onRetry(m.id)}>Retry send</button>}
        {m.status === "pending_approval" && canApprove && (
          <div className="mt-2 pt-2 border-t border-white/20 space-y-1.5">
            {rejecting ? (
              <div className="flex gap-1.5">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell the author what to change" className="!h-7 text-xs !bg-white/90 !text-[var(--fg)]" />
                <Button size="xs" variant="danger" onClick={() => onApprove(m.id, false, reason || undefined)}>Reject</Button>
                <Button size="xs" variant="ghost" onClick={() => setRejecting(false)} className="!text-inherit"><X size={12} /></Button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <Button size="xs" variant="success" onClick={() => onApprove(m.id, true)}><Check size={12} /> Approve &amp; send</Button>
                <Button size="xs" variant="secondary" onClick={() => setRejecting(true)}>Not yet…</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- modals */
function AssignModal({ open, onClose, current, onAssign }: { open: boolean; onClose: () => void; current: string | null; onAssign: (user: string, note: string) => void }) {
  const [user, setUser] = React.useState(current || "");
  const [note, setNote] = React.useState("");
  return (
    <Modal open={open} onClose={onClose} title="Assign conversation" width={460} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onAssign(user, note)}><UserPlus size={14} /> Assign</Button></>}>
      <div className="space-y-3">
        <Field label="Assign to" hint="Only inbox members with Connect access can be assigned."><PersonPicker value={user} onChange={setUser} placeholder="Unassigned" /></Field>
        <Field label="Handover note (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context for the person taking over" style={{ minHeight: 64 }} /></Field>
      </div>
    </Modal>
  );
}

function SnoozeModal({ open, onClose, onSnooze }: { open: boolean; onClose: () => void; onSnooze: (at: Date, note: string) => void }) {
  const presets = React.useMemo(() => snoozePresets(), []);
  const [custom, setCustom] = React.useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  const [note, setNote] = React.useState("");
  return (
    <Modal open={open} onClose={onClose} title="Snooze" width={460}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {presets.map((p) => <Button key={p.key} onClick={() => onSnooze(p.at, note)}>{p.label}</Button>)}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <Field label="Custom"><Input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} /></Field>
          <Button variant="primary" onClick={() => custom && onSnooze(new Date(custom), note)}>Snooze</Button>
        </div>
        <Field label="Why (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. waiting for their finance team" /></Field>
        <p className="text-[11px] text-muted">Snoozed conversations reopen automatically at that time, or earlier if the contact writes back.</p>
      </div>
    </Modal>
  );
}

function ResolveModal({ open, onClose, onResolve }: { open: boolean; onClose: () => void; onResolve: (disposition: string, note: string) => void }) {
  const [d, setD] = React.useState("resolved");
  const [note, setNote] = React.useState("");
  return (
    <Modal open={open} onClose={onClose} title="Resolve conversation" width={460} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="success" onClick={() => onResolve(d, note)}><CheckCircle2 size={14} /> Resolve</Button></>}>
      <div className="space-y-3">
        <Field label="Outcome">
          <Select value={d} onChange={(e) => setD(e.target.value)}>
            {DISPOSITIONS.map((x) => <option key={x} value={x}>{humanizeKey(x)}</option>)}
          </Select>
        </Field>
        <Field label="Closing note (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 64 }} /></Field>
        {(d === "complaint" || d === "escalated") && <p className="text-xs text-warn">Complaints and escalations stay visible to the department head.</p>}
      </div>
    </Modal>
  );
}

function LinkHelpModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const [rows, setRows] = React.useState<{ id: string; title: string; status: string; created_at: string }[]>([]);
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    createClient().from("help_requests").select("id,title,status,created_at").order("created_at", { ascending: false }).limit(60).then(({ data }) => alive && setRows(data || []));
    return () => {
      alive = false;
    };
  }, [open]);
  const list = rows.filter((r) => !q || r.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open={open} onClose={onClose} title="Link a help request" width={520}>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title…" className="mb-2" />
      <div className="max-h-[50vh] overflow-y-auto divide-y">
        {list.map((r) => (
          <button key={r.id} className="w-full text-left px-2 py-2 row-hover text-sm flex items-center gap-2" onClick={() => onPick(r.id)}>
            <span className="flex-1 truncate">{r.title}</span>
            <span className="pill tone-neutral">{humanizeKey(r.status)}</span>
          </button>
        ))}
        {list.length === 0 && <div className="text-sm text-muted py-6 text-center">No help requests you can see. <Link href="/help" className="link inline-flex items-center gap-1">Open Help Desk <ExternalLink size={11} /></Link></div>}
      </div>
    </Modal>
  );
}
