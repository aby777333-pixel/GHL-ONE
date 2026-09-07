"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Building2, CalendarDays, Check, ChevronDown, ChevronUp, Plus, Send, Undo2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Pill, Select, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { ago, cn, fmtDate, humanize, isManagerPlus, type Tables } from "@/lib/utils";
import { PersonLine } from "@/components/admin/AdminBits";
import { APPLICATION_STATUSES, APPLICATION_TONE } from "@/components/admin/hr/lib";

export type JobRow = Tables<"job_openings">;
export type ApplicationRow = Tables<"internal_applications">;
export type JobBoardData = { jobs: JobRow[]; applications: ApplicationRow[]; isHr: boolean; userId: string };

export function JobBoard({ data }: { data: JobBoardData }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments } = useSession();
  useSeen("nav:/jobs");
  const manager = isManagerPlus(profile.role);
  const [applying, setApplying] = React.useState<JobRow | null>(null);
  const [posting, setPosting] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const open = data.jobs.filter((j) => j.status === "open");
  const closed = data.jobs.filter((j) => j.status !== "open");
  const mine = data.applications.filter((a) => a.user_id === data.userId);
  const canReview = (j: JobRow) => data.isHr || j.hiring_manager_id === profile.id || j.created_by === profile.id;
  const applicantsFor = (j: JobRow) => data.applications.filter((a) => a.job_id === j.id && (a.user_id !== data.userId || canReview(j)));
  const myApp = (j: JobRow) => mine.find((a) => a.job_id === j.id);

  async function setStatus(a: ApplicationRow, status: string) {
    const { error } = await createClient().from("internal_applications").update({ status }).eq("id", a.id);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(`Application ${humanize(status).toLowerCase()}`, "success");
    router.refresh();
  }
  async function withdraw(a: ApplicationRow) {
    const { error } = await createClient().from("internal_applications").update({ status: "withdrawn" }).eq("id", a.id);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Application withdrawn", "success");
    router.refresh();
  }

  return (
    <div className="page space-y-[var(--s4)] anim-fade-up">
      <PageHeader eyebrow="Careers inside GHL" title="Internal job board" subtitle="Openings you can move into. Applying is confidential to HR and the hiring manager." actions={manager || data.isHr ? <Button size="sm" variant="primary" onClick={() => setPosting(true)}><Plus size={14} /> Post an opening</Button> : undefined} />

      <div className="grid gap-[var(--s4)] lg:grid-cols-[1.618fr_1fr] items-start">
        <div className="space-y-[var(--s4)] min-w-0">
          <Card>
            <CardHeader title="Open positions" subtitle={open.length ? `${open.length} opening${open.length === 1 ? "" : "s"}` : "Nothing open right now."} action={<Briefcase size={15} className="text-muted" />} />
            {open.length === 0 ? (
              <EmptyState icon={<Briefcase size={18} />} title="No internal openings" hint="New postings appear here and in Announcements." className="py-[var(--s4)]" />
            ) : (
              <div className="divide-y border-t">
                {open.map((j) => {
                  const dept = departments.find((d) => d.id === j.department_id);
                  const app = myApp(j);
                  const applicants = applicantsFor(j);
                  const isOpen = expanded === j.id;
                  return (
                    <div key={j.id} className="px-[var(--s4)] py-3">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{j.title}</div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted mt-0.5">
                            {dept && <span className="inline-flex items-center gap-1"><Building2 size={11} /> {dept.name}</span>}
                            {j.hiring_manager_id && <span className="inline-flex items-center gap-1">hiring manager <PersonChip id={j.hiring_manager_id} size={12} /></span>}
                            {j.closes_on && <span className="inline-flex items-center gap-1 num"><CalendarDays size={11} /> closes {fmtDate(j.closes_on)}</span>}
                            <span>· posted {ago(j.created_at)}</span>
                            {canReview(j) && <span className="inline-flex items-center gap-1"><Users size={11} /> {applicants.length} applicant{applicants.length === 1 ? "" : "s"}</span>}
                          </div>
                        </div>
                        {app ? <Pill tone={APPLICATION_TONE[app.status] || "tone-neutral"}>{humanize(app.status)}</Pill> : <Button size="sm" variant="primary" onClick={() => setApplying(j)}><Send size={13} /> Apply</Button>}
                        <Button size="sm" variant="ghost" icon onClick={() => setExpanded(isOpen ? null : j.id)} aria-label={isOpen ? "Collapse" : "Expand"}>{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Button>
                      </div>
                      {isOpen && (
                        <div className="mt-3 space-y-3">
                          {j.description ? <p className="text-sm whitespace-pre-wrap">{j.description}</p> : <p className="text-sm text-muted">No description yet.</p>}
                          {canReview(j) && (
                            <div className="sunken rounded-[var(--radius-sm)] p-3">
                              <div className="eyebrow mb-2">Applicants</div>
                              {applicants.length === 0 ? <div className="text-xs text-muted">Nobody has applied yet.</div> : (
                                <ul className="space-y-2">
                                  {applicants.map((a) => (
                                    <li key={a.id} className="flex flex-wrap items-center gap-2">
                                      <PersonLine id={a.user_id} size={24} sub={<>{ago(a.created_at)}{a.note ? ` · “${a.note}”` : ""}</>} className="flex-1 min-w-[200px]" />
                                      <Select value={a.status} onChange={(e) => setStatus(a, e.target.value)} className={cn("!w-auto !h-8 !text-xs", a.status === "selected" && "text-success", a.status === "rejected" && "text-danger")} disabled={a.status === "withdrawn"}>
                                        {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                                      </Select>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {closed.length > 0 && (
            <Card>
              <CardHeader title="Closed" subtitle="Visible to HR and hiring managers." />
              <div className="divide-y border-t">
                {closed.map((j) => (
                  <div key={j.id} className="flex items-center gap-3 px-[var(--s4)] py-2 text-sm"><span className="truncate flex-1">{j.title}</span><span className="text-[11px] text-muted">{applicantsFor(j).length} applicant{applicantsFor(j).length === 1 ? "" : "s"}</span><Pill tone="tone-muted">Closed</Pill></div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader title="My applications" subtitle={mine.length ? `${mine.length} so far` : "You have not applied to anything."} />
          {mine.length === 0 ? (
            <EmptyState title="Nothing yet" hint="Apply to an opening and follow its status here." className="py-[var(--s4)]" />
          ) : (
            <div className="divide-y border-t">
              {mine.map((a) => {
                const j = data.jobs.find((x) => x.id === a.job_id);
                return (
                  <div key={a.id} className="px-[var(--s4)] py-2.5 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{j?.title || "Opening"}</div>
                      <div className="text-[11px] text-muted">Applied {fmtDate(a.created_at)}{a.note ? ` · ${a.note}` : ""}</div>
                    </div>
                    <Pill tone={APPLICATION_TONE[a.status] || "tone-neutral"}>{humanize(a.status)}</Pill>
                    {(a.status === "applied" || a.status === "shortlisted") && <Button size="xs" variant="ghost" icon onClick={() => withdraw(a)} aria-label="Withdraw" title="Withdraw"><Undo2 size={12} /></Button>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {applying && <ApplyModal key={applying.id} job={applying} onClose={() => setApplying(null)} />}
      <PostJobModal open={posting} onClose={() => setPosting(false)} />
    </div>
  );
}

function ApplyModal({ job, onClose }: { job: JobRow; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function apply() {
    setBusy(true);
    const { error } = await createClient().from("internal_applications").insert({ job_id: job.id, user_id: profile.id, note: note.trim() || null });
    setBusy(false);
    if (error) { toast.push(error.message.includes("duplicate") ? "You already applied to this opening" : error.message, "danger"); return; }
    toast.push(`Applied for ${job.title}`, "success");
    onClose();
    router.refresh();
  }
  return (
    <Modal open onClose={onClose} title={`Apply · ${job.title}`} width={480} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={apply}><Send size={15} /> Apply</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-muted">Only HR and the hiring manager see your application. Your current manager is not notified automatically.</p>
        <Field label="Why this role?"><Textarea rows={5} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Relevant experience, what you would bring, earliest start." autoFocus /></Field>
      </div>
    </Modal>
  );
}

function PostJobModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [title, setTitle] = React.useState("");
  const [dept, setDept] = React.useState(profile.department_id || "");
  const [manager, setManager] = React.useState(profile.id);
  const [description, setDescription] = React.useState("");
  const [closes, setCloses] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function post() {
    if (!profile.org_id || !title.trim()) return;
    setBusy(true);
    const { error } = await createClient().from("job_openings").insert({ org_id: profile.org_id, title: title.trim(), department_id: dept || null, hiring_manager_id: manager || null, description: description.trim() || null, closes_on: closes || null, internal: true, external: false, created_by: profile.id });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Opening posted", "success");
    setTitle(""); setDescription(""); setCloses("");
    onClose();
    router.refresh();
  }
  return (
    <Modal open={open} onClose={onClose} title="Post an internal opening" width={540} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!title.trim()} onClick={post}><Check size={15} /> Post</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Title" className="sm:col-span-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
        <Field label="Department"><DepartmentPicker value={dept} onChange={setDept} placeholder="Any" /></Field>
        <Field label="Hiring manager"><PersonPicker value={manager} onChange={setManager} placeholder="HR" /></Field>
        <Field label="Closes on" className="sm:col-span-2"><Input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the role does, what you are looking for, how the move works." /></Field>
      </div>
    </Modal>
  );
}
