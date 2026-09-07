"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Search, Plus, FolderKanban, MessageSquare, Video, CheckSquare, Megaphone, User, ListChecks, FileText, Gavel, Building2, BookOpen, Wand2, Calendar, Gauge, Users, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Kbd, Spinner } from "@/components/ui";
import { cn, isManagerPlus } from "@/lib/utils";

type Result = { kind: string; id: string; title: string; subtitle: string | null; link: string };
type Action = { id: string; label: string; icon: React.ReactNode; run: () => void; keywords?: string };

const KIND_ICON: Record<string, React.ReactNode> = {
  person: <User size={15} />, task: <ListChecks size={15} />, project: <FolderKanban size={15} />, message: <MessageSquare size={15} />,
  file: <FileText size={15} />, decision: <Gavel size={15} />, meeting: <Video size={15} />, wiki: <BookOpen size={15} />,
  department: <Building2 size={15} />, approval: <CheckSquare size={15} />,
};

export function CommandPalette({ open, onClose, onCapture, onAsk }: { open: boolean; onClose: () => void; onCapture: () => void; onAsk?: () => void }) {
  const router = useRouter();
  const { profile, people } = useSession();
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<Result[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [idx, setIdx] = React.useState(0);
  const mounted = React.useSyncExternalStore(() => () => {}, () => true, () => false);

  const go = React.useCallback((href: string) => { onClose(); router.push(href); }, [onClose, router]);

  const actions: Action[] = React.useMemo(() => [
    ...(onAsk ? [{ id: "ask", label: "Ask GHL (AI)", icon: <Sparkles size={15} />, run: onAsk, keywords: "ai assistant question chat brief summarise" }] : []),
    { id: "task", label: "Create task", icon: <Plus size={15} />, run: onCapture, keywords: "new todo" },
    { id: "project", label: "New project", icon: <FolderKanban size={15} />, run: () => go("/projects/new") },
    { id: "delegate", label: "Delegate work (natural language)", icon: <Wand2 size={15} />, run: () => go("/delegate") },
    { id: "meeting", label: "Schedule meeting", icon: <Video size={15} />, run: () => go("/meetings?new=1") },
    { id: "approval", label: "Request approval", icon: <CheckSquare size={15} />, run: () => go("/approvals?new=1") },
    { id: "announce", label: "Create announcement", icon: <Megaphone size={15} />, run: () => go("/announcements?new=1") },
    { id: "chat", label: "Open chat", icon: <MessageSquare size={15} />, run: () => go("/chat") },
    { id: "mywork", label: "My Work", icon: <ListChecks size={15} />, run: () => go("/my-work") },
    { id: "calendar", label: "Calendar", icon: <Calendar size={15} />, run: () => go("/calendar") },
    { id: "people", label: "People directory", icon: <Users size={15} />, run: () => go("/people") },
    ...(isManagerPlus(profile.role) ? [{ id: "command", label: "Command Center", icon: <Gauge size={15} />, run: () => go("/command") }] : []),
  ], [go, onCapture, onAsk, profile.role]);

  const filteredActions = q.trim() ? actions.filter((a) => (a.label + " " + (a.keywords || "")).toLowerCase().includes(q.toLowerCase())) : actions;
  const quickPeople = q.trim().length >= 2 ? people.filter((p) => p.full_name.toLowerCase().includes(q.toLowerCase())).slice(0, 3) : [];

  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) { setQ(""); setResults([]); setIdx(0); }
  }

  React.useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setResults([]); setLoading(false); return; }
      setLoading(true);
      const { data } = await createClient().rpc("search_all", { q: q.trim(), lim: 6 });
      if (!alive) return;
      setResults(((data as Result[]) || []).filter((r) => r.kind !== "person"));
      setLoading(false);
      setIdx(0);
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const items: { key: string; icon: React.ReactNode; title: string; subtitle?: string | null; run: () => void; group: string }[] = [
    ...quickPeople.map((p) => ({ key: "p" + p.id, icon: <User size={15} />, title: p.full_name, subtitle: p.designation, run: () => go(`/people/${p.id}`), group: "People" })),
    ...filteredActions.map((a) => ({ key: "a" + a.id, icon: a.icon, title: a.label, run: () => { onClose(); a.run(); }, group: "Actions" })),
    ...results.map((r) => ({ key: r.kind + r.id, icon: KIND_ICON[r.kind] || <Search size={15} />, title: r.title, subtitle: r.subtitle, run: () => go(r.link), group: r.kind.charAt(0).toUpperCase() + r.kind.slice(1) + "s" })),
  ];

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter") { e.preventDefault(); items[idx]?.run(); }
    if (e.key === "Escape") onClose();
  };

  if (!mounted || !open) return null;
  let lastGroup = "";
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-3 pt-[10vh]">
      <div className="absolute inset-0 bg-black/40 anim-fade-in" onClick={onClose} />
      <div className="relative card w-full max-w-[640px] overflow-hidden anim-pop" style={{ boxShadow: "var(--shadow-lg)" }} onKeyDown={onKey}>
        <div className="flex items-center gap-2 px-4 h-[52px] border-b">
          <Search size={17} className="text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a command or search everything…" className="flex-1 bg-transparent outline-none text-[15px]" />
          {loading ? <Spinner /> : <Kbd>Esc</Kbd>}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {items.length === 0 && <div className="text-sm text-muted text-center py-8">{q.trim().length >= 2 ? "Nothing found" : "Start typing…"}</div>}
          {items.map((it, i) => {
            const showGroup = it.group !== lastGroup;
            lastGroup = it.group;
            return (
              <React.Fragment key={it.key}>
                {showGroup && <div className="eyebrow px-2.5 pt-2 pb-1">{it.group}</div>}
                <button onMouseEnter={() => setIdx(i)} onClick={it.run} className={cn("w-full flex items-center gap-3 px-2.5 h-10 rounded-[var(--radius-sm)] text-left text-sm", i === idx ? "bg-[var(--neutral-bg)]" : "")}>
                  <span className="text-muted shrink-0">{it.icon}</span>
                  <span className="truncate">{it.title}</span>
                  {it.subtitle && <span className="ml-auto text-xs text-muted truncate max-w-[45%]">{it.subtitle}</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="flex items-center gap-3 px-4 h-9 border-t text-[11px] text-muted">
          <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate</span>
          <span><Kbd>Enter</Kbd> open</span>
          <span className="ml-auto flex items-center gap-3"><span className="hidden sm:inline"><Kbd>Ctrl</Kbd> <Kbd>J</Kbd> ask AI</span><span><Kbd>C</Kbd> quick capture</span></span>
        </div>
      </div>
    </div>,
    document.body
  );
}
