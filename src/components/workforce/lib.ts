import type { Json } from "@/lib/database.types";
import type { Database } from "@/lib/database.types";
import type { Tables } from "@/lib/utils";

/* ------------------------------------------------------------ row types */
export type BreakType = Tables<"break_types">;
export type BreakPolicy = Tables<"break_policies">;
export type CoverageRequirement = Tables<"coverage_requirements">;
export type ExceptionRow = Database["public"]["Functions"]["attendance_exceptions"]["Returns"][number];
export type PatternRow = Database["public"]["Functions"]["attendance_patterns"]["Returns"][number];
export type ForecastRow = Database["public"]["Functions"]["coverage_forecast"]["Returns"][number];
export type ShiftLite = Pick<Tables<"shifts">, "id" | "name" | "start_time" | "end_time">;

/* -------------------------------------------------- workforce_live() JSON */
export type LiveCounts = { headcount: number; present: number; checked_out: number; remote: number; field: number; on_break: number; in_meeting: number; focus: number; late: number; on_leave: number; not_in: number };
export type LiveDepartment = { department_id: string; name: string; color: string | null; required: number; available: number; on_break: number; in_meeting: number; on_leave: number; remote: number; field: number; not_in: number; shortfall: number; on_duty: string | null; status: string | null };
export type OpenBreak = { user_id: string; name: string; department_id: string | null; type: string | null; since: string; minutes: number; max: number | null; over: boolean };
export type NotInRow = { user_id: string; name: string; department_id: string | null; shift_start: string | null; minutes_late: number };
export type MissingCheckoutRow = { user_id: string; name: string; day: string; first_in: string | null };
export type InactiveRow = { user_id: string; name: string; department_id: string | null; last_activity: string | null; last_kind: string | null; hours: number };
export type CoverageAlert = { department: string; shortfall: number };
export type WorkforceLiveData = {
  error?: string;
  day: string;
  counts: LiveCounts;
  departments: LiveDepartment[];
  open_breaks: OpenBreak[];
  not_in: NotInRow[];
  missing_checkout: MissingCheckoutRow[];
  inactive: InactiveRow[];
  exceptions_today: number;
  coverage_alerts: CoverageAlert[];
};

/* ------------------------------------------------ attendance_summary() JSON */
export type SummaryDay = { day: string; present: number; late: number; remote: number; leave: number; absent: number; avg_minutes: number | null };
export type SummaryDepartment = { department_id: string; name: string; headcount: number; present_days: number; late: number; avg_minutes: number | null; exceptions: number };
export type SummaryData = { from: string; to: string; days: SummaryDay[]; departments: SummaryDepartment[]; patterns: PatternRow[] };

/* ------------------------------------------------- attendance_settings() */
export type AttendanceSettings = {
  grace_minutes: number; not_in_alert_minutes: number; checkout_reminder_minutes: number; auto_checkout: boolean; auto_checkout_after_minutes: number;
  short_day_minutes: number; early_leave_minutes: number; max_break_minutes_day: number; break_alert_manager_multiplier: number; daily_summary: boolean; weekly_summary: boolean;
  idle_hours: number; employee_alerts: boolean; show_location_to: string; access_events_retention_days: number;
};
export const DEFAULT_SETTINGS: AttendanceSettings = {
  grace_minutes: 15, not_in_alert_minutes: 45, checkout_reminder_minutes: 30, auto_checkout: true, auto_checkout_after_minutes: 240, short_day_minutes: 360, early_leave_minutes: 30,
  max_break_minutes_day: 75, break_alert_manager_multiplier: 2, daily_summary: true, weekly_summary: true, idle_hours: 3, employee_alerts: true, show_location_to: "self_hr", access_events_retention_days: 180,
};
export function parseSettings(j: Json | null | undefined): AttendanceSettings {
  const o = j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, Json | undefined>) : {};
  const n = (k: keyof AttendanceSettings) => (typeof o[k] === "number" ? (o[k] as number) : (DEFAULT_SETTINGS[k] as number));
  const b = (k: keyof AttendanceSettings) => (typeof o[k] === "boolean" ? (o[k] as boolean) : (DEFAULT_SETTINGS[k] as boolean));
  return {
    grace_minutes: n("grace_minutes"), not_in_alert_minutes: n("not_in_alert_minutes"), checkout_reminder_minutes: n("checkout_reminder_minutes"), auto_checkout: b("auto_checkout"),
    auto_checkout_after_minutes: n("auto_checkout_after_minutes"), short_day_minutes: n("short_day_minutes"), early_leave_minutes: n("early_leave_minutes"), max_break_minutes_day: n("max_break_minutes_day"),
    break_alert_manager_multiplier: n("break_alert_manager_multiplier"), daily_summary: b("daily_summary"), weekly_summary: b("weekly_summary"), idle_hours: n("idle_hours"), employee_alerts: b("employee_alerts"),
    show_location_to: typeof o.show_location_to === "string" ? o.show_location_to : DEFAULT_SETTINGS.show_location_to, access_events_retention_days: n("access_events_retention_days"),
  };
}

/* ----------------------------------------------------------- exceptions */
export const EXCEPTION_LABEL: Record<string, string> = { late: "Late", early_leave: "Early leave", missing_checkout: "Missing check-out", short_day: "Short day", excess_break: "Excess break", absent: "Absent" };
export const EXCEPTION_TONE: Record<string, string> = { late: "tone-warn", early_leave: "tone-orange", missing_checkout: "tone-info", short_day: "tone-violet", excess_break: "tone-warn", absent: "tone-danger" };
export const EXCEPTION_KINDS = ["late", "early_leave", "missing_checkout", "short_day", "excess_break", "absent"] as const;

/* ------------------------------------------------------------- coverage */
export const RISK_TONE: Record<string, string> = { ok: "tone-success", thin: "tone-warn", uncovered: "tone-danger", weekend: "tone-muted" };
export const RISK_LABEL: Record<string, string> = { ok: "Covered", thin: "Thin", uncovered: "Uncovered", weekend: "Weekend" };
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const PRIVACY_PRINCIPLE = "No keystroke, screenshot, webcam, microphone or continuous location tracking. Employees see everything shown here about themselves.";

/** Typed accessor for a JSON payload returned by an RPC; keeps `as` casts in one place. */
export function asLive(j: Json | null | undefined): WorkforceLiveData | null {
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  return j as unknown as WorkforceLiveData;
}
export function asSummary(j: Json | null | undefined): SummaryData | null {
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  return j as unknown as SummaryData;
}
