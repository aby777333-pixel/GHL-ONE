"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, User, ListChecks, FolderKanban, MessageSquare, FileText, Gavel, Video, BookOpen, Building2, CheckSquare, X, History, Sparkles, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, EmptyState, Kbd, Skeleton, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/components/files/useLocalStorage";
import { callAI, type SearchAIResponse } from "@/lib/ai/types";
import { AIDisabledNote } from "@/components/ai/AIDisabledNote";
import { AIMarkdown } from "@/components/ai/AIMarkdown";

type Result = { kind: string; id: string; title: string; subtitle: string | null; link: string; rank: number };

const KINDS: { key: string; label: string; plural: string; icon: React.ReactNode }[] = [
  { key: "person", label: "Person", plural: "People", icon: <User size={15} /> },
  { key: "task", label: "Task", plural: "Tasks", icon: <ListChecks size={15} /> },
  { key: "project", label: "Project", plural: "Projects", icon: <FolderKanban size={15} /> },
  { key: "message", label: "Message", plural: "Messages", icon: <MessageSquare size={15} /> },
  { key: "file", label: "File", plural: "Files", icon: <FileText size={15} /> },
  { key: "decision", label: "Decision", plural: "Decisions", icon: <Gavel size={15} /> },
  { key: "meeting", label: "Meeting", plural: "Meetings", icon: <Video size={15} /> },
  { key: "wiki", label: "Wiki", plural: "Wiki pages", icon: <BookOpen size={15} /> },
  { key: "department", label: "Department", plural: "Departments", icon: <Building2 size={15} /> },
  { key: "approval", label: "Approval", plural: "Approvals", icon: <CheckSquare size={15} /> },
];
const kindMeta = (k: string) => KINDS.find((x) => x.key === k) || { key: k, label: k, plural: k, icon: <Search size={15} /> };

const RECENT_KEY = "ghl.search.recent";
function parseRecent(raw: string): string[] {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 8) : []; } catch { return []; }
}

export function SearchClient({ initialQuery, initialKind }: { initialQuery: string; initialKind: string }) {
  const router = useRouter();
  const [q, setQ] = React.useState(initialQuery);
  const [kind, setKind] = React.useState(initialKind);
  const [loaded, setLoaded] = React.useState<{ q: string; results: Result[] } | null>(null);
  const [recentRaw, setRecentRaw] = useLocalStorage(RECENT_KEY, "[]");
  const recent = React.useMemo(() => parseRecent(recentRaw), [recentRaw]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const needle = q.trim();
  const active = needle.length >= 2;
  const searched = active && loaded ? loaded.q : "";
  const loading = active && (!loaded || loaded.q !== needle);

  // AI answer: automatic for natural-language queries (≥ 3 words), on demand otherwise
  const [askedFor, setAskedFor] = React.useState("");
  const [ai, setAi] = React.useState<{ q: string; data?: SearchAIResponse; error?: string; disabled?: boolean } | null>(null);
  const wordCount = needle.split(/\s+/).filter(Boolean).length;
  const wantAI = active && (wordCount >= 3 || askedFor === needle);
  const aiReady = wantAI && ai?.q === needle ? ai : null;
  const aiLoading = wantAI && !aiReady;

  React.useEffect(() => {
    if (!wantAI) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const data = await callAI<SearchAIResponse>("search", { q: needle });
        if (alive) setAi({ q: needle, data });
      } catch (e) {
        const err = e as Error & { disabled?: boolean };
        if (alive) setAi({ q: needle, error: err.message || "AI search failed", disabled: err.disabled });
      }
    }, 600);
    return () => { alive = false; clearTimeout(t); };
  }, [wantAI, needle]);

  // Instant results; when the instant search finds nothing, fall back to what the AI search found
  const results = React.useMemo<Result[]>(() => {
    const base = active && loaded ? loaded.results : [];
    if (base.length === 0 && loaded?.q === needle && aiReady?.data?.results.length) return aiReady.data.results.map((r) => ({ ...r, rank: 0 }));
    return base;
  }, [active, loaded, needle, aiReady]);

  // Debounced live search
  React.useEffect(() => {
    if (needle.length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc("search_all", { q: needle, lim: 20 });
      if (!alive) return;
      setLoaded({ q: needle, results: (data as Result[]) || [] });
      const list = [needle, ...parseRecent(localStorage.getItem(RECENT_KEY) || "[]").filter((x) => x.toLowerCase() !== needle.toLowerCase())].slice(0, 8);
      setRecentRaw(JSON.stringify(list));
      const url = `/search?q=${encodeURIComponent(needle)}${kind ? `&kind=${kind}` : ""}`;
      window.history.replaceState(window.history.state, "", url);
    }, 260);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle]);

  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of results) m.set(r.kind, (m.get(r.kind) || 0) + 1);
    return m;
  }, [results]);
  const visible = kind ? results.filter((r) => r.kind === kind) : results;
  const grouped = React.useMemo(() => {
    const order = KINDS.map((k) => k.key);
    const m = new Map<string, Result[]>();
    for (const r of visible) { if (!m.has(r.kind)) m.set(r.kind, []); m.get(r.kind)!.push(r); }
    return [...m.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [visible]);

  const firstPerson = results.find((r) => r.kind === "person");
  const firstProject = results.find((r) => r.kind === "project");

  return (
    <div className="page page-narrow">
      <div className="text-center mb-[var(--s4)]">
        <div className="eyebrow mb-1">Universal search</div>
        <h1 className="h1">Find anything across the company</h1>
        <p className="text-sm text-muted mt-1">People, tasks, projects, messages, files, decisions, meetings, wiki and approvals — only what you are allowed to see.</p>
      </div>

      <div className="relative mb-[var(--s3)]">
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
          placeholder="Search everything…"
          className="input !h-[55px] !pl-12 !pr-24 !text-[17px] !rounded-[var(--radius)] shadow-[var(--shadow)]"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {loading && <Spinner />}
          {q && <button onClick={() => { setQ(""); inputRef.current?.focus(); }} className="btn btn-ghost btn-sm btn-icon" aria-label="Clear"><X size={15} /></button>}
          {!q && <span className="hidden sm:inline-flex"><Kbd>⌘K</Kbd></span>}
        </span>
      </div>

      {/* Kind chips */}
      {results.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 mb-[var(--s3)] -mx-1 px-1">
          <button onClick={() => setKind("")} className={cn("pill pill-lg shrink-0", !kind ? "tone-brand" : "tone-neutral")}>All <span className="num opacity-80">{results.length}</span></button>
          {KINDS.filter((k) => counts.has(k.key)).map((k) => (
            <button key={k.key} onClick={() => setKind(kind === k.key ? "" : k.key)} className={cn("pill pill-lg shrink-0", kind === k.key ? "tone-brand" : "tone-neutral")}>{k.icon} {k.plural} <span className="num opacity-80">{counts.get(k.key)}</span></button>
          ))}
        </div>
      )}

      {/* AI answer */}
      {active && wantAI && (
        <Card className="mb-[var(--s3)] px-[var(--s4)] py-[var(--s3)] border-[color-mix(in_oklab,var(--accent)_45%,var(--line))]">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={15} className="text-[var(--accent)] shrink-0" />
            <span className="eyebrow">AI answer</span>
            {aiLoading && <span className="text-[11px] text-muted ml-auto inline-flex items-center gap-1.5"><Spinner className="!w-3 !h-3" /> Thinking…</span>}
          </div>
          {aiLoading ? (
            <div className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-2/3" /></div>
          ) : aiReady?.disabled ? (
            <AIDisabledNote compact />
          ) : aiReady?.error ? (
            <div className="text-sm text-danger break-words">{aiReady.error}</div>
          ) : aiReady?.data ? (
            <>
              <AIMarkdown source={aiReady.data.answer} className="text-sm" />
              {aiReady.data.terms.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px] text-muted">
                  <span>Searched for:</span>
                  {aiReady.data.terms.map((t) => (
                    <button key={t} type="button" onClick={() => setQ(t)} className="pill tone-neutral hover:border-[var(--line-strong)]" title={`Search “${t}”`}>{t}</button>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </Card>
      )}
      {active && !wantAI && (
        <div className="flex justify-end mb-[var(--s3)]">
          <button type="button" onClick={() => setAskedFor(needle)} className="btn btn-secondary btn-sm"><Sparkles size={14} className="text-[var(--accent)]" /> Ask AI about this</button>
        </div>
      )}

      {/* Hint: everything related to X */}
      {searched && (firstPerson || firstProject) && !kind && (
        <div className="card px-[var(--s3)] py-2.5 mb-[var(--s3)] flex items-center gap-3 text-sm">
          <Sparkles size={15} className="text-[var(--accent)] shrink-0" />
          <span className="min-w-0 flex-1 truncate">Show everything related to <strong>{(firstProject || firstPerson)!.title}</strong></span>
          <Link href={(firstProject || firstPerson)!.link} className="btn btn-secondary btn-sm shrink-0">Open <ArrowRight size={13} /></Link>
        </div>
      )}

      {/* Results */}
      {q.trim().length < 2 ? (
        <div className="space-y-[var(--s4)]">
          {recent.length > 0 && (
            <Card>
              <div className="flex items-center justify-between px-[var(--s4)] pt-[var(--s3)] pb-1">
                <div className="eyebrow inline-flex items-center gap-1.5"><History size={12} /> Recent searches</div>
                <button className="text-[11px] text-muted hover:underline" onClick={() => setRecentRaw("[]")}>Clear</button>
              </div>
              <div className="px-[var(--s2)] pb-[var(--s2)]">
                {recent.map((r) => (
                  <button key={r} onClick={() => setQ(r)} className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-[var(--radius-sm)] text-sm text-left row-hover"><Search size={14} className="text-muted" /><span className="truncate">{r}</span></button>
                ))}
              </div>
            </Card>
          )}
          <Card>
            <EmptyState icon={<Search size={20} />} title="Start typing to search" hint="Try a person's name, a project, a file, a decision or a phrase from chat. Results appear as you type." />
          </Card>
        </div>
      ) : loading && !loaded ? (
        <div className="flex justify-center py-[var(--s6)]"><Spinner /></div>
      ) : visible.length === 0 ? (
        <Card><EmptyState icon={<Search size={20} />} title={`Nothing found for “${searched || q.trim()}”`} hint="Check the spelling, try fewer words, or search for a tag." /></Card>
      ) : (
        <div className="space-y-[var(--s3)] stagger">
          {grouped.map(([k, items]) => {
            const meta = kindMeta(k);
            return (
              <Card key={k}>
                <div className="flex items-center gap-2 px-[var(--s4)] pt-[var(--s3)] pb-1">
                  <span className="text-muted">{meta.icon}</span>
                  <span className="eyebrow">{meta.plural}</span>
                  <span className="text-[11px] text-muted num">{items.length}</span>
                </div>
                <div className="px-[var(--s2)] pb-[var(--s2)]">
                  {items.map((r) => (
                    <button key={r.kind + r.id} onClick={() => router.push(r.link)} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] text-left row-hover">
                      <span className="w-8 h-8 rounded-[var(--radius-sm)] sunken flex items-center justify-center text-muted shrink-0">{meta.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate">{highlight(r.title, searched)}</span>
                        {r.subtitle && <span className="block text-xs text-muted truncate">{r.subtitle}</span>}
                      </span>
                      <ArrowRight size={14} className="text-muted shrink-0 hidden sm:block" />
                    </button>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function highlight(text: string, needle: string): React.ReactNode {
  if (!needle) return text;
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="bg-[color-mix(in_oklab,var(--accent)_35%,transparent)] text-inherit rounded-sm px-0.5">{text.slice(i, i + needle.length)}</mark>{text.slice(i + needle.length)}</>;
}
