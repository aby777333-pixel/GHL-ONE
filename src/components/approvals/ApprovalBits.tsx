"use client";

import { differenceInHours, differenceInDays } from "date-fns";
import { Pill } from "@/components/ui";
import { APPROVAL_STATUS_LABEL, APPROVAL_STATUS_TONE, cn, humanize, type ApprovalStatus, type ApprovalType } from "@/lib/utils";

/** ₹ formatted for India. */
export function fmtAmount(n?: number | null) {
  if (n === null || n === undefined) return "";
  return `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export const AMOUNT_TYPES: ApprovalType[] = ["budget", "purchase", "expense", "contract", "vendor"];

export function ApprovalStatusPill({ status, size }: { status: ApprovalStatus; size?: "lg" }) {
  return <Pill tone={APPROVAL_STATUS_TONE[status]} size={size}>{APPROVAL_STATUS_LABEL[status]}</Pill>;
}

export function ApprovalTypePill({ type }: { type: ApprovalType }) {
  return <Pill tone="tone-violet">{humanize(type)}</Pill>;
}

/** "waiting 3d" — stale (danger) after 48h. */
export function WaitingSince({ since, status, className }: { since: string; status: ApprovalStatus; className?: string }) {
  if (status !== "pending") return null;
  const hours = differenceInHours(new Date(), new Date(since));
  const days = differenceInDays(new Date(), new Date(since));
  const label = hours < 1 ? "just now" : hours < 24 ? `waiting ${hours}h` : `waiting ${days}d`;
  const stale = hours >= 48;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs num", stale ? "text-danger font-medium" : "text-muted", className)}>
      {stale && <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)]" />}
      {label}
    </span>
  );
}

export const EVENT_ACTION_LABEL: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Requested changes",
  delegated: "Delegated",
  pending: "Reopened",
};

export const EVENT_ACTION_TONE: Record<string, string> = {
  requested: "tone-info",
  approved: "tone-success",
  rejected: "tone-danger",
  changes_requested: "tone-orange",
  delegated: "tone-violet",
  pending: "tone-warn",
};
