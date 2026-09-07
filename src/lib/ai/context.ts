import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Permission-safe context builders. Every query runs through the caller's own
 * Supabase client, so Row Level Security decides what the AI may see.
 * Output is compact text designed for the model, with app links it can cite.
 */
export type DB = SupabaseClient<Database>;

const IST = "Asia/Kolkata";
export function fmt(d?: string | null, withTime = false) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleString("en-IN", { timeZone: IST, day: "2-digit", month: "short", ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}) });
}
export function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: IST });
}

type PersonLite = { id: string; full_name: string; designation: string | null; department_id: string | null; role: string };

export async function peopleDirectory(db: DB) {
  const [{ data: people }, { data: depts }] = await Promise.all([
    db.from("profiles").select("id,full_name,designation,department_id,role").eq("is_active", true).order("full_name"),
    db.from("departments").select("id,name,slug").order("position"),
  ]);
  const deptName = (id: string | null) => depts?.find((d) => d.id === id)?.name || "";
  return {
    people: (people || []) as PersonLite[],
    departments: depts || [],
    text: ["People (id | name | designation | department):", ...(people || []).map((p) => `${p.id} | ${p.full_name} | ${p.designation || "—"} | ${deptName(p.department_id)}`), "", "Departments (id | name):", ...(depts || []).map((d) => `${d.id} | ${d.name}`)].join("\n"),
  };
}

function taskLine(t: { id: string; title: string; status: string; priority: string; due_date: string | null; assignee_id?: string | null; waiting_on?: string; waiting_on_user_id?: string | null; project?: { name: string } | null }, name: (id?: string | null) => string) {
  const bits = [`[${t.title}](/tasks/${t.id})`, `status=${t.status}`, `priority=${t.priority}`];
  if (t.due_date) bits.push(`due=${fmt(t.due_date, true)}${new Date(t.due_date) < new Date() && !["done", "cancelled"].includes(t.status) ? " (OVERDUE)" : ""}`);
  if (t.assignee_id !== undefined) bits.push(`assignee=${name(t.assignee_id)}`);
  if (t.waiting_on && t.waiting_on !== "none") bits.push(`waiting_on=${t.waiting_on}${t.waiting_on_user_id ? ` (${name(t.waiting_on_user_id)})` : ""}`);
  if (t.project?.name) bits.push(`project=${t.project.name}`);
  return "- " + bits.join(" · ");
}

/** Everything about "me": my tasks, what waits on me, approvals, meetings, mentions, projects. */
export async function myWorkContext(db: DB, userId: string) {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString();
  const dir = await peopleDirectory(db);
  const name = (id?: string | null) => dir.people.find((p) => p.id === id)?.full_name || "Unassigned";
  const cols = "id,title,status,priority,due_date,assignee_id,waiting_on,waiting_on_user_id,project:projects(name)";
  const [{ data: mine }, { data: waitingOnMe }, { data: approvals }, { data: meetings }, { data: mentions }, { data: memberships }, { data: delegated }] = await Promise.all([
    db.from("tasks").select(cols).eq("assignee_id", userId).not("status", "in", "(done,cancelled)").is("parent_id", null).order("due_date", { ascending: true, nullsFirst: false }).limit(40),
    db.from("tasks").select(cols).eq("waiting_on_user_id", userId).not("status", "in", "(done,cancelled)").limit(20),
    db.from("approvals").select("id,title,type,created_at,requested_by,priority,amount").eq("approver_id", userId).eq("status", "pending").order("created_at").limit(15),
    db.from("meetings").select("id,title,starts_at,project_id,agenda").gte("starts_at", new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()).lte("starts_at", in7).order("starts_at").limit(10),
    db.from("notifications").select("id,title,body,link,created_at").eq("user_id", userId).is("read_at", null).order("created_at", { ascending: false }).limit(15),
    db.from("project_members").select("project:projects(id,name,status,due_date,progress)").eq("user_id", userId),
    db.from("tasks").select(cols).eq("delegated_by", userId).neq("assignee_id", userId).not("status", "in", "(done,cancelled)").limit(20),
  ]);
  const projects = (memberships || []).map((m) => m.project).filter(Boolean) as { id: string; name: string; status: string; due_date: string | null; progress: number }[];
  const text = [
    `Today (IST): ${todayIST()}`,
    `## My open tasks (${mine?.length || 0})`,
    ...(mine || []).map((t) => taskLine(t, name)),
    `## Waiting on me (${waitingOnMe?.length || 0}) — others are blocked until I act`,
    ...(waitingOnMe || []).map((t) => taskLine(t, name)),
    `## Delegated by me to others (${delegated?.length || 0})`,
    ...(delegated || []).map((t) => taskLine(t, name)),
    `## Approvals waiting for my decision (${approvals?.length || 0})`,
    ...(approvals || []).map((a) => `- [${a.title}](/approvals/${a.id}) · ${a.type} · from ${name(a.requested_by)} · requested ${fmt(a.created_at)}${a.amount ? ` · ₹${Number(a.amount).toLocaleString("en-IN")}` : ""}`),
    `## Meetings next 7 days (${meetings?.length || 0})`,
    ...(meetings || []).map((m) => `- [${m.title}](/meetings/${m.id}) · ${fmt(m.starts_at, true)}${m.agenda ? ` · agenda: ${m.agenda.slice(0, 120)}` : ""}`),
    `## Unread notifications (${mentions?.length || 0})`,
    ...(mentions || []).map((n) => `- ${n.title}${n.body ? ` — ${n.body.slice(0, 100)}` : ""}${n.link ? ` (${n.link})` : ""}`),
    `## My projects (${projects.length})`,
    ...projects.map((p) => `- [${p.name}](/projects/${p.id}) · ${p.status} · ${p.progress}%${p.due_date ? ` · due ${fmt(p.due_date)}` : ""}`),
  ].join("\n");
  return { text, dir, counts: { open: mine?.length || 0, waitingOnMe: waitingOnMe?.length || 0, approvals: approvals?.length || 0, meetings: meetings?.length || 0, mentions: mentions?.length || 0 } };
}

/** Company-wide state. RPCs return nothing for non-managers, so this is naturally gated. */
export async function companyContext(db: DB) {
  const dir = await peopleDirectory(db);
  const name = (id?: string | null) => dir.people.find((p) => p.id === id)?.full_name || "Unassigned";
  const deptName = (id?: string | null) => dir.departments.find((d) => d.id === id)?.name || "—";
  const now = new Date().toISOString();
  const cols = "id,title,status,priority,due_date,assignee_id,waiting_on,waiting_on_user_id,department_id,project:projects(name)";
  const [{ data: pulse }, { data: depts }, { data: workload }, { data: critical }, { data: waiting }, { data: overdue }, { data: projects }, { data: approvals }, { data: risks }, { data: decisions }, { data: deps }] = await Promise.all([
    db.rpc("company_pulse"),
    db.rpc("department_health"),
    db.rpc("workload"),
    db.from("tasks").select(cols).not("status", "in", "(done,cancelled)").in("priority", ["critical", "urgent"]).is("parent_id", null).limit(25),
    db.from("tasks").select(cols).not("status", "in", "(done,cancelled)").neq("waiting_on", "none").is("parent_id", null).limit(60),
    db.from("tasks").select(cols).not("status", "in", "(done,cancelled)").lt("due_date", now).is("parent_id", null).order("due_date").limit(40),
    db.from("projects").select("id,name,status,due_date,progress,department_id,owner_id,priority").eq("archived", false).not("status", "in", "(completed,cancelled)").order("due_date", { ascending: true, nullsFirst: false }).limit(40),
    db.from("approvals").select("id,title,type,created_at,approver_id,requested_by,priority,project_id").eq("status", "pending").order("created_at").limit(40),
    db.from("project_risks").select("id,title,severity,project_id,owner_id,mitigation,project:projects(name)").is("resolved_at", null).limit(20),
    db.from("decisions").select("id,title,decided_at,decided_by,project_id").order("decided_at", { ascending: false }).limit(10),
    db.from("task_dependencies").select("task_id,depends_on_id").limit(400),
  ]);
  const blocking = new Map<string, number>();
  for (const d of deps || []) blocking.set(d.depends_on_id, (blocking.get(d.depends_on_id) || 0) + 1);
  const text = [
    `Today (IST): ${todayIST()}`,
    `## Company pulse`,
    JSON.stringify(pulse),
    `## Department health (name | people | open | overdue | blocked | critical | projects | at_risk | pending_approvals)`,
    ...((depts || []) as { name: string; people: number; open_tasks: number; overdue: number; blocked: number; critical: number; projects: number; at_risk: number; pending_approvals: number; slug: string }[]).filter((d) => d.people || d.open_tasks || d.projects).map((d) => `- [${d.name}](/departments/${d.slug}) | ${d.people} | ${d.open_tasks} | ${d.overdue} | ${d.blocked} | ${d.critical} | ${d.projects} | ${d.at_risk} | ${d.pending_approvals}`),
    `## Workload (person | open | urgent | overdue | blocked | waiting | due this week | on leave)`,
    ...((workload || []) as { user_id: string; full_name: string; open_tasks: number; urgent: number; overdue: number; blocked: number; waiting: number; due_week: number; on_leave: boolean }[]).map((w) => `- [${w.full_name}](/people/${w.user_id}) | ${w.open_tasks} | ${w.urgent} | ${w.overdue} | ${w.blocked} | ${w.waiting} | ${w.due_week} | ${w.on_leave ? "on leave" : ""}`),
    `## Active projects (${projects?.length || 0})`,
    ...(projects || []).map((p) => `- [${p.name}](/projects/${p.id}) · ${p.status} · ${p.progress}% · owner ${name(p.owner_id)} · dept ${deptName(p.department_id)}${p.due_date ? ` · due ${fmt(p.due_date)}${new Date(p.due_date) < new Date() ? " (LATE)" : ""}` : ""} · priority ${p.priority}`),
    `## Critical & urgent tasks (${critical?.length || 0})`,
    ...(critical || []).map((t) => taskLine(t, name)),
    `## Overdue tasks (${overdue?.length || 0})`,
    ...(overdue || []).map((t) => taskLine(t, name) + (blocking.get(t.id) ? ` · BLOCKS ${blocking.get(t.id)} other task(s)` : "")),
    `## Waiting / blocked tasks (${waiting?.length || 0})`,
    ...(waiting || []).map((t) => taskLine(t, name) + ` · dept ${deptName(t.department_id)}`),
    `## Pending approvals (${approvals?.length || 0})`,
    ...(approvals || []).map((a) => `- [${a.title}](/approvals/${a.id}) · ${a.type} · approver ${name(a.approver_id)} · from ${name(a.requested_by)} · waiting since ${fmt(a.created_at)}${Date.now() - new Date(a.created_at).getTime() > 48 * 3600e3 ? " (STALE >48h)" : ""}`),
    `## Open risks (${risks?.length || 0})`,
    ...(risks || []).map((r) => `- ${r.title} · ${r.severity} · project ${r.project?.name || "—"} (/projects/${r.project_id}) · owner ${name(r.owner_id)}${r.mitigation ? ` · mitigation: ${r.mitigation}` : ""}`),
    `## Recent decisions`,
    ...(decisions || []).map((d) => `- [${d.title}](/decisions/${d.id}) · ${name(d.decided_by)} · ${fmt(d.decided_at)}`),
  ].join("\n");
  return { text, dir, forbidden: !!(pulse as { error?: string } | null)?.error };
}

export async function projectContext(db: DB, projectId: string) {
  const dir = await peopleDirectory(db);
  const name = (id?: string | null) => dir.people.find((p) => p.id === id)?.full_name || "Unassigned";
  const [{ data: project }, { data: members }, { data: tasks }, { data: milestones }, { data: decisions }, { data: approvals }, { data: meetings }, { data: files }, { data: risks }, { data: channel }, { data: activity }] = await Promise.all([
    db.from("projects").select("*").eq("id", projectId).maybeSingle(),
    db.from("project_members").select("user_id,role").eq("project_id", projectId),
    db.from("tasks").select("id,title,status,priority,due_date,assignee_id,waiting_on,waiting_on_user_id,parent_id,completed_at,updated_at").eq("project_id", projectId).order("position").limit(200),
    db.from("milestones").select("id,title,due_date,completed_at").eq("project_id", projectId).order("position"),
    db.from("decisions").select("id,title,decision,decided_by,decided_at").eq("project_id", projectId).order("decided_at", { ascending: false }).limit(15),
    db.from("approvals").select("id,title,type,status,approver_id,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(15),
    db.from("meetings").select("id,title,starts_at,summary").eq("project_id", projectId).order("starts_at", { ascending: false }).limit(10),
    db.from("files").select("id,name,current_version,updated_at").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(20),
    db.from("project_risks").select("id,title,severity,owner_id,mitigation,resolved_at").eq("project_id", projectId).is("resolved_at", null),
    db.from("channels").select("id").eq("project_id", projectId).eq("type", "project").maybeSingle(),
    db.from("audit_logs").select("action,summary,actor_id,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(25),
  ]);
  if (!project) return null;
  let messagesText = "";
  if (channel?.id) {
    const { data: msgs } = await db.from("messages").select("author_id,body,created_at").eq("channel_id", channel.id).is("parent_id", null).is("deleted_at", null).order("created_at", { ascending: false }).limit(30);
    messagesText = (msgs || []).reverse().map((m) => `- ${fmt(m.created_at, true)} ${name(m.author_id)}: ${m.body.slice(0, 220)}`).join("\n");
  }
  const deps = (await db.from("task_dependencies").select("task_id,depends_on_id").in("task_id", (tasks || []).map((t) => t.id))).data || [];
  const title = (id: string) => tasks?.find((t) => t.id === id)?.title || id;
  const topTasks = (tasks || []).filter((t) => !t.parent_id);
  const done = topTasks.filter((t) => t.status === "done").length;
  const text = [
    `Today (IST): ${todayIST()}`,
    `# Project: [${project.name}](/projects/${project.id})`,
    `status=${project.status} · priority=${project.priority} · progress=${topTasks.length ? Math.round((done / topTasks.length) * 100) : 0}% (${done}/${topTasks.length} tasks) · owner=${name(project.owner_id)} · start=${fmt(project.start_date)} · due=${fmt(project.due_date)}${project.due_date && new Date(project.due_date) < new Date() && project.status !== "completed" ? " (LATE)" : ""}`,
    project.description ? `Description: ${project.description}` : "",
    project.objectives ? `Objectives: ${project.objectives}` : "",
    `## Team`,
    ...(members || []).map((m) => `- [${name(m.user_id)}](/people/${m.user_id}) (${m.role})`),
    `## Milestones`,
    ...(milestones || []).map((m) => `- ${m.title} · due ${fmt(m.due_date)} · ${m.completed_at ? "completed" : new Date(m.due_date || 0) < new Date() && m.due_date ? "MISSED" : "open"}`),
    `## Tasks (${topTasks.length})`,
    ...topTasks.map((t) => taskLine(t, name) + (deps.filter((d) => d.task_id === t.id).length ? ` · depends on: ${deps.filter((d) => d.task_id === t.id).map((d) => title(d.depends_on_id)).join(", ")}` : "")),
    `## Decisions`,
    ...(decisions || []).map((d) => `- [${d.title}](/decisions/${d.id}) · ${name(d.decided_by)} · ${fmt(d.decided_at)} · ${d.decision.slice(0, 160)}`),
    `## Approvals`,
    ...(approvals || []).map((a) => `- [${a.title}](/approvals/${a.id}) · ${a.type} · ${a.status} · approver ${name(a.approver_id)} · ${fmt(a.created_at)}`),
    `## Meetings`,
    ...(meetings || []).map((m) => `- [${m.title}](/meetings/${m.id}) · ${fmt(m.starts_at, true)}${m.summary ? ` · ${m.summary.slice(0, 200)}` : ""}`),
    `## Files`,
    ...(files || []).map((f) => `- [${f.name}](/files/${f.id}) v${f.current_version} · ${fmt(f.updated_at)}`),
    `## Open risks`,
    ...(risks || []).map((r) => `- ${r.title} · ${r.severity} · owner ${name(r.owner_id)}${r.mitigation ? ` · ${r.mitigation}` : ""}`),
    `## Recent activity`,
    ...(activity || []).map((a) => `- ${fmt(a.created_at, true)} ${name(a.actor_id)} ${a.action} ${a.summary || ""}`),
    channel?.id ? `## Recent project chat (/chat/${channel.id})\n${messagesText}` : "",
  ].filter(Boolean).join("\n");
  const hash = `${project.updated_at}|${topTasks.length}|${done}|${(tasks || []).reduce((a, t) => (t.updated_at > a ? t.updated_at : a), "")}|${decisions?.length}|${approvals?.length}`;
  return { text, project, dir, hash };
}

export async function meetingContext(db: DB, meetingId: string) {
  const dir = await peopleDirectory(db);
  const name = (id?: string | null) => dir.people.find((p) => p.id === id)?.full_name || "Unknown";
  const [{ data: meeting }, { data: participants }, { data: actions }, { data: decisions }] = await Promise.all([
    db.from("meetings").select("*").eq("id", meetingId).maybeSingle(),
    db.from("meeting_participants").select("user_id").eq("meeting_id", meetingId),
    db.from("meeting_actions").select("id,title,owner_id,due_date,task_id,confirmed").eq("meeting_id", meetingId),
    db.from("decisions").select("id,title").eq("meeting_id", meetingId),
  ]);
  if (!meeting) return null;
  const ids = new Set([...(participants || []).map((p) => p.user_id), meeting.organizer_id].filter(Boolean) as string[]);
  const participantList = dir.people.filter((p) => ids.has(p.id));
  const text = [
    `Meeting: ${meeting.title} · ${fmt(meeting.starts_at, true)} (date ${meeting.starts_at.slice(0, 10)}) · organizer ${name(meeting.organizer_id)}`,
    `Participants (id | name | designation): ${participantList.map((p) => `${p.id} | ${p.full_name} | ${p.designation || ""}`).join("; ")}`,
    meeting.agenda ? `## Agenda\n${meeting.agenda}` : "",
    meeting.notes ? `## Notes\n${meeting.notes}` : "",
    meeting.transcript ? `## Transcript\n${meeting.transcript}` : "",
    actions?.length ? `## Existing action items\n${actions.map((a) => `- ${a.title} · ${name(a.owner_id)} · ${a.due_date || "no date"}${a.task_id ? " · task created" : ""}`).join("\n")}` : "",
    decisions?.length ? `## Existing decisions\n${decisions.map((d) => `- ${d.title}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
  return { text, meeting, participants: participantList, dir };
}

export async function channelContext(db: DB, channelId: string, sinceIso?: string, limit = 150) {
  const dir = await peopleDirectory(db);
  const name = (id?: string | null) => dir.people.find((p) => p.id === id)?.full_name || "Someone";
  const { data: channel } = await db.from("channels").select("id,name,type,project_id").eq("id", channelId).maybeSingle();
  if (!channel) return null;
  let q = db.from("messages").select("id,author_id,body,created_at,parent_id,attachments,kind").eq("channel_id", channelId).is("deleted_at", null).order("created_at", { ascending: false }).limit(limit);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data: msgs } = await q;
  const list = (msgs || []).reverse();
  const text = [
    `Channel: #${channel.name} (/chat/${channel.id}) · ${list.length} messages${sinceIso ? ` since ${fmt(sinceIso, true)}` : ""}`,
    ...list.map((m) => `- [${fmt(m.created_at, true)}] ${name(m.author_id)}${m.parent_id ? " (thread reply)" : ""}: ${m.kind === "voice" ? "(voice note) " : ""}${m.body.slice(0, 400)}${Array.isArray(m.attachments) && (m.attachments as unknown[]).length ? ` [${(m.attachments as unknown[]).length} attachment(s)]` : ""} (msg /chat/${channel.id}?m=${m.id})`),
  ].join("\n");
  return { text, channel, count: list.length, dir };
}

export async function taskContext(db: DB, taskId: string) {
  const dir = await peopleDirectory(db);
  const name = (id?: string | null) => dir.people.find((p) => p.id === id)?.full_name || "Unassigned";
  const [{ data: task }, { data: comments }, { data: history }, { data: subtasks }] = await Promise.all([
    db.from("tasks").select("*, project:projects(id,name)").eq("id", taskId).maybeSingle(),
    db.from("task_comments").select("author_id,body,created_at").eq("task_id", taskId).order("created_at").limit(30),
    db.from("task_history").select("actor_id,field,old_value,new_value,created_at").eq("task_id", taskId).order("created_at", { ascending: false }).limit(20),
    db.from("tasks").select("id,title,status").eq("parent_id", taskId),
  ]);
  if (!task) return null;
  const text = [
    `# Task: [${task.title}](/tasks/${task.id})`,
    `status=${task.status} · priority=${task.priority} · assignee=${name(task.assignee_id)} · owner=${name(task.owner_id)} · delegated_by=${name(task.delegated_by)} · approver=${name(task.approver_id)} · due=${fmt(task.due_date, true)} · waiting_on=${task.waiting_on}${task.waiting_on_user_id ? ` (${name(task.waiting_on_user_id)})` : ""}${task.waiting_note ? ` note: ${task.waiting_note}` : ""} · project=${task.project?.name ? `[${task.project.name}](/projects/${task.project.id})` : "—"}`,
    task.description ? `Description: ${task.description}` : "",
    subtasks?.length ? `Subtasks: ${subtasks.map((s) => `${s.title} (${s.status})`).join("; ")}` : "",
    `## Comments`,
    ...(comments || []).map((c) => `- ${fmt(c.created_at, true)} ${name(c.author_id)}: ${c.body.slice(0, 300)}`),
    `## History`,
    ...(history || []).map((h) => `- ${fmt(h.created_at, true)} ${name(h.actor_id)} ${h.field}: ${h.old_value || "—"} → ${h.new_value || "—"}`),
  ].filter(Boolean).join("\n");
  return { text, task, dir };
}

export async function decisionsContext(db: DB, projectId?: string | null, q?: string) {
  const dir = await peopleDirectory(db);
  const name = (id?: string | null) => dir.people.find((p) => p.id === id)?.full_name || "Unknown";
  let query = db.from("decisions").select("id,title,decision,reason,decided_by,decided_at,project_id,meeting_id,channel_id,message_id,follow_up").order("decided_at", { ascending: false }).limit(25);
  if (projectId) query = query.eq("project_id", projectId);
  if (q) query = query.or(`title.ilike.%${q}%,decision.ilike.%${q}%,reason.ilike.%${q}%`);
  const { data } = await query;
  return (data || []).map((d) => `- [${d.title}](/decisions/${d.id}) · ${name(d.decided_by)} · ${fmt(d.decided_at)} · decision: ${d.decision.slice(0, 240)}${d.reason ? ` · reason: ${d.reason.slice(0, 200)}` : ""}${d.meeting_id ? ` · from meeting /meetings/${d.meeting_id}` : ""}${d.message_id && d.channel_id ? ` · from chat /chat/${d.channel_id}?m=${d.message_id}` : ""}${d.follow_up ? ` · follow-up: ${d.follow_up}` : ""}`).join("\n") || "No decisions found.";
}
