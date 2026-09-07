"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, AlertTriangle, CalendarRange, Coffee, BarChart3, Settings2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Tabs } from "@/components/ui";
import { Blink, useSeen } from "@/components/providers/ActivityProvider";
import type { BoardRow } from "@/components/attendance/attendanceUtils";
import { PRIVACY_PRINCIPLE, type AttendanceSettings, type BreakPolicy, type BreakType, type CoverageRequirement, type ShiftLite, type WorkforceLiveData } from "./lib";
import { LiveTab } from "./LiveTab";
import { ExceptionsTab } from "./ExceptionsTab";
import { CoverageTab } from "./CoverageTab";
import { BreaksTab } from "./BreaksTab";
import { SummaryTab } from "./SummaryTab";
import { SettingsTab } from "./SettingsTab";

export type WorkforceTab = "live" | "exceptions" | "coverage" | "breaks" | "summary" | "settings";

export type WorkforceData = {
  today: string;
  live: WorkforceLiveData | null;
  board: BoardRow[];
  breakTypes: BreakType[];
  breakPolicies: BreakPolicy[];
  requirements: CoverageRequirement[];
  shifts: ShiftLite[];
  settings: AttendanceSettings;
  /** attendance.manage / system.manage / admin role — unlocks Settings and editors. */
  canManage: boolean;
  canEditBreaks: boolean;
};

export function WorkforceLive({ data, initialTab }: { data: WorkforceData; initialTab: WorkforceTab }) {
  const router = useRouter();
  const sp = useSearchParams();
  useSeen(["nav:/workforce", "nav:/attendance"]);
  const [tab, setTab] = React.useState<WorkforceTab>(initialTab);

  // Adoption signal only (which modules people use) — once per visit.
  React.useEffect(() => {
    createClient().rpc("touch_module", { p_module: "workforce" }).then(() => {}, () => {});
  }, []);

  function go(t: WorkforceTab) {
    setTab(t);
    const q = new URLSearchParams(sp.toString());
    if (t === "live") q.delete("tab"); else q.set("tab", t);
    router.replace(`/workforce${q.size ? `?${q}` : ""}`, { scroll: false });
  }

  const tabs: { key: WorkforceTab; label: React.ReactNode; count?: number }[] = [
    { key: "live", label: <span className="inline-flex items-center gap-1.5"><Activity size={13} /> Live <Blink zone="nav:/attendance" /></span> },
    { key: "exceptions", label: <span className="inline-flex items-center gap-1.5"><AlertTriangle size={13} /> Exceptions</span>, count: data.live?.exceptions_today || undefined },
    { key: "coverage", label: <span className="inline-flex items-center gap-1.5"><CalendarRange size={13} /> Coverage</span>, count: data.live?.coverage_alerts.length || undefined },
    { key: "breaks", label: <span className="inline-flex items-center gap-1.5"><Coffee size={13} /> Breaks</span> },
    { key: "summary", label: <span className="inline-flex items-center gap-1.5"><BarChart3 size={13} /> Summary</span> },
    ...(data.canManage ? [{ key: "settings" as const, label: <span className="inline-flex items-center gap-1.5"><Settings2 size={13} /> Settings</span> }] : []),
  ];

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="Workforce"
        title="Workforce Live"
        subtitle={<span className="inline-flex items-start gap-1.5"><ShieldCheck size={14} className="shrink-0 mt-0.5 text-success" /> {PRIVACY_PRINCIPLE}</span>}
      />
      <Tabs tabs={tabs} value={tab} onChange={go} className="mb-[var(--s3)]" />
      <div key={tab} className="anim-fade-in">
        {tab === "live" && <LiveTab initial={data.live} board={data.board} today={data.today} />}
        {tab === "exceptions" && <ExceptionsTab today={data.today} canCorrect={data.canManage} />}
        {tab === "coverage" && <CoverageTab today={data.today} initialRequirements={data.requirements} canEdit={data.canManage} />}
        {tab === "breaks" && <BreaksTab initialTypes={data.breakTypes} initialPolicies={data.breakPolicies} shifts={data.shifts} canEdit={data.canEditBreaks} />}
        {tab === "summary" && <SummaryTab today={data.today} />}
        {tab === "settings" && data.canManage && <SettingsTab initial={data.settings} />}
      </div>
    </div>
  );
}
