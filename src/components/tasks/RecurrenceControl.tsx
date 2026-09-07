"use client";

import * as React from "react";
import { Repeat } from "lucide-react";
import { Input, Select } from "@/components/ui";
import type { Json } from "@/lib/database.types";
import { fmtDate } from "@/lib/utils";

/** Contract shared with the `task_recurrence_spawn` trigger: {"every":"day|week|month|quarter|year","interval":1,"until":"YYYY-MM-DD"?} */
export type RecurrenceEvery = "day" | "week" | "month" | "quarter" | "year";
export type Recurrence = { every: RecurrenceEvery; interval: number; until?: string };

const EVERY: RecurrenceEvery[] = ["day", "week", "month", "quarter", "year"];
const EVERY_LABEL: Record<RecurrenceEvery, string> = { day: "Daily", week: "Weekly", month: "Monthly", quarter: "Quarterly", year: "Yearly" };
const UNIT: Record<RecurrenceEvery, string> = { day: "day", week: "week", month: "month", quarter: "quarter", year: "year" };

export function parseRecurrence(v: Json | null | undefined): Recurrence | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const every = typeof o.every === "string" && (EVERY as string[]).includes(o.every) ? (o.every as RecurrenceEvery) : null;
  if (!every) return null;
  const n = Number(o.interval);
  const until = typeof o.until === "string" && o.until ? o.until.slice(0, 10) : undefined;
  return { every, interval: Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1, ...(until ? { until } : {}) };
}

export function describeRecurrence(r: Recurrence | null) {
  if (!r) return "Does not repeat";
  const n = r.interval;
  const base = n === 1 ? EVERY_LABEL[r.every] : `Every ${n} ${UNIT[r.every]}s`;
  return r.until ? `${base} until ${fmtDate(r.until)}` : base;
}

/** Sidebar control for `tasks.recurrence`. Saves on every change; `null` = does not repeat. */
export function RecurrenceControl({ value, onChange, done }: { value: Recurrence | null; onChange: (r: Recurrence | null) => void; done?: boolean }) {
  const every = value?.every || "";
  return (
    <div className={value ? "rounded-[var(--radius-sm)] p-3 space-y-2 border border-[var(--info)] bg-[var(--info-bg)]" : "space-y-2"}>
      <div className="label mb-0 inline-flex items-center gap-1.5"><Repeat size={12} className="text-muted" /> Repeat</div>
      <Select value={every} onChange={(e) => { const v = e.target.value as RecurrenceEvery | ""; onChange(v ? { every: v, interval: value?.interval || 1, ...(value?.until ? { until: value.until } : {}) } : null); }}>
        <option value="">Does not repeat</option>
        {EVERY.map((k) => <option key={k} value={k}>{EVERY_LABEL[k]}</option>)}
      </Select>
      {value && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] text-muted block mb-1">Every N {UNIT[value.every]}s</span>
              <Input type="number" min={1} max={52} step={1} value={value.interval} onChange={(e) => { const n = Math.max(1, Math.min(52, Math.floor(Number(e.target.value) || 1))); onChange({ ...value, interval: n }); }} className="h-9" />
            </label>
            <label className="block">
              <span className="text-[11px] text-muted block mb-1">Until (optional)</span>
              <Input type="date" value={value.until || ""} onChange={(e) => { const u = e.target.value; const next: Recurrence = { every: value.every, interval: value.interval, ...(u ? { until: u } : {}) }; onChange(next); }} className="h-9" />
            </label>
          </div>
          <div className="text-[11px] text-muted leading-snug">
            {describeRecurrence(value)} · the next occurrence is created automatically when this one is completed{value.until ? `, until ${fmtDate(value.until)}` : ""}. Checklist items are copied; comments are not.
            {done && " This instance is done, so the repeat has already moved to the next occurrence."}
          </div>
        </>
      )}
    </div>
  );
}
