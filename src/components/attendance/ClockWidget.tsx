"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Clock, Coffee, LogIn, LogOut, MapPin, Play, ShieldCheck, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, Modal, Pill, Skeleton, Textarea, useToast } from "@/components/ui";
import { cn, type Tables } from "@/lib/utils";
import { useClock } from "./useClock";
import { fmtMinutes, istTime, MODES, MODE_LABEL, SHARE_LOCATION_KEY, type ClockMode, type ClockSnapshot } from "./attendanceUtils";

/* ------------------------------------------------------------ helpers */
function phaseLabel(s: ClockSnapshot) {
  if (s.phase === "in") return `In since ${istTime(s.firstIn)}`;
  if (s.phase === "break") return `On a break since ${istTime(s.since)}`;
  if (s.phase === "done") return `Out at ${istTime(s.lastOut)}`;
  return "Not clocked in";
}
function phaseTone(s: ClockSnapshot | null) {
  if (!s) return "tone-muted";
  return s.phase === "in" ? "tone-success" : s.phase === "break" ? "tone-warn" : s.phase === "done" ? "tone-neutral" : "tone-muted";
}
function readSharePref() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(SHARE_LOCATION_KEY) === "1";
  } catch {
    return false;
  }
}

export function TransparencyNote({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 text-[11px] text-muted", className)}>
      <ShieldCheck size={12} className="shrink-0" /> Visible to you, your manager and HR. Nothing else is tracked.
    </div>
  );
}

/* ------------------------------------------------------ clock-in modal */
/** Mode chooser + optional note + explicit, remembered, opt-in location share. Only mounts when opened (client-side). */
export function ClockInModal({ open, onClose, onSubmit, busy, defaultMode }: { open: boolean; onClose: () => void; onSubmit: (mode: ClockMode, note: string, share: boolean) => Promise<void>; busy: boolean; defaultMode?: ClockMode | null }) {
  return (
    <Modal open={open} onClose={onClose} title={<span className="inline-flex items-center gap-2"><LogIn size={15} className="text-muted" /> Clock in</span>} width={520}>
      {open && <ClockInForm onClose={onClose} onSubmit={onSubmit} busy={busy} defaultMode={defaultMode} />}
    </Modal>
  );
}

function ClockInForm({ onClose, onSubmit, busy, defaultMode }: { onClose: () => void; onSubmit: (mode: ClockMode, note: string, share: boolean) => Promise<void>; busy: boolean; defaultMode?: ClockMode | null }) {
  const [mode, setMode] = React.useState<ClockMode>(defaultMode || "office");
  const [note, setNote] = React.useState("");
  const [share, setShare] = React.useState<boolean>(() => readSharePref());
  const geoAvailable = React.useSyncExternalStore(() => () => {}, () => typeof navigator !== "undefined" && !!navigator.geolocation, () => true);

  function toggleShare(v: boolean) {
    setShare(v);
    try { window.localStorage.setItem(SHARE_LOCATION_KEY, v ? "1" : "0"); } catch { /* private mode */ }
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(mode, note, share); }}
      className="space-y-[var(--s3)]"
    >
      <div>
        <div className="label">Where are you working from today?</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button key={m.key} type="button" onClick={() => setMode(m.key)} className={cn("text-left rounded-[var(--radius-sm)] border p-2.5 transition-colors", mode === m.key ? "border-[var(--brand)] bg-[var(--info-bg)]" : "hover:border-[var(--line-strong)]")}>
              <div className="flex items-center gap-1.5 text-sm font-medium">{mode === m.key && <Check size={13} className="text-[var(--brand-2)]" />}{m.label}</div>
              <div className="text-[11px] text-muted mt-0.5 leading-snug">{m.hint}</div>
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="label">Note <span className="text-muted font-normal">(optional)</span></span>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Client meeting at Anna Nagar till noon" style={{ minHeight: 56 }} maxLength={280} />
      </label>
      <label className={cn("flex items-start gap-2.5 rounded-[var(--radius-sm)] border p-2.5 cursor-pointer", share ? "border-[var(--brand)] bg-[var(--info-bg)]" : "", !geoAvailable && "opacity-60")}>
        <input type="checkbox" checked={share} disabled={!geoAvailable} onChange={(e) => toggleShare(e.target.checked)} className="accent-[var(--brand)] mt-0.5" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium"><MapPin size={13} className="text-muted" /> Share my location for this check-in</span>
          <span className="block text-[11px] text-muted mt-0.5 leading-snug">
            {geoAvailable ? "Captured once, right now, from your browser — never continuously. Off by default; your choice is remembered on this device." : "Location is not available in this browser."}
          </span>
        </span>
      </label>
      <TransparencyNote />
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}><LogIn size={14} /> Clock in · {MODE_LABEL[mode]}</Button>
      </div>
    </form>
  );
}

/* --------------------------------------------------------- break modal */
type BreakTypeRow = Pick<Tables<"break_types">, "id" | "key" | "name" | "max_minutes" | "paid" | "requires_note" | "color">;

/** Break-type picker (from `break_types`) + optional note. Limits and coverage are enforced by the `clock` RPC. */
export function BreakModal({ open, onClose, onSubmit, busy }: { open: boolean; onClose: () => void; onSubmit: (type: string, note: string) => Promise<void>; busy: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={<span className="inline-flex items-center gap-2"><Coffee size={15} className="text-muted" /> Start a break</span>} width={480}>
      {open && <BreakForm onClose={onClose} onSubmit={onSubmit} busy={busy} />}
    </Modal>
  );
}

function BreakForm({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (type: string, note: string) => Promise<void>; busy: boolean }) {
  const [types, setTypes] = React.useState<BreakTypeRow[] | null>(null);
  const [type, setType] = React.useState<string>("");
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    let alive = true;
    createClient().from("break_types").select("id,key,name,max_minutes,paid,requires_note,color").eq("active", true).order("sort_order").then(({ data }) => {
      if (!alive) return;
      const list = (data || []) as BreakTypeRow[];
      setTypes(list);
      setType((t) => t || list.find((x) => x.key === "tea")?.key || list[0]?.key || "tea");
    });
    return () => { alive = false; };
  }, []);
  const chosen = types?.find((t) => t.key === type);
  const needsNote = !!chosen?.requires_note;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (needsNote && !note.trim()) return; onSubmit(type || "tea", note); }} className="space-y-[var(--s3)]">
      <div>
        <div className="label">What kind of break?</div>
        {!types ? (
          <div className="grid grid-cols-2 gap-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : types.length === 0 ? (
          <div className="text-xs text-muted">No break types are set up — a standard 15-minute break will be recorded.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {types.map((t) => (
              <button key={t.id} type="button" onClick={() => setType(t.key)} className={cn("text-left rounded-[var(--radius-sm)] border p-2.5 transition-colors", type === t.key ? "border-[var(--brand)] bg-[var(--info-bg)]" : "hover:border-[var(--line-strong)]")}>
                <div className="flex items-center gap-1.5 text-sm font-medium"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />{t.name}</div>
                <div className="text-[11px] text-muted mt-0.5 leading-snug num">up to {t.max_minutes} min{t.paid ? "" : " · unpaid"}{t.requires_note ? " · note needed" : ""}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      <label className="block">
        <span className="label">Note {needsNote ? <span className="text-danger">(required for this break type)</span> : <span className="text-muted font-normal">(optional)</span>}</span>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={needsNote ? "e.g. Bank errand, back by 3" : "Anything your team should know"} style={{ minHeight: 48 }} maxLength={200} required={needsNote} />
      </label>
      <div className="text-[11px] text-muted">Your team sees that you are on a break, and you get a nudge when the time is up. Nothing else is tracked.</div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!types}><Coffee size={14} /> Start break{chosen ? ` · ${chosen.name}` : ""}</Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------- action buttons */
function ActionButtons({ snapshot, busy, onClockIn, onAct, size = "sm", full }: { snapshot: ClockSnapshot; busy: boolean; onClockIn: () => void; onAct: (kind: "clock_out" | "break_start" | "break_end") => void; size?: "xs" | "sm" | "md"; full?: boolean }) {
  const cls = full ? "flex-1" : undefined;
  if (snapshot.phase === "out") return <Button size={size} variant="primary" onClick={onClockIn} loading={busy} className={cls}><LogIn size={14} /> Clock in</Button>;
  if (snapshot.phase === "done") return <Button size={size} variant="secondary" onClick={onClockIn} loading={busy} className={cls}><LogIn size={14} /> Clock in again</Button>;
  if (snapshot.phase === "break") {
    return (
      <>
        <Button size={size} variant="primary" onClick={() => onAct("break_end")} loading={busy} className={cls}><Play size={14} /> Resume</Button>
        <Button size={size} variant="ghost" onClick={() => onAct("clock_out")} disabled={busy} className={cls}><LogOut size={14} /> Clock out</Button>
      </>
    );
  }
  return (
    <>
      <Button size={size} variant="secondary" onClick={() => onAct("break_start")} loading={busy} className={cls}><Coffee size={14} /> Break</Button>
      <Button size={size} variant="danger" onClick={() => onAct("clock_out")} disabled={busy} className={cls}><LogOut size={14} /> Clock out</Button>
    </>
  );
}

/** Shared controller: state + the modal + toasts. */
function useClockController() {
  const clock = useClock();
  const toast = useToast();
  const [modal, setModal] = React.useState(false);
  const [breakModal, setBreakModal] = React.useState(false);

  async function clockIn(mode: ClockMode, note: string, share: boolean) {
    const r = await clock.act({ kind: "clock_in", mode, note, shareLocation: share });
    if (r.error) return toast.push(r.error, "danger");
    setModal(false);
    toast.push(`Clocked in · ${MODE_LABEL[mode]}${share ? " · location shared once" : ""}`, "success");
  }
  async function act(kind: "clock_out" | "break_start" | "break_end") {
    if (kind === "break_start") { setBreakModal(true); return; }
    const r = await clock.act({ kind });
    if (r.error) return toast.push(r.error, "danger");
    toast.push(kind === "clock_out" ? "Clocked out — have a good evening" : "Welcome back", kind === "clock_out" ? "info" : "success");
  }
  async function startBreak(type: string, note: string) {
    const r = await clock.act({ kind: "break_start", breakType: type, note });
    if (r.error) return toast.push(r.error, "danger");
    setBreakModal(false);
    toast.push(r.breakMaxMinutes ? `Break started · up to ${r.breakMaxMinutes} min` : "Break started", "success");
    if (r.coverageWarning) toast.push("Heads up: nobody else is marked available in your department right now — your lead has been told so they can cover.", "info");
  }
  return { ...clock, modal, setModal, breakModal, setBreakModal, clockIn, act, startBreak };
}

/* ------------------------------------------------------------ top bar */
/** Compact pill for the app top bar; opens a small popover with today's state and the primary action. */
export function ClockWidget({ className }: { className?: string }) {
  const c = useClockController();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const s = c.snapshot;
  const dot = !s ? "var(--line-strong)" : s.phase === "in" ? "var(--success)" : s.phase === "break" ? "var(--warn)" : s.phase === "done" ? "var(--fg-muted)" : "var(--line-strong)";
  const short = !s ? "…" : s.phase === "in" || s.phase === "break" ? fmtMinutes(s.minutes) : s.phase === "done" ? "Out" : "Clock in";

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn("h-9 px-2.5 rounded-[var(--radius-sm)] border bg-[var(--bg)] inline-flex items-center gap-2 text-sm hover:border-[var(--line-strong)] transition-colors", open && "border-[var(--line-strong)]")}
        title={s ? phaseLabel(s) : "Attendance"}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="relative inline-flex w-2 h-2 rounded-full" style={{ background: dot }}>{s?.phase === "in" && <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: dot }} />}</span>
        <Clock size={14} className="text-muted" />
        <span className="num hidden sm:inline">{short}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 card p-[var(--s3)] anim-pop w-[min(92vw,320px)]" style={{ boxShadow: "var(--shadow-lg)" }} role="dialog" aria-label="Attendance">
          {!s ? (
            <div className="space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-8" /></div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{phaseLabel(s)}</div>
                  <div className="text-[11px] text-muted">{s.phase === "out" ? "Today" : `${fmtMinutes(s.minutes)} worked${s.breakMinutes >= 1 ? ` · ${fmtMinutes(s.breakMinutes)} break` : ""}${s.mode ? ` · ${MODE_LABEL[s.mode]}` : ""}`}</div>
                </div>
                <Pill tone={phaseTone(s)}>{s.phase === "in" ? "In" : s.phase === "break" ? "Break" : s.phase === "done" ? "Out" : "—"}</Pill>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <ActionButtons snapshot={s} busy={c.busy} onClockIn={() => { setOpen(false); c.setModal(true); }} onAct={(k) => c.act(k)} full />
              </div>
              <TransparencyNote className="mt-2.5" />
              <Link href="/attendance" onClick={() => setOpen(false)} className="mt-2 flex items-center justify-between text-xs text-muted hover:text-[var(--fg)]">My attendance <ChevronRight size={13} /></Link>
            </>
          )}
        </div>
      )}
      <ClockInModal open={c.modal} onClose={() => c.setModal(false)} onSubmit={c.clockIn} busy={c.busy} defaultMode={s?.mode} />
      <BreakModal open={c.breakModal} onClose={() => c.setBreakModal(false)} onSubmit={c.startBreak} busy={c.busy} />
    </div>
  );
}

/* ---------------------------------------------------------------- card */
/** Bigger card for the Home page and the attendance page. */
export function ClockCard({ className }: { className?: string }) {
  const c = useClockController();
  const s = c.snapshot;
  return (
    <Card className={className}>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Clock size={15} className="text-muted" /> Attendance today</span>} subtitle={s ? phaseLabel(s) : "Loading…"} action={s && <Pill tone={phaseTone(s)} size="lg">{s.phase === "in" ? "Clocked in" : s.phase === "break" ? "On break" : s.phase === "done" ? "Clocked out" : "Not in yet"}</Pill>} />
      <div className="px-[var(--s4)] pb-[var(--s4)]">
        {!s ? (
          <div className="space-y-2"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-9" /></div>
        ) : (
          <>
            <div className="flex items-end gap-[var(--s4)] flex-wrap">
              <div>
                <div className="eyebrow">Hours so far</div>
                <div className="text-[1.618rem] font-semibold num leading-tight">{fmtMinutes(s.minutes)}</div>
              </div>
              <div className="flex items-center gap-[var(--s3)] text-xs text-muted flex-wrap">
                <span>In <span className="num text-[var(--fg)]">{istTime(s.firstIn)}</span></span>
                <span>Out <span className="num text-[var(--fg)]">{istTime(s.lastOut)}</span></span>
                {s.breakMinutes >= 1 && <span>Break <span className="num text-[var(--fg)]">{fmtMinutes(s.breakMinutes)}</span></span>}
                {s.mode && <Pill tone="tone-neutral">{MODE_LABEL[s.mode]}</Pill>}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-[var(--s3)] flex-wrap">
              <ActionButtons snapshot={s} busy={c.busy} onClockIn={() => c.setModal(true)} onAct={(k) => c.act(k)} size="md" />
              <Link href="/attendance" className="btn btn-ghost ml-auto text-xs">Details <ChevronRight size={13} /></Link>
            </div>
            {s.events.length > 0 && (
              <div className="mt-[var(--s3)] flex flex-wrap gap-1.5">
                {s.events.map((e) => (
                  <span key={e.id} className="pill tone-neutral num" title={e.note || undefined}>
                    {e.kind === "clock_in" ? <LogIn size={10} /> : e.kind === "clock_out" ? <LogOut size={10} /> : e.kind === "break_start" ? <Coffee size={10} /> : <Play size={10} />}
                    {istTime(e.occurred_at)}
                    {e.location ? <MapPin size={10} className="text-muted" /> : null}
                  </span>
                ))}
              </div>
            )}
            <TransparencyNote className="mt-[var(--s3)]" />
          </>
        )}
      </div>
      <ClockInModal open={c.modal} onClose={() => c.setModal(false)} onSubmit={c.clockIn} busy={c.busy} defaultMode={s?.mode} />
      <BreakModal open={c.breakModal} onClose={() => c.setBreakModal(false)} onSubmit={c.startBreak} busy={c.busy} />
    </Card>
  );
}
