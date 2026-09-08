"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Building2, HardDrive, Sparkles, Users } from "lucide-react";
import { Pill, Progress } from "@/components/ui";
import { cn, fmtDate } from "@/lib/utils";
import { fmtMb, setupScore, STATUS_LABEL, STATUS_TONE, type CompanyListItem } from "./lib";

/** One tenant, at a glance (§121). Everything here is administrative metadata — never company content. */
export function CompanyCard({ c }: { c: CompanyListItem }) {
  const score = setupScore(c.setup);
  const blockers = c.setup?.blockers?.length || 0;
  const tone = score.pct === 100 ? "var(--success)" : score.pct >= 60 ? "var(--brand-2)" : "var(--warn)";

  return (
    <Link href={`/platform/${c.org_id}`} className="card card-hover p-[var(--s3)] min-w-0 block">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="w-9 h-9 rounded-[9px] shrink-0 inline-flex items-center justify-center text-white text-xs font-bold overflow-hidden" style={{ background: "linear-gradient(135deg, var(--brand), #0f172a)" }}>
          {c.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.logo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            (c.name || "?").slice(0, 2).toUpperCase()
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold truncate">{c.name}</span>
            <Pill tone={STATUS_TONE[c.status] || "tone-neutral"}>{STATUS_LABEL[c.status] || c.status}</Pill>
          </div>
          <div className="text-[11px] text-muted truncate mt-0.5">
            {c.tenant_code || c.slug}
            {c.industry ? ` · ${c.industry}` : ""}
            {c.country ? ` · ${c.country}` : ""}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-[var(--s3)]">
        <Metric icon={<Users size={12} />} label="People" value={c.employees} />
        <Metric icon={<HardDrive size={12} />} label="Storage" value={fmtMb(c.storage_mb)} />
        <Metric icon={<Sparkles size={12} />} label="AI" value={c.ai ? "On" : "Off"} muted={!c.ai} />
      </div>

      <div className="mt-[var(--s3)]">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-muted">Setup</span>
          <span className={cn("num font-semibold", score.pct === 100 ? "text-success" : "text-2")}>
            {score.done}/{score.total}
          </span>
        </div>
        <Progress value={score.pct} tone={tone} height={5} />
      </div>

      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t text-[11px] text-muted min-w-0">
        <span className="truncate inline-flex items-center gap-1.5">
          <Building2 size={11} className="shrink-0" />
          {c.admin || <span className="text-warn">No administrator</span>}
        </span>
        {blockers > 0 ? (
          <span className="inline-flex items-center gap-1 text-warn shrink-0">
            <AlertTriangle size={11} /> {blockers}
          </span>
        ) : (
          <span className="shrink-0">{fmtDate(c.created_at)}</span>
        )}
      </div>
    </Link>
  );
}

function Metric({ icon, label, value, muted }: { icon: React.ReactNode; label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="rounded-[var(--radius-sm)] sunken px-2 py-1.5 min-w-0">
      <div className="text-[10px] text-muted inline-flex items-center gap-1 truncate">
        {icon}
        {label}
      </div>
      <div className={cn("text-[13px] font-semibold num truncate", muted && "text-muted")}>{value}</div>
    </div>
  );
}
