import type { Json } from "@/lib/database.types";
import type { Profile, Tables } from "@/lib/utils";

/* ------------------------------------------------------------------ rows */
export type HrPerson = Profile;
export type WorkflowTemplate = Tables<"workflow_templates">;
export type WorkflowRun = Tables<"workflow_runs">;
export type WorkflowStep = Tables<"workflow_steps">;
export type TransferRow = Tables<"employee_transfers">;
export type RoleChangeRow = Tables<"role_changes">;
export type ProbationReview = Tables<"probation_reviews">;
export type AssetRow = Tables<"assets">;
export type AssetAssignment = Tables<"asset_assignments">;
export type AssetRequest = Tables<"asset_requests">;
export type EmployeeDocument = Tables<"employee_documents">;
export type JobOpening = Tables<"job_openings">;
export type Candidate = Tables<"candidates">;
export type Interview = Tables<"interviews">;
export type ShiftRow = Pick<Tables<"shifts">, "id" | "name" | "start_time" | "end_time" | "color" | "active">;
export type TeamRow = Pick<Tables<"teams">, "id" | "name" | "department_id">;

/** Everything the HR console needs; fetched server-side with the caller's RLS-scoped client. */
export type HrData = {
  people: HrPerson[];
  shifts: ShiftRow[];
  teams: TeamRow[];
  templates: WorkflowTemplate[];
  runs: WorkflowRun[];
  transfers: TransferRow[];
  roleChanges: RoleChangeRow[];
  probationReviews: ProbationReview[];
  assets: AssetRow[];
  assignments: AssetAssignment[];
  assetRequests: AssetRequest[];
  jobs: JobOpening[];
  candidates: Candidate[];
  interviews: Interview[];
};

export const EMPTY_HR: HrData = { people: [], shifts: [], teams: [], templates: [], runs: [], transfers: [], roleChanges: [], probationReviews: [], assets: [], assignments: [], assetRequests: [], jobs: [], candidates: [], interviews: [] };

/* --------------------------------------------------------------- sub-views */
export const HR_VIEWS = ["people", "onboarding", "transfers", "probation", "offboarding", "assets", "documents", "ats"] as const;
export type HrView = (typeof HR_VIEWS)[number];
export function asHrView(v: unknown): HrView {
  return typeof v === "string" && (HR_VIEWS as readonly string[]).includes(v) ? (v as HrView) : "people";
}

/* ------------------------------------------------------------------ labels */
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern", "consultant", "vendor"] as const;
export const EMPLOYMENT_LABEL: Record<string, string> = { full_time: "Full-time", part_time: "Part-time", contract: "Contract", intern: "Intern", consultant: "Consultant", vendor: "Vendor" };
export const WORK_MODES = ["office", "remote", "hybrid", "field"] as const;
export const WORK_MODE_LABEL: Record<string, string> = { office: "Office", remote: "Remote", hybrid: "Hybrid", field: "Field" };

export const ASSET_KINDS = ["laptop", "phone", "sim", "monitor", "access_card", "camera", "license", "peripheral", "other"] as const;
export const ASSET_KIND_LABEL: Record<string, string> = { laptop: "Laptop", phone: "Phone", sim: "SIM", monitor: "Monitor", access_card: "Access card", camera: "Camera", license: "Licence", peripheral: "Peripheral", other: "Other" };
export const ASSET_STATUSES = ["available", "assigned", "repair", "retired"] as const;
export const ASSET_STATUS_TONE: Record<string, string> = { available: "tone-success", assigned: "tone-info", repair: "tone-warn", retired: "tone-muted" };
export const ASSET_REQUEST_TONE: Record<string, string> = { pending: "tone-warn", approved: "tone-info", rejected: "tone-danger", fulfilled: "tone-success" };

export const DOC_KINDS = ["offer_letter", "contract", "id_proof", "certificate", "policy_ack", "payslip", "letter", "other"] as const;
export const DOC_KIND_LABEL: Record<string, string> = { offer_letter: "Offer letter", contract: "Contract", id_proof: "ID proof", certificate: "Certificate", policy_ack: "Policy acknowledgement", payslip: "Payslip", letter: "Letter", other: "Other" };

export const WORKFLOW_KINDS = ["onboarding", "offboarding", "transfer", "promotion", "probation", "incident", "custom"] as const;
export const RUN_STATUS_TONE: Record<string, string> = { running: "tone-info", completed: "tone-success", cancelled: "tone-muted" };
export const STEP_STATUS_TONE: Record<string, string> = { pending: "tone-muted", ready: "tone-warn", in_progress: "tone-info", done: "tone-success", skipped: "tone-neutral" };
export const STEP_STATUS_LABEL: Record<string, string> = { pending: "Waiting on earlier steps", ready: "Ready", in_progress: "In progress", done: "Done", skipped: "Skipped" };

export const TRANSFER_STATUS_TONE: Record<string, string> = { proposed: "tone-warn", approved: "tone-info", applied: "tone-success", cancelled: "tone-muted" };
export const PROBATION_STATUS_TONE: Record<string, string> = { pending: "tone-warn", confirmed: "tone-success", extended: "tone-orange", not_confirmed: "tone-danger" };
export const PROBATION_STATUS_LABEL: Record<string, string> = { pending: "Review pending", confirmed: "Confirmed", extended: "Extended", not_confirmed: "Not confirmed" };

export const CANDIDATE_STAGES = ["applicant", "screening", "interview", "practical_test", "offer", "hired", "rejected"] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];
export const STAGE_LABEL: Record<CandidateStage, string> = { applicant: "Applicant", screening: "Screening", interview: "Interview", practical_test: "Practical test", offer: "Offer", hired: "Hired", rejected: "Rejected" };
export const STAGE_DOT: Record<CandidateStage, string> = { applicant: "var(--fg-muted)", screening: "var(--info)", interview: "var(--brand-2)", practical_test: "var(--violet)", offer: "var(--warn)", hired: "var(--success)", rejected: "var(--danger)" };
export function asStage(s: string): CandidateStage {
  return (CANDIDATE_STAGES as readonly string[]).includes(s) ? (s as CandidateStage) : "applicant";
}
export const INTERVIEW_KINDS = ["screening", "interview", "practical_test", "final"] as const;
export const CANDIDATE_SOURCES = ["referral", "linkedin", "job_portal", "website", "agency", "walk_in", "other"] as const;

export const APPLICATION_STATUSES = ["applied", "shortlisted", "interview", "selected", "rejected", "withdrawn"] as const;
export const APPLICATION_TONE: Record<string, string> = { applied: "tone-neutral", shortlisted: "tone-info", interview: "tone-brand", selected: "tone-success", rejected: "tone-danger", withdrawn: "tone-muted" };

/* ----------------------------------------------------------- step owners */
/** Fixed owner keys understood by `resolve_step_owner` in 0012_hr_ops.sql; `department:<slug>` and `user:<id>` are added dynamically. */
export const STEP_OWNER_FIXED: { key: string; label: string }[] = [
  { key: "hr", label: "HR (on duty / head)" },
  { key: "it", label: "IT / Technology" },
  { key: "admin", label: "Admin" },
  { key: "manager", label: "The person's manager" },
  { key: "employee", label: "The person themselves" },
  { key: "department_head", label: "The person's department head" },
  { key: "primary_admin", label: "Primary admin" },
];

export type TemplateStep = { key: string; title: string; description: string; owner: string; depends_on: string[]; due_days: number };

export function parseSteps(j: Json | null | undefined): TemplateStep[] {
  if (!Array.isArray(j)) return [];
  const out: TemplateStep[] = [];
  for (const item of j) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, Json | undefined>;
    if (typeof o.key !== "string" || !o.key) continue;
    out.push({
      key: o.key,
      title: typeof o.title === "string" ? o.title : o.key,
      description: typeof o.description === "string" ? o.description : "",
      owner: typeof o.owner === "string" ? o.owner : "hr",
      depends_on: Array.isArray(o.depends_on) ? o.depends_on.filter((x): x is string => typeof x === "string") : [],
      due_days: typeof o.due_days === "number" ? o.due_days : 3,
    });
  }
  return out;
}

export function stepsToJson(steps: TemplateStep[]): Json {
  return steps.map((s) => ({ key: s.key, title: s.title, description: s.description || null, owner: s.owner, depends_on: s.depends_on, due_days: s.due_days }));
}

export function stepKeyFromTitle(title: string, taken: string[]) {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "").slice(0, 32) || "step";
  let key = base;
  let i = 2;
  while (taken.includes(key)) key = `${base}_${i++}`;
  return key;
}

/* ------------------------------------------------------- probation goals */
export type ProbationGoal = { title: string; met: boolean | null; note: string };
export function parseGoals(j: Json | null | undefined): ProbationGoal[] {
  if (!Array.isArray(j)) return [];
  const out: ProbationGoal[] = [];
  for (const item of j) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, Json | undefined>;
    if (typeof o.title !== "string") continue;
    out.push({ title: o.title, met: typeof o.met === "boolean" ? o.met : null, note: typeof o.note === "string" ? o.note : "" });
  }
  return out;
}

/* ----------------------------------------------------- interview scores */
export type InterviewScore = { score: number | null; note: string };
export function parseScores(j: Json | null | undefined): Record<string, InterviewScore> {
  if (!j || typeof j !== "object" || Array.isArray(j)) return {};
  const out: Record<string, InterviewScore> = {};
  for (const [k, v] of Object.entries(j as Record<string, Json | undefined>)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const o = v as Record<string, Json | undefined>;
    out[k] = { score: typeof o.score === "number" ? o.score : null, note: typeof o.note === "string" ? o.note : "" };
  }
  return out;
}

/* ------------------------------------------------------ emergency contact */
export type EmergencyContact = { name: string; relation: string; phone: string };
export function parseEmergency(j: Json | null | undefined): EmergencyContact {
  const empty = { name: "", relation: "", phone: "" };
  if (!j || typeof j !== "object" || Array.isArray(j)) return empty;
  const o = j as Record<string, Json | undefined>;
  return { name: typeof o.name === "string" ? o.name : "", relation: typeof o.relation === "string" ? o.relation : "", phone: typeof o.phone === "string" ? o.phone : "" };
}

/* ------------------------------------------------------------ helpers */
export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
export function daysUntil(date: string, from = todayIso()) {
  return Math.round((new Date(date).getTime() - new Date(from).getTime()) / 86_400_000);
}
export function safeName(name: string) {
  return name.replace(/[^\w.\-()+ ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
}
export function csvToList(s: string) {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}
export function upsertBy<T extends { id: string }>(list: T[], row: T) {
  return list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [row, ...list];
}
