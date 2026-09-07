"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, ScrollText, ShieldCheck, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, Pill, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { Markdown } from "@/components/wiki/markdown";
import { cn, fmtDate, humanize, type Tables } from "@/lib/utils";
import { parseQuiz } from "@/components/admin/people/lib";
import { PersonChip } from "@/components/tasks/TaskBits";

export type PolicyViewData = { policy: Tables<"policies">; ack: Tables<"policy_acks"> | null; versions: Pick<Tables<"policy_versions">, "version" | "effective_on" | "published_at" | "change_note">[] };

/** Employee policy page: read, optional quiz (≥ pass mark), then Read & Confirm → `policy_acks`. */
export function PolicyView({ data }: { data: PolicyViewData }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const { policy, ack } = data;
  const quiz = React.useMemo(() => parseQuiz(policy.quiz), [policy.quiz]);
  const [answers, setAnswers] = React.useState<Record<number, number>>({});
  const [result, setResult] = React.useState<{ score: number; passed: boolean } | null>(null);
  const [readToEnd, setReadToEnd] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = endRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setReadToEnd(true); }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const needsQuiz = quiz.length > 0;
  const allAnswered = needsQuiz && quiz.every((_, i) => answers[i] != null);

  function grade() {
    const correct = quiz.filter((q, i) => answers[i] === q.answer).length;
    const score = Math.round((correct / quiz.length) * 100);
    setResult({ score, passed: score >= policy.pass_mark });
  }

  async function confirm() {
    setBusy(true);
    const { error } = await createClient().from("policy_acks").insert({ policy_id: policy.id, user_id: profile.id, version: policy.version, quiz_score: result?.score ?? null });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`Thanks — “${policy.title}” confirmed`, "success");
    router.refresh();
  }

  const confirmed = !!ack;
  const canConfirm = readToEnd && (!needsQuiz || !!result?.passed);

  return (
    <div className="page page-narrow space-y-[var(--s4)]">
      <Link href="/inbox" className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)]"><ArrowLeft size={14} /> Inbox</Link>
      <Card className="overflow-hidden">
        <div className="px-[var(--s4)] pt-[var(--s4)] pb-[var(--s3)] border-b">
          <div className="eyebrow inline-flex items-center gap-1.5"><ScrollText size={12} /> Policy · {humanize(policy.category)}</div>
          <h1 className="h1 mt-1">{policy.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-2">
            <Pill tone="tone-neutral">v{policy.version}</Pill>
            <span>Effective {fmtDate(policy.effective_on)}</span>
            {policy.owner_id && <span className="inline-flex items-center gap-1">Owner <PersonChip id={policy.owner_id} size={14} /></span>}
            {policy.review_at && <span>Next review {fmtDate(policy.review_at)}</span>}
            {confirmed ? <Pill tone="tone-success"><CheckCircle2 size={11} className="mr-1" />Confirmed {fmtDate(ack!.acked_at, true)}</Pill> : policy.requires_ack ? <Pill tone="tone-warn">Confirmation required</Pill> : null}
          </div>
        </div>
        <div className="px-[var(--s4)] py-[var(--s4)]">
          <Markdown source={policy.body} />
          <div ref={endRef} className="h-px" />
        </div>
      </Card>

      {data.versions.length > 1 && (
        <Card>
          <CardHeader title="Version history" />
          <ul className="divide-y border-t text-sm">{data.versions.map((v) => <li key={v.version} className="px-[var(--s4)] py-2 flex items-center gap-3"><Pill tone={v.version === policy.version ? "tone-brand" : "tone-neutral"}>v{v.version}</Pill><span className="text-muted text-xs">effective {fmtDate(v.effective_on)} · published {fmtDate(v.published_at)}</span>{v.change_note && <span className="text-xs truncate">{v.change_note}</span>}</li>)}</ul>
        </Card>
      )}

      {policy.requires_ack && !confirmed && (
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-[var(--brand)]" /> Read & confirm</span>} subtitle={needsQuiz ? `Answer ${quiz.length} quick question${quiz.length === 1 ? "" : "s"} (pass mark ${policy.pass_mark}%) and confirm you have read and understood this policy.` : "Confirm you have read and understood this policy. Your confirmation is recorded with the version number."} />
          <div className="px-[var(--s4)] pb-[var(--s4)] space-y-4">
            {needsQuiz && quiz.map((q, i) => (
              <div key={i} className="space-y-1.5">
                <div className="text-sm font-medium">{i + 1}. {q.q}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {q.options.map((o, j) => {
                    const chosen = answers[i] === j;
                    const graded = result != null;
                    const right = graded && j === q.answer;
                    const wrong = graded && chosen && j !== q.answer;
                    return <button type="button" key={j} disabled={graded && result?.passed} onClick={() => { setResult(null); setAnswers((a) => ({ ...a, [i]: j })); }} className={cn("text-left rounded-[var(--radius-sm)] border px-3 py-2 text-sm transition-colors", right ? "tone-success border-transparent" : wrong ? "tone-danger border-transparent" : chosen ? "tone-brand border-transparent" : "border-[var(--line)] hover:bg-[var(--neutral-bg)]")}>{o}</button>;
                  })}
                </div>
              </div>
            ))}
            {needsQuiz && !result && <Button variant="secondary" disabled={!allAnswered} onClick={grade}><Check size={14} /> Check answers</Button>}
            {result && <div className={cn("rounded-[var(--radius-sm)] border p-3 text-sm flex items-center gap-2", result.passed ? "tone-success" : "tone-danger")}>{result.passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}<span><b>{result.score}%</b> — {result.passed ? "passed. You can confirm now." : `below the pass mark of ${policy.pass_mark}%. Re-read the policy and try again.`}</span></div>}
            {!readToEnd && <div className="text-xs text-muted">Scroll to the end of the policy to enable confirmation.</div>}
            <div className="flex justify-end"><Button variant="primary" loading={busy} disabled={!canConfirm} onClick={confirm}><CheckCircle2 size={15} /> I have read and understood this policy</Button></div>
          </div>
        </Card>
      )}
    </div>
  );
}
