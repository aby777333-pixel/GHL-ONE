"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, CheckCircle2, CircleHelp, MessageCircleQuestion, Plus, ThumbsUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pill, SearchInput, Tabs, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker } from "@/components/pickers";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink, useSeen } from "@/components/providers/ActivityProvider";
import { ago, cn, type Tables } from "@/lib/utils";
import { useTouchModule } from "@/components/intel/lib";

export type QuestionRow = Tables<"questions"> & { answer_count: number; top_votes: number };
type TabKey = "open" | "answered" | "mine";

export function QuestionsList({ rows, initialAsk }: { rows: QuestionRow[]; initialAsk?: boolean }) {
  const { profile, departments } = useSession();
  const router = useRouter();
  useTouchModule("questions");
  useSeen("nav:/wiki/questions");
  const [tab, setTab] = React.useState<TabKey>("open");
  const [q, setQ] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [ask, setAsk] = React.useState(!!initialAsk);

  const filtered = rows.filter((r) => (tab === "mine" ? r.author_id === profile.id : tab === "open" ? r.status === "open" : r.status !== "open") && (!dept || r.department_id === dept) && (!q || `${r.title} ${r.body || ""} ${r.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "open", label: "Open", count: rows.filter((r) => r.status === "open").length },
    { key: "answered", label: "Answered", count: rows.filter((r) => r.status !== "open").length },
    { key: "mine", label: "Mine", count: rows.filter((r) => r.author_id === profile.id).length || undefined },
  ];

  return (
    <div className="page">
      <PageHeader eyebrow="Wiki" title="Questions & answers" subtitle="Ask the company. Good answers get accepted and can be turned into approved knowledge." actions={<>
        <Link href="/office-hours" className="btn btn-secondary btn-sm"><Users size={14} /> Ask an expert</Link>
        <Link href="/wiki/knowledge" className="btn btn-secondary btn-sm"><BookOpen size={14} /> Knowledge</Link>
        <Button variant="primary" onClick={() => setAsk(true)}><Plus size={15} /> Ask a question</Button>
      </>} />
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions…" className="flex-1" />
        <DepartmentPicker value={dept} onChange={setDept} placeholder="All departments" className="sm:w-56" />
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-3" />
      <Card>
        {filtered.length === 0 ? (
          <EmptyState icon={<MessageCircleQuestion size={18} />} title={tab === "open" ? "No open questions" : tab === "mine" ? "You have not asked anything yet" : "Nothing answered yet"} hint="Questions are visible to everyone in the company; answers notify the asker." action={<Button size="sm" variant="primary" onClick={() => setAsk(true)}><Plus size={14} /> Ask a question</Button>} />
        ) : (
          <div className="divide-y">
            {filtered.map((r) => (
              <Link key={r.id} href={`/wiki/questions/${r.id}`} className="flex items-start gap-3 px-[var(--s4)] py-3 row-hover">
                <div className="w-12 shrink-0 text-center">
                  <div className={cn("text-lg font-semibold num leading-tight", r.status !== "open" && "text-success")}>{r.answer_count}</div>
                  <div className="text-[10px] text-muted uppercase tracking-wide">{r.answer_count === 1 ? "answer" : "answers"}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{r.title}</span>
                    <Blink zone={`user:${r.author_id}`} />
                    {r.status !== "open" ? <Pill tone="tone-success"><CheckCircle2 size={10} /> Answered</Pill> : <Pill tone="tone-warn"><CircleHelp size={10} /> Open</Pill>}
                    {r.top_votes > 0 && <Pill tone="tone-neutral"><ThumbsUp size={10} /> {r.top_votes}</Pill>}
                  </div>
                  {r.body && <div className="text-xs text-muted truncate-2 mt-0.5">{r.body}</div>}
                  <div className="text-[11px] text-muted mt-1 flex items-center gap-2 flex-wrap">
                    <PersonChip id={r.author_id} size={14} />
                    <span>{ago(r.created_at)}</span>
                    {r.department_id && <span>· {departments.find((d) => d.id === r.department_id)?.name}</span>}
                    {r.tags.map((t) => <span key={t} className="pill tone-neutral">#{t}</span>)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
      <AskQuestionModal open={ask} onClose={() => setAsk(false)} onCreated={(id) => { setAsk(false); router.push(`/wiki/questions/${id}`); }} />
    </div>
  );
}

/** Ask a question — with an "Already answered?" check against approved knowledge (`similar_knowledge`). */
export function AskQuestionModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [dept, setDept] = React.useState(profile.department_id || "");
  const [tags, setTags] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [similar, setSimilar] = React.useState<{ key: string; rows: { id: string; title: string; kind: string }[] }>({ key: "", rows: [] });

  React.useEffect(() => {
    const key = title.trim();
    if (!open || key.length < 6) return;
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc("similar_knowledge", { p_title: key, p_limit: 4 });
      if (alive) setSimilar({ key, rows: data || [] });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [title, open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 8) return;
    setBusy(true);
    const { data, error } = await createClient().from("questions").insert({ org_id: profile.org_id!, author_id: profile.id, title: title.trim(), body: body.trim() || null, department_id: dept || null, tags: tags.split(/[,\s]+/).map((t) => t.replace(/^#/, "").trim().toLowerCase()).filter(Boolean) }).select("id").single();
    setBusy(false);
    if (error || !data) return toast.push(error?.message || "Could not post", "danger");
    toast.push("Question posted", "success");
    setTitle(""); setBody(""); setTags("");
    onCreated(data.id);
  }
  const hits = similar.key === title.trim() ? similar.rows : [];
  return (
    <Modal open={open} onClose={onClose} title="Ask a question" width={600}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Question" hint="One clear sentence — at least 8 characters."><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. How do I raise a purchase order above ₹25,000?" required minLength={8} /></Field>
        {hits.length > 0 && (
          <div className="rounded-[var(--radius-sm)] border px-3 py-2 tone-info">
            <div className="text-xs font-medium mb-1 inline-flex items-center gap-1"><BookOpen size={12} /> Already answered? These approved articles look related:</div>
            <ul className="space-y-0.5">{hits.map((h) => <li key={h.id}><Link href={`/wiki/knowledge/${h.id}`} className="text-sm hover:underline">{h.title}</Link> <span className="text-[11px] opacity-70">· {h.kind}</span></li>)}</ul>
          </div>
        )}
        <Field label="Details"><Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What have you tried? What exactly do you need?" style={{ minHeight: 90 }} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Department"><DepartmentPicker value={dept} onChange={setDept} placeholder="Company-wide" /></Field>
          <Field label="Tags" hint="Comma-separated"><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="finance, purchase" /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={title.trim().length < 8}>Post question</Button></div>
      </form>
    </Modal>
  );
}
