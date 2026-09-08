"use client";

import * as React from "react";
import { EmptyState } from "@/components/ui";
import { BarChart3 } from "lucide-react";
import { cn, fmtDate } from "@/lib/utils";
import { fmtMb, fmtNum, type UsageRow } from "./lib";

type MetricKey = "employees" | "active_users" | "storage_mb" | "ai_calls" | "video_minutes" | "messages" | "projects" | "recordings";

const METRICS: { key: MetricKey; label: string; fmt: (n: number) => string; hint: string }[] = [
  { key: "employees", label: "Employees", fmt: fmtNum, hint: "Active people on the roll." },
  { key: "active_users", label: "Active in 24h", fmt: fmtNum, hint: "People who used the workspace." },
  { key: "storage_mb", label: "Storage", fmt: fmtMb, hint: "Files and recordings held for this company." },
  { key: "ai_calls", label: "AI calls", fmt: fmtNum, hint: "Requests to the assistant in the last day." },
  { key: "video_minutes", label: "Video minutes", fmt: fmtNum, hint: "Time spent in live rooms." },
  { key: "messages", label: "Messages", fmt: fmtNum, hint: "Chat messages in the last day." },
  { key: "projects", label: "Open projects", fmt: fmtNum, hint: "Projects that are not finished." },
  { key: "recordings", label: "Recordings", fmt: fmtNum, hint: "Stored recordings." },
];

/**
 * Consumption and health for one tenant (§50). Deliberately about the *company's* footprint on the
 * platform — never about what any individual employee did.
 */
export function UsagePanel({ usage }: { usage: UsageRow[] }) {
  const [metric, setMetric] = React.useState<MetricKey>("active_users");
  // `platform_company` returns newest first; a chart reads left-to-right in time order.
  const rows = React.useMemo(() => [...usage].sort((a, b) => a.day.localeCompare(b.day)), [usage]);
  const latest = rows[rows.length - 1];
  const active = METRICS.find((m) => m.key === metric)!;
  const values = rows.map((r) => Number(r[metric] || 0));
  const max = Math.max(1, ...values);
  const first = values.find((v) => v > 0) ?? 0;
  const last = values[values.length - 1] ?? 0;
  const trend = first > 0 ? Math.round(((last - first) / first) * 100) : 0;

  if (!rows.length) {
    return (
      <div className="card">
        <EmptyState icon={<BarChart3 size={20} />} title="No usage recorded yet" hint="A snapshot is taken every night at 01:20. A company created today appears here tomorrow." />
      </div>
    );
  }

  return (
    <div className="space-y-[var(--s4)]">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--s2)]">
        {METRICS.map((m) => {
          const v = Number(latest?.[m.key] || 0);
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={cn("card px-3 py-2.5 text-left min-w-0 transition-colors", metric === m.key ? "border-[var(--brand-2)]" : "card-hover")}
            >
              <div className="text-[11px] text-muted truncate">{m.label}</div>
              <div className="text-[1.05rem] font-semibold num leading-tight mt-0.5">{m.fmt(v)}</div>
            </button>
          );
        })}
      </div>

      <div className="card p-[var(--s4)] min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="eyebrow">{active.label} · last {rows.length} days</div>
            <div className="text-[11px] text-muted mt-0.5">{active.hint}</div>
          </div>
          {trend !== 0 && (
            <div className={cn("text-xs font-semibold num", trend > 0 ? "text-success" : "text-warn")}>
              {trend > 0 ? "+" : ""}
              {trend}%
            </div>
          )}
        </div>

        <div className="mt-[var(--s3)] overflow-x-auto no-scrollbar">
          <div className="flex items-end gap-[3px] h-[120px] min-w-full">
            {rows.map((r, i) => {
              const v = values[i];
              const h = Math.max(2, Math.round((v / max) * 118));
              return (
                <div
                  key={r.day}
                  className="flex-1 min-w-[6px] rounded-t-[3px] bg-[var(--brand-2)] hover:opacity-80 transition-opacity"
                  style={{ height: h, opacity: v === 0 ? 0.25 : 1 }}
                  title={`${fmtDate(r.day)} · ${active.fmt(v)}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted mt-1.5">
            <span>{fmtDate(rows[0].day)}</span>
            <span>{fmtDate(rows[rows.length - 1].day)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
