"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, Layers, SlidersHorizontal, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, EmptyState, Modal, PageHeader, SearchInput, Spinner } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, isLeadPlus } from "@/lib/utils";
import { ClassificationPill } from "@/components/files/FileBits";
import { WIKI_CATEGORIES, type WikiListItem } from "./constants";
import { WikiEditor } from "./WikiEditor";

export function WikiBrowser({ pages, initial }: { pages: WikiListItem[]; initial?: { category?: string; q?: string; create?: boolean } }) {
  const router = useRouter();
  const { profile, departments } = useSession();
  const [q, setQ] = React.useState(initial?.q || "");
  const [category, setCategory] = React.useState<string | undefined>(initial?.category);
  const [create, setCreate] = React.useState(!!initial?.create && isLeadPlus(profile.role));
  const [sideOpen, setSideOpen] = React.useState(false);
  const [hits, setHits] = React.useState<{ q: string; ids: Set<string> } | null>(null);
  const needleNow = q.trim();
  const bodyHits = hits && hits.q === needleNow ? hits.ids : null;
  const searching = needleNow.length >= 2 && !bodyHits;

  // Server-side title/body search (ilike) for the current query
  React.useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      const esc = needle.replace(/[%_,()]/g, " ");
      const { data } = await createClient().from("wiki_pages").select("id").or(`title.ilike.%${esc}%,body.ilike.%${esc}%`).limit(200);
      if (!alive) return;
      setHits({ q: needle, ids: new Set((data || []).map((r) => r.id)) });
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pages) m.set(p.category, (m.get(p.category) || 0) + 1);
    return m;
  }, [pages]);
  const categories = React.useMemo(() => {
    const known = new Set<string>(WIKI_CATEGORIES);
    const extra = [...counts.keys()].filter((c) => !known.has(c)).sort();
    return [...WIKI_CATEGORIES, ...extra];
  }, [counts]);

  const visible = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pages.filter((p) => {
      if (category && p.category !== category) return false;
      if (needle.length >= 2) {
        if (bodyHits) return bodyHits.has(p.id) || p.title.toLowerCase().includes(needle);
        return p.title.toLowerCase().includes(needle) || p.excerpt.toLowerCase().includes(needle);
      }
      if (needle) return p.title.toLowerCase().includes(needle);
      return true;
    });
  }, [pages, category, q, bodyHits]);

  const sidebar = (
    <nav className="flex flex-col gap-0.5">
      <button onClick={() => { setCategory(undefined); setSideOpen(false); }} className={cn("flex items-center gap-2 h-8 px-2 rounded-[var(--radius-sm)] text-sm text-left row-hover", !category && "bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] text-[var(--brand)] font-medium")}>
        <Layers size={14} /><span className="flex-1">All pages</span><span className="text-[11px] text-muted num">{pages.length}</span>
      </button>
      {categories.map((c) => (
        <button key={c} onClick={() => { setCategory(c); setSideOpen(false); }} className={cn("flex items-center gap-2 h-8 px-2 rounded-[var(--radius-sm)] text-sm text-left row-hover", category === c && "bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] text-[var(--brand)] font-medium")}>
          <span className="flex-1 truncate">{c}</span><span className="text-[11px] text-muted num">{counts.get(c) || 0}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="Knowledge"
        title="Company Wiki"
        subtitle="Policies, handbooks, standards and procedures — the single source of truth."
        actions={isLeadPlus(profile.role) ? <Button variant="primary" onClick={() => setCreate(true)}><Plus size={15} /> New page</Button> : undefined}
      />

      <div className="flex flex-col lg:flex-row gap-[var(--s4)]">
        <aside className="lg:w-[233px] shrink-0">
          <div className="lg:hidden mb-2">
            <Button size="sm" onClick={() => setSideOpen((o) => !o)}><SlidersHorizontal size={14} /> {category || "All categories"}</Button>
          </div>
          <div className={cn("card p-[var(--s2)] lg:block lg:sticky lg:top-[calc(var(--topbar-h)+var(--s3))]", sideOpen ? "block" : "hidden")}>{sidebar}</div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="relative mb-[var(--s3)]">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles and content…" />
            {searching && <Spinner className="absolute right-3 top-1/2 -translate-y-1/2" />}
          </div>

          {visible.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<BookOpen size={20} />}
                title={pages.length ? "No pages match" : "The wiki is empty"}
                hint={pages.length ? "Try another search or category." : "Start with onboarding, policies and SOPs so every answer lives in one place."}
                action={isLeadPlus(profile.role) ? <Button variant="primary" onClick={() => setCreate(true)}><Plus size={15} /> New page</Button> : undefined}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--s3)] stagger">
              {visible.map((p) => {
                const dept = departments.find((d) => d.id === p.department_id);
                return (
                  <Link key={p.id} href={`/wiki/${p.slug}`} className="card card-hover p-[var(--s4)] flex flex-col gap-2 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="eyebrow truncate">{p.category}</div>
                        <div className="h3 mt-0.5 truncate-2">{p.title}</div>
                      </div>
                      <ChevronRight size={16} className="text-muted shrink-0 mt-1" />
                    </div>
                    {p.excerpt && <p className="text-sm text-muted truncate-2">{p.excerpt}</p>}
                    <div className="flex items-center gap-2 flex-wrap mt-auto pt-1 text-[11px] text-muted">
                      <ClassificationPill value={p.classification} />
                      {dept && <span className="pill tone-neutral"><span className="w-1.5 h-1.5 rounded-full" style={{ background: dept.color }} />{dept.name}</span>}
                      <span className="ml-auto inline-flex items-center gap-1.5"><Avatar name={p.author?.full_name} src={p.author?.avatar_url} size={16} />{ago(p.updated_at)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Modal open={create} onClose={() => setCreate(false)} title="New wiki page" width={1024}>
        <WikiEditor initial={{ category }} onCancel={() => setCreate(false)} onSaved={(slug) => { setCreate(false); router.push(`/wiki/${slug}`); }} />
      </Modal>
    </div>
  );
}
