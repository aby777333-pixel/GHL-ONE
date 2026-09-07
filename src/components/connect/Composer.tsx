"use client";

import * as React from "react";
import { AlertTriangle, Bot, FileText, Handshake, Paperclip, Phone, Send, ShieldBan, Sparkles, StickyNote, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, Field, Input, Select, Textarea, useToast } from "@/components/ui";
import { openBuddy } from "@/components/ai/buddyStore";
import { useAIStatus } from "@/components/ai/useAIStatus";
import { cn } from "@/lib/utils";
import { CALL_DISPOSITIONS, CHANNEL_LABEL, errText, humanizeKey, renderTemplate, toLocalInput, type ConversationListItem, type LogCallResult, type MessageRow, type QueueMessageResult, type TemplateRow } from "./lib";

type Tab = "reply" | "note" | "call" | "promise";
type Props = {
  conversation: ConversationListItem;
  messages: MessageRow[];
  templates: TemplateRow[];
  signature: string | null;
  needsApproval: boolean;
  onChanged: () => void;
};

/** Reply / internal note / log call / promise composer for one conversation. */
export function Composer({ conversation, messages, templates, signature, needsApproval, onChanged }: Props) {
  const { profile, people } = useSession();
  const toast = useToast();
  const ai = useAIStatus();
  const contact = conversation.contact;
  const dnc = !!contact?.do_not_contact;
  const isCallThread = conversation.channel === "call";
  const [tab, setTab] = React.useState<Tab>(isCallThread ? "call" : "reply");
  const [busy, setBusy] = React.useState(false);

  /* ---- reply state */
  const kind = conversation.channel === "call" || conversation.channel === "note" ? "email" : conversation.channel;
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  const defaultTo = kind === "email" ? lastInbound?.from_address || contact?.emails?.[0] || "" : contact?.phones?.[0] || "";
  const [to, setTo] = React.useState(defaultTo);
  const [cc, setCc] = React.useState((lastInbound?.cc_addresses || []).join(", "));
  const [subject, setSubject] = React.useState(conversation.subject ? (/^re:/i.test(conversation.subject) ? conversation.subject : `Re: ${conversation.subject}`) : "");
  const [body, setBody] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [aiDrafted, setAiDrafted] = React.useState(false);
  const [attachments, setAttachments] = React.useState<string[]>([]);
  const [attachInput, setAttachInput] = React.useState("");
  const [sentNotice, setSentNotice] = React.useState<"approval" | null>(null);
  const [drafting, setDrafting] = React.useState(false);

  /* ---- note state */
  const [note, setNote] = React.useState("");
  const [mentions, setMentions] = React.useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const noteRef = React.useRef<HTMLTextAreaElement>(null);

  /* ---- call state */
  const [callDir, setCallDir] = React.useState<"outbound" | "inbound" | "missed">("outbound");
  const [callDisp, setCallDisp] = React.useState("connected");
  const [callMins, setCallMins] = React.useState("");
  const [callNotes, setCallNotes] = React.useState("");
  const [nextAction, setNextAction] = React.useState("");
  const [nextAt, setNextAt] = React.useState("");
  const [callPromise, setCallPromise] = React.useState("");
  const [callPromiseDue, setCallPromiseDue] = React.useState("");

  /* ---- promise state */
  const [promiseText, setPromiseText] = React.useState("");
  const [promiseDue, setPromiseDue] = React.useState(() => toLocalInput(new Date(Date.now() + 2 * 86_400_000)));

  const vars = React.useMemo(
    () => ({ contact_name: contact?.name || "", first_name: (contact?.name || "").split(" ")[0] || "", my_name: profile.full_name, subject: conversation.subject || "", company: contact?.company || "" }),
    [contact, profile.full_name, conversation.subject]
  );
  const usableTemplates = templates.filter((t) => (kind === "email" ? t.kind === "email" : t.kind === kind || t.kind === "email") && (t.approved || t.owner_id === profile.id));

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setBody(renderTemplate(t.body, vars) + (signature ? `\n\n${signature}` : ""));
    if (t.subject) setSubject(renderTemplate(t.subject, vars));
    setAiDrafted(false);
  }

  async function draftWithBuddy() {
    setDrafting(true);
    try {
      const res = await fetch("/api/ai/connect-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: conversation.id, instruction: body.trim() ? `Improve this draft: ${body}` : undefined }) });
      const json = (await res.json()) as { draft?: string; subject?: string | null; error?: string; disabled?: boolean };
      if (!res.ok || !json.draft) {
        toast.push(json.disabled ? "AI is not configured on this workspace." : json.error || "Could not draft", "danger");
        return;
      }
      setBody(json.draft + (signature && !json.draft.includes(signature) ? `\n\n${signature}` : ""));
      if (json.subject && !subject) setSubject(json.subject);
      setAiDrafted(true);
      toast.push("Draft ready — review it before sending", "info");
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const tos = to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const ccs = cc.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const { data, error } = await supabase.rpc("queue_message", {
      p_conversation: conversation.id,
      p_body: body,
      p_to: tos.length ? tos : undefined,
      p_cc: ccs,
      p_subject: kind === "email" ? subject || undefined : undefined,
      p_kind: kind,
      p_template: templateId || undefined,
      p_ai: aiDrafted,
      p_attachments: attachments.map((path) => ({ path, name: path.split("/").pop() })),
    });
    if (error) {
      setBusy(false);
      return toast.push(errText(error), "danger");
    }
    const res = data as unknown as QueueMessageResult;
    if (res.status === "queued") {
      const r = await fetch("/api/connect/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: res.id }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) toast.push(j.error ? `Not sent: ${j.error}` : "Not sent — see the thread for details", "danger");
      else toast.push("Sent", "success");
    } else {
      setSentNotice("approval");
      toast.push("Sent for approval", "info");
    }
    setBody("");
    setAiDrafted(false);
    setTemplateId("");
    setAttachments([]);
    setBusy(false);
    onChanged();
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    const { error } = await createClient().from("conversation_messages").insert({ conversation_id: conversation.id, direction: "internal", kind: "note", author_id: profile.id, body: note.trim(), mentions, status: "received" });
    setBusy(false);
    if (error) return toast.push(errText(error), "danger");
    setNote("");
    setMentions([]);
    onChanged();
  }

  function onNoteChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setNote(v);
    const caret = e.target.selectionStart;
    const m = v.slice(0, caret).match(/(?:^|\s)@([\w ]{0,24})$/);
    setMentionQuery(m ? m[1]! : null);
  }
  function pickMention(p: { id: string; full_name: string }) {
    const el = noteRef.current;
    const caret = el?.selectionStart ?? note.length;
    const before = note.slice(0, caret).replace(/@([\w ]{0,24})$/, `@${p.full_name} `);
    setNote(before + note.slice(caret));
    setMentions((ids) => (ids.includes(p.id) ? ids : [...ids, p.id]));
    setMentionQuery(null);
    el?.focus();
  }
  const mentionMatches = mentionQuery == null ? [] : people.filter((p) => p.id !== profile.id && p.full_name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6);

  async function logCall() {
    setBusy(true);
    const started = new Date();
    const mins = Number(callMins) || 0;
    const ended = mins > 0 ? new Date(started.getTime() + mins * 60_000) : null;
    const { data, error } = await createClient().rpc("log_call", {
      p_contact: contact?.id || "",
      p_direction: callDir,
      p_phone: contact?.phones?.[0] || undefined,
      p_started: started.toISOString(),
      p_ended: ended ? ended.toISOString() : undefined,
      p_disposition: callDisp,
      p_notes: callNotes || undefined,
      p_next_action: nextAction || undefined,
      p_next_at: nextAt ? new Date(nextAt).toISOString() : undefined,
      p_conversation: conversation.id,
      p_promise: callPromise || undefined,
      p_promise_due: callPromiseDue ? new Date(callPromiseDue).toISOString() : undefined,
    });
    setBusy(false);
    if (error) return toast.push(errText(error), "danger");
    const r = data as unknown as LogCallResult;
    toast.push(r.callback_id ? "Call logged · callback scheduled" : r.commitment_id ? "Call logged · promise recorded" : "Call logged", "success");
    setCallNotes("");
    setNextAction("");
    setNextAt("");
    setCallPromise("");
    setCallPromiseDue("");
    setCallMins("");
    onChanged();
  }

  async function addPromise() {
    if (!promiseText.trim() || !promiseDue) return;
    setBusy(true);
    const { error } = await createClient().rpc("add_promise", { p_conversation: conversation.id, p_text: promiseText.trim(), p_due: new Date(promiseDue).toISOString() });
    setBusy(false);
    if (error) return toast.push(errText(error), "danger");
    toast.push("Promise recorded — it will remind you before it is due", "success");
    setPromiseText("");
    onChanged();
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "reply", label: "Reply", icon: <Send size={13} /> },
    { key: "note", label: "Internal note", icon: <StickyNote size={13} /> },
    { key: "call", label: "Log call", icon: <Phone size={13} /> },
    { key: "promise", label: "Promise", icon: <Handshake size={13} /> },
  ];

  return (
    <div className="border-t bg-[var(--bg-elev)] shrink-0">
      <div className="flex items-center gap-1 px-2 pt-1.5 overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn("inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--radius-sm)] text-xs whitespace-nowrap", tab === t.key ? "bg-[var(--neutral-bg)] font-medium" : "text-muted hover:text-[var(--fg)]")}>
            {t.icon} {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 pr-1">
          <Button size="xs" variant="ghost" onClick={() => openBuddy({ mode: "draft", scope: { path: `/connect/${conversation.id}` }, message: `Draft a reply to ${contact?.name || "this contact"} about "${conversation.subject || conversation.channel}". Do not invent prices, discounts, timelines or guarantees.` })} title="Open GHL Buddy">
            <Bot size={13} /> Buddy
          </Button>
        </div>
      </div>

      {dnc && tab !== "note" && (
        <div className="mx-3 mt-2 rounded-[var(--radius-sm)] tone-danger px-3 py-2 text-xs flex items-start gap-2">
          <ShieldBan size={14} className="mt-0.5 shrink-0" />
          <span><strong>Do Not Contact.</strong> Outbound replies and calls are blocked for this contact. A manager or the contact owner can clear the flag from the contact card, with a reason.</span>
        </div>
      )}

      {/* ---------------------------------------------------------- Reply */}
      {tab === "reply" && (
        <div className="p-3 space-y-2">
          {needsApproval && (
            <div className="rounded-[var(--radius-sm)] tone-warn px-3 py-1.5 text-xs inline-flex items-center gap-1.5"><AlertTriangle size={12} /> Approval needed before send — a supervisor reviews your message before it leaves.</div>
          )}
          {sentNotice === "approval" && (
            <div className="rounded-[var(--radius-sm)] tone-info px-3 py-1.5 text-xs flex items-center justify-between gap-2">
              <span>Sent for approval. You will be notified once a supervisor decides.</span>
              <button onClick={() => setSentNotice(null)} aria-label="Dismiss"><X size={12} /></button>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-2">
            <Field label={kind === "email" ? "To" : `To (${CHANNEL_LABEL[kind] || kind})`}>
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder={kind === "email" ? "name@company.com" : "+91…"} disabled={dnc} />
            </Field>
            {kind === "email" ? (
              <Field label="Cc"><Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional, comma separated" disabled={dnc} /></Field>
            ) : (
              <Field label="Channel"><Input value={CHANNEL_LABEL[kind] || kind} readOnly /></Field>
            )}
            {kind === "email" && (
              <Field label="Subject" className="sm:col-span-2"><Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={dnc} /></Field>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={templateId} onChange={(e) => applyTemplate(e.target.value)} className="!w-auto max-w-[240px]" aria-label="Template" disabled={dnc}>
              <option value="">Template…</option>
              {usableTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.scope !== "company" ? ` (${t.scope})` : ""}</option>)}
            </Select>
            {ai.enabled ? (
              <Button size="sm" variant="secondary" onClick={draftWithBuddy} loading={drafting} disabled={dnc} title="AI Email Buddy drafts; you review before sending"><Sparkles size={13} /> Draft with Buddy</Button>
            ) : (
              <span className="text-[11px] text-muted inline-flex items-center gap-1"><Sparkles size={11} /> AI drafting is off (no API key)</span>
            )}
            {aiDrafted && <span className="pill tone-violet"><Bot size={10} /> AI draft — review before sending</span>}
          </div>
          <Textarea value={body} onChange={(e) => { setBody(e.target.value); }} placeholder={dnc ? "Blocked — Do Not Contact" : kind === "email" ? "Write your reply…" : `Write your ${CHANNEL_LABEL[kind] || kind} message…`} style={{ minHeight: 120 }} disabled={dnc} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 flex-1 min-w-[200px]">
              <Paperclip size={13} className="text-muted" />
              <Input value={attachInput} onChange={(e) => setAttachInput(e.target.value)} placeholder="Attachment path (e.g. files/brochure.pdf)" className="!h-8 text-xs" disabled={dnc} onKeyDown={(e) => { if (e.key === "Enter" && attachInput.trim()) { e.preventDefault(); setAttachments((a) => [...a, attachInput.trim()]); setAttachInput(""); } }} />
              <Button size="xs" variant="ghost" onClick={() => { if (attachInput.trim()) { setAttachments((a) => [...a, attachInput.trim()]); setAttachInput(""); } }} disabled={dnc}>Add</Button>
            </div>
            <Button variant="primary" onClick={send} loading={busy} disabled={dnc || !body.trim() || !to.trim()}><Send size={14} /> {needsApproval ? "Send for approval" : "Send"}</Button>
          </div>
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {attachments.map((a, i) => (
                <span key={i} className="pill tone-neutral"><FileText size={10} /> {a.split("/").pop()} <button onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))} aria-label="Remove"><X size={10} /></button></span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------- Note */}
      {tab === "note" && (
        <div className="p-3 space-y-2 relative">
          <Textarea ref={noteRef} value={note} onChange={onNoteChange} placeholder="Internal note — only your team sees this. Type @ to mention a colleague." style={{ minHeight: 84 }} className="!bg-[var(--warn-bg)]/40" />
          {mentionMatches.length > 0 && (
            <div className="absolute left-3 bottom-[52px] card p-1 z-20 anim-pop" style={{ boxShadow: "var(--shadow-lg)" }}>
              {mentionMatches.map((p) => <button key={p.id} className="block w-full text-left px-2.5 h-8 text-sm rounded-[var(--radius-sm)] hover:bg-[var(--neutral-bg)]" onClick={() => pickMention(p)}>{p.full_name}</button>)}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted">{mentions.length ? `Mentions: ${mentions.map((id) => people.find((p) => p.id === id)?.full_name.split(" ")[0]).filter(Boolean).join(", ")}` : "Notes never leave GHL ONE."}</span>
            <Button variant="primary" size="sm" onClick={addNote} loading={busy} disabled={!note.trim()}><StickyNote size={13} /> Add note</Button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- Call */}
      {tab === "call" && (
        <div className="p-3 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Field label="Direction">
              <Select value={callDir} onChange={(e) => setCallDir(e.target.value as typeof callDir)}>
                <option value="outbound">Outbound</option><option value="inbound">Inbound</option><option value="missed">Missed</option>
              </Select>
            </Field>
            <Field label="Disposition">
              <Select value={callDisp} onChange={(e) => setCallDisp(e.target.value)}>
                {CALL_DISPOSITIONS.map((d) => <option key={d} value={d}>{humanizeKey(d)}</option>)}
              </Select>
            </Field>
            <Field label="Duration (min)"><Input type="number" min={0} value={callMins} onChange={(e) => setCallMins(e.target.value)} placeholder="0" /></Field>
            <Field label="Phone"><Input value={contact?.phones?.[0] || ""} readOnly placeholder="No phone on file" /></Field>
          </div>
          <Textarea value={callNotes} onChange={(e) => setCallNotes(e.target.value)} placeholder="What was discussed? Facts only — no prices or guarantees that are not in approved material." style={{ minHeight: 72 }} />
          <div className="grid sm:grid-cols-2 gap-2">
            <Field label="Next action" hint="Type “callback” to schedule a callback."><Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="e.g. Send brochure / callback" /></Field>
            <Field label="Next action date"><Input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} /></Field>
            <Field label="Promise made (optional)"><Input value={callPromise} onChange={(e) => setCallPromise(e.target.value)} placeholder="e.g. Share the revised quote" /></Field>
            <Field label="Promise due"><Input type="datetime-local" value={callPromiseDue} onChange={(e) => setCallPromiseDue(e.target.value)} /></Field>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={logCall} loading={busy} disabled={!contact || (dnc && callDir === "outbound")}><Phone size={13} /> Log call</Button>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- Promise */}
      {tab === "promise" && (
        <div className="p-3 space-y-2">
          <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
            <Field label="What did we promise?"><Input value={promiseText} onChange={(e) => setPromiseText(e.target.value)} placeholder="e.g. Send the updated proposal" /></Field>
            <Field label="Due"><Input type="datetime-local" value={promiseDue} onChange={(e) => setPromiseDue(e.target.value)} /></Field>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted">Creates a commitment + follow-up. Your manager is told only if it goes overdue by a day.</span>
            <Button variant="primary" size="sm" onClick={addPromise} loading={busy} disabled={!promiseText.trim()}><Handshake size={13} /> Record promise</Button>
          </div>
        </div>
      )}
    </div>
  );
}
