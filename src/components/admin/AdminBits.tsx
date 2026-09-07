"use client";

import * as React from "react";
import Link from "next/link";
import { Avatar, Pill } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, humanize } from "@/lib/utils";

/* ------------------------------------------------------------- Metric tile */
/** Compact metric used across the control plane. Whole tile is a link when `href` is given. */
export function Metric({ label, value, tone, href, sub, icon, className }: { label: string; value: React.ReactNode; tone?: string; href?: string; sub?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-[11px] text-muted leading-tight truncate">{label}</span>
        {icon && <span className="text-muted shrink-0">{icon}</span>}
      </div>
      <div className={cn("text-[1.25rem] font-semibold num leading-tight mt-0.5", tone)}>{value}</div>
      {sub && <div className="text-[11px] text-muted mt-0.5 truncate">{sub}</div>}
    </>
  );
  const cls = cn("card px-3 py-2.5 min-w-0 block", href && "card-hover", className);
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

/* ---------------------------------------------------------------- Section */
export function Section({ title, hint, action, children, className }: { title: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="flex items-end justify-between gap-3 mb-2 px-0.5">
        <div className="min-w-0">
          <div className="eyebrow">{title}</div>
          {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ----------------------------------------------------------------- Toggle */
export function Switch({ on, onChange, label, hint, disabled, size = "md" }: { on: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; hint?: React.ReactNode; disabled?: boolean; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-4 w-7" : "h-5 w-9";
  const knob = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const shift = size === "sm" ? "translate-x-[14px]" : "translate-x-[18px]";
  const btn = (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className={cn("relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:opacity-50", h, on ? "bg-[var(--brand)]" : "bg-[var(--line-strong)]")}>
      <span className={cn("inline-block rounded-full bg-white shadow transition-transform", knob, on ? shift : "translate-x-[2px]")} />
    </button>
  );
  if (!label) return btn;
  return (
    <label className={cn("flex items-start gap-3", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
      <span className="mt-0.5">{btn}</span>
      <span className="text-sm min-w-0"><span className="font-medium">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ Pills */
export function RiskPill({ risk }: { risk: string }) {
  const tone = risk === "high" ? "tone-danger" : risk === "low" ? "tone-muted" : "tone-neutral";
  return <Pill tone={tone}>{risk === "high" ? "High risk" : humanize(risk)}</Pill>;
}

export function LevelPill({ level }: { level: string }) {
  const tone = level === "edit" ? "tone-warn" : level === "download" ? "tone-orange" : level === "comment" ? "tone-info" : "tone-neutral";
  return <Pill tone={tone}>{humanize(level)}</Pill>;
}

export function ResourceTypePill({ type }: { type: string }) {
  const tone = type === "project" ? "tone-info" : type === "file" ? "tone-violet" : type === "channel" ? "tone-brand" : type === "department" ? "tone-success" : "tone-neutral";
  return <Pill tone={tone}>{humanize(type)}</Pill>;
}

export const DEPT_STATUS_TONE: Record<string, string> = { available: "tone-success", busy: "tone-warn", limited: "tone-warn", emergency_only: "tone-danger", offline: "tone-muted" };
export function DeptStatusPill({ status }: { status: string }) {
  return <Pill tone={DEPT_STATUS_TONE[status] || "tone-neutral"}>{humanize(status)}</Pill>;
}

/* ---------------------------------------------------------------- Person */
/** Person from the session directory (active members) with a graceful fallback for inactive / unknown ids. */
export function PersonLine({ id, size = 22, name, showName = true, className, sub }: { id?: string | null; size?: number; name?: string | null; showName?: boolean; className?: string; sub?: React.ReactNode }) {
  const { people } = useSession();
  const p = id ? people.find((x) => x.id === id) : undefined;
  const label = p?.full_name || name || (id ? "Former member" : "—");
  return (
    <span className={cn("inline-flex items-center gap-2 min-w-0", className)}>
      <Avatar name={label} src={p?.avatar_url} size={size} presence={p?.presence} />
      {showName && (
        <span className="min-w-0">
          <span className="block text-sm truncate">{label}</span>
          {sub && <span className="block text-[11px] text-muted truncate">{sub}</span>}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------ Date input */
/** ISO ⇄ `datetime-local` helpers (local time). */
export function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : null;
}

/* ------------------------------------------------------------- Info note */
export function Note({ children, tone = "neutral", icon, className }: { children: React.ReactNode; tone?: "neutral" | "warn" | "danger" | "info" | "success"; icon?: React.ReactNode; className?: string }) {
  const border = { neutral: "border-[var(--line)]", warn: "border-[var(--warn)]", danger: "border-[var(--danger)]", info: "border-[var(--info)]", success: "border-[var(--success)]" }[tone];
  const bg = { neutral: "sunken", warn: "tone-warn", danger: "tone-danger", info: "tone-info", success: "tone-success" }[tone];
  return (
    <div className={cn("rounded-[var(--radius-sm)] border px-3 py-2 text-xs flex items-start gap-2", border, bg, className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function KeyValue({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1 border-b border-dashed last:border-0", className)}>
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm num text-right min-w-0 truncate">{children}</span>
    </div>
  );
}
