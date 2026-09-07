"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/database.types";

/* ----------------------------------------------------------- JSON helpers */
export function jsonObj(j: Json | null | undefined): Record<string, Json | undefined> {
  return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, Json | undefined>) : {};
}
export function jsonArr(j: Json | null | undefined): Record<string, Json | undefined>[] {
  return Array.isArray(j) ? j.map((x) => jsonObj(x)) : [];
}
export function num(j: Json | undefined, d = 0) {
  return typeof j === "number" ? j : typeof j === "string" && j !== "" && !Number.isNaN(Number(j)) ? Number(j) : d;
}
export function str(j: Json | undefined, d = "") {
  return typeof j === "string" ? j : j == null ? d : String(j);
}
export function strArr(j: Json | undefined): string[] {
  return Array.isArray(j) ? j.map((x) => str(x)).filter(Boolean) : [];
}
export function bool(j: Json | undefined) {
  return j === true || j === "true";
}

/* ------------------------------------------------------- module adoption */
/** Records that the viewer opened a module (`touch_module`). Fire-and-forget, once per mount. */
export function useTouchModule(module: string) {
  React.useEffect(() => {
    createClient().rpc("touch_module", { p_module: module }).then(() => {});
  }, [module]);
}

/* ----------------------------------------------------------- label maps */
export const REQUEST_KINDS = ["expense", "travel", "purchase", "wfh", "field_duty", "late_explanation", "overtime", "comp_off", "training", "other"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export const REQUEST_KIND_LABEL: Record<RequestKind, string> = {
  expense: "Expense claim", travel: "Travel", purchase: "Purchase", wfh: "Work from home", field_duty: "Field duty", late_explanation: "Late explanation", overtime: "Overtime", comp_off: "Comp-off", training: "Training", other: "Other",
};
export const REQUEST_KIND_HINT: Record<RequestKind, string> = {
  expense: "Reimbursement for money you already spent.", travel: "Trips, tickets and stay.", purchase: "Something the company should buy.", wfh: "Days you will work remotely.", field_duty: "Days you will be out on field work.",
  late_explanation: "Explain a late arrival so it is not counted against you.", overtime: "Extra hours you worked or will work.", comp_off: "Compensatory leave for extra days worked.", training: "A course, certification or conference.", other: "Anything else that needs a decision.",
};
/** Which kinds carry money / dates. */
export const KIND_HAS_AMOUNT: RequestKind[] = ["expense", "travel", "purchase", "training"];
export const KIND_HAS_DATES: RequestKind[] = ["travel", "wfh", "field_duty", "overtime", "comp_off", "training", "late_explanation"];

export const REQUEST_STATUS_TONE: Record<string, string> = { pending: "tone-warn", approved: "tone-success", rejected: "tone-danger", cancelled: "tone-muted", fulfilled: "tone-info" };

export const SERVICE_STATUSES = ["ok", "degraded", "down", "maintenance"] as const;
export const SERVICE_STATUS_LABEL: Record<string, string> = { ok: "Operational", degraded: "Degraded", down: "Down", maintenance: "Maintenance" };
export const SERVICE_STATUS_TONE: Record<string, string> = { ok: "tone-success", degraded: "tone-warn", down: "tone-danger", maintenance: "tone-info" };

export const BROADCAST_KINDS = ["urgent", "emergency", "office", "system"] as const;
export const BROADCAST_KIND_LABEL: Record<string, string> = { urgent: "Urgent", emergency: "Emergency", office: "Office notice", system: "System" };
export const BROADCAST_KIND_TONE: Record<string, string> = { urgent: "tone-orange", emergency: "tone-danger", office: "tone-info", system: "tone-neutral" };

export const CHECKIN_STATUSES = [
  { key: "safe", label: "I'm safe", tone: "tone-success" },
  { key: "need_help", label: "I need help", tone: "tone-danger" },
  { key: "not_at_office", label: "Not at the office", tone: "tone-neutral" },
] as const;

export const RESOURCE_KINDS = ["room", "desk", "equipment", "vehicle"] as const;
export const RESOURCE_KIND_LABEL: Record<string, string> = { room: "Rooms", desk: "Desks", equipment: "Equipment", vehicle: "Vehicles" };

export const EVENT_KINDS = ["event", "training", "town_hall", "team_meeting", "celebration"] as const;
export const EVENT_KIND_LABEL: Record<string, string> = { event: "Event", training: "Training", town_hall: "Town hall", team_meeting: "Team meeting", celebration: "Celebration" };

export const CAPACITY_TONE: Record<string, string> = { light: "tone-success", balanced: "tone-info", heavy: "tone-warn", critical: "tone-danger" };
export const CAPACITY_COLOR: Record<string, string> = { light: "var(--success)", balanced: "var(--info)", heavy: "var(--warn)", critical: "var(--danger)" };

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Local YYYY-MM-DD for a Date. */
export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDaysLocal(day: string, n: number) {
  const d = new Date(day + "T00:00:00");
  d.setDate(d.getDate() + n);
  return localDay(d);
}
/** Human-friendly Postgres error messages for constraint violations we expect. */
export function friendlyError(message: string) {
  if (/exclusion constraint|overlap|conflicting key value/i.test(message)) return "That slot is already taken — pick another time.";
  if (/row-level security/i.test(message)) return "You do not have permission to do that.";
  if (/not allowed to broadcast/i.test(message)) return "You are not allowed to broadcast to this audience.";
  return message;
}
