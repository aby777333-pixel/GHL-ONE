import type { Json } from "@/lib/database.types";
import { APPROVAL_TYPES, PRIORITIES, PROJECT_STATUSES, TASK_STATUSES, type Tables } from "@/lib/utils";

/* ------------------------------------------------------------------ types */
export type AutomationRow = Tables<"automations">;
export type RunRow = Tables<"automation_runs">;

export type Entity = "task" | "approval" | "project" | "file" | "decision" | "message" | "handoff" | "schedule";

export type Condition = { field: string; op: string; value?: string };
export type Action = { type: string } & Record<string, string | number | boolean | undefined>;
export type TriggerConfig = Record<string, string | number | undefined>;

export type Draft = {
  name: string;
  description: string;
  enabled: boolean;
  trigger_type: string;
  trigger_config: TriggerConfig;
  conditions: Condition[];
  actions: Action[];
  scope_project_id: string | null;
  scope_department_id: string | null;
};

export function emptyDraft(): Draft {
  return { name: "", description: "", enabled: true, trigger_type: "task.created", trigger_config: {}, conditions: [], actions: [], scope_project_id: null, scope_department_id: null };
}

/* --------------------------------------------------------------- triggers */
export type TriggerDef = { key: string; label: string; entity: Entity; group: string; hint: string };
export const TRIGGERS: TriggerDef[] = [
  { key: "task.created", label: "Task created", entity: "task", group: "Tasks", hint: "Any new task, including tasks created by delegation, meetings or integrations." },
  { key: "task.status_changed", label: "Task status changed", entity: "task", group: "Tasks", hint: "Fires when a task moves between statuses. Narrow it with from/to." },
  { key: "task.assigned", label: "Task assigned / reassigned", entity: "task", group: "Tasks", hint: "Fires whenever the assignee changes." },
  { key: "task.priority_changed", label: "Task priority changed", entity: "task", group: "Tasks", hint: "Fires whenever the priority changes." },
  { key: "approval.requested", label: "Approval requested", entity: "approval", group: "Approvals", hint: "A new approval request was submitted." },
  { key: "approval.decided", label: "Approval decided", entity: "approval", group: "Approvals", hint: "Approved, rejected or changes requested." },
  { key: "project.created", label: "Project created", entity: "project", group: "Projects", hint: "A new project was created, from scratch or from a template." },
  { key: "project.status_changed", label: "Project status changed", entity: "project", group: "Projects", hint: "Planning → active → at risk → completed…" },
  { key: "file.version_approved", label: "File version approved", entity: "file", group: "Files & decisions", hint: "A file version passed its approval." },
  { key: "decision.recorded", label: "Decision recorded", entity: "decision", group: "Files & decisions", hint: "A decision was logged in the decision register." },
  { key: "handoff.accepted", label: "Handoff accepted", entity: "handoff", group: "Collaboration", hint: "A receiving department accepted a cross-department handoff." },
  { key: "message.posted", label: "Message posted", entity: "message", group: "Collaboration", hint: "A human message in any channel you can scope by department or project." },
  { key: "schedule", label: "On a schedule", entity: "schedule", group: "Schedule", hint: "Runs every hour / day / week / month at a set time (IST)." },
];
export const triggerDef = (key: string) => TRIGGERS.find((t) => t.key === key) || TRIGGERS[0];

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Human label for the trigger + its config. */
export function triggerLabel(type: string, cfg: TriggerConfig): string {
  const def = triggerDef(type);
  const c = cfg || {};
  if (type === "schedule") {
    const every = String(c.every || "day");
    const at = String(c.at || "09:00");
    if (every === "hour") return "Every hour";
    if (every === "day") return `Daily at ${at}`;
    if (every === "week") return `Every ${WEEKDAYS[(Number(c.weekday) || 1) - 1] || "Monday"} at ${at}`;
    if (every === "month") return `Monthly on day ${c.day || 1} at ${at}`;
    return "Scheduled";
  }
  const parts: string[] = [def.label];
  if (c.from_status) parts.push(`from ${String(c.from_status).replace(/_/g, " ")}`);
  if (c.to_status) parts.push(`→ ${String(c.to_status).replace(/_/g, " ")}`);
  if (c.to_priority) parts.push(`→ ${c.to_priority}`);
  return parts.join(" ");
}

/* ------------------------------------------------------------- conditions */
export type FieldKind = "priority" | "task_status" | "approval_status" | "project_status" | "department_slug" | "person" | "waiting_on" | "bool" | "text" | "number" | "approval_type" | "classification";
export type FieldDef = { key: string; label: string; kind: FieldKind; hint?: string };

const F = (key: string, label: string, kind: FieldKind, hint?: string): FieldDef => ({ key, label, kind, hint });
const COMMON_TASKISH: FieldDef[] = [
  F("priority", "Priority", "priority"),
  F("department_slug", "Department", "department_slug"),
  F("project_name", "Project name", "text"),
  F("assignee_id", "Assignee", "person"),
  F("owner_id", "Owner", "person"),
  F("title", "Title", "text"),
];
export const ENTITY_FIELDS: Record<Entity, FieldDef[]> = {
  task: [
    F("status", "Status", "task_status"),
    F("old_status", "Previous status", "task_status", "Only set for status-change triggers"),
    ...COMMON_TASKISH,
    F("waiting_on", "Waiting on", "waiting_on"),
    F("is_overdue", "Is overdue", "bool"),
    F("tags", "Tags", "text", "Use “contains” — e.g. automation"),
    F("delegated_by", "Delegated by", "person"),
    F("approver_id", "Approver", "person"),
    F("requires_approval", "Requires approval", "bool"),
    F("event", "Event", "text"),
  ],
  approval: [
    F("status", "Decision", "approval_status"),
    F("type", "Approval type", "approval_type"),
    F("priority", "Priority", "priority"),
    F("requested_by", "Requester", "person"),
    F("approver_id", "Approver", "person"),
    F("amount", "Amount (₹)", "number"),
    F("project_name", "Project name", "text"),
    F("title", "Title", "text"),
  ],
  project: [
    F("status", "Status", "project_status"),
    F("old_status", "Previous status", "project_status"),
    F("priority", "Priority", "priority"),
    F("department_slug", "Department", "department_slug"),
    F("owner_id", "Owner", "person"),
    F("template_key", "Template key", "text"),
    F("client_name", "Client name", "text"),
    F("title", "Name", "text"),
  ],
  file: [
    F("department_slug", "Department", "department_slug"),
    F("project_name", "Project name", "text"),
    F("folder", "Folder", "text"),
    F("classification", "Classification", "classification"),
    F("owner_id", "Owner", "person"),
    F("title", "File name", "text"),
  ],
  decision: [
    F("department_slug", "Department", "department_slug"),
    F("project_name", "Project name", "text"),
    F("decided_by", "Decided by", "person"),
    F("classification", "Classification", "classification"),
    F("title", "Title", "text"),
  ],
  message: [
    F("channel_name", "Channel name", "text"),
    F("body", "Message body", "text"),
    F("author_id", "Author", "person"),
    F("department_slug", "Department", "department_slug"),
    F("project_name", "Project name", "text"),
  ],
  handoff: [
    F("department_slug", "Receiving department", "department_slug"),
    F("assignee_id", "New assignee", "person"),
    F("owner_id", "Task owner", "person"),
    F("project_name", "Project name", "text"),
    F("title", "Task title", "text"),
  ],
  schedule: [],
};

export type OpDef = { key: string; label: string; needsValue: boolean; kinds?: FieldKind[] };
export const OPS: OpDef[] = [
  { key: "eq", label: "is", needsValue: true },
  { key: "neq", label: "is not", needsValue: true },
  { key: "in", label: "is one of", needsValue: true, kinds: ["priority", "task_status", "approval_status", "project_status", "department_slug", "waiting_on", "approval_type", "classification", "text"] },
  { key: "not_in", label: "is none of", needsValue: true, kinds: ["priority", "task_status", "approval_status", "project_status", "department_slug", "waiting_on", "approval_type", "classification", "text"] },
  { key: "contains", label: "contains", needsValue: true, kinds: ["text"] },
  { key: "gt", label: "greater than", needsValue: true, kinds: ["number"] },
  { key: "lt", label: "less than", needsValue: true, kinds: ["number"] },
  { key: "is_null", label: "is empty", needsValue: false },
  { key: "not_null", label: "is set", needsValue: false },
  { key: "true", label: "is true", needsValue: false, kinds: ["bool"] },
  { key: "false", label: "is false", needsValue: false, kinds: ["bool"] },
];
export function opsFor(kind: FieldKind): OpDef[] {
  if (kind === "bool") return OPS.filter((o) => o.key === "true" || o.key === "false" || o.key === "is_null" || o.key === "not_null");
  return OPS.filter((o) => !o.kinds || o.kinds.includes(kind));
}
export const opLabel = (key: string) => OPS.find((o) => o.key === key)?.label || key;

export function enumOptions(kind: FieldKind): string[] | null {
  switch (kind) {
    case "priority": return [...PRIORITIES];
    case "task_status": return [...TASK_STATUSES];
    case "approval_status": return ["pending", "approved", "rejected", "changes_requested"];
    case "project_status": return [...PROJECT_STATUSES];
    case "waiting_on": return ["none", "employee", "manager", "client", "vendor", "approval", "blocked"];
    case "approval_type": return [...APPROVAL_TYPES];
    case "classification": return ["public", "internal", "confidential", "highly_confidential", "board_only"];
    default: return null;
  }
}

/* ---------------------------------------------------------------- actions */
export type ActionType = "notify" | "create_task" | "update_task" | "post_message" | "create_approval" | "webhook" | "slack" | "create_project_from_template";
export const ACTION_TYPES: { key: ActionType; label: string; hint: string }[] = [
  { key: "notify", label: "Notify people", hint: "In-app notification (and push/email per their preferences)." },
  { key: "create_task", label: "Create a task", hint: "A follow-up task, optionally waiting on the source task." },
  { key: "update_task", label: "Update the task", hint: "Change status, priority, assignee, tags or due date of the triggering task." },
  { key: "post_message", label: "Post a chat message", hint: "System message into a project, department or named channel." },
  { key: "create_approval", label: "Request an approval", hint: "Opens an approval and marks the task as waiting." },
  { key: "slack", label: "Send to Slack", hint: "Post to a Slack incoming-webhook integration." },
  { key: "webhook", label: "Call a webhook", hint: "Signed JSON POST to an outgoing-webhook integration." },
  { key: "create_project_from_template", label: "Create project from template", hint: "Instantiates a project template with its task chain." },
];
export const actionLabel = (t: string) => ACTION_TYPES.find((a) => a.key === t)?.label || t;

/** Target expressions understood by resolve_targets(). */
export type TargetDef = { key: string; label: string; needs?: "person" | "department" | "role"; entities?: Entity[] };
export const TARGETS: TargetDef[] = [
  { key: "assignee", label: "Assignee", entities: ["task", "handoff", "schedule"] },
  { key: "owner", label: "Owner", entities: ["task", "project", "file", "handoff", "schedule"] },
  { key: "delegator", label: "Delegator", entities: ["task"] },
  { key: "approver", label: "Approver", entities: ["task", "approval"] },
  { key: "requester", label: "Requester", entities: ["approval"] },
  { key: "manager", label: "Manager (of assignee / requester / owner)" },
  { key: "department_head", label: "Department head (of the record)" },
  { key: "project_owner", label: "Project owner" },
  { key: "executives", label: "All executives" },
  { key: "user:", label: "A specific person…", needs: "person" },
  { key: "department:", label: "Everyone in a department…", needs: "department" },
  { key: "department_head:", label: "Head of a department…", needs: "department" },
  { key: "role:", label: "Everyone with a role…", needs: "role" },
];
export function splitTarget(v: string | undefined): { base: string; arg: string } {
  const s = v || "";
  const i = s.indexOf(":");
  if (i < 0) return { base: s, arg: "" };
  return { base: s.slice(0, i + 1), arg: s.slice(i + 1) };
}
export const NOTIFICATION_KINDS = ["action_required", "information", "critical", "deadline", "mention", "approval"] as const;

/* ------------------------------------------------------------- variables */
export type VarDef = { key: string; desc: string; entities?: Entity[] };
export const VARIABLES: VarDef[] = [
  { key: "title", desc: "Title / name of the record" },
  { key: "link", desc: "Relative link to the record" },
  { key: "status", desc: "Current status", entities: ["task", "approval", "project"] },
  { key: "old_status", desc: "Previous status (status-change triggers)", entities: ["task", "approval", "project"] },
  { key: "priority", desc: "Priority", entities: ["task", "approval", "project"] },
  { key: "due", desc: "Due date, IST (e.g. 12 Sep 18:00)", entities: ["task", "approval", "project"] },
  { key: "is_overdue", desc: "true / false", entities: ["task"] },
  { key: "assignee_name", desc: "Assignee's full name", entities: ["task", "handoff"] },
  { key: "owner_name", desc: "Owner's full name", entities: ["task", "project", "file", "handoff"] },
  { key: "approver_name", desc: "Approver's full name", entities: ["task", "approval"] },
  { key: "requester_name", desc: "Requester's full name", entities: ["approval"] },
  { key: "actor_name", desc: "Person whose action fired the trigger" },
  { key: "project_name", desc: "Project name" },
  { key: "department_name", desc: "Department name" },
  { key: "department_slug", desc: "Department slug" },
  { key: "description", desc: "Description / body", entities: ["task", "approval", "project", "decision"] },
  { key: "event", desc: "Event key, e.g. task.status_changed" },
  { key: "channel_name", desc: "Channel name", entities: ["message"] },
  { key: "body", desc: "Message body", entities: ["message"] },
  { key: "amount", desc: "Amount", entities: ["approval"] },
  { key: "type", desc: "Approval type", entities: ["approval"] },
  { key: "today", desc: "Today's date, IST (schedules only)", entities: ["schedule"] },
];
export function variablesFor(entity: Entity) {
  return VARIABLES.filter((v) => !v.entities || v.entities.includes(entity));
}

/** Client-side replica of render_tpl(): replaces {{key}} with ctx[key] for every key in ctx. */
export function renderTpl(tpl: string | undefined | null, ctx: Record<string, unknown>): string {
  let out = tpl ?? "";
  for (const [k, v] of Object.entries(ctx)) out = out.split(`{{${k}}}`).join(v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return out;
}

/* ------------------------------------------------------------ JSON I/O */
export function readConditions(j: Json | null | undefined): Condition[] {
  if (!Array.isArray(j)) return [];
  return j
    .filter((x): x is Record<string, Json | undefined> => !!x && typeof x === "object" && !Array.isArray(x))
    .map((c) => ({ field: String(c.field ?? ""), op: String(c.op ?? "eq"), value: c.value == null ? undefined : String(c.value) }));
}
export function readActions(j: Json | null | undefined): Action[] {
  if (!Array.isArray(j)) return [];
  return j
    .filter((x): x is Record<string, Json | undefined> => !!x && typeof x === "object" && !Array.isArray(x))
    .map((a) => {
      const out: Action = { type: String(a.type ?? "notify") };
      for (const [k, v] of Object.entries(a)) {
        if (k === "type") continue;
        if (v == null) continue;
        out[k] = typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean);
      }
      return out;
    });
}
export function readTriggerConfig(j: Json | null | undefined): TriggerConfig {
  if (!j || typeof j !== "object" || Array.isArray(j)) return {};
  const out: TriggerConfig = {};
  for (const [k, v] of Object.entries(j)) if (v != null && typeof v !== "object") out[k] = v as string | number;
  return out;
}
export function draftFromRow(r: AutomationRow): Draft {
  return {
    name: r.name,
    description: r.description || "",
    enabled: r.enabled,
    trigger_type: r.trigger_type,
    trigger_config: readTriggerConfig(r.trigger_config),
    conditions: readConditions(r.conditions),
    actions: readActions(r.actions),
    scope_project_id: r.scope_project_id,
    scope_department_id: r.scope_department_id,
  };
}
/** Strip empty strings so the engine's coalesce()/nullif() defaults apply. */
export function cleanAction(a: Action): Record<string, Json> {
  const out: Record<string, Json> = { type: a.type };
  for (const [k, v] of Object.entries(a)) {
    if (k === "type" || v === undefined || v === "" || v === null) continue;
    out[k] = v;
  }
  return out;
}
export function cleanConfig(c: TriggerConfig): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(c)) if (v !== undefined && v !== "") out[k] = v;
  return out;
}

/* --------------------------------------------------------------- recipes */
export type RecipeDeps = { deptId: (slug: string) => string | null; myId: string };
export type Recipe = { key: string; title: string; summary: string; tags: string[]; build: (d: RecipeDeps) => Draft };

const dep = (d: RecipeDeps, slug: string) => d.deptId(slug) || "";

export const RECIPES: Recipe[] = [
  {
    key: "design_to_marketing",
    title: "Design approved → notify Marketing + create Publishing task",
    summary: "When a Design task is marked done, Marketing is told and a publishing task lands with the Marketing head, due in 48h.",
    tags: ["Design", "Marketing"],
    build: (d) => ({
      ...emptyDraft(),
      name: "Design approved → Marketing publishing task",
      description: "Design tasks that reach Done automatically hand over to Marketing for publishing.",
      trigger_type: "task.status_changed",
      trigger_config: { to_status: "done" },
      conditions: [{ field: "department_slug", op: "eq", value: "design" }],
      actions: [
        { type: "notify", to: `department:${dep(d, "marketing")}`, title: "Design ready: {{title}}", body: "{{assignee_name}} finished {{title}} for {{project_name}}. Publishing task created.", kind: "information" },
        { type: "create_task", title: "Publish: {{title}}", description: "Source design task: {{link}}", assignee: `department_head:${dep(d, "marketing")}`, department_id: dep(d, "marketing"), project: "same", priority: "high", due_in_hours: 48, depends_on_source: false },
      ],
    }),
  },
  {
    key: "critical_support",
    title: "Critical support ticket → alert Support manager + IT escalation",
    summary: "A critical task in Support pings the department head, opens an IT escalation due in 4h and tells Technology.",
    tags: ["Support", "IT"],
    build: (d) => ({
      ...emptyDraft(),
      name: "Critical support ticket → IT escalation",
      description: "Critical support work never sits unnoticed.",
      trigger_type: "task.created",
      conditions: [
        { field: "priority", op: "eq", value: "critical" },
        { field: "department_slug", op: "eq", value: "support" },
      ],
      actions: [
        { type: "notify", to: "department_head", title: "Critical ticket: {{title}}", body: "Assigned to {{assignee_name}} · due {{due}}", kind: "critical" },
        { type: "create_task", title: "Escalation: {{title}}", description: "Escalated from Support. Source: {{link}}", assignee: `department_head:${dep(d, "technology")}`, department_id: dep(d, "technology"), project: "same", priority: "critical", due_in_hours: 4, depends_on_source: false },
        { type: "notify", to: `department:${dep(d, "technology")}`, title: "IT escalation opened: {{title}}", kind: "action_required" },
      ],
    }),
  },
  {
    key: "content_to_sales",
    title: "Content published → tell Sales",
    summary: "When a Content task is done, a message is posted in the Sales channel so the team can use the new material.",
    tags: ["Content", "Sales"],
    build: () => ({
      ...emptyDraft(),
      name: "Content published → tell Sales",
      trigger_type: "task.status_changed",
      trigger_config: { to_status: "done" },
      conditions: [{ field: "department_slug", op: "eq", value: "content" }],
      actions: [{ type: "post_message", channel: "slug:sales", body: "📣 New content is live: {{title}} ({{project_name}}) — by {{assignee_name}}" }],
    }),
  },
  {
    key: "approval_manager",
    title: "Approval decided → notify requester's manager",
    summary: "Every approval outcome is copied to the requester's manager for visibility.",
    tags: ["Approvals"],
    build: () => ({
      ...emptyDraft(),
      name: "Approval decided → requester's manager",
      trigger_type: "approval.decided",
      actions: [{ type: "notify", to: "manager", title: "Approval {{status}}: {{title}}", body: "Requested by {{requester_name}} · decided by {{approver_name}}", kind: "information" }],
    }),
  },
  {
    key: "weekly_report",
    title: "Weekly status report every Monday 09:00",
    summary: "Creates a “Weekly status report” task for the automation owner at the start of every week.",
    tags: ["Schedule"],
    build: () => ({
      ...emptyDraft(),
      name: "Weekly status report",
      trigger_type: "schedule",
      trigger_config: { every: "week", weekday: 1, at: "09:00" },
      actions: [{ type: "create_task", title: "Weekly status report — {{today}}", description: "Summarise progress, blockers and next week's priorities.", assignee: "owner", department_id: "same", project: "same", priority: "normal", due_in_hours: 8 }],
    }),
  },
  {
    key: "investor_material",
    title: "Investor material approved → post to #management",
    summary: "Approved file versions are announced in the Management channel.",
    tags: ["Files", "Management"],
    build: () => ({
      ...emptyDraft(),
      name: "Investor material approved → #management",
      trigger_type: "file.version_approved",
      actions: [{ type: "post_message", channel: "slug:management", body: "✅ Approved: {{title}} (v{{version}}) in {{project_name}}" }],
    }),
  },
  {
    key: "handoff_owner",
    title: "Handoff accepted → notify project owner",
    summary: "When a department accepts a handoff the project owner hears about it.",
    tags: ["Handoffs"],
    build: () => ({
      ...emptyDraft(),
      name: "Handoff accepted → project owner",
      trigger_type: "handoff.accepted",
      actions: [{ type: "notify", to: "project_owner", title: "Handoff accepted: {{title}}", body: "{{department_name}} accepted the handoff. Now with {{assignee_name}}.", kind: "information" }],
    }),
  },
  {
    key: "new_project_kickoff",
    title: "New project → create kickoff meeting task",
    summary: "Every new project gets a “Schedule kickoff” task for its owner, due in 48h.",
    tags: ["Projects"],
    build: () => ({
      ...emptyDraft(),
      name: "New project → kickoff task",
      trigger_type: "project.created",
      actions: [{ type: "create_task", title: "Schedule kickoff for {{title}}", description: "Book the kickoff meeting, invite the team and share the objectives.", assignee: "owner", department_id: "same", project: "same", priority: "high", due_in_hours: 48 }],
    }),
  },
  {
    key: "slack",
    title: "Critical task → Slack alert",
    summary: "Posts every new critical task to a Slack incoming-webhook integration. Pick the integration in the action.",
    tags: ["Slack", "Integrations"],
    build: () => ({
      ...emptyDraft(),
      name: "Critical task → Slack",
      trigger_type: "task.created",
      conditions: [{ field: "priority", op: "eq", value: "critical" }],
      actions: [{ type: "slack", integration_id: "", body: "🚨 *{{title}}* — {{project_name}} · assigned to {{assignee_name}} · due {{due}} ({{link}})" }],
    }),
  },
];
export const recipe = (key: string) => RECIPES.find((r) => r.key === key);

/* ----------------------------------------------------------- summaries */
/** One-line description of an action for cards and run logs. */
export function actionSummary(a: Action, names: { person: (id: string) => string; department: (id: string) => string }): string {
  const t = a.type;
  const target = (v: unknown) => {
    const s = String(v ?? "");
    const { base, arg } = splitTarget(s);
    if (base === "user:") return names.person(arg);
    if (base === "department:") return `everyone in ${names.department(arg)}`;
    if (base === "department_head:") return `head of ${names.department(arg)}`;
    if (base === "role:") return `all ${arg.replace(/_/g, " ")}s`;
    return TARGETS.find((x) => x.key === s)?.label.replace(/ \(.*\)$/, "") || s || "—";
  };
  switch (t) {
    case "notify": return `Notify ${target(a.to)}`;
    case "create_task": return `Create task “${a.title || "Follow-up: {{title}}"}”`;
    case "update_task": {
      const bits = [a.status && `status → ${a.status}`, a.priority && `priority → ${a.priority}`, a.assignee && `assignee → ${target(a.assignee)}`, a.add_tag && `tag +${a.add_tag}`, a.due_in_hours && `due +${a.due_in_hours}h`, a.waiting_on && `waiting on ${a.waiting_on}`].filter(Boolean);
      return `Update task${bits.length ? ": " + bits.join(", ") : ""}`;
    }
    case "post_message": {
      const ch = String(a.channel || "");
      const { base, arg } = splitTarget(ch);
      const where = ch === "project" ? "project channel" : base === "slug:" ? `#${arg}` : base === "department:" ? `${names.department(arg)} channel` : base === "channel:" ? "channel" : ch || "—";
      return `Post in ${where}`;
    }
    case "create_approval": return `Request approval from ${target(a.approver || "manager")}`;
    case "slack": return "Send to Slack";
    case "webhook": return "Call webhook";
    case "create_project_from_template": return `Create project from “${a.template_key || "template"}”`;
    default: return t;
  }
}
