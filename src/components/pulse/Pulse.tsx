"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Check, EyeOff, HeartPulse, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pill, Progress, Select, Tabs, Textarea, useToast } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { cn, fmtDate, relDate, type Tables } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { jsonArr, jsonObj, localDay, str, strArr, useTouchModule } from "@/components/intel/lib";
import { Switch } from "@/components/admin/AdminBits";

export type SurveyRow = Tables<"surveys">;
export type ResponseRow = Tables<"survey_responses">;
export type Question = { key: string; text: string; type: "rating" | "text" | "yes_no"; options?: string[] };

const subscribeNoop = () => () => {};
function readLocalAnswered() {
  try { return localStorage.getItem("ghl.pulse.answered") || "[]"; } catch { return "[]"; }
}

export function parseQuestions(j: Json | null | undefined): Question[] {
  return jsonArr(j).map((q, i) => ({ key: str(q.key, `q${i + 1}`), text: str(q.text), type: (["rating", "text", "yes_no"].includes(str(q.type)) ? str(q.type) : "text") as Question["type"], options: strArr(q.options) }));
}

/** Pulse surveys: HR / managers create; everyone answers (anonymous by default); creators see aggregates only. */
export function Pulse({ surveys, responses, canCreate }: { surveys: SurveyRow[]; responses: ResponseRow[]; canCreate: boolean }) {
  const { profile } = useSession();
  const router = useRouter();
  useTouchModule("pulse");
  useSeen("nav:/pulse");
  const [tab, setTab] = React.useState<"open" | "results" | "closed">("open");
  const [create, setCreate] = React.useState(false);
  const [answering, setAnswering] = React.useState<SurveyRow | null>(null);
  const [results, setResults] = React.useState<SurveyRow | null>(null);
  const [today] = React.useState(() => localDay());
  // Anonymous answers carry no user id, so "already answered" for those lives in this browser only.
  const localAnswered = React.useSyncExternalStore(subscribeNoop, readLocalAnswered, () => "[]");
  const answeredIds = new Set(responses.filter((r) => r.user_id === profile.id).map((r) => r.survey_id));
  try { for (const id of JSON.parse(localAnswered) as string[]) answeredIds.add(id); } catch {}
  const isOpen = (s: SurveyRow) => !s.open_until || s.open_until >= today;
  const mineToCreate = (s: SurveyRow) => s.created_by === profile.id || canCreate;
  const list = surveys.filter((s) => (tab === "open" ? isOpen(s) : tab === "closed" ? !isOpen(s) : mineToCreate(s)));

  return (
    <div className="page">
      <PageHeader eyebrow="People" title="Pulse" subtitle="Short, regular check-ins on how work feels. Anonymous unless the survey says otherwise; results are aggregated." actions={canCreate ? <Button variant="primary" onClick={() => setCreate(true)}><Plus size={15} /> New survey</Button> : undefined} />
      <Tabs tabs={[{ key: "open" as const, label: "Open", count: surveys.filter(isOpen).length }, ...(canCreate ? [{ key: "results" as const, label: "Results" }] : []), { key: "closed" as const, label: "Closed" }]} value={tab} onChange={setTab} className="mb-3" />
      {list.length === 0 ? <Card><EmptyState icon={<HeartPulse size={18} />} title={tab === "open" ? "No open surveys" : "Nothing here"} hint={canCreate && tab === "open" ? "Create a 3-question pulse — it takes people under a minute." : undefined} /></Card> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
          {list.map((s) => {
            const count = responses.filter((r) => r.survey_id === s.id).length;
            const done = answeredIds.has(s.id);
            const qs = parseQuestions(s.questions);
            return (
              <Card key={s.id} className="p-[var(--s3)] flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">{s.anonymous ? <Pill tone="tone-info"><EyeOff size={10} /> Anonymous</Pill> : <Pill tone="tone-warn">Named</Pill>}{s.open_until && <span className="text-[11px] text-muted ml-auto">{isOpen(s) ? `closes ${relDate(s.open_until)}` : `closed ${fmtDate(s.open_until)}`}</span>}</div>
                <div className="font-medium">{s.title}</div>
                <div className="text-xs text-muted">{qs.length} question{qs.length === 1 ? "" : "s"} · {mineToCreate(s) ? `${count} response${count === 1 ? "" : "s"}` : "under a minute"}{s.created_by && <span className="inline-flex items-center gap-1 ml-1">· <PersonChip id={s.created_by} size={12} showName={false} /></span>}</div>
                <div className="flex gap-1 mt-auto pt-1">
                  {isOpen(s) && (done ? <span className="pill tone-success"><Check size={10} /> Answered</span> : <Button size="sm" variant="primary" onClick={() => setAnswering(s)}>Answer</Button>)}
                  {mineToCreate(s) && <Button size="sm" variant="secondary" onClick={() => setResults(s)}><BarChart3 size={13} /> Results</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {answering && <AnswerModal s={answering} onClose={() => setAnswering(null)} onDone={() => { setAnswering(null); router.refresh(); }} />}
      {results && <ResultsModal s={results} responses={responses.filter((r) => r.survey_id === results.id)} onClose={() => setResults(null)} />}
      <Modal open={create} onClose={() => setCreate(false)} title="New pulse survey" width={620}><SurveyForm onDone={() => { setCreate(false); router.refresh(); }} onCancel={() => setCreate(false)} /></Modal>
    </div>
  );
}

function AnswerModal({ s, onClose, onDone }: { s: SurveyRow; onClose: () => void; onDone: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const qs = React.useMemo(() => parseQuestions(s.questions), [s.questions]);
  const [answers, setAnswers] = React.useState<Record<string, Json>>({});
  const [busy, setBusy] = React.useState(false);
  const complete = qs.every((q) => answers[q.key] !== undefined && answers[q.key] !== "");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from("survey_responses").insert({ survey_id: s.id, user_id: s.anonymous ? null : profile.id, answers: answers as Json });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    if (s.anonymous) { try { const v = JSON.parse(localStorage.getItem("ghl.pulse.answered") || "[]") as string[]; localStorage.setItem("ghl.pulse.answered", JSON.stringify([...new Set([...v, s.id])])); } catch {} }
    toast.push("Thanks — your answer is in", "success"); onDone();
  }
  return (
    <Modal open onClose={onClose} title={s.title} width={560}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs text-muted inline-flex items-center gap-1">{s.anonymous ? <><EyeOff size={12} /> Anonymous — your name is not stored.</> : "Your name is attached to this response."}</div>
        {qs.map((q, i) => (
          <div key={q.key}>
            <div className="text-sm font-medium mb-1.5">{i + 1}. {q.text}</div>
            {q.type === "rating" && <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => setAnswers((a) => ({ ...a, [q.key]: n }))} className={cn("w-10 h-10 rounded-[var(--radius-sm)] border text-sm num", answers[q.key] === n ? "tone-brand border-transparent" : "hover:bg-[var(--neutral-bg)]")}>{n}</button>)}<span className="text-[11px] text-muted self-center ml-1">1 = poor · 5 = great</span></div>}
            {q.type === "yes_no" && <div className="flex gap-1">{["yes", "no"].map((v) => <button key={v} type="button" onClick={() => setAnswers((a) => ({ ...a, [q.key]: v }))} className={cn("pill pill-lg capitalize", answers[q.key] === v ? "tone-brand" : "tone-neutral")}>{v}</button>)}</div>}
            {q.type === "text" && <Textarea value={str(answers[q.key])} onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))} style={{ minHeight: 56 }} />}
          </div>
        ))}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={!complete}>Submit</Button></div>
      </form>
    </Modal>
  );
}

function ResultsModal({ s, responses, onClose }: { s: SurveyRow; responses: ResponseRow[]; onClose: () => void }) {
  const qs = parseQuestions(s.questions);
  return (
    <Modal open onClose={onClose} title={`Results · ${s.title}`} width={620}>
      <div className="space-y-4">
        <div className="text-xs text-muted">{responses.length} response{responses.length === 1 ? "" : "s"}{s.anonymous ? " · anonymous — only aggregates are shown" : ""}</div>
        {responses.length === 0 && <EmptyState title="No responses yet" className="py-6" />}
        {responses.length > 0 && qs.map((q, i) => {
          const vals = responses.map((r) => jsonObj(r.answers)[q.key]).filter((v) => v !== undefined && v !== "");
          return (
            <div key={q.key}>
              <div className="text-sm font-medium mb-1.5">{i + 1}. {q.text}</div>
              {q.type === "rating" && (() => { const nums = vals.map((v) => Number(v)).filter((n) => !Number.isNaN(n)); const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0; return (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm"><span className="num font-semibold text-lg">{avg.toFixed(1)}</span><span className="text-xs text-muted">/ 5 average · {nums.length} answers</span></div>
                  {[5, 4, 3, 2, 1].map((n) => { const c = nums.filter((x) => x === n).length; return <div key={n} className="flex items-center gap-2 text-xs"><span className="w-3 num">{n}</span><Progress value={nums.length ? (c / nums.length) * 100 : 0} className="flex-1" height={5} /><span className="w-6 num text-muted">{c}</span></div>; })}
                </div>
              ); })()}
              {q.type === "yes_no" && (() => { const yes = vals.filter((v) => v === "yes").length; return <div className="flex items-center gap-2 text-sm"><Progress value={vals.length ? (yes / vals.length) * 100 : 0} tone="var(--success)" className="flex-1" /><span className="text-xs text-muted num">{yes} yes · {vals.length - yes} no</span></div>; })()}
              {q.type === "text" && <ul className="space-y-1 max-h-[180px] overflow-y-auto">{vals.map((v, j) => <li key={j} className="text-sm rounded-[var(--radius-sm)] sunken px-2.5 py-1.5">“{str(v)}”</li>)}</ul>}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function SurveyForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { profile, departments } = useSession();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [anonymous, setAnonymous] = React.useState(true);
  const [until, setUntil] = React.useState("");
  const [deptIds, setDeptIds] = React.useState<string[]>([]);
  const [qs, setQs] = React.useState<Question[]>([{ key: "q1", text: "How was your week?", type: "rating" }, { key: "q2", text: "Do you have what you need to do your best work?", type: "yes_no" }, { key: "q3", text: "One thing we should change", type: "text" }]);
  const [busy, setBusy] = React.useState(false);
  const setQ = (i: number, patch: Partial<Question>) => setQs((l) => l.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = qs.filter((q) => q.text.trim()).map((q, i) => ({ ...q, key: `q${i + 1}` }));
    if (!title.trim() || !clean.length) return;
    setBusy(true);
    const { error } = await createClient().from("surveys").insert({ org_id: profile.org_id!, title: title.trim(), questions: clean as unknown as Json, audience: (deptIds.length ? { department_ids: deptIds } : { all: true }) as Json, anonymous, open_until: until || null, created_by: profile.id });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push("Survey published", "success"); onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Title"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly pulse · week 37" required /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
        <Field label="Open until"><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
        <Switch on={anonymous} onChange={setAnonymous} label="Anonymous" hint="Names are never stored; only aggregates are shown" />
      </div>
      <Field label="Audience" hint="Leave empty for everyone."><div className="flex flex-wrap gap-1.5">{departments.map((d) => <button key={d.id} type="button" onClick={() => setDeptIds((s) => (s.includes(d.id) ? s.filter((x) => x !== d.id) : [...s, d.id]))} className={cn("pill pill-lg", deptIds.includes(d.id) ? "tone-brand" : "tone-neutral")}>{d.name}</button>)}</div></Field>
      <div>
        <div className="label">Questions</div>
        <div className="space-y-2">
          {qs.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} placeholder="Question" className="flex-1" />
              <Select value={q.type} onChange={(e) => setQ(i, { type: e.target.value as Question["type"] })} className="!w-28"><option value="rating">1–5</option><option value="yes_no">Yes / No</option><option value="text">Text</option></Select>
              <button type="button" onClick={() => setQs((l) => l.filter((_, j) => j !== i))} className="text-muted hover:text-[var(--danger)]" aria-label="Remove"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <Button type="button" size="xs" variant="ghost" className="mt-1" onClick={() => setQs((l) => [...l, { key: `q${l.length + 1}`, text: "", type: "rating" }])}><Plus size={12} /> Add question</Button>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Publish</Button></div>
    </form>
  );
}
