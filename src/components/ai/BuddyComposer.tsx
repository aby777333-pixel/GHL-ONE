"use client";

import * as React from "react";
import { Bug, FileText, Keyboard, LifeBuoy, Mic, MicOff, Paperclip, Send, Volume2, VolumeX, X } from "lucide-react";
import { Button, Kbd, Modal, Select, Textarea, useToast } from "@/components/ui";
import type { BuddyAttachment, BuddyMode, BuddyRequest, BuddyScope } from "@/lib/ai/types";
import { bytes, cn } from "@/lib/utils";
import { BAR_MODES, LANGUAGES, MODE_META, TONES } from "./buddyModes";

/* ------------------------------------------------------------------ attachments ---- */

export type PendingAttachment = { id: string; att: BuddyAttachment; preview?: string; size: number };

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_IMAGE = 4 * 1024 * 1024;
const MAX_PDF = 8 * 1024 * 1024;
const MAX_TEXT = 512 * 1024;
const TEXT_EXT = /\.(txt|log|md|json|csv|tsv|xml|yml|yaml|html?|css|js|jsx|ts|tsx|sql|sh|env|ini|conf|toml)$/i;

export function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

/** Convert a File into a BuddyAttachment (or a human error message). */
export async function fileToAttachment(file: File): Promise<PendingAttachment | string> {
  const name = file.name || (file.type.startsWith("image/") ? "screenshot.png" : "file");
  if (IMAGE_MIMES.has(file.type)) {
    if (file.size > MAX_IMAGE) return `${name} is larger than 4 MB — crop or compress the screenshot`;
    const url = await readAsDataUrl(file);
    return { id: uid(), att: { kind: "image", name, mime: file.type, data: url.split(",")[1] || "" }, preview: url, size: file.size };
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(name)) {
    if (file.size > MAX_PDF) return `${name} is larger than 8 MB`;
    const url = await readAsDataUrl(file);
    return { id: uid(), att: { kind: "document", name, mime: "application/pdf", data: url.split(",")[1] || "" }, size: file.size };
  }
  if (file.type.startsWith("text/") || file.type === "application/json" || TEXT_EXT.test(name) || !file.type) {
    if (file.size > MAX_TEXT) return `${name} is larger than 512 KB — paste the relevant part instead`;
    const text = await file.text();
    if (!text.trim()) return `${name} is empty`;
    return { id: uid(), att: { kind: "text", name, text }, size: file.size };
  }
  if (file.type.startsWith("image/")) return `${name}: use PNG, JPEG, WebP or GIF`;
  return `${name}: images, PDFs and text files only`;
}

/* ------------------------------------------------------------------ speech (typed minimally) ---- */

type SpeechResultEvent = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
function recognizerCtor(): (new () => Recognizer) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
export function speechSupported() {
  return !!recognizerCtor();
}
export function synthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/* ------------------------------------------------------------------ composer ---- */

export type ComposerProps = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  pending: boolean;
  mode: BuddyMode;
  onMode: (m: BuddyMode) => void;
  scope: BuddyScope;
  attachments: PendingAttachment[];
  onAttachments: (fn: (prev: PendingAttachment[]) => PendingAttachment[]) => void;
  tone: NonNullable<BuddyRequest["tone"]>;
  onTone: (t: NonNullable<BuddyRequest["tone"]>) => void;
  language: string;
  onLanguage: (l: string) => void;
  readAloud: boolean;
  onReadAloud: (v: boolean) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  error?: string | null;
  /** Big "I'M STUCK" pressed with an empty composer → send "I'm stuck" immediately. */
  onStuck: () => void;
};

export function BuddyComposer({ value, onChange, onSend, pending, mode, onMode, scope, attachments, onAttachments, tone, onTone, language, onLanguage, readAloud, onReadAloud, inputRef, placeholder, error, onStuck }: ComposerProps) {
  const toast = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const recRef = React.useRef<Recognizer | null>(null);
  const baseRef = React.useRef("");
  const [listening, setListening] = React.useState(false);
  const [errorOpen, setErrorOpen] = React.useState(false);
  const [errorText, setErrorText] = React.useState("");
  const [voiceNote, setVoiceNote] = React.useState<string | null>(null);
  const canSpeak = React.useSyncExternalStore(() => () => {}, speechSupported, () => false);
  const canRead = React.useSyncExternalStore(() => () => {}, synthesisSupported, () => false);

  const addFiles = React.useCallback(async (files: File[] | FileList) => {
    const list = Array.from(files).filter((f) => f.size > 0);
    for (const f of list) {
      const r = await fileToAttachment(f);
      if (typeof r === "string") toast.push(r, "danger");
      else onAttachments((prev) => (prev.length >= 6 ? prev : [...prev, r]));
    }
  }, [onAttachments, toast]);

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files || []);
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  };

  const addErrorText = () => {
    const t = errorText.trim();
    if (!t) return;
    onAttachments((prev) => [...prev, { id: uid(), att: { kind: "text", name: "error.txt", text: t }, size: t.length }]);
    setErrorText("");
    setErrorOpen(false);
    if (mode === "chat") onMode("debug");
    inputRef.current?.focus();
  };

  // Voice dictation (Web Speech API) — toggle; appends interim + final text to the composer.
  const stopListening = React.useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {}
    recRef.current = null;
    setListening(false);
  }, []);
  const startListening = () => {
    const Ctor = recognizerCtor();
    if (!Ctor) {
      setVoiceNote("Voice input isn't supported in this browser — Chrome or Edge on desktop and Android work best.");
      return;
    }
    if (listening) return stopListening();
    const rec = new Ctor();
    rec.lang = LANGUAGES.find((l) => l.key === language)?.speech || "en-IN";
    rec.continuous = true;
    rec.interimResults = true;
    baseRef.current = value ? `${value.replace(/\s+$/, "")} ` : "";
    rec.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript || "";
        if (r.isFinal) finalText += t;
        else interim += t;
      }
      onChange(`${baseRef.current}${finalText}${interim}`.replace(/\s{2,}/g, " "));
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setVoiceNote("Microphone access was blocked. Allow the microphone for this site to dictate.");
      else if (e.error !== "aborted" && e.error !== "no-speech") setVoiceNote("Voice input stopped. Try again.");
      stopListening();
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
      setVoiceNote(null);
    } catch {
      setVoiceNote("Could not start voice input.");
    }
  };
  React.useEffect(() => () => { try { recRef.current?.abort(); } catch {} }, []);

  const meta = MODE_META[mode];
  const barModes = BAR_MODES.filter((m) => !MODE_META[m].needsTask || scope.taskId);
  const canSend = (value.trim().length > 0 || attachments.length > 0) && !pending;

  return (
    <div className="border-t bg-[var(--bg-elev)] shrink-0 safe-b">
      {/* Mode bar */}
      <div className="flex items-center gap-1.5 px-3 sm:px-4 pt-2.5 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={onStuck}
          disabled={pending}
          className={cn("shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-bold tracking-wide text-white transition-transform active:scale-[.98]", mode === "stuck" && "ring-2 ring-[var(--brand-2)] ring-offset-1 ring-offset-[var(--bg-elev)]")}
          style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))", boxShadow: "var(--shadow-sm)" }}
          title="I'm stuck — get unstuck fast"
        >
          <LifeBuoy size={14} /> I&apos;M STUCK
        </button>
        {barModes.filter((m) => m !== "stuck").map((m) => {
          const mm = MODE_META[m];
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onMode(active ? "chat" : m)}
              className={cn("shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-[11px] whitespace-nowrap transition-colors", active ? "border-transparent tone-violet font-medium" : "text-muted hover:text-[var(--fg)] hover:border-[var(--line-strong)] bg-[var(--bg)]")}
              aria-pressed={active}
              title={mm.hint}
            >
              <mm.icon size={12} /> {mm.label}
            </button>
          );
        })}
      </div>
      {mode !== "chat" && (
        <div className="px-3 sm:px-4 pt-1.5 text-[11px] text-muted flex items-center gap-1.5 min-w-0">
          <meta.icon size={11} className="shrink-0 text-[var(--violet)]" />
          <span className="truncate"><b className="text-[var(--fg)] font-medium">{meta.label}</b> · {meta.hint}</span>
          <button type="button" onClick={() => onMode("chat")} className="ml-auto shrink-0 btn btn-ghost btn-xs !h-5 !px-1.5">clear</button>
        </div>
      )}

      <div className="px-3 sm:px-4 pt-2 pb-2.5">
        {error && <div className="text-xs text-danger mb-2 break-words" role="alert">{error}</div>}
        {voiceNote && <div className="text-[11px] text-muted mb-2 flex items-center gap-1.5"><MicOff size={12} /> {voiceNote}</div>}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {attachments.map((a) => (
              <div key={a.id} className="relative shrink-0 flex items-center gap-2 h-12 pl-1.5 pr-7 rounded-[var(--radius-sm)] border sunken max-w-[220px]">
                {a.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.preview} alt="" className="w-9 h-9 rounded object-cover" />
                ) : (
                  <span className={cn("w-9 h-9 rounded flex items-center justify-center", a.att.name === "error.txt" ? "tone-danger" : "tone-info")}>{a.att.name === "error.txt" ? <Bug size={16} /> : <FileText size={16} />}</span>
                )}
                <span className="min-w-0">
                  <span className="block text-xs font-medium truncate max-w-[130px]">{a.att.name}</span>
                  <span className="block text-[10px] text-muted">{bytes(a.size)}</span>
                </span>
                <button type="button" onClick={() => onAttachments((prev) => prev.filter((x) => x.id !== a.id))} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--bg-elev)] border flex items-center justify-center text-muted hover:text-[var(--fg)]" aria-label="Remove attachment"><X size={11} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1.5">
          <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.log,.md,.json,.csv,.txt" className="hidden" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
          <Button type="button" variant="ghost" size="sm" icon onClick={() => fileRef.current?.click()} aria-label="Attach screenshot, PDF or text file" title="Attach screenshot / PDF / text (or paste / drop)" className="mb-1 text-muted"><Paperclip size={17} /></Button>
          <Button type="button" variant="ghost" size="sm" icon onClick={() => setErrorOpen(true)} aria-label="Paste an error" title="Paste an error or log" className="mb-1 text-muted hidden sm:inline-flex"><Bug size={17} /></Button>
          <Textarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (canSend) onSend();
              }
            }}
            rows={Math.min(6, Math.max(1, value.split("\n").length))}
            placeholder={listening ? "Listening… speak now" : placeholder}
            className={cn("flex-1 !min-h-[44px] !resize-none !py-[11px]", listening && "!border-[var(--danger)]")}
            aria-label="Message GHL Buddy"
          />
          <Button type="button" variant={listening ? "danger" : "ghost"} size="sm" icon onClick={startListening} aria-label={listening ? "Stop dictation" : "Dictate"} title={canSpeak ? (listening ? "Stop dictation" : "Dictate with your voice") : "Voice input not supported here"} className={cn("mb-1", !listening && "text-muted", listening && "animate-pulse")}><Mic size={17} /></Button>
          <Button variant="primary" icon onClick={onSend} disabled={!canSend} aria-label="Send" className="!w-11 !h-11 shrink-0"><Send size={16} /></Button>
        </div>

        {/* Tone / language / read aloud */}
        <div className="flex items-center gap-2 mt-2 text-[11px] text-muted min-w-0">
          <Select value={tone} onChange={(e) => onTone(e.target.value as NonNullable<BuddyRequest["tone"]>)} className="!h-6 !w-auto !py-0 !text-[11px] !pr-6" aria-label="Tone">
            {TONES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
          <Select value={language} onChange={(e) => onLanguage(e.target.value)} className="!h-6 !w-auto !py-0 !text-[11px] !pr-6 max-w-[140px]" aria-label="Answer language">
            {LANGUAGES.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </Select>
          <button type="button" onClick={() => onReadAloud(!readAloud)} className={cn("inline-flex items-center gap-1 h-6 px-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--neutral-bg)]", readAloud && "text-[var(--brand-2)]")} title={canRead ? "Read answers aloud" : "Read aloud not supported in this browser"} aria-pressed={readAloud}>
            {readAloud ? <Volume2 size={12} /> : <VolumeX size={12} />} <span className="hidden sm:inline">Read aloud</span>
          </button>
          <span className="ml-auto hidden lg:inline-flex items-center gap-2 shrink-0"><span><Kbd>Enter</Kbd> send</span><span><Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> newline</span><span className="inline-flex items-center gap-1"><Keyboard size={11} /> <Kbd>Ctrl</Kbd> <Kbd>J</Kbd></span></span>
        </div>
      </div>

      {/* Paste error modal */}
      <Modal open={errorOpen} onClose={() => setErrorOpen(false)} title="Paste an error or log" width={600} footer={<><Button variant="ghost" onClick={() => setErrorOpen(false)}>Cancel</Button><Button variant="primary" onClick={addErrorText} disabled={!errorText.trim()}><Bug size={14} /> Attach as error.txt</Button></>}>
        <p className="text-sm text-muted mb-2">Stack traces, console output, failed request bodies — paste as-is. Buddy reads it with the debugging checklist.</p>
        <textarea value={errorText} onChange={(e) => setErrorText(e.target.value)} className="textarea font-mono !text-[12px] !min-h-[220px] w-full" placeholder={"TypeError: Cannot read properties of undefined (reading 'id')\n    at TaskDetail (TaskDetail.tsx:212)…"} autoFocus spellCheck={false} />
      </Modal>
    </div>
  );
}
