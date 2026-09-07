"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, Check, CheckSquare, Diamond, ExternalLink, Gavel, MessageSquare, Plus, ShieldCheck, Trash2, UserPlus, Video, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, EmptyState, Field, Input, Pill, Select, Textarea, useToast } from "@/components/ui";
import { PersonPicker, PriorityPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip, PriorityPill } from "@/components/tasks/TaskBits";
import { AttachmentList, AttachmentUploader, type FileWithVersions } from "@/components/tasks/AttachmentUploader";
import type { TaskLite } from "@/components/tasks/TaskListView";
import { humaniseAudit } from "@/components/projects/humanise";
import { ago, cn, fmtDate, humanize, isLeadPlus, isManagerPlus, relDate, APPROVAL_STATUS_LABEL, APPROVAL_STATUS_TONE, APPROVAL_TYPES, type ApprovalType, type Project, type Tables, type TaskPriority } from "@/lib/utils";

/* ------------------------------------------------------------------ Team */
export function TeamPanel({ project, members, tasks }: { project: Project; members: { user_id: string; role: string; added_at: string }[]; tasks: TaskLite[] }) {
  const { profile, people, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = React.useState("");
  const canManage = isManagerPlus(profile.role) || members.some((m) => m.user_id === profile.id) || project.owner_id === profile.id;

  const load = (uid: string) => {
    const mine = tasks.filter((t) => t.assignee_id === uid && t.status !== "done" && t.status !== "cancelled");
    return { open: mine.length, overdue: mine.filter((t) => t.due_date && new Date(t.due_date) < new Date()).length };
  };

  async function add(id: string) {
    if (!id) return;
    setAdding("");
    const { error } = await createClient().from("project_members").insert({ project_id: project.id, user_id: id, role: "member" });
    if (error) return toast.push(error.message, "danger");
    toast.push("Member added — they also joined the project channel", "success");
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("Remove this member from the project?")) return;
    const { error } = await createClient().from("project_members").delete().eq("project_id", project.id).eq("user_id", id);
    if (error) return toast.push(error.message, "danger");
    toast.push("Member removed", "success");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="card p-3 flex items-center gap-2">
          <UserPlus size={15} className="text-muted shrink-0" />
          <PersonPicker value={adding} onChange={add} placeholder="Add a team member…" />
        </div>
      )}
      {members.length === 0 ? (
        <div className="card"><EmptyState icon={<UserPlus size={18} />} title="No members yet" hint="Add the people who work on this project. They get the project channel automatically." /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 stagger">
          {members.map((m) => {
            const p = people.find((x) => x.id === m.user_id);
            const d = departments.find((x) => x.id === p?.department_id);
            const w = load(m.user_id);
            return (
              <div key={m.user_id} className="card p-3 flex items-center gap-3 group">
                <Avatar name={p?.full_name || "?"} src={p?.avatar_url} size={40} presence={p?.presence} />
                <div className="min-w-0 flex-1">
                  <Link href={`/people/${m.user_id}`} className="text-sm font-medium truncate block hover:underline">{p?.full_name || "Unknown"}</Link>
                  <div className="text-[11px] text-muted truncate">{p?.designation || d?.name || ""}{m.role !== "member" ? ` · ${humanize(m.role)}` : ""}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="pill tone-neutral num">{w.open} open</span>
                    {w.overdue > 0 && <span className="pill tone-danger num">{w.overdue} overdue</span>}
                  </div>
                </div>
                {canManage && m.user_id !== project.owner_id && (
                  <button className="opacity-0 group-hover:opacity-100 text-muted hover:text-[var(--danger)]" onClick={() => remove(m.user_id)} aria-label="Remove"><X size={15} /></button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Milestones */
export function MilestonesPanel({ project, milestones, tasks }: { project: Project; milestones: Tables<"milestones">[]; tasks: TaskLite[] }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [due, setDue] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await createClient().from("milestones").insert({ project_id: project.id, title: title.trim(), due_date: due || null, position: milestones.length });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    setTitle(""); setDue("");
    toast.push("Milestone added to the calendar", "success");
    router.refresh();
  }
  async function toggle(m: Tables<"milestones">) {
    const { error } = await createClient().from("milestones").update({ completed_at: m.completed_at ? null : new Date().toISOString() }).eq("id", m.id);
    if (error) return toast.push(error.message, "danger");
    toast.push(m.completed_at ? "Milestone reopened" : "Milestone completed", "success");
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this milestone?")) return;
    const { error } = await createClient().from("milestones").delete().eq("id", id);
    if (error) return toast.push(error.message, "danger");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="card p-3 grid grid-cols-[1fr_auto_auto] gap-2 items-end">
        <Field label="New milestone"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Design signed off" /></Field>
        <Field label="Due"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Button type="submit" variant="primary" loading={busy} disabled={!title.trim()}><Plus size={14} /><span className="hidden sm:inline">Add</span></Button>
      </form>
      {milestones.length === 0 ? (
        <div className="card"><EmptyState icon={<Diamond size={18} />} title="No milestones" hint="Milestones mark the moments that matter — sign-offs, launches, deliveries. They appear on the timeline and company calendar." /></div>
      ) : (
        <ol className="card divide-y">
          {milestones.map((m) => {
            const late = !m.completed_at && m.due_date && new Date(m.due_date) < new Date();
            const linked = tasks.filter((t) => t.milestone_id === m.id);
            return (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5 group">
                <button onClick={() => toggle(m)} className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0", m.completed_at ? "bg-[var(--success)] border-[var(--success)] text-white" : "border-[var(--line-strong)] hover:border-[var(--success)]")} aria-label="Toggle complete">{m.completed_at && <Check size={13} />}</button>
                <Diamond size={14} className={m.completed_at ? "text-[var(--success)]" : late ? "text-[var(--danger)]" : "text-[var(--accent)]"} fill="currentColor" />
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm", m.completed_at && "line-through text-muted")}>{m.title}</div>
                  {m.description && <div className="text-xs text-muted truncate">{m.description}</div>}
                  {linked.length > 0 && <div className="text-[11px] text-muted num">{linked.filter((t) => t.status === "done").length}/{linked.length} linked tasks done</div>}
                </div>
                <span className={cn("text-xs num", late ? "text-danger" : "text-muted")}>{m.due_date ? relDate(m.due_date) : "No date"}</span>
                <button onClick={() => remove(m.id)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-[var(--danger)]" aria-label="Delete"><Trash2 size={14} /></button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Chat */
export function ChatPanel({ channelId, projectName }: { channelId: string | null; projectName: string }) {
  const { people } = useSession();
  const [msgs, setMsgs] = React.useState<{ id: string; body: string; author_id: string | null; created_at: string; kind: string }[] | null>(channelId ? null : []);
  React.useEffect(() => {
    if (!channelId) return;
    let alive = true;
    createClient().from("messages").select("id,body,author_id,created_at,kind").eq("channel_id", channelId).is("deleted_at", null).is("parent_id", null).order("created_at", { ascending: false }).limit(5)
      .then(({ data }) => alive && setMsgs((data || []).reverse()));
    return () => { alive = false; };
  }, [channelId]);

  if (!channelId) return <div className="card"><EmptyState icon={<MessageSquare size={18} />} title="No project channel" hint="Project channels are created automatically with the project. Ask an admin if this one is missing." /></div>;
  return (
    <div className="space-y-3">
      <Link href={`/chat/${channelId}`} className="card card-hover p-[var(--s4)] flex items-center gap-3">
        <span className="w-10 h-10 rounded-[var(--radius-sm)] tone-brand flex items-center justify-center"><MessageSquare size={18} /></span>
        <div className="min-w-0 flex-1"><div className="font-medium">Open project channel</div><div className="text-xs text-muted truncate">#{projectName} · every member is already in</div></div>
        <ExternalLink size={16} className="text-muted" />
      </Link>
      <div className="card p-[var(--s4)]">
        <div className="eyebrow mb-2">Latest messages</div>
        {msgs === null ? <div className="text-xs text-muted">Loading…</div> : msgs.length === 0 ? <div className="text-sm text-muted">No messages yet. Start the conversation — decisions made here can be turned into tasks with one click.</div> : (
          <ul className="space-y-2.5">
            {msgs.map((m) => {
              const p = people.find((x) => x.id === m.author_id);
              return (
                <li key={m.id} className="flex gap-2.5">
                  <Avatar name={p?.full_name} src={p?.avatar_url} size={26} />
                  <div className="min-w-0"><div className="text-xs"><span className="font-medium">{p?.full_name || "Someone"}</span> <span className="text-muted">{ago(m.created_at)}</span></div><div className="text-sm truncate-2">{m.kind === "text" ? m.body : `[${m.kind}] ${m.body}`}</div></div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Files */
export function FilesPanel({ project, files }: { project: Project; files: FileWithVersions[] }) {
  return (
    <div className="space-y-3">
      <AttachmentUploader projectId={project.id} departmentId={project.department_id} />
      <div className="card px-3 py-1"><AttachmentList files={files} emptyHint="Briefs, decks, contracts — upload them here so the project has one source of truth." /></div>
    </div>
  );
}

/* -------------------------------------------------------------- Meetings */
type MeetingLite = { id: string; title: string; starts_at: string; ends_at: string | null; organizer_id: string | null; location: string | null; meeting_link: string | null };

function MeetingRow({ m }: { m: MeetingLite }) {
  return (
    <li>
      <Link href={`/meetings/${m.id}`} className="flex items-center gap-3 px-3 py-2.5 row-hover rounded-[var(--radius-sm)]">
        <span className="w-9 h-9 rounded-[var(--radius-sm)] sunken flex items-center justify-center text-muted shrink-0"><Video size={15} /></span>
        <div className="min-w-0 flex-1"><div className="text-sm truncate">{m.title}</div><div className="text-[11px] text-muted truncate">{fmtDate(m.starts_at, true)}{m.location ? ` · ${m.location}` : ""}</div></div>
        <PersonChip id={m.organizer_id} showName={false} size={22} />
      </Link>
    </li>
  );
}

export function MeetingsPanel({ project, meetings }: { project: Project; meetings: MeetingLite[] }) {
  const [now] = React.useState(() => Date.now());
  const upcoming = meetings.filter((m) => new Date(m.starts_at).getTime() >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = meetings.filter((m) => new Date(m.starts_at).getTime() < now);
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Link href={`/meetings?new=1&project=${project.id}`} className="btn btn-primary btn-sm"><Plus size={14} /> Schedule meeting</Link></div>
      {meetings.length === 0 ? <div className="card"><EmptyState icon={<Video size={18} />} title="No meetings yet" hint="Schedule a kickoff or review. Action items from meetings become tasks linked back here." /></div> : (
        <>
          {upcoming.length > 0 && <div className="card"><div className="eyebrow px-3 pt-3">Upcoming</div><ul className="p-1 divide-y">{upcoming.map((m) => <MeetingRow key={m.id} m={m} />)}</ul></div>}
          {past.length > 0 && <div className="card"><div className="eyebrow px-3 pt-3">Past</div><ul className="p-1 divide-y">{past.map((m) => <MeetingRow key={m.id} m={m} />)}</ul></div>}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Decisions */
export function DecisionsPanel({ project, decisions, memberIds }: { project: Project; decisions: Tables<"decisions">[]; memberIds: string[] }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [decision, setDecision] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [followUp, setFollowUp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const canRecord = isLeadPlus(profile.role);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !decision.trim()) return;
    setBusy(true);
    const { error } = await createClient().from("decisions").insert({
      org_id: profile.org_id!, title: title.trim(), decision: decision.trim(), reason: reason || null, follow_up: followUp || null, decided_by: profile.id,
      project_id: project.id, department_id: project.department_id, participants: Array.from(new Set([...memberIds, profile.id])), classification: project.classification,
    });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    setTitle(""); setDecision(""); setReason(""); setFollowUp(""); setOpen(false);
    toast.push("Decision recorded", "success");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {canRecord ? (
        open ? (
          <form onSubmit={save} className="card p-[var(--s4)] space-y-3 anim-fade-up">
            <Field label="Decision title"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Go with the blue palette" required /></Field>
            <Field label="What was decided"><Textarea value={decision} onChange={(e) => setDecision(e.target.value)} required style={{ minHeight: 72 }} /></Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Why"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 60 }} /></Field>
              <Field label="Follow-up"><Textarea value={followUp} onChange={(e) => setFollowUp(e.target.value)} style={{ minHeight: 60 }} placeholder="What happens next?" /></Field>
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Record decision</Button></div>
          </form>
        ) : (
          <div className="flex justify-end"><Button size="sm" variant="primary" onClick={() => setOpen(true)}><Gavel size={14} /> Record decision</Button></div>
        )
      ) : <div className="text-xs text-muted">Team leads and above can record decisions.</div>}
      {decisions.length === 0 ? <div className="card"><EmptyState icon={<Gavel size={18} />} title="No decisions recorded" hint="Every important decision deserves a record: what, why, who. Future you will thank you." /></div> : (
        <ul className="space-y-3 stagger">
          {decisions.map((d) => (
            <li key={d.id} className="card p-[var(--s4)]">
              <div className="flex items-start gap-3">
                <Gavel size={16} className="text-muted mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <Link href={`/decisions/${d.id}`} className="font-medium hover:underline">{d.title}</Link>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{d.decision}</p>
                  {d.reason && <p className="text-xs text-muted mt-1"><span className="font-medium">Why:</span> {d.reason}</p>}
                  {d.follow_up && <p className="text-xs text-muted mt-0.5"><span className="font-medium">Follow-up:</span> {d.follow_up}</p>}
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted"><PersonChip id={d.decided_by} size={18} /><span>· {fmtDate(d.decided_at, true)}</span></div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Approvals */
export function ApprovalsPanel({ project, approvals }: { project: Project; approvals: Tables<"approvals">[] }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<ApprovalType>("other");
  const [approver, setApprover] = React.useState(project.owner_id && project.owner_id !== profile.id ? project.owner_id : "");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [due, setDue] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !approver) return toast.push("Title and approver are required", "danger");
    setBusy(true);
    const { error } = await createClient().from("approvals").insert({
      org_id: profile.org_id!, type, title: title.trim(), description: description || null, requested_by: profile.id, approver_id: approver, project_id: project.id,
      priority: project.priority, amount: amount ? Number(amount) : null, due_date: due ? new Date(due).toISOString() : null,
    });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    setTitle(""); setDescription(""); setAmount(""); setDue(""); setOpen(false);
    toast.push("Approval requested", "success");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {open ? (
        <form onSubmit={save} className="card p-[var(--s4)] space-y-3 anim-fade-up">
          <Field label="What needs approval?"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Type"><Select value={type} onChange={(e) => setType(e.target.value as ApprovalType)}>{APPROVAL_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
            <Field label="Approver"><PersonPicker value={approver} onChange={setApprover} placeholder="Choose approver" allowEmpty={false} /></Field>
            <Field label="Amount (optional)"><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₹" /></Field>
            <Field label="Needed by"><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          </div>
          <Field label="Details"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 64 }} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Send request</Button></div>
        </form>
      ) : (
        <div className="flex justify-end"><Button size="sm" variant="primary" onClick={() => setOpen(true)}><ShieldCheck size={14} /> Request approval</Button></div>
      )}
      {approvals.length === 0 ? <div className="card"><EmptyState icon={<CheckSquare size={18} />} title="No approvals" hint="Budgets, designs, contracts, releases — request sign-off here and the approver is notified instantly." /></div> : (
        <ul className="card divide-y">
          {approvals.map((a) => (
            <li key={a.id}>
              <Link href={`/approvals/${a.id}`} className="flex items-center gap-3 px-3 py-2.5 row-hover">
                <ShieldCheck size={16} className={cn("shrink-0", a.status === "approved" ? "text-[var(--success)]" : a.status === "pending" ? "text-[var(--warn)]" : "text-[var(--danger)]")} />
                <div className="min-w-0 flex-1"><div className="text-sm truncate">{a.title}</div><div className="text-[11px] text-muted truncate">{humanize(a.type)} · requested {ago(a.created_at)}{a.amount ? ` · ₹${Number(a.amount).toLocaleString("en-IN")}` : ""}</div></div>
                <PersonChip id={a.approver_id} showName={false} size={22} />
                <Pill tone={APPROVAL_STATUS_TONE[a.status]}>{APPROVAL_STATUS_LABEL[a.status]}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Risks */
export function RisksPanel({ project, risks }: { project: Project; risks: Tables<"project_risks">[] }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [severity, setSeverity] = React.useState<TaskPriority>("normal");
  const [owner, setOwner] = React.useState("");
  const [mitigation, setMitigation] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await createClient().from("project_risks").insert({ project_id: project.id, title: title.trim(), severity, owner_id: owner || null, mitigation: mitigation || null, created_by: profile.id });
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    setTitle(""); setMitigation(""); setOwner(""); setSeverity("normal"); setOpen(false);
    toast.push("Risk logged", "success");
    router.refresh();
  }
  async function resolve(r: Tables<"project_risks">) {
    const { error } = await createClient().from("project_risks").update({ resolved_at: r.resolved_at ? null : new Date().toISOString() }).eq("id", r.id);
    if (error) return toast.push(error.message, "danger");
    toast.push(r.resolved_at ? "Risk reopened" : "Risk resolved", "success");
    router.refresh();
  }

  const openRisks = risks.filter((r) => !r.resolved_at);
  const closed = risks.filter((r) => r.resolved_at);

  return (
    <div className="space-y-3">
      {open ? (
        <form onSubmit={save} className="card p-[var(--s4)] space-y-3 anim-fade-up">
          <Field label="Risk"><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What could go wrong?" required /></Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Severity"><PriorityPicker value={severity} onChange={setSeverity} /></Field>
            <Field label="Owner"><PersonPicker value={owner} onChange={setOwner} placeholder="Who watches this?" /></Field>
          </div>
          <Field label="Mitigation"><Textarea value={mitigation} onChange={(e) => setMitigation(e.target.value)} style={{ minHeight: 60 }} placeholder="How do we reduce or handle it?" /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>Log risk</Button></div>
        </form>
      ) : (
        <div className="flex justify-end"><Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus size={14} /> Add risk</Button></div>
      )}
      {risks.length === 0 ? <div className="card"><EmptyState icon={<AlertTriangle size={18} />} title="No risks logged" hint="Name the risks early — vendor delays, approvals, dependencies — and assign someone to watch each one." /></div> : (
        <>
          {openRisks.length > 0 && <ul className="card divide-y">{openRisks.map((r) => <RiskRow key={r.id} r={r} onResolve={resolve} />)}</ul>}
          {closed.length > 0 && <div className="card"><div className="eyebrow px-3 pt-3">Resolved</div><ul className="divide-y">{closed.map((r) => <RiskRow key={r.id} r={r} onResolve={resolve} />)}</ul></div>}
        </>
      )}
    </div>
  );
}

function RiskRow({ r, onResolve }: { r: Tables<"project_risks">; onResolve: (r: Tables<"project_risks">) => void }) {
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <AlertTriangle size={16} className={cn("mt-0.5 shrink-0", r.resolved_at ? "text-[var(--success)]" : r.severity === "critical" || r.severity === "urgent" ? "text-[var(--danger)]" : "text-[var(--warn)]")} />
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm", r.resolved_at && "line-through text-muted")}>{r.title}</div>
        {r.mitigation && <div className="text-xs text-muted mt-0.5">Mitigation: {r.mitigation}</div>}
        <div className="flex items-center gap-2 mt-1"><PriorityPill priority={r.severity} /><PersonChip id={r.owner_id} size={16} /><span className="text-[11px] text-muted">· {ago(r.created_at)}</span></div>
      </div>
      <Button size="xs" variant={r.resolved_at ? "ghost" : "secondary"} onClick={() => onResolve(r)}>{r.resolved_at ? "Reopen" : <><Check size={12} /> Resolve</>}</Button>
    </li>
  );
}

/* -------------------------------------------------------------- Activity */
export function ActivityPanel({ activity }: { activity: Tables<"audit_logs">[] }) {
  const { profile, people } = useSession();
  if (activity.length === 0) {
    return <div className="card"><EmptyState icon={<Activity size={18} />} title="No activity yet" hint={isManagerPlus(profile.role) ? "Task changes, approvals, decisions and uploads will show up here as they happen." : "The activity log is visible to managers and above."} /></div>;
  }
  return (
    <ol className="card divide-y">
      {activity.map((a) => {
        const h = humaniseAudit(a, people);
        const actor = people.find((p) => p.id === a.actor_id);
        return (
          <li key={a.id} className="flex items-start gap-3 px-3 py-2.5">
            <Avatar name={actor?.full_name || "?"} src={actor?.avatar_url} size={26} />
            <div className="min-w-0 flex-1">
              <div className="text-sm"><span className="font-medium">{h.actor}</span> {h.link ? <Link href={h.link} className="hover:underline">{h.text}</Link> : h.text}</div>
              <div className="text-[11px] text-muted">{ago(a.created_at)}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
