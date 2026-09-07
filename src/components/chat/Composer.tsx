"use client";

import * as React from "react";
import { Mic, Paperclip, Send, Smile, X, FileText, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, useToast } from "@/components/ui";
import { cn, bytes } from "@/lib/utils";
import { VoiceRecorder } from "./VoiceRecorder";
import { QUICK_EMOJIS, MORE_EMOJIS, draftKey, loadDraft, saveDraft, pruneMentions, storagePath, isImage } from "./lib";
import type { ChatAttachment, PersonLite, SendPayload } from "./types";

type Pending = { id: string; file: File; preview?: string };

const MAX_H = 168;

export function Composer({
  channelId,
  parentId,
  people,
  placeholder = "Message",
  disabled,
  autoFocus,
  onSend,
  onTyping,
}: {
  channelId: string;
  parentId?: string | null;
  people: PersonLite[];
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
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
    return people.filter((p) => (p.full_name || "").toLowerCase().includes(q)).slice(0, 6);
  }, [mention, people]);

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
    });
    setSending(false);
    if (ok) {
      setText("");
      setMentionIds([]);
      setPending([]);
      setMention(null);
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
    const ok = await onSend({ body: "", mentions: [], attachments: atts, kind: "voice" });
    setSending(false);
    if (ok) setRecording(false);
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
              <Avatar name={p.full_name} src={p.avatar_url} size={24} />
              <span className="truncate">{p.full_name}</span>
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
          <div className="flex-1 min-w-0 rounded-[var(--radius)] border bg-[var(--bg)] focus-within:border-[var(--brand-2)] transition-colors">
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
        <b>Enter</b> to send · <b>Shift+Enter</b> new line · <b>@</b> to mention
      </div>
    </div>
  );
}
