"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, CheckCircle2, CircleHelp, ThumbsUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Pill, Textarea, useToast } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { ago, cn, isLeadPlus, type Tables } from "@/lib/utils";
import { useTouchModule } from "@/components/intel/lib";

export type AnswerRow = Tables<"answers"> & { my_vote: boolean };

export function QuestionView({ q, answers }: { q: Tables<"questions">; answers: AnswerRow[] }) {
  const { profile, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  useTouchModule("questions");
  useSeen(`user:${q.author_id}`);
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const canAccept = q.author_id === profile.id || isLeadPlus(profile.role);
  const sorted = [...answers].sort((a, b) => Number(b.is_accepted) - Number(a.is_accepted) || b.votes - a.votes || a.created_at.localeCompare(b.created_at));
  const accepted = answers.find((a) => a.is_accepted);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length < 3) return;
    setBusy("post");
    const { error } = await createClient().from("answers").insert({ question_id: q.id, author_id: profile.id, body: body.trim() });
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    setBody(""); toast.push("Answer posted — the asker is notified", "success"); router.refresh();
  }
  async function vote(a: AnswerRow) {
    setBusy(`vote:${a.id}`);
    const sb = createClient();
    const { error } = a.my_vote ? await sb.from("answer_votes").delete().eq("answer_id", a.id).eq("user_id", profile.id) : await sb.from("answer_votes").insert({ answer_id: a.id, user_id: profile.id });
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    router.refresh();
  }
  async function accept(a: AnswerRow) {
    setBusy(`accept:${a.id}`);
    const sb = createClient();
    const un = a.is_accepted;
    if (!un && accepted) await sb.from("answers").update({ is_accepted: false }).eq("id", accepted.id);
    const { error } = await sb.from("answers").update({ is_accepted: !un }).eq("id", a.id);
    if (!error) await sb.from("questions").update({ status: un ? "open" : "answered", accepted_answer_id: un ? null : a.id }).eq("id", q.id);
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push(un ? "Acceptance removed" : "Answer accepted", "success"); router.refresh();
  }
  const convertHref = (a?: AnswerRow) => `/wiki/knowledge?new=1&title=${encodeURIComponent(q.title)}&body=${encodeURIComponent(`**Question**\n${q.title}\n${q.body || ""}\n\n**Answer**\n${a?.body || ""}`)}${q.department_id ? `&dept=${q.department_id}` : ""}${q.tags.length ? `&tags=${encodeURIComponent(q.tags.join(", "))}` : ""}`;

  return (
    <div className="page page-narrow">
      <Link href="/wiki/questions" className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]"><ArrowLeft size={14} /> Questions</Link>
      <Card className="p-[var(--s4)] mb-[var(--s3)]">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {q.status !== "open" ? <Pill tone="tone-success" size="lg"><CheckCircle2 size={11} /> Answered</Pill> : <Pill tone="tone-warn" size="lg"><CircleHelp size={11} /> Open</Pill>}
          {q.department_id && <Pill tone="tone-neutral" size="lg">{departments.find((d) => d.id === q.department_id)?.name}</Pill>}
          {q.tags.map((t) => <span key={t} className="pill tone-neutral">#{t}</span>)}
        </div>
        <h1 className="h1 break-words">{q.title}</h1>
        {q.body && <p className="text-sm mt-3 whitespace-pre-wrap">{q.body}</p>}
        <div className="text-[11px] text-muted mt-3 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1">Asked by <PersonChip id={q.author_id} size={14} /></span><span>· {ago(q.created_at)}</span>
          <span className="ml-auto flex items-center gap-1.5">
            <Link href="/office-hours" className="btn btn-ghost btn-xs"><Users size={12} /> Ask an expert</Link>
            {(canAccept || accepted) && <Link href={convertHref(accepted)} className="btn btn-secondary btn-xs"><BookOpen size={12} /> Convert to knowledge</Link>}
          </span>
        </div>
      </Card>

      <Card className="mb-[var(--s3)]">
        <CardHeader title={`${answers.length} answer${answers.length === 1 ? "" : "s"}`} subtitle={accepted ? "Accepted answer first" : canAccept ? "Accept the answer that solved it so others can trust it" : undefined} />
        {sorted.length === 0 ? <EmptyState title="No answers yet" hint="Know the answer? Post it below — the asker gets notified." className="py-[var(--s4)]" /> : (
          <div className="divide-y border-t">
            {sorted.map((a) => (
              <div key={a.id} className={cn("px-[var(--s4)] py-3 flex gap-3", a.is_accepted && "bg-[color-mix(in_oklab,var(--success)_6%,transparent)]")}>
                <div className="flex flex-col items-center gap-1 shrink-0 w-10">
                  <button type="button" onClick={() => vote(a)} disabled={busy === `vote:${a.id}`} className={cn("w-8 h-8 rounded-full border inline-flex items-center justify-center transition-colors", a.my_vote ? "tone-brand border-transparent" : "hover:bg-[var(--neutral-bg)]")} aria-label={a.my_vote ? "Remove upvote" : "Upvote"} title="Helpful"><ThumbsUp size={14} /></button>
                  <span className="text-xs num font-medium">{a.votes}</span>
                  {a.is_accepted && <CheckCircle2 size={16} className="text-success" aria-label="Accepted" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm whitespace-pre-wrap">{a.body}</p>
                  <div className="text-[11px] text-muted mt-2 flex items-center gap-2 flex-wrap">
                    <PersonChip id={a.author_id} size={14} /><span>· {ago(a.created_at)}</span>
                    {a.knowledge_id && <Link href={`/wiki/knowledge/${a.knowledge_id}`} className="pill tone-info"><BookOpen size={10} /> In knowledge</Link>}
                    <span className="ml-auto flex items-center gap-1">
                      {canAccept && <Button size="xs" variant={a.is_accepted ? "ghost" : "success"} loading={busy === `accept:${a.id}`} onClick={() => accept(a)}>{a.is_accepted ? "Un-accept" : <><CheckCircle2 size={12} /> Accept</>}</Button>}
                      {(canAccept || a.author_id === profile.id) && <Link href={convertHref(a)} className="btn btn-ghost btn-xs"><BookOpen size={12} /> To knowledge</Link>}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-[var(--s4)]">
        <form onSubmit={post} className="space-y-2">
          <div className="label">Your answer</div>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Be specific. Link to the SOP or file if there is one." style={{ minHeight: 90 }} />
          <div className="flex justify-end"><Button type="submit" variant="primary" loading={busy === "post"} disabled={body.trim().length < 3}>Post answer</Button></div>
        </form>
      </Card>
    </div>
  );
}
