"use client";

import * as React from "react";
import { Inbox, Plus, EyeOff, MessageSquareReply, Wrench, Building, Cog, HelpCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Field, Input, Modal, Pill, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { ago, cn, isManagerPlus } from "@/lib/utils";
import type { Database } from "@/lib/database.types";
import { SUGGESTION_KINDS, SUGGESTION_KIND_LABEL, SUGGESTION_STATUSES, SUGGESTION_STATUS_LABEL, SUGGESTION_STATUS_TONE, type SuggestionKind, type SuggestionStatus } from "@/components/growth/lib";

type Row = Database["public"]["Views"]["suggestions_view"]["Row"];
const KIND_ICON: Record<string, React.ReactNode> = { process: <Cog size={14} />, tool: <Wrench size={14} />, workplace: <Building size={14} />, other: <HelpCircle size={14} /> };

export function Suggestions({ openNew }: { openNew?: boolean }) {
  const { profile } = useSession();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [isHr, setIsHr] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [showNew, setShowNew] = React.useState(!!openNew);
  const [responding, setResponding] = React.useState<Row | null>(null);
  const canReview = isManagerPlus(profile.role) || isHr;

  const load = React.useCallback(async () => {
    const supabase = createClient();
    const [{ data }, { data: hr }] = await Promise.all([
      supabase.from("suggestions_view").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.rpc("is_hr"),
    ]);
    setRows(data || []);
    setIsHr(!!hr);
  }, []);
  React.useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const list = (rows || []).filter((r) => !status || r.status === status);
  const counts = SUGGESTION_STATUSES.reduce((a, s) => ({ ...a, [s]: (rows || []).filter((r) => r.status === s).length }), {} as Record<string, number>);

  return (
    <div>
      <div className="flex items-center gap-2 mb-[var(--s3)] flex-wrap">
        <div className="text-xs text-muted">{canReview ? "You can review and respond. Anonymous authors stay anonymous to you." : "Managers and HR review these. Tick “anonymous” and your name is never stored for them to see."}</div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="text-xs ml-auto" style={{ width: "auto", height: 32 }}>
          <option value="">All statuses</option>
          {SUGGESTION_STATUSES.map((s) => <option key={s} value={s}>{SUGGESTION_STATUS_LABEL[s]}{counts[s] ? ` (${counts[s]})` : ""}</option>)}
        </Select>
        <Button variant="primary" size="sm" onClick={() => setShowNew(true)}><Plus size={14} /> Make a suggestion</Button>
      </div>

      {rows === null ? (
        <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<Inbox size={18} />} title={rows.length ? "No suggestions match" : canReview ? "The box is empty" : "Nothing from you yet"} hint={rows.length ? "Try another status." : "A process that wastes time, a tool that would help, something about the workplace — say it here."} action={<Button variant="primary" onClick={() => setShowNew(true)}><Plus size={15} /> Make a suggestion</Button>} />
        </Card>
      ) : (
        <div className="space-y-2 stagger">
          {list.map((r) => (
            <Card key={r.id || ""} className="px-[var(--s3)] py-[var(--s3)] sm:px-[var(--s4)]">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-[10px] tone-neutral inline-flex items-center justify-center shrink-0">{KIND_ICON[r.kind || "other"]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Pill tone={SUGGESTION_STATUS_TONE[(r.status || "new") as SuggestionStatus]}>{SUGGESTION_STATUS_LABEL[(r.status || "new") as SuggestionStatus] || r.status}</Pill>
                    <Pill tone="tone-neutral">{SUGGESTION_KIND_LABEL[(r.kind || "other") as SuggestionKind] || r.kind}</Pill>
                  </div>
                  <div className="font-medium mt-1.5 leading-snug">{r.title}</div>
                  {r.body && <p className="text-sm text-[var(--fg-2)] mt-1 whitespace-pre-wrap leading-relaxed">{r.body}</p>}
                  {r.response && (
                    <div className="mt-2 rounded-[var(--radius-sm)] sunken border px-3 py-2 text-sm">
                      <div className="text-[11px] text-muted inline-flex items-center gap-1 mb-0.5"><MessageSquareReply size={11} /> Response{r.responded_by ? <> from <PersonChip id={r.responded_by} size={12} /></> : null}</div>
                      <div className="whitespace-pre-wrap">{r.response}</div>
                    </div>
                  )}
                  <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap mt-2.5 text-xs text-muted">
                    {r.anonymous && !r.author_id ? <span className="inline-flex items-center gap-1"><EyeOff size={12} /> Anonymous</span> : r.author_id ? <span className="inline-flex items-center gap-1"><PersonChip id={r.author_id} size={18} />{r.anonymous && <span title="Anonymous to managers; visible to HR only">(anonymous)</span>}</span> : <span>Someone</span>}
                    <span className="num">{r.created_at ? ago(r.created_at) : ""}</span>
                    {canReview && <Button size="xs" variant="secondary" className="ml-auto" onClick={() => setResponding(r)}><MessageSquareReply size={12} /> {r.response ? "Update response" : "Respond"}</Button>}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showNew && <SubmitSuggestionModal onClose={() => setShowNew(false)} onCreated={load} />}
      {responding && <RespondModal row={responding} onClose={() => setResponding(null)} onSaved={() => { setResponding(null); void load(); }} />}
    </div>
  );
}

function SubmitSuggestionModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [kind, setKind] = React.useState<SuggestionKind>("process");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [anonymous, setAnonymous] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    const { error } = await createClient().from("suggestions").insert({ org_id: profile.org_id!, author_id: profile.id, anonymous, kind, title: title.trim(), body: body.trim() || null });
    setLoading(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(anonymous ? "Sent anonymously. Managers see the suggestion, not your name." : "Suggestion sent", "success");
    onCreated();
    onClose();
  }
  return (
    <Modal open onClose={onClose} title="Make a suggestion" width={540}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="About">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTION_KINDS.map((k) => (
              <button type="button" key={k} onClick={() => setKind(k)} className={cn("pill pill-lg border transition-colors", kind === k ? "tone-brand border-transparent" : "tone-neutral border-[var(--line)] hover:bg-[var(--line)]")}>{KIND_ICON[k]} {SUGGESTION_KIND_LABEL[k]}</button>
            ))}
          </div>
        </Field>
        <Field label="Suggestion"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What should change?" required /></Field>
        <Field label="Details" hint="What is the problem today, and what would better look like?"><Textarea value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 100 }} /></Field>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="mt-1 accent-[var(--brand)]" />
          <span className="inline-flex flex-col"><span className="inline-flex items-center gap-1.5"><EyeOff size={13} /> Send anonymously</span><span className="text-[11px] text-muted">Managers reviewing the box will not see who wrote it. Only a Super Admin or HR administrator can.</span></span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading}><Inbox size={14} /> Send</Button>
        </div>
      </form>
    </Modal>
  );
}

function RespondModal({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [status, setStatus] = React.useState<SuggestionStatus>(((row.status || "new") === "new" ? "reviewing" : row.status) as SuggestionStatus);
  const [response, setResponse] = React.useState(row.response || "");
  const [loading, setLoading] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!row.id) return;
    setLoading(true);
    const { error } = await createClient().from("suggestions").update({ status, response: response.trim() || null, responded_by: profile.id }).eq("id", row.id);
    setLoading(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`Marked ${SUGGESTION_STATUS_LABEL[status].toLowerCase()}`, "success");
    onSaved();
  }
  return (
    <Modal open onClose={onClose} title="Respond to suggestion" width={520}>
      <form onSubmit={submit} className="space-y-3">
        <div className="text-sm font-medium">{row.title}</div>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as SuggestionStatus)}>
            {SUGGESTION_STATUSES.map((s) => <option key={s} value={s}>{SUGGESTION_STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Response" hint="Visible to everyone who can see the suggestion — including its author."><Textarea autoFocus value={response} onChange={(e) => setResponse(e.target.value)} style={{ minHeight: 100 }} placeholder={status === "accepted" ? "What happens next and by when." : status === "declined" ? "Why not — honestly, kindly." : "What you are looking into."} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
