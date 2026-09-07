"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, ListTree, Building2, Clock, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, Modal, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, fmtDate, isAdminRole, isLeadPlus, type Tables } from "@/lib/utils";
import { ClassificationPill } from "@/components/files/FileBits";
import { Markdown, extractHeadings } from "./markdown";
import { WikiEditor } from "./WikiEditor";

export type WikiPageData = Tables<"wiki_pages"> & {
  author: { id: string; full_name: string; avatar_url: string | null; designation: string | null } | null;
  department: { id: string; name: string; color: string } | null;
};

export function WikiPage({ page, siblings }: { page: WikiPageData; siblings: { id: string; title: string; slug: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [editing, setEditing] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [active, setActive] = React.useState<string | null>(null);
  const canEdit = isLeadPlus(profile.role) || page.author_id === profile.id;
  const canDelete = isAdminRole(profile.role);
  const headings = React.useMemo(() => extractHeadings(page.body).filter((h) => h.level <= 3), [page.body]);

  // Track the active heading for the TOC
  React.useEffect(() => {
    if (!headings.length || typeof IntersectionObserver === "undefined") return;
    const els = headings.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((entries) => {
      const first = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (first) setActive(first.target.id);
    }, { rootMargin: "-64px 0px -70% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [headings, editing]);

  async function remove() {
    setBusy(true);
    const { error } = await createClient().from("wiki_pages").delete().eq("id", page.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Page deleted", "success");
    router.push("/wiki");
    router.refresh();
  }

  if (editing) {
    return (
      <div className="page">
        <button onClick={() => setEditing(false)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]"><ArrowLeft size={14} /> Back to page</button>
        <h1 className="h1 mb-[var(--s3)]">Edit: {page.title}</h1>
        <Card className="p-[var(--s4)]">
          <WikiEditor
            initial={{ id: page.id, title: page.title, slug: page.slug, category: page.category, department_id: page.department_id, classification: page.classification, body: page.body }}
            onCancel={() => setEditing(false)}
            onSaved={(slug) => { setEditing(false); if (slug !== page.slug) router.push(`/wiki/${slug}`); }}
          />
        </Card>
      </div>
    );
  }

  const toc = headings.length > 1 && (
    <nav className="text-sm">
      <div className="eyebrow flex items-center gap-1.5 mb-2"><ListTree size={12} /> On this page</div>
      <ul className="space-y-0.5 border-l">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cn("block py-1 pr-2 -ml-px border-l-2 transition-colors truncate", h.level === 1 ? "pl-3" : h.level === 2 ? "pl-3" : "pl-6 text-xs", active === h.id ? "border-[var(--brand)] text-[var(--brand)] font-medium" : "border-transparent text-muted hover:text-[var(--fg)]")}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <div className="page">
      <Link href={`/wiki?category=${encodeURIComponent(page.category)}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]"><ArrowLeft size={14} /> {page.category}</Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-[var(--s4)]">
        <div className="min-w-0">
          <div className="eyebrow mb-1">{page.category}</div>
          <h1 className="h1 break-words">{page.title}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><Avatar name={page.author?.full_name || "GHL ONE"} src={page.author?.avatar_url} size={18} />{page.author ? <Link href={`/people/${page.author.id}`} className="hover:underline">{page.author.full_name}</Link> : "GHL ONE"}</span>
            <span className="inline-flex items-center gap-1"><Clock size={12} /> updated {ago(page.updated_at)}</span>
            {page.department && <span className="inline-flex items-center gap-1"><Building2 size={12} /><span className="w-1.5 h-1.5 rounded-full" style={{ background: page.department.color }} />{page.department.name}</span>}
            <ClassificationPill value={page.classification} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && <Button onClick={() => setEditing(true)}><Pencil size={15} /> Edit</Button>}
          {canDelete && <Button variant="ghost" icon className="text-danger" onClick={() => setConfirm(true)} aria-label="Delete"><Trash2 size={15} /></Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_233px] gap-[var(--s4)] items-start">
        <Card className="p-[var(--s4)] lg:p-[var(--s5)] min-w-0 overflow-hidden">
          {toc && <div className="lg:hidden mb-[var(--s4)] pb-[var(--s3)] border-b">{toc}</div>}
          <Markdown source={page.body} className="text-[15px] leading-relaxed" />
          <div className="mt-[var(--s5)] pt-[var(--s3)] border-t text-[11px] text-muted flex flex-wrap gap-x-3 gap-y-1">
            <span>Created {fmtDate(page.created_at)}</span>
            <span>Last updated {fmtDate(page.updated_at, true)}</span>
            <span>/wiki/{page.slug}</span>
          </div>
        </Card>
        <aside className="hidden lg:block space-y-[var(--s4)] sticky top-[calc(var(--topbar-h)+var(--s3))]">
          {toc && <Card className="p-[var(--s3)]">{toc}</Card>}
          {siblings.length > 0 && (
            <Card>
              <CardHeader title={<span className="text-sm">More in {page.category}</span>} action={<BookOpen size={14} className="text-muted" />} />
              <div className="px-[var(--s2)] pb-[var(--s2)]">
                {siblings.map((s) => (
                  <Link key={s.id} href={`/wiki/${s.slug}`} className="block px-2 py-1.5 rounded-[var(--radius-sm)] text-sm row-hover truncate">{s.title}</Link>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Delete page" width={420} footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" onClick={remove} loading={busy}>Delete</Button></>}>
        <p className="text-sm">Delete <strong>{page.title}</strong>? Links to this page will stop working.</p>
      </Modal>
    </div>
  );
}
