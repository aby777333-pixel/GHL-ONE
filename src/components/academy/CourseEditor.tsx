"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, FileText, Video, ListChecks, HelpCircle, BookOpen, Link2, ChevronDown, ChevronUp, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Modal, Select, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";
import { COURSE_STATUSES, COURSE_STATUS_LABEL, LEVELS, LEVEL_LABEL, LESSON_KINDS, LESSON_KIND_LABEL, asQuiz, type Course, type Lesson, type LessonKind, type QuizQuestion } from "./lib";

type Draft = {
  key: string;
  id?: string;
  title: string;
  kind: LessonKind;
  content: string;
  quiz: QuizQuestion[];
  wiki_page_id: string;
  file_id: string;
  duration: string;
};

const KIND_ICON: Record<LessonKind, React.ReactNode> = { text: <FileText size={13} />, video: <Video size={13} />, document: <Link2 size={13} />, sop: <ListChecks size={13} />, quiz: <HelpCircle size={13} /> };

let keySeq = 0;
const nextKey = () => `l${++keySeq}-${Math.random().toString(36).slice(2, 7)}`;

/** Drop empty options while keeping the correct answer pointing at the same option. */
function cleanQuestion(q: QuizQuestion): QuizQuestion {
  const kept = q.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
  const answer = Math.max(0, kept.findIndex((x) => x.i === q.answer));
  return { q: q.q.trim(), options: kept.map((x) => x.o), answer };
}

function fromLesson(l: Lesson): Draft {
  return { key: l.id, id: l.id, title: l.title, kind: (LESSON_KINDS.includes(l.kind as LessonKind) ? l.kind : "text") as LessonKind, content: l.content || "", quiz: asQuiz(l.quiz), wiki_page_id: l.wiki_page_id || "", file_id: l.file_id || "", duration: l.duration_minutes ? String(l.duration_minutes) : "" };
}

export function CourseEditor({ course, lessons, onClose, onSaved }: { course?: Course; lessons?: Lesson[]; onClose: () => void; onSaved: (id: string) => void }) {
  const { profile, departments } = useSession();
  const toast = useToast();
  const [title, setTitle] = React.useState(course?.title || "");
  const [description, setDescription] = React.useState(course?.description || "");
  const [level, setLevel] = React.useState(course?.level || "basic");
  const [duration, setDuration] = React.useState(course?.duration_minutes ? String(course.duration_minutes) : "");
  const [depts, setDepts] = React.useState<Set<string>>(() => new Set(course?.department_ids || []));
  const [mandatory, setMandatory] = React.useState(!!course?.mandatory);
  const [status, setStatus] = React.useState(course?.status || "draft");
  const [drafts, setDrafts] = React.useState<Draft[]>(() => (lessons || []).slice().sort((a, b) => a.position - b.position).map(fromLesson));
  const [open, setOpen] = React.useState<string | null>(null);
  const [wikiPages, setWikiPages] = React.useState<{ id: string; title: string }[]>([]);
  const [files, setFiles] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(false);
  const removed = React.useRef<string[]>([]);

  React.useEffect(() => {
    let alive = true;
    const supabase = createClient();
    Promise.all([
      supabase.from("wiki_pages").select("id,title").order("title").limit(300),
      supabase.from("files").select("id,name").order("name").limit(300),
    ]).then(([w, f]) => {
      if (!alive) return;
      setWikiPages(w.data || []);
      setFiles(f.data || []);
    });
    return () => { alive = false; };
  }, []);

  function addLesson(kind: LessonKind = "text") {
    const d: Draft = { key: nextKey(), title: "", kind, content: "", quiz: kind === "quiz" ? [{ q: "", options: ["", ""], answer: 0 }] : [], wiki_page_id: "", file_id: "", duration: "" };
    setDrafts((s) => [...s, d]);
    setOpen(d.key);
  }
  function patch(key: string, p: Partial<Draft>) {
    setDrafts((s) => s.map((d) => (d.key === key ? { ...d, ...p } : d)));
  }
  function move(key: string, dir: -1 | 1) {
    setDrafts((s) => {
      const i = s.findIndex((d) => d.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.length) return s;
      const n = s.slice();
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }
  function remove(key: string) {
    setDrafts((s) => {
      const d = s.find((x) => x.key === key);
      if (d?.id) removed.current.push(d.id);
      return s.filter((x) => x.key !== key);
    });
  }

  function validate(): string | null {
    if (!title.trim()) return "Give the course a title.";
    for (const d of drafts) {
      if (!d.title.trim()) return "Every lesson needs a title.";
      if (d.kind === "video" && !d.content.trim()) return `“${d.title}” needs a video URL.`;
      if (d.kind === "document" && !d.content.trim() && !d.file_id && !d.wiki_page_id) return `“${d.title}” needs a document URL, a file or a wiki page.`;
      if (d.kind === "quiz") {
        if (d.quiz.length === 0) return `“${d.title}” needs at least one question.`;
        for (const q of d.quiz) {
          if (!q.q.trim()) return `A question in “${d.title}” is empty.`;
          if (q.options.filter((o) => o.trim()).length < 2) return `Each question in “${d.title}” needs at least two options.`;
          if (!q.options[q.answer]?.trim()) return `Pick the correct answer for “${q.q.slice(0, 40)}”.`;
        }
      }
    }
    return null;
  }

  async function save(e: React.SyntheticEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { toast.push(err, "danger"); return; }
    setLoading(true);
    const supabase = createClient();
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      level,
      duration_minutes: duration ? Number(duration) : null,
      department_ids: depts.size ? [...depts] : null,
      mandatory,
      status,
    };
    let courseId = course?.id;
    if (courseId) {
      const { error } = await supabase.from("courses").update(payload).eq("id", courseId);
      if (error) { setLoading(false); toast.push(error.message, "danger"); return; }
    } else {
      const { data, error } = await supabase.from("courses").insert({ ...payload, org_id: profile.org_id!, created_by: profile.id }).select("id").single();
      if (error || !data) { setLoading(false); toast.push(error?.message || "Could not create course", "danger"); return; }
      courseId = data.id;
    }
    if (removed.current.length) {
      const { error } = await supabase.from("lessons").delete().in("id", removed.current);
      if (error) { setLoading(false); toast.push(error.message, "danger"); return; }
      removed.current = [];
    }
    const rows = drafts.map((d, i) => ({
      id: d.id,
      course_id: courseId!,
      position: i,
      title: d.title.trim(),
      kind: d.kind,
      content: d.kind === "quiz" ? null : d.content.trim() || null,
      quiz: d.kind === "quiz" ? d.quiz.map(cleanQuestion) : null,
      wiki_page_id: d.wiki_page_id || null,
      file_id: d.file_id || null,
      duration_minutes: d.duration ? Number(d.duration) : null,
    }));
    const existing = rows.filter((r): r is typeof r & { id: string } => !!r.id);
    const fresh = rows.filter((r) => !r.id).map((r) => { const { id, ...rest } = r; void id; return rest; });
    if (existing.length) {
      const { error } = await supabase.from("lessons").upsert(existing, { onConflict: "id" });
      if (error) { setLoading(false); toast.push(error.message, "danger"); return; }
    }
    if (fresh.length) {
      const { error } = await supabase.from("lessons").insert(fresh);
      if (error) { setLoading(false); toast.push(error.message, "danger"); return; }
    }
    setLoading(false);
    toast.push(course ? "Course saved" : status === "published" ? "Course published" : "Course created as a draft", "success");
    onSaved(courseId!);
  }

  return (
    <Modal open onClose={onClose} title={course ? `Edit: ${course.title}` : "Create course"} width={760} side footer={
      <>
        <span className="text-[11px] text-muted mr-auto hidden sm:inline">{drafts.length} lesson{drafts.length === 1 ? "" : "s"} · {status === "published" ? "visible to learners" : "hidden until published"}</span>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={loading} onClick={save}><Check size={14} /> {course ? "Save changes" : status === "published" ? "Publish course" : "Save draft"}</Button>
      </>
    }>
      <form onSubmit={save} className="space-y-[var(--s4)]">
        <section className="space-y-3">
          <Field label="Title"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Client onboarding — how we do it" required /></Field>
          <Field label="Description" hint="What the learner will be able to do afterwards."><Textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 72 }} /></Field>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Level">
              <Select value={level} onChange={(e) => setLevel(e.target.value)}>{LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</Select>
            </Field>
            <Field label="Duration (min)"><Input type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="auto" /></Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>{COURSE_STATUSES.map((s) => <option key={s} value={s}>{COURSE_STATUS_LABEL[s]}</option>)}</Select>
            </Field>
            <label className="block">
              <span className="label">Mandatory</span>
              <span className={cn("btn w-full", mandatory ? "btn-danger" : "btn-secondary")} style={{ height: 38 }}>
                <input type="checkbox" className="sr-only" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
                {mandatory ? "Required" : "Optional"}
              </span>
            </label>
          </div>
          <div>
            <span className="label">Who is this for? <span className="text-muted font-normal">· none selected = everyone</span></span>
            <div className="flex flex-wrap gap-1.5">
              {departments.map((d) => {
                const on = depts.has(d.id);
                return (
                  <button type="button" key={d.id} onClick={() => setDepts((s) => { const n = new Set(s); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })} className={cn("pill pill-lg border transition-colors", on ? "tone-brand border-transparent" : "tone-neutral border-[var(--line)] hover:bg-[var(--line)]")}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? "var(--brand-fg)" : d.color }} />{d.name}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="h3">Lessons</div>
              <div className="text-xs text-muted">Reading, video, document, SOP checklist or quiz. Learners go top to bottom.</div>
            </div>
          </div>
          {drafts.length === 0 && <div className="sunken rounded-[var(--radius-sm)] border border-dashed p-4 text-sm text-muted text-center">No lessons yet. Add the first one below.</div>}
          <div className="space-y-2">
            {drafts.map((d, i) => (
              <LessonDraft key={d.key} d={d} index={i} total={drafts.length} open={open === d.key} onToggle={() => setOpen(open === d.key ? null : d.key)} onPatch={(p) => patch(d.key, p)} onMove={(dir) => move(d.key, dir)} onRemove={() => remove(d.key)} wikiPages={wikiPages} files={files} />
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {LESSON_KINDS.map((k) => (
              <Button key={k} type="button" size="sm" variant="secondary" onClick={() => addLesson(k)}><Plus size={13} /> {LESSON_KIND_LABEL[k]}</Button>
            ))}
          </div>
        </section>
      </form>
    </Modal>
  );
}

function LessonDraft({ d, index, total, open, onToggle, onPatch, onMove, onRemove, wikiPages, files }: { d: Draft; index: number; total: number; open: boolean; onToggle: () => void; onPatch: (p: Partial<Draft>) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void; wikiPages: { id: string; title: string }[]; files: { id: string; name: string }[] }) {
  return (
    <div className={cn("card overflow-hidden", open && "border-[var(--line-strong)]")}>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="w-6 h-6 rounded-full sunken text-[11px] font-semibold inline-flex items-center justify-center num shrink-0">{index + 1}</span>
        <span className="pill tone-neutral shrink-0">{KIND_ICON[d.kind]} <span className="hidden sm:inline">{LESSON_KIND_LABEL[d.kind]}</span></span>
        <button type="button" onClick={onToggle} className="text-sm font-medium truncate flex-1 text-left min-w-0">{d.title || <span className="text-muted font-normal">Untitled lesson</span>}</button>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button type="button" size="xs" variant="ghost" icon onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up"><ArrowUp size={13} /></Button>
          <Button type="button" size="xs" variant="ghost" icon onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move down"><ArrowDown size={13} /></Button>
          <Button type="button" size="xs" variant="ghost" icon onClick={onRemove} aria-label="Remove lesson" className="text-danger"><Trash2 size={13} /></Button>
          <Button type="button" size="xs" variant="ghost" icon onClick={onToggle} aria-label={open ? "Collapse" : "Expand"}>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Button>
        </div>
      </div>
      {open && (
        <div className="border-t px-3 py-3 space-y-3 sunken">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px_110px] gap-3">
            <Field label="Lesson title"><Input value={d.title} onChange={(e) => onPatch({ title: e.target.value })} placeholder="What is this lesson about?" /></Field>
            <Field label="Type">
              <Select value={d.kind} onChange={(e) => onPatch({ kind: e.target.value as LessonKind, quiz: e.target.value === "quiz" && d.quiz.length === 0 ? [{ q: "", options: ["", ""], answer: 0 }] : d.quiz })}>
                {LESSON_KINDS.map((k) => <option key={k} value={k}>{LESSON_KIND_LABEL[k]}</option>)}
              </Select>
            </Field>
            <Field label="Minutes"><Input type="number" min={0} value={d.duration} onChange={(e) => onPatch({ duration: e.target.value })} /></Field>
          </div>

          {(d.kind === "text" || d.kind === "sop") && (
            <Field label={d.kind === "sop" ? "Steps (markdown)" : "Content (markdown)"} hint={d.kind === "sop" ? "Write the steps as a numbered list: `1. Open the ticket`, `2. Verify the client`… Anything else becomes notes above the checklist." : "Headings, lists, links, tables and code blocks are supported."}>
              <Textarea value={d.content} onChange={(e) => onPatch({ content: e.target.value })} style={{ minHeight: 160, fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 13 }} placeholder={d.kind === "sop" ? "1. First step\n2. Second step\n   Extra detail for step two\n3. Third step" : "## Why this matters\n\nWrite the lesson here…"} />
            </Field>
          )}
          {d.kind === "video" && (
            <Field label="Video URL" hint="YouTube, Vimeo, Loom or a direct .mp4/.webm link.">
              <Input value={d.content} onChange={(e) => onPatch({ content: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" inputMode="url" />
            </Field>
          )}
          {d.kind === "document" && (
            <Field label="Document URL" hint="Or attach a file from the Files library / a wiki page below.">
              <Input value={d.content} onChange={(e) => onPatch({ content: e.target.value })} placeholder="https://…" inputMode="url" />
            </Field>
          )}
          {d.kind !== "quiz" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Linked wiki page">
                <Select value={d.wiki_page_id} onChange={(e) => onPatch({ wiki_page_id: e.target.value })}>
                  <option value="">None</option>
                  {wikiPages.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
                </Select>
              </Field>
              <Field label="Linked file">
                <Select value={d.file_id} onChange={(e) => onPatch({ file_id: e.target.value })}>
                  <option value="">None</option>
                  {files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </Field>
            </div>
          )}
          {d.kind === "quiz" && <QuizBuilder quiz={d.quiz} onChange={(quiz) => onPatch({ quiz })} />}
        </div>
      )}
    </div>
  );
}

function QuizBuilder({ quiz, onChange }: { quiz: QuizQuestion[]; onChange: (q: QuizQuestion[]) => void }) {
  const set = (i: number, p: Partial<QuizQuestion>) => onChange(quiz.map((q, j) => (j === i ? { ...q, ...p } : q)));
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted flex items-center gap-1.5"><HelpCircle size={12} /> Learners pass at 70% and can retry. Tick the radio next to the correct option.</div>
      {quiz.map((q, i) => (
        <div key={i} className="card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full sunken text-[11px] font-semibold inline-flex items-center justify-center num shrink-0">Q{i + 1}</span>
            <Input value={q.q} onChange={(e) => set(i, { q: e.target.value })} placeholder="Question" className="flex-1" />
            <Button type="button" size="xs" variant="ghost" icon onClick={() => onChange(quiz.filter((_, j) => j !== i))} aria-label="Remove question" className="text-danger"><Trash2 size={13} /></Button>
          </div>
          <div className="space-y-1.5 pl-8">
            {q.options.map((o, k) => (
              <div key={k} className="flex items-center gap-2">
                <input type="radio" name={`ans-${i}`} checked={q.answer === k} onChange={() => set(i, { answer: k })} className="accent-[var(--success)]" title="Correct answer" />
                <Input value={o} onChange={(e) => set(i, { options: q.options.map((x, j) => (j === k ? e.target.value : x)) })} placeholder={`Option ${k + 1}`} className="flex-1" style={{ height: 32 }} />
                {q.options.length > 2 && <Button type="button" size="xs" variant="ghost" icon onClick={() => set(i, { options: q.options.filter((_, j) => j !== k), answer: q.answer >= k && q.answer > 0 ? q.answer - 1 : q.answer })} aria-label="Remove option"><Trash2 size={12} /></Button>}
              </div>
            ))}
            {q.options.length < 6 && <button type="button" className="text-xs link inline-flex items-center gap-1" onClick={() => set(i, { options: [...q.options, ""] })}><Plus size={11} /> Add option</button>}
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="secondary" onClick={() => onChange([...quiz, { q: "", options: ["", ""], answer: 0 }])}><Plus size={13} /> Add question</Button>
      <div className="text-[11px] text-muted inline-flex items-center gap-1"><BookOpen size={11} /> Tip: keep it to 3–8 questions that check understanding, not memory.</div>
    </div>
  );
}
