"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { addDays, addMonths, addWeeks, endOfWeek, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Filter, CalendarDays } from "lucide-react";
import { Button, PageHeader, Select, Tabs } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { cn, isManagerPlus } from "@/lib/utils";
import { AddEventModal } from "./AddEventModal";
import { AgendaView } from "./AgendaView";
import { EventModal } from "./EventModal";
import { LeaveTab } from "./LeaveTab";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { KINDS, KIND_COLOR, KIND_LABEL, inWindow, windowFor, type CalItem, type EventKind, type LeaveRow } from "./calendarUtils";
import { loadCalendarItems } from "./loadCalendar";

type View = "month" | "week" | "agenda" | "leave";

export function CalendarClient({ initialItems, initialWindow, leaves, projects, initialView, openNew }: { initialItems: CalItem[]; initialWindow: { from: string; to: string }; leaves: LeaveRow[]; projects: { id: string; name: string }[]; initialView?: string; openNew: boolean }) {
  const { profile, people } = useSession();
  const router = useRouter();
  const [today] = React.useState(() => new Date());
  const [view, setView] = React.useState<View>(initialView === "week" || initialView === "agenda" || initialView === "leave" ? initialView : "month");
  const [cursor, setCursor] = React.useState<Date>(today);
  const [selected, setSelected] = React.useState<Date | null>(null);
  const [items, setItems] = React.useState<CalItem[]>(initialItems);
  const [win, setWin] = React.useState({ from: new Date(initialWindow.from), to: new Date(initialWindow.to) });
  const [loading, setLoading] = React.useState(false);
  const [kinds, setKinds] = React.useState<Set<EventKind>>(() => new Set(KINDS));
  const [project, setProject] = React.useState("");
  const [showFilters, setShowFilters] = React.useState(false);
  const [open, setOpen] = React.useState<CalItem | null>(null);
  const [adding, setAdding] = React.useState(openNew);

  const pendingLeaves = isManagerPlus(profile.role) ? leaves.filter((l) => l.status === "pending" && l.user_id !== profile.id).length : leaves.filter((l) => l.status === "pending" && l.user_id === profile.id).length;

  const projectName = React.useCallback((id?: string | null) => (id ? projects.find((p) => p.id === id)?.name : undefined), [projects]);

  // Re-fetch when the cursor leaves the loaded window.
  React.useEffect(() => {
    if (view === "leave") return;
    const probe = view === "week" ? endOfWeek(cursor, { weekStartsOn: 1 }) : view === "agenda" ? addDays(today, 30) : cursor;
    const probeStart = view === "week" ? startOfWeek(cursor, { weekStartsOn: 1 }) : cursor;
    if (inWindow(probe, win) && inWindow(probeStart, win)) return;
    const next = windowFor(cursor);
    let alive = true;
    Promise.resolve().then(() => alive && setLoading(true));
    loadCalendarItems(createClient(), next.from, next.to, profile.id, (id) => people.find((p) => p.id === id)?.full_name || "Someone").then((rows) => {
      if (!alive) return;
      setItems(rows);
      setWin(next);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [cursor, view, win, today, profile.id, people]);

  const visible = React.useMemo(() => items.filter((i) => kinds.has(i.kind) && (!project || i.project_id === project)), [items, kinds, project]);

  const toggleKind = (k: EventKind) =>
    setKinds((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const allOn = kinds.size === KINDS.length;

  const go = (dir: -1 | 1) => setCursor((c) => (view === "week" ? addWeeks(c, dir) : addMonths(c, dir)));
  const title = view === "week" ? `${format(startOfWeek(cursor, { weekStartsOn: 1 }), "d MMM")} – ${format(endOfWeek(cursor, { weekStartsOn: 1 }), "d MMM yyyy")}` : view === "agenda" ? "Next 30 days" : format(cursor, "MMMM yyyy");

  const changeView = (v: View) => {
    setView(v);
    if (v === "leave") router.replace("/calendar?tab=leave");
    else if (initialView === "leave") router.replace("/calendar");
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Company calendar"
        title="Calendar"
        subtitle="Meetings, deadlines, milestones, campaigns, leave — one view of the company's time."
        actions={<Button variant="primary" onClick={() => setAdding(true)}><Plus size={15} /> Add event</Button>}
      />

      <Tabs tabs={[{ key: "month", label: "Month" }, { key: "week", label: "Week" }, { key: "agenda", label: "Agenda" }, { key: "leave", label: "Leave", count: pendingLeaves || undefined }]} value={view} onChange={changeView} className="mb-[var(--s3)]" />

      {view === "leave" ? (
        <LeaveTab leaves={leaves} />
      ) : (
        <>
          <div className="flex items-center gap-2 mb-[var(--s3)] flex-wrap">
            {view !== "agenda" && (
              <div className="inline-flex items-center gap-1">
                <Button size="sm" variant="secondary" icon aria-label="Previous" onClick={() => go(-1)}><ChevronLeft size={15} /></Button>
                <Button size="sm" variant="secondary" onClick={() => { setCursor(today); setSelected(today); }}>Today</Button>
                <Button size="sm" variant="secondary" icon aria-label="Next" onClick={() => go(1)}><ChevronRight size={15} /></Button>
              </div>
            )}
            <div className="h3 inline-flex items-center gap-2 min-w-0"><CalendarDays size={15} className="text-muted hidden sm:block" /> <span className="truncate">{title}</span>{loading && <span className="text-xs text-muted">Loading…</span>}</div>
            <div className="ml-auto flex items-center gap-2">
              <Select value={project} onChange={(e) => setProject(e.target.value)} className="max-w-[180px] text-xs" style={{ width: "auto", height: 32 }}>
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
              <Button size="sm" variant={allOn ? "secondary" : "primary"} onClick={() => setShowFilters((s) => !s)}><Filter size={14} /> <span className="hidden sm:inline">Kinds</span>{!allOn && <span className="num">{kinds.size}</span>}</Button>
            </div>
          </div>

          {showFilters && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 mb-[var(--s3)] anim-fade-in -mx-1 px-1">
              <button type="button" onClick={() => setKinds(allOn ? new Set() : new Set(KINDS))} className="pill pill-lg tone-neutral shrink-0">{allOn ? "None" : "All"}</button>
              {KINDS.map((k) => {
                const on = kinds.has(k);
                return (
                  <button type="button" key={k} onClick={() => toggleKind(k)} className={cn("pill pill-lg shrink-0 border transition-colors", on ? "border-transparent" : "tone-muted border-transparent opacity-60")} style={on ? { background: `color-mix(in oklab, ${KIND_COLOR[k]} 16%, transparent)`, color: "var(--fg)" } : undefined}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: KIND_COLOR[k] }} /> {KIND_LABEL[k]}
                  </button>
                );
              })}
            </div>
          )}

          {view === "month" && <MonthView cursor={cursor} items={visible} today={today} selected={selected} onSelect={setSelected} onOpen={setOpen} />}
          {view === "week" && <WeekView cursor={cursor} items={visible} today={today} onOpen={setOpen} />}
          {view === "agenda" && <AgendaView items={visible} today={today} onOpen={setOpen} projectName={projectName} />}
        </>
      )}

      <EventModal item={open} onClose={() => setOpen(null)} projectName={projectName} onDeleted={(id) => setItems((s) => s.filter((i) => i.id !== id))} />
      {adding && <AddEventModal open onClose={() => { setAdding(false); if (openNew) router.replace("/calendar"); }} defaultDate={selected} />}
    </div>
  );
}
