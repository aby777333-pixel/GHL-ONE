"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, Building2, CheckCircle2, Plus, Sparkles, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, EmptyState, PageHeader, Pill, SearchInput, Select, Spinner, Tabs } from "@/components/ui";
import { DepartmentPicker } from "@/components/pickers";
import { ago, cn, fmtDate, type Tables } from "@/lib/utils";
import { KIND_LABEL, KNOWLEDGE_KINDS, KnowledgeEditor, emptyKnowledge } from "./KnowledgeEditor";
import { openBuddy } from "./buddyStore";

export type KnowledgeRow = Pick<Tables<"ai_knowledge">, "id" | "title" | "kind" | "department_id" | "tags" | "status" | "review_at" | "approved_at" | "approved_by" | "owner_id" | "updated_at" | "created_by" | "classification" | "source_type"> & { snippet?: string };
export type Ownership = { all: boolean; departments: string[] };

type TabKey = "approved" | "drafts" | "archived";
type SearchHit = { id: string; title: string; kind: string; department_id: string; snippet: string; review_at: string | null; outdated: boolean };

export function isOwnerOf(o: Ownership, departmentId: string | null | undefined) {
  return o.all || (!!departmentId && o.departments.includes(departmentId));
}
export const isOutdated = (review_at: string | null | undefined, today: string) => !!review_at && review_at < today;

export function KnowledgeBrowser({ rows, ownership, initial }: { rows: KnowledgeRow[]; ownership: Ownership; initial?: { q?: string; dept?: string; create?: boolean; title?: string; body?: string; tags?: string } }) {
  const { profile, departments, people } = useSession();
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>("approved");
  const [q, setQ] = React.useState(initial?.q || "");
  const [dept, setDept] = React.useState(initial?.dept || "");
  const [kind, setKind] = React.useState("");
  const [tag, setTag] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [create, setCreate] = React.useState(!!initial?.create);
  const [today] = React.useState(() => new Date().toISOString().slice(0, 10));

  const isOwner = ownership.all || ownership.departments.length > 0;
  const drafts = React.useMemo(() => rows.filter((r) => r.status === "draft"), [rows]);
  const queue = React.useMemo(() => drafts.filter((r) => isOwnerOf(ownership, r.department_id)), [drafts, ownership]);

  // Server-side full-text search for approved knowledge (RLS applies).
  React.useEffect(() => {
    const query = q.trim();
    if (query.length < 2 || tab !== "approved") {
      const t = setTimeout(() => setHits(null), 0);
      return () => clearTimeout(t);
    }
    let alive = true;
    const t = setTimeout(() => {
      setSearching(true);
      createClient().rpc("search_knowledge", { p_q: query, p_department: dept || undefined, p_limit: 40 }).then(({ data }) => {
        if (!alive) return;
        setHits((data || []) as SearchHit[]);
        setSearching(false);
      });
    }, 220);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, dept, tab]);

  const tags = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) for (const t of r.tags || []) m.set(t, (m.get(t) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t);
  }, [rows]);

  const list = React.useMemo(() => {
    const base = tab === "approved" ? rows.filter((r) => r.status === "approved") : tab === "drafts" ? drafts : rows.filter((r) => r.status === "archived");
    let out = base;
    if (hits && tab === "approved") {
      const byId = new Map(rows.map((r) => [r.id, r]));
      out = hits.map((h) => ({ ...(byId.get(h.id) || { id: h.id, title: h.title, kind: h.kind, department_id: h.department_id, tags: [], status: "approved", review_at: h.review_at, approved_at: null, approved_by: null, owner_id: null, updated_at: "", created_by: null, classification: "internal" as const, source_type: null }), snippet: h.snippet }));
    } else if (q.trim()) {
      const needle = q.trim().toLowerCase();
      out = out.filter((r) => r.title.toLowerCase().includes(needle) || (r.tags || []).some((t) => t.includes(needle)));
    }
    if (dept) out = out.filter((r) => r.department_id === dept || (dept === "company" && !r.department_id));
    if (kind) out = out.filter((r) => r.kind === kind);
    if (tag) out = out.filter((r) => (r.tags || []).includes(tag));
    return out;
  }, [rows, tab, drafts, hits, q, dept, kind, tag]);

  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name || "Department" : "Company-wide");
  const personName = (id: string | null) => (id ? people.find((p) => p.id === id)?.full_name || "Someone" : null);

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="Knowledge"
        title="Approved knowledge"
        subtitle="What GHL Buddy is allowed to answer from — SOPs, policies, FAQs, scripts and learnings, approved by each department's knowledge owner."
        actions={
          <>
            <Button variant="secondary" onClick={() => openBuddy({ message: "What approved knowledge do we have for my department?", send: true })}><Sparkles size={14} className="text-[var(--accent)]" /> Ask Buddy</Button>
            <Button variant="primary" onClick={() => setCreate(true)}><Plus size={15} /> New article</Button>
          </>
        }
      />

      <Tabs<TabKey>
        className="mb-[var(--s3)]"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "approved", label: "Approved", count: rows.filter((r) => r.status === "approved").length },
          { key: "drafts", label: isOwner ? "Drafts queue" : "My drafts", count: drafts.length },
          ...(isOwner ? [{ key: "archived" as TabKey, label: "Archived", count: rows.filter((r) => r.status === "archived").length }] : []),
        ]}
      />

      {tab === "drafts" && isOwner && queue.length > 0 && (
        <div className="rounded-[var(--radius)] border tone-warn px-3 py-2 text-xs mb-[var(--s3)] flex items-center gap-2">
          <CheckCircle2 size={14} /> {queue.length} draft{queue.length === 1 ? "" : "s"} waiting for your approval. Open one to review, edit and approve.
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-[var(--s3)]">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search approved knowledge…" className="sm:max-w-sm" />
        <DepartmentPicker value={dept === "company" ? "" : dept} onChange={setDept} placeholder="All departments" className="sm:!w-auto" />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="sm:!w-auto" aria-label="Kind">
          <option value="">All kinds</option>
          {KNOWLEDGE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </Select>
      </div>
      {tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-[var(--s3)]">
          {tags.map((t) => (
            <button key={t} type="button" onClick={() => setTag(tag === t ? "" : t)} className={cn("pill cursor-pointer", tag === t ? "tone-violet" : "tone-neutral hover:border-[var(--line-strong)]")}><Tag size={10} /> {t}</button>
          ))}
        </div>
      )}

      {searching && <div className="flex items-center gap-2 text-xs text-muted mb-2"><Spinner /> Searching…</div>}

      {list.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={20} />}
          title={tab === "drafts" ? "No drafts" : q ? "Nothing matches" : "No approved knowledge yet"}
          hint={tab === "approved" ? "Anyone can draft an article — your department's knowledge owner approves it, and Buddy uses it from then on." : "Save a Buddy answer as knowledge, or write a new article."}
          action={<Button variant="primary" onClick={() => setCreate(true)}><Plus size={14} /> New article</Button>}
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 stagger">
          {list.map((r) => {
            const outdated = isOutdated(r.review_at, today);
            return (
              <Link key={r.id} href={`/wiki/knowledge/${r.id}`} className="card card-hover p-3 min-w-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Pill tone="tone-violet">{KIND_LABEL[r.kind] || r.kind}</Pill>
                  {r.status === "draft" && <Pill tone="tone-warn">Draft</Pill>}
                  {r.status === "archived" && <Pill tone="tone-neutral">Archived</Pill>}
                  {outdated && <Pill tone="tone-danger"><AlertTriangle size={10} /> Review due</Pill>}
                </div>
                <div className="font-medium truncate-2">{r.title}</div>
                {r.snippet && <div className="text-xs text-muted truncate-2">{r.snippet}</div>}
                <div className="mt-auto flex items-center gap-2 text-[11px] text-muted min-w-0 pt-1">
                  <span className="inline-flex items-center gap-1 truncate"><Building2 size={11} /> {deptName(r.department_id)}</span>
                  {r.status === "draft" && r.created_by && <span className="truncate">· by {personName(r.created_by)}</span>}
                  {r.review_at && <span className="ml-auto num shrink-0">review {fmtDate(r.review_at)}</span>}
                  {!r.review_at && r.updated_at && <span className="ml-auto shrink-0">{ago(r.updated_at)}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <KnowledgeEditor
        open={create}
        onClose={() => setCreate(false)}
        initial={{ ...emptyKnowledge(initial?.dept || profile.department_id), title: initial?.title || "", body: initial?.body || "", tags: initial?.tags || "" }}
        canApprove={ownership.all || (!!profile.department_id && ownership.departments.includes(profile.department_id))}
        onSaved={(id) => {
          router.push(`/wiki/knowledge/${id}`);
          router.refresh();
        }}
      />
    </div>
  );
}
