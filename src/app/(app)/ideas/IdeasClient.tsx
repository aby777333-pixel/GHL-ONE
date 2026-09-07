"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lightbulb, Plus, ChevronUp, FolderKanban, ArrowUpRight, Flame, Clock } from "lucide-react";
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pill, Select, Textarea, useToast } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { ago, cn, isManagerPlus, type Tables } from "@/lib/utils";

type Idea = Tables<"ideas">;
const STATUSES = ["open", "under_review", "accepted", "converted", "declined"] as const;
const STATUS_LABEL: Record<string, string> = { open: "Open", under_review: "Under review", accepted: "Accepted", converted: "Converted to project", declined: "Declined" };
const STATUS_TONE: Record<string, string> = { open: "tone-neutral", under_review: "tone-warn", accepted: "tone-success", converted: "tone-info", declined: "tone-muted" };

export function IdeasClient({ ideas: initial, myVotes: initialVotes, openNew }: { ideas: Idea[]; myVotes: string[]; openNew: boolean }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const manager = isManagerPlus(profile.role);
  const [ideas, setIdeas] = React.useState(initial);
  const [voted, setVoted] = React.useState<Set<string>>(() => new Set(initialVotes));
  const [sort, setSort] = React.useState<"votes" | "newest">("votes");
  const [status, setStatus] = React.useState("");
  const [showNew, setShowNew] = React.useState(openNew);
  const [busy, setBusy] = React.useState<string | null>(null);

  const list = ideas
    .filter((i) => !status || i.status === status)
    .sort((a, b) => (sort === "votes" ? b.votes - a.votes || b.created_at.localeCompare(a.created_at) : b.created_at.localeCompare(a.created_at)));

  async function vote(idea: Idea) {
    const supabase = createClient();
    const has = voted.has(idea.id);
    const delta = has ? -1 : 1;
    // optimistic
    setVoted((s) => { const n = new Set(s); if (has) n.delete(idea.id); else n.add(idea.id); return n; });
    setIdeas((s) => s.map((i) => (i.id === idea.id ? { ...i, votes: Math.max(0, i.votes + delta) } : i)));
    const { error } = has
      ? await supabase.from("idea_votes").delete().eq("idea_id", idea.id).eq("user_id", profile.id)
      : await supabase.from("idea_votes").insert({ idea_id: idea.id, user_id: profile.id });
    if (error) {
      setVoted((s) => { const n = new Set(s); if (has) n.add(idea.id); else n.delete(idea.id); return n; });
      setIdeas((s) => s.map((i) => (i.id === idea.id ? { ...i, votes: Math.max(0, i.votes - delta) } : i)));
      return toast.push(error.message, "danger");
    }
    // ideas.votes is kept in sync by a database trigger on idea_votes.
  }

  async function setIdeaStatus(idea: Idea, next: string) {
    setBusy(idea.id);
    const { error } = await createClient().from("ideas").update({ status: next }).eq("id", idea.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    setIdeas((s) => s.map((i) => (i.id === idea.id ? { ...i, status: next } : i)));
    toast.push(`Marked ${STATUS_LABEL[next].toLowerCase()}`, "success");
    router.refresh();
  }

  async function convert(idea: Idea) {
    setBusy(idea.id);
    const supabase = createClient();
    const { data, error } = await supabase.from("projects").insert({ org_id: profile.org_id!, name: idea.title, description: idea.body, owner_id: profile.id, created_by: profile.id, status: "planning", tags: ["idea"] }).select("id").single();
    if (error || !data) {
      setBusy(null);
      return toast.push(error?.message || "Could not create project", "danger");
    }
    const { error: uErr } = await supabase.from("ideas").update({ project_id: data.id, status: "converted" }).eq("id", idea.id);
    setBusy(null);
    if (uErr) return toast.push(uErr.message, "danger");
    setIdeas((s) => s.map((i) => (i.id === idea.id ? { ...i, status: "converted", project_id: data.id } : i)));
    toast.push("Project created from idea", "success");
    router.refresh();
    router.push(`/projects/${data.id}`);
  }

  return (
    <div className="page page-narrow">
      <PageHeader eyebrow="Idea Board" title="Ideas" subtitle="Anyone can suggest. Everyone can vote. Management turns the best into projects." actions={<Button variant="primary" onClick={() => setShowNew(true)}><Plus size={15} /> Submit idea</Button>} />

      <div className="flex items-center gap-2 mb-[var(--s3)] flex-wrap">
        <div className="inline-flex rounded-[var(--radius-sm)] border overflow-hidden">
          <button className={cn("btn btn-sm rounded-none border-0", sort === "votes" ? "btn-primary" : "btn-ghost")} onClick={() => setSort("votes")}><Flame size={13} /> Top</button>
          <button className={cn("btn btn-sm rounded-none border-0", sort === "newest" ? "btn-primary" : "btn-ghost")} onClick={() => setSort("newest")}><Clock size={13} /> Newest</button>
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="text-xs ml-auto" style={{ width: "auto", height: 32 }}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </Select>
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<Lightbulb size={18} />} title={ideas.length ? "No ideas match" : "No ideas yet"} hint="What could we do better? Post it — good ideas rise with votes." action={<Button variant="primary" onClick={() => setShowNew(true)}><Plus size={15} /> Submit idea</Button>} />
        </Card>
      ) : (
        <div className="space-y-2 stagger">
          {list.map((idea) => {
            const has = voted.has(idea.id);
            return (
              <Card key={idea.id} className="px-[var(--s3)] py-[var(--s3)] sm:px-[var(--s4)]">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => vote(idea)}
                    aria-pressed={has}
                    className={cn("flex flex-col items-center justify-center w-12 h-14 rounded-[var(--radius-sm)] border shrink-0 transition-colors", has ? "bg-[var(--brand)] text-[var(--brand-fg)] border-transparent" : "hover:bg-[var(--neutral-bg)]")}
                  >
                    <ChevronUp size={16} />
                    <span className="text-sm font-semibold num leading-none">{idea.votes}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Pill tone={STATUS_TONE[idea.status] || "tone-neutral"}>{STATUS_LABEL[idea.status] || idea.status}</Pill>
                      {idea.project_id && <Link href={`/projects/${idea.project_id}`} className="pill tone-info hover:underline"><FolderKanban size={10} /> Project <ArrowUpRight size={10} /></Link>}
                    </div>
                    <div className="font-medium mt-1.5 leading-snug">{idea.title}</div>
                    {idea.body && <p className="text-sm text-[var(--fg-2)] mt-1 whitespace-pre-wrap leading-relaxed">{idea.body}</p>}
                    <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap mt-2.5 text-xs text-muted">
                      <PersonChip id={idea.author_id} size={18} />
                      <span className="num">{ago(idea.created_at)}</span>
                      {manager && (
                        <span className="ml-auto flex items-center gap-1.5">
                          <Select value={idea.status} onChange={(e) => setIdeaStatus(idea, e.target.value)} className="text-xs" style={{ width: "auto", height: 28 }} disabled={busy === idea.id}>
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                            ))}
                          </Select>
                          {!idea.project_id && <Button size="xs" variant="secondary" loading={busy === idea.id} onClick={() => convert(idea)}><FolderKanban size={12} /> Convert to project</Button>}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showNew && <SubmitIdeaModal onClose={() => { setShowNew(false); if (openNew) router.replace("/ideas"); }} onCreated={(i) => setIdeas((s) => [i, ...s])} />}
    </div>
  );
}

function SubmitIdeaModal({ onClose, onCreated }: { onClose: () => void; onCreated: (i: Idea) => void }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    const { data, error } = await createClient().from("ideas").insert({ org_id: profile.org_id!, title: title.trim(), body: body.trim() || null, author_id: profile.id }).select("*").single();
    setLoading(false);
    if (error || !data) return toast.push(error?.message || "Could not post", "danger");
    toast.push("Idea posted", "success");
    onCreated(data);
    router.refresh();
    onClose();
  }
  return (
    <Modal open onClose={onClose} title="Submit an idea" width={560}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Your idea">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What could we do better?" required />
        </Field>
        <Field label="Details" hint="Why it matters, what it would take, who benefits.">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Optional context" style={{ minHeight: 100 }} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading}><Lightbulb size={14} /> Post idea</Button>
        </div>
      </form>
    </Modal>
  );
}
