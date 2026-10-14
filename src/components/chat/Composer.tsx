"use client";

import * as React from "react";
import { Mic, Paperclip, Send, Smile, X, FileText, Loader2, Flag, AlarmClock, CheckCheck, ChevronUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, useToast } from "@/components/ui";
import { cn, bytes } from "@/lib/utils";
import { VoiceRecorder } from "./VoiceRecorder";
import { QUICK_EMOJIS, MORE_EMOJIS, draftKey, loadDraft, saveDraft, pruneMentions, storagePath, isImage } from "./lib";
import type { ChatAttachment, MessagePriority, PersonLite, SendPayload } from "./types";
import { Sparkles, Users, Radio } from "lucide-react";
import { BUDDY_MENTION_ID } from "@/components/ai/buddyChat";

const BUDDY_CANDIDATE: PersonLite = { id: BUDDY_MENTION_ID, full_name: "GHLBuddy", avatar_url: null, designation: "Ask GHL Buddy here" };
/* @everyone / @here (0075). Rendered as `[@everyone]` so the body parser shows a chip, and the
   database trigger only honours them from an authorised sender — the composer merely offers them. */
export const EVERYONE_ID = "__everyone__";
export const HERE_ID = "__here__";
const EVERYONE_CANDIDATE: PersonLite = { id: EVERYONE_ID, full_name: "everyone", avatar_url: null, designation: "Notify every member" };
const HERE_CANDIDATE: PersonLite = { id: HERE_ID, full_name: "here", avatar_url: null, designation: "Notify members who are online" };

type Pending = { id: string; file: File; preview?: string };

const MAX_H = 168;

export const PRIORITY_OPTIONS: { key: MessagePriority; label: string; hint: string; tone: string }[] = [
  { key: "normal", label: "Normal", hint: "An ordinary message.", tone: "tone-neutral" },
  { key: "important", label: "Important", hint: "More visible, distinctive sound. Gets past 'mentions only'.", tone: "tone-brand" },
  { key: "urgent", label: "Urgent", hint: "Prominent alert that stays on screen, with acknowledgement. Gets past mutes and quiet hours.", tone: "tone-warn" },
  { key: "critical", label: "Critical", hint: "Operational or safety announcement. High-visibility alert, acknowledgement tracked.", tone: "tone-danger" },
];

const REMIND_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "No reminder" },
  { value: 30, label: "Remind after 30 min" },
  { value: 60, label: "Remind after 1 hour" },
  { value: 180, label: "Remind after 3 hours" },
  { value: 1440, label: "Remind after 1 day" },
];

export type ComposerPermissions = {
  /** Highest priority this person may send here (enforced again by the database). */
  maxPriority: MessagePriority;
  /** May address @everyone / @here and ask for acknowledgement. */
  canBroadcast: boolean;
  /** May escalate an unanswered message to the department head. */
  canEscalate: boolean;
};

const RANK: Record<MessagePriority, number> = { normal: 0, important: 1, urgent: 2, critical: 3 };

export function Composer({
  channelId,
  parentId,
  people,
  placeholder = "Message",
  disabled,
  autoFocus,
  permissions,
  onSend,
  onTyping,
}: {
  channelId: string;
  parentId?: string | null;
  people: PersonLite[];
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Omitted (thread replies, DMs): plain messages only. */
  permissions?: ComposerPermissions;
  onSend: (p: SendPayload) => Promise<boolean>;
  onTyping?: (typing: boolean) => void;
}) {
  const toast = useToast();
  const key = draftKey(channelId, parentId);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [text, setText] = React.useState("");
  const [mentionIds, setMentionIds] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState<Pending[]>([]);
  const [sending, setSending] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const [mention, setMention] = React.useState<{ query: string; start: number; index: number } | null>(null);
  const typingRef = React.useRef<{ on: boolean; timer: ReturnType<typeof setTimeout> | null }>({ on: false, timer: null });
  // 0075: priority + acknowledgement
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [priority, setPriority] = React.useState<MessagePriority>("normal");
  const [ack, setAck] = React.useState(false);
  const [remind, setRemind] = React.useState<number | null>(null);
  const [escalate, setEscalate] = React.useState(false);
  const canElevate = !!permissions && RANK[permissions.maxPriority] > 0;
  const canBroadcast = !!permissions?.canBroadcast;

  const grow = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(MAX_H, el.scrollHeight)}px`;
    el.style.overflowY = el.scrollHeight > MAX_H ? "auto" : "hidden";
  }, []);

  // Restore draft (deferred so hydration stays consistent)
  React.useEffect(() => {
    const t = setTimeout(() => {
      const d = loadDraft(key);
      if (d) {
        setText(d);
        requestAnimationFrame(grow);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [key, grow]);

  // Persist draft
  React.useEffect(() => {
    const t = setTimeout(() => saveDraft(key, text), 250);
    return () => clearTimeout(t);
  }, [key, text]);

  // Revoke object URLs
  React.useEffect(() => {
    return () => pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
  }, [pending]);

  const signalTyping = React.useCallback(() => {
    if (!onTyping) return;
    const st = typingRef.current;
    if (!st.on) {
      st.on = true;
      onTyping(true);
    }
    if (st.timer) clearTimeout(st.timer);
    st.timer = setTimeout(() => {
      st.on = false;
      onTyping(false);
    }, 2500);
  }, [onTyping]);

  const stopTyping = React.useCallback(() => {
    const st = typingRef.current;
    if (st.timer) clearTimeout(st.timer);
    if (st.on) {
      st.on = false;
      onTyping?.(false);
    }
  }, [onTyping]);

  React.useEffect(() => stopTyping, [stopTyping]);

  const candidates = React.useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    const list = people.filter((p) => (p.full_name || "").toLowerCase().includes(q)).slice(0, 6);
    if ("ghlbuddy".startsWith(q.replace(/\s/g, "")) || "buddy".startsWith(q)) list.unshift(BUDDY_CANDIDATE);
    if (canBroadcast) {
      if ("here".startsWith(q)) list.unshift(HERE_CANDIDATE);
      if ("everyone".startsWith(q)) list.unshift(EVERYONE_CANDIDATE);
    }
    return list.slice(0, 7);
  }, [mention, people, canBroadcast]);

  function detectMention(value: string, caret: number) {
    const before = value.slice(0, caret);
    const m = /(^|\s)@([\w .'-]{0,40})$/.exec(before);
    if (!m) return setMention(null);
    const start = caret - m[2]!.length - 1;
    setMention({ query: m[2]!, start, index: 0 });
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    detectMention(e.target.value, e.target.selectionStart);
    grow();
    signalTyping();
  }

  function insertAt(insert: string, from: number, to: number) {
    const next = text.slice(0, from) + insert + text.slice(to);
    setText(next);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      const pos = from + insert.length;
      el.setSelectionRange(pos, pos);
      grow();
    });
  }

  function pickMention(p: PersonLite) {
    if (!mention) return;
    const el = taRef.current;
    const caret = el ? el.selectionStart : text.length;
    if (p.id === BUDDY_MENTION_ID) {
      insertAt("@GHLBuddy ", mention.start, caret);
      setMention(null);
      return;
    }
    if (p.id === EVERYONE_ID || p.id === HERE_ID) {
      insertAt(`[@${p.full_name}] `, mention.start, caret);
      setMention(null);
      return;
    }
    insertAt(`[@${p.full_name}] `, mention.start, caret);
    setMentionIds((ids) => (ids.includes(p.id) ? ids : [...ids, p.id]));
    setMention(null);
  }

  function insertEmoji(e: string) {
    const el = taRef.current;
    const pos = el ? el.selectionStart : text.length;
    insertAt(e, pos, el ? el.selectionEnd : pos);
    setEmojiOpen(false);
  }

  function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.size > 0);
    if (!list.length) return;
    const tooBig = list.find((f) => f.size > 50 * 1024 * 1024);
    if (tooBig) {
      toast.push(`${tooBig.name} is larger than 50 MB`, "danger");
      return;
    }
    setPending((p) => [...p, ...list.map((file) => ({ id: `${Date.now()}-${Math.random()}`, file, preview: isImage(file.type) ? URL.createObjectURL(file) : undefined }))]);
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files || []);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  async function uploadAll(files: File[]): Promise<ChatAttachment[] | null> {
    const supabase = createClient();
    const out: ChatAttachment[] = [];
    for (const f of files) {
      const path = storagePath(channelId, f.name);
      const { error } = await supabase.storage.from("chat").upload(path, f, { contentType: f.type || "application/octet-stream", upsert: false });
      if (error) {
        toast.push(`Upload failed: ${f.name} — ${error.message}`, "danger");
        return null;
      }
      out.push({ path, name: f.name, size: f.size, type: f.type || "application/octet-stream" });
    }
    return out;
  }

  /** Priority and acknowledgement options travel with the message; reset after a successful send. */
  function extras(): Pick<SendPayload, "priority" | "ack_required" | "remind_after_minutes" | "escalate"> {
    if (!permissions) return {};
    const p = RANK[priority] <= RANK[permissions.maxPriority] ? priority : "normal";
    const a = canBroadcast && (ack || RANK[p] >= 2);
    return { priority: p, ack_required: a, remind_after_minutes: a ? remind : null, escalate: a && !!remind && escalate && permissions.canEscalate };
  }
  function resetExtras() {
    setPriority("normal");
    setAck(false);
    setRemind(null);
    setEscalate(false);
    setOptionsOpen(false);
  }

  async function submit() {
    const body = text.trim();
    if (sending || disabled) return;
    if (!body && !pending.length) return;
    setSending(true);
    stopTyping();
    const attachments = pending.length ? await uploadAll(pending.map((p) => p.file)) : [];
    if (!attachments) {
      setSending(false);
      return;
    }
    const ok = await onSend({
      body,
      mentions: pruneMentions(body, mentionIds, people),
      attachments,
      kind: attachments.length && !body ? "file" : "text",
      ...extras(),
    });
    setSending(false);
    if (ok) {
      setText("");
      setMentionIds([]);
      setPending([]);
      setMention(null);
      resetExtras();
      saveDraft(key, "");
      requestAnimationFrame(() => {
        grow();
        taRef.current?.focus();
      });
    }
  }

  async function sendVoice(blob: Blob, mime: string, duration: number) {
    setSending(true);
    const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    const file = new File([blob], `voice-note.${ext}`, { type: mime });
    const atts = await uploadAll([file]);
    if (!atts) {
      setSending(false);
      return;
    }
    atts[0]!.duration = duration;
    const ok = await onSend({ body: "", mentions: [], attachments: atts, kind: "voice", ...extras() });
    setSending(false);
    if (ok) {
      setRecording(false);
      resetExtras();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && candidates.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setMention((m) => m && { ...m, index: (m.index + (e.key === "ArrowDown" ? 1 : candidates.length - 1)) % candidates.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(candidates[mention.index] || candidates[0]!);
        return;
      }
      if (e.key === "Escape") {
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  if (disabled) return null;

  const activeOption = PRIORITY_OPTIONS.find((o) => o.key === priority)!;
  const extrasOn = priority !== "normal" || ack;
  const allowedPriorities = permissions ? PRIORITY_OPTIONS.filter((o) => RANK[o.key] <= RANK[permissions.maxPriority]) : [];

  return (
    <div className="relative border-t bg-[var(--bg-elev)] px-2 sm:px-3 pt-2 pb-2 safe-b">
      {/* Mention autocomplete */}
      {mention && candidates.length > 0 && (
        <div className="absolute left-3 right-3 sm:right-auto sm:w-80 bottom-full mb-1 card p-1 z-30 anim-pop" style={{ boxShadow: "var(--shadow-lg)" }}>
          {candidates.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickMention(p)}
              className={cn("w-full flex items-center gap-2.5 px-2 h-9 rounded-[var(--radius-sm)] text-left text-sm", i === mention.index ? "bg-[var(--neutral-bg)]" : "hover:bg-[var(--neutral-bg)]")}
            >
              {p.id === BUDDY_MENTION_ID ? (
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))" }}><Sparkles size={12} /></span>
              ) : p.id === EVERYONE_ID ? (
                <span className="w-6 h-6 rounded-full flex items-center justify-center tone-warn shrink-0"><Users size={12} /></span>
              ) : p.id === HERE_ID ? (
                <span className="w-6 h-6 rounded-full flex items-center justify-center tone-success shrink-0"><Radio size={12} /></span>
              ) : (
                <Avatar name={p.full_name} src={p.avatar_url} size={24} />
              )}
              <span className="truncate">{p.id === EVERYONE_ID || p.id === HERE_ID ? `@${p.full_name}` : p.full_name}</span>
              {p.designation && <span className="ml-auto text-[11px] text-muted truncate max-w-[40%]">{p.designation}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Emoji popover */}
      {emojiOpen && (
        <div className="absolute left-3 bottom-full mb-1 card p-2 z-30 anim-pop w-[264px]" style={{ boxShadow: "var(--shadow-lg)" }} onMouseLeave={() => setEmojiOpen(false)}>
          <div className="grid grid-cols-8 gap-1">
            {[...QUICK_EMOJIS, ...MORE_EMOJIS].map((e) => (
              <button key={e} type="button" onClick={() => insertEmoji(e)} className="h-8 rounded-[var(--radius-sm)] text-lg hover:bg-[var(--neutral-bg)]">
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Priority + acknowledgement (only for people allowed to raise a message's priority) */}
      {canElevate && optionsOpen && (
        <div className="card p-2.5 mb-2 anim-pop space-y-2" style={{ boxShadow: "var(--shadow)" }}>
          <div className="flex flex-wrap gap-1.5">
            {allowedPriorities.map((o) => (
              <button key={o.key} type="button" onClick={() => setPriority(o.key)} title={o.hint} className={cn("pill pill-lg border transition-colors", priority === o.key ? `${o.tone} border-transparent` : "tone-neutral border-transparent hover:border-[var(--line-strong)]")}>
                <Flag size={11} /> {o.label}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-muted">{activeOption.hint}</div>
          {canBroadcast && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" className="accent-[var(--brand)]" checked={ack || RANK[priority] >= 2} disabled={RANK[priority] >= 2} onChange={(e) => setAck(e.target.checked)} />
                <CheckCheck size={13} /> Ask for acknowledgement
              </label>
              {(ack || RANK[priority] >= 2) && (
                <select className="select !h-8 !py-0 text-xs w-auto" value={remind ?? ""} onChange={(e) => setRemind(e.target.value ? Number(e.target.value) : null)} aria-label="Reminder">
                  {REMIND_OPTIONS.map((o) => <option key={String(o.value)} value={o.value ?? ""}>{o.label}</option>)}
                </select>
              )}
              {(ack || RANK[priority] >= 2) && remind && permissions?.canEscalate && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" className="accent-[var(--brand)]" checked={escalate} onChange={(e) => setEscalate(e.target.checked)} />
                  <AlarmClock size={13} /> Escalate to the department head if still unanswered
                </label>
              )}
            </div>
          )}
          {canBroadcast && <div className="text-[11px] text-muted">Recipients see Seen · Acknowledge · Will respond · Need clarification under the message; you see who has answered. A reminder goes once, never during quiet hours.</div>}
        </div>
      )}

      {/* Pending attachments */}
      {pending.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {pending.map((p) => (
            <div key={p.id} className="relative shrink-0 flex items-center gap-2 h-14 pl-1.5 pr-7 rounded-[var(--radius-sm)] border sunken max-w-[220px]">
              {p.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.preview} alt="" className="w-11 h-11 rounded object-cover" />
              ) : (
                <span className="w-11 h-11 rounded tone-info flex items-center justify-center">
                  <FileText size={18} />
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-xs font-medium truncate max-w-[130px]">{p.file.name}</span>
                <span className="block text-[10px] text-muted">{bytes(p.file.size)}</span>
              </span>
              <button type="button" onClick={() => setPending((s) => s.filter((x) => x.id !== p.id))} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--bg-elev)] border flex items-center justify-center text-muted hover:text-[var(--fg)]" aria-label="Remove">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {recording ? (
        <div className="h-11 flex items-center">
          <VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} sending={sending} />
        </div>
      ) : (
        <div className="flex items-end gap-1">
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <Button type="button" variant="ghost" size="sm" icon onClick={() => fileRef.current?.click()} aria-label="Attach files" className="mb-1 text-muted">
            <Paperclip size={18} />
          </Button>
          <Button type="button" variant="ghost" size="sm" icon onClick={() => setEmojiOpen((o) => !o)} aria-label="Emoji" className="mb-1 text-muted hidden sm:inline-flex">
            <Smile size={18} />
          </Button>
          {canElevate && (
            <Button type="button" variant={extrasOn ? "secondary" : "ghost"} size="sm" icon onClick={() => setOptionsOpen((o) => !o)} aria-label="Priority and acknowledgement" aria-expanded={optionsOpen} title={extrasOn ? `${activeOption.label}${ack || RANK[priority] >= 2 ? " · acknowledgement" : ""}` : "Priority and acknowledgement"} className={cn("mb-1", extrasOn ? "" : "text-muted")}>
              {extrasOn ? <Flag size={16} className={priority === "critical" ? "text-danger" : priority === "urgent" ? "text-warn" : "text-[var(--brand-2)]"} /> : <ChevronUp size={16} className={optionsOpen ? "rotate-180" : ""} />}
            </Button>
          )}
          <div className={cn("flex-1 min-w-0 rounded-[var(--radius)] border bg-[var(--bg)] focus-within:border-[var(--brand-2)] transition-colors", priority === "critical" && "border-[var(--danger)]", priority === "urgent" && "border-[var(--warn)]")}>
            {extrasOn && (
              <div className="flex items-center gap-1 px-2 pt-1.5 text-[10px]">
                <span className={cn("pill", activeOption.tone)}><Flag size={9} /> {activeOption.label}</span>
                {(ack || RANK[priority] >= 2) && <span className="pill tone-neutral"><CheckCheck size={9} /> Acknowledge{remind ? ` · remind ${remind >= 1440 ? "1 day" : remind >= 60 ? `${remind / 60} h` : `${remind} min`}` : ""}</span>}
              </div>
            )}
            <textarea
              ref={taRef}
              value={text}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onBlur={() => setTimeout(() => setMention(null), 120)}
              placeholder={placeholder}
              autoFocus={autoFocus}
              rows={1}
              enterKeyHint="send"
              className="block w-full resize-none bg-transparent outline-none text-[15px] sm:text-sm leading-[1.5] px-3 py-2.5 placeholder:text-[var(--fg-muted)] max-h-[168px]"
              style={{ height: 42, overflowY: "hidden" }}
            />
          </div>
          {text.trim() || pending.length ? (
            <Button type="button" variant="primary" size="sm" icon onClick={submit} loading={sending} aria-label="Send" className="mb-1 !w-9 !h-9 rounded-full">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          ) : (
            <Button type="button" variant="secondary" size="sm" icon onClick={() => setRecording(true)} aria-label="Record voice note" className="mb-1 !w-9 !h-9 rounded-full">
              <Mic size={17} />
            </Button>
          )}
        </div>
      )}
      <div className="hidden lg:block text-[10px] text-muted mt-1 px-1">
        <b>Enter</b> to send · <b>Shift+Enter</b> new line · <b>@</b> to mention{canBroadcast ? " · @everyone / @here" : ""}{canElevate ? " · flag for priority" : ""}
      </div>
    </div>
  );
}
