"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookmarkPlus, Building2, CheckCircle2, CheckSquare, ChevronRight, Flame, GitBranch, MessageSquare, Send, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Modal, Pill, Textarea, useToast } from "@/components/ui";
import { useSeen } from "@/components/providers/ActivityProvider";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import type { Json } from "@/lib/database.types";
import { ago, cn, fmtDate, humanize, isLeadPlus, type Tables } from "@/lib/utils";
import { Note } from "@/components/admin/AdminBits";
import { EntityLive } from "@/components/live/EntityLive";
import { CollaborationHistory } from "@/components/live/CollaborationHistory";

export type Incident = Tables<"incidents">;
export type IncidentData = {
  incident: Incident;
  channel: { id: string; name: string } | null;
  task: { id: string; title: string; status: string } | null;
  followUp: { id: string; status: string } | null;
};

type Entry = { at: string; by: string; text: string };
export function parseTimeline(j: Json | null | undefined): Entry[] {
  if (!Array.isArray(j)) return [];
  const out: Entry[] = [];
  for (const item of j) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, Json | undefined>;
    if (typeof o.text !== "string") continue;
    out.push({ at: typeof o.at === "string" ? o.at : "", by: typeof o.by === "string" ? o.by : "", text: o.text });
  }
  return out;
}

export const SEVERITY_TONE: Record<string, string> = { critical: "tone-danger", high: "tone-orange", medium: "tone-warn" };
export const INCIDENT_STATUS_TONE: Record<string, string> = { open: "tone-danger", mitigated: "tone-warn", resolved: "tone-success" };

export function IncidentView({ data }: { data: IncidentData }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments } = useSession();
  const inc = data.incident;
  useSeen(inc.channel_id ? `channel:${inc.channel_id}` : undefined);
  const dept = departments.find((d) => d.id === inc.department_id);
  const timeline = React.useMemo(() => parseTimeline(inc.timeline), [inc.timeline]);
  const [entry, setEntry] = React.useState("");
  const [postmortem, setPostmortem] = React.useState(inc.postmortem || "");
  const [resolving, setResolving] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  // Mirrors inc_update: owner, starter, managers+ and room members may update (RLS decides; this only shapes the UI).
  const canAct = inc.owner_id === profile.id || inc.started_by === profile.id || isLeadPlus(profile.role);

  async function append(text: string, extra: Partial<Incident> = {}) {
    const next: Entry[] = [...timeline, { at: new Date().toISOString(), by: profile.full_name, text }];
    const { error } = await createClient().from("incidents").update({ timeline: next, ...extra }).eq("id", inc.id);
    if (error) { toast.push(error.message, "danger"); return false; }
    router.refresh();
    return true;
  }

  async function addEntry() {
    const t = entry.trim();
    if (!t) return;
    setBusy("entry");
    if (await append(t)) setEntry("");
    setBusy(null);
  }
  async function mitigate() {
    setBusy("mitigate");
    if (await append("Marked mitigated — impact contained, root cause still open.", { status: "mitigated" })) toast.push("Marked mitigated", "success");
    setBusy(null);
  }
  async function resolve() {
    setBusy("resolve");
    if (await append("Resolved.", { status: "resolved", resolved_at: new Date().toISOString(), postmortem: postmortem.trim() || null })) { toast.push("Incident resolved", "success"); setResolving(false); }
    setBusy(null);
  }
  async function savePostmortem() {
    setBusy("pm");
    const { error } = await createClient().from("incidents").update({ postmortem: postmortem.trim() || null }).eq("id", inc.id);
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Postmortem saved", "success");
    router.refresh();
  }
  async function saveAsKnowledge() {
    if (!profile.org_id || !postmortem.trim()) return;
    setBusy("knowledge");
    const body = `${postmortem.trim()}\n\n---\nIncident: ${inc.title} (${inc.severity}) · started ${fmtDate(inc.started_at, true)}${inc.resolved_at ? ` · resolved ${fmtDate(inc.resolved_at, true)}` : ""}\nTimeline:\n${timeline.map((e) => `- ${e.at ? fmtDate(e.at, true) : ""} ${e.by}: ${e.text}`).join("\n")}`;
    const { error } = await createClient().from("ai_knowledge").insert({ org_id: profile.org_id, kind: "incident", title: `Postmortem: ${inc.title}`, body, department_id: inc.department_id, status: "draft", created_by: profile.id, owner_id: inc.owner_id, source_type: "incident", source_id: inc.id, tags: ["incident", inc.severity] });
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Saved as draft knowledge — the department's knowledge owner can approve it", "success");
  }
  async function startFollowUp() {
    setBusy("workflow");
    const { data: runId, error } = await createClient().rpc("start_workflow", { p_template_key: "incident", p_subject: inc.owner_id || profile.id, p_context: { incident_id: inc.id, title: inc.title, severity: inc.severity }, p_label: inc.title });
    setBusy(null);
    if (error || !runId) { toast.push(error?.message || "Could not start the follow-up", "danger"); return; }
    await append("Follow-up workflow started (postmortem → prevention actions).");
    toast.push("Follow-up workflow started", "success");
    router.push(`/admin?tab=workflows&run=${runId}`);
  }

  return (
    <div className="page page-narrow space-y-[var(--s4)] anim-fade-up">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/help" className="hover:underline inline-flex items-center gap-1"><ArrowLeft size={12} /> Help Desk</Link>
        <ChevronRight size={12} />
        <span>Incident</span>
      </div>

      <Card className="p-[var(--s4)]" style={{ borderTop: `3px solid ${inc.status === "resolved" ? "var(--success)" : inc.severity === "critical" ? "var(--danger)" : "var(--orange)"}` }}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Pill tone={INCIDENT_STATUS_TONE[inc.status] || "tone-neutral"} size="lg">{humanize(inc.status)}</Pill>
              <Pill tone={SEVERITY_TONE[inc.severity] || "tone-neutral"} size="lg"><Flame size={11} /> {humanize(inc.severity)}</Pill>
            </div>
            <h1 className="h1">{inc.title}</h1>
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-muted mt-2">
              {dept && <span className="inline-flex items-center gap-1"><Building2 size={12} /> {dept.name}</span>}
              <span>Started {ago(inc.started_at)}{inc.started_by && <> by <PersonChip id={inc.started_by} size={14} /></>}</span>
              {inc.resolved_at && <span className="text-success inline-flex items-center gap-1"><CheckCircle2 size={12} /> resolved {fmtDate(inc.resolved_at, true)}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[11px] text-muted">Owner</span>
            {inc.owner_id ? <PersonChip id={inc.owner_id} size={24} /> : <span className="text-xs text-muted">Unassigned</span>}
          </div>
        </div>
        {inc.status !== "resolved" && (
          <div className="flex flex-wrap items-center gap-2 mt-[var(--s4)] pt-[var(--s3)] border-t">
            <EntityLive ctx={{ incidentId: inc.id, departmentId: inc.department_id, channelId: inc.channel_id, title: `War room · ${inc.title}` }} include={["war_room"]} label="Start war room" />
            <span className="text-[11px] text-muted">Everyone in one room, now — the transcript and decisions stay on the incident.</span>
          </div>
        )}
        {canAct && inc.status !== "resolved" && (
          <div className="flex flex-wrap items-center gap-2 mt-[var(--s3)]">
            {inc.status === "open" && <Button size="sm" variant="secondary" loading={busy === "mitigate"} onClick={mitigate}><ShieldCheck size={14} /> Mark mitigated</Button>}
            <Button size="sm" variant="success" onClick={() => setResolving(true)}><CheckCircle2 size={14} /> Resolve</Button>
            {data.channel && <Link href={`/chat/${data.channel.id}`} className="btn btn-secondary btn-sm"><MessageSquare size={14} /> War room</Link>}
          </div>
        )}
      </Card>

      <CollaborationHistory type="incident" id={inc.id} />

      <div className="grid gap-[var(--s4)] lg:grid-cols-[1.618fr_1fr]">
        <div className="space-y-[var(--s4)] min-w-0">
          <Card className="p-[var(--s4)]">
            <div className="eyebrow mb-2">Timeline</div>
            {timeline.length === 0 ? <p className="text-sm text-muted">No entries yet.</p> : (
              <ol className="space-y-2.5">
                {timeline.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className={cn("w-1.5 h-1.5 rounded-full mt-2 shrink-0", i === timeline.length - 1 && inc.status !== "resolved" ? "bg-[var(--danger)]" : "bg-[var(--brand-2)]")} />
                    <span className="min-w-0 flex-1">
                      <span className="block whitespace-pre-wrap">{e.text}</span>
                      <span className="block text-[11px] text-muted">{e.at ? fmtDate(e.at, true) : ""}{e.by ? ` · ${e.by}` : ""}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {canAct && inc.status !== "resolved" && (
              <div className="flex items-start gap-2 mt-3 pt-3 border-t">
                <Textarea rows={2} value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="What just happened? (kept on the record)" className="flex-1" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void addEntry(); }} />
                <Button variant="primary" size="sm" loading={busy === "entry"} disabled={!entry.trim()} onClick={addEntry}><Send size={14} /></Button>
              </div>
            )}
          </Card>

          <Card className="p-[var(--s4)]">
            <div className="flex items-center justify-between gap-2 mb-2"><div className="eyebrow">Postmortem</div>{inc.status === "resolved" && inc.postmortem && <Pill tone="tone-success">Recorded</Pill>}</div>
            {canAct ? (
              <div className="space-y-2">
                <Textarea rows={8} value={postmortem} onChange={(e) => setPostmortem(e.target.value)} placeholder={"Problem — what users saw.\nCause — the actual root cause.\nFix — what resolved it.\nVerification — how we know.\nPrevention — what changes so it does not repeat."} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" loading={busy === "pm"} disabled={postmortem === (inc.postmortem || "")} onClick={savePostmortem}>Save</Button>
                  <Button size="sm" variant="secondary" loading={busy === "knowledge"} disabled={!postmortem.trim()} onClick={saveAsKnowledge}><BookmarkPlus size={14} /> Save as knowledge</Button>
                  {data.followUp ? <Link href={`/admin?tab=workflows&run=${data.followUp.id}`} className="btn btn-ghost btn-sm"><GitBranch size={14} /> Follow-up workflow · {data.followUp.status}</Link> : <Button size="sm" variant="ghost" loading={busy === "workflow"} onClick={startFollowUp}><GitBranch size={14} /> Start follow-up workflow</Button>}
                </div>
                <Note tone="neutral">“Save as knowledge” drafts an incident entry for the department’s knowledge base; the knowledge owner approves it so the Buddy can use it. The follow-up workflow assigns the postmortem (IT) and prevention actions (department head).</Note>
              </div>
            ) : inc.postmortem ? <p className="text-sm whitespace-pre-wrap">{inc.postmortem}</p> : <p className="text-sm text-muted">Not written yet.</p>}
          </Card>
        </div>

        <div className="space-y-[var(--s4)] min-w-0">
          <Card className="p-[var(--s4)]">
            <div className="eyebrow mb-2">Linked</div>
            <ul className="space-y-1.5 text-sm">
              {data.channel && <li><Link href={`/chat/${data.channel.id}`} className="flex items-center gap-2 link"><MessageSquare size={14} /> <span className="truncate">{data.channel.name}</span></Link></li>}
              {data.task && <li><Link href={`/tasks/${data.task.id}`} className="flex items-center gap-2 link"><CheckSquare size={14} /> <span className="truncate">{data.task.title}</span> <span className="ml-auto pill tone-neutral">{humanize(data.task.status)}</span></Link></li>}
              {!data.channel && !data.task && <li className="text-xs text-muted">Nothing linked.</li>}
            </ul>
          </Card>
          <Card className="p-[var(--s4)] text-xs text-muted space-y-1">
            <div>Started {fmtDate(inc.started_at, true)}</div>
            {inc.resolved_at && <div>Resolved {fmtDate(inc.resolved_at, true)}</div>}
            <div>Visible to internal staff. Every status change is written to the timeline.</div>
          </Card>
        </div>
      </div>

      <Modal open={resolving} onClose={() => setResolving(false)} title="Resolve incident" width={520} footer={<><Button variant="ghost" onClick={() => setResolving(false)}>Cancel</Button><Button variant="success" loading={busy === "resolve"} onClick={resolve}><CheckCircle2 size={15} /> Resolve</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-muted">Sets the incident to resolved and records the time. The postmortem can still be edited afterwards.</p>
          <Field label="Postmortem (recommended)"><Textarea rows={6} value={postmortem} onChange={(e) => setPostmortem(e.target.value)} placeholder="Problem, cause, fix, verification, prevention." /></Field>
        </div>
      </Modal>
    </div>
  );
}
