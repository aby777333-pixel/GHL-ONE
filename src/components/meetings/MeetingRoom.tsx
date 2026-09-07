"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Video, MapPin, Link2, FolderKanban, Users, FileText, StickyNote, Mic, Gavel, FileCheck2, Plus, X, ExternalLink, Wand2, ClipboardList } from "lucide-react";
import { Avatar, Button, Card, CardHeader, Modal, useToast } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { cn, fmtDate, isManagerPlus, type Decision, type Meeting } from "@/lib/utils";
import { RecordDecisionForm } from "@/components/decisions/RecordDecisionForm";
import { MeetingAssistant, type MeetingAssistantHandle } from "@/components/ai/MeetingAssistant";
import { useAIStatus } from "@/components/ai/useAIStatus";
import { BuddyQuickActions } from "@/components/ai/BuddyQuickActions";
import { AutosaveField } from "./AutosaveField";
import { ActionItems, type LinkedTask, type MeetingAction } from "./ActionItems";
import { PeopleMultiSelect } from "./PeopleMultiSelect";
import { PrepareMe, type PrepareData } from "./PrepareMe";
import { durationLabel, durationMinutes, extractLinks } from "./meetingUtils";
import { MeetingCostLine } from "./MeetingHygiene";

export type MeetingRoomProps = {
  meeting: Meeting;
  participantIds: string[];
  actions: MeetingAction[];
  tasks: LinkedTask[];
  decisions: Decision[];
  files: { id: string; name: string; folder: string; current_version: number }[];
  project: { id: string; name: string } | null;
  prepare: PrepareData;
};

export function MeetingRoom({ meeting: m, participantIds, actions, tasks, decisions, files, project, prepare }: MeetingRoomProps) {
  const { profile, people } = useSession();
  const router = useRouter();
  const toast = useToast();
  const canEdit = m.organizer_id === profile.id || isManagerPlus(profile.role);
  const [addPeople, setAddPeople] = React.useState(false);
  const [newPeople, setNewPeople] = React.useState<string[]>([]);
  const [recordDecision, setRecordDecision] = React.useState(false);
  const [summary, setSummary] = React.useState(m.summary || "");
  const [busy, setBusy] = React.useState(false);
  const ai = useAIStatus();
  const assistantRef = React.useRef<MeetingAssistantHandle>(null);

  const participants = participantIds.map((id) => people.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const links = extractLinks(m.agenda, m.notes);
  const mins = durationMinutes(m);

  async function addParticipants() {
    if (!newPeople.length) return setAddPeople(false);
    setBusy(true);
    const { error } = await createClient().from("meeting_participants").insert(newPeople.map((user_id) => ({ meeting_id: m.id, user_id })));
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push(`${newPeople.length} added and notified`, "success");
    setNewPeople([]);
    setAddPeople(false);
    router.refresh();
  }
  async function removeParticipant(id: string) {
    const { error } = await createClient().from("meeting_participants").delete().eq("meeting_id", m.id).eq("user_id", id);
    if (error) return toast.push(error.message, "danger");
    router.refresh();
  }

  function draftSummary() {
    // AI configured → run the assistant (summary + decisions + actions to review); otherwise the extractive draft below.
    if (ai.enabled && assistantRef.current) {
      assistantRef.current.extract();
      return;
    }
    const lines: string[] = [`Summary — ${m.title} (${fmtDate(m.starts_at)})`, ""];
    if (m.notes) {
      const excerpt = m.notes.trim().split(/\n+/).slice(0, 6).join("\n");
      lines.push("Notes:", excerpt, "");
    }
    if (decisions.length) {
      lines.push("Decisions:");
      for (const d of decisions) lines.push(`• ${d.title}${d.decision ? ` — ${d.decision.split("\n")[0]}` : ""}`);
      lines.push("");
    }
    if (actions.length) {
      lines.push("Action items:");
      for (const a of actions) {
        const owner = people.find((p) => p.id === a.owner_id)?.full_name;
        lines.push(`• ${a.title}${owner ? ` — ${owner}` : ""}${a.due_date ? ` — due ${fmtDate(a.due_date)}` : ""}${a.confirmed ? " ✓" : ""}`);
      }
      lines.push("");
    }
    if (!m.notes && !decisions.length && !actions.length) lines.push("No notes, decisions or action items were captured.");
    setSummary(lines.join("\n").trim());
    toast.push("Draft built from notes, decisions and actions — edit and it autosaves", "info");
  }

  return (
    <div className="page">
      <Link href="/meetings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]"><ArrowLeft size={14} /> Meetings</Link>

      <Card className="px-[var(--s4)] py-[var(--s4)] mb-[var(--s3)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow mb-1">Meeting room</div>
            <h1 className="h1">{m.title}</h1>
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2 text-sm text-[var(--fg-2)]">
              <span className="num">{fmtDate(m.starts_at, true)}{mins ? ` · ${durationLabel(mins)}` : ""} <span className="text-muted">IST</span></span>
              {project && <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-1 hover:underline"><FolderKanban size={14} /> {project.name}</Link>}
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">Organised by <PersonChip id={m.organizer_id} size={18} /></span>
              {m.location && <span className="inline-flex items-center gap-1 text-xs text-muted"><MapPin size={12} /> {m.location}</span>}
              <MeetingCostLine meetingId={m.id} />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <BuddyQuickActions scope={{ meetingId: m.id, projectId: m.project_id || undefined, path: `/meetings/${m.id}` }} />
            {m.meeting_link && (
              <a href={m.meeting_link} target="_blank" rel="noreferrer" className="btn btn-primary"><Video size={15} /> Join meeting</a>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-[var(--s3)] items-start">
        <div className="space-y-[var(--s3)] min-w-0">
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><ClipboardList size={15} /> Agenda</span>} subtitle={canEdit ? "Autosaves as you type" : undefined} />
            <div className="px-[var(--s4)] pb-[var(--s4)] pt-1">
              <AutosaveField meetingId={m.id} field="agenda" initial={m.agenda} canEdit={canEdit} placeholder={"1. Review actions from last meeting\n2. …"} minHeight={100} />
            </div>
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Users size={15} /> Participants</span>} subtitle={`${participants.length} people`} action={canEdit ? <Button size="sm" variant="secondary" onClick={() => setAddPeople(true)}><Plus size={13} /> Add</Button> : undefined} />
            <div className="px-[var(--s4)] pb-[var(--s4)] flex flex-wrap gap-2">
              {participants.length === 0 && <span className="text-sm text-muted">No participants yet.</span>}
              {participants.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-2 rounded-full border pl-1 pr-2 py-1 text-sm">
                  <Avatar name={p.full_name} src={p.avatar_url} size={22} presence={p.presence} />
                  <Link href={`/people/${p.id}`} className="hover:underline">{p.full_name}</Link>
                  {p.id === m.organizer_id && <span className="text-[10px] uppercase tracking-wide text-muted">host</span>}
                  {canEdit && p.id !== m.organizer_id && (
                    <button aria-label={`Remove ${p.full_name}`} onClick={() => removeParticipant(p.id)} className="text-muted hover:text-danger"><X size={13} /></button>
                  )}
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><FileText size={15} /> Documents</span>} subtitle={project ? `Files on ${project.name} and links from the agenda & notes` : "Links from the agenda & notes"} />
            <div className="px-[var(--s3)] pb-[var(--s3)] space-y-1">
              {files.length === 0 && links.length === 0 && <div className="text-sm text-muted px-2 py-1">Nothing attached. Paste links into the agenda or notes and they show up here.</div>}
              {files.map((f) => (
                <Link key={f.id} href={`/files/${f.id}`} className="flex items-center gap-3 px-2.5 py-1.5 rounded-[var(--radius-sm)] row-hover">
                  <FileText size={15} className="text-muted shrink-0" />
                  <span className="text-sm truncate flex-1">{f.name}</span>
                  <span className="text-[11px] text-muted shrink-0">{f.folder} · v{f.current_version}</span>
                </Link>
              ))}
              {links.map((l) => (
                <a key={l} href={l} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-2.5 py-1.5 rounded-[var(--radius-sm)] row-hover">
                  <Link2 size={15} className="text-muted shrink-0" />
                  <span className="text-sm truncate flex-1 link">{l}</span>
                  <ExternalLink size={12} className="text-muted shrink-0" />
                </a>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><StickyNote size={15} /> Notes</span>} subtitle={canEdit ? "Live notes — autosaved" : undefined} />
            <div className="px-[var(--s4)] pb-[var(--s4)] pt-1">
              <AutosaveField meetingId={m.id} field="notes" initial={m.notes} canEdit={canEdit} placeholder="Capture discussion points, blockers, numbers…" minHeight={160} />
            </div>
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Mic size={15} /> Recording & transcript</span>} subtitle={ai.enabled ? "Paste a recording link and the transcript — the AI assistant below reads notes and transcript." : "Paste a recording link and the transcript."} />
            <div className="px-[var(--s4)] pb-[var(--s4)] pt-1 space-y-4">
              <div>
                <div className="label">Recording URL</div>
                <AutosaveField meetingId={m.id} field="recording_url" initial={m.recording_url} canEdit={canEdit} placeholder="https://…" input />
              </div>
              <div>
                <div className="label">Transcript</div>
                <AutosaveField meetingId={m.id} field="transcript" initial={m.transcript} canEdit={canEdit} placeholder="Paste the transcript here…" minHeight={120} mono />
              </div>
            </div>
          </Card>

          {canEdit && <MeetingAssistant ref={assistantRef} meeting={m} participantIds={participantIds} onSummary={setSummary} />}

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Gavel size={15} /> Decisions</span>} subtitle={decisions.length ? `${decisions.length} recorded in this meeting` : "Record decisions as they are made"} action={<Button size="sm" variant="secondary" onClick={() => setRecordDecision((s) => !s)}><Plus size={13} /> Record decision</Button>} />
            <div className="px-[var(--s3)] pb-[var(--s3)] space-y-1">
              {decisions.map((d) => (
                <Link key={d.id} href={`/decisions/${d.id}`} className="block px-2.5 py-2 rounded-[var(--radius-sm)] row-hover">
                  <div className="text-sm font-medium">{d.title}</div>
                  <div className="text-xs text-[var(--fg-2)] truncate-2 mt-0.5">{d.decision}</div>
                  <div className="flex items-center gap-2 text-[11px] text-muted mt-1"><PersonChip id={d.decided_by} size={14} /> <span className="num">{fmtDate(d.decided_at, true)}</span></div>
                </Link>
              ))}
              {decisions.length === 0 && !recordDecision && <div className="text-sm text-muted px-2 py-1">No decisions recorded yet.</div>}
              {recordDecision && (
                <div className="mt-2 px-2.5 py-3 rounded-[var(--radius-sm)] border anim-fade-in">
                  <RecordDecisionForm compact defaults={{ meeting_id: m.id, project_id: m.project_id, department_id: m.department_id, participants: participantIds }} onDone={() => setRecordDecision(false)} onCancel={() => setRecordDecision(false)} />
                </div>
              )}
            </div>
          </Card>

          <ActionItems meeting={m} actions={actions} tasks={tasks} canEdit={canEdit || participantIds.includes(profile.id)} />

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><FileCheck2 size={15} /> Summary</span>} subtitle="What participants and absentees should take away" action={canEdit ? <Button size="sm" variant="secondary" onClick={draftSummary}><Wand2 size={13} /> {ai.enabled ? "Draft with AI" : "Draft summary"}</Button> : undefined} />
            <div className="px-[var(--s4)] pb-[var(--s4)] pt-1">
              <AutosaveField meetingId={m.id} field="summary" initial={m.summary} value={summary} onChange={setSummary} canEdit={canEdit} placeholder="Outcome, decisions and next steps in a few lines…" minHeight={140} />
            </div>
          </Card>
        </div>

        <div className={cn("min-w-0")}>
          <PrepareMe data={prepare} hasProject={!!m.project_id} />
        </div>
      </div>

      <Modal open={addPeople} onClose={() => setAddPeople(false)} title="Add participants" width={520} footer={<><Button variant="ghost" onClick={() => setAddPeople(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={addParticipants}>Add {newPeople.length || ""}</Button></>}>
        <PeopleMultiSelect value={newPeople} onChange={setNewPeople} exclude={participantIds} maxHeight={320} />
      </Modal>
    </div>
  );
}
