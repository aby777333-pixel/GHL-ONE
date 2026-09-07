"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Award, BookOpen, Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, ExternalLink, FileText, HelpCircle, Layers, ListChecks, Pencil, PlayCircle, Printer, RotateCcw, ShieldAlert, UserPlus, Video, Link2, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Pill, Progress, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { Markdown } from "@/components/wiki/markdown";
import { signedUrl } from "@/components/files/storage";
import { cn, fmtDate, relDate } from "@/lib/utils";
import { COURSE_STATUS_LABEL, COURSE_STATUS_TONE, LESSON_KIND_LABEL, LEVEL_LABEL, LEVEL_TONE, PASS_MARK, SOP_STORAGE_PREFIX, asQuiz, fmtDuration, isOverdueOn, parseSop, videoEmbed, type Course, type Enrollment, type Lesson, type LessonProgress, type QuizQuestion } from "./lib";
import { CourseEditor } from "./CourseEditor";
import { AssignTrainingModal } from "./AssignTrainingModal";

export type CoursePageData = {
  course: Course;
  lessons: Lesson[];
  enrollment: Enrollment | null;
  progress: LessonProgress[];
  wiki: { id: string; title: string; slug: string }[];
  files: { id: string; name: string; storage_path: string | null; mime_type: string | null }[];
  canManage: boolean;
  openEdit: boolean;
  lessonId: string;
};

const KIND_ICON: Record<string, React.ReactNode> = { text: <FileText size={14} />, video: <Video size={14} />, document: <Link2 size={14} />, sop: <ListChecks size={14} />, quiz: <HelpCircle size={14} /> };

export function CoursePage({ data }: { data: CoursePageData }) {
  const { profile, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { course, lessons } = data;
  const [enrollment, setEnrollment] = React.useState<Enrollment | null>(data.enrollment);
  const [progress, setProgress] = React.useState<LessonProgress[]>(data.progress);
  const [editing, setEditing] = React.useState(data.openEdit && data.canManage);
  const [assigning, setAssigning] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const doneIds = React.useMemo(() => new Set(progress.map((p) => p.lesson_id)), [progress]);
  const firstOpen = lessons.find((l) => !doneIds.has(l.id))?.id || lessons[0]?.id || null;
  const [current, setCurrent] = React.useState<string | null>(() => (data.lessonId && lessons.some((l) => l.id === data.lessonId) ? data.lessonId : firstOpen));
  const lesson = lessons.find((l) => l.id === current) || null;
  const idx = lesson ? lessons.findIndex((l) => l.id === lesson.id) : -1;

  const total = lessons.length;
  const done = lessons.filter((l) => doneIds.has(l.id)).length;
  const pct = enrollment?.progress ?? (total ? Math.round((done / total) * 100) : 0);
  const completed = enrollment?.status === "completed" || (total > 0 && done >= total);
  const overdue = isOverdueOn(enrollment?.due_on, enrollment?.status);
  const duration = course.duration_minutes || lessons.reduce((a, l) => a + (l.duration_minutes || 0), 0);
  const scoped = course.department_ids?.length ? course.department_ids.map((id) => departments.find((d) => d.id === id)?.name).filter(Boolean).join(", ") : null;

  function select(id: string) {
    setCurrent(id);
    router.replace(`/academy/${course.id}?lesson=${id}`, { scroll: false });
    if (typeof window !== "undefined" && window.innerWidth < 1024) document.getElementById("lesson-viewer")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Make sure I have an enrolment (self-enrol when opening a course nobody assigned). */
  async function ensureEnrollment(): Promise<Enrollment | null> {
    if (enrollment) return enrollment;
    const supabase = createClient();
    const { data: row, error } = await supabase.from("enrollments").insert({ course_id: course.id, user_id: profile.id }).select("*").single();
    if (error || !row) {
      // Someone may have enrolled me meanwhile — fetch instead of failing.
      const { data: existing } = await supabase.from("enrollments").select("*").eq("course_id", course.id).eq("user_id", profile.id).maybeSingle();
      if (!existing) { toast.push(error?.message || "Could not enrol you", "danger"); return null; }
      setEnrollment(existing);
      return existing;
    }
    setEnrollment(row);
    return row;
  }

  async function complete(l: Lesson, score?: number) {
    setBusy(true);
    const supabase = createClient();
    const e = await ensureEnrollment();
    if (!e) { setBusy(false); return; }
    const already = doneIds.has(l.id);
    const { data: row, error } = already
      ? await supabase.from("lesson_progress").update({ score: score ?? null, completed_at: new Date().toISOString() }).eq("enrollment_id", e.id).eq("lesson_id", l.id).select("*").single()
      : await supabase.from("lesson_progress").insert({ enrollment_id: e.id, lesson_id: l.id, score: score ?? null }).select("*").single();
    if (error || !row) { setBusy(false); toast.push(error?.message || "Could not save progress", "danger"); return; }
    setProgress((s) => (already ? s.map((p) => (p.lesson_id === l.id ? row : p)) : [...s, row]));
    const { data: fresh } = await supabase.from("enrollments").select("*").eq("id", e.id).maybeSingle();
    if (fresh) setEnrollment(fresh);
    setBusy(false);
    const nowDone = already ? done : done + 1;
    if (nowDone >= total) toast.push("Course completed — your certificate is ready.", "success");
    else {
      toast.push(score != null ? `Passed with ${score}%` : "Lesson completed", "success");
      const next = lessons[idx + 1];
      if (next) setTimeout(() => select(next.id), 350);
    }
    router.refresh();
  }

  async function start() {
    setBusy(true);
    const e = await ensureEnrollment();
    setBusy(false);
    if (e) { toast.push("Added to your learning plan", "success"); router.refresh(); }
  }

  if (editing) {
    return <CourseEditor course={course} lessons={lessons} onClose={() => { setEditing(false); if (data.openEdit) router.replace(`/academy/${course.id}`); }} onSaved={() => { setEditing(false); router.replace(`/academy/${course.id}`); router.refresh(); }} />;
  }

  return (
    <div className="page">
      <Link href="/academy" className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]"><ArrowLeft size={14} /> Academy</Link>

      {/* Header */}
      <Card className="p-[var(--s4)] mb-[var(--s4)] relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: completed ? "var(--success)" : course.mandatory ? "var(--danger)" : "var(--brand)" }} />
        <div className="flex flex-col md:flex-row md:items-start gap-[var(--s3)]">
          <span className={cn("w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0", LEVEL_TONE[course.level] || "tone-neutral")}><BookOpen size={22} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="h1">{course.title}</h1>
              {course.status !== "published" && <Pill tone={COURSE_STATUS_TONE[course.status]}>{COURSE_STATUS_LABEL[course.status]}</Pill>}
            </div>
            {course.description && <p className="text-sm text-2 mt-1 leading-relaxed max-w-3xl">{course.description}</p>}
            <div className="flex items-center gap-1.5 flex-wrap mt-2 text-xs">
              <Pill tone={LEVEL_TONE[course.level] || "tone-neutral"}>{LEVEL_LABEL[course.level] || course.level}</Pill>
              {course.mandatory && <Pill tone="tone-danger"><ShieldAlert size={10} /> Mandatory</Pill>}
              <span className="text-muted inline-flex items-center gap-1 num"><Layers size={11} /> {total} lesson{total === 1 ? "" : "s"}</span>
              {duration > 0 && <span className="text-muted inline-flex items-center gap-1 num"><Clock size={11} /> {fmtDuration(duration)}</span>}
              <span className="text-muted">· {scoped || "For everyone"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap md:justify-end shrink-0">
            {!enrollment && !completed && total > 0 && <Button variant="primary" loading={busy} onClick={start}><PlayCircle size={15} /> Start course</Button>}
            {data.canManage && <Button variant="secondary" onClick={() => setAssigning(true)}><UserPlus size={15} /> Assign</Button>}
            {data.canManage && <Button variant="ghost" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</Button>}
          </div>
        </div>
        {(enrollment || done > 0) && (
          <div className="mt-[var(--s3)] pt-[var(--s3)] border-t">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className={cn("inline-flex items-center gap-1.5", completed ? "text-success" : overdue ? "text-danger" : "text-muted")}>
                {completed ? <><CheckCircle2 size={13} /> Completed{enrollment?.completed_at ? ` on ${fmtDate(enrollment.completed_at)}` : ""}{typeof enrollment?.score === "number" ? ` · average score ${enrollment.score}%` : ""}</> : overdue ? <><Clock size={13} /> Overdue — was due {relDate(enrollment?.due_on)}</> : enrollment?.due_on ? <><Clock size={13} /> Due {relDate(enrollment.due_on)}</> : <><PlayCircle size={13} /> {done} of {total} lessons done</>}
              </span>
              <span className="num font-medium">{pct}%</span>
            </div>
            <Progress value={pct} tone={completed ? "var(--success)" : overdue ? "var(--danger)" : "var(--brand)"} />
          </div>
        )}
      </Card>

      {completed && enrollment && <Certificate course={course} enrollment={enrollment} name={profile.full_name} />}

      {total === 0 ? (
        <Card>
          <EmptyState icon={<Layers size={18} />} title="No lessons yet" hint={data.canManage ? "Add lessons to make this course learnable." : "The author is still building this course."} action={data.canManage ? <Button variant="primary" onClick={() => setEditing(true)}><Pencil size={14} /> Add lessons</Button> : undefined} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-[var(--s4)] items-start">
          {/* Lesson list */}
          <Card className="lg:sticky lg:top-[72px]">
            <CardHeader title="Lessons" subtitle={`${done}/${total} completed`} />
            <ol className="pb-2">
              {lessons.map((l, i) => {
                const isDone = doneIds.has(l.id);
                const active = l.id === current;
                return (
                  <li key={l.id}>
                    <button onClick={() => select(l.id)} className={cn("w-full flex items-center gap-2.5 px-[var(--s3)] py-2 text-left row-hover", active && "bg-[var(--neutral-bg)]")}>
                      {isDone ? <CheckCircle2 size={16} className="text-success shrink-0" /> : <Circle size={16} className={cn("shrink-0", active ? "text-[var(--brand)]" : "text-muted")} />}
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm truncate", active && "font-medium")}>{i + 1}. {l.title}</span>
                        <span className="block text-[11px] text-muted inline-flex items-center gap-1">{KIND_ICON[l.kind]} {LESSON_KIND_LABEL[l.kind] || l.kind}{l.duration_minutes ? ` · ${fmtDuration(l.duration_minutes)}` : ""}</span>
                      </span>
                      {active && <ChevronRight size={14} className="text-muted shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ol>
          </Card>

          {/* Viewer */}
          <div id="lesson-viewer" className="min-w-0 scroll-mt-20">
            {lesson ? (
              <LessonViewer
                key={lesson.id}
                lesson={lesson}
                index={idx}
                total={total}
                done={doneIds.has(lesson.id)}
                score={progress.find((p) => p.lesson_id === lesson.id)?.score ?? null}
                wiki={data.wiki.find((w) => w.id === lesson.wiki_page_id) || null}
                file={data.files.find((f) => f.id === lesson.file_id) || null}
                busy={busy}
                onComplete={(score) => complete(lesson, score)}
                onPrev={idx > 0 ? () => select(lessons[idx - 1].id) : undefined}
                onNext={idx < total - 1 ? () => select(lessons[idx + 1].id) : undefined}
              />
            ) : (
              <Card><EmptyState title="Pick a lesson to begin" /></Card>
            )}
          </div>
        </div>
      )}

      {assigning && <AssignTrainingModal courses={[course]} initialCourseId={course.id} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); router.refresh(); }} />}
    </div>
  );
}

/* --------------------------------------------------------- LessonViewer */
function LessonViewer({ lesson, index, total, done, score, wiki, file, busy, onComplete, onPrev, onNext }: { lesson: Lesson; index: number; total: number; done: boolean; score: number | null; wiki: { id: string; title: string; slug: string } | null; file: { id: string; name: string; storage_path: string | null; mime_type: string | null } | null; busy: boolean; onComplete: (score?: number) => void; onPrev?: () => void; onNext?: () => void }) {
  const isQuiz = lesson.kind === "quiz";
  return (
    <Card>
      <div className="px-[var(--s4)] pt-[var(--s3)] pb-[var(--s2)] flex items-start justify-between gap-3 border-b">
        <div className="min-w-0">
          <div className="eyebrow">Lesson {index + 1} of {total} · {LESSON_KIND_LABEL[lesson.kind] || lesson.kind}</div>
          <h2 className="h2 mt-0.5">{lesson.title}</h2>
        </div>
        {done && <Pill tone="tone-success"><Check size={10} /> Done{typeof score === "number" ? ` · ${score}%` : ""}</Pill>}
      </div>
      <div className="px-[var(--s4)] py-[var(--s4)] min-w-0">
        {lesson.kind === "text" && (lesson.content ? <Markdown source={lesson.content} /> : <div className="text-sm text-muted">No content yet.</div>)}
        {lesson.kind === "video" && <VideoBlock url={lesson.content || ""} />}
        {lesson.kind === "document" && <DocumentBlock url={lesson.content} file={file} />}
        {lesson.kind === "sop" && <SopBlock lessonId={lesson.id} source={lesson.content || ""} />}
        {isQuiz && <QuizRunner key={lesson.id} questions={asQuiz(lesson.quiz)} done={done} lastScore={score} busy={busy} onPass={(s) => onComplete(s)} />}

        {(wiki || (file && lesson.kind !== "document")) && (
          <div className="mt-[var(--s4)] pt-[var(--s3)] border-t space-y-1.5">
            <div className="eyebrow">Reference</div>
            {wiki && <Link href={`/wiki/${wiki.slug}`} className="flex items-center gap-2 text-sm link"><BookOpen size={14} /> {wiki.title} <ExternalLink size={11} /></Link>}
            {file && lesson.kind !== "document" && <FileLink file={file} />}
          </div>
        )}
      </div>
      <div className="px-[var(--s4)] py-[var(--s3)] border-t flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onPrev} disabled={!onPrev}><ChevronLeft size={14} /> Previous</Button>
        <Button variant="ghost" size="sm" onClick={onNext} disabled={!onNext}>Next <ChevronRight size={14} /></Button>
        <span className="ml-auto" />
        {!isQuiz && (done ? (
          <span className="text-xs text-success inline-flex items-center gap-1"><CheckCircle2 size={14} /> Completed</span>
        ) : (
          <Button variant="primary" loading={busy} onClick={() => onComplete()}><Check size={15} /> Mark complete</Button>
        ))}
      </div>
    </Card>
  );
}

function VideoBlock({ url }: { url: string }) {
  if (!url) return <div className="text-sm text-muted">No video URL yet.</div>;
  const v = videoEmbed(url);
  if (v.kind === "iframe") {
    return (
      <div className="relative w-full rounded-[var(--radius-sm)] overflow-hidden border sunken" style={{ aspectRatio: "16 / 9" }}>
        <iframe src={v.src} title="Lesson video" className="absolute inset-0 w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  if (v.kind === "video") return <video src={v.src} controls className="w-full rounded-[var(--radius-sm)] border sunken" style={{ maxHeight: 520 }} />;
  return (
    <a href={v.src} target="_blank" rel="noreferrer" className="card card-hover p-[var(--s3)] flex items-center gap-3">
      <span className="w-10 h-10 rounded-[10px] tone-warn flex items-center justify-center"><Video size={18} /></span>
      <div className="min-w-0 flex-1"><div className="text-sm font-medium">Open video</div><div className="text-xs text-muted truncate">{v.src}</div></div>
      <ExternalLink size={14} className="text-muted" />
    </a>
  );
}

function FileLink({ file }: { file: { id: string; name: string; storage_path: string | null; mime_type: string | null } }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!file.storage_path) return;
    let alive = true;
    signedUrl(createClient(), "files", file.storage_path).then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [file.storage_path]);
  return (
    <div className="flex items-center gap-2 text-sm flex-wrap">
      <Link href={`/files/${file.id}`} className="link inline-flex items-center gap-2"><FileText size={14} /> {file.name}</Link>
      {url && <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-xs"><Download size={12} /> Open</a>}
    </div>
  );
}

function DocumentBlock({ url, file }: { url: string | null; file: { id: string; name: string; storage_path: string | null; mime_type: string | null } | null }) {
  const [signed, setSigned] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!file?.storage_path) return;
    let alive = true;
    signedUrl(createClient(), "files", file.storage_path).then((u) => alive && setSigned(u));
    return () => { alive = false; };
  }, [file?.storage_path]);
  const isPdf = file?.mime_type === "application/pdf" || /\.pdf$/i.test(file?.name || "");
  if (!url && !file) return <div className="text-sm text-muted">No document attached yet.</div>;
  return (
    <div className="space-y-3">
      {file && (
        <div className="card p-[var(--s3)] flex items-center gap-3">
          <span className="w-10 h-10 rounded-[10px] tone-info flex items-center justify-center shrink-0"><FileText size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{file.name}</div>
            <div className="text-xs text-muted">From the Files library · <Link href={`/files/${file.id}`} className="link">details</Link></div>
          </div>
          {signed ? <a href={signed} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm"><Download size={13} /> Open</a> : <span className="text-xs text-muted">{file.storage_path ? "Preparing link…" : "No file version"}</span>}
        </div>
      )}
      {file && signed && isPdf && (
        <iframe src={signed} title={file.name} className="w-full rounded-[var(--radius-sm)] border" style={{ height: 560 }} />
      )}
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="card card-hover p-[var(--s3)] flex items-center gap-3">
          <span className="w-10 h-10 rounded-[10px] tone-neutral flex items-center justify-center shrink-0"><Link2 size={18} /></span>
          <div className="min-w-0 flex-1"><div className="text-sm font-medium">Open document</div><div className="text-xs text-muted truncate">{url}</div></div>
          <ExternalLink size={14} className="text-muted" />
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ SOP block */
function SopBlock({ lessonId, source }: { lessonId: string; source: string }) {
  const { steps, notes } = React.useMemo(() => parseSop(source), [source]);
  const [ticked, setTicked] = React.useState<boolean[]>(() => steps.map(() => false));
  const key = `${SOP_STORAGE_PREFIX}${lessonId}`;

  React.useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) setTicked(steps.map((_, i) => !!arr[i]));
        }
      } catch { /* ignore */ }
    }, 0);
    return () => clearTimeout(t);
  }, [key, steps]);

  function toggle(i: number) {
    setTicked((s) => {
      const n = s.slice();
      n[i] = !n[i];
      try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* ignore */ }
      return n;
    });
  }
  function reset() {
    const n = steps.map(() => false);
    setTicked(n);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
  const doneCount = ticked.filter(Boolean).length;

  if (steps.length === 0) return source ? <Markdown source={source} /> : <div className="text-sm text-muted">No steps yet.</div>;
  return (
    <div className="space-y-[var(--s3)]">
      {notes && <Markdown source={notes} />}
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted num">{doneCount}/{steps.length} steps ticked · saved on this device</div>
        {doneCount > 0 && <button className="text-xs link inline-flex items-center gap-1" onClick={reset}><RotateCcw size={11} /> Reset checklist</button>}
      </div>
      <Progress value={steps.length ? (doneCount / steps.length) * 100 : 0} height={4} tone={doneCount === steps.length ? "var(--success)" : "var(--brand)"} />
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i}>
            <label className={cn("flex items-start gap-3 p-3 rounded-[var(--radius-sm)] border cursor-pointer transition-colors", ticked[i] ? "bg-[var(--success-bg)] border-[var(--success)]" : "row-hover")}>
              <input type="checkbox" checked={!!ticked[i]} onChange={() => toggle(i)} className="mt-0.5 accent-[var(--success)]" />
              <span className="w-6 h-6 rounded-full sunken text-[11px] font-semibold inline-flex items-center justify-center num shrink-0">{i + 1}</span>
              <div className={cn("min-w-0 flex-1 text-sm", ticked[i] && "line-through text-muted")}><Markdown source={s} className="!text-sm" /></div>
            </label>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ----------------------------------------------------------- QuizRunner */
function QuizRunner({ questions, done, lastScore, busy, onPass }: { questions: QuizQuestion[]; done: boolean; lastScore: number | null; busy: boolean; onPass: (score: number) => void }) {
  const [answers, setAnswers] = React.useState<Record<number, number>>({});
  const [result, setResult] = React.useState<{ score: number; correct: number } | null>(null);
  const answered = Object.keys(answers).length;
  const passed = result && result.score >= PASS_MARK;

  if (questions.length === 0) return <div className="text-sm text-muted">This quiz has no questions yet.</div>;

  function submit() {
    const correct = questions.reduce((a, q, i) => a + (answers[i] === q.answer ? 1 : 0), 0);
    const score = Math.round((correct / questions.length) * 100);
    setResult({ score, correct });
    if (score >= PASS_MARK) onPass(score);
  }
  function retry() { setAnswers({}); setResult(null); }

  return (
    <div className="space-y-[var(--s3)]">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><HelpCircle size={12} /> {questions.length} question{questions.length > 1 ? "s" : ""} · pass mark {PASS_MARK}%{done && typeof lastScore === "number" ? ` · your best so far ${lastScore}%` : ""}</span>
        {!result && <span className="num">{answered}/{questions.length} answered</span>}
      </div>
      {result && (
        <div className={cn("rounded-[var(--radius-sm)] border p-[var(--s3)] flex items-center gap-3", passed ? "tone-success border-[var(--success)]" : "tone-danger border-[var(--danger)]")}>
          <span className="text-[1.618rem] font-semibold num leading-none">{result.score}%</span>
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium">{passed ? "Passed — well done." : `Not quite. You need ${PASS_MARK}% to pass.`}</div>
            <div className="text-xs opacity-80">{result.correct} of {questions.length} correct. {passed ? "Your score is recorded on your certificate." : "Review the answers marked below and try again."}</div>
          </div>
          {!passed && <Button size="sm" variant="secondary" onClick={retry}><RotateCcw size={13} /> Try again</Button>}
        </div>
      )}
      <ol className="space-y-3">
        {questions.map((q, i) => {
          const chosen = answers[i];
          return (
            <li key={i} className="card p-[var(--s3)]">
              <div className="flex items-start gap-2 mb-2">
                <span className="w-6 h-6 rounded-full sunken text-[11px] font-semibold inline-flex items-center justify-center num shrink-0">{i + 1}</span>
                <div className="text-sm font-medium leading-snug">{q.q}</div>
              </div>
              <div className="space-y-1.5 pl-8">
                {q.options.map((o, k) => {
                  const isChosen = chosen === k;
                  const showRight = !!result && k === q.answer;
                  const showWrong = !!result && isChosen && k !== q.answer;
                  return (
                    <label key={k} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)] border cursor-pointer text-sm transition-colors", showRight ? "bg-[var(--success-bg)] border-[var(--success)]" : showWrong ? "bg-[var(--danger-bg)] border-[var(--danger)]" : isChosen ? "border-[var(--brand)] bg-[var(--neutral-bg)]" : "row-hover", result && "cursor-default")}>
                      <input type="radio" name={`q-${i}`} checked={isChosen} disabled={!!result} onChange={() => setAnswers((s) => ({ ...s, [i]: k }))} className="accent-[var(--brand)]" />
                      <span className="flex-1">{o}</span>
                      {showRight && <Check size={14} className="text-success" />}
                    </label>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
      {!result && (
        <div className="flex justify-end">
          <Button variant="primary" disabled={answered < questions.length} loading={busy} onClick={submit}><Award size={15} /> Submit answers</Button>
        </div>
      )}
      {passed && done && <div className="text-xs text-success inline-flex items-center gap-1"><CheckCircle2 size={13} /> Recorded.</div>}
    </div>
  );
}

/* ---------------------------------------------------------- Certificate */
function Certificate({ course, enrollment, name }: { course: Course; enrollment: Enrollment; name: string }) {
  return (
    <Card className="mb-[var(--s4)] p-[var(--s4)] relative overflow-hidden print:shadow-none" id="certificate">
      <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full opacity-10" style={{ background: "var(--brand)" }} />
      <div className="absolute -left-12 -bottom-14 w-44 h-44 rounded-full opacity-10" style={{ background: "var(--success)" }} />
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-[var(--s3)]">
        <span className="w-14 h-14 rounded-full tone-success flex items-center justify-center shrink-0 ring-4 ring-[var(--bg-elev)]"><Award size={26} /></span>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Certificate of completion</div>
          <div className="h2 mt-0.5">{name}</div>
          <div className="text-sm text-2 mt-0.5">has completed <span className="font-medium text-[var(--fg)]">{course.title}</span></div>
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-muted mt-2 num">
            <span>Completed {fmtDate(enrollment.completed_at || enrollment.created_at)}</span>
            {typeof enrollment.score === "number" && <span>· Score {enrollment.score}%</span>}
            <span>· {LEVEL_LABEL[course.level] || course.level}</span>
            <span>· GHL Academy</span>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => window.print()} className="print:hidden"><Printer size={14} /> Print</Button>
      </div>
    </Card>
  );
}
