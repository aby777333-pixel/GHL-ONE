"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Briefcase, CalendarPlus, Check, ExternalLink, FileUp, GripVertical, Mail, Pencil, Phone, Plus, Star, UserPlus, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { ago, cn, fmtDate, humanize, isAdminRole, ROLE_LABEL, type RoleLevel } from "@/lib/utils";
import { uploadFile } from "@/components/files/storage";
import { fromLocalInput, Note, toLocalInput } from "../AdminBits";
import { hasPerm } from "../perms";
import { openHrDocument } from "./Documents";
import { asStage, CANDIDATE_SOURCES, CANDIDATE_STAGES, INTERVIEW_KINDS, parseScores, safeName, STAGE_DOT, STAGE_LABEL, type Candidate, type CandidateStage, type HrData, type Interview, type JobOpening } from "./lib";

const ROLES: RoleLevel[] = ["director", "executive", "department_head", "manager", "team_lead", "employee", "intern", "consultant", "vendor", "guest"];

export function RecruitmentView({ data, perms }: { data: HrData; perms: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments } = useSession();
  const isHr = isAdminRole(profile.role) || hasPerm(perms, "hr.manage", "people.manage");
  const [jobFilter, setJobFilter] = React.useState("");
  const [jobModal, setJobModal] = React.useState<JobOpening | "new" | null>(null);
  const [addCand, setAddCand] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Candidate[]>(data.candidates);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<CandidateStage | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setRows(data.candidates), 0);
    return () => clearTimeout(t);
  }, [data.candidates]);

  const jobs = data.jobs.filter((j) => j.external);
  const openJobs = jobs.filter((j) => j.status === "open");
  /* "pool" is the deliberate no-opening bucket, so unassigned candidates can be found and given one
     rather than sitting invisibly among everyone else. */
  const visible = rows.filter((c) => !jobFilter || (jobFilter === "pool" ? !c.job_id : c.job_id === jobFilter));
  const byStage = React.useMemo(() => {
    const m = new Map<CandidateStage, Candidate[]>();
    for (const s of CANDIDATE_STAGES) m.set(s, []);
    for (const c of visible) m.get(asStage(c.stage))?.push(c);
    return m;
  }, [visible]);
  const current = open ? rows.find((c) => c.id === open) || null : null;

  async function move(id: string, stage: CandidateStage) {
    const c = rows.find((x) => x.id === id);
    if (!c || c.stage === stage) return;
    if (stage === "hired") { toast.push("Use “Hire” on the candidate to create the employee record.", "info"); setOpen(id); return; }
    setRows((rs) => rs.map((x) => (x.id === id ? { ...x, stage } : x)));
    const { error } = await createClient().from("candidates").update({ stage }).eq("id", id);
    if (error) { setRows((rs) => rs.map((x) => (x.id === id ? { ...x, stage: c.stage } : x))); toast.push(error.message, "danger"); return; }
    router.refresh();
  }
  function drop(stage: CandidateStage) {
    if (dragging) void move(dragging, stage);
    setDragging(null);
    setOverCol(null);
  }

  async function closeJob(j: JobOpening) {
    const { error } = await createClient().from("job_openings").update({ status: j.status === "open" ? "closed" : "open" }).eq("id", j.id);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(j.status === "open" ? "Opening closed" : "Opening reopened", "success");
    router.refresh();
  }

  return (
    <div className="space-y-[var(--s4)]">
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><Briefcase size={16} className="text-[var(--brand)]" /> External openings</span>} subtitle="Roles you are hiring for from outside. Internal postings live on the job board." action={<Button size="sm" variant="primary" onClick={() => setJobModal("new")}><Plus size={14} /> <span className="hidden sm:inline">New opening</span></Button>} />
        {jobs.length === 0 ? (
          <EmptyState icon={<Briefcase size={18} />} title="No external openings" hint="Create one to start collecting candidates." className="py-[var(--s4)]" />
        ) : (
          <div className="divide-y border-t">
            {jobs.map((j) => {
              const n = rows.filter((c) => c.job_id === j.id && c.stage !== "rejected" && c.stage !== "hired").length;
              return (
                <div key={j.id} className="flex flex-wrap items-center gap-3 px-[var(--s4)] py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{j.title}</div>
                    <div className="text-[11px] text-muted truncate">{departments.find((d) => d.id === j.department_id)?.name || "Any department"}{j.hiring_manager_id && <> · hiring manager <PersonChip id={j.hiring_manager_id} size={12} /></>}{j.closes_on ? ` · closes ${fmtDate(j.closes_on)}` : ""} · {n} active candidate{n === 1 ? "" : "s"}</div>
                  </div>
                  <Pill tone={j.status === "open" ? "tone-success" : "tone-muted"}>{humanize(j.status)}</Pill>
                  <Button size="xs" variant="ghost" onClick={() => setJobFilter(jobFilter === j.id ? "" : j.id)}>{jobFilter === j.id ? "Show all" : "Pipeline"}</Button>
                  <Button size="xs" variant="ghost" icon onClick={() => setJobModal(j)} aria-label="Edit"><Pencil size={12} /></Button>
                  <Button size="xs" variant="ghost" onClick={() => closeJob(j)}>{j.status === "open" ? "Close" : "Reopen"}</Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} className="!w-auto"><option value="">All openings</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}<option value="pool">Talent pool — no opening ({rows.filter((c) => !c.job_id).length})</option></Select>
        <span className="text-xs text-muted">Drag a card to move it through the pipeline.</span>
        <Button size="sm" variant="primary" className="ml-auto" onClick={() => setAddCand(true)}><UserPlus size={14} /> Add candidate</Button>
      </div>

      <div className="overflow-x-auto -mx-[var(--s4)] px-[var(--s4)] pb-2">
        <div className="flex gap-3 min-w-max">
          {CANDIDATE_STAGES.map((s) => {
            const list = byStage.get(s) || [];
            return (
              <div key={s} className={cn("w-[250px] shrink-0 rounded-[var(--radius)] sunken flex flex-col max-h-[calc(100dvh-300px)] min-h-[180px] transition-colors", overCol === s && dragging && "ring-2 ring-[var(--brand-2)]")}
                onDragOver={(e) => { e.preventDefault(); if (overCol !== s) setOverCol(s); }}
                onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOverCol(null); }}
                onDrop={(e) => { e.preventDefault(); drop(s); }}>
                <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0"><span className="w-2 h-2 rounded-full" style={{ background: STAGE_DOT[s] }} /><span className="text-sm font-medium">{STAGE_LABEL[s]}</span><span className="ml-auto text-xs text-muted num">{list.length}</span></div>
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                  {list.length === 0 && <div className="text-[11px] text-muted text-center py-6 border border-dashed rounded-[var(--radius-sm)]">Drop here</div>}
                  {list.map((c) => (
                    <div key={c.id} draggable onDragStart={(e) => { setDragging(c.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); }} onDragEnd={() => { setDragging(null); setOverCol(null); }} onClick={() => setOpen(c.id)}
                      className={cn("card card-hover p-2.5 select-none cursor-grab active:cursor-grabbing", dragging === c.id && "opacity-50")}>
                      <div className="flex items-start gap-1.5">
                        <GripVertical size={13} className="text-muted mt-0.5 shrink-0 hidden sm:block" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium leading-snug truncate">{c.full_name}</div>
                          <div className="text-[11px] text-muted truncate">{jobs.find((j) => j.id === c.job_id)?.title || "Talent pool · no opening"}{c.source ? ` · ${humanize(c.source)}` : ""}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2">
                        <Stars value={c.rating} size={11} />
                        <span className="text-[11px] text-muted ml-auto">{ago(c.updated_at)}</span>
                        {c.owner_id && <PersonChip id={c.owner_id} showName={false} size={18} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {jobModal && <JobModal key={jobModal === "new" ? "new" : jobModal.id} job={jobModal === "new" ? null : jobModal} onClose={() => setJobModal(null)} />}
      <AddCandidateModal open={addCand} jobs={openJobs} defaultJob={jobFilter} onClose={() => setAddCand(false)} />
      {current && <CandidateDrawer key={current.id} candidate={current} jobs={jobs} interviews={data.interviews.filter((i) => i.candidate_id === current.id)} isHr={isHr} onClose={() => setOpen(null)} onChange={(c) => setRows((rs) => rs.map((x) => (x.id === c.id ? c : x)))} />}
    </div>
  );
}

function Stars({ value, size = 12, onChange }: { value: number | null; size?: number; onChange?: (v: number | null) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(value === n ? null : n)} className={cn("leading-none", onChange ? "cursor-pointer" : "cursor-default")} aria-label={`${n} star${n > 1 ? "s" : ""}`}>
          <Star size={size} className={value != null && n <= value ? "text-warn fill-[var(--warn)]" : "text-[var(--line-strong)]"} />
        </button>
      ))}
    </span>
  );
}

/* --------------------------------------------------------------- Job */
function JobModal({ job, onClose }: { job: JobOpening | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [title, setTitle] = React.useState(job?.title || "");
  const [dept, setDept] = React.useState(job?.department_id || "");
  const [manager, setManager] = React.useState(job?.hiring_manager_id || "");
  const [description, setDescription] = React.useState(job?.description || "");
  const [closes, setCloses] = React.useState(job?.closes_on || "");
  const [internal, setInternal] = React.useState(job?.internal ?? false);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (!profile.org_id || !title.trim()) return;
    setBusy(true);
    const payload = { title: title.trim(), department_id: dept || null, hiring_manager_id: manager || null, description: description.trim() || null, closes_on: closes || null, internal, external: true };
    const supabase = createClient();
    const { error } = job ? await supabase.from("job_openings").update(payload).eq("id", job.id) : await supabase.from("job_openings").insert({ ...payload, org_id: profile.org_id, created_by: profile.id });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(job ? "Opening updated" : "Opening created", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={job ? `Edit · ${job.title}` : "New external opening"} width={540} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!title.trim()} onClick={save}><Check size={15} /> Save</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Title" className="sm:col-span-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
        <Field label="Department"><DepartmentPicker value={dept} onChange={setDept} placeholder="Any" /></Field>
        {/* Every employee — interns and consultants included — used to be offered as hiring manager.
            Managers and above only, with the opening's own department at the top of the list. */}
        <Field label="Hiring manager" hint="Team leads and above"><PersonPicker value={manager} onChange={setManager} placeholder="HR" minRole="team_lead" preferDepartmentId={dept || null} /></Field>
        <Field label="Closes on"><Input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-[var(--brand)]" /> Also post on the internal job board</label>
        <Field label="Description" className="sm:col-span-2"><Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Responsibilities, must-haves, location, compensation band…" /></Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------- Add candidate */
function AddCandidateModal({ open, jobs, defaultJob, onClose }: { open: boolean; jobs: JobOpening[]; defaultJob?: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [source, setSource] = React.useState("referral");
  const [referredBy, setReferredBy] = React.useState("");
  const [jobId, setJobId] = React.useState(defaultJob || "");
  const [owner, setOwner] = React.useState(profile.id);
  const [busy, setBusy] = React.useState(false);
  const openJobs = jobs.filter((j) => j.status === "open");

  async function add() {
    if (!profile.org_id || !name.trim()) return;
    setBusy(true);
    // The referrer only belongs on a referral; switching the source afterwards must not leave a
    // stale name attached to a candidate who came in through a job board.
    const { error } = await createClient().from("candidates").insert({ org_id: profile.org_id, full_name: name.trim(), email: email.trim().toLowerCase() || null, phone: phone.trim() || null, source, referred_by: source === "referral" ? referredBy || null : null, job_id: jobId || null, owner_id: owner || null });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`${name.trim()} added as applicant`, "success");
    setName(""); setEmail(""); setPhone("");
    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add candidate" width={500} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!name.trim()} onClick={add}><UserPlus size={15} /> Add</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Full name" className="sm:col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Email" hint="Needed to hire — becomes the invite email."><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Source"><Select value={source} onChange={(e) => setSource(e.target.value)}>{CANDIDATE_SOURCES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
        {/* "Referral" recorded that someone had referred them but never who, so there was nobody to
            follow up with or thank. The field appears with the source that needs it. */}
        {source === "referral" ? (
          <Field label="Referred by" hint="Who put this candidate forward"><PersonPicker value={referredBy} onChange={setReferredBy} placeholder="Not recorded" /></Field>
        ) : <span className="hidden sm:block" aria-hidden />}
        {/*
          A candidate with no opening is a talent-pool entry, not an application to a role that does
          not exist. Say which one this is, and let the drawer's Opening field assign them later.
        */}
        <Field label="Opening" hint={jobId ? undefined : openJobs.length ? "Leave empty to add them to the talent pool" : "No openings are accepting candidates — they go to the talent pool"}>
          <Select value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">No opening — talent pool</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.status !== "open" ? " (closed)" : ""}</option>)}
          </Select>
        </Field>
        <Field label="Owner" className="sm:col-span-2"><PersonPicker value={owner} onChange={setOwner} placeholder="Unowned" /></Field>
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------- Candidate drawer */
function CandidateDrawer({ candidate, jobs, interviews, isHr, onClose, onChange }: { candidate: Candidate; jobs: JobOpening[]; interviews: Interview[]; isHr: boolean; onClose: () => void; onChange: (c: Candidate) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [c, setC] = React.useState(candidate);
  const [rows, setRows] = React.useState(interviews);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [schedule, setSchedule] = React.useState(false);
  const [hire, setHire] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const patch = (p: Partial<Candidate>) => { setC((s) => ({ ...s, ...p })); setDirty(true); };
  const job = jobs.find((j) => j.id === c.job_id);

  async function save() {
    setBusy(true);
    const { error } = await createClient().from("candidates").update({ full_name: c.full_name.trim(), email: c.email?.trim().toLowerCase() || null, phone: c.phone?.trim() || null, source: c.source || null, rating: c.rating, notes: c.notes?.trim() || null, owner_id: c.owner_id, job_id: c.job_id, stage: c.stage }).eq("id", c.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setDirty(false);
    onChange(c);
    toast.push("Candidate saved", "success");
    router.refresh();
  }

  async function uploadResume(f: File) {
    if (f.size > 15 * 1024 * 1024) { toast.push("Resume must be under 15 MB", "danger"); return; }
    setUploading(true);
    const supabase = createClient();
    const path = `candidates/${c.id}/${crypto.randomUUID()}-${safeName(f.name)}`;
    const up = await uploadFile(supabase, { bucket: "hr", path, file: f });
    if (up.error) { setUploading(false); toast.push(up.error, "danger"); return; }
    const { error } = await supabase.from("candidates").update({ resume_path: path }).eq("id", c.id);
    setUploading(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setC((s) => ({ ...s, resume_path: path }));
    onChange({ ...c, resume_path: path });
    toast.push("Resume uploaded", "success");
  }

  async function setDecision(i: Interview, decision: string) {
    const { error } = await createClient().from("interviews").update({ decision: decision || null }).eq("id", i.id);
    if (error) { toast.push(error.message, "danger"); return; }
    setRows((rs) => rs.map((x) => (x.id === i.id ? { ...x, decision: decision || null } : x)));
  }
  async function setScore(i: Interview, userId: string, score: number | null, note: string) {
    const scores = { ...parseScores(i.scores), [userId]: { score, note } };
    const { error } = await createClient().from("interviews").update({ scores }).eq("id", i.id);
    if (error) { toast.push(error.message, "danger"); return; }
    setRows((rs) => rs.map((x) => (x.id === i.id ? { ...x, scores } : x)));
  }

  const canHire = isHr && c.stage !== "hired" && !!c.email;

  return (
    <Modal open onClose={onClose} side width={640} title={<span className="inline-flex items-center gap-2"><Users size={16} className="text-[var(--brand)]" /> {candidate.full_name}</span>}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button>{c.stage !== "hired" && <Button variant="success" disabled={!canHire} title={!c.email ? "Add an email first" : !isHr ? "HR hires" : undefined} onClick={() => setHire(true)}><UserPlus size={15} /> Hire</Button>}<Button variant="primary" loading={busy} disabled={!dirty} onClick={save}><Check size={15} /> Save</Button></>}>
      <div className="space-y-[var(--s4)]">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="tone-neutral"><span className="w-2 h-2 rounded-full inline-block" style={{ background: STAGE_DOT[asStage(c.stage)] }} /> {STAGE_LABEL[asStage(c.stage)]}</Pill>
          <Select value={c.stage} onChange={(e) => patch({ stage: e.target.value })} className="!w-auto !h-8 !text-xs" disabled={c.stage === "hired"}>{CANDIDATE_STAGES.filter((s) => s !== "hired").map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}{c.stage === "hired" && <option value="hired">Hired</option>}</Select>
          <span className="ml-auto"><Stars value={c.rating} size={16} onChange={(v) => patch({ rating: v })} /></span>
        </div>
        {c.stage === "hired" && <Note tone="success">Hired{c.hired_profile_id ? " — the employee record is live." : ". An invite was created; the record completes itself when they sign in."}</Note>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full name" className="sm:col-span-2"><Input value={c.full_name} onChange={(e) => patch({ full_name: e.target.value })} /></Field>
          <Field label="Email"><div className="relative"><Mail size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><Input type="email" value={c.email || ""} onChange={(e) => patch({ email: e.target.value })} className="pl-8" /></div></Field>
          <Field label="Phone"><div className="relative"><Phone size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><Input value={c.phone || ""} onChange={(e) => patch({ phone: e.target.value })} className="pl-8" /></div></Field>
          <Field label="Source"><Select value={c.source || ""} onChange={(e) => patch({ source: e.target.value || null })}><option value="">Unknown</option>{CANDIDATE_SOURCES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
          {/* Assigning an opening later is the workflow for a talent-pool candidate — this is it. */}
          <Field label="Opening" hint={c.job_id ? undefined : "In the talent pool. Pick an opening to move them into that pipeline."}><Select value={c.job_id || ""} onChange={(e) => patch({ job_id: e.target.value || null })}><option value="">No opening — talent pool</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.status !== "open" ? " (closed)" : ""}</option>)}</Select></Field>
          {c.source === "referral" && <Field label="Referred by" className="sm:col-span-2" hint="Who put this candidate forward"><PersonPicker value={c.referred_by} onChange={(v) => patch({ referred_by: v || null })} placeholder="Not recorded" /></Field>}
          <Field label="Owner" className="sm:col-span-2"><PersonPicker value={c.owner_id} onChange={(v) => patch({ owner_id: v || null })} placeholder="Unowned" /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={4} value={c.notes || ""} onChange={(e) => patch({ notes: e.target.value })} placeholder="Screening notes, expectations, availability…" /></Field>
        </div>

        <section className="space-y-2">
          <div className="eyebrow">Resume</div>
          <div className="flex flex-wrap items-center gap-2">
            {c.resume_path ? <Button size="sm" onClick={async () => { if (!(await openHrDocument(c.resume_path!))) toast.push("Could not open the resume", "danger"); }}><ExternalLink size={13} /> Open resume</Button> : <span className="text-xs text-muted">No resume yet.</span>}
            <label className="btn btn-secondary btn-sm cursor-pointer"><FileUp size={13} /> {uploading ? "Uploading…" : c.resume_path ? "Replace" : "Upload"}<input type="file" className="hidden" accept=".pdf,.doc,.docx,image/*" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadResume(f); e.target.value = ""; }} /></label>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between"><div className="eyebrow">Interviews · {rows.length}</div><Button size="sm" onClick={() => setSchedule(true)}><CalendarPlus size={13} /> Schedule</Button></div>
          {rows.length === 0 && <div className="text-xs text-muted">Nothing scheduled.</div>}
          <ul className="space-y-2">
            {[...rows].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).map((i) => (
              <InterviewCard key={i.id} i={i} isHr={isHr} me={profile.id} onDecision={(d) => setDecision(i, d)} onScore={(u, s, n) => setScore(i, u, s, n)} />
            ))}
          </ul>
        </section>

        {schedule && <ScheduleModal candidate={c} onClose={() => setSchedule(false)} onCreated={(i) => setRows((rs) => [...rs, i])} />}
        {hire && <HireModal candidate={c} job={job || null} onClose={() => setHire(false)} onHired={() => { setC((s) => ({ ...s, stage: "hired" })); onChange({ ...c, stage: "hired" }); }} />}
      </div>
    </Modal>
  );
}

function InterviewCard({ i, isHr, me, onDecision, onScore }: { i: Interview; isHr: boolean; me: string; onDecision: (d: string) => void; onScore: (userId: string, score: number | null, note: string) => void }) {
  const scores = parseScores(i.scores);
  const [notes, setNotes] = React.useState<Record<string, string>>(() => Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v.note])));
  const [now] = React.useState(() => Date.now());
  const past = new Date(i.scheduled_at).getTime() < now;
  const avg = Object.values(scores).map((s) => s.score).filter((s): s is number => s != null);
  return (
    <li className="card p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium capitalize">{humanize(i.kind)}</span>
        <span className={cn("text-xs num", past ? "text-muted" : "text-2")}>{fmtDate(i.scheduled_at, true)}</span>
        {i.meeting_link && <a href={i.meeting_link} target="_blank" rel="noopener noreferrer" className="link text-xs inline-flex items-center gap-1">Join <ExternalLink size={10} /></a>}
        <span className="ml-auto flex items-center gap-2">
          {avg.length > 0 && <Pill tone="tone-neutral"><Star size={10} /> {(avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(1)}</Pill>}
          {isHr || i.created_by === me || i.panel.includes(me) ? (
            <Select value={i.decision || ""} onChange={(e) => onDecision(e.target.value)} className={cn("!w-auto !h-7 !text-xs", i.decision === "advance" && "text-success", i.decision === "reject" && "text-danger")}>
              <option value="">Decision…</option><option value="advance">Advance</option><option value="hold">Hold</option><option value="reject">Reject</option>
            </Select>
          ) : i.decision ? <Pill tone={i.decision === "advance" ? "tone-success" : i.decision === "reject" ? "tone-danger" : "tone-warn"}>{humanize(i.decision)}</Pill> : null}
        </span>
      </div>
      {i.notes && <div className="text-xs text-muted whitespace-pre-wrap">{i.notes}</div>}
      <div className="space-y-1.5">
        {i.panel.length === 0 && <div className="text-[11px] text-muted">No panel.</div>}
        {i.panel.map((u) => {
          const mine = u === me;
          const editable = mine || isHr;
          const s = scores[u];
          return (
            <div key={u} className="flex flex-wrap items-center gap-2">
              <PersonChip id={u} size={18} className="min-w-[140px]" />
              <Stars value={s?.score ?? null} size={13} onChange={editable ? (v) => onScore(u, v, notes[u] || "") : undefined} />
              {editable ? (
                <Input value={notes[u] || ""} onChange={(e) => setNotes((n) => ({ ...n, [u]: e.target.value }))} onBlur={() => { if ((notes[u] || "") !== (s?.note || "")) onScore(u, s?.score ?? null, notes[u] || ""); }} placeholder="Feedback" className="!h-7 !text-xs flex-1 min-w-[140px]" />
              ) : (
                <span className="text-xs text-muted flex-1 min-w-0 truncate">{s?.note || (s?.score != null ? "" : "No feedback yet")}</span>
              )}
            </div>
          );
        })}
      </div>
    </li>
  );
}

function ScheduleModal({ candidate, onClose, onCreated }: { candidate: Candidate; onClose: () => void; onCreated: (i: Interview) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, people } = useSession();
  const [kind, setKind] = React.useState("interview");
  const [when, setWhen] = React.useState("");
  const [panel, setPanel] = React.useState<string[]>([]);
  const [pick, setPick] = React.useState("");
  const [link, setLink] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [minWhen] = React.useState(() => toLocalInput(new Date().toISOString()));

  async function create() {
    const iso = fromLocalInput(when);
    if (!iso) return;
    setBusy(true);
    const { data, error } = await createClient().from("interviews").insert({ candidate_id: candidate.id, kind, scheduled_at: iso, panel, meeting_link: link.trim() || null, notes: notes.trim() || null, created_by: profile.id }).select("*").single();
    setBusy(false);
    if (error || !data) { toast.push(error?.message || "Could not schedule", "danger"); return; }
    toast.push("Interview scheduled", "success");
    onCreated(data);
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={`Schedule · ${candidate.full_name}`} width={500} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!when} onClick={create}><CalendarPlus size={15} /> Schedule</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Kind"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{INTERVIEW_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</Select></Field>
          <Field label="When"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} min={minWhen} /></Field>
          <Field label="Meeting link" className="sm:col-span-2"><Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet…" /></Field>
        </div>
        <div>
          <span className="label">Panel</span>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {panel.map((u) => <span key={u} className="pill tone-neutral"><PersonChip id={u} size={14} /><button type="button" onClick={() => setPanel((p) => p.filter((x) => x !== u))} aria-label="Remove"><X size={10} /></button></span>)}
            {panel.length === 0 && <span className="text-xs text-muted">Nobody yet.</span>}
          </div>
          <div className="flex items-center gap-2">
            <PersonPicker value={pick} onChange={setPick} placeholder="Add a panel member…" />
            <Button size="sm" disabled={!pick || panel.includes(pick)} onClick={() => { if (pick && people.some((p) => p.id === pick)) setPanel((p) => [...p, pick]); setPick(""); }}><Plus size={13} /></Button>
          </div>
        </div>
        <Field label="Notes for the panel"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What to assess, format, duration." /></Field>
        <Note tone="info">Panel members can see this candidate and record their score and feedback from here.</Note>
      </div>
    </Modal>
  );
}

function HireModal({ candidate, job, onClose, onHired }: { candidate: Candidate; job: JobOpening | null; onClose: () => void; onHired: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [role, setRole] = React.useState<RoleLevel>("employee");
  const [designation, setDesignation] = React.useState(job?.title || "");
  const [manager, setManager] = React.useState(job?.hiring_manager_id || "");
  const [dept, setDept] = React.useState(job?.department_id || "");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);

  async function hire() {
    setBusy(true);
    const { error } = await createClient().rpc("hire_candidate", { p_candidate: candidate.id, p_role: role, p_designation: designation.trim() || undefined, p_manager: manager || undefined, p_department: dept || undefined });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setDone(true);
    onHired();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={`Hire ${candidate.full_name}`} width={500} footer={done ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="success" loading={busy} onClick={hire}><UserPlus size={15} /> Create invite</Button></>}>
      {done ? (
        <div className="space-y-3">
          <Note tone="success">Invite created for <strong>{candidate.email}</strong>.</Note>
          <p className="text-sm text-muted">The candidate record becomes the employee record on first login — no re-entry. When they sign in with this email the account activates with the role, department, designation and manager below, an employee code is assigned and onboarding starts.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Role"><Select value={role} onChange={(e) => setRole(e.target.value as RoleLevel)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
            <Field label="Designation"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></Field>
            <Field label="Department"><DepartmentPicker value={dept} onChange={setDept} placeholder={job?.department_id ? "From the opening" : "None"} /></Field>
            <Field label="Reports to" hint="Team leads and above"><PersonPicker value={manager} onChange={setManager} placeholder="No manager" minRole="team_lead" preferDepartmentId={dept || null} /></Field>
          </div>
          <Note tone="info">An invite is created for <strong>{candidate.email}</strong>. Share the sign-in link with them; nothing else needs typing again.</Note>
        </div>
      )}
    </Modal>
  );
}
