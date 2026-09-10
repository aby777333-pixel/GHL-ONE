"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Archive, ArrowLeft, BadgeCheck, Building2, CalendarClock, CheckCircle2, Flag, Pencil, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Avatar, Button, Card, Field, Input, Modal, Pill, Textarea, useToast } from "@/components/ui";
import { ClassificationPill } from "@/components/files/FileBits";
import { Markdown } from "@/components/wiki/markdown";
import { ago, fmtDate, type Tables } from "@/lib/utils";
import { KIND_LABEL, KnowledgeEditor, type KnowledgeDraft } from "./KnowledgeEditor";
import { isOwnerOf, isOutdated, type Ownership } from "./KnowledgeBrowser";
import { openBuddy } from "./buddyStore";

export type KnowledgeArticleRow = Tables<"ai_knowledge">;

export function KnowledgeArticle({ article: initial, ownership }: { article: KnowledgeArticleRow; ownership: Ownership }) {
  const { profile, departments, people } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [a, setA] = React.useState(initial);
  const [edit, setEdit] = React.useState(false);
  const [report, setReport] = React.useState(false);
  const [reportNote, setReportNote] = React.useState("");
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [reviewAt, setReviewAt] = React.useState(initial.review_at || "");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [today] = React.useState(() => new Date().toISOString().slice(0, 10));

  const owner = isOwnerOf(ownership, a.department_id) || departments.some((d) => d.id === a.department_id && d.head_id === profile.id);
  const creatorDraft = a.created_by === profile.id && a.status === "draft";
  const canEdit = owner || creatorDraft || a.owner_id === profile.id;
  const outdated = isOutdated(a.review_at, today);
  const dept = a.department_id ? departments.find((d) => d.id === a.department_id) : null;
  const person = (id: string | null) => (id ? people.find((p) => p.id === id) || null : null);

  const update = async (patch: Partial<KnowledgeArticleRow>, ok: string, key: string) => {
    setBusy(key);
    const { data, error } = await createClient().from("ai_knowledge").update(patch).eq("id", a.id).select("*").single();
    setBusy(null);
    if (error || !data) return toast.push(error?.message || "Could not update", "danger");
    setA(data);
    toast.push(ok, "success");
    router.refresh();
  };

  const sendReport = async () => {
    setBusy("report");
    const { error } = await createClient().from("ai_feedback").insert({ org_id: profile.org_id!, user_id: profile.id, rating: "outdated", note: `Knowledge “${a.title}” (/wiki/knowledge/${a.id})${reportNote.trim() ? `: ${reportNote.trim()}` : ""}`, department_id: a.department_id || profile.department_id || null });
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    setReport(false);
    setReportNote("");
    toast.push("Reported — the knowledge owner has been notified", "success");
  };

  const draft: KnowledgeDraft = { id: a.id, title: a.title, body: a.body, kind: a.kind, department_id: a.department_id || "", tags: (a.tags || []).join(", "), classification: a.classification, review_at: a.review_at || "" };
  const approver = person(a.approved_by);
  const ownerP = person(a.owner_id) || person(a.created_by);

  return (
    <div className="page page-narrow anim-fade-up">
      <Link href="/wiki/knowledge" className="inline-flex items-center gap-1.5 text-xs text-muted hover:underline mb-[var(--s3)]"><ArrowLeft size={12} /> Approved knowledge</Link>

      {outdated && a.status === "approved" && (
        <div className="rounded-[var(--radius)] border tone-warn px-3 py-2 text-sm mb-[var(--s3)] flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>This guidance passed its review date ({fmtDate(a.review_at)}) and <b>may be outdated</b>. Buddy flags it when answering. {owner ? "Review it and set a new date." : "If you know it has changed, report it."}</span>
        </div>
      )}
      {a.status === "draft" && (
        <div className="rounded-[var(--radius)] border tone-info px-3 py-2 text-sm mb-[var(--s3)] flex items-center gap-2">
          <CheckCircle2 size={15} /> Draft — not yet used by Buddy. {owner ? "Approve it to make it live." : "Waiting for the department's knowledge owner."}
        </div>
      )}
      {a.status === "archived" && <div className="rounded-[var(--radius)] border px-3 py-2 text-sm text-muted mb-[var(--s3)]">Archived — Buddy no longer uses this article.</div>}

      <Card className="p-[var(--s5)]">
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <Pill tone="tone-violet" size="lg">{KIND_LABEL[a.kind] || a.kind}</Pill>
          <ClassificationPill value={a.classification} size="lg" />
          {a.status === "approved" && <Pill tone="tone-success" size="lg"><BadgeCheck size={12} /> Approved</Pill>}
          {(a.tags || []).map((t) => <Pill key={t}>{t}</Pill>)}
        </div>
        <h1 className="h1 break-words">{a.title}</h1>
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted mt-2">
          <span className="inline-flex items-center gap-1"><Building2 size={12} /> {dept ? dept.name : "Company-wide"}</span>
          {ownerP && <span className="inline-flex items-center gap-1.5"><Avatar name={ownerP.full_name} src={ownerP.avatar_url} size={16} /> Owner {ownerP.full_name}</span>}
          {a.status === "approved" && a.approved_at && <span>Approved {approver ? `by ${approver.full_name} ` : ""}{fmtDate(a.approved_at)}</span>}
          {/*
            A red date was the only sign that a review had lapsed, and red on its own does not say
            what is wrong. Say it: the label itself changes to "Review overdue".
          */}
          {a.review_at && (
            outdated
              ? <span className="text-danger font-medium inline-flex items-center gap-1"><AlertTriangle size={12} /> Review overdue · was due {fmtDate(a.review_at)}</span>
              : <span>Review by {fmtDate(a.review_at)}</span>
          )}
          <span>Updated {ago(a.updated_at)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-[var(--s4)] pt-[var(--s3)] border-t">
          <Button size="sm" variant="primary" onClick={() => openBuddy({ message: `Explain “${a.title}” and how it applies to my work right now.`, scope: { path: `/wiki/knowledge/${a.id}` }, send: true })}><Sparkles size={14} /> Ask Buddy about this</Button>
          {owner && a.status !== "approved" && <Button size="sm" variant="success" loading={busy === "approve"} onClick={() => update({ status: "approved" }, "Approved — Buddy will use this from now on", "approve")}><CheckCircle2 size={14} /> Approve</Button>}
          {canEdit && <Button size="sm" variant="secondary" onClick={() => setEdit(true)}><Pencil size={14} /> Edit</Button>}
          {owner && <Button size="sm" variant="secondary" onClick={() => setReviewOpen(true)}><CalendarClock size={14} /> Set review date</Button>}
          {owner && a.status !== "archived" && <Button size="sm" variant="ghost" loading={busy === "archive"} onClick={() => update({ status: "archived" }, "Archived", "archive")}><Archive size={14} /> Archive</Button>}
          {owner && a.status === "archived" && <Button size="sm" variant="ghost" loading={busy === "restore"} onClick={() => update({ status: "draft" }, "Restored as draft", "restore")}>Restore as draft</Button>}
          <Button size="sm" variant="ghost" onClick={() => setReport(true)} className="ml-auto"><Flag size={14} /> Report outdated</Button>
        </div>

        <div className="mt-[var(--s4)]">
          <Markdown source={a.body} />
        </div>
      </Card>

      <KnowledgeEditor open={edit} onClose={() => setEdit(false)} initial={draft} canApprove={owner} onSaved={() => router.refresh()} />

      <Modal open={report} onClose={() => setReport(false)} title="Report outdated guidance" width={480} footer={<><Button variant="ghost" onClick={() => setReport(false)}>Cancel</Button><Button variant="primary" loading={busy === "report"} onClick={sendReport}><Flag size={14} /> Report</Button></>}>
        <p className="text-sm text-muted mb-3">Goes to the department&apos;s knowledge owner so the article gets fixed. What changed?</p>
        <Textarea value={reportNote} onChange={(e) => setReportNote(e.target.value)} placeholder="e.g. Step 3 no longer applies — approvals now go through the Help Desk." className="!min-h-[88px]" autoFocus />
      </Modal>

      {/*
        Setting a *new* review date in the past put the article straight back into "overdue" — the
        one state the dialog exists to leave. The picker refuses earlier days and Save is disabled,
        so the only reachable outcome is a date that is actually in the future.
      */}
      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Set review date" width={420} footer={<><Button variant="ghost" onClick={() => setReviewOpen(false)}>Cancel</Button><Button variant="primary" loading={busy === "review"} disabled={!!reviewAt && reviewAt < today} onClick={async () => { await update({ review_at: reviewAt || null }, "Review date updated", "review"); setReviewOpen(false); }}>Save</Button></>}>
        <Field label="Review by" hint="Buddy warns when guidance is past this date" error={reviewAt && reviewAt < today ? "Pick today or a later date — a past date is already overdue." : undefined}>
          <Input type="date" min={today} value={reviewAt} onChange={(e) => setReviewAt(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
