"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, Check, Clock, Handshake, MessagesSquare, Phone, PhoneCall, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, EmptyState, Field, Input, Modal, PageHeader, Skeleton, Textarea, useToast } from "@/components/ui";
import { cn, fmtDate, isManagerPlus } from "@/lib/utils";
import { EMPTY_QUEUE, bucketOf, errText, telHref, toLocalInput, type CallbackRow, type ConnectQueue, type FollowUpRow } from "./lib";

type CardKind = "follow_up" | "callback" | "promise";
type Card = { key: string; kind: CardKind; id: string; title: string; contact: string | null; contact_id: string | null; phone: string | null; due: string; conversation_id: string | null; overdue: boolean; owner?: string | null; source?: string };
type Bucket = "overdue" | "today" | "tomorrow" | "week" | "later";
const BUCKETS: { key: Bucket; label: string; tone: string }[] = [
  { key: "overdue", label: "Overdue", tone: "tone-danger" },
  { key: "today", label: "Today", tone: "tone-warn" },
  { key: "tomorrow", label: "Tomorrow", tone: "tone-info" },
  { key: "week", label: "This week", tone: "tone-neutral" },
  { key: "later", label: "Later", tone: "tone-neutral" },
];

/** Follow-up board: my follow-ups, callbacks and promises by due bucket; managers can switch to their team's. */
export function FollowUpBoard() {
  const { profile, people } = useSession();
  const toast = useToast();
  const manager = isManagerPlus(profile.role);
  const [team, setTeam] = React.useState(false);
  const [queue, setQueue] = React.useState<ConnectQueue | null>(null);
  const [teamCards, setTeamCards] = React.useState<Card[] | null>(null);
  const [snooze, setSnooze] = React.useState<Card | null>(null);
  const [done, setDone] = React.useState<Card | null>(null);
  const [logCall, setLogCall] = React.useState<Card | null>(null);
  const [tick, setTick] = React.useState(0);

  const load = React.useCallback(async () => {
    const supabase = createClient();
    if (!team) {
      const { data } = await supabase.rpc("my_connect_queue");
      setQueue({ ...EMPTY_QUEUE, ...((data as unknown as Partial<ConnectQueue>) || {}) });
      return;
    }
    // Team view: rows RLS lets a manager see (their reports') — excluding their own.
    const [{ data: fus }, { data: cbs }] = await Promise.all([
      supabase.from("follow_ups").select("*, contact:contacts(name,phones)").eq("status", "open").neq("user_id", profile.id).order("due_at").limit(300),
      supabase.from("callbacks").select("*, contact:contacts(name,phones)").eq("status", "pending").neq("user_id", profile.id).order("due_at").limit(300),
    ]);
    type FU = FollowUpRow & { contact: { name: string; phones: string[] } | null };
    type CB = CallbackRow & { contact: { name: string; phones: string[] } | null };
    const nameOf = (id: string) => people.find((p) => p.id === id)?.full_name || "";
    const cards: Card[] = [
      ...((fus as unknown as FU[] | null) || []).map((f) => ({ key: `fu:${f.id}`, kind: (f.source === "promise" ? "promise" : "follow_up") as CardKind, id: f.id, title: f.title, contact: f.contact?.name || null, contact_id: f.contact_id, phone: f.contact?.phones?.[0] || null, due: f.due_at, conversation_id: f.conversation_id, overdue: new Date(f.due_at).getTime() < Date.now(), owner: nameOf(f.user_id), source: f.source })),
      ...((cbs as unknown as CB[] | null) || []).map((b) => ({ key: `cb:${b.id}`, kind: "callback" as CardKind, id: b.id, title: b.note || "Call back", contact: b.contact?.name || null, contact_id: b.contact_id, phone: b.contact?.phones?.[0] || null, due: b.due_at, conversation_id: b.conversation_id, overdue: new Date(b.due_at).getTime() < Date.now(), owner: nameOf(b.user_id) })),
    ];
    setTeamCards(cards);
  }, [team, profile.id, people]);

  React.useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load, tick]);

  const cards: Card[] | null = React.useMemo(() => {
    if (team) return teamCards;
    if (!queue) return null;
    const promiseIds = new Set<string>();
    const out: Card[] = [];
    for (const f of queue.follow_ups) {
      out.push({ key: `fu:${f.id}`, kind: f.source === "promise" ? "promise" : "follow_up", id: f.id, title: f.title, contact: f.contact, contact_id: f.contact_id, phone: null, due: f.due, conversation_id: f.conversation_id, overdue: f.overdue, source: f.source });
      if (f.source === "promise") promiseIds.add(f.title.replace(/^Promise: /, ""));
    }
    for (const b of queue.callbacks) out.push({ key: `cb:${b.id}`, kind: "callback", id: b.id, title: b.note || "Call back", contact: b.contact, contact_id: b.contact_id, phone: b.phone, due: b.due, conversation_id: b.conversation_id, overdue: b.overdue });
    // Promises without a follow-up row (older sources) still show up.
    for (const p of queue.promises) if (p.due && !promiseIds.has(p.text)) out.push({ key: `pr:${p.id}`, kind: "promise", id: p.id, title: `Promise: ${p.text}`, contact: p.to, contact_id: null, phone: null, due: p.due, conversation_id: null, overdue: p.overdue });
    return out;
  }, [team, teamCards, queue]);

  // Phones for my follow-ups come from the contact (the queue RPC only returns them for callbacks).
  const [phones, setPhones] = React.useState<Record<string, string | null>>({});
  React.useEffect(() => {
    const ids = [...new Set((cards || []).filter((c) => !c.phone && c.contact_id).map((c) => c.contact_id!))].filter((id) => !(id in phones));
    if (ids.length === 0) return;
    let alive = true;
    createClient().from("contacts").select("id,phones").in("id", ids).then(({ data }) => {
      if (!alive) return;
      const next: Record<string, string | null> = {};
      for (const id of ids) next[id] = null;
      for (const c of data || []) next[c.id] = c.phones[0] || null;
      setPhones((p) => ({ ...p, ...next }));
    });
    return () => {
      alive = false;
    };
  }, [cards, phones]);

  const grouped = React.useMemo(() => {
    const g: Record<Bucket, Card[]> = { overdue: [], today: [], tomorrow: [], week: [], later: [] };
    for (const c of cards || []) g[bucketOf(c.due)].push(c);
    return g;
  }, [cards]);

  const refresh = () => setTick((t) => t + 1);

  async function complete(card: Card, outcome?: string) {
    const supabase = createClient();
    let error: { message: string } | null = null;
    if (card.kind === "callback") ({ error } = await supabase.from("callbacks").update({ status: "done", done_at: new Date().toISOString() }).eq("id", card.id));
    else if (card.key.startsWith("pr:")) ({ error } = await supabase.from("commitments").update({ status: "done", done_at: new Date().toISOString() }).eq("id", card.id));
    else ({ error } = await supabase.rpc("complete_follow_up", { p_id: card.id, p_outcome: outcome || undefined }));
    if (error) return toast.push(errText(error), "danger");
    toast.push("Done", "success");
    setDone(null);
    refresh();
  }
  async function reschedule(card: Card, at: Date) {
    const supabase = createClient();
    const iso = at.toISOString();
    const { error } = card.kind === "callback" ? await supabase.from("callbacks").update({ due_at: iso }).eq("id", card.id) : card.key.startsWith("pr:") ? await supabase.from("commitments").update({ due_at: iso }).eq("id", card.id) : await supabase.from("follow_ups").update({ due_at: iso }).eq("id", card.id);
    if (error) return toast.push(errText(error), "danger");
    setSnooze(null);
    refresh();
  }

  const total = cards?.length ?? 0;

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="GHL Connect"
        title="Follow-ups"
        subtitle={cards ? `${total} open · ${grouped.overdue.length} overdue` : "Loading…"}
        actions={
          <div className="flex items-center gap-2">
            {manager && (
              <div className="inline-flex rounded-[var(--radius-sm)] border overflow-hidden text-xs">
                <button className={cn("px-3 h-8", !team ? "bg-[var(--brand)] text-[var(--brand-fg)]" : "")} onClick={() => setTeam(false)}>Mine</button>
                <button className={cn("px-3 h-8 inline-flex items-center gap-1", team ? "bg-[var(--brand)] text-[var(--brand-fg)]" : "")} onClick={() => setTeam(true)}><Users size={12} /> Team</button>
              </div>
            )}
            <Link href="/connect" className="btn btn-secondary btn-sm"><MessagesSquare size={14} /> Inbox</Link>
          </div>
        }
      />
      {!cards ? (
        <div className="grid md:grid-cols-5 gap-[var(--s3)]">{BUCKETS.map((b) => <Skeleton key={b.key} className="h-40" />)}</div>
      ) : total === 0 ? (
        <EmptyState icon={<CalendarClock size={20} />} title={team ? "Your team has no open follow-ups" : "Nothing to follow up"} hint="Promises made on calls and in replies land here automatically." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-[var(--s3)] items-start">
          {BUCKETS.map((b) => (
            <div key={b.key} className="card min-w-0">
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="font-medium text-sm">{b.label}</span>
                <span className={cn("pill", grouped[b.key].length ? b.tone : "tone-neutral")}>{grouped[b.key].length}</span>
              </div>
              <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                {grouped[b.key].length === 0 && <div className="text-xs text-muted text-center py-4">—</div>}
                {grouped[b.key].map((c) => {
                  const phone = c.phone || (c.contact_id ? phones[c.contact_id] : null) || null;
                  return (
                    <div key={c.key} className="rounded-[var(--radius-sm)] border p-2.5 space-y-1.5 bg-[var(--bg-elev)]">
                      <div className="flex items-start gap-1.5">
                        <span className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5", c.kind === "promise" ? "tone-violet" : c.kind === "callback" ? "tone-info" : "sunken text-muted")}>
                          {c.kind === "promise" ? <Handshake size={11} /> : c.kind === "callback" ? <PhoneCall size={11} /> : <Clock size={11} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm leading-snug break-words">{c.title}</div>
                          <div className="text-[11px] text-muted truncate">{c.contact || "—"}{c.owner ? ` · ${c.owner.split(" ")[0]}` : ""}</div>
                          <div className={cn("text-[11px] num", c.overdue ? "text-danger" : "text-muted")}>{fmtDate(c.due, true)}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {phone && <a href={telHref(phone)} className="btn btn-ghost btn-xs" title={`Call ${phone}`}><Phone size={11} /> Call</a>}
                        {c.contact_id && <button className="btn btn-ghost btn-xs" onClick={() => setLogCall(c)} title="Log a call"><PhoneCall size={11} /> Log</button>}
                        {c.conversation_id && <Link href={`/connect/${c.conversation_id}`} className="btn btn-ghost btn-xs" title="Open conversation"><MessagesSquare size={11} /></Link>}
                        <button className="btn btn-ghost btn-xs" onClick={() => setSnooze(c)} title="Reschedule"><Clock size={11} /></button>
                        <button className="btn btn-success btn-xs ml-auto" onClick={() => (c.kind === "callback" || c.key.startsWith("pr:") ? complete(c) : setDone(c))} title="Mark done"><Check size={11} /> Done</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {snooze && <RescheduleModal card={snooze} onClose={() => setSnooze(null)} onPick={(d) => reschedule(snooze, d)} />}
      {done && <DoneModal card={done} onClose={() => setDone(null)} onDone={(o) => complete(done, o)} />}
      {logCall && <QuickLogCallModal card={logCall} onClose={() => setLogCall(null)} onLogged={() => { setLogCall(null); refresh(); }} />}
    </div>
  );
}

function RescheduleModal({ card, onClose, onPick }: { card: Card; onClose: () => void; onPick: (d: Date) => void }) {
  const [v, setV] = React.useState(() => toLocalInput(new Date(Math.max(Date.now(), new Date(card.due).getTime()) + 3_600_000)));
  const quick = [
    { label: "+1 hour", d: () => new Date(Date.now() + 3_600_000) },
    { label: "Tomorrow 10:00", d: () => { const x = new Date(); x.setDate(x.getDate() + 1); x.setHours(10, 0, 0, 0); return x; } },
    { label: "+3 days", d: () => new Date(Date.now() + 3 * 86_400_000) },
    { label: "Next week", d: () => new Date(Date.now() + 7 * 86_400_000) },
  ];
  return (
    <Modal open onClose={onClose} title="Reschedule" width={420}>
      <div className="grid grid-cols-2 gap-2 mb-3">{quick.map((q) => <Button key={q.label} onClick={() => onPick(q.d())}>{q.label}</Button>)}</div>
      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <Field label="Custom"><Input type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} /></Field>
        <Button variant="primary" onClick={() => v && onPick(new Date(v))}>Save</Button>
      </div>
    </Modal>
  );
}

function DoneModal({ card, onClose, onDone }: { card: Card; onClose: () => void; onDone: (outcome?: string) => void }) {
  const [o, setO] = React.useState("");
  return (
    <Modal open onClose={onClose} title="Mark done" width={420} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="success" onClick={() => onDone(o.trim() || undefined)}><Check size={14} /> Done</Button></>}>
      <p className="text-sm mb-2">{card.title}</p>
      <Field label="Outcome (optional, added as an internal note)"><Textarea value={o} onChange={(e) => setO(e.target.value)} style={{ minHeight: 64 }} placeholder="e.g. Sent the proposal; they will revert by Friday" /></Field>
    </Modal>
  );
}

function QuickLogCallModal({ card, onClose, onLogged }: { card: Card; onClose: () => void; onLogged: () => void }) {
  const toast = useToast();
  const [disp, setDisp] = React.useState("connected");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function go() {
    if (!card.contact_id) return;
    setBusy(true);
    const { error } = await createClient().rpc("log_call", { p_contact: card.contact_id, p_direction: "outbound", p_disposition: disp, p_notes: notes || undefined, p_conversation: card.conversation_id || undefined });
    setBusy(false);
    if (error) return toast.push(errText(error), "danger");
    toast.push("Call logged", "success");
    onLogged();
  }
  return (
    <Modal open onClose={onClose} title={`Log call · ${card.contact || ""}`} width={440} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={go}><PhoneCall size={14} /> Log</Button></>}>
      <div className="space-y-3">
        <Field label="Disposition">
          <select className="select" value={disp} onChange={(e) => setDisp(e.target.value)}>
            {["connected", "no_answer", "busy", "voicemail", "wrong_number", "callback", "interested", "not_interested", "resolved", "escalated", "complaint"].map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
        <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 72 }} /></Field>
        <p className="text-[11px] text-muted">For next actions and promises, open the conversation and use the full Log call form.</p>
      </div>
    </Modal>
  );
}
