"use client";

import * as React from "react";
import Link from "next/link";
import { GraduationCap, Target, Sparkles, Plus, X, HeartHandshake, Check, Ban, BookOpen, Briefcase, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, Field, Input, Modal, Pill, Skeleton, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { RolePill } from "@/components/people/PeopleBits";
import { PersonGoals } from "@/components/goals/GoalMini";
import { fmtDate, type Profile, type Tables } from "@/lib/utils";
import { MENTORSHIP_STATUS_LABEL, MENTORSHIP_STATUS_TONE, type MentorshipRow } from "./lib";

type Person = Pick<Profile, "id" | "full_name" | "designation" | "role" | "skills" | "department_id" | "joined_at">;
type EnrollmentLite = Pick<Tables<"enrollments">, "id" | "course_id" | "status" | "progress" | "score" | "completed_at" | "due_on"> & { course: { title: string; level: string } | null };
type Interest = Tables<"learning_interests">;

/** "Career" section on a profile: role, training, goals, learning interests, mentorship. */
export function CareerCard({ person, self, canRequestMentor }: { person: Person; self: boolean; canRequestMentor: boolean }) {
  const { profile, departments } = useSession();
  const toast = useToast();
  const dept = departments.find((d) => d.id === person.department_id);
  const [enrollments, setEnrollments] = React.useState<EnrollmentLite[] | null>(null);
  const [interests, setInterests] = React.useState<Interest[] | null>(null);
  const [mentorships, setMentorships] = React.useState<MentorshipRow[] | null>(null);
  const [newInterest, setNewInterest] = React.useState("");
  const [addingInterest, setAddingInterest] = React.useState(false);
  const [requesting, setRequesting] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const supabase = createClient();
    const [{ data: e }, { data: li }, { data: m }] = await Promise.all([
      supabase.from("enrollments").select("id,course_id,status,progress,score,completed_at,due_on,course:courses!enrollments_course_id_fkey(title,level)").eq("user_id", person.id).order("completed_at", { ascending: false, nullsFirst: false }).limit(30),
      self ? supabase.from("learning_interests").select("*").eq("user_id", person.id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as Interest[] }),
      supabase.from("mentorships").select("*").or(`mentor_id.eq.${person.id},mentee_id.eq.${person.id}`).order("created_at", { ascending: false }).limit(30),
    ]);
    setEnrollments((e || []) as unknown as EnrollmentLite[]);
    setInterests(li || []);
    setMentorships(m || []);
  }, [person.id, self]);
  React.useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function addInterest(e: React.FormEvent) {
    e.preventDefault();
    const t = newInterest.trim();
    if (!t) return;
    setBusy("interest");
    const { data, error } = await createClient().from("learning_interests").insert({ user_id: profile.id, topic: t }).select("*").single();
    setBusy(null);
    if (error || !data) { toast.push(error?.message || "Could not add", "danger"); return; }
    setInterests((s) => [data, ...(s || [])]);
    setNewInterest("");
    setAddingInterest(false);
  }
  async function removeInterest(id: string) {
    const { error } = await createClient().from("learning_interests").delete().eq("id", id);
    if (error) { toast.push(error.message, "danger"); return; }
    setInterests((s) => (s || []).filter((i) => i.id !== id));
  }
  async function setMentorship(m: MentorshipRow, status: "active" | "declined" | "ended") {
    setBusy(m.id);
    const { data, error } = await createClient().from("mentorships").update({ status, ended_at: status === "ended" ? new Date().toISOString() : null }).eq("id", m.id).select("*").single();
    setBusy(null);
    if (error || !data) { toast.push(error?.message || "Could not update", "danger"); return; }
    setMentorships((s) => (s || []).map((x) => (x.id === m.id ? data : x)));
    toast.push(status === "active" ? "You are now mentoring. A good first step: schedule a 30-minute intro." : status === "declined" ? "Declined — they have been told." : "Mentorship ended.", status === "active" ? "success" : "info");
  }

  const completed = (enrollments || []).filter((e) => e.status === "completed");
  const inProgress = (enrollments || []).filter((e) => e.status !== "completed");
  const incoming = (mentorships || []).filter((m) => m.mentor_id === profile.id && m.status === "requested" && person.id === profile.id);
  const active = (mentorships || []).filter((m) => m.status === "active");
  const pendingOut = (mentorships || []).filter((m) => m.mentee_id === person.id && m.status === "requested");
  const loading = enrollments === null || mentorships === null;

  return (
    <Card id="career" className="scroll-mt-24">
      <CardHeader title="Career & growth" subtitle={self ? "Where you are, what you have learned, where you want to go." : `${person.full_name.split(" ")[0]}'s growth at GHL.`} action={<Sparkles size={15} className="text-muted" />} />
      <div className="px-[var(--s4)] pb-[var(--s4)] space-y-[var(--s4)]">
        {/* Role */}
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-[10px] tone-neutral inline-flex items-center justify-center shrink-0"><Briefcase size={16} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{person.designation || "No designation set"}</div>
            <div className="flex items-center gap-1.5 flex-wrap mt-1 text-xs text-muted">
              <RolePill role={person.role} />
              {dept && <span className="pill tone-neutral"><span className="w-1.5 h-1.5 rounded-full" style={{ background: dept.color }} />{dept.name}</span>}
              {person.joined_at && <span>· since {fmtDate(person.joined_at)}</span>}
            </div>
            {person.skills.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{person.skills.slice(0, 8).map((s) => <Link key={s} href={`/people/skills?skill=${encodeURIComponent(s)}`} className="pill tone-muted hover:bg-[var(--line)]">{s}</Link>)}{person.skills.length > 8 && <span className="pill tone-muted">+{person.skills.length - 8}</span>}</div>}
          </div>
        </div>

        {/* Training */}
        <section>
          <div className="flex items-center justify-between mb-1.5">
            <div className="eyebrow inline-flex items-center gap-1.5"><GraduationCap size={11} /> Training {enrollments ? `· ${completed.length} completed` : ""}</div>
            <Link href="/academy" className="text-[11px] text-muted hover:underline">Academy →</Link>
          </div>
          {loading ? <Skeleton className="h-5 w-2/3" /> : enrollments!.length === 0 ? (
            <div className="text-sm text-muted">No courses yet{self ? <> — <Link href="/academy" className="link">browse the Academy</Link>.</> : "."}</div>
          ) : (
            <ul className="space-y-1">
              {completed.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-sm min-w-0">
                  <CheckCircle2 size={14} className="text-success shrink-0" />
                  <Link href={`/academy/${e.course_id}`} className="truncate hover:underline flex-1">{e.course?.title || "Course"}</Link>
                  <span className="text-[11px] text-muted num shrink-0">{e.completed_at ? fmtDate(e.completed_at) : ""}{typeof e.score === "number" ? ` · ${e.score}%` : ""}</span>
                </li>
              ))}
              {inProgress.slice(0, 3).map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-sm min-w-0">
                  <BookOpen size={14} className="text-muted shrink-0" />
                  <Link href={`/academy/${e.course_id}`} className="truncate hover:underline flex-1 text-2">{e.course?.title || "Course"}</Link>
                  <span className="text-[11px] text-muted num shrink-0">{e.progress}%</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Goals */}
        <section className="-mx-[var(--s3)]">
          <div className="flex items-center justify-between mb-0.5 px-[var(--s3)]">
            <div className="eyebrow inline-flex items-center gap-1.5"><Target size={11} /> Goals</div>
            <Link href={self ? "/goals?scope=mine" : "/goals"} className="text-[11px] text-muted hover:underline">All goals →</Link>
          </div>
          <PersonGoals userId={person.id} self={self} />
        </section>

        {/* Learning interests — self only (private list) */}
        {self && (
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <div className="eyebrow inline-flex items-center gap-1.5"><Sparkles size={11} /> I want to learn</div>
              <span className="text-[11px] text-muted">Only you see this list</span>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {(interests || []).map((i) => (
                <span key={i.id} className="pill pill-lg tone-violet">{i.topic}<button onClick={() => removeInterest(i.id)} aria-label="Remove"><X size={11} /></button></span>
              ))}
              {addingInterest ? (
                <form onSubmit={addInterest} className="flex items-center gap-1.5">
                  <Input autoFocus value={newInterest} onChange={(e) => setNewInterest(e.target.value)} placeholder="e.g. Public speaking" style={{ height: 28, width: 200 }} />
                  <Button type="submit" size="xs" variant="primary" loading={busy === "interest"}>Add</Button>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setAddingInterest(false)}>Cancel</Button>
                </form>
              ) : (
                <button onClick={() => setAddingInterest(true)} className="pill pill-lg tone-neutral border border-dashed border-[var(--line-strong)] hover:bg-[var(--line)]"><Plus size={11} /> Add</button>
              )}
              {!addingInterest && (interests || []).length === 0 && <span className="text-xs text-muted">Tell GHL what you want to grow into — it helps when courses and mentors are matched.</span>}
            </div>
          </section>
        )}

        {/* Mentorship */}
        <section>
          <div className="flex items-center justify-between mb-1.5">
            <div className="eyebrow inline-flex items-center gap-1.5"><HeartHandshake size={11} /> Mentorship</div>
            {canRequestMentor && <button className="text-[11px] link" onClick={() => setRequesting(true)}>+ Request a mentor</button>}
          </div>
          {loading ? <Skeleton className="h-5 w-1/2" /> : (
            <div className="space-y-2">
              {incoming.length > 0 && (
                <div className="rounded-[var(--radius-sm)] border border-[var(--warn)] tone-warn px-3 py-2 space-y-2">
                  <div className="text-xs font-medium">Requests for you to mentor</div>
                  {incoming.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm flex-wrap">
                      <PersonChip id={m.mentee_id} size={18} />
                      <span className="text-xs">on <span className="font-medium">{m.topic}</span></span>
                      <span className="ml-auto flex items-center gap-1">
                        <Button size="xs" variant="success" loading={busy === m.id} onClick={() => setMentorship(m, "active")}><Check size={12} /> Accept</Button>
                        <Button size="xs" variant="ghost" loading={busy === m.id} onClick={() => setMentorship(m, "declined")}><Ban size={12} /> Decline</Button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {active.length === 0 && pendingOut.length === 0 && incoming.length === 0 ? (
                <div className="text-sm text-muted">{self ? "No mentor yet. Pick someone whose work you admire and ask — most people say yes." : `No active mentorships${canRequestMentor ? " — you can request one for them." : "."}`}</div>
              ) : (
                <ul className="space-y-1">
                  {[...active, ...pendingOut].map((m) => {
                    const isMentor = m.mentor_id === person.id;
                    const party = m.mentor_id === profile.id || m.mentee_id === profile.id;
                    return (
                      <li key={m.id} className="flex items-center gap-2 text-sm min-w-0 flex-wrap">
                        <Pill tone={MENTORSHIP_STATUS_TONE[m.status]}>{MENTORSHIP_STATUS_LABEL[m.status] || m.status}</Pill>
                        <span className="text-xs text-muted">{isMentor ? "Mentoring" : "Mentored by"}</span>
                        <PersonChip id={isMentor ? m.mentee_id : m.mentor_id} size={18} />
                        <span className="text-xs text-muted truncate">· {m.topic}</span>
                        {party && m.status === "active" && <button className="text-[11px] text-muted hover:text-danger ml-auto" onClick={() => setMentorship(m, "ended")}>End</button>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
      {requesting && <RequestMentorModal menteeId={person.id} menteeName={person.full_name} self={self} onClose={() => setRequesting(false)} onDone={() => { setRequesting(false); void load(); }} />}
    </Card>
  );
}

function RequestMentorModal({ menteeId, menteeName, self, onClose, onDone }: { menteeId: string; menteeName: string; self: boolean; onClose: () => void; onDone: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [mentorId, setMentorId] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!mentorId || !topic.trim()) return;
    if (mentorId === menteeId) { toast.push("Pick someone else as the mentor.", "danger"); return; }
    setLoading(true);
    const { error } = await createClient().from("mentorships").insert({ org_id: profile.org_id!, mentor_id: mentorId, mentee_id: menteeId, topic: topic.trim(), requested_by: profile.id });
    setLoading(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Request sent — they have been notified.", "success");
    onDone();
  }
  return (
    <Modal open onClose={onClose} title={self ? "Request a mentor" : `Request a mentor for ${menteeName}`} width={460}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Mentor" hint="Someone with experience in what you want to grow into."><PersonPicker value={mentorId} onChange={setMentorId} placeholder="Pick a mentor" /></Field>
        <Field label="Topic" hint="What do you want help with? One line is enough."><Textarea autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Running client discovery calls with confidence" style={{ minHeight: 80 }} required /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading} disabled={!mentorId || !topic.trim()}><HeartHandshake size={14} /> Send request</Button>
        </div>
      </form>
    </Modal>
  );
}
