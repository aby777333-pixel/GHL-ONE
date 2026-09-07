"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { BookOpen, Bug, Check, Copy, FileText, Focus, Gavel, GraduationCap, Handshake, KeyRound, LifeBuoy, ListChecks, MessageSquare, Palmtree, Send, ShieldAlert, ShieldCheck, Siren, UserPlus, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, Field, Input, Pill, Select, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker, PriorityPicker, ProjectPicker } from "@/components/pickers";
import type { BuddyActionKind, BuddyProposal } from "@/lib/ai/types";
import { cn, type TaskPriority } from "@/lib/utils";
import type { Json } from "@/lib/database.types";

/* ------------------------------------------------------------------ types ---- */

type DraftStatus = "pending" | "creating" | "created" | "dismissed";
export type Draft = {
  kind: BuddyActionKind;
  title: string;
  description: string;
  body: string;
  assignee: string;
  due: string;
  priority: TaskPriority;
  project: string;
  department: string;
  service: string;
  channel: string;
  person: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  fields: Record<string, string>;
  status: DraftStatus;
  link?: string;
  note?: string;
};

type PersonLite = { id: string; full_name: string };
type Lookups = {
  projects?: { id: string; name: string }[];
  services?: { id: string; name: string; department_id: string }[];
  leaveTypes?: { id: string; name: string; code: string }[];
  myTasks?: { id: string; title: string }[];
  channels?: Record<string, string>;
};

const KIND_META: Record<BuddyActionKind, { label: string; noun: string; icon: React.ReactNode; cta: string }> = {
  task: { label: "Task", noun: "task", icon: <ListChecks size={11} />, cta: "Create task" },
  decision: { label: "Decision", noun: "decision", icon: <Gavel size={11} />, cta: "Record decision" },
  meeting: { label: "Meeting", noun: "meeting", icon: <Video size={11} />, cta: "Schedule meeting" },
  help_request: { label: "Help request", noun: "help request", icon: <LifeBuoy size={11} />, cta: "Send request" },
  leave_request: { label: "Leave request", noun: "leave request", icon: <Palmtree size={11} />, cta: "Apply for leave" },
  bug_report: { label: "Bug report", noun: "bug report", icon: <Bug size={11} />, cta: "File bug" },
  message_draft: { label: "Message draft", noun: "message", icon: <MessageSquare size={11} />, cta: "Send" },
  knowledge_article: { label: "Knowledge article", noun: "knowledge draft", icon: <BookOpen size={11} />, cta: "Save draft" },
  access_request: { label: "Access request", noun: "access request", icon: <KeyRound size={11} />, cta: "Request access" },
  bring_in: { label: "Bring someone in", noun: "invitation", icon: <UserPlus size={11} />, cta: "Bring in" },
  escalation: { label: "Escalation", noun: "escalation", icon: <ShieldAlert size={11} />, cta: "Escalate to IT" },
  war_room: { label: "War room", noun: "war room", icon: <Siren size={11} />, cta: "Start war room" },
  focus: { label: "Focus session", noun: "focus session", icon: <Focus size={11} />, cta: "Start focus" },
  learning: { label: "Learning interest", noun: "learning interest", icon: <GraduationCap size={11} />, cta: "Save interest" },
  commitment: { label: "Promise", noun: "promise", icon: <Handshake size={11} />, cta: "Record promise" },
  request: { label: "Request", noun: "request", icon: <FileText size={11} />, cta: "Submit request" },
  admin_action: { label: "Organisation change (needs human approval)", noun: "change proposal", icon: <ShieldCheck size={11} />, cta: "Review in Organization Control" },
};

const SEVERITY_PRIORITY: Record<string, TaskPriority> = { critical: "critical", blocker: "critical", high: "high", urgent: "urgent", medium: "normal", normal: "normal", low: "low" };

/* ------------------------------------------------------------------ helpers ---- */

function matchPerson(name: string | null | undefined, people: PersonLite[]) {
  if (!name) return "";
  const n = name.trim().toLowerCase();
  if (!n) return "";
  const exact = people.find((p) => p.full_name.toLowerCase() === n);
  if (exact) return exact.id;
  const first = people.filter((p) => p.full_name.toLowerCase().split(/\s+/)[0] === n);
  if (first.length === 1) return first[0].id;
  const partial = people.filter((p) => p.full_name.toLowerCase().includes(n));
  return partial.length === 1 ? partial[0].id : "";
}

function toLocalInput(iso: string | null | undefined, dateOnly = false) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? (dateOnly ? iso : `${iso}T10:00`) : "";
  return format(d, dateOnly ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm");
}

export function toDraft(p: BuddyProposal, people: PersonLite[], techDeptId: string | null): Draft {
  const known = p.assignee_id && people.some((x) => x.id === p.assignee_id) ? p.assignee_id : "";
  const dateOnly = p.kind === "leave_request" || p.kind === "help_request" || p.kind === "escalation";
  const fields = { ...(p.fields || {}) };
  return {
    kind: p.kind,
    title: p.title || "",
    description: p.description || "",
    body: p.body || "",
    assignee: known || matchPerson(p.assignee_name, people),
    due: toLocalInput(p.due_date, dateOnly),
    priority: p.priority || (p.kind === "bug_report" || p.kind === "escalation" ? SEVERITY_PRIORITY[(fields.severity || "").toLowerCase()] || "high" : "normal"),
    project: p.project_id || "",
    department: p.department_id || ((p.kind === "bug_report" || p.kind === "escalation") && techDeptId ? techDeptId : ""),
    service: p.service_id || "",
    channel: p.channel_id || "",
    person: p.person_id || "",
    resourceType: p.resource_type || "",
    resourceId: p.resource_id || "",
    reason: p.reason || "",
    fields,
    status: "pending",
  };
}

function bugBody(d: Draft) {
  const f = d.fields;
  const parts = [
    d.description ? d.description : "",
    f.steps ? `**Steps to reproduce**\n${f.steps}` : "",
    f.expected ? `**Expected**\n${f.expected}` : "",
    f.actual ? `**Actual**\n${f.actual}` : "",
    f.severity ? `**Severity:** ${f.severity}` : "",
    f.environment ? `**Environment:** ${f.environment}` : "",
    d.body && d.body !== d.description ? d.body : "",
  ].filter(Boolean);
  return parts.join("\n\n") || null;
}

function previewLine(drafts: Draft[]) {
  const counts = new Map<BuddyActionKind, number>();
  for (const d of drafts) counts.set(d.kind, (counts.get(d.kind) || 0) + 1);
  const bits = [...counts.entries()].map(([k, n]) => `${n} ${KIND_META[k].noun}${n > 1 ? "s" : ""}`);
  if (!bits.length) return "";
  const list = bits.length > 1 ? `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}` : bits[0];
  const verb = drafts.every((d) => d.kind === "message_draft") ? "send" : "create";
  return `This will ${verb} ${list}.`;
}

/* ------------------------------------------------------------------ component ---- */

export function BuddyProposals({ proposals, conversationId, actionLevel, onNavigate, className }: {
  proposals: BuddyProposal[];
  conversationId: string | null;
  actionLevel: number;
  onNavigate?: () => void;
  className?: string;
}) {
  const { profile, people, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const techDept = React.useMemo(() => departments.find((d) => d.slug === "technology" || d.slug === "it")?.id || null, [departments]);
  const [drafts, setDrafts] = React.useState<Draft[]>(() => proposals.map((p) => toDraft(p, people, techDept)));
  const [lookups, setLookups] = React.useState<Lookups>({});
  const [busyAll, setBusyAll] = React.useState(false);

  const readOnly = actionLevel <= 3;
  const kinds = React.useMemo(() => new Set(drafts.map((d) => d.kind)), [drafts]);

  // Lazy lookups, only what the visible proposal kinds need.
  React.useEffect(() => {
    let alive = true;
    const supabase = createClient();
    const jobs: PromiseLike<void>[] = [];
    if ((kinds.has("task") || kinds.has("decision") || kinds.has("meeting")) && !lookups.projects) {
      jobs.push(supabase.from("projects").select("id,name").eq("archived", false).order("name").then(({ data }) => { if (alive) setLookups((l) => ({ ...l, projects: data || [] })); }));
    }
    if ((kinds.has("help_request") || kinds.has("escalation")) && !lookups.services) {
      jobs.push(supabase.from("service_catalog").select("id,name,department_id").eq("active", true).order("position").then(({ data }) => { if (alive) setLookups((l) => ({ ...l, services: data || [] })); }));
    }
    if (kinds.has("leave_request") && !lookups.leaveTypes) {
      jobs.push(supabase.from("leave_types").select("id,name,code").eq("active", true).order("position").then(({ data }) => { if (alive) setLookups((l) => ({ ...l, leaveTypes: data || [] })); }));
    }
    if (kinds.has("focus") && !lookups.myTasks) {
      jobs.push(supabase.from("tasks").select("id,title").eq("assignee_id", profile.id).not("status", "in", "(done,cancelled)").order("due_date", { ascending: true, nullsFirst: false }).limit(60).then(({ data }) => { if (alive) setLookups((l) => ({ ...l, myTasks: data || [] })); }));
    }
    const channelIds = drafts.filter((d) => (d.kind === "message_draft" || d.kind === "bring_in") && d.channel && !lookups.channels?.[d.channel]).map((d) => d.channel);
    if (channelIds.length) {
      jobs.push(supabase.from("channels").select("id,name").in("id", [...new Set(channelIds)]).then(({ data }) => {
        if (!alive) return;
        setLookups((l) => ({ ...l, channels: { ...(l.channels || {}), ...Object.fromEntries((data || []).map((c) => [c.id, c.name])) } }));
      }));
    }
    void Promise.all(jobs);
    return () => {
      alive = false;
    };
  }, [kinds, drafts, lookups.projects, lookups.services, lookups.leaveTypes, lookups.myTasks, lookups.channels, profile.id]);

  const update = React.useCallback((i: number, patch: Partial<Draft>) => setDrafts((s) => s.map((d, j) => (j === i ? { ...d, ...patch } : d))), []);
  const setStatus = React.useCallback((i: number, status: DraftStatus, extra: Partial<Draft> = {}) => update(i, { status, ...extra }), [update]);

  /** Mirror the confirmation into the AI action log (best effort — never blocks the user). */
  const markAction = React.useCallback(async (d: Draft, status: "performed" | "dismissed", result?: Record<string, string | null>) => {
    if (!conversationId) return;
    try {
      const supabase = createClient();
      const { data } = await supabase.from("ai_actions").select("id,payload").eq("conversation_id", conversationId).eq("kind", d.kind).eq("status", "proposed").limit(20);
      const row = (data || []).find((r) => ((r.payload as { title?: string } | null)?.title || "") === d.title) || (data || [])[0];
      if (!row) return;
      const now = new Date().toISOString();
      await supabase.from("ai_actions").update(status === "performed" ? { status, confirmed_at: now, performed_at: now, result: (result || {}) as Json } : { status }).eq("id", row.id);
    } catch {
      /* logging only */
    }
  }, [conversationId]);

  const dismiss = (i: number) => {
    const d = drafts[i];
    setStatus(i, "dismissed");
    void markAction(d, "dismissed");
  };

  const confirm = React.useCallback(async (i: number): Promise<boolean> => {
    const d = drafts[i];
    if (!d || d.status !== "pending") return false;
    const supabase = createClient();
    const orgId = profile.org_id!;
    const fail = (msg: string) => {
      toast.push(msg, "danger");
      setStatus(i, "pending");
      return false;
    };
    const done = (link: string | undefined, msg: string, result: Record<string, string | null>) => {
      toast.push(msg, "success");
      setStatus(i, "created", { link });
      void markAction(d, "performed", result);
      router.refresh();
      return true;
    };
    if (["task", "decision", "meeting", "help_request", "bug_report", "knowledge_article", "escalation", "war_room", "learning", "access_request", "commitment", "request"].includes(d.kind) && !d.title.trim()) return fail("Give it a title first");
    setStatus(i, "creating");

    try {
      switch (d.kind) {
        case "task":
        case "bug_report": {
          const isBug = d.kind === "bug_report";
          const { data, error } = await supabase.from("tasks").insert({
            org_id: orgId,
            title: d.title.trim(),
            description: isBug ? bugBody(d) : d.description || null,
            project_id: d.project || null,
            department_id: isBug ? d.department || techDept || profile.department_id || null : profile.department_id || null,
            assignee_id: isBug ? d.assignee || null : d.assignee || null,
            owner_id: profile.id,
            delegated_by: d.assignee && d.assignee !== profile.id ? profile.id : null,
            due_date: d.due ? new Date(d.due).toISOString() : null,
            priority: d.priority,
            created_by: profile.id,
            status: "todo",
            tags: isBug ? ["bug"] : [],
            parent_id: d.fields.parent_task_id || null,
          }).select("id").single();
          if (error || !data) return fail(error?.message || "Could not create task");
          return done(`/tasks/${data.id}`, isBug ? "Bug filed with IT" : "Task created", { id: data.id });
        }
        case "decision": {
          const { data, error } = await supabase.from("decisions").insert({
            org_id: orgId,
            title: d.title.trim(),
            decision: d.description.trim() || d.title.trim(),
            reason: d.reason || null,
            project_id: d.project || null,
            decided_by: profile.id,
          }).select("id").single();
          if (error || !data) return fail(error?.message || "Could not record decision");
          return done(`/decisions/${data.id}`, "Decision recorded", { id: data.id });
        }
        case "meeting": {
          const start = d.due ? new Date(d.due) : new Date(Math.ceil((Date.now() + 3600e3) / 1800e3) * 1800e3);
          const end = new Date(start.getTime() + 45 * 60e3);
          const { data, error } = await supabase.from("meetings").insert({
            org_id: orgId,
            title: d.title.trim(),
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            agenda: d.description || null,
            project_id: d.project || null,
            organizer_id: profile.id,
          }).select("id").single();
          if (error || !data) return fail(error?.message || "Could not schedule meeting");
          const ids = new Set<string>([profile.id]);
          if (d.assignee) ids.add(d.assignee);
          for (const p of (d.fields.participants || "").split(/[,\s]+/)) if (people.some((x) => x.id === p)) ids.add(p);
          await supabase.from("meeting_participants").insert([...ids].map((user_id) => ({ meeting_id: data.id, user_id })));
          return done(`/meetings/${data.id}`, "Meeting scheduled", { id: data.id });
        }
        case "help_request":
        case "escalation": {
          const dept = d.department || (d.kind === "escalation" ? techDept : null);
          if (!dept) return fail("Pick the department to ask");
          const details = d.kind === "escalation" ? d.body || d.description || null : d.description || d.body || null;
          const { data, error } = await supabase.from("help_requests").insert({
            org_id: orgId,
            requester_id: profile.id,
            requester_department_id: profile.department_id || null,
            department_id: dept,
            service_id: d.service || null,
            title: d.title.trim(),
            details,
            priority: d.priority,
            deadline: d.due ? new Date(`${d.due}${d.due.length === 10 ? "T18:00" : ""}`).toISOString() : null,
            form_data: d.fields as Json,
            project_id: d.project || null,
          }).select("id").single();
          if (error || !data) return fail(error?.message || "Could not send the request");
          return done(`/help/${data.id}`, d.kind === "escalation" ? "Escalated to IT — they have been notified" : "Request sent — the department will acknowledge it", { id: data.id });
        }
        case "leave_request": {
          const from = d.fields.from;
          const to = d.fields.to || d.fields.from;
          if (!from) return fail("Pick the dates");
          const types = lookups.leaveTypes || [];
          const want = (d.fields.leave_type || "").toLowerCase();
          const lt = types.find((t) => t.id === want) || types.find((t) => t.code.toLowerCase() === want) || types.find((t) => t.name.toLowerCase() === want) || types.find((t) => want && t.name.toLowerCase().includes(want)) || null;
          const { data, error } = await supabase.from("leaves").insert({
            org_id: orgId,
            user_id: profile.id,
            leave_type_id: lt?.id || null,
            kind: lt?.code || "leave",
            starts_on: from,
            ends_on: to,
            half_day: d.fields.half_day === "true" || d.fields.half_day === "yes",
            note: d.reason || d.description || null,
          }).select("id").single();
          if (error || !data) return fail(error?.message || "Could not apply for leave");
          if (d.fields.backup_id && people.some((p) => p.id === d.fields.backup_id)) {
            const { error: hErr } = await supabase.rpc("prepare_handover", { p_leave: data.id, p_backup: d.fields.backup_id, p_notes: d.fields.handover_notes || undefined });
            if (hErr) toast.push(`Leave applied, but the handover failed: ${hErr.message}`, "info");
          }
          return done("/leave", "Leave request sent to your manager", { id: data.id });
        }
        case "message_draft": {
          if (!d.channel) return fail("No channel to send to");
          if (!d.body.trim()) return fail("The message is empty");
          const { data, error } = await supabase.from("messages").insert({ channel_id: d.channel, author_id: profile.id, body: d.body.trim(), kind: "text" }).select("id").single();
          if (error || !data) return fail(error?.message || "Could not send");
          return done(`/chat/${d.channel}`, "Sent", { id: data.id });
        }
        case "knowledge_article": {
          const { data, error } = await supabase.from("ai_knowledge").insert({
            org_id: orgId,
            title: d.title.trim(),
            body: d.body || d.description || "",
            department_id: d.department || profile.department_id || null,
            kind: d.fields.kind || "guide",
            status: "draft",
            source_type: "conversation",
            source_id: conversationId,
            created_by: profile.id,
          }).select("id").single();
          if (error || !data) return fail(error?.message || "Could not save the draft");
          return done(`/wiki/knowledge/${data.id}`, "Draft sent to your department's knowledge owner for approval", { id: data.id });
        }
        case "access_request": {
          if (!d.resourceType || !d.resourceId) return fail("Missing resource");
          if (!d.reason.trim()) return fail("Say why you need access");
          const duration = d.fields.duration || (d.resourceType === "project" ? "project_active" : "once");
          const { data, error } = await supabase.from("access_requests").insert({
            org_id: orgId,
            requester_id: profile.id,
            resource_type: d.resourceType,
            resource_id: d.resourceId,
            resource_label: d.title.trim(),
            level: d.fields.level || "view",
            reason: d.reason.trim(),
            duration,
            until_at: duration === "until_date" && d.due ? new Date(`${d.due}T23:59:59`).toISOString() : null,
            project_id: d.resourceType === "project" ? d.resourceId : null,
          }).select("id").single();
          if (error || !data) return fail(error?.message || "Could not send the request");
          return done("/inbox", "Access request sent to the data owner", { id: data.id });
        }
        case "bring_in": {
          if (!d.channel || !d.person) return fail("Pick the person to bring in");
          const { error } = await supabase.rpc("bring_in", { p_channel: d.channel, p_user: d.person, p_reason: d.reason || undefined });
          if (error) return fail(error.message);
          return done(`/chat/${d.channel}`, "They have been brought in and can catch up", { id: d.person });
        }
        case "war_room": {
          const { data, error } = await supabase.rpc("start_war_room", { p_title: d.title.trim(), p_severity: d.fields.severity || "high", p_department: d.department || techDept || undefined, p_summary: d.description || d.body || undefined });
          if (error || !data) return fail(error?.message || "Could not start the war room");
          const { data: inc } = await supabase.from("incidents").select("channel_id").eq("id", data).maybeSingle();
          const link = inc?.channel_id ? `/chat/${inc.channel_id}` : `/help/incidents/${data}`;
          return done(link, "War room started — the team has been alerted", { id: data });
        }
        case "focus": {
          const tasks = lookups.myTasks || [];
          const want = d.title.trim().toLowerCase();
          const task = tasks.find((t) => t.id === d.fields.task_id) || tasks.find((t) => t.title.toLowerCase() === want) || tasks.find((t) => want && t.title.toLowerCase().includes(want)) || null;
          const { data, error } = await supabase.rpc("start_focus", { p_task: task?.id || undefined, p_note: task ? undefined : d.title.trim() || undefined });
          if (error) return fail(error.message);
          return done(task ? `/tasks/${task.id}` : "/attendance", task ? `Focus started on “${task.title}”` : "Focus session started", { id: data || null });
        }
        case "learning": {
          const { data, error } = await supabase.from("learning_interests").insert({ user_id: profile.id, topic: d.title.trim(), note: d.description || null }).select("id").single();
          if (error || !data) return fail(error?.message || "Could not save");
          return done("/academy", "Saved — you'll see matching courses in GHL Academy", { id: data.id });
        }
        case "commitment": {
          const { data, error } = await supabase.from("commitments").insert({ org_id: profile.org_id, promised_by: profile.id, promised_to_user: d.person || null, promised_to_label: d.fields.to_label || null, text: d.title.trim(), due_at: d.due ? new Date(d.due).toISOString() : null, source_type: "buddy" } as never).select("id").single();
          if (error || !data) return fail(error?.message || "Could not record the promise");
          return done("/my-work", "Promise recorded — it will remind you before it is due", { id: (data as { id: string }).id });
        }
        case "request": {
          const kind = d.fields.kind || "other";
          const amount = d.fields.amount ? Number(String(d.fields.amount).replace(/[^0-9.]/g, "")) : null;
          const { data, error } = await supabase.from("requests").insert({ org_id: profile.org_id, user_id: profile.id, kind, title: d.title.trim(), details: d.description || null, amount: amount != null && Number.isFinite(amount) ? amount : null, starts_on: d.fields.from || null, ends_on: d.fields.to || d.fields.from || null, payload: { ...d.fields, source: "buddy" } } as never).select("id").single();
          if (error || !data) return fail(error?.message || "Could not submit the request");
          return done("/requests", "Request submitted — routed to your approver", { id: (data as { id: string }).id });
        }
        case "admin_action": {
          const params = new URLSearchParams({ tab: "people", propose: d.fields.action || "", user: d.person || "", target: d.fields.target || "", reason: d.reason || d.description || "" });
          const link = `/admin/organization?${params.toString()}`;
          toast.push("Opened for human review — nothing changes until you apply it there", "info");
          setStatus(i, "created", { link, note: "Review and apply in Organization Control" });
          void markAction(d, "performed", { handed_to: "organization_control" });
          return true;
        }
      }
    } catch (e) {
      return fail((e as Error).message || "Something went wrong");
    }
    return false;
  }, [drafts, profile, people, techDept, lookups.leaveTypes, lookups.myTasks, conversationId, toast, router, markAction, setStatus]);

  const confirmAll = async () => {
    setBusyAll(true);
    for (let i = 0; i < drafts.length; i++) if (drafts[i].status === "pending") await confirm(i);
    setBusyAll(false);
  };

  if (!drafts.length) return null;
  const pending = drafts.filter((d) => d.status === "pending");

  return (
    <div className={cn("rounded-[var(--radius)] border bg-[var(--bg-sunken)] p-2 space-y-2", className)}>
      <div className="flex items-center justify-between gap-2 px-1 flex-wrap">
        <span className="eyebrow">{readOnly ? "Drafts" : "Proposed actions"} · {drafts.length}</span>
        {readOnly ? (
          <span className="text-[11px] text-muted">Draft only — ask your admin to enable actions</span>
        ) : pending.length > 1 ? (
          <span className="inline-flex items-center gap-2 text-[11px] text-muted">
            <span className="hidden sm:inline">{previewLine(pending)} Continue?</span>
            <Button size="xs" variant="primary" loading={busyAll} onClick={confirmAll}><Check size={12} /> Confirm all ({pending.length})</Button>
          </span>
        ) : null}
      </div>
      {!readOnly && pending.length > 1 && <div className="sm:hidden text-[11px] text-muted px-1 -mt-1">{previewLine(pending)} Continue?</div>}
      {drafts.map((d, i) => (
        <ProposalCard
          key={`${d.kind}-${i}`}
          draft={d}
          readOnly={readOnly}
          lookups={lookups}
          onChange={(patch) => update(i, patch)}
          onConfirm={() => confirm(i)}
          onDismiss={() => dismiss(i)}
          onNavigate={onNavigate}
          onCopy={async () => {
            try {
              await navigator.clipboard.writeText(d.body || d.description || d.title);
              toast.push("Copied", "success");
            } catch {
              toast.push("Could not copy", "danger");
            }
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ card ---- */

function ProposalCard({ draft: d, readOnly, lookups, onChange, onConfirm, onDismiss, onNavigate, onCopy }: {
  draft: Draft;
  readOnly: boolean;
  lookups: Lookups;
  onChange: (patch: Partial<Draft>) => void;
  onConfirm: () => void;
  onDismiss: () => void;
  onNavigate?: () => void;
  onCopy: () => void;
}) {
  const meta = KIND_META[d.kind];
  const setField = (k: string, v: string) => onChange({ fields: { ...d.fields, [k]: v } });
  const channelName = d.channel ? lookups.channels?.[d.channel] : undefined;

  if (d.status === "dismissed") return <div className="text-xs text-muted px-2 py-1 line-through truncate">{meta.label}: {d.title || d.body.slice(0, 60)}</div>;
  if (d.status === "created") {
    return (
      <div className="card px-3 py-2 flex items-center gap-2 text-sm">
        <Check size={15} className="text-success shrink-0" />
        <span className="min-w-0 flex-1 truncate">{d.title || meta.label}</span>
        {d.link && <Link href={d.link} onClick={onNavigate} className="btn btn-secondary btn-xs shrink-0">Open</Link>}
      </div>
    );
  }

  const creating = d.status === "creating";
  const dis = readOnly || creating;

  return (
    <div className="card p-3 space-y-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <Pill tone="tone-violet"><span className="inline-flex items-center gap-1">{meta.icon}{meta.label}</span></Pill>
        {d.reason && d.kind !== "access_request" && d.kind !== "bring_in" && <span className="text-[11px] text-muted truncate" title={d.reason}>{d.reason}</span>}
      </div>

      {d.kind !== "message_draft" && d.kind !== "bring_in" && (
        <Input value={d.title} onChange={(e) => onChange({ title: e.target.value })} placeholder={d.kind === "focus" ? "Task title" : d.kind === "learning" ? "Topic" : "Title"} aria-label="Title" disabled={dis} />
      )}

      {d.kind === "task" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Assign to"><PersonPicker value={d.assignee} onChange={(v) => onChange({ assignee: v })} disabled={dis} /></Field>
            <Field label="Priority"><PriorityPicker value={d.priority} onChange={(v) => onChange({ priority: v })} disabled={dis} /></Field>
            <Field label="Deadline"><Input type="datetime-local" value={d.due} onChange={(e) => onChange({ due: e.target.value })} disabled={dis} /></Field>
            <Field label="Project"><ProjectPicker value={d.project} onChange={(v) => onChange({ project: v })} projects={lookups.projects} disabled={dis} /></Field>
          </div>
          {(d.description || !readOnly) && <Textarea value={d.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Description (optional)" className="!min-h-[56px] text-sm" disabled={dis} />}
        </>
      )}

      {d.kind === "decision" && (
        <div className="grid grid-cols-1 gap-2">
          <Field label="Decision"><Textarea value={d.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="What was decided" className="!min-h-[56px]" disabled={dis} /></Field>
          <Field label="Reason"><Input value={d.reason} onChange={(e) => onChange({ reason: e.target.value })} placeholder="Why (optional)" disabled={dis} /></Field>
          <Field label="Project"><ProjectPicker value={d.project} onChange={(v) => onChange({ project: v })} projects={lookups.projects} disabled={dis} /></Field>
        </div>
      )}

      {d.kind === "meeting" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Starts"><Input type="datetime-local" value={d.due} onChange={(e) => onChange({ due: e.target.value })} disabled={dis} /></Field>
          <Field label="With"><PersonPicker value={d.assignee} onChange={(v) => onChange({ assignee: v })} placeholder="Just me" disabled={dis} /></Field>
          <Field label="Project" className="col-span-2"><ProjectPicker value={d.project} onChange={(v) => onChange({ project: v })} projects={lookups.projects} disabled={dis} /></Field>
          <Field label="Agenda" className="col-span-2"><Textarea value={d.description} onChange={(e) => onChange({ description: e.target.value })} className="!min-h-[56px]" disabled={dis} /></Field>
        </div>
      )}

      {(d.kind === "help_request" || d.kind === "escalation") && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Department"><DepartmentPicker value={d.department} onChange={(v) => onChange({ department: v, service: "" })} placeholder="Pick a department" disabled={dis} /></Field>
          <Field label="Priority"><PriorityPicker value={d.priority} onChange={(v) => onChange({ priority: v })} disabled={dis} /></Field>
          {lookups.services && lookups.services.some((s) => s.department_id === d.department) && (
            <Field label="Request type">
              <Select value={d.service} onChange={(e) => onChange({ service: e.target.value })} disabled={dis}>
                <option value="">Something else</option>
                {lookups.services.filter((s) => s.department_id === d.department).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Needed by"><Input type="date" value={d.due} onChange={(e) => onChange({ due: e.target.value })} disabled={dis} /></Field>
          <Field label="Details" className="col-span-2">
            <Textarea value={d.kind === "escalation" ? d.body || d.description : d.description || d.body} onChange={(e) => onChange(d.kind === "escalation" ? { body: e.target.value } : { description: e.target.value })} className="!min-h-[72px] text-sm" disabled={dis} />
          </Field>
        </div>
      )}

      {d.kind === "leave_request" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Leave type" className="col-span-2">
            <Select value={d.fields.leave_type || ""} onChange={(e) => setField("leave_type", e.target.value)} disabled={dis}>
              <option value="">Pick a type</option>
              {(lookups.leaveTypes || []).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
              {d.fields.leave_type && !(lookups.leaveTypes || []).some((t) => t.id === d.fields.leave_type) && <option value={d.fields.leave_type}>{d.fields.leave_type}</option>}
            </Select>
          </Field>
          <Field label="From"><Input type="date" value={d.fields.from || ""} onChange={(e) => setField("from", e.target.value)} disabled={dis} /></Field>
          <Field label="To"><Input type="date" value={d.fields.to || ""} onChange={(e) => setField("to", e.target.value)} disabled={dis} /></Field>
          <label className="inline-flex items-center gap-2 text-sm col-span-2">
            <input type="checkbox" checked={d.fields.half_day === "true" || d.fields.half_day === "yes"} onChange={(e) => setField("half_day", e.target.checked ? "true" : "false")} disabled={dis} /> Half day
          </label>
          <Field label="Backup person" className="col-span-2"><PersonPicker value={d.fields.backup_id || ""} onChange={(v) => setField("backup_id", v)} placeholder="No handover" disabled={dis} /></Field>
          <Field label="Reason" className="col-span-2"><Input value={d.reason} onChange={(e) => onChange({ reason: e.target.value })} disabled={dis} /></Field>
        </div>
      )}

      {d.kind === "bug_report" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Severity">
            <Select value={(d.fields.severity || "medium").toLowerCase()} onChange={(e) => { setField("severity", e.target.value); onChange({ fields: { ...d.fields, severity: e.target.value }, priority: SEVERITY_PRIORITY[e.target.value] || "normal" }); }} disabled={dis}>
              {["critical", "high", "medium", "low"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </Select>
          </Field>
          <Field label="Environment"><Input value={d.fields.environment || ""} onChange={(e) => setField("environment", e.target.value)} placeholder="prod / staging / browser" disabled={dis} /></Field>
          <Field label="Steps to reproduce" className="col-span-2"><Textarea value={d.fields.steps || ""} onChange={(e) => setField("steps", e.target.value)} className="!min-h-[56px] text-sm" disabled={dis} /></Field>
          <Field label="Expected"><Textarea value={d.fields.expected || ""} onChange={(e) => setField("expected", e.target.value)} className="!min-h-[44px] text-sm" disabled={dis} /></Field>
          <Field label="Actual"><Textarea value={d.fields.actual || ""} onChange={(e) => setField("actual", e.target.value)} className="!min-h-[44px] text-sm" disabled={dis} /></Field>
        </div>
      )}

      {d.kind === "message_draft" && (
        <div className="space-y-2">
          <div className="text-[11px] text-muted">To {channelName ? `#${channelName}` : d.channel ? "a conversation" : "— no channel chosen"}. Review before sending — nothing is sent automatically.</div>
          <Textarea value={d.body} onChange={(e) => onChange({ body: e.target.value })} className="!min-h-[96px] text-sm" disabled={dis} />
        </div>
      )}

      {d.kind === "knowledge_article" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Department"><DepartmentPicker value={d.department} onChange={(v) => onChange({ department: v })} placeholder="Company-wide" disabled={dis} /></Field>
            <Field label="Kind">
              <Select value={d.fields.kind || "guide"} onChange={(e) => setField("kind", e.target.value)} disabled={dis}>
                {["sop", "policy", "faq", "script", "objection", "guide", "incident", "positioning", "checklist", "template"].map((k) => <option key={k} value={k}>{k.toUpperCase()}</option>)}
              </Select>
            </Field>
          </div>
          <Textarea value={d.body || d.description} onChange={(e) => onChange({ body: e.target.value })} className="!min-h-[96px] text-sm" placeholder="Article body (markdown)" disabled={dis} />
        </div>
      )}

      {d.kind === "access_request" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 text-[11px] text-muted">Resource: {d.resourceType || "?"} · {d.resourceId.slice(0, 8)}…</div>
          <Field label="Level">
            <Select value={d.fields.level || "view"} onChange={(e) => setField("level", e.target.value)} disabled={dis}>
              {["view", "comment", "edit", "download"].map((l) => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>)}
            </Select>
          </Field>
          <Field label="For how long">
            <Select value={d.fields.duration || (d.resourceType === "project" ? "project_active" : "once")} onChange={(e) => setField("duration", e.target.value)} disabled={dis}>
              <option value="once">Once (24 hours)</option>
              <option value="until_date">Until a date</option>
              {d.resourceType === "project" && <option value="project_active">While the project is active</option>}
              <option value="permanent">Permanent</option>
            </Select>
          </Field>
          {d.fields.duration === "until_date" && <Field label="Until" className="col-span-2"><Input type="date" value={d.due} onChange={(e) => onChange({ due: e.target.value })} disabled={dis} /></Field>}
          <Field label="Why do you need it?" className="col-span-2"><Textarea value={d.reason} onChange={(e) => onChange({ reason: e.target.value })} className="!min-h-[56px] text-sm" disabled={dis} /></Field>
        </div>
      )}

      {d.kind === "bring_in" && (
        <div className="grid grid-cols-1 gap-2">
          <Field label="Who"><PersonPicker value={d.person} onChange={(v) => onChange({ person: v })} placeholder="Pick a person" disabled={dis} /></Field>
          <div className="text-[11px] text-muted">Into {channelName ? `#${channelName}` : "this conversation"} — they get “Catch me up” so they don&apos;t need the whole history.</div>
          <Field label="Reason"><Input value={d.reason} onChange={(e) => onChange({ reason: e.target.value })} placeholder="Why they are needed" disabled={dis} /></Field>
        </div>
      )}

      {d.kind === "war_room" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Department"><DepartmentPicker value={d.department} onChange={(v) => onChange({ department: v })} placeholder="IT" disabled={dis} /></Field>
          <Field label="Severity">
            <Select value={d.fields.severity || "high"} onChange={(e) => setField("severity", e.target.value)} disabled={dis}>
              {["critical", "high", "medium"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </Select>
          </Field>
          <Field label="What is happening" className="col-span-2"><Textarea value={d.description || d.body} onChange={(e) => onChange({ description: e.target.value })} className="!min-h-[56px] text-sm" disabled={dis} /></Field>
        </div>
      )}

      {d.kind === "focus" && lookups.myTasks && (
        <Field label="Task">
          <Select value={d.fields.task_id || ""} onChange={(e) => setField("task_id", e.target.value)} disabled={dis}>
            <option value="">Match by title</option>
            {lookups.myTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </Select>
        </Field>
      )}

      {d.kind === "learning" && <Input value={d.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Why / what you want to get out of it (optional)" disabled={dis} />}

      {d.kind === "commitment" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Promised to"><PersonPicker value={d.person} onChange={(v) => onChange({ person: v || "" })} placeholder="Someone in GHL (optional)" /></Field>
          <Field label="Or an outside party"><Input value={d.fields.to_label || ""} onChange={(e) => setField("to_label", e.target.value)} placeholder="e.g. Mr Sharma (customer)" disabled={dis} /></Field>
          <Field label="Due"><Input type="datetime-local" value={d.due} onChange={(e) => onChange({ due: e.target.value })} disabled={dis} /></Field>
        </div>
      )}

      {d.kind === "request" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Kind">
            <Select value={d.fields.kind || "other"} onChange={(e) => setField("kind", e.target.value)} disabled={dis}>
              {["expense", "travel", "purchase", "wfh", "field_duty", "late_explanation", "overtime", "comp_off", "training", "other"].map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
            </Select>
          </Field>
          <Field label="Amount (INR, if any)"><Input value={d.fields.amount || ""} onChange={(e) => setField("amount", e.target.value)} placeholder="0" disabled={dis} /></Field>
          <Field label="From"><Input type="date" value={d.fields.from || ""} onChange={(e) => setField("from", e.target.value)} disabled={dis} /></Field>
          <Field label="To"><Input type="date" value={d.fields.to || ""} onChange={(e) => setField("to", e.target.value)} disabled={dis} /></Field>
          <div className="sm:col-span-2"><Textarea value={d.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Details for the approver" className="!min-h-[60px] text-sm" disabled={dis} /></div>
        </div>
      )}

      {d.kind === "admin_action" && (
        <div className="text-xs space-y-1">
          <div className="card tone-warn p-2">Buddy never changes the organisation by itself. This opens the proposal in Organization Control where a human reviews the impact and applies it.</div>
          <div><span className="text-muted">Action:</span> <strong>{(d.fields.action || "change").replace(/_/g, " ")}</strong>{d.fields.target ? <> to <strong>{d.fields.target}</strong></> : null}</div>
          <Field label="Person affected"><PersonPicker value={d.person} onChange={(v) => onChange({ person: v || "" })} placeholder="Who" /></Field>
          <Field label="Reason"><Input value={d.reason} onChange={(e) => onChange({ reason: e.target.value })} placeholder="Why this change" disabled={dis} /></Field>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-0.5 flex-wrap">
        {d.kind === "message_draft" && <Button size="sm" variant="ghost" onClick={onCopy}><Copy size={13} /> Copy</Button>}
        <Button size="sm" variant="ghost" onClick={onDismiss} disabled={creating}>Dismiss</Button>
        {!readOnly && (
          <Button size="sm" variant="primary" onClick={onConfirm} loading={creating} disabled={d.kind === "message_draft" && !d.channel}>
            {d.kind === "message_draft" ? <><Send size={13} /> Send to {channelName ? `#${channelName}` : "channel"}</> : meta.cta}
          </Button>
        )}
      </div>
    </div>
  );
}
