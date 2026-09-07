import { STATUS_LABEL, PRIORITY_LABEL, WAITING_LABEL, humanize, fmtDate, type Tables, type TaskStatus, type TaskPriority, type WaitingOn } from "@/lib/utils";

type PersonLite = { id: string; full_name: string };
type AuditRow = Tables<"audit_logs">;
type HistoryRow = Tables<"task_history">;

function nameOf(people: PersonLite[], id?: string | null) {
  if (!id) return "Someone";
  return people.find((p) => p.id === id)?.full_name || "Someone";
}
function first(name: string) {
  return name.split(" ")[0] || name;
}
const statusLabel = (s?: string | null) => (s && s in STATUS_LABEL ? STATUS_LABEL[s as TaskStatus] : humanize(s));
const priorityLabel = (s?: string | null) => (s && s in PRIORITY_LABEL ? PRIORITY_LABEL[s as TaskPriority] : humanize(s));
const waitingLabel = (s?: string | null) => {
  if (!s) return "";
  const key = s.split(" (")[0];
  return key in WAITING_LABEL ? WAITING_LABEL[key as WaitingOn] : humanize(s);
};

/** Turn a task_history row into a sentence fragment (without the actor). */
export function humaniseHistory(row: HistoryRow, people: PersonLite[]): string {
  switch (row.field) {
    case "created":
      return `created the task`;
    case "status":
      return `moved it from ${statusLabel(row.old_value)} to ${statusLabel(row.new_value)}`;
    case "assignee":
      return row.new_value ? `reassigned it to ${nameOf(people, row.new_value)}` : `removed the assignee`;
    case "priority":
      return `changed priority ${priorityLabel(row.old_value)} → ${priorityLabel(row.new_value)}`;
    case "due_date":
      return row.new_value ? `set the deadline to ${fmtDate(row.new_value, true)}` : `removed the deadline`;
    case "waiting_on": {
      const note = row.new_value?.match(/\((.*)\)$/)?.[1];
      const base = row.new_value?.startsWith("none") ? "cleared the waiting state" : `set waiting on: ${waitingLabel(row.new_value)}`;
      return note ? `${base} — “${note}”` : base;
    }
    case "title":
      return `renamed it to “${row.new_value}”`;
    default:
      return `updated ${humanize(row.field)}`;
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Turn an audit_logs row into "Priya moved 'UI design' to In review". */
export function humaniseAudit(row: AuditRow, people: PersonLite[]): { actor: string; text: string; link?: string } {
  const actor = first(nameOf(people, row.actor_id));
  const title = row.summary ? `‘${row.summary}’` : "";
  const oldV = asRecord(row.old_value);
  const newV = asRecord(row.new_value);
  let link: string | undefined;
  if (row.entity_type === "task" && row.entity_id) link = `/tasks/${row.entity_id}`;
  if (row.entity_type === "project" && row.entity_id) link = `/projects/${row.entity_id}`;
  if (row.entity_type === "approval" && row.entity_id) link = `/approvals/${row.entity_id}`;
  if (row.entity_type === "file" && row.entity_id) link = `/files/${row.entity_id}`;
  if (row.entity_type === "decision" && row.entity_id) link = `/decisions/${row.entity_id}`;

  let text: string;
  switch (row.action) {
    case "task.created":
      text = `created ${title}`;
      break;
    case "task.updated": {
      const parts: string[] = [];
      if (oldV.status !== newV.status) parts.push(`moved ${title} to ${statusLabel(String(newV.status))}`);
      if (oldV.assignee_id !== newV.assignee_id) parts.push(`${parts.length ? "and " : ""}assigned ${parts.length ? "it" : title} to ${nameOf(people, newV.assignee_id as string | null)}`);
      if (oldV.priority !== newV.priority) parts.push(`${parts.length ? "and " : ""}set priority ${priorityLabel(String(newV.priority))}${parts.length ? "" : ` on ${title}`}`);
      if (oldV.due_date !== newV.due_date) parts.push(`${parts.length ? "and " : ""}changed the deadline${parts.length ? "" : ` of ${title}`}`);
      if (oldV.waiting_on !== newV.waiting_on) parts.push(`${parts.length ? "and " : ""}${newV.waiting_on === "none" ? "cleared waiting" : `set ${waitingLabel(String(newV.waiting_on)).toLowerCase()}`}${parts.length ? "" : ` on ${title}`}`);
      text = parts.length ? parts.join(" ") : `updated ${title}`;
      break;
    }
    case "project.created":
      text = `created the project ${title}`;
      break;
    case "approval.requested":
      text = `requested approval: ${title}`;
      break;
    case "approval.approved":
      text = `approved ${title}`;
      break;
    case "approval.rejected":
      text = `rejected ${title}`;
      break;
    case "approval.changes_requested":
      text = `requested changes on ${title}`;
      break;
    case "decision.recorded":
      text = `recorded a decision: ${title}`;
      break;
    case "file.version_uploaded":
      text = `uploaded ${title}`;
      break;
    case "profile.permissions_changed":
      text = `changed permissions for ${title}`;
      break;
    default:
      text = `${humanize(row.action.replace(".", " "))} ${title}`.trim();
  }
  return { actor, text, link };
}
