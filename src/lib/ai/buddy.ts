import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Ctx } from "./route";
import { companyContext, decisionsContext, myWorkContext, projectContext, taskContext, channelContext, meetingContext, peopleDirectory, todayIST } from "./context";
import { isManagerPlus, isLeadPlus } from "@/lib/utils";
import type { BuddyAssistantKey, BuddyAttachment, BuddyContextItem, BuddyMode, BuddyProposal, BuddyRestrictedHit, BuddyScope } from "./types";

/* ------------------------------------------------------------------ assistant selection ---- */

export type AssistantRow = { key: string; name: string; personality: string; enabled: boolean; department_ids: string[] | null; action_level: number; data_scopes: string[]; daily_limit: number | null; model: string | null };

const DEPT_TO_KEY: Record<string, BuddyAssistantKey> = {
  technology: "it", sales: "sales", bizdev: "sales", "investor-relations": "sales", support: "support", design: "design",
  content: "content", marketing: "content", hr: "hr", admin: "hr",
};

export async function loadAssistants(ctx: Ctx) {
  const { data } = await ctx.db.from("ai_assistants").select("key,name,personality,enabled,department_ids,action_level,data_scopes,daily_limit,model").eq("org_id", ctx.orgId).order("position");
  return (data || []) as AssistantRow[];
}

export function pickAssistant(rows: AssistantRow[], params: { override?: BuddyAssistantKey | null; role: Ctx["role"]; departmentId: string | null; departmentSlug: string | null; joinedAt: string | null }) {
  const enabledFor = (r: AssistantRow) => r.enabled && (!r.department_ids || !params.departmentId || r.department_ids.includes(params.departmentId));
  const byKey = (k: string) => rows.find((r) => r.key === k && enabledFor(r)) || null;
  if (params.override) {
    const o = byKey(params.override);
    if (o) return o;
  }
  const newJoiner = !!params.joinedAt && Date.now() - Date.parse(params.joinedAt) < 30 * 86400000;
  if (newJoiner) { const n = byKey("new_joiner"); if (n) return n; }
  if (params.role === "department_head") { const d = byKey("department_head"); if (d) return d; }
  if (isManagerPlus(params.role)) { const m = byKey("manager"); if (m) return m; }
  const deptKey = params.departmentSlug ? DEPT_TO_KEY[params.departmentSlug] : undefined;
  if (deptKey) { const d = byKey(deptKey); if (d) return d; }
  return byKey("general") || rows[0] || { key: "general", name: "GHL Buddy", personality: "You are GHL Buddy.", enabled: true, department_ids: null, action_level: 5, data_scopes: [], daily_limit: null, model: null };
}

/* ------------------------------------------------------------------ attachments → content blocks ---- */

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function attachmentBlocks(atts: BuddyAttachment[] | undefined): Anthropic.Beta.BetaContentBlockParam[] {
  const out: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const a of atts || []) {
    if (a.kind === "image" && IMAGE_MIMES.has(a.mime) && a.data.length < 6_000_000) {
      out.push({ type: "image", source: { type: "base64", media_type: a.mime as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: a.data } });
      out.push({ type: "text", text: `(Screenshot/image attached: ${a.name})` });
    } else if (a.kind === "document" && a.mime === "application/pdf" && a.data.length < 11_000_000) {
      out.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.data }, title: a.name } as Anthropic.Beta.BetaContentBlockParam);
    } else if (a.kind === "text" && a.text) {
      out.push({ type: "text", text: `--- ${a.name} (pasted) ---\n${a.text.slice(0, 40_000)}\n--- end ---` });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ page scope ---- */

export async function scopeContext(ctx: Ctx, scope: BuddyScope, used: BuddyContextItem[]) {
  const notes: string[] = [];
  if (scope.taskId) {
    const c = await taskContext(ctx.db, scope.taskId);
    if (c) { notes.push(`CURRENT TASK:\n${c.text}`); used.push({ kind: "task", id: scope.taskId, title: c.task.title, link: `/tasks/${scope.taskId}` }); }
  }
  if (scope.projectId) {
    const c = await projectContext(ctx.db, scope.projectId);
    if (c) { notes.push(`CURRENT PROJECT:\n${c.text.slice(0, 6000)}`); used.push({ kind: "project", id: scope.projectId, title: c.project.name, link: `/projects/${scope.projectId}` }); }
  }
  if (scope.channelId) {
    const c = await channelContext(ctx.db, scope.channelId, undefined, 60);
    if (c) { notes.push(`CURRENT CONVERSATION (#${c.channel.name}):\n${c.text.slice(0, 6000)}`); used.push({ kind: "channel", id: scope.channelId, title: `#${c.channel.name}`, link: `/chat/${scope.channelId}` }); }
  }
  if (scope.meetingId) {
    const c = await meetingContext(ctx.db, scope.meetingId);
    if (c) { notes.push(`CURRENT MEETING:\n${c.text.slice(0, 5000)}`); used.push({ kind: "meeting", id: scope.meetingId, title: c.meeting.title, link: `/meetings/${scope.meetingId}` }); }
  }
  if (scope.helpId) {
    const { data: h } = await ctx.db.from("help_requests").select("id,title,details,status,priority,department_id,owner_id,requester_id,deadline,form_data,created_at,acknowledged_at").eq("id", scope.helpId).maybeSingle();
    if (h) {
      const dept = (await ctx.db.from("departments").select("name").eq("id", h.department_id).maybeSingle()).data?.name;
      notes.push(`CURRENT HELP REQUEST: ${h.title} · ${dept} · status ${h.status} · priority ${h.priority}${h.deadline ? ` · needed by ${h.deadline}` : ""}\n${h.details || ""}\nform: ${JSON.stringify(h.form_data)}`);
      used.push({ kind: "help_request", id: h.id, title: h.title, link: `/help/${h.id}` });
    }
  }
  if (scope.fileId) {
    const { data: f } = await ctx.db.from("files").select("id,name,folder,classification,current_version,project_id,department_id,tags").eq("id", scope.fileId).maybeSingle();
    if (f) { notes.push(`CURRENT FILE: ${f.name} (v${f.current_version}, ${f.classification}, folder ${f.folder || "/"}, tags ${(f.tags || []).join(", ")})`); used.push({ kind: "file", id: f.id, title: f.name, link: `/files/${f.id}` }); }
  }
  if (scope.personId) {
    const { data: p } = await ctx.db.from("profiles").select("id,full_name,designation,department_id,role,presence,skills").eq("id", scope.personId).maybeSingle();
    if (p) { notes.push(`CURRENT PERSON: ${p.full_name} · ${p.designation || p.role} · presence ${p.presence} · skills ${(p.skills || []).join(", ")}`); used.push({ kind: "person", id: p.id, title: p.full_name, link: `/people/${p.id}` }); }
  }
  return notes.join("\n\n");
}

/* ------------------------------------------------------------------ tools ---- */

const ProposalSchema = z.object({
  kind: z.enum(["task", "decision", "meeting", "help_request", "leave_request", "bug_report", "message_draft", "knowledge_article", "access_request", "bring_in", "escalation", "war_room", "focus", "learning", "commitment", "request", "admin_action"]),
  title: z.string(),
  description: z.string().nullable().optional(),
  assignee_id: z.string().nullable().optional(),
  assignee_name: z.string().nullable().optional(),
  due_date: z.string().nullable().optional().describe("ISO datetime with +05:30 offset, or YYYY-MM-DD for leave, or null"),
  priority: z.enum(["critical", "urgent", "high", "normal", "low"]).nullable().optional(),
  project_id: z.string().nullable().optional(),
  department_id: z.string().nullable().optional().describe("target department for help_request / escalation / war_room"),
  service_id: z.string().nullable().optional().describe("help desk service id from get_help_catalog"),
  channel_id: z.string().nullable().optional(),
  person_id: z.string().nullable().optional().describe("for bring_in: who to bring in"),
  resource_type: z.string().nullable().optional().describe("for access_request: project|file|channel|wiki"),
  resource_id: z.string().nullable().optional(),
  body: z.string().nullable().optional().describe("draft text / article body / structured details"),
  fields: z.record(z.string(), z.string()).nullable().optional().describe("structured extras e.g. steps, expected, actual, severity, environment, leave_type, from, to, half_day, backup_id"),
  reason: z.string().nullable().optional(),
});

export type BuddyToolState = { used: BuddyContextItem[]; proposals: BuddyProposal[]; restricted: BuddyRestrictedHit[]; sources: Map<string, string> };

export function buildTools(ctx: Ctx, assistant: AssistantRow, state: BuddyToolState, opts: { departmentId: string | null; isManager: boolean; isLead: boolean }) {
  const scopes = new Set(assistant.data_scopes || []);
  const allow = (s: string) => scopes.size === 0 || scopes.has(s);
  const push = (item: BuddyContextItem) => { if (!state.used.some((u) => u.kind === item.kind && u.id === item.id)) state.used.push(item); };

  const tools = [
    betaZodTool({
      name: "get_my_work",
      description: "This person's own tasks, what waits on them, approvals for them, meetings this week, mentions, projects and delegated work. Use for what should I do / what am I waiting for / my day / end of day.",
      inputSchema: z.object({}),
      run: async () => { if (!allow("tasks")) return "not available"; const c = await myWorkContext(ctx.db, ctx.userId); push({ kind: "my_work", title: "Your work", link: "/my-work" }); return c.text; },
    }),
    betaZodTool({
      name: "get_my_hr",
      description: "This person's own HR self-service data: leave balances, today's attendance, open help requests they raised, assets assigned, training assigned, goals, next 1-on-1. Use for 'how many leaves do I have', 'am I clocked in', 'what training must I complete'.",
      inputSchema: z.object({}),
      run: async () => {
        const today = todayIST();
        const [bal, att, reqs, assets, enr, goals, o1] = await Promise.all([
          ctx.db.rpc("my_leave_balances", { p_user: ctx.userId }),
          ctx.db.from("attendance_events").select("kind,mode,occurred_at,note").eq("user_id", ctx.userId).gte("occurred_at", `${today}T00:00:00+05:30`).order("occurred_at"),
          ctx.db.from("help_requests").select("id,title,status,priority,department_id,created_at").eq("requester_id", ctx.userId).not("status", "in", "(completed,declined)").limit(10),
          ctx.db.from("asset_assignments").select("assigned_at,asset:assets(name,kind,tag)").eq("user_id", ctx.userId).is("returned_at", null),
          ctx.db.from("enrollments").select("status,progress,due_on,course:courses(id,title,mandatory)").eq("user_id", ctx.userId).neq("status", "completed"),
          ctx.db.from("goals").select("id,title,progress,due_on,level").eq("owner_id", ctx.userId).eq("status", "active").limit(8),
          ctx.db.from("one_on_ones").select("id,scheduled_at,manager_id,employee_id").or(`manager_id.eq.${ctx.userId},employee_id.eq.${ctx.userId}`).eq("status", "scheduled").gte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(2),
        ]);
        push({ kind: "hr", title: "Your leave, attendance and training", link: "/leave" });
        const lines: string[] = [];
        lines.push("LEAVE BALANCES: " + ((bal.data || []) as unknown as { name: string; code: string; allocated: number | null; used: number | null; remaining: number | null; pending: number | null }[]).map((b) => `${b.name} (${b.code}): remaining ${b.remaining ?? "no cap"} of ${b.allocated ?? "—"}, used ${b.used ?? 0}${b.pending ? `, pending ${b.pending}` : ""}`).join("; ") || "none");
        lines.push("ATTENDANCE TODAY: " + ((att.data || []).map((e) => `${e.kind}${e.mode ? `/${e.mode}` : ""} at ${e.occurred_at}`).join(", ") || "not clocked in yet"));
        lines.push("MY OPEN HELP REQUESTS: " + ((reqs.data || []).map((r) => `[${r.title}](/help/${r.id}) ${r.status}/${r.priority}`).join("; ") || "none"));
        lines.push("MY ASSETS: " + ((assets.data || []).map((a) => { const x = a.asset as unknown as { name: string; kind: string; tag: string } | null; return x ? `${x.name} (${x.kind}, ${x.tag})` : ""; }).filter(Boolean).join("; ") || "none"));
        lines.push("TRAINING PENDING: " + ((enr.data || []).map((e) => { const c = e.course as unknown as { id: string; title: string; mandatory: boolean } | null; return c ? `[${c.title}](/academy/${c.id}) ${e.progress}%${e.due_on ? ` due ${e.due_on}` : ""}${c.mandatory ? " (mandatory)" : ""}` : ""; }).filter(Boolean).join("; ") || "none"));
        lines.push("MY GOALS: " + ((goals.data || []).map((g) => `${g.title} ${g.progress}%${g.due_on ? ` due ${g.due_on}` : ""}`).join("; ") || "none"));
        lines.push("NEXT 1-ON-1: " + ((o1.data || []).map((m) => m.scheduled_at).join(", ") || "none scheduled"));
        return lines.join("\n");
      },
    }),
    betaZodTool({
      name: "search_knowledge",
      description: "Search APPROVED company knowledge (SOPs, policies, FAQs, scripts, objection handling, guides, incident learnings) — prefer this over chat history for 'how do we', 'what is the policy', 'is there an SOP'. Flags outdated documents.",
      inputSchema: z.object({ query: z.string().describe("2-5 keywords") }),
      run: async ({ query }) => {
        if (!allow("knowledge")) return "not available";
        const { data } = await ctx.db.rpc("search_knowledge", { p_q: query, p_department: opts.departmentId ?? undefined, p_limit: 6 });
        const rows = (data || []) as { id: string; title: string; kind: string; snippet: string; review_at: string | null; outdated: boolean }[];
        if (!rows.length) return "No approved knowledge matches. Say so plainly and offer who to ask.";
        for (const r of rows) { push({ kind: "knowledge", id: r.id, title: r.title, link: `/wiki/knowledge/${r.id}` }); state.sources.set(`/wiki/knowledge/${r.id}`, r.title); }
        return rows.map((r) => `### [${r.title}](/wiki/knowledge/${r.id}) (${r.kind}${r.outdated ? ", ⚠ past review date — may be outdated" : ""})\n${r.snippet}`).join("\n\n");
      },
    }),
    betaZodTool({
      name: "search_company",
      description: "Universal permission-filtered search across people, tasks, projects, messages, files, decisions, meetings, wiki, approvals. Short keyword queries; call again with other keywords if needed.",
      inputSchema: z.object({ query: z.string() }),
      run: async ({ query }) => {
        const { data } = await ctx.db.rpc("search_all", { q: query, lim: 10 });
        const rows = (data || []) as { kind: string; id: string; title: string; subtitle: string | null; link: string }[];
        for (const r of rows) state.sources.set(r.link, r.title);
        return rows.length ? rows.map((r) => `- ${r.kind}: [${r.title}](${r.link}) — ${r.subtitle || ""}`).join("\n") : "No results.";
      },
    }),
    betaZodTool({
      name: "search_restricted",
      description: "Check whether there is relevant material the person is NOT allowed to see (projects, files, pages, rooms). Use when a search comes back empty for something that plausibly exists. Returns only labels, never contents.",
      inputSchema: z.object({ query: z.string() }),
      run: async ({ query }) => {
        const { data } = await ctx.db.rpc("restricted_hits", { p_q: query, p_limit: 5 });
        const rows = (data || []) as BuddyRestrictedHit[];
        for (const r of rows) if (!state.restricted.some((x) => x.resource_id === r.resource_id)) state.restricted.push(r);
        return rows.length ? `Restricted matches (do not describe contents): ${rows.map((r) => `${r.resource_type} "${r.label}"`).join("; ")}. Tell the person you found relevant information they don't have permission to view and offer an access_request proposal (resource_type + resource_id from: ${rows.map((r) => `${r.resource_type}:${r.resource_id}`).join(", ")}).` : "Nothing restricted matches.";
      },
    }),
    betaZodTool({
      name: "find_people",
      description: "Who can help: people by skill, designation, responsibility or department, with availability and open work; plus each department's status, on-duty person and open requests. Use for 'who knows X', 'who is on duty in IT', 'who handles video'.",
      inputSchema: z.object({ query: z.string().describe("skill / topic / department name") }),
      run: async ({ query }) => {
        if (!allow("people")) return "not available";
        const [{ data: exp }, { data: avail }] = await Promise.all([ctx.db.rpc("find_experts", { p_q: query, p_limit: 8 }), ctx.db.rpc("department_availability")]);
        const people = (exp || []) as { id: string; full_name: string; designation: string | null; department_name: string | null; presence: string; open_tasks: number; matched_on: string }[];
        for (const p of people) push({ kind: "person", id: p.id, title: p.full_name, link: `/people/${p.id}` });
        const depts = ((avail || []) as { department_id: string; name: string; status: string; on_duty_user_id: string | null; available: number; open_requests: number; avg_ack_minutes: number }[]).filter((d) => d.name.toLowerCase().includes(query.toLowerCase()) || people.some((p) => p.department_name === d.name));
        return [
          people.length ? "PEOPLE:\n" + people.map((p) => `- [${p.full_name}](/people/${p.id}) — ${p.designation || ""} · ${p.department_name || ""} · ${p.presence} · ${p.open_tasks} open tasks · matched on ${p.matched_on}`).join("\n") : "No one matched by skill/designation.",
          depts.length ? "DEPARTMENTS:\n" + depts.map((d) => `- ${d.name} (id ${d.department_id}): ${d.status}, ${d.available} available, on duty ${d.on_duty_user_id ? "yes" : "no one"}, ${d.open_requests} open requests, avg first response ${d.avg_ack_minutes} min`).join("\n") : "",
        ].filter(Boolean).join("\n");
      },
    }),
    betaZodTool({
      name: "get_help_catalog",
      description: "Departments and the services they publish in the Help Desk (service ids, SLA, form fields). Use to route a problem to the right department and propose a help_request with service_id.",
      inputSchema: z.object({ department: z.string().nullable().optional().describe("department name or slug to narrow") }),
      run: async ({ department }) => {
        const [{ data: depts }, { data: svcs }] = await Promise.all([
          ctx.db.from("departments").select("id,name,slug,status,on_duty_user_id").order("position"),
          ctx.db.from("service_catalog").select("id,department_id,name,description,sla_ack_minutes,default_priority,form_schema").eq("active", true).order("position"),
        ]);
        const dl = (depts || []).filter((d) => !department || d.name.toLowerCase().includes(department.toLowerCase()) || d.slug === department);
        for (const d of dl) push({ kind: "department", id: d.id, title: d.name, link: `/departments/${d.slug}` });
        return dl.map((d) => `## ${d.name} (id ${d.id}, ${d.status})\n` + (svcs || []).filter((s) => s.department_id === d.id).map((s) => `- ${s.name} (service_id ${s.id}, ack SLA ${s.sla_ack_minutes} min, priority ${s.default_priority}) — ${s.description || ""}; fields: ${((s.form_schema as { key: string; label: string; required?: boolean }[]) || []).map((f) => `${f.label}${f.required ? "*" : ""}`).join(", ")}`).join("\n")).join("\n");
      },
    }),
    betaZodTool({
      name: "explain_blocker",
      description: "Trace why a task is blocked/late: dependency chain, who is waiting on whom for how long, pending approvals and handoffs.",
      inputSchema: z.object({ task_id: z.string() }),
      run: async ({ task_id }) => { const { data } = await ctx.db.rpc("blocker_chain", { p_task: task_id }); push({ kind: "task", id: task_id, title: "Blocker chain", link: `/tasks/${task_id}` }); return JSON.stringify(data); },
    }),
    betaZodTool({
      name: "get_task",
      description: "Details, comments and history of one task.",
      inputSchema: z.object({ task_id: z.string() }),
      run: async ({ task_id }) => { const c = await taskContext(ctx.db, task_id); if (!c) return "Task not found or not accessible."; push({ kind: "task", id: task_id, title: c.task.title, link: `/tasks/${task_id}` }); return c.text; },
    }),
    betaZodTool({
      name: "get_project",
      description: "Full state of one project: tasks, milestones, team, decisions, approvals, meetings, files, risks, recent chat.",
      inputSchema: z.object({ project_id: z.string() }),
      run: async ({ project_id }) => { if (!allow("projects")) return "not available"; const c = await projectContext(ctx.db, project_id); if (!c) return "Project not found or not accessible."; push({ kind: "project", id: project_id, title: c.project.name, link: `/projects/${project_id}` }); return c.text; },
    }),
    betaZodTool({
      name: "get_channel_messages",
      description: "Recent messages of a chat channel, optionally since an ISO timestamp. Use to summarise, find unresolved questions, or answer @GHLBuddy in a room.",
      inputSchema: z.object({ channel_id: z.string(), since_iso: z.string().nullable().optional() }),
      run: async ({ channel_id, since_iso }) => { if (!allow("chat")) return "not available"; const c = await channelContext(ctx.db, channel_id, since_iso || undefined, 120); if (!c) return "Channel not found or not accessible."; push({ kind: "channel", id: channel_id, title: `#${c.channel.name}`, link: `/chat/${channel_id}` }); return c.text; },
    }),
    betaZodTool({
      name: "get_decisions",
      description: "Decision register entries, optionally for one project or a keyword.",
      inputSchema: z.object({ project_id: z.string().nullable().optional(), keyword: z.string().nullable().optional() }),
      run: async ({ project_id, keyword }) => { if (!allow("decisions")) return "not available"; return decisionsContext(ctx.db, project_id || null, keyword || undefined); },
    }),
    betaZodTool({
      name: "list_people",
      description: "Directory of active people with ids, designations and departments. Use before proposing assignments or bring_in.",
      inputSchema: z.object({}),
      run: async () => (await peopleDirectory(ctx.db)).text,
    }),
    betaZodTool({
      name: "remember",
      description: "Save a small personal working-context note for this person (e.g. 'usually works on frontend', 'current focus: Careers website'). Personal memory only — never company policy.",
      inputSchema: z.object({ key: z.string().max(40), value: z.string().max(300) }),
      run: async ({ key, value }) => { await ctx.db.from("ai_memory").upsert({ user_id: ctx.userId, key, value: { text: value }, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" }); return "Remembered (personal memory)."; },
    }),
    betaZodTool({
      name: "propose_actions",
      description: "Propose actions for the person to confirm — nothing happens until they confirm in the UI. Kinds: task, decision, meeting, help_request (department_id + service_id + title + description + priority + due_date), leave_request (fields.leave_type, fields.from, fields.to, fields.half_day, fields.backup_id, reason), bug_report (title + fields.steps/expected/actual/severity/environment, department_id of IT), message_draft (channel_id + body), knowledge_article (title + body + department_id), access_request (resource_type + resource_id + reason + fields.level/duration), bring_in (channel_id + person_id + reason), escalation (department_id + title + body with customer issue/troubleshooting/impact/priority), war_room (title + department_id + fields.severity + description), focus (title of task + assignee = self), learning (title = topic to learn), commitment (a promise the person is making: title = what, person_id = to whom (or fields.to_label for an outside party), due_date), request (self-service request: fields.kind = expense|travel|purchase|wfh|field_duty|late_explanation|overtime|comp_off|training|other, title, description, fields.amount, fields.from, fields.to), admin_action (ONLY for managers/admins — an organisational change to be reviewed by a human in Organization Control, never executed by you: fields.action = change_manager|change_department|change_role|freeze_user|unfreeze_user|set_status|grant_screen|revoke_screen|delegate|set_backup, person_id = the person affected, fields.target = new manager/department/role/screen/backup id or name, reason). Include ids from tools.",
      inputSchema: z.object({ actions: z.array(ProposalSchema).min(1).max(12) }),
      run: async ({ actions }) => {
        const level = assistant.action_level;
        if (level <= 2) return "This assistant is limited to answering and suggesting (action level " + level + "). Describe the recommended action in words instead; do not promise to create it.";
        state.proposals.push(...(actions as BuddyProposal[]));
        return `Recorded ${actions.length} proposal(s)${level === 3 ? " as drafts (this assistant may draft but not prepare executable actions)" : ""}. Summarise them in one line; the person confirms in the UI.`;
      },
    }),
  ];

  const leadTools = opts.isManager || opts.isLead ? [
    betaZodTool({
      name: "get_department_brief",
      description: "Department morning brief: status, on duty, present today, who is on leave, critical requests, requests over SLA, overdue/blocked tasks, today's events, pending approvals.",
      inputSchema: z.object({ department_id: z.string().nullable().optional().describe("defaults to the person's department") }),
      run: async ({ department_id }) => { const id = department_id || opts.departmentId; if (!id) return "No department."; const { data } = await ctx.db.rpc("department_brief", { p_department: id }); push({ kind: "department", id, title: "Department brief" }); return JSON.stringify(data); },
    }),
  ] : [];
  const managerTools = opts.isManager ? [
    betaZodTool({
      name: "get_company_overview",
      description: "Company-wide pulse: department health, workload per person, critical/overdue/blocked tasks, projects, approvals, risks. Management only.",
      inputSchema: z.object({}),
      run: async () => { const c = await companyContext(ctx.db); push({ kind: "my_work", title: "Company overview", link: "/command" }); return c.text; },
    }),
  ] : [];

  const orgTools = [
    betaZodTool({
      name: "org_who_reports_to",
      description: "Reporting lines: direct and indirect reports of a person (use list_people for ids). Answers who reports to X, who is X's manager, how big is Y's team.",
      inputSchema: z.object({ person_id: z.string(), depth: z.number().int().min(1).max(4).optional() }),
      run: async ({ person_id, depth }) => { const { data, error } = await ctx.db.rpc("reports_of", { p_user: person_id, p_depth: depth ?? 2 } as never); if (error) return "not available: " + error.message; push({ kind: "org", id: person_id, title: "Reporting lines", link: `/people/${person_id}` }); return JSON.stringify(data); },
    }),
    betaZodTool({
      name: "org_who_owns",
      description: "Who owns a responsibility, process, system or area (responsibilities register + glossary + department services). Answers who owns invoicing, who handles the website, who approves X.",
      inputSchema: z.object({ query: z.string().max(120) }),
      run: async ({ query }) => { const { data, error } = await ctx.db.rpc("who_owns", { q: query } as never); if (error) return "not available: " + error.message; push({ kind: "org", title: `Ownership: ${query}`, link: "/admin/organization?tab=responsibilities" }); return JSON.stringify(data); },
    }),
    betaZodTool({
      name: "org_what_if_absent",
      description: "What breaks if a person is away between two dates: responsibilities without backup, tasks due, people they block, meetings, approvals, suggested backup. Allowed for yourself, your reports (managers) or management.",
      inputSchema: z.object({ person_id: z.string(), from: z.string().describe("YYYY-MM-DD"), to: z.string().describe("YYYY-MM-DD") }),
      run: async ({ person_id, from, to }) => { const { data, error } = await ctx.db.rpc("what_if_absent", { p_user: person_id, p_from: from, p_to: to } as never); if (error) return "not available: " + error.message; push({ kind: "org", id: person_id, title: "What-if absence", link: `/people/${person_id}` }); return JSON.stringify(data); },
    }),
    betaZodTool({
      name: "get_waiting_on_me",
      description: "Everything that is waiting on this person right now: tasks waiting, approvals, leave to approve, help requests, access requests, self-service requests, promises, delegation acknowledgements, workflow steps.",
      inputSchema: z.object({}),
      run: async () => { const { data, error } = await ctx.db.rpc("waiting_on_me", {} as never); if (error) return "not available: " + error.message; push({ kind: "my_work", title: "Waiting on you", link: "/my-work" }); return JSON.stringify(data); },
    }),
    betaZodTool({
      name: "who_has_the_ball",
      description: "For a task, project, help request, approval or request id: who it is currently with and why (waiting, approval, dependency, handoff).",
      inputSchema: z.object({ type: z.enum(["task", "project", "help_request", "approval", "request"]), id: z.string() }),
      run: async ({ type, id }) => { const { data, error } = await ctx.db.rpc("who_has_ball", { p_type: type, p_id: id } as never); if (error) return "not available: " + error.message; return JSON.stringify(data); },
    }),
    betaZodTool({
      name: "get_my_attendance",
      description: "This person's own attendance: recent days, hours, late marks, break minutes, and their own attendance exceptions (late/early/missing check-out/short day). Their own data only — the same thing they see in Privacy Center.",
      inputSchema: z.object({ days: z.number().int().min(1).max(60).optional() }),
      run: async ({ days }) => {
        if (!allow("hr")) return "not available";
        const n = days ?? 30; const to = new Date(); const from = new Date(to.getTime() - n * 86400000);
        const f = from.toISOString().slice(0, 10), t = to.toISOString().slice(0, 10);
        const [{ data: att }, { data: exc }] = await Promise.all([ctx.db.rpc("my_attendance", { p_from: f, p_to: t } as never), ctx.db.rpc("my_attendance_exceptions", { p_from: f, p_to: t } as never)]);
        push({ kind: "attendance", title: "Your attendance", link: "/attendance" });
        return JSON.stringify({ from: f, to: t, days: att, exceptions: exc });
      },
    }),
    betaZodTool({
      name: "get_my_commitments",
      description: "Promises this person made and promises made to them (with due dates and overdue flags), plus their GHL Connect follow-ups/callbacks if they use Connect.",
      inputSchema: z.object({}),
      run: async () => { const [{ data: c }, { data: q }] = await Promise.all([ctx.db.rpc("my_commitments", {} as never), ctx.db.rpc("my_connect_queue", {} as never)]); push({ kind: "my_work", title: "Your promises", link: "/my-work" }); return JSON.stringify({ commitments: c, connect: q }); },
    }),
  ];
  const orgManagerTools = opts.isManager ? [
    betaZodTool({
      name: "org_health",
      description: "Organisation health: people without managers, teams without leads, groups without owners, unowned tasks, critical responsibilities without backup, probation overdue, contracts ending, floating users. Management only. Use before proposing admin_action fixes.",
      inputSchema: z.object({}),
      run: async () => { const { data, error } = await ctx.db.rpc("org_health", {} as never); if (error) return "not available: " + error.message; push({ kind: "org", title: "Organisation health", link: "/admin/organization" }); return JSON.stringify(data); },
    }),
    betaZodTool({
      name: "org_change_impact",
      description: "Preview (read-only) what changes if a person gets a new manager / department / role: reports, approvals, grants, channels affected. Use before proposing an admin_action; the human applies it in Organization Control.",
      inputSchema: z.object({ person_id: z.string(), new_manager_id: z.string().nullable().optional(), new_department_id: z.string().nullable().optional(), new_role: z.string().nullable().optional() }),
      run: async ({ person_id, new_manager_id, new_department_id, new_role }) => { const { data, error } = await ctx.db.rpc("change_impact", { p_user: person_id, p_new_manager: new_manager_id ?? null, p_new_department: new_department_id ?? null, p_new_role: new_role ?? null } as never); if (error) return "not available: " + error.message; return JSON.stringify(data); },
    }),
    betaZodTool({
      name: "workforce_now",
      description: "Live workforce picture for the departments this manager may see: present, remote, on break, not clocked in, missing check-outs, coverage gaps, operational inactivity (no task/message activity — never device monitoring). Never rank or judge people from it.",
      inputSchema: z.object({}),
      run: async () => { const { data, error } = await ctx.db.rpc("workforce_live", {} as never); if (error) return "not available: " + error.message; push({ kind: "attendance", title: "Workforce live", link: "/workforce" }); return JSON.stringify(data); },
    }),
  ] : [];
  return [...tools, ...orgTools, ...leadTools, ...managerTools, ...orgManagerTools];
}

/* ------------------------------------------------------------------ answer post-processing ---- */

export function parseConfidence(text: string): { answer: string; confidence: "high" | "needs_confirmation" | "insufficient" } {
  const m = text.match(/\[confidence:\s*(high|needs_confirmation|insufficient)\]\s*$/i);
  if (!m) return { answer: text.trim(), confidence: "needs_confirmation" };
  return { answer: text.slice(0, m.index).trim(), confidence: m[1].toLowerCase() as "high" | "needs_confirmation" | "insufficient" };
}

const NEXT_BY_MODE: Record<BuddyMode, string[]> = {
  chat: ["What should I do next?", "Who can help with this?", "Break this down"],
  stuck: ["Debug with me", "Find the SOP", "Who can help?", "Raise a help request"],
  debug: ["Next check", "Explain this error", "Create a bug report"],
  incident: ["Start a war room", "Draft the status update", "Who is on duty in IT?"],
  practice: ["Try a tougher client", "Coach me on that", "End practice"],
  check: ["Fix the gaps for me", "Explain simply", "Prepare the handoff"],
  prepare: ["Draft the agenda", "What did we decide last time?", "Likely questions"],
  explain_simple: ["Explain technically", "What should I do?", "Draft a message"],
  explain_technical: ["Explain simply", "Create escalation", "Create a bug report"],
  breakdown: ["Create these tasks", "Who can take this?", "Estimate effort"],
  who_can_help: ["Bring them in", "Request department help", "Start a chat"],
  what_next: ["Why is this blocked?", "Start focus on it", "Show my week"],
  looking_at: ["What should I do here?", "Who owns this?", "Explain simply"],
  why_blocked: ["Nudge the owner", "Set waiting on", "Escalate"],
  translate: ["Make it shorter", "Make it formal", "Translate back"],
  draft: ["Make it shorter", "Make it friendlier", "Make it more formal"],
  brief: ["What should I do first?", "Show blockers", "End-of-day summary"],
};
export function nextSuggestions(mode: BuddyMode) { return NEXT_BY_MODE[mode] || NEXT_BY_MODE.chat; }

export function isLeadFor(role: Ctx["role"]) { return isLeadPlus(role); }
