"use client";

import * as React from "react";
import Link from "next/link";
import { Trophy, MessageSquareHeart, Plus, Eye, Lock, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Pill, Skeleton, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { ago, cn } from "@/lib/utils";
import { FEEDBACK_KIND_LABEL, FEEDBACK_VISIBILITY_LABEL, isoDaysAgo, kudosEmoji, kudosLabel, kudosTone, type FeedbackKind, type FeedbackRow, type FeedbackVisibility, type KudosRow } from "./lib";
import { KudosModal } from "./KudosModal";

/* ------------------------------------------------------------ Kudos row */
export function KudosItem({ k, showTo, compact }: { k: KudosRow; showTo?: boolean; compact?: boolean }) {
  const { people } = useSession();
  const from = people.find((p) => p.id === k.from_user_id);
  const to = people.find((p) => p.id === k.to_user_id);
  return (
    <div className={cn("flex items-start gap-3", compact ? "px-3 py-2" : "px-[var(--s4)] py-3")}>
      <div className="flex -space-x-2 shrink-0">
        {showTo && <Link href={`/people/${k.to_user_id}`} className="rounded-full ring-2 ring-[var(--bg-elev)]"><Avatar name={to?.full_name} src={to?.avatar_url} size={compact ? 26 : 32} /></Link>}
        <Link href={`/people/${k.from_user_id}`} className="rounded-full ring-2 ring-[var(--bg-elev)]"><Avatar name={from?.full_name} src={from?.avatar_url} size={compact ? 26 : 32} /></Link>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted flex items-center gap-1 flex-wrap">
          {showTo && <><Link href={`/people/${k.to_user_id}`} className="font-medium text-[var(--fg)] hover:underline">{to?.full_name || "Someone"}</Link><span>recognised by</span></>}
          <Link href={`/people/${k.from_user_id}`} className="font-medium text-[var(--fg)] hover:underline">{from?.full_name || "Someone"}</Link>
          <span>· {ago(k.created_at)}</span>
          {!k.public && <span className="inline-flex items-center gap-0.5"><Lock size={10} /> private</span>}
        </div>
        <div className={cn("mt-1", compact ? "text-xs" : "text-sm")}>
          <Pill tone={kudosTone(k.category)} className="mr-1.5 align-middle">{kudosEmoji(k.category)} {kudosLabel(k.category)}</Pill>
          <span className="align-middle leading-relaxed">{k.message}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------- Recognition wall (Common) */
export function RecognitionWall() {
  const [rows, setRows] = React.useState<KudosRow[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const load = React.useCallback(async () => {
    const { data } = await createClient().from("kudos").select("*").eq("public", true).order("created_at", { ascending: false }).limit(12);
    setRows(data || []);
  }, []);
  React.useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <section>
      <div className="flex items-center justify-between mb-[var(--s3)] gap-2">
        <div>
          <div className="h2 inline-flex items-center gap-2"><Trophy size={18} className="text-muted" /> Recognition</div>
          <div className="text-xs text-muted mt-0.5">Public kudos from across the company. Every one is also posted in #wins.</div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus size={14} /> Recognise someone</Button>
      </div>
      <Card>
        {rows === null ? (
          <div className="p-[var(--s4)] space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Trophy size={18} />} title="No public kudos yet" hint="Seen someone do great work? Say so — it takes thirty seconds." action={<Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus size={14} /> Recognise someone</Button>} />
        ) : (
          <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0">
            {rows.map((k) => <div key={k.id} className="sm:border-b sm:[&:nth-last-child(-n+2)]:border-b-0"><KudosItem k={k} showTo /></div>)}
          </div>
        )}
      </Card>
      {open && <KudosModal onClose={() => setOpen(false)} onDone={load} />}
    </section>
  );
}

/* ------------------------------------------------------ Home kudos card */
export function KudosCard() {
  const { profile } = useSession();
  const [rows, setRows] = React.useState<KudosRow[] | null>(null);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    createClient().from("kudos").select("*").eq("to_user_id", profile.id).gte("created_at", isoDaysAgo(45)).order("created_at", { ascending: false }).limit(5).then(({ data }) => alive && setRows(data || []));
    return () => { alive = false; };
  }, [profile.id]);
  return (
    <Card>
      <CardHeader title="Kudos" subtitle={rows && rows.length ? `${rows.length} received recently` : "Recognition you received"} action={<Link href="/common" className="text-xs text-muted hover:text-[var(--fg)]">Wall →</Link>} />
      {rows === null ? (
        <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2"><Skeleton className="h-8" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Trophy size={16} />} title="Nothing yet" hint="Kudos from colleagues land here. Give some — it comes back." className="py-5" action={<Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Recognise a colleague</Button>} />
      ) : (
        <div className="pb-2 divide-y">{rows.map((k) => <KudosItem key={k.id} k={k} compact />)}</div>
      )}
      {open && <KudosModal onClose={() => setOpen(false)} />}
    </Card>
  );
}

/* ---------------------------------------- Profile: feedback & recognition */
export function ProfileRecognition({ userId, self, onGiveFeedback, onRecognise }: { userId: string; self: boolean; onGiveFeedback?: () => void; onRecognise?: () => void }) {
  const { profile, people } = useSession();
  const toast = useToast();
  const [kudos, setKudos] = React.useState<KudosRow[] | null>(null);
  const [feedback, setFeedback] = React.useState<FeedbackRow[] | null>(null);
  const load = React.useCallback(async () => {
    const supabase = createClient();
    const [{ data: k }, { data: f }] = await Promise.all([
      supabase.from("kudos").select("*").eq("to_user_id", userId).order("created_at", { ascending: false }).limit(20),
      supabase.from("feedback").select("*").eq("to_user_id", userId).order("created_at", { ascending: false }).limit(30),
    ]);
    setKudos(k || []);
    setFeedback(f || []);
  }, [userId]);
  React.useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function removeFeedback(id: string) {
    const { error } = await createClient().from("feedback").delete().eq("id", id);
    if (error) { toast.push(error.message, "danger"); return; }
    setFeedback((s) => (s || []).filter((f) => f.id !== id));
  }

  const loading = kudos === null || feedback === null;
  const visibleFeedback = feedback || [];
  return (
    <Card id="feedback" className="scroll-mt-24">
      <CardHeader title="Feedback & recognition" subtitle={self ? "Everything shared with you. Nothing here is hidden from you." : "What you are allowed to see: public kudos, your own notes, and feedback shared with you as their manager."} action={
        !self ? (
          <span className="flex items-center gap-1.5">
            {onRecognise && <Button size="xs" variant="secondary" onClick={onRecognise}><Trophy size={12} /> Recognise</Button>}
            {onGiveFeedback && <Button size="xs" variant="secondary" onClick={onGiveFeedback}><MessageSquareHeart size={12} /> Feedback</Button>}
          </span>
        ) : onGiveFeedback ? <Button size="xs" variant="ghost" onClick={onGiveFeedback}><MessageSquareHeart size={12} /> Self reflection</Button> : undefined
      } />
      {loading ? (
        <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2"><Skeleton className="h-8" /><Skeleton className="h-8 w-3/4" /></div>
      ) : (
        <div className="divide-y border-t">
          <div className="py-2">
            <div className="eyebrow px-[var(--s4)] py-1 inline-flex items-center gap-1.5"><Trophy size={11} /> Kudos · {kudos!.length}</div>
            {kudos!.length === 0 ? <div className="px-[var(--s4)] pb-2 text-sm text-muted">No kudos yet.</div> : <div className="divide-y">{kudos!.slice(0, 6).map((k) => <KudosItem key={k.id} k={k} />)}</div>}
          </div>
          <div className="py-2">
            <div className="eyebrow px-[var(--s4)] py-1 inline-flex items-center gap-1.5"><MessageSquareHeart size={11} /> Feedback · {visibleFeedback.length}</div>
            {visibleFeedback.length === 0 ? (
              <div className="px-[var(--s4)] pb-2 text-sm text-muted">{self ? "No feedback received yet." : "Nothing shared with you."}</div>
            ) : (
              <ul className="divide-y">
                {visibleFeedback.map((f) => {
                  const mine = f.from_user_id === profile.id;
                  const from = people.find((p) => p.id === f.from_user_id);
                  return (
                    <li key={f.id} className="px-[var(--s4)] py-3 flex items-start gap-3">
                      <Avatar name={from?.full_name} src={from?.avatar_url} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-muted flex items-center gap-1.5 flex-wrap">
                          <PersonChip id={f.from_user_id} size={14} className="text-[var(--fg)]" />
                          <Pill tone={f.kind === "self" ? "tone-violet" : f.kind === "manager" ? "tone-info" : "tone-neutral"}>{FEEDBACK_KIND_LABEL[f.kind as FeedbackKind] || f.kind}</Pill>
                          <span>· {ago(f.created_at)}</span>
                          <span className="inline-flex items-center gap-0.5" title={FEEDBACK_VISIBILITY_LABEL[f.visibility as FeedbackVisibility]}>{f.visibility === "recipient" ? <Lock size={10} /> : <Eye size={10} />} {FEEDBACK_VISIBILITY_LABEL[f.visibility as FeedbackVisibility] || f.visibility}</span>
                        </div>
                        <p className="text-sm mt-1 whitespace-pre-wrap leading-relaxed">{f.body}</p>
                      </div>
                      {mine && <button className="text-muted hover:text-danger shrink-0" onClick={() => removeFeedback(f.id)} title="Delete what I wrote"><Trash2 size={13} /></button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
