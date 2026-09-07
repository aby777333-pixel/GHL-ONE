"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap, Plus, UserPlus, BookOpen, Clock, ShieldAlert, AlertTriangle, CheckCircle2, PlayCircle, Layers } from "lucide-react";
import { Button, Card, EmptyState, PageHeader, Pill, Progress, SearchInput, Select, Tabs, Avatar } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { cn, fmtDate, relDate } from "@/lib/utils";
import { COURSE_STATUS_LABEL, COURSE_STATUS_TONE, LEVELS, LEVEL_LABEL, LEVEL_TONE, fmtDuration, isOverdueOn, type Course, type Enrollment } from "./lib";
import { AssignTrainingModal } from "./AssignTrainingModal";
import { CourseEditor } from "./CourseEditor";

export type LessonLite = { id: string; course_id: string; kind: string; duration_minutes: number | null };
export type AcademyData = {
  courses: Course[];
  lessons: LessonLite[];
  enrollments: Enrollment[];
  canManage: boolean;
  openCreate: boolean;
  openAssign: string;
  tab: "catalogue" | "mine" | "team";
};

type TabKey = "catalogue" | "mine" | "team";

export function AcademyClient({ data }: { data: AcademyData }) {
  const { profile, departments, people } = useSession();
  const router = useRouter();
  useSeen("nav:/academy");
  const [tab, setTab] = React.useState<TabKey>(data.tab);
  const [q, setQ] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [onlyMandatory, setOnlyMandatory] = React.useState(false);
  const [assignFor, setAssignFor] = React.useState<string | null>(data.openAssign || null);
  const [creating, setCreating] = React.useState(data.openCreate);

  const lessonsByCourse = React.useMemo(() => {
    const m = new Map<string, LessonLite[]>();
    for (const l of data.lessons) {
      if (!m.has(l.course_id)) m.set(l.course_id, []);
      m.get(l.course_id)!.push(l);
    }
    return m;
  }, [data.lessons]);

  const mine = React.useMemo(() => data.enrollments.filter((e) => e.user_id === profile.id), [data.enrollments, profile.id]);
  const myByCourse = React.useMemo(() => new Map(mine.map((e) => [e.course_id, e])), [mine]);
  const courseById = React.useMemo(() => new Map(data.courses.map((c) => [c.id, c])), [data.courses]);

  const visible = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.courses.filter((c) => {
      if (level && c.level !== level) return false;
      if (onlyMandatory && !c.mandatory) return false;
      if (dept && c.department_ids && !c.department_ids.includes(dept)) return false;
      if (!needle) return true;
      return c.title.toLowerCase().includes(needle) || (c.description || "").toLowerCase().includes(needle);
    });
  }, [data.courses, q, level, dept, onlyMandatory]);

  const overdueCount = mine.filter((e) => isOverdueOn(e.due_on, e.status)).length;
  const inProgress = mine.filter((e) => e.status !== "completed").length;

  const team = React.useMemo(() => data.enrollments.filter((e) => e.user_id !== profile.id), [data.enrollments, profile.id]);

  const tabs: { key: TabKey; label: React.ReactNode; count?: number }[] = [
    { key: "catalogue", label: "Catalogue", count: data.courses.length || undefined },
    { key: "mine", label: "My learning", count: inProgress || undefined },
    ...(data.canManage ? [{ key: "team" as const, label: "Team progress", count: team.filter((e) => e.status !== "completed").length || undefined }] : []),
  ];

  function go(t: TabKey) {
    setTab(t);
    router.replace(t === "catalogue" ? "/academy" : `/academy?tab=${t}`, { scroll: false });
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Growth"
        title="GHL Academy"
        subtitle={overdueCount ? `${overdueCount} training${overdueCount > 1 ? "s are" : " is"} overdue — finish those first.` : inProgress ? `${inProgress} course${inProgress > 1 ? "s" : ""} in progress. Keep going.` : "Learn the way we work. Short courses, real SOPs, quick quizzes."}
        actions={
          data.canManage ? (
            <>
              <Button variant="secondary" onClick={() => setAssignFor("")}><UserPlus size={15} /> Assign training</Button>
              <Button variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> Create course</Button>
            </>
          ) : undefined
        }
      />

      <Tabs tabs={tabs} value={tab} onChange={go} className="mb-[var(--s3)]" />

      {tab === "catalogue" && (
        <>
          <div className="flex flex-col sm:flex-row gap-2 mb-[var(--s4)]">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses…" className="flex-1" />
            <div className="grid grid-cols-2 sm:flex gap-2">
              <Select value={level} onChange={(e) => setLevel(e.target.value)} className="sm:w-[160px]">
                <option value="">All levels</option>
                {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
              </Select>
              <Select value={dept} onChange={(e) => setDept(e.target.value)} className="sm:w-[190px]">
                <option value="">All departments</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              <label className={cn("btn btn-sm cursor-pointer col-span-2 sm:col-span-1", onlyMandatory ? "btn-primary" : "btn-secondary")} style={{ height: 38 }}>
                <input type="checkbox" className="sr-only" checked={onlyMandatory} onChange={(e) => setOnlyMandatory(e.target.checked)} />
                <ShieldAlert size={14} /> Mandatory only
              </label>
            </div>
          </div>
          {visible.length === 0 ? (
            <Card>
              <EmptyState icon={<GraduationCap size={18} />} title={data.courses.length ? "No courses match" : "No courses yet"} hint={data.courses.length ? "Try a different search or level." : data.canManage ? "Create the first course — an onboarding walkthrough or a key SOP is a great start." : "Courses published for your department will appear here."} action={data.canManage && !data.courses.length ? <Button variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> Create course</Button> : undefined} />
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[var(--s3)] stagger">
              {visible.map((c) => (
                <CourseCard key={c.id} course={c} lessons={lessonsByCourse.get(c.id) || []} enrollment={myByCourse.get(c.id)} canManage={data.canManage} onAssign={() => setAssignFor(c.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "mine" && <MyLearning enrollments={mine} courseById={courseById} lessonsByCourse={lessonsByCourse} />}

      {tab === "team" && data.canManage && (
        <TeamProgress enrollments={team} courseById={courseById} people={people} />
      )}

      {assignFor !== null && (
        <AssignTrainingModal courses={data.courses.filter((c) => c.status === "published")} initialCourseId={assignFor || undefined} onClose={() => { setAssignFor(null); if (data.openAssign) router.replace("/academy"); }} onDone={() => { setAssignFor(null); router.refresh(); }} />
      )}
      {creating && (
        <CourseEditor onClose={() => { setCreating(false); if (data.openCreate) router.replace("/academy"); }} onSaved={(id) => { setCreating(false); router.push(`/academy/${id}`); router.refresh(); }} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------- CourseCard */
export function CourseCard({ course, lessons, enrollment, canManage, onAssign }: { course: Course; lessons: LessonLite[]; enrollment?: Enrollment; canManage?: boolean; onAssign?: () => void }) {
  const { departments } = useSession();
  const duration = course.duration_minutes || lessons.reduce((a, l) => a + (l.duration_minutes || 0), 0);
  const overdue = isOverdueOn(enrollment?.due_on, enrollment?.status);
  const done = enrollment?.status === "completed";
  const scoped = course.department_ids?.length ? course.department_ids.map((id) => departments.find((d) => d.id === id)?.name).filter(Boolean).join(", ") : null;
  return (
    <Link href={`/academy/${course.id}`} className={cn("card card-hover p-[var(--s4)] flex flex-col gap-3 min-w-0 relative overflow-hidden", overdue && "border-[var(--danger)]")}>
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: done ? "var(--success)" : course.mandatory ? "var(--danger)" : "var(--brand)" }} />
      <div className="flex items-start gap-3">
        <span className={cn("w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0", LEVEL_TONE[course.level] || "tone-neutral")}><BookOpen size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-snug truncate-2">{course.title}</div>
          <div className="text-[11px] text-muted truncate mt-0.5">{scoped || "Everyone"}</div>
        </div>
      </div>
      {course.description && <p className="text-xs text-2 truncate-2 leading-relaxed">{course.description}</p>}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Pill tone={LEVEL_TONE[course.level] || "tone-neutral"}>{LEVEL_LABEL[course.level] || course.level}</Pill>
        {course.mandatory && <Pill tone="tone-danger"><ShieldAlert size={10} /> Mandatory</Pill>}
        {course.status !== "published" && <Pill tone={COURSE_STATUS_TONE[course.status]}>{COURSE_STATUS_LABEL[course.status]}</Pill>}
        <span className="text-[11px] text-muted inline-flex items-center gap-1 ml-auto num"><Layers size={11} /> {lessons.length} lesson{lessons.length === 1 ? "" : "s"}{duration ? <> · <Clock size={11} /> {fmtDuration(duration)}</> : null}</span>
      </div>
      <div className="mt-auto">
        {enrollment ? (
          <>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className={cn("inline-flex items-center gap-1", done ? "text-success" : overdue ? "text-danger" : "text-muted")}>
                {done ? <><CheckCircle2 size={12} /> Completed {enrollment.completed_at ? fmtDate(enrollment.completed_at) : ""}</> : overdue ? <><AlertTriangle size={12} /> Overdue · was due {relDate(enrollment.due_on)}</> : enrollment.due_on ? <><Clock size={12} /> Due {relDate(enrollment.due_on)}</> : <><PlayCircle size={12} /> {enrollment.status === "assigned" ? "Assigned to you" : "In progress"}</>}
              </span>
              <span className="num text-muted">{enrollment.progress}%</span>
            </div>
            <Progress value={enrollment.progress} height={5} tone={done ? "var(--success)" : overdue ? "var(--danger)" : "var(--brand)"} />
          </>
        ) : (
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>Not started</span>
            {canManage && onAssign && (
              <button className="link inline-flex items-center gap-1" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAssign(); }}><UserPlus size={11} /> Assign</button>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

/* ---------------------------------------------------------- MyLearning */
function MyLearning({ enrollments, courseById, lessonsByCourse }: { enrollments: Enrollment[]; courseById: Map<string, Course>; lessonsByCourse: Map<string, LessonLite[]> }) {
  const groups: { key: string; title: string; hint: string; items: Enrollment[] }[] = [
    { key: "overdue", title: "Overdue", hint: "Past the due date — finish these first.", items: enrollments.filter((e) => isOverdueOn(e.due_on, e.status)) },
    { key: "progress", title: "In progress", hint: "Pick up where you left off.", items: enrollments.filter((e) => e.status === "in_progress" && !isOverdueOn(e.due_on, e.status)) },
    { key: "assigned", title: "Assigned", hint: "Not started yet.", items: enrollments.filter((e) => e.status === "assigned" && !isOverdueOn(e.due_on, e.status)) },
    { key: "done", title: "Completed", hint: "Your certificates live on each course page.", items: enrollments.filter((e) => e.status === "completed") },
  ];
  if (enrollments.length === 0) {
    return (
      <Card>
        <EmptyState icon={<GraduationCap size={18} />} title="Nothing on your learning plan yet" hint="Open any course in the catalogue and complete a lesson — it will appear here automatically." action={<Link href="/academy" className="btn btn-primary btn-sm">Browse the catalogue</Link>} />
      </Card>
    );
  }
  return (
    <div className="space-y-[var(--s4)]">
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.key}>
          <div className="flex items-baseline gap-2 mb-2">
            <h2 className={cn("h3", g.key === "overdue" && "text-danger")}>{g.title}</h2>
            <span className="text-xs text-muted">{g.hint}</span>
          </div>
          <Card className="divide-y">
            {g.items.map((e) => {
              const c = courseById.get(e.course_id);
              const overdue = isOverdueOn(e.due_on, e.status);
              return (
                <Link key={e.id} href={`/academy/${e.course_id}`} className="flex items-center gap-3 px-[var(--s4)] py-3 row-hover">
                  <span className={cn("w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0", e.status === "completed" ? "tone-success" : overdue ? "tone-danger" : LEVEL_TONE[c?.level || ""] || "tone-neutral")}>
                    {e.status === "completed" ? <CheckCircle2 size={16} /> : <BookOpen size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{c?.title || "Course"}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={e.progress} className="max-w-[180px]" height={4} tone={e.status === "completed" ? "var(--success)" : overdue ? "var(--danger)" : "var(--brand)"} />
                      <span className="text-[11px] text-muted num">{e.progress}%</span>
                      <span className="text-[11px] text-muted num">· {(lessonsByCourse.get(e.course_id) || []).length} lessons</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {e.status === "completed" ? (
                      <div className="text-[11px] text-success num">{e.completed_at ? fmtDate(e.completed_at) : "Done"}{typeof e.score === "number" ? ` · ${e.score}%` : ""}</div>
                    ) : e.due_on ? (
                      <div className={cn("text-[11px] num inline-flex items-center gap-1", overdue ? "text-danger" : "text-muted")}>{overdue ? <AlertTriangle size={11} /> : <Clock size={11} />} {overdue ? "was due" : "due"} {relDate(e.due_on)}</div>
                    ) : (
                      <div className="text-[11px] text-muted">No deadline</div>
                    )}
                    {c?.mandatory && <div className="mt-1"><Pill tone="tone-danger">Mandatory</Pill></div>}
                  </div>
                </Link>
              );
            })}
          </Card>
        </section>
      ))}
    </div>
  );
}

/* -------------------------------------------------------- TeamProgress */
function TeamProgress({ enrollments, courseById, people }: { enrollments: Enrollment[]; courseById: Map<string, Course>; people: ReturnType<typeof useSession>["people"] }) {
  const byPerson = React.useMemo(() => {
    const m = new Map<string, Enrollment[]>();
    for (const e of enrollments) {
      if (!m.has(e.user_id)) m.set(e.user_id, []);
      m.get(e.user_id)!.push(e);
    }
    return [...m.entries()]
      .map(([id, items]) => ({ person: people.find((p) => p.id === id), id, items, overdue: items.filter((e) => isOverdueOn(e.due_on, e.status)).length }))
      .sort((a, b) => b.overdue - a.overdue || (a.person?.full_name || "").localeCompare(b.person?.full_name || ""));
  }, [enrollments, people]);

  if (byPerson.length === 0) {
    return <Card><EmptyState icon={<GraduationCap size={18} />} title="No team enrolments yet" hint="Assign a course to your team and their progress will show here." /></Card>;
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s3)] stagger">
      {byPerson.map((row) => (
        <Card key={row.id} className="p-[var(--s3)]">
          <Link href={`/people/${row.id}`} className="flex items-center gap-2.5 mb-2">
            <Avatar name={row.person?.full_name} src={row.person?.avatar_url} size={30} presence={row.person?.presence} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{row.person?.full_name || "Someone"}</div>
              <div className="text-[11px] text-muted truncate">{row.items.filter((e) => e.status === "completed").length}/{row.items.length} completed{row.overdue ? ` · ${row.overdue} overdue` : ""}</div>
            </div>
            {row.overdue > 0 && <Pill tone="tone-danger">{row.overdue} overdue</Pill>}
          </Link>
          <ul className="space-y-1.5">
            {row.items.map((e) => {
              const c = courseById.get(e.course_id);
              const overdue = isOverdueOn(e.due_on, e.status);
              return (
                <li key={e.id} className="flex items-center gap-2 text-xs">
                  <Link href={`/academy/${e.course_id}`} className="truncate flex-1 hover:underline">{c?.title || "Course"}</Link>
                  <Progress value={e.progress} className="w-16 sm:w-24" height={4} tone={e.status === "completed" ? "var(--success)" : overdue ? "var(--danger)" : "var(--brand)"} />
                  <span className="num w-8 text-right text-muted">{e.progress}%</span>
                  {e.due_on && <span className={cn("num hidden sm:inline", overdue ? "text-danger" : "text-muted")}>{relDate(e.due_on)}</span>}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
